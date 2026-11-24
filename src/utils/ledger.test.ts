import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import * as XLSX from 'xlsx';
import type { LedgerDataset } from '../types/ledger';
import {
  buildStatement,
  buildWhatsAppText,
  chunkVegMap,
  codeOf,
  computeAuditReport,
  computeDashboardDailyStats,
  computeDateRange,
  dmy,
  dmySlash,
  formatReadableDate,
  formatStamp,
  formatStatementDay,
  nameOnly,
  sanitizeDatasetDates,
} from './ledgerMath';
import { parseToISO, parseWorkbookBuffers } from './ledgerParser';
import { buildUploadBatches, isValidAppsScriptUrl } from './appsScriptApi';
import { DEFAULT_APPS_SCRIPT_URL } from './storage';

test('DEFAULT_APPS_SCRIPT_URL and isValidAppsScriptUrl enforce strict HTTPS Google Apps Script endpoints', () => {
  assert.equal(
    DEFAULT_APPS_SCRIPT_URL,
    'https://script.google.com/macros/s/AKfycbwZyXLij6ZenFcBbw_9tc208dRa7ZTzSPT9N-4Dv67dICf_RsI1AjV36CDcfkqJTGM/exec',
  );
  assert.equal(isValidAppsScriptUrl(DEFAULT_APPS_SCRIPT_URL), true);
  assert.equal(isValidAppsScriptUrl('http://script.google.com/macros/s/abc/exec'), false);
  assert.equal(isValidAppsScriptUrl('https://evil.example.com/macros/s/abc/exec'), false);
  assert.equal(isValidAppsScriptUrl(`${DEFAULT_APPS_SCRIPT_URL}?bad=1`), false);
});

test('parseToISO handles all real-world date formats (JS Date strings, 2-digit years, dots, weekday affixes, Devanagari)', () => {
  assert.equal(parseToISO('2026-11-18'), '2026-11-18');
  assert.equal(parseToISO('18-11-2026'), '2026-11-18');
  assert.equal(parseToISO('18/11/2026'), '2026-11-18');
  assert.equal(parseToISO('20.11.2026'), '2026-11-20');
  assert.equal(parseToISO('20-Nov-26'), '2026-11-20');
  assert.equal(parseToISO('Mon, 23-Feb-2026'), '2026-02-23');
  assert.equal(parseToISO('Wed, 18/Nov/2026'), '2026-11-18');
  assert.equal(parseToISO('Fri Nov 20 2026 00:00:00 GMT+0530 (India Standard Time)'), '2026-11-20');
  assert.equal(parseToISO('20-Nov-2026 Fri'), '2026-11-20');
  assert.equal(parseToISO('11/20/2026'), '2026-11-20');
  assert.equal(parseToISO('२०-११-२०२६'), '2026-11-20');
  assert.equal(parseToISO('20261120'), '2026-11-20');
  assert.equal(parseToISO(46076), '2026-02-23');
  assert.equal(parseToISO('not-a-date'), null);
});

test('all UI date formatters enforce strict DD-MM-YYYY and never emit corrupted strings like 20-ov-Fr', () => {
  assert.equal(dmy('2026-11-20'), '20-11-2026');
  assert.equal(dmy('Fri Nov 20 2026 00:00:00 GMT+0530 (India Standard Time)'), '20-11-2026');
  assert.equal(dmy('20-Nov-26'), '20-11-2026');
  assert.equal(dmy('20-ov-Fr'), '');
  assert.equal(dmySlash('2026-11-20'), '20-11-2026');
  assert.equal(formatReadableDate('2026-11-20'), '20-11-2026');
  assert.equal(formatStatementDay('2026-11-20'), '20-11-2026');

  const stamp = formatStamp('2026-11-24T09:05:07.000Z');
  assert.match(stamp, /^\d{2}-\d{2}-\d{4}, \d{2}:\d{2}:\d{2} (AM|PM)$/);

  const sanitized = sanitizeDatasetDates({
    customers: [
      {
        sn: 1,
        key: 'doma b93',
        name: 'Doma b93',
        code: 'b93',
        mobile: '',
        opening: 84232,
        totalCr: 0,
        totalDr: 0,
        balance: 84232,
        lastTxDate: '',
        rows: [],
      },
    ],
    details: null,
    dateRows: 0,
    lastDate: 'Fri Nov 20 2026 00:00:00 GMT+0530 (India Standard Time)',
    loadedAt: '2026-11-24T09:05:07.000Z',
    uploadedBy: 'Operator',
    source: 'Cloud Sync',
  });
  assert.equal(sanitized.lastDate, '2026-11-20');
  assert.equal(dmy(sanitized.lastDate), '20-11-2026');
});

