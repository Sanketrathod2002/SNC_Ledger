/**
 * M/S Parag Sureshrao Chaware (HUF) — Cloud Ledger Backend (v3.0 Fast Sync)
 *
 * 1. Paste into Extensions -> Apps Script -> Code.gs and Save.
 * 2. Run setupLedger once and allow permissions.
 * 3. Project Settings -> Script properties -> add UPLOAD_PIN.
 * 4. Deploy -> New deployment -> Web app (Execute as: Me, Access: Anyone).
 */

const CFG = {
  customers: 'Customers',
  veg: 'VegDetails',
  meta: 'Meta',
  history: 'UploadHistory',
  chunkChars: 38000,
  batchRows: 3000,
  stagingTtlMs: 60 * 60 * 1000,
  backupFolderName: 'SNC_Ledger_Backups',
  maxSyncBytes: 240000,
};

const HEADERS = {
  meta: [
    'UpdatedAt', 'CustomerCount', 'Sheet1Rows', 'Sheet2Rows',
    'DataUpTo', 'UploadedBy', 'UploadId', 'DriveFolderUrl', 'DriveSnapshotId',
  ],
  customers: [
    'Key', 'Name', 'Code', 'Mobile', 'Opening', 'TotalDr', 'TotalCr', 'Balance', 'LedgerJSON',
  ],
  veg: ['Key', 'Part', 'VegJSON'],
  history: [
    'Timestamp', 'UploadId', 'UploadedBy', 'CustomerCount', 'VegRows', 'DataUpTo', 'BackupFileUrl',
  ],
};

function verifyReadPin_(providedPin) {
  const props = PropertiesService.getScriptProperties();
  const readPin = String(props.getProperty('READ_PIN') || '').trim();
  if (!readPin) return;
  const lockUntil = Number(props.getProperty('READ_LOCK_UNTIL') || 0);
  if (lockUntil && Date.now() < lockUntil) {
    throw new Error('Too many wrong Read PIN attempts. Wait 2 minutes.');
  }
  if (String(providedPin || '') !== readPin) {
    const fails = Number(props.getProperty('READ_FAILS') || 0) + 1;
    props.setProperty('READ_FAILS', String(fails));
    if (fails >= 5) {
      props.setProperty('READ_LOCK_UNTIL', String(Date.now() + 2 * 60 * 1000));
      props.setProperty('READ_FAILS', '0');
    }
    throw new Error('Read access PIN required');
  }
  if (props.getProperty('READ_FAILS') || props.getProperty('READ_LOCK_UNTIL')) {
    props.deleteProperty('READ_FAILS');
    props.deleteProperty('READ_LOCK_UNTIL');
  }
}

