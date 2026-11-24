import type {
  AuditMismatch,
  AuditReport,
  CustomerRecord,
  LedgerDataset,
  LedgerRow,
  PeriodPreset,
  StatementLine,
  StatementResult,
  VegItem,
} from '../types/ledger';
import { SHOP_INFO } from '../types/ledger';

const DEVANAGARI_DIGITS = '०१२३४५६७८९';

const MONTH_NAME_MAP: Record<string, string> = {
  jan: '01',
  january: '01',
  feb: '02',
  february: '02',
  mar: '03',
  march: '03',
  apr: '04',
  april: '04',
  may: '05',
  jun: '06',
  june: '06',
  jul: '07',
  july: '07',
  aug: '08',
  august: '08',
  sep: '09',
  sept: '09',
  september: '09',
  oct: '10',
  october: '10',
  nov: '11',
  november: '11',
  dec: '12',
  december: '12',
};

function toAsciiDigits(s: string): string {
  return s.replace(/[०-९]/g, (ch) => String(DEVANAGARI_DIGITS.indexOf(ch)));
}

function isValidYMD(yearStr: string, monthStr: string, dayStr: string): string | null {
  const y = Number(yearStr);
  const m = Number(monthStr);
  const d = Number(dayStr);
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return null;
  if (y < 1900 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (
    dt.getUTCFullYear() !== y ||
    dt.getUTCMonth() + 1 !== m ||
    dt.getUTCDate() !== d
  ) {
    return null;
  }
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function normalizeYear2or4(y: string): string {
  return y.length === 2 ? `20${y}` : y;
}

/**
 * Universal parser accepting Excel serial dates (1900/1904), JS Date objects,
 * JS Date strings ("Fri Nov 20 2026 00:00:00 GMT+0530..."), ISO timestamps,
 * DD-MM-YYYY, DD/MM/YYYY, DD.MM.YYYY, DD-Mon-YY/YYYY, Mon DD YYYY, MM/DD/YYYY (when day > 12),
 * weekday prefixes/suffixes, and Devanagari digits. Returns strict "YYYY-MM-DD" or null.
 */
export function normalizeDateISO(v: unknown, isDate1904 = false): string | null {
  if (v == null || v === '') return null;

  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    const isUtcMidnight =
      v.getUTCHours() === 0 &&
      v.getUTCMinutes() === 0 &&
      v.getUTCSeconds() === 0 &&
      v.getUTCMilliseconds() === 0;
    const y = isUtcMidnight ? v.getUTCFullYear() : v.getFullYear();
    const m = (isUtcMidnight ? v.getUTCMonth() : v.getMonth()) + 1;
    const d = isUtcMidnight ? v.getUTCDate() : v.getDate();
    return isValidYMD(String(y), String(m), String(d));
  }

  if (typeof v === 'number') {
    if (v > 20000 && v < 85000) {
      const offset = isDate1904 ? 24107 : 25569;
      const serialDay = Math.floor(v + 1e-6);
      return new Date((serialDay - offset) * 864e5).toISOString().slice(0, 10);
    }
    const intStr = String(Math.trunc(v));
    if (/^(19|20)\d{6}$/.test(intStr)) {
      return isValidYMD(intStr.slice(0, 4), intStr.slice(4, 6), intStr.slice(6, 8));
    }
    return null;
  }

  if (typeof v === 'string') {
    let raw = toAsciiDigits(v).replace(/["']/g, '').replace(/\s+/g, ' ').trim();
    if (!raw) return null;

    // Numeric serial inside string?
    if (/^\d{5}(\.\d+)?$/.test(raw)) {
      const num = Number(raw);
      if (num > 20000 && num < 85000) {
        const offset = isDate1904 ? 24107 : 25569;
        const serialDay = Math.floor(num + 1e-6);
        return new Date((serialDay - offset) * 864e5).toISOString().slice(0, 10);
      }
    }

    // 1. YYYY-MM-DD / YYYY/MM/DD / YYYY.MM.DD (with optional ISO time suffix)
    let m = raw.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T\s].*)?$/);
    if (m) {
      const iso = isValidYMD(m[1], m[2], m[3]);
      if (iso) return iso;
    }

    // 2. YYYYMMDD compact
    m = raw.match(/^((?:19|20)\d{2})(\d{2})(\d{2})$/);
    if (m) {
      const iso = isValidYMD(m[1], m[2], m[3]);
      if (iso) return iso;
    }

    // Strip leading weekday ("Mon, ", "Fri ", "Monday, ") and trailing time/timezone/weekday
    raw = raw
      .replace(/^(?:sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)(?:day|nesday|rsday|urday)?[,.\s-]*/i, '')
      .replace(/\s+\d{1,2}:\d{2}(?::\d{2})?(?:\.\d+)?(?:\s*(?:am|pm))?(?:\s*GMT[^\s]*.*)?$/i, '')
      .replace(/\s*\(?(?:sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)(?:day)?\)?$/i, '')
      .trim();

    // 3. Mon DD, YYYY or Month DD YYYY (handles JS Date string "Nov 20 2026")
    m = raw.match(/^([a-z]{3,9})[-/.,\s]+(\d{1,2})(?:st|nd|rd|th)?[-/.,\s]+(\d{2,4})$/i);
    if (m) {
      const mm = MONTH_NAME_MAP[m[1].toLowerCase()];
      if (mm) {
        const iso = isValidYMD(normalizeYear2or4(m[3]), mm, m[2]);
        if (iso) return iso;
      }
    }

    // 4. DD-Mon-YYYY or DD/Mon/YY or DD Mon YYYY (e.g. "23-Feb-2026", "18/Nov/26")
    m = raw.match(/^(\d{1,2})(?:st|nd|rd|th)?[-\/\s.,]+([a-z]{3,9})[-\/\s.,]+(\d{2,4})$/i);
    if (m) {
      const mm = MONTH_NAME_MAP[m[2].toLowerCase()];
      if (mm) {
        const iso = isValidYMD(normalizeYear2or4(m[3]), mm, m[1]);
        if (iso) return iso;
      }
    }

    // 5. Numeric DD-MM-YYYY, DD/MM/YYYY, DD.MM.YYYY, DD-MM-YY (and MM/DD/YYYY when second > 12)
    m = raw.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);
    if (m) {
      const year = normalizeYear2or4(m[3]);
      const a = Number(m[1]);
      const b = Number(m[2]);
      if (b > 12 && a <= 12) {
        const swapped = isValidYMD(year, String(a), String(b));
        if (swapped) return swapped;
      }
      const dmyIso = isValidYMD(year, m[2], m[1]);
      if (dmyIso) return dmyIso;
    }

    // 6. Native Date fallback only when a 4-digit year is explicitly present
    if (/\b(19|20)\d{2}\b/.test(raw)) {
      const parsed = new Date(raw);
      if (!Number.isNaN(parsed.getTime())) {
        return isValidYMD(
          String(parsed.getFullYear()),
          String(parsed.getMonth() + 1),
          String(parsed.getDate()),
        );
      }
    }
  }

  return null;
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function fmt(n: number, decimals = 2): string {
  const rounded = round2(Number.isFinite(n) ? n : 0);
  return rounded.toLocaleString('en-IN', {
    minimumFractionDigits: decimals === 0 ? 0 : rounded % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

export function fmtFixed(n: number): string {
  const rounded = round2(Number.isFinite(n) ? n : 0);
  return rounded.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function money(n: number, fixed = false): string {
  const val = Number.isFinite(n) ? n : 0;
  return (val < 0 ? '-₹' : '₹') + (fixed ? fmtFixed(Math.abs(val)) : fmt(Math.abs(val)));
}

/** Strict DD-MM-YYYY date display from any valid date input. Returns '' if invalid. */
export function dmy(raw: string): string {
  const iso = normalizeDateISO(raw);
  if (!iso) return '';
  return `${iso.slice(8, 10)}-${iso.slice(5, 7)}-${iso.slice(0, 4)}`;
}

/** Kept for compatibility — returns strict DD-MM-YYYY per app-wide standard. */
export function dmySlash(raw: string): string {
  return dmy(raw);
}

/** Kept for compatibility — returns strict DD-MM-YYYY per app-wide standard. */
export function formatReadableDate(raw: string): string {
  return dmy(raw);
}

/** Kept for compatibility — returns strict DD-MM-YYYY per app-wide standard. */
export function formatStatementDay(raw: string): string {
  return dmy(raw);
}

export function addDays(iso: string, days: number): string {
  const norm = normalizeDateISO(iso);
  if (!norm) return '';
  const dt = new Date(`${norm}T00:00:00Z`);
  if (Number.isNaN(dt.getTime())) return norm;
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

/** Formats ISO timestamp to accurate local "DD-MM-YYYY, hh:mm:ss AM/PM". */
export function formatStamp(iso: string): string {
  if (!iso) return '—';
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) {
    const onlyDate = dmy(iso);
    return onlyDate || '—';
  }
  const p = (v: number) => String(v).padStart(2, '0');
  const h24 = dt.getHours();
  const ampm = h24 >= 12 ? 'PM' : 'AM';
  const h12 = h24 % 12 || 12;
  return `${p(dt.getDate())}-${p(dt.getMonth() + 1)}-${dt.getFullYear()}, ${p(h12)}:${p(dt.getMinutes())}:${p(dt.getSeconds())} ${ampm}`;
}

/** Sanitizes all dates stored in an active or cached LedgerDataset to strict YYYY-MM-DD. */
export function sanitizeDatasetDates(dataset: LedgerDataset): LedgerDataset {
  let maxDate = normalizeDateISO(dataset.lastDate) || '';
  const customers = dataset.customers.map((c) => {
    const cleanRows = (c.rows || [])
      .map(([d, cr, dr]) => {
        const nd = normalizeDateISO(d) || '';
        return [nd, cr, dr] as LedgerRow;
      })
      .filter(([nd]) => Boolean(nd))
      .sort((a, b) => a[0].localeCompare(b[0]));

    const lastTx =
      (cleanRows.length ? cleanRows[cleanRows.length - 1][0] : '') ||
      normalizeDateISO(c.lastTxDate) ||
      '';
    if (lastTx && lastTx > maxDate) maxDate = lastTx;
    return {
      ...c,
      lastTxDate: lastTx,
      rows: cleanRows,
    };
  });

  let cleanDetails = dataset.details;
  if (dataset.details?.map) {
    const cleanMap: Record<string, VegItem[]> = {};
    let cleanCount = 0;
    for (const [k, items] of Object.entries(dataset.details.map)) {
      const list: VegItem[] = [];
      for (const item of items) {
        const nd = normalizeDateISO(item[0]);
        if (!nd) continue;
        if (nd > maxDate) maxDate = nd;
        list.push([nd, item[1], item[2], item[3], item[4], item[5], item[6]]);
        cleanCount += 1;
      }
      if (list.length > 0) cleanMap[k] = list;
    }
    cleanDetails = { map: cleanMap, count: cleanCount || dataset.details.count };
  }

  return {
    ...dataset,
    customers,
    details: cleanDetails,
    lastDate: maxDate || normalizeDateISO(dataset.loadedAt) || '',
  };
}

export function codeOf(name: string): string {
  const m = String(name || '').trim().match(/\s([a-z]{1,2}\d{1,4}|\d{2,4})$/i);
  return m ? m[1].toLowerCase() : '';
}

export function nameOnly(name: string): string {
  return String(name || '').trim().replace(/\s([a-z]{1,2}\d{1,4}|\d{2,4})$/i, '').trim();
}

export function particularsOf(cr: number, dr: number): string {
  if (cr > 0 && dr > 0) return 'Purchase (Cr.) & Deposited (Dr.)';
  if (cr > 0) return 'Purchase (Cr.)';
  if (dr > 0) return 'Deposited (Dr.)';
  return 'Vegetable Bill';
}

export interface TopVegetableSummary {
  name: string;
  dag: number;
  weight: number;
  total: number;
  entries: number;
}

export interface DashboardDailyStats {
  latestDate: string;
  totalOpening: number;
  totalReceivable: number;
  totalAdvance: number;
  totalCr: number;
  totalDr: number;
  pendingCount: number;
  advanceCount: number;
  settledCount: number;
  latestPurchaseCr: number;
  latestDepositedDr: number;
  latestBuyersCount: number;
  latestPayersCount: number;
  latestVegTotal: number;
  latestVegRows: number;
  latestByKey: Record<string, { cr: number; dr: number }>;
  topVegetables: TopVegetableSummary[];
  topVegScopeLabel: string;
}

export function computeDashboardDailyStats(dataset: LedgerDataset | null): DashboardDailyStats {
  const empty: DashboardDailyStats = {
    latestDate: '',
    totalOpening: 0,
    totalReceivable: 0,
    totalAdvance: 0,
    totalCr: 0,
    totalDr: 0,
    pendingCount: 0,
    advanceCount: 0,
    settledCount: 0,
    latestPurchaseCr: 0,
    latestDepositedDr: 0,
    latestBuyersCount: 0,
    latestPayersCount: 0,
    latestVegTotal: 0,
    latestVegRows: 0,
    latestByKey: {},
    topVegetables: [],
    topVegScopeLabel: '',
  };
  if (!dataset || !dataset.customers.length) return empty;

  const latestDate = dataset.lastDate || '';
  let totalOpening = 0;
  let totalReceivable = 0;
  let totalAdvance = 0;
  let totalCr = 0;
  let totalDr = 0;
  let pendingCount = 0;
  let advanceCount = 0;
  let settledCount = 0;
  let latestPurchaseCr = 0;
  let latestDepositedDr = 0;
  let latestBuyersCount = 0;
  let latestPayersCount = 0;
  const latestByKey: Record<string, { cr: number; dr: number }> = {};

  for (const c of dataset.customers) {
    totalOpening += c.opening || 0;
    totalCr += c.totalCr || 0;
    totalDr += c.totalDr || 0;
    if (c.balance > 0) {
      totalReceivable += c.balance;
      pendingCount += 1;
    } else if (c.balance < 0) {
      totalAdvance += Math.abs(c.balance);
      advanceCount += 1;
    } else {
      settledCount += 1;
    }

    if (latestDate && c.rows && c.rows.length) {
      let dayCr = 0;
      let dayDr = 0;
      for (const [d, cr, dr] of c.rows) {
        if (d === latestDate) {
          dayCr += cr;
          dayDr += dr;
        }
      }
      if (dayCr > 0 || dayDr > 0) {
        latestByKey[c.key] = { cr: round2(dayCr), dr: round2(dayDr) };
        latestPurchaseCr += dayCr;
        latestDepositedDr += dayDr;
        if (dayCr > 0) latestBuyersCount += 1;
        if (dayDr > 0) latestPayersCount += 1;
      }
    }
  }

  let latestVegTotal = 0;
  let latestVegRows = 0;
  const vegLatestMap = new Map<string, TopVegetableSummary>();
  const vegAllMap = new Map<string, TopVegetableSummary>();

  if (dataset.details?.map) {
    for (const items of Object.values(dataset.details.map)) {
      for (const item of items) {
        const [d, vegName, dag, wt, , , tot] = item;
        const label = vegName || 'Other';
        const allPrev = vegAllMap.get(label) || { name: label, dag: 0, weight: 0, total: 0, entries: 0 };
        allPrev.dag = round2(allPrev.dag + dag);
        allPrev.weight = round2(allPrev.weight + wt);
        allPrev.total = round2(allPrev.total + tot);
        allPrev.entries += 1;
        vegAllMap.set(label, allPrev);

        if (latestDate && d === latestDate) {
          latestVegTotal += tot;
          latestVegRows += 1;
          const dayPrev = vegLatestMap.get(label) || { name: label, dag: 0, weight: 0, total: 0, entries: 0 };
          dayPrev.dag = round2(dayPrev.dag + dag);
          dayPrev.weight = round2(dayPrev.weight + wt);
          dayPrev.total = round2(dayPrev.total + tot);
          dayPrev.entries += 1;
          vegLatestMap.set(label, dayPrev);
        }
      }
    }
  }

  const useLatestVeg = vegLatestMap.size > 0;
  const sourceVeg = useLatestVeg ? vegLatestMap : vegAllMap;
  const topVegetables = Array.from(sourceVeg.values())
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);

  return {
    latestDate,
    totalOpening: round2(totalOpening),
    totalReceivable: round2(totalReceivable),
    totalAdvance: round2(totalAdvance),
    totalCr: round2(totalCr),
    totalDr: round2(totalDr),
    pendingCount,
    advanceCount,
    settledCount,
    latestPurchaseCr: round2(latestPurchaseCr),
    latestDepositedDr: round2(latestDepositedDr),
    latestBuyersCount,
    latestPayersCount,
    latestVegTotal: round2(latestVegTotal),
    latestVegRows,
    latestByKey,
    topVegetables,
    topVegScopeLabel: useLatestVeg ? `On ${dmy(latestDate)}` : 'Overall',
  };
}

export interface DashboardRangeCustomerMetrics {
  opening: number;
  cr: number;
  dr: number;
  balance: number;
  activeInRange: boolean;
  lastDate: string;
}

export interface DashboardRangeResult {
  isFiltered: boolean;
  from: string;
  to: string;
  totalOpening: number;
  totalCr: number;
  totalDr: number;
  totalReceivable: number;
  totalAdvance: number;
  netClosing: number;
  pendingCount: number;
  activeCount: number;
  byKey: Record<string, DashboardRangeCustomerMetrics>;
  topVegetables: TopVegetableSummary[];
  topVegScopeLabel: string;
}

export function computeDashboardForRange(
  dataset: LedgerDataset | null,
  fromDate: string,
  toDate: string,
): DashboardRangeResult {
  const from = fromDate || '';
  const to = toDate || '';
  const isFiltered = Boolean(from || to);

  if (!dataset || !dataset.customers.length) {
    return {
      isFiltered,
      from,
      to,
      totalOpening: 0,
      totalCr: 0,
      totalDr: 0,
      totalReceivable: 0,
      totalAdvance: 0,
      netClosing: 0,
      pendingCount: 0,
      activeCount: 0,
      byKey: {},
      topVegetables: [],
      topVegScopeLabel: '',
    };
  }

  const lo = from || '0000-00-00';
  const hi = to || '9999-99-99';

  let totalOpening = 0;
  let totalCr = 0;
  let totalDr = 0;
  let totalReceivable = 0;
  let totalAdvance = 0;
  let pendingCount = 0;
  let activeCount = 0;
  const byKey: Record<string, DashboardRangeCustomerMetrics> = {};

  for (const c of dataset.customers) {
    let opening = c.opening || 0;
    let cr = 0;
    let dr = 0;
    let activeInRange = false;
    let rangeLastActive = '';
    let rangeLastAny = '';

    if (!isFiltered) {
      cr = c.totalCr || 0;
      dr = c.totalDr || 0;
      activeInRange = cr > 0 || dr > 0;
      rangeLastAny = c.lastTxDate || '';
    } else {
      for (const [d, rowCr, rowDr] of c.rows || []) {
        if (d < lo) {
          opening += rowCr - rowDr;
        } else if (d <= hi) {
          cr += rowCr;
          dr += rowDr;
          if (d > rangeLastAny) rangeLastAny = d;
          if (rowCr > 0 || rowDr > 0) {
            activeInRange = true;
            if (d > rangeLastActive) rangeLastActive = d;
          }
        }
      }
    }

    const closing = round2(opening + cr - dr);
    opening = round2(opening);
    cr = round2(cr);
    dr = round2(dr);

    byKey[c.key] = {
      opening,
      cr,
      dr,
      balance: closing,
      activeInRange,
      lastDate: rangeLastActive || rangeLastAny || c.lastTxDate || '',
    };
    totalOpening += opening;
    totalCr += cr;
    totalDr += dr;
    if (closing > 0) {
      totalReceivable += closing;
      pendingCount += 1;
    } else if (closing < 0) {
      totalAdvance += Math.abs(closing);
    }
    if (activeInRange) activeCount += 1;
  }

  const vegMap = new Map<string, TopVegetableSummary>();
  if (dataset.details?.map) {
    for (const items of Object.values(dataset.details.map)) {
      for (const item of items) {
        const [d, vegName, dag, wt, , , tot] = item;
        if (isFiltered && (d < lo || d > hi)) continue;
        const label = vegName || 'Other';
        const prev = vegMap.get(label) || { name: label, dag: 0, weight: 0, total: 0, entries: 0 };
        prev.dag = round2(prev.dag + dag);
        prev.weight = round2(prev.weight + wt);
        prev.total = round2(prev.total + tot);
        prev.entries += 1;
        vegMap.set(label, prev);
      }
    }
  }

  const topVegetables = Array.from(vegMap.values())
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);

  const scopeLabel = !isFiltered
    ? 'Overall'
    : from && to && from === to
      ? dmy(from)
      : `${from ? dmy(from) : 'Start'} → ${to ? dmy(to) : 'End'}`;

  return {
    isFiltered,
    from,
    to,
    totalOpening: round2(totalOpening),
    totalCr: round2(totalCr),
    totalDr: round2(totalDr),
    totalReceivable: round2(totalReceivable),
    totalAdvance: round2(totalAdvance),
    netClosing: round2(totalOpening + totalCr - totalDr),
    pendingCount,
    activeCount,
    byKey,
    topVegetables,
    topVegScopeLabel: scopeLabel,
  };
}

export function computeDateRange(preset: PeriodPreset, lastDate: string): { from: string; to: string } {
  const end = lastDate || new Date().toISOString().slice(0, 10);
  if (preset === '7') return { from: addDays(end, -6), to: end };
  if (preset === '30') return { from: addDays(end, -29), to: end };
  if (preset === 'month') return { from: `${end.slice(0, 8)}01`, to: end };
  if (preset === 'last') {
    const prevEnd = addDays(`${end.slice(0, 8)}01`, -1);
    return { from: `${prevEnd.slice(0, 8)}01`, to: prevEnd };
  }
  return { from: '', to: end };
}

export function buildStatement(
  customer: CustomerRecord,
  vegMap: Record<string, VegItem[]> | null | undefined,
  fromDate: string,
  toDate: string,
): StatementResult {
  const from = fromDate || '0000-00-00';
  const to = toDate || '9999-99-99';

  // Ensure chronological order so out-of-order Excel rows are never silently dropped
  const sortedRows = [...(customer.rows || [])].sort((a, b) => a[0].localeCompare(b[0]));

  let open = customer.opening || 0;
  const lineMap = new Map<string, { d: string; cr: number; dr: number }>();

  for (const [d, cr, dr] of sortedRows) {
    if (d < from) {
      open += cr - dr;
      continue;
    }
    if (d > to) continue;
    const prev = lineMap.get(d);
    if (prev) {
      prev.cr = round2(prev.cr + cr);
      prev.dr = round2(prev.dr + dr);
    } else {
      lineMap.set(d, { d, cr, dr });
    }
  }

  const items: Record<string, VegItem[]> = {};
  const det = vegMap ? vegMap[customer.key] : undefined;
  if (det) {
    for (const item of det) {
      if (item[0] >= from && item[0] <= to) {
        if (!items[item[0]]) items[item[0]] = [];
        items[item[0]].push(item);
        if (!lineMap.has(item[0])) {
          lineMap.set(item[0], { d: item[0], cr: 0, dr: 0 });
        }
      }
    }
  }

  const ordered = Array.from(lineMap.values()).sort((a, b) => a.d.localeCompare(b.d));
  let run = round2(open);
  const lines: StatementLine[] = ordered.map((l) => {
    run = round2(run + l.cr - l.dr);
    const dayVeg = items[l.d] || [];
    const vegTotal = round2(dayVeg.reduce((sum, x) => sum + x[6], 0));
    const hasMismatch = dayVeg.length > 0 && Math.abs(vegTotal - l.cr) > 1;
    return {
      d: l.d,
      cr: l.cr,
      dr: l.dr,
      bal: run,
      particulars: particularsOf(l.cr, l.dr),
      vegCount: dayVeg.length,
      vegTotal,
      hasMismatch,
    };
  });

  const tCr = round2(lines.reduce((acc, l) => acc + l.cr, 0));
  const tDr = round2(lines.reduce((acc, l) => acc + l.dr, 0));
  const close = round2(open + tCr - tDr);

  return {
    open: round2(open),
    lines,
    items,
    tCr,
    tDr,
    close,
    hasDet: Boolean(vegMap && Object.keys(vegMap).length > 0),
  };
}

export function computeAuditReport(dataset: LedgerDataset | null): AuditReport {
  if (!dataset || !dataset.details) {
    return { checkedDates: 0, matchedDates: 0, mismatches: [], netVariance: 0 };
  }
  const vegMap = dataset.details.map;
  const mismatches: AuditMismatch[] = [];
  let checkedDates = 0;
  let matchedDates = 0;
  let netVariance = 0;

  for (const c of dataset.customers) {
    const det = vegMap[c.key];
    if (!det || !det.length) continue;

    const crByDate = new Map<string, number>();
    for (const [d, cr] of c.rows) {
      crByDate.set(d, round2((crByDate.get(d) || 0) + cr));
    }

    const vegByDate = new Map<string, { total: number; count: number }>();
    for (const item of det) {
      const entry = vegByDate.get(item[0]) || { total: 0, count: 0 };
      entry.total = round2(entry.total + item[6]);
      entry.count += 1;
      vegByDate.set(item[0], entry);
    }

    for (const [date, info] of vegByDate.entries()) {
      checkedDates += 1;
      const sheet1Cr = crByDate.get(date) || 0;
      const diff = round2(info.total - sheet1Cr);
      if (Math.abs(diff) > 1) {
        mismatches.push({
          customerKey: c.key,
          customerName: c.name,
          customerCode: c.code || codeOf(c.name),
          date,
          sheet1Cr,
          sheet2Total: info.total,
          diff,
          itemCount: info.count,
        });
        netVariance = round2(netVariance + Math.abs(diff));
      } else {
        matchedDates += 1;
      }
    }
  }

  mismatches.sort((a, b) => b.date.localeCompare(a.date) || Math.abs(b.diff) - Math.abs(a.diff));
  return { checkedDates, matchedDates, mismatches, netVariance };
}

export function getCustomerVegDates(customerKey: string, vegMap: Record<string, VegItem[]> | null | undefined): string[] {
  if (!vegMap || !vegMap[customerKey]) return [];
  const dates = Array.from(new Set(vegMap[customerKey].map((item) => item[0])));
  return dates.sort((a, b) => b.localeCompare(a));
}

export function chunkVegMap(vegMap: Record<string, VegItem[]>, maxChars = 28000): [string, number, string][] {
  const chunks: [string, number, string][] = [];
  const keys = Object.keys(vegMap).sort((a, b) => a.localeCompare(b));
  for (const key of keys) {
    const list = vegMap[key] || [];
    let part: VegItem[] = [];
    let size = 2;
    let partNo = 0;
    for (const item of list) {
      const serialized = JSON.stringify(item);
      if (part.length && size + serialized.length + 1 > maxChars) {
        chunks.push([key, partNo++, JSON.stringify(part)]);
        part = [];
        size = 2;
      }
      part.push(item);
      size += serialized.length + 1;
    }
    if (part.length) {
      chunks.push([key, partNo, JSON.stringify(part)]);
    }
  }
  return chunks;
}

export function serializeLedgerRowsSafe(rows: LedgerRow[], maxChars = 42000): string {
  const full = JSON.stringify(rows);
  if (full.length <= maxChars) return full;
  // If a customer has multi-year history exceeding Google Sheets' 50k cell limit,
  // keep the most recent rows and roll older history into a single opening summary note on the sheet.
  const trimmed: LedgerRow[] = [];
  let len = 2;
  for (let i = rows.length - 1; i >= 0; i--) {
    const s = JSON.stringify(rows[i]);
    if (len + s.length + 1 > maxChars) break;
    trimmed.unshift(rows[i]);
    len += s.length + 1;
  }
  return JSON.stringify(trimmed);
}

export function buildWhatsAppText(
  customer: CustomerRecord,
  statement: StatementResult,
  fromDate: string,
  toDate: string,
  vegDate?: string,
  vegItems?: VegItem[],
): string {
  const header = `*${SHOP_INFO.firmName}*\n${SHOP_INFO.name}\n${SHOP_INFO.addr}\nMobile: ${SHOP_INFO.phoneDisplay}\n`;
  if (vegDate && vegItems && vegItems.length > 0) {
    const total = round2(vegItems.reduce((s, x) => s + x[6], 0));
    const lines = vegItems
      .map((x) => `• ${x[1]}: ${fmt(x[3])}kg (${fmt(x[2])} डाग) × ₹${fmt(x[4])} + हमाली ₹${fmt(x[5])} = *₹${fmt(x[6])}*`)
      .join('\n');
    return `${header}\n*भाजी बिल तपशील (Vegetable Bill)*\nग्राहक: *${customer.name}*\nतारीख: ${formatStatementDay(vegDate)}\n\n${lines}\n\n*एकूण बिल: ${money(total, true)}*\nएकूण बाकी: ${money(customer.balance, true)}`;
  }

  const period = `${fromDate ? dmy(fromDate) : 'सुरुवात'} ते ${dmy(toDate)}`;
  const recent = statement.lines.slice(-8).map((l) => {
    const parts: string[] = [dmy(l.d)];
    if (l.cr) parts.push(`माल ₹${fmt(l.cr)}`);
    if (l.dr) parts.push(`जमा ₹${fmt(l.dr)}`);
    parts.push(`बाकी ₹${fmt(l.bal)}`);
    return `• ${parts.join(' | ')}`;
  });
  return `${header}\n*ग्राहक खाते उतारा (Customer Ledger)*\nग्राहक: *${customer.name}*\nकालावधी: ${period}\n\nOld Balance (मागील बाकी): ${money(statement.open, true)}\nPurchase (Cr. खरेदी): ${money(statement.tCr, true)}\nDeposited (Dr. जमा): ${money(statement.tDr, true)}\n*Pending BAL. (शिल्लक बाकी): ${money(statement.close, true)}*${
    recent.length ? `\n\nअलीकडील नोंदी:\n${recent.join('\n')}` : ''
  }`;
}

export function formatWhatsAppUrl(mobile: string, text: string): string {
  const digits = String(mobile || '').replace(/\D/g, '');
  const phone = digits.length === 10 ? `91${digits}` : digits;
  const base = phone.length >= 10 ? `https://wa.me/${phone}` : 'https://wa.me/';
  return `${base}?text=${encodeURIComponent(text)}`;
}
