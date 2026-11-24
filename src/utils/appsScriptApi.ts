import type {
  CloudMeta,
  CustomerRecord,
  DirectoryEntry,
  DriveBackupEntry,
  LedgerDataset,
  VegItem,
} from '../types/ledger';
import {
  chunkVegMap,
  codeOf,
  normalizeDateISO,
  round2,
  sanitizeDatasetDates,
  serializeLedgerRowsSafe,
} from './ledgerMath';

export interface UploadBatch {
  chunkIndex: number;
  customers: unknown[][];
  veg: [string, number, string][];
  approxBytes: number;
}

const MAX_BATCH_BYTES = 900_000;
const MAX_CUSTOMERS_PER_BATCH = 500;
const MAX_VEG_PER_BATCH = 200;
const SINGLE_SHOT_MAX_BYTES = 1_100_000;

export function isValidAppsScriptUrl(url: string): boolean {
  try {
    const parsed = new URL(url.trim());
    return (
      parsed.protocol === 'https:' &&
      parsed.origin === 'https://script.google.com' &&
      /^\/macros\/s\/[A-Za-z0-9_-]+\/exec$/i.test(parsed.pathname) &&
      !parsed.search &&
      !parsed.hash
    );
  } catch {
    return false;
  }
}

/**
 * Dynamically packs customer rows and veg chunks into ~900 KB batches so a full
 * daily Sheet1 + Sheet2 workbook uploads in 1–2 requests instead of slow small batches.
 */
export function buildUploadBatches(
  customerRows: unknown[][],
  vegChunks: [string, number, string][],
  maxBytes = MAX_BATCH_BYTES,
): UploadBatch[] {
  const batches: UploadBatch[] = [];
  let current: UploadBatch = { chunkIndex: 0, customers: [], veg: [], approxBytes: 0 };

  const flush = () => {
    if (current.customers.length > 0 || current.veg.length > 0) {
      batches.push(current);
      current = { chunkIndex: batches.length, customers: [], veg: [], approxBytes: 0 };
    }
  };

  for (const row of customerRows) {
    const rowBytes = JSON.stringify(row).length + 4;
    if (
      (current.customers.length >= MAX_CUSTOMERS_PER_BATCH ||
        (current.approxBytes > 0 && current.approxBytes + rowBytes > maxBytes)) &&
      (current.customers.length > 0 || current.veg.length > 0)
    ) {
      flush();
    }
    current.customers.push(row);
    current.approxBytes += rowBytes;
  }

  for (const chunk of vegChunks) {
    const chunkBytes = chunk[2].length + chunk[0].length + 24;
    if (
      (current.veg.length >= MAX_VEG_PER_BATCH ||
        (current.approxBytes > 0 && current.approxBytes + chunkBytes > maxBytes)) &&
      (current.customers.length > 0 || current.veg.length > 0)
    ) {
      flush();
    }
    current.veg.push(chunk);
    current.approxBytes += chunkBytes;
  }

  flush();
  return batches;
}

