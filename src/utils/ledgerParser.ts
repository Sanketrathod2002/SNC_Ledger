import * as XLSX from 'xlsx';
import type { CustomerRecord, LedgerDataset, VegDetailsStore, VegItem } from '../types/ledger';
import { codeOf, normalizeDateISO, round2 } from './ledgerMath';

export function normText(s: unknown): string {
  return String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
}

export function normKey(s: unknown): string {
  return normText(s).toLowerCase();
}

export function parseNum(v: unknown): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  if (v == null || v === '') return 0;
  const cleaned = String(v).replace(/[, ₹₹\s]/g, '');
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Parses Excel serial dates (1900 & 1904 systems), JS Date objects & strings,
 * ISO dates, DD-MM-YYYY / DD/MM/YYYY / DD.MM.YYYY, weekday texts, and Marathi digits.
 */
export function parseToISO(v: unknown, isDate1904 = false): string | null {
  return normalizeDateISO(v, isDate1904);
}

export interface ParsedWorkbookOutput {
  customers: CustomerRecord[] | null;
  details: VegDetailsStore | null;
  lastDate: string;
  sheetsSeen: string[];
  dateRows: number;
}

export function parseWorkbookBuffers(
  inputs: { name: string; buffer: ArrayBuffer | Uint8Array | string }[],
  onProgress?: (percent: number, message: string) => void,
): ParsedWorkbookOutput {
  const report = (p: number, msg: string) => onProgress?.(p, msg);
  let customers: CustomerRecord[] | null = null;
  let details: VegDetailsStore | null = null;
  const mobileByCustomer: Record<string, string> = {};
  let lastDate = '';
  const sheetsSeen: string[] = [];
  let dateRows = 0;

  for (let fi = 0; fi < inputs.length; fi++) {
    const input = inputs[fi];
    report(15 + Math.round((50 * fi) / Math.max(1, inputs.length)), `Reading ${input.name}…`);
    const isString = typeof input.buffer === 'string';
    const wb = XLSX.read(input.buffer, {
      type: isString ? 'string' : 'array',
      dense: true,
      cellFormula: false,
      cellHTML: false,
      cellText: false,
      cellStyles: false,
    });
    const isDate1904 = Boolean(wb.Workbook?.WBProps?.date1904);

    for (const sn of wb.SheetNames) {
      const sheet = wb.Sheets[sn];
      const rows = XLSX.utils.sheet_to_json(sheet, {
        header: 1,
        raw: true,
        defval: null,
        blankrows: true,
      }) as unknown[][];
      sheetsSeen.push(sn);

      // 1. Detect Sheet1 Ledger format ("CUSTOMER NAME" in col B, 3-col Cr./Dr./BAL. blocks)
      let headerIdx = -1;
      for (let r = 0; r < Math.min(rows.length, 15); r++) {
        const colB = String((rows[r] || [])[1] || '').toUpperCase();
        if (colB.includes('CUSTOMER NAME')) {
          headerIdx = r;
          break;
        }
      }

      if (headerIdx >= 0 && !customers) {
        report(68, `Parsing ledger sheet (${sn})…`);
        const headRow = rows[headerIdx] || [];
        let openIdx = -1;
        let mobileIdx = -1;
        for (let r = headerIdx + 1; r < Math.min(rows.length, headerIdx + 15); r++) {
          const k = normKey((rows[r] || [])[1]);
          if (k === 'old balance' || k === 'opening balance') openIdx = r;
          if (k.includes('mobile') || k.includes('phone') || k.includes('मोबाईल')) mobileIdx = r;
        }

        const tempList: {
          sn: number;
          name: string;
          key: string;
          code: string;
          mobile: string;
          col: number;
          opening: number;
          rows: [string, number, number][];
        }[] = [];

        for (let c = 2; c < headRow.length; c += 3) {
          const name = normText(headRow[c]);
          if (!name) continue;
          const mobileVal = mobileIdx >= 0 ? normText((rows[mobileIdx] || [])[c]) : '';
          tempList.push({
            sn: tempList.length + 1,
            name,
            key: normKey(name),
            code: codeOf(name),
            mobile: mobileVal,
            col: c,
            opening: openIdx >= 0 ? parseNum((rows[openIdx] || [])[c + 2]) : 0,
            rows: [],
          });
        }

        const startRow = openIdx >= 0 ? openIdx + 1 : headerIdx + 1;
        for (let r = startRow; r < rows.length; r++) {
          const row = rows[r];
          if (!row) continue;
          const d = parseToISO(row[1], isDate1904);
          if (!d) continue;
          dateRows += 1;
          for (const cu of tempList) {
            const cr = parseNum(row[cu.col]);
            const dr = parseNum(row[cu.col + 1]);
            if (cr || dr) {
              cu.rows.push([d, round2(cr), round2(dr)]);
              if (d > lastDate) lastDate = d;
            }
          }
        }

        customers = tempList.map((cu) => {
          cu.rows.sort((a, b) => a[0].localeCompare(b[0]));
          let totalCr = 0;
          let totalDr = 0;
          let bal = cu.opening;
          for (const [, cr, dr] of cu.rows) {
            totalCr += cr;
            totalDr += dr;
            bal += cr - dr;
          }
          return {
            sn: cu.sn,
            key: cu.key,
            name: cu.name,
            code: cu.code,
            mobile: cu.mobile,
            opening: round2(cu.opening),
            totalCr: round2(totalCr),
            totalDr: round2(totalDr),
            balance: round2(bal),
            lastTxDate: cu.rows.length ? cu.rows[cu.rows.length - 1][0] : '',
            rows: cu.rows,
          };
        });
        continue;
      }

      // 2. Detect Sheet2 Vegetable Detail format (scan first 10 rows for headers)
      if (!details) {
        let vegHeaderIdx = -1;
        let iD = -1;
        let iV = -1;
        let iN = -1;
        let iDag = -1;
        let iW = -1;
        let iR = -1;
        let iH = -1;
        let iT = -1;
        let iMob = -1;

        for (let r = 0; r < Math.min(rows.length, 10); r++) {
          const hRow = (rows[r] || []).map(normText);
          const find = (re: RegExp) => hRow.findIndex((x) => re.test(x));
          const dIdx = find(/^(?:bill\s*)?date$|तारीख/i);
          const vIdx = find(/भाजी|veg|item/i);
          const nIdx = find(/ग्राहक|नाव|customer|name/i);
          if (dIdx >= 0 && vIdx >= 0 && nIdx >= 0) {
            vegHeaderIdx = r;
            iD = dIdx;
            iV = vIdx;
            iN = nIdx;
            iDag = find(/डाग|dag|qty|bag/i);
            iW = find(/वजन|weight|wt/i);
            iR = find(/भाव|rate/i);
            iH = find(/हमाली|hamali/i);
            iT = find(/एकूण|total|amount|रक्कम/i);
            iMob = find(/मोबाईल|mobile|phone/i);
            break;
          }
        }

        if (vegHeaderIdx >= 0) {
          report(84, `Parsing vegetable details (${sn})…`);
          const map: Record<string, VegItem[]> = {};
          let count = 0;
          const getNum = (row: unknown[], idx: number) => (idx >= 0 ? round2(parseNum(row[idx])) : 0);

          for (let r = vegHeaderIdx + 1; r < rows.length; r++) {
            const row = rows[r];
            if (!row) continue;
            const d = parseToISO(row[iD], isDate1904);
            const nm = normKey(row[iN]);
            if (!d || !nm) continue;
            const dag = getNum(row, iDag);
            const wt = getNum(row, iW);
            const rate = getNum(row, iR);
            const hamali = getNum(row, iH);
            const rawTot = iT >= 0 ? row[iT] : null;
            const tot =
              rawTot == null || String(rawTot).trim() === ''
                ? round2(wt * rate + hamali)
                : round2(parseNum(rawTot));
            const item: VegItem = [d, normText(row[iV]), dag, wt, rate, hamali, tot];
            if (!map[nm]) map[nm] = [];
            map[nm].push(item);
            if (iMob >= 0) {
              const mob = normText(row[iMob]);
              if (mob && !mobileByCustomer[nm]) mobileByCustomer[nm] = mob;
            }
            if (d > lastDate) lastDate = d;
            count += 1;
          }

          details = { map, count };
        }
      }
    }
  }

  // Backfill any discovered mobiles regardless of sheet or file order
  if (customers) {
    customers.forEach((c) => {
      if (!c.mobile && mobileByCustomer[c.key]) {
        c.mobile = mobileByCustomer[c.key];
      }
    });
  }

  report(96, 'Finalizing dataset…');
  return { customers, details, lastDate, sheetsSeen, dateRows };
}