test('codeOf and nameOnly extract mandi account codes accurately', () => {
  assert.equal(codeOf('Vishal Ballarshah b332'), 'b332');
  assert.equal(nameOnly('Vishal Ballarshah b332'), 'Vishal Ballarshah');
  assert.equal(codeOf('Aau c1'), 'c1');
  assert.equal(nameOnly('Aau c1'), 'Aau');
  assert.equal(codeOf('Nagdi 500'), '500');
});

test('buildStatement sorts out-of-order rows, computes opening & running balance, and flags mismatches', () => {
  const customer = {
    sn: 1,
    key: 'aau c1',
    name: 'Aau c1',
    code: 'c1',
    mobile: '9765120411',
    opening: 1000,
    totalCr: 1500,
    totalDr: 400,
    balance: 2100,
    lastTxDate: '2026-11-12',
    // Deliberately unsorted rows
    rows: [
      ['2026-11-12', 500, 0] as [string, number, number],
      ['2026-11-05', 1000, 400] as [string, number, number],
    ],
  };

  const vegMap = {
    'aau c1': [['2026-11-12', 'वांगे', 1, 22, 20, 10, 450] as [string, string, number, number, number, number, number]],
  };

  const st = buildStatement(customer, vegMap, '2026-11-10', '2026-11-15');
  assert.equal(st.open, 1600); // 1000 + 1000 - 400 before Nov 10
  assert.equal(st.lines.length, 1);
  assert.equal(st.lines[0].d, '2026-11-12');
  assert.equal(st.lines[0].bal, 2100);
  assert.equal(st.lines[0].hasMismatch, true); // 450 veg total != 500 Cr
  assert.equal(st.close, 2100);
});

test('computeAuditReport identifies Sheet1 vs Sheet2 mismatches accurately', () => {
  const fixture: LedgerDataset = {
    customers: [
      {
        sn: 1,
        key: 'vishal ballarshah b332',
        name: 'Vishal Ballarshah b332',
        code: 'b332',
        mobile: '',
        opening: 5000,
        totalCr: 2000,
        totalDr: 1000,
        balance: 6000,
        lastTxDate: '2026-11-18',
        rows: [
          ['2026-11-17', 1000, 500],
          ['2026-11-18', 1000, 500],
        ],
      },
    ],
    details: {
      count: 2,
      map: {
        'vishal ballarshah b332': [
          ['2026-11-17', 'गाजर', 1, 50, 20, 0, 1000],
          ['2026-11-18', 'टोमॅटो', 1, 50, 20, 30, 1030],
        ],
      },
    },
    dateRows: 2,
    lastDate: '2026-11-18',
    loadedAt: '2026-11-18T08:00:00Z',
    uploadedBy: 'Test',
    source: 'Unit Test',
  };

  const report = computeAuditReport(fixture);
  assert.equal(report.checkedDates, 2);
  assert.equal(report.matchedDates, 1);
  assert.equal(report.mismatches.length, 1);
  assert.equal(report.netVariance, 30);
});

test('computeDateRange returns accurate windows for presets', () => {
  assert.deepEqual(computeDateRange('7', '2026-11-22'), { from: '2026-11-16', to: '2026-11-22' });
  assert.deepEqual(computeDateRange('month', '2026-11-22'), { from: '2026-11-01', to: '2026-11-22' });
  assert.deepEqual(computeDateRange('last', '2026-11-22'), { from: '2026-10-01', to: '2026-10-31' });
  assert.deepEqual(computeDateRange('all', '2026-11-22'), { from: '', to: '2026-11-22' });
});

test('chunkVegMap splits large vegetable lists safely below Google Sheets cell limit', () => {
  const manyItems = Array.from({ length: 120 }, (_, i) => [
    '2026-11-18',
    `भाजी_${i}`,
    2,
    50,
    30,
    20,
    1520,
  ] as [string, string, number, number, number, number, number]);
  const chunks = chunkVegMap({ 'vishal ballarshah b332': manyItems }, 1000);
  assert.ok(chunks.length > 1);
  for (const [, , json] of chunks) {
    assert.ok(json.length <= 1050);
  }
});