function doGet(e) {
  const p = (e && e.parameter) || {};
  let result;
  try {
    if (p.action !== 'health') {
      verifyReadPin_(p.readPin);
    }
    const db = db_();
    if (p.action === 'summary') result = summary_(db);
    else if (p.action === 'sync') result = sync_(db, p);
    else if (p.action === 'customer') result = customer_(db, String(p.key || ''));
    else if (p.action === 'uploadStatus') result = uploadStatus_(db, String(p.id || ''));
    else if (p.action === 'driveBackups') result = driveBackups_();
    else result = { ok: true, version: '3.0' };
  } catch (err) {
    result = { ok: false, error: String(err.message || err) };
  }
  const json = JSON.stringify(result);
  if (p.callback && /^[A-Za-z_$][A-Za-z0-9_$]{0,63}$/.test(p.callback)) {
    return ContentService.createTextOutput(p.callback + '(' + json.replace(/</g, '\\u003c') + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(25000);
    const body = JSON.parse((e.postData && e.postData.contents) || '{}');
    verifyUploadPin_(String(body.pin || ''));

    const db = db_();
    let out;
    if (body.action === 'fastUpload') out = fastUpload_(db, body);
    else if (body.action === 'begin') out = begin_(db, body);
    else if (body.action === 'chunk') out = chunk_(db, body);
    else if (body.action === 'commit') out = commit_(db, body);
    else if (body.action === 'clear') out = clearCloud_(db, body);
    else throw new Error('Unknown POST action');

    return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(
      JSON.stringify({ ok: false, error: String(err.message || err) })
    ).setMimeType(ContentService.MimeType.JSON);
  } finally {
    if (lock.hasLock()) lock.releaseLock();
  }
}

function setupLedger() {
  const db = ensureSpreadsheet_();
  ensure_(db, CFG.meta, HEADERS.meta);
  ensure_(db, CFG.customers, HEADERS.customers);
  ensure_(db, CFG.veg, HEADERS.veg);
  ensure_(db, CFG.history, HEADERS.history);
  const folder = ensureDriveFolder_();
  const props = PropertiesService.getScriptProperties();

  if (!props.getProperty('UPLOAD_PIN')) {
    props.setProperty('UPLOAD_PIN', '2002');
  }

  Logger.log('Setup complete');
  Logger.log('DB_ID: ' + db.getId());
  Logger.log('Sheet URL: ' + db.getUrl());
  Logger.log('Backup Folder: ' + folder.getUrl());
  Logger.log('UPLOAD_PIN ready (default: 2002)');
}

function verifyUploadPin_(providedPin) {
  const props = PropertiesService.getScriptProperties();
  const expectedPin = String(props.getProperty('UPLOAD_PIN') || '').trim();
  if (!expectedPin) {
    throw new Error('Set UPLOAD_PIN in Project Settings -> Script properties');
  }
  const failCount = Number(props.getProperty('PIN_FAILS') || 0);
  const lockUntil = Number(props.getProperty('PIN_LOCK_UNTIL') || 0);
  if (lockUntil && Date.now() < lockUntil) {
    throw new Error('Too many wrong PIN attempts. Wait 2 minutes.');
  }
  if (providedPin !== expectedPin) {
    const nextFails = failCount + 1;
    props.setProperty('PIN_FAILS', String(nextFails));
    if (nextFails >= 5) {
      props.setProperty('PIN_LOCK_UNTIL', String(Date.now() + 2 * 60 * 1000));
      props.setProperty('PIN_FAILS', '0');
    }
    throw new Error('Incorrect operator PIN');
  }
  if (failCount > 0 || lockUntil > 0) {
    props.deleteProperty('PIN_FAILS');
    props.deleteProperty('PIN_LOCK_UNTIL');
  }
}

function normalizeSheetId_(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  const match = s.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : s;
}

function ensureSpreadsheet_() {
  const props = PropertiesService.getScriptProperties();
  const savedId = normalizeSheetId_(props.getProperty('DB_ID'));
  if (savedId) {
    if (savedId !== props.getProperty('DB_ID')) props.setProperty('DB_ID', savedId);
    return SpreadsheetApp.openById(savedId);
  }
  try {
    const active = SpreadsheetApp.getActiveSpreadsheet();
    if (active) {
      props.setProperty('DB_ID', active.getId());
      return active;
    }
  } catch (e) {}
  const created = SpreadsheetApp.create('SNC_Ledger_DB');
  props.setProperty('DB_ID', created.getId());
  return created;
}

function db_() {
  const props = PropertiesService.getScriptProperties();
  const id = normalizeSheetId_(props.getProperty('DB_ID'));
  if (id) {
    if (id !== props.getProperty('DB_ID')) props.setProperty('DB_ID', id);
    return SpreadsheetApp.openById(id);
  }
  try {
    const active = SpreadsheetApp.getActiveSpreadsheet();
    if (active) {
      props.setProperty('DB_ID', active.getId());
      return active;
    }
  } catch (e) {}
  throw new Error('Run setupLedger once in Apps Script');
}

function ensureDriveFolder_() {
  const props = PropertiesService.getScriptProperties();
  const existingId = String(props.getProperty('DRIVE_FOLDER_ID') || '').trim();
  if (existingId) {
    try {
      return DriveApp.getFolderById(existingId);
    } catch (e) {}
  }
  const iter = DriveApp.getFoldersByName(CFG.backupFolderName);
  const folder = iter.hasNext() ? iter.next() : DriveApp.createFolder(CFG.backupFolderName);
  props.setProperty('DRIVE_FOLDER_ID', folder.getId());
  return folder;
}

function ensure_(db, name, headers) {
  let sh = db.getSheetByName(name);
  if (!sh) sh = db.insertSheet(name);
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
  }
  return sh;
}

