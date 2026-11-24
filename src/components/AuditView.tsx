import React, { useMemo, useState } from 'react';
import { AlertTriangle, ArrowRight, CheckCircle2, Printer, Search, X } from 'lucide-react';
import type { AuditPrintPayload, LanguageMode, LedgerDataset } from '../types/ledger';
import { computeAuditReport, dmy, fmtFixed, money, nameOnly, round2 } from '../utils/ledgerMath';
import { tr } from '../utils/i18n';

type DirectionFilter = 'all' | 'veg_higher' | 'ledger_higher' | 'no_sheet1_cr';

interface AuditViewProps {
  dataset: LedgerDataset | null;
  lang: LanguageMode;
  onInspectMismatch: (customerKey: string, date: string) => void;
  onPrintAudit: (payload: AuditPrintPayload) => void;
}

export const AuditView: React.FC<AuditViewProps> = ({
  dataset,
  lang,
  onInspectMismatch,
  onPrintAudit,
}) => {
  const report = useMemo(() => computeAuditReport(dataset), [dataset]);

  const [query, setQuery] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [direction, setDirection] = useState<DirectionFilter>('all');
  const [minVariance, setMinVariance] = useState<number>(1);

  const filteredMismatches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return report.mismatches.filter((m) => {
      if (fromDate && m.date < fromDate) return false;
      if (toDate && m.date > toDate) return false;
      if (Math.abs(m.diff) < minVariance) return false;

      if (direction === 'veg_higher' && m.diff <= 0) return false;
      if (direction === 'ledger_higher' && m.diff >= 0) return false;
      if (direction === 'no_sheet1_cr' && m.sheet1Cr !== 0) return false;

      if (!q) return true;
      return (
        m.customerName.toLowerCase().includes(q) ||
        m.customerKey.includes(q) ||
        (m.customerCode || '').toLowerCase().includes(q) ||
        dmy(m.date).includes(q)
      );
    });
  }, [report.mismatches, query, fromDate, toDate, direction, minVariance]);

  const filteredVariance = useMemo(
    () => round2(filteredMismatches.reduce((sum, m) => sum + Math.abs(m.diff), 0)),
    [filteredMismatches],
  );

  const hasActiveFilter =
    Boolean(query.trim()) || Boolean(fromDate) || Boolean(toDate) || direction !== 'all' || minVariance > 1;

  const resetFilters = () => {
    setQuery('');
    setFromDate('');
    setToDate('');
    setDirection('all');
    setMinVariance(1);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#0b2b17] dark:text-white">
            {tr('auditTitle', lang)}
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-slate-600 dark:text-emerald-100/70">
            {tr('auditSubtitle', lang)}
          </p>
        </div>

        <button
          type="button"
          disabled={!dataset || !dataset.details}
          onClick={() =>
            onPrintAudit({
              mismatches: filteredMismatches,
              fromDate,
              toDate,
              checkedDates: report.checkedDates,
              matchedDates: report.matchedDates,
              netVariance: filteredVariance,
            })
          }
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-amber-500 dark:bg-amber-400 px-4 py-2.5 text-xs sm:text-sm font-bold text-slate-950 hover:bg-amber-400 dark:hover:bg-amber-300 transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-45"
        >
          <Printer className="h-4 w-4" aria-hidden="true" />
          {tr('printAuditReport', lang)}
        </button>
      </div>

      {/* Summary Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 tabular-nums">
        <div className="rounded-xl border border-[#dce5df] dark:border-[#184028] bg-white dark:bg-[#0b2616] p-4">
          <div className="text-xs text-slate-600 dark:text-emerald-100/70">{tr('billsChecked', lang)}</div>
          <div className="mt-1.5 text-2xl font-extrabold text-[#0b2b17] dark:text-white">
            {report.checkedDates.toLocaleString('en-IN')}
          </div>
        </div>
        <div className="rounded-xl border border-[#dce5df] dark:border-[#184028] bg-white dark:bg-[#0b2616] p-4">
          <div className="text-xs text-slate-600 dark:text-emerald-100/70">{tr('exactMatches', lang)}</div>
          <div className="mt-1.5 text-2xl font-extrabold text-emerald-700 dark:text-emerald-400">
            {report.matchedDates.toLocaleString('en-IN')}
          </div>
        </div>
        <div className="rounded-xl border border-[#dce5df] dark:border-[#184028] bg-white dark:bg-[#0b2616] p-4">
          <div className="text-xs text-slate-600 dark:text-emerald-100/70">{tr('discrepancies', lang)}</div>
          <div
            className={`mt-1.5 text-2xl font-extrabold ${
              filteredMismatches.length > 0
                ? 'text-red-600 dark:text-red-400'
                : 'text-emerald-700 dark:text-emerald-400'
            }`}
          >
            {filteredMismatches.length}
            {hasActiveFilter && filteredMismatches.length !== report.mismatches.length && (
              <span className="ml-1.5 text-xs font-semibold text-slate-500 dark:text-emerald-100/60">
                / {report.mismatches.length}
              </span>
            )}
          </div>
        </div>
        <div className="rounded-xl border border-[#dce5df] dark:border-[#184028] bg-white dark:bg-[#0b2616] p-4">
          <div className="text-xs text-slate-600 dark:text-emerald-100/70">{tr('totalVariance', lang)}</div>
          <div className="mt-1.5 text-2xl font-extrabold text-amber-700 dark:text-amber-400">
            {money(filteredVariance, true)}
          </div>
        </div>
      </div>

      {/* Multi-Filter & Search Bar */}
      {dataset && dataset.details && report.mismatches.length > 0 && (
        <div className="rounded-xl border border-[#dce5df] dark:border-[#184028] bg-white dark:bg-[#0b2616] p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-2.5 items-end">
            <div className="relative lg:col-span-4">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-emerald-300/60"
                aria-hidden="true"
              />
              <input
                type="search"
                aria-label="Filter audit mismatches by customer or code"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={tr('searchCustomerPlaceholder', lang)}
                className="h-10 w-full rounded-lg border border-[#c9d7ce] dark:border-[#245a39] bg-[#f6f8f6] dark:bg-[#06180d] pl-9 pr-3 text-xs sm:text-sm text-[#0b2b17] dark:text-white placeholder:text-slate-400 dark:placeholder:text-emerald-200/50 focus:border-amber-500 focus:outline-none"
              />
            </div>

            <label className="lg:col-span-2 text-[11px] font-medium text-slate-600 dark:text-emerald-100/70">
              {tr('fromDate', lang)}
              <input
                type="date"
                aria-label="Audit from date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="mt-1 block h-10 w-full rounded-lg border border-[#c9d7ce] dark:border-[#245a39] bg-[#f6f8f6] dark:bg-[#06180d] px-2.5 text-xs text-[#0b2b17] dark:text-white dark:[color-scheme:dark] tabular-nums"
              />
            </label>

            <label className="lg:col-span-2 text-[11px] font-medium text-slate-600 dark:text-emerald-100/70">
              {tr('toDate', lang)}
              <input
                type="date"
                aria-label="Audit to date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="mt-1 block h-10 w-full rounded-lg border border-[#c9d7ce] dark:border-[#245a39] bg-[#f6f8f6] dark:bg-[#06180d] px-2.5 text-xs text-[#0b2b17] dark:text-white dark:[color-scheme:dark] tabular-nums"
              />
            </label>

            <label className="lg:col-span-2 text-[11px] font-medium text-slate-600 dark:text-emerald-100/70">
              {lang === 'mr' ? 'फरक प्रकार' : 'Variance Type'}
              <select
                aria-label="Filter by variance direction"
                value={direction}
                onChange={(e) => setDirection(e.target.value as DirectionFilter)}
                className="mt-1 block h-10 w-full rounded-lg border border-[#c9d7ce] dark:border-[#245a39] bg-[#f6f8f6] dark:bg-[#06180d] px-2.5 text-xs font-semibold text-[#0b2b17] dark:text-white dark:[color-scheme:dark] cursor-pointer"
              >
                <option value="all">{lang === 'mr' ? 'सर्व फरक' : 'All Variances'}</option>
                <option value="veg_higher">{lang === 'mr' ? 'भाजी बिल जास्त' : 'Veg Total > Cr.'}</option>
                <option value="ledger_higher">{lang === 'mr' ? 'खाते Cr. जास्त' : 'Sheet1 Cr. > Veg'}</option>
                <option value="no_sheet1_cr">{lang === 'mr' ? 'Sheet1 Cr. नाही' : 'Missing Sheet1 Cr.'}</option>
              </select>
            </label>

            <label className="lg:col-span-2 text-[11px] font-medium text-slate-600 dark:text-emerald-100/70">
              {lang === 'mr' ? 'किमान फरक' : 'Min Variance'}
              <select
                aria-label="Filter by minimum variance"
                value={minVariance}
                onChange={(e) => setMinVariance(Number(e.target.value))}
                className="mt-1 block h-10 w-full rounded-lg border border-[#c9d7ce] dark:border-[#245a39] bg-[#f6f8f6] dark:bg-[#06180d] px-2.5 text-xs font-semibold text-[#0b2b17] dark:text-white dark:[color-scheme:dark] cursor-pointer"
              >
                <option value={1}>≥ ₹1</option>
                <option value={100}>≥ ₹100</option>
                <option value={500}>≥ ₹500</option>
                <option value={1000}>≥ ₹1,000</option>
              </select>
            </label>
          </div>

          {hasActiveFilter && (
            <div className="flex items-center justify-between text-xs pt-1 border-t border-[#ebf1ed] dark:border-[#143521]">
              <span className="text-slate-600 dark:text-emerald-100/70">
                Showing {filteredMismatches.length} of {report.mismatches.length} discrepancies
              </span>
              <button
                type="button"
                onClick={resetFilters}
                className="inline-flex items-center gap-1 font-semibold text-amber-700 dark:text-amber-400 hover:underline cursor-pointer"
              >
                <X className="h-3.5 w-3.5" />
                {lang === 'mr' ? 'फिल्टर रद्द करा' : 'Reset Filters'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Mismatches List */}
      {!dataset || !dataset.details ? (
        <div className="rounded-xl border border-[#dce5df] dark:border-[#184028] bg-white dark:bg-[#0b2616] p-10 text-center text-sm text-slate-600 dark:text-emerald-100/70">
          {lang === 'mr'
            ? 'ऑडिट पाहण्यासाठी भाजी बिल तपशीलासह Excel / CSV अपलोड करा.'
            : 'Upload a ledger workbook with vegetable bill details to view reconciliation audit results.'}
        </div>
      ) : report.mismatches.length === 0 ? (
        <div className="rounded-xl border border-emerald-300/60 dark:border-emerald-700/50 bg-emerald-50/70 dark:bg-[#0b2e19] p-8 text-center">
          <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
          <h2 className="mt-3 text-base font-bold text-[#0b2b17] dark:text-white">
            All {report.checkedDates} Vegetable Bills Match Ledger Totals
          </h2>
          <p className="mt-1 text-xs text-slate-600 dark:text-emerald-100/70">
            Zero discrepancies found beyond ₹1 rounding tolerance.
          </p>
        </div>
      ) : filteredMismatches.length === 0 ? (
        <div className="rounded-xl border border-[#dce5df] dark:border-[#184028] bg-white dark:bg-[#0b2616] p-8 text-center text-sm text-slate-500 dark:text-emerald-100/65">
          No discrepancies match your active filters.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-[#dce5df] dark:border-[#184028] bg-white dark:bg-[#0b2616]">
          <div className="flex items-center justify-between gap-2 border-b border-[#dce5df] dark:border-[#184028] px-4 py-3 text-xs font-semibold text-amber-800 dark:text-amber-300 bg-amber-50/70 dark:bg-amber-950/30">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>
                {filteredMismatches.length} date{filteredMismatches.length === 1 ? '' : 's'} with Sheet1 Purchase Cr. vs Sheet2 एकूण पैसे variance.
              </span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left tabular-nums text-sm">
              <thead>
                <tr className="border-b border-[#dce5df] dark:border-[#184028] bg-[#f4f8f5] dark:bg-[#06180d] text-xs font-semibold text-slate-600 dark:text-emerald-100/70">
                  <th className="py-3 pl-4 pr-2">{lang === 'mr' ? 'ग्राहक' : 'Customer'}</th>
                  <th className="py-3 px-3">{lang === 'mr' ? 'तारीख' : 'Date'}</th>
                  <th className="py-3 px-3 text-right">Sheet1 Cr.</th>
                  <th className="py-3 px-3 text-right">Sheet2 एकूण पैसे</th>
                  <th className="py-3 px-3 text-right">{lang === 'mr' ? 'फरक' : 'Variance'}</th>
                  <th className="py-3 pl-2 pr-4 text-right">{lang === 'mr' ? 'पहा' : 'Action'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#ebf1ed] dark:divide-[#143521]">
                {filteredMismatches.map((m) => (
                  <tr
                    key={`${m.customerKey}-${m.date}`}
                    className="hover:bg-[#f4f8f5] dark:hover:bg-[#10331e] transition-colors"
                  >
                    <td className="py-3 pl-4 pr-2">
                      <div className="font-semibold text-[#0b2b17] dark:text-white">
                        {nameOnly(m.customerName)}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-emerald-100/65">
                        Account {m.customerCode || '—'} · {m.itemCount} item{m.itemCount === 1 ? '' : 's'}
                      </div>
                    </td>
                    <td className="py-3 px-3 text-xs sm:text-sm text-slate-700 dark:text-emerald-100/80 whitespace-nowrap">
                      {dmy(m.date)}
                    </td>
                    <td className="py-3 px-3 text-right font-medium text-slate-700 dark:text-emerald-50">
                      {fmtFixed(m.sheet1Cr)}
                    </td>
                    <td className="py-3 px-3 text-right font-medium text-amber-700 dark:text-amber-400">
                      {fmtFixed(m.sheet2Total)}
                    </td>
                    <td className="py-3 px-3 text-right font-bold text-red-600 dark:text-red-400">
                      {m.diff > 0 ? `+${fmtFixed(m.diff)}` : fmtFixed(m.diff)}
                    </td>
                    <td className="py-3 pl-2 pr-4 text-right">
                      <button
                        type="button"
                        onClick={() => onInspectMismatch(m.customerKey, m.date)}
                        className="inline-flex items-center gap-1 rounded-lg border border-[#c9d7ce] dark:border-[#245a39] px-3 py-1.5 text-xs font-semibold text-[#0b2b17] dark:text-emerald-50 hover:border-amber-500 transition-colors whitespace-nowrap cursor-pointer"
                      >
                        {lang === 'mr' ? 'बिल पहा' : 'Inspect Bill'}
                        <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