export function jsonpRequest<T = Record<string, unknown>>(
  apiUrl: string,
  params: Record<string, string | number | undefined>,
  timeoutMs = 35000,
): Promise<T> {
  if (!isValidAppsScriptUrl(apiUrl)) {
    return Promise.reject(new Error('Invalid Web App URL. It must end with /exec.'));
  }
  return new Promise<T>((resolve, reject) => {
    const cb = `sncCb_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const script = document.createElement('script');
    const win = window as unknown as Record<string, unknown>;

    const cleanup = () => {
      clearTimeout(timer);
      delete win[cb];
      script.remove();
    };

    const timer = window.setTimeout(() => {
      cleanup();
      reject(new Error('Connection timed out. Check your internet and Web App URL.'));
    }, timeoutMs);

    win[cb] = (data: T) => {
      cleanup();
      resolve(data);
    };

    script.onerror = () => {
      cleanup();
      reject(new Error('Could not reach cloud endpoint. Verify the /exec URL and deployment access.'));
    };

    const search = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== '') search.set(k, String(v));
    });
    search.set('callback', cb);
    script.src = `${apiUrl.trim()}?${search.toString()}`;
    document.head.appendChild(script);
  });
}

async function postAppsScript(apiUrl: string, payload: Record<string, unknown>): Promise<void> {
  if (!isValidAppsScriptUrl(apiUrl)) {
    throw new Error('Invalid Web App URL. It must end with /exec.');
  }
  await fetch(apiUrl.trim(), {
    method: 'POST',
    mode: 'no-cors',
    headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
    body: JSON.stringify(payload),
  });
}

export interface SummaryResponse {
  ok: boolean;
  error?: string;
  meta: CloudMeta;
  customers: DirectoryEntry[];
}

export async function fetchCloudSummary(apiUrl: string, readPin?: string): Promise<SummaryResponse> {
  const res = await jsonpRequest<SummaryResponse>(apiUrl, {
    action: 'summary',
    readPin: readPin || undefined,
  });
  if (!res.ok) throw new Error(res.error || 'Could not load cloud summary');
  if (res.meta) {
    res.meta = {
      ...res.meta,
      dataUpTo: normalizeDateISO(res.meta.dataUpTo) || String(res.meta.dataUpTo || ''),
    };
  }
  return res;
}

export async function fetchSingleCustomer(
  apiUrl: string,
  customerKey: string,
  readPin?: string,
): Promise<{ customer: CustomerRecord; veg: VegItem[] }> {
  const res = await jsonpRequest<{
    ok: boolean;
    error?: string;
    customer?: {
      sn?: number;
      key: string;
      name: string;
      code?: string;
      mobile?: string;
      opening?: number;
      totalDr?: number;
      totalCr?: number;
      balance?: number;
      rows?: [string, number, number][];
      veg?: VegItem[];
    };
  }>(apiUrl, {
    action: 'customer',
    key: customerKey,
    readPin: readPin || undefined,
  });
  if (!res.ok || !res.customer) {
    throw new Error(res.error || 'Could not fetch account details');
  }
  const c = res.customer;
  const rows = (c.rows || [])
    .map(([d, cr, dr]) => [normalizeDateISO(d) || d, cr, dr] as [string, number, number])
    .filter(([d]) => Boolean(d))
    .sort((a, b) => a[0].localeCompare(b[0]));
  const veg: VegItem[] = (c.veg || []).map((v) => [
    normalizeDateISO(v[0]) || v[0],
    v[1],
    v[2],
    v[3],
    v[4],
    v[5],
    v[6],
  ]);
  return {
    customer: {
      sn: c.sn || 1,
      key: c.key,
      name: c.name,
      code: c.code || codeOf(c.name),
      mobile: c.mobile || '',
      opening: round2(Number(c.opening || 0)),
      totalCr: round2(Number(c.totalCr || 0)),
      totalDr: round2(Number(c.totalDr || 0)),
      balance: round2(Number(c.balance || 0)),
      lastTxDate: rows.length ? rows[rows.length - 1][0] : '',
      rows,
    },
    veg,
  };
}

export async function fetchDriveBackups(apiUrl: string, readPin?: string): Promise<{
  folderUrl: string;
  backups: DriveBackupEntry[];
}> {
  const res = await jsonpRequest<{
    ok: boolean;
    error?: string;
    folderUrl?: string;
    backups?: DriveBackupEntry[];
  }>(apiUrl, {
    action: 'driveBackups',
    readPin: readPin || undefined,
  });
  if (!res.ok) {
    throw new Error(res.error || 'Backups unavailable on current deployment');
  }
  return {
    folderUrl: res.folderUrl || '',
    backups: res.backups || [],
  };
}

export async function syncFullLedgerFromCloud(
  apiUrl: string,
  options: {
    readPin?: string;
    currentUploadId?: string;
    force?: boolean;
    onSummary?: (meta: CloudMeta, directory: DirectoryEntry[]) => void;
    onProgress?: (percent: number, label: string) => void;
  } = {},
): Promise<{ skipped: boolean; dataset?: LedgerDataset; meta: CloudMeta }> {
  options.onProgress?.(6, 'Checking cloud status…');
  const summary = await fetchCloudSummary(apiUrl, options.readPin);
  options.onSummary?.(summary.meta, summary.customers || []);

  if (!summary.meta.customerCount) {
    throw new Error('No ledger uploaded to cloud yet.');
  }

  if (
    !options.force &&
    options.currentUploadId &&
    summary.meta.uploadId &&
    options.currentUploadId === summary.meta.uploadId
  ) {
    options.onProgress?.(100, 'Up to date');
    return { skipped: true, meta: summary.meta };
  }

  const customers: CustomerRecord[] = [];
  const vegMap: Record<string, VegItem[]> = {};
  let offset = 0;
  const total = summary.meta.customerCount;
  const PAGE_SIZE = 80;

  while (offset < total) {
    const page = await jsonpRequest<{
      ok: boolean;
      error?: string;
      customers: Array<{
        key: string;
        name: string;
        code?: string;
        mobile?: string;
        opening?: number;
        totalDr?: number;
        totalCr?: number;
        balance?: number;
        rows?: [string, number, number][];
        veg?: VegItem[];
      }>;
    }>(apiUrl, {
      action: 'sync',
      offset,
      limit: PAGE_SIZE,
      readPin: options.readPin || undefined,
    });
    if (!page.ok) throw new Error(page.error || 'Cloud sync interrupted');
    const batch = page.customers || [];
    if (!batch.length) break;

    for (const raw of batch) {
      const rows = (raw.rows || [])
        .map(([d, cr, dr]) => [normalizeDateISO(d) || d, cr, dr] as [string, number, number])
        .filter(([d]) => Boolean(d))
        .sort((a, b) => a[0].localeCompare(b[0]));
      customers.push({
        sn: customers.length + 1,
        key: raw.key,
        name: raw.name,
        code: raw.code || codeOf(raw.name),
        mobile: raw.mobile || '',
        opening: round2(Number(raw.opening || 0)),
        totalCr: round2(Number(raw.totalCr || 0)),
        totalDr: round2(Number(raw.totalDr || 0)),
        balance: round2(Number(raw.balance || 0)),
        lastTxDate: rows.length ? rows[rows.length - 1][0] : '',
        rows,
      });
      if (raw.veg && raw.veg.length) {
        vegMap[raw.key] = raw.veg.map((v) => [
          normalizeDateISO(v[0]) || v[0],
          v[1],
          v[2],
          v[3],
          v[4],
          v[5],
          v[6],
        ]);
      }
    }

    offset += batch.length;
    const pct = Math.min(98, 10 + Math.round((offset / total) * 88));
    options.onProgress?.(pct, `Syncing ${Math.min(offset, total)}/${total} accounts…`);
  }

  if (customers.length !== total) {
    throw new Error(`Incomplete sync (${customers.length}/${total}). Please tap Sync again.`);
  }

  const dataset = sanitizeDatasetDates({
    customers,
    details: { map: vegMap, count: summary.meta.sheet2Rows || 0 },
    dateRows: summary.meta.sheet1Rows || 0,
    lastDate: normalizeDateISO(summary.meta.dataUpTo) || '',
    loadedAt: summary.meta.updatedAt || new Date().toISOString(),
    uploadedBy: summary.meta.uploadedBy || 'Operator',
    uploadId: summary.meta.uploadId || '',
    source: 'Cloud Sync',
  });

  options.onProgress?.(100, 'Synced');
  return { skipped: false, dataset, meta: summary.meta };
}

export async function uploadLedgerToCloud(
  apiUrl: string,
  dataset: LedgerDataset,
  pin: string,
  operatorName: string,
  onProgress?: (percent: number, label: string) => void,
): Promise<{ uploadId: string; meta?: CloudMeta }> {
  const startedAt = Date.now();
  const elapsed = () => `${((Date.now() - startedAt) / 1000).toFixed(1)}s`;
  const uploadId = `u${Date.now()}${Math.random().toString(36).slice(2, 7)}`;

  onProgress?.(8, 'Packing ledger data…');
  const vegChunks = chunkVegMap(dataset.details?.map || {}, 38000);
  const customerRows = dataset.customers.map((c) => [
    c.key,
    c.name,
    c.code || codeOf(c.name),
    c.mobile || '',
    c.opening || 0,
    c.totalDr || 0,
    c.totalCr || 0,
    c.balance || 0,
    serializeLedgerRowsSafe(c.rows || []),
  ]);

  const batches = buildUploadBatches(customerRows, vegChunks);
  const totalBytes = batches.reduce((sum, b) => sum + b.approxBytes, 0);
  const opName = operatorName.trim() || 'Operator';

  // Fast Path: Single-request upload when entire dataset fits under 1.1 MB
  if (batches.length === 1 && totalBytes <= SINGLE_SHOT_MAX_BYTES) {
    onProgress?.(45, 'Fast uploading to cloud…');
    await postAppsScript(apiUrl, {
      action: 'fastUpload',
      pin,
      uploadId,
      customerCount: customerRows.length,
      vegRows: dataset.details?.count || 0,
      vegChunks: vegChunks.length,
      sheet1Rows: dataset.dateRows || 0,
      lastDate: dataset.lastDate || '',
      uploadedBy: opName,
      customers: batches[0].customers,
      veg: batches[0].veg,
    });

    onProgress?.(85, `Confirming upload (${elapsed()})…`);
    for (let attempt = 0; attempt < 8; attempt++) {
      await new Promise((r) => setTimeout(r, attempt === 0 ? 450 : 650));
      const s = await fetchCloudSummary(apiUrl);
      if (s.meta.uploadId === uploadId) {
        onProgress?.(100, `Uploaded in ${elapsed()}`);
        return { uploadId, meta: s.meta };
      }
    }
    throw new Error('Upload sent. Verify your PIN or tap Sync to confirm.');
  }

  // Multi-Batch Fast Path: Begin includes batch 0, then remaining mega-batches, then atomic swap commit
  onProgress?.(15, `Uploading batch 1/${batches.length}…`);
  await postAppsScript(apiUrl, {
    action: 'begin',
    pin,
    uploadId,
    chunkIndex: batches[0]?.chunkIndex ?? 0,
    customerCount: customerRows.length,
    vegRows: dataset.details?.count || 0,
    vegChunks: vegChunks.length,
    sheet1Rows: dataset.dateRows || 0,
    lastDate: dataset.lastDate || '',
    uploadedBy: opName,
    customers: batches[0]?.customers || [],
    veg: batches[0]?.veg || [],
  });

  // Verify PIN & session accepted on first batch
  const initStatus = await jsonpRequest<{ ok: boolean; exists?: boolean; error?: string }>(apiUrl, {
    action: 'uploadStatus',
    id: uploadId,
  });
  if (!initStatus.ok || !initStatus.exists) {
    throw new Error(initStatus.error || 'Upload rejected. Check Operator PIN and Web App URL.');
  }

  for (let i = 1; i < batches.length; i++) {
    const unit = batches[i];
    const pct = 20 + Math.round((i / batches.length) * 65);
    onProgress?.(pct, `Uploading batch ${i + 1}/${batches.length} (${elapsed()})…`);
    await postAppsScript(apiUrl, {
      action: 'chunk',
      pin,
      uploadId,
      chunkIndex: unit.chunkIndex,
      customers: unit.customers,
      veg: unit.veg,
    });
  }

  // Fast commit (atomic sheet swap on server)
  onProgress?.(88, `Finalizing cloud ledger (${elapsed()})…`);
  await postAppsScript(apiUrl, { action: 'commit', pin, uploadId });

  for (let attempt = 0; attempt < 9; attempt++) {
    await new Promise((r) => setTimeout(r, attempt === 0 ? 450 : 700));
    const s = await fetchCloudSummary(apiUrl);
    if (s.meta.uploadId === uploadId) {
      onProgress?.(100, `Uploaded in ${elapsed()}`);
      return { uploadId, meta: s.meta };
    }
    // If commit didn't finish after 2nd check, verify whether any chunk dropped and retry it
    if (attempt === 2) {
      const st = await jsonpRequest<{
        ok: boolean;
        exists?: boolean;
        receivedChunks?: number[];
      }>(apiUrl, { action: 'uploadStatus', id: uploadId });
      if (st.exists && Array.isArray(st.receivedChunks)) {
        const seen = new Set(st.receivedChunks);
        const missing = batches.filter((u) => !seen.has(u.chunkIndex));
        if (missing.length > 0) {
          for (const m of missing) {
            onProgress?.(90, `Retrying batch ${m.chunkIndex + 1}…`);
            await postAppsScript(apiUrl, {
              action: 'chunk',
              pin,
              uploadId,
              chunkIndex: m.chunkIndex,
              customers: m.customers,
              veg: m.veg,
            });
          }
          await postAppsScript(apiUrl, { action: 'commit', pin, uploadId });
        }
      }
    }
  }

  throw new Error('Upload finalizing in background. Tap Sync in a moment to verify.');
}

export async function clearCloudLedger(
  apiUrl: string,
  pin: string,
  operatorName = 'Operator',
): Promise<void> {
  await postAppsScript(apiUrl, {
    action: 'clear',
    pin,
    operatorName: operatorName.trim() || 'Operator',
  });

  for (let attempt = 0; attempt < 6; attempt++) {
    await new Promise((r) => setTimeout(r, attempt === 0 ? 500 : 750));
    const s = await fetchCloudSummary(apiUrl);
    if (s.meta.customerCount === 0 || String(s.meta.uploadId || '').startsWith('cleared_')) {
      return;
    }
  }
  throw new Error('Could not verify cloud clear. Check your PIN or redeploy Code.gs.');
}