function formatSheetDate_(val) {
  if (!val) return '';
  if (val instanceof Date && !isNaN(val.getTime())) {
    return Utilities.formatDate(val, 'Asia/Kolkata', 'yyyy-MM-dd');
  }
  return String(val || '').trim();
}

function readMeta_(db) {
  const sh = ensure_(db, CFG.meta, HEADERS.meta);
  const cols = Math.min(9, Math.max(7, sh.getLastColumn()));
  const r = sh.getLastRow() > 1 ? sh.getRange(2, 1, 1, cols).getValues()[0] : [];
  return {
    updatedAt: r[0] ? new Date(r[0]).toISOString() : '',
    customerCount: Number(r[1] || 0),
    sheet1Rows: Number(r[2] || 0),
    sheet2Rows: Number(r[3] || 0),
    dataUpTo: formatSheetDate_(r[4]),
    uploadedBy: String(r[5] || ''),
    uploadId: String(r[6] || ''),
    driveFolderUrl: String(r[7] || ''),
    driveSnapshotId: String(r[8] || ''),
  };
}

function summary_(db) {
  const meta = readMeta_(db);
  const sh = ensure_(db, CFG.customers, HEADERS.customers);
  const lastRow = sh.getLastRow();
  const vals = lastRow > 1 ? sh.getRange(2, 1, lastRow - 1, 8).getValues() : [];
  return {
    ok: true,
    meta: meta,
    customers: vals.map(function (r) {
      return {
        key: String(r[0]),
        name: String(r[1]),
        code: String(r[2] || ''),
        mobile: String(r[3] || ''),
        opening: Number(r[4] || 0),
        totalDr: Number(r[5] || 0),
        totalCr: Number(r[6] || 0),
        balance: Number(r[7] || 0),
      };
    }),
  };
}

function readVegForKeys_(db, wantedKeys) {
  const v = ensure_(db, CFG.veg, HEADERS.veg);
  const lastRow = v.getLastRow();
  if (lastRow <= 1) return {};
  const keyRows = v.getRange(2, 1, lastRow - 1, 1).getValues();
  const spans = {};
  for (let i = 0; i < keyRows.length; i++) {
    const k = String(keyRows[i][0]);
    if (wantedKeys.has(k)) {
      if (!spans[k]) spans[k] = [];
      spans[k].push(i + 2);
    }
  }
  const by = {};
  Object.keys(spans).forEach(function (k) {
    const idxs = spans[k];
    const first = idxs[0];
    const last = idxs[idxs.length - 1];
    const cells = v.getRange(first, 2, last - first + 1, 2).getValues();
    const parts = [];
    for (let j = 0; j < idxs.length; j++) {
      const cell = cells[idxs[j] - first];
      parts.push([Number(cell[0]), String(cell[1] || '[]')]);
    }
    parts.sort(function (a, b) { return a[0] - b[0]; });
    const merged = [];
    parts.forEach(function (part) {
      const parsed = JSON.parse(part[1]);
      for (let m = 0; m < parsed.length; m++) merged.push(parsed[m]);
    });
    by[k] = merged;
  });
  return by;
}