export async function parseUploadedFiles(
  files: File[],
  onProgress?: (percent: number, message: string) => void,
): Promise<LedgerDataset> {
  const inputs: { name: string; buffer: ArrayBuffer }[] = [];
  for (let i = 0; i < files.length; i++) {
    onProgress?.(Math.round(((i + 0.5) / files.length) * 15), `Loading ${files[i].name}…`);
    const buffer = await files[i].arrayBuffer();
    inputs.push({ name: files[i].name, buffer });
  }
  await new Promise((resolve) => setTimeout(resolve, 0));
  const parsed = parseWorkbookBuffers(inputs, onProgress);
  if (!parsed.customers || !parsed.customers.length) {
    throw new Error(
      `Ledger sheet not found. Sheet1 must contain "CUSTOMER NAME / ACCOUNT NO" in column B. Sheets found: ${parsed.sheetsSeen.join(', ') || 'none'}`,
    );
  }
  return {
    customers: parsed.customers,
    details: parsed.details,
    dateRows: parsed.dateRows,
    lastDate: parsed.lastDate || new Date().toISOString().slice(0, 10),
    loadedAt: new Date().toISOString(),
    uploadedBy: 'Local Upload',
    source: files.map((f) => f.name).join(' + '),
    files: files.map((f) => f.name),
    sheetsSeen: parsed.sheetsSeen,
  };
}