test('buildWhatsAppText formats M/S Parag Sureshrao Chaware (HUF) Marathi bill and ledger statements cleanly', () => {
  const customer = {
    sn: 1,
    key: 'vishal ballarshah b332',
    name: 'Vishal Ballarshah b332',
    code: 'b332',
    mobile: '9822011223',
    opening: 10000,
    totalCr: 16050,
    totalDr: 5000,
    balance: 21050,
    lastTxDate: '2026-11-18',
    rows: [['2026-11-18', 16050, 5000] as [string, number, number]],
  };
  const vegItems: [string, string, number, number, number, number, number][] = [
    ['2026-11-18', 'गाजर', 4, 200, 80, 50, 16050],
  ];
  const st = buildStatement(customer, { [customer.key]: vegItems }, '2026-11-01', '2026-11-22');
  const ledgerMsg = buildWhatsAppText(customer, st, '2026-11-01', '2026-11-22');
  assert.ok(ledgerMsg.includes('M/S Parag Sureshrao Chaware (HUF)'));
  assert.ok(ledgerMsg.includes('+91 95522 33488 , +91 99756 49575'));
  assert.ok(ledgerMsg.includes('Vishal Ballarshah b332'));

  const vegMsg = buildWhatsAppText(customer, st, '2026-11-01', '2026-11-22', '2026-11-18', vegItems);
  assert.ok(vegMsg.includes('गाजर'));
  assert.ok(vegMsg.includes('16,050.00'));
});

test('parseWorkbookBuffers parses real attached Chandrapur APMC CSV ledger file accurately', () => {
  const csvPath = path.resolve(process.cwd(), 'public/assets/aistudio/17-11-2026___________1__31c0aaae.csv');
  if (!fs.existsSync(csvPath)) return;
  const csvContent = fs.readFileSync(csvPath, 'utf8');
  const parsed = parseWorkbookBuffers([{ name: '17-11-2026.csv', buffer: csvContent }]);
  assert.ok(parsed.customers && parsed.customers.length > 300, 'Should parse 300+ customers from real CSV');
  assert.ok(parsed.dateRows > 200, 'Should parse 200+ date rows including weekday-prefixed dates');
  const aau = parsed.customers.find((c) => c.key === 'aau c1');
  assert.ok(aau, 'Should find Aau c1');
  assert.equal(aau.opening, 807);
  assert.ok(aau.rows.length > 0, 'Aau c1 should have parsed transactions');

  const rows = parsed.customers.map((c) => [
    c.key,
    c.name,
    c.code,
    c.mobile,
    c.opening,
    c.totalDr,
    c.totalCr,
    c.balance,
    JSON.stringify(c.rows),
  ]);
  const batches = buildUploadBatches(rows, []);
  assert.ok(batches.length === 1, `Expected 1 single-shot batch for 391 real ledger accounts, got ${batches.length}`);
  const totalPacked = batches.reduce((sum, b) => sum + b.customers.length, 0);
  assert.equal(totalPacked, parsed.customers.length);
});