function sync_(db, p) {
  const start = Math.max(0, Number(p.offset) || 0);
  const limit = Math.min(100, Math.max(1, Number(p.limit) || 80));
  const c = ensure_(db, CFG.customers, HEADERS.customers);
  const total = Math.max(0, c.getLastRow() - 1);
  const count = start < total ? Math.min(limit, total - start) : 0;
  const rows = count > 0 ? c.getRange(start + 2, 1, count, 9).getValues() : [];

  // Trim batch dynamically so JSONP response stays fast & compact
  const picked = [];
  let approxBytes = 0;
  for (let i = 0; i < rows.length; i++) {
    const rowSize = String(rows[i][8] || '').length + 180;
    if (picked.length > 0 && approxBytes + rowSize > CFG.maxSyncBytes) break;
    picked.push(rows[i]);
    approxBytes += rowSize;
  }

  const wanted = new Set(picked.map(function (r) { return String(r[0]); }));
  const vegByKey = readVegForKeys_(db, wanted);

  return {
    ok: true,
    meta: readMeta_(db),
    offset: start,
    total: total,
    customers: picked.map(function (r, idx) {
      const k = String(r[0]);
      return {
        sn: start + idx + 1,
        key: k,
        name: String(r[1]),
        code: String(r[2] || ''),
        mobile: String(r[3] || ''),
        opening: Number(r[4] || 0),
        totalDr: Number(r[5] || 0),
        totalCr: Number(r[6] || 0),
        balance: Number(r[7] || 0),
        rows: JSON.parse(String(r[8] || '[]')),
        veg: vegByKey[k] || [],
      };
    }),
  };
}

function customer_(db, key) {
  const c = ensure_(db, CFG.customers, HEADERS.customers);
  const n = c.getLastRow() - 1;
  if (n < 1) return { ok: false, error: 'No accounts uploaded' };
  const keyCol = c.getRange(2, 1, n, 1).getValues();
  let rowIndex = -1;
  for (let i = 0; i < keyCol.length; i++) {
    if (String(keyCol[i][0]) === key) {
      rowIndex = i + 2;
      break;
    }
  }
  if (rowIndex < 0) return { ok: false, error: 'Account not found' };
  const found = c.getRange(rowIndex, 1, 1, 9).getValues()[0];
  const vegByKey = readVegForKeys_(db, new Set([key]));
  return {
    ok: true,
    customer: {
      sn: rowIndex - 1,
      key: key,
      name: String(found[1]),
      code: String(found[2] || ''),
      mobile: String(found[3] || ''),
      opening: Number(found[4] || 0),
      totalDr: Number(found[5] || 0),
      totalCr: Number(found[6] || 0),
      balance: Number(found[7] || 0),
      rows: JSON.parse(String(found[8] || '[]')),
      veg: vegByKey[key] || [],
    },
  };
}

function driveBackups_() {
  const folder = ensureDriveFolder_();
  const files = folder.getFiles();
  const backups = [];
  while (files.hasNext()) {
    const f = files.next();
    backups.push({
      id: f.getId(),
      name: f.getName(),
      createdAt: f.getDateCreated().toISOString(),
      sizeBytes: f.getSize(),
      url: f.getUrl(),
    });
  }
  backups.sort(function (a, b) { return b.createdAt.localeCompare(a.createdAt); });
  return { ok: true, folderUrl: folder.getUrl(), backups: backups.slice(0, 20) };
}

function cleanupStaleStaging_(db) {
  const props = PropertiesService.getScriptProperties();
  const all = props.getProperties();
  const now = Date.now();
  Object.keys(all).forEach(function (propKey) {
    if (propKey.indexOf('UPLOAD_') !== 0) return;
    try {
      const info = JSON.parse(all[propKey]);
      if (info.createdAt && now - info.createdAt > CFG.stagingTtlMs) {
        const cs = db.getSheetByName(info.cs);
        const vs = db.getSheetByName(info.vs);
        if (cs) db.deleteSheet(cs);
        if (vs) db.deleteSheet(vs);
        props.deleteProperty(propKey);
      }
    } catch (e) {
      props.deleteProperty(propKey);
    }
  });
}

// Single-request ultra-fast upload for payloads that fit in 1 batch
function fastUpload_(db, b) {
  cleanupStaleStaging_(db);
  const id = String(b.uploadId || '').replace(/[^a-zA-Z0-9_-]/g, '');
  if (!id) throw new Error('Missing upload id');

  const customers = b.customers || [];
  const veg = b.veg || [];
  const cs = db.insertSheet('StgC_' + id);
  const vs = db.insertSheet('StgV_' + id);

  writeTable_(cs, HEADERS.customers, customers);
  writeTable_(vs, HEADERS.veg, veg);

  const metaInfo = {
    customerCount: customers.length,
    vegRows: Number(b.vegRows || 0),
    sheet1Rows: Number(b.sheet1Rows || 0),
    lastDate: String(b.lastDate || ''),
    uploadedBy: String(b.uploadedBy || 'Operator'),
  };

  return finalizeCommit_(db, id, cs, vs, metaInfo, customers);
}

function begin_(db, b) {
  cleanupStaleStaging_(db);
  const id = String(b.uploadId || '').replace(/[^a-zA-Z0-9_-]/g, '');
  if (!id) throw new Error('Missing upload id');
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('UPLOAD_' + id)) throw new Error('Upload id already exists');

  const cs = 'StgC_' + id;
  const vs = 'StgV_' + id;
  const cSh = ensure_(db, cs, HEADERS.customers);
  const vSh = ensure_(db, vs, HEADERS.veg);

  const received = [];
  if (b.customers && b.customers.length) append_(cSh, b.customers);
  if (b.veg && b.veg.length) append_(vSh, b.veg);
  if (typeof b.chunkIndex === 'number') received.push(b.chunkIndex);

  props.setProperty('UPLOAD_' + id, JSON.stringify({
    cs: cs,
    vs: vs,
    createdAt: Date.now(),
    customerCount: Number(b.customerCount || 0),
    vegRows: Number(b.vegRows || 0),
    vegChunks: Number(b.vegChunks == null ? b.vegRows : b.vegChunks) || 0,
    sheet1Rows: Number(b.sheet1Rows || 0),
    lastDate: String(b.lastDate || ''),
    uploadedBy: String(b.uploadedBy || 'Operator'),
    receivedChunks: received,
  }));
  return { ok: true };
}

function chunk_(db, b) {
  const id = String(b.uploadId || '').replace(/[^a-zA-Z0-9_-]/g, '');
  const p = upload_(id);
  const hasIdx = typeof b.chunkIndex === 'number';
  if (hasIdx && p.receivedChunks.indexOf(b.chunkIndex) >= 0) {
    return { ok: true, duplicate: true, chunks: p.receivedChunks.length };
  }
  if (b.customers && b.customers.length) append_(db.getSheetByName(p.cs), b.customers);
  if (b.veg && b.veg.length) append_(db.getSheetByName(p.vs), b.veg);
  if (hasIdx) p.receivedChunks.push(b.chunkIndex);
  PropertiesService.getScriptProperties().setProperty('UPLOAD_' + id, JSON.stringify(p));
  return { ok: true, chunks: p.receivedChunks.length };
}

function upload_(id) {
  const s = PropertiesService.getScriptProperties().getProperty('UPLOAD_' + id);
  if (!s) throw new Error('Upload session expired or missing');
  return JSON.parse(s);
}

function uploadStatus_(db, id) {
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) return { ok: false, error: 'Invalid upload id' };
  const raw = PropertiesService.getScriptProperties().getProperty('UPLOAD_' + id);
  if (!raw) return { ok: true, exists: false };
  const p = JSON.parse(raw);
  const c = db.getSheetByName(p.cs);
  const v = db.getSheetByName(p.vs);
  return {
    ok: true,
    exists: true,
    customers: c ? Math.max(0, c.getLastRow() - 1) : 0,
    vegChunks: v ? Math.max(0, v.getLastRow() - 1) : 0,
    receivedChunks: p.receivedChunks || [],
  };
}