test('parseWorkbookBuffers parses exact two-sheet daily .xlsx format (Sheet1 + Sheet2 screenshots)', () => {
  // Exact Sheet1 structure from user screenshot
  const sheet1Rows = [
    [null, null, 1, 2, 3, 1, 2, 3, 1, 2, 3, 1, 2, 3],
    [null, null, 'Cr.', 'Dr.', 'BAL.', 'Cr.', 'Dr.', 'BAL.', 'Cr.', 'Dr.', 'BAL.', 'Cr.', 'Dr.', 'BAL.'],
    ['SN', 'CUSTOMER NAME / ACCOUNT NO', 'Aau c1', 'Aau c1', 'Aau c1', 'Akash Mandal c12', 'Akash Mandal c12', 'Akash Mandal c12', 'Balaji Rajura b41', 'Balaji Rajura b41', 'Balaji Rajura b41', 'Nagesh Nagdi d402', 'Nagesh Nagdi d402', 'Nagesh Nagdi d402'],
    [null, 'DATE', null, null, 10081, null, null, 469, null, null, 2297, null, null, 1966],
    [],
    [null, null, 'Cr.', 'Dr.', 'BAL.', 'Cr.', 'Dr.', 'BAL.', 'Cr.', 'Dr.', 'BAL.', 'Cr.', 'Dr.', 'BAL.'],
    [1, 'old balance', null, null, 807, null, null, 411, null, null, 0, null, null, 0],
    [2, 'Tue, 24-Feb-2026', 0, 0, 807, 0, 1100, -689, 0, 0, 0, 0, 0, 0],
    [3, 'Fri, 27-Feb-2026', 0, 0, 807, 690, 0, 1, 0, 0, 0, 0, 0, 0],
    [4, 'Sat, 28-Feb-2026', 552, 0, 1359, 0, 0, 1, 0, 0, 0, 0, 0, 0],
    [5, 46113, 0, 0, 1359, 0, 0, 1, 2297, 0, 2297, 1966, 0, 1966], // Excel serial 46113 = 2026-04-01
  ];

  // Exact Sheet2 structure from user screenshot
  const sheet2Rows = [
    ['Date', 'भाजी', 'ग्राहकाचे नाव', 'डाग', 'वजन', 'भाव', 'हमाली', 'एकूण पैसे'],
    ['01-04-2026', 'वांगे', 'Balaji Rajura b41', 10, 169, 13, 100, 2297],
    ['01-04-2026', 'वांगे', 'Nagesh Nagdi d402', 2, 36, 13, 20, 488],
    ['01-04-2026', 'वांगे', 'Nagesh Nagdi d402', 1, 18, 13, 10, 244],
    [46113, 'ब्रोकली', 'Nagesh Nagdi d402', 1, 16, 25, 10, 410],
    [46113, 'काकडी', 'Nagesh Nagdi d402', 8, 124, 6, 80, null], // test blank एकूण पैसे fallback = 124*6+80 = 824
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sheet1Rows), 'Sheet1');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sheet2Rows), 'Sheet2');
  const xlsxBuf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;

  const parsed = parseWorkbookBuffers([{ name: '20-11-2026 खाते बूक.xlsx', buffer: xlsxBuf }]);
  assert.equal(parsed.customers?.length, 4);
  assert.equal(parsed.details?.count, 5);
  assert.equal(parsed.lastDate, '2026-04-01');

  const akash = parsed.customers!.find((c) => c.key === 'akash mandal c12');
  assert.ok(akash);
  assert.equal(akash.opening, 411);
  // 411 - 1100 + 690 = 1
  assert.equal(akash.balance, 1);
  assert.equal(akash.rows[0][2], 1100); // Feb 24 Dr resulting in -689 running bal

  const balaji = parsed.customers!.find((c) => c.key === 'balaji rajura b41');
  assert.ok(balaji);
  assert.equal(balaji.balance, 2297);
  assert.equal(parsed.details!.map[balaji.key].length, 1);
  assert.equal(parsed.details!.map[balaji.key][0][1], 'वांगे');
  assert.equal(parsed.details!.map[balaji.key][0][6], 2297);

  const nagesh = parsed.customers!.find((c) => c.key === 'nagesh nagdi d402');
  assert.ok(nagesh);
  assert.equal(nagesh.balance, 1966);
  const nageshItems = parsed.details!.map[nagesh.key];
  assert.equal(nageshItems.length, 4);
  // Sum of 488 + 244 + 410 + 824 (fallback computed) === 1966 -> 0 mismatch!
  const dataset: LedgerDataset = {
    customers: parsed.customers!,
    details: parsed.details,
    dateRows: parsed.dateRows,
    lastDate: parsed.lastDate,
    loadedAt: new Date().toISOString(),
    uploadedBy: 'Test',
    source: 'XLSX Test',
  };
  const audit = computeAuditReport(dataset);
  assert.equal(audit.mismatches.length, 0);
  assert.equal(audit.matchedDates, 2);

  const stats = computeDashboardDailyStats(dataset);
  assert.equal(stats.latestDate, '2026-04-01');
  assert.equal(stats.totalOpening, 1218); // 807 + 411
  assert.equal(stats.latestPurchaseCr, 4263); // Balaji 2297 + Nagesh 1966
  assert.equal(stats.latestBuyersCount, 2);
  assert.equal(stats.topVegetables[0].name, 'वांगे');
  assert.equal(stats.topVegetables[0].total, 3029); // 2297 + 488 + 244
});

test('computeDashboardForRange recalculates Old Balance, Cr., Dr., Pending BAL., and Top Vegetables for date ranges', async () => {
  const { computeDashboardForRange } = await import('./ledgerMath');
  const dataset: LedgerDataset = {
    customers: [
      {
        sn: 1,
        key: 'aau c1',
        name: 'Aau c1',
        code: 'c1',
        mobile: '',
        opening: 800,
        totalCr: 1500,
        totalDr: 300,
        balance: 2000,
        lastTxDate: '2026-04-02',
        rows: [
          ['2026-04-01', 500, 100],
          ['2026-04-02', 1000, 200],
        ],
      },
    ],
    details: {
      count: 2,
      map: {
        'aau c1': [
          ['2026-04-01', 'वांगे', 2, 30, 16, 20, 500],
          ['2026-04-02', 'टोमॅटो', 4, 40, 24, 40, 1000],
        ],
      },
    },
    dateRows: 2,
    lastDate: '2026-04-02',
    loadedAt: '2026-04-02T10:00:00Z',
    uploadedBy: 'Test',
    source: 'Range Test',
  };

  const singleDay = computeDashboardForRange(dataset, '2026-04-02', '2026-04-02');
  assert.equal(singleDay.isFiltered, true);
  assert.equal(singleDay.totalOpening, 1200); // 800 + 500 - 100
  assert.equal(singleDay.totalCr, 1000);
  assert.equal(singleDay.totalDr, 200);
  assert.equal(singleDay.netClosing, 2000);
  assert.equal(singleDay.topVegetables.length, 1);
  assert.equal(singleDay.topVegetables[0].name, 'टोमॅटो');
  assert.equal(singleDay.topVegetables[0].total, 1000);
});