function writeTable_(sh, headers, rows) {
  const all = [headers];
  for (let i = 0; i < rows.length; i++) all.push(rows[i]);
  if (all.length > 0 && headers.length >= 4) {
    sh.getRange(1, 1, all.length, Math.min(4, headers.length)).setNumberFormat('@');
  }
  for (let i = 0; i < all.length; i += CFG.batchRows) {
    const part = all.slice(i, i + CFG.batchRows);
    sh.getRange(i + 1, 1, part.length, headers.length).setValues(part);
  }
}

function append_(sh, rows) {
  let nextRow = sh.getLastRow() + 1;
  for (let i = 0; i < rows.length; i += CFG.batchRows) {
    const part = rows.slice(i, i + CFG.batchRows);
    sh.getRange(nextRow, 1, part.length, part[0].length).setValues(part);
    nextRow += part.length;
  }
}

function commit_(db, b) {
  const id = String(b.uploadId || '').replace(/[^a-zA-Z0-9_-]/g, '');
  const p = upload_(id);
  const cs = db.getSheetByName(p.cs);
  const vs = db.getSheetByName(p.vs);
  const cn = Math.max(0, cs.getLastRow() - 1);
  const vn = Math.max(0, vs.getLastRow() - 1);
  if (cn !== p.customerCount || vn !== p.vegChunks) {
    throw new Error('Upload incomplete (' + cn + '/' + p.customerCount + ' accounts, ' + vn + '/' + p.vegChunks + ' items)');
  }

  const out = finalizeCommit_(db, id, cs, vs, p, null);
  PropertiesService.getScriptProperties().deleteProperty('UPLOAD_' + id);
  return out;
}

// Instant atomic sheet-swap commit (no cell-by-cell copy overhead)
function swapSheet_(db, liveName, stagingSheet) {
  const oldLive = db.getSheetByName(liveName);
  if (oldLive) db.deleteSheet(oldLive);
  stagingSheet.setName(liveName);
}

function cleanupLeftoverStagingSheets_(db) {
  const sheets = db.getSheets();
  for (let i = 0; i < sheets.length; i++) {
    const n = sheets[i].getName();
    if (n.indexOf('StgC_') === 0 || n.indexOf('StgV_') === 0) {
      try { db.deleteSheet(sheets[i]); } catch (e) {}
    }
  }
}

function finalizeCommit_(db, id, cs, vs, p, inlineCustomerRows) {
  // Ensure Meta & UploadHistory exist first so deleting old Customers/VegDetails never empties the workbook
  const m = ensure_(db, CFG.meta, HEADERS.meta);
  const hist = ensure_(db, CFG.history, HEADERS.history);

  // Replace previous active data cleanly with new upload
  swapSheet_(db, CFG.customers, cs);
  swapSheet_(db, CFG.veg, vs);
  cleanupLeftoverStagingSheets_(db);

  let folderUrl = '';
  let backupFileUrl = '';
  let snapshotId = '';
  try {
    const folder = ensureDriveFolder_();
    folderUrl = folder.getUrl();

    // Read full customer rows & veg details so ALL entries are preserved in backup
    const custSh = db.getSheetByName(CFG.customers);
    const custLast = custSh ? custSh.getLastRow() : 1;
    const custRows = inlineCustomerRows || (custLast > 1 ? custSh.getRange(2, 1, custLast - 1, 9).getValues() : []);
    const fullCustomers = custRows.map(function (r) {
      return {
        key: String(r[0]),
        name: String(r[1]),
        code: String(r[2] || ''),
        mobile: String(r[3] || ''),
        opening: Number(r[4] || 0),
        totalDr: Number(r[5] || 0),
        totalCr: Number(r[6] || 0),
        balance: Number(r[7] || 0),
        rows: typeof r[8] === 'string' ? JSON.parse(r[8] || '[]') : (r[8] || []),
      };
    });

    const vegSh = db.getSheetByName(CFG.veg);
    const vegLast = vegSh ? vegSh.getLastRow() : 1;
    const vegRaw = vegLast > 1 ? vegSh.getRange(2, 1, vegLast - 1, 3).getValues() : [];
    const vegChunks = vegRaw.map(function (r) {
      return [String(r[0]), Number(r[1] || 0), String(r[2] || '[]')];
    });

    const now = new Date();
    const istDate = Utilities.formatDate(now, 'Asia/Kolkata', 'yyyy-MM-dd');
    const istTime = Utilities.formatDate(now, 'Asia/Kolkata', 'HH-mm-ss');
    const entryPayload = {
      uploadedAt: now.toISOString(),
      istDate: istDate,
      uploadedBy: p.uploadedBy,
      uploadId: id,
      dataUpTo: p.lastDate,
      customerCount: p.customerCount,
      vegRows: p.vegRows,
      customers: fullCustomers,
      vegChunks: vegChunks,
    };

    // 1. Individual timestamped full backup (every upload in a day gets its own complete file)
    const stampName = 'Backup_' + istDate + '_' + istTime + '_' + id + '.json';
    const backupFile = folder.createFile(stampName, JSON.stringify(entryPayload), MimeType.PLAIN_TEXT);
    backupFileUrl = backupFile.getUrl();
    snapshotId = backupFile.getId();

    // 2. Consolidated single-day backup file aggregating all Excel uploads done today
    const dailyFileName = 'Daily_All_Uploads_' + istDate + '.json';
    const existingDaily = folder.getFilesByName(dailyFileName);
    if (existingDaily.hasNext()) {
      const df = existingDaily.next();
      try {
        if (df.getSize() < 15 * 1024 * 1024) {
          const parsed = JSON.parse(df.getBlob().getDataAsString() || '{"date":"","uploads":[]}');
          if (!Array.isArray(parsed.uploads)) parsed.uploads = [];
          parsed.uploads.push(entryPayload);
          parsed.uploadCount = parsed.uploads.length;
          parsed.updatedAt = now.toISOString();
          df.setContent(JSON.stringify(parsed));
        }
      } catch (dailyErr) {
        Logger.log('Daily append note: ' + dailyErr);
      }
    } else {
      folder.createFile(
        dailyFileName,
        JSON.stringify({ date: istDate, updatedAt: now.toISOString(), uploadCount: 1, uploads: [entryPayload] }),
        MimeType.PLAIN_TEXT
      );
    }
  } catch (driveErr) {
    Logger.log('Backup note: ' + driveErr);
  }

  m.getRange(2, 5).setNumberFormat('@');
  m.getRange(2, 1, 1, 9).setValues([[
    new Date(), p.customerCount, p.sheet1Rows, p.vegRows,
    String(p.lastDate || ''), p.uploadedBy, id, folderUrl, snapshotId,
  ]]);

  hist.appendRow([new Date(), id, p.uploadedBy, p.customerCount, p.vegRows, p.lastDate, backupFileUrl]);
  return { ok: true, uploadId: id, customerCount: p.customerCount, vegRows: p.vegRows, backupFileUrl: backupFileUrl };
}

function clearCloud_(db, b) {
  cleanupLeftoverStagingSheets_(db);
  const m = ensure_(db, CFG.meta, HEADERS.meta);
  const hist = ensure_(db, CFG.history, HEADERS.history);

  const blankC = db.insertSheet('StgC_Clr_' + Date.now());
  const blankV = db.insertSheet('StgV_Clr_' + Date.now());
  blankC.getRange(1, 1, 1, HEADERS.customers.length).setValues([HEADERS.customers]);
  blankV.getRange(1, 1, 1, HEADERS.veg.length).setValues([HEADERS.veg]);

  swapSheet_(db, CFG.customers, blankC);
  swapSheet_(db, CFG.veg, blankV);

  const clearId = 'cleared_' + Date.now();
  const folder = ensureDriveFolder_();
  const op = String(b.operatorName || 'Operator');
  m.getRange(2, 1, 1, 9).setValues([[
    new Date(), 0, 0, 0, '', op, clearId, folder.getUrl(), '',
  ]]);
  hist.appendRow([new Date(), clearId, op + ' (CLOUD_CLEARED)', 0, 0, '', '']);
  return { ok: true, cleared: true, uploadId: clearId };
}
