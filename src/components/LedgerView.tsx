import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownUp,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  FileText,
  Leaf,
  Minus,
  Phone,
  Plus,
  Printer,
  RefreshCw,
  Search,
  Share2,
  Upload,
  X,
} from 'lucide-react';
import type {
  CustomerRecord,
  DirectoryEntry,
  LanguageMode,
  LedgerDataset,
  PeriodPreset,
  StatementResult,
} from '../types/ledger';
import {
  buildStatement,
  buildWhatsAppText,
  dmy,
  fmt,
  fmtFixed,
  formatWhatsAppUrl,
  getCustomerVegDates,
  money,
  nameOnly,
  round2,
} from '../utils/ledgerMath';
import { tr } from '../utils/i18n';

type PickerFilter = 'all' | 'pending' | 'with_mobile';
type TxTypeFilter = 'all' | 'purchase' | 'deposit' | 'veg' | 'mismatch';

interface LedgerViewProps {
  dataset: LedgerDataset | null;
  directory: DirectoryEntry[];
  lang: LanguageMode;
  selectedCustomer: CustomerRecord | null;
  loadingCustomer: boolean;
  onSelectCustomerKey: (key: string) => void;
  onClearCustomer: () => void;
  onOpenUpload: () => void;
  onSyncCloud: () => void;
  periodPreset: PeriodPreset;
  fromDate: string;
  toDate: string;
  onChangePreset: (preset: PeriodPreset) => void;
  onChangeRange: (from: string, to: string) => void;
  inlineVeg: boolean;
  onToggleInlineVeg: () => void;
  scale: number;
  onChangeScale: (next: number) => void;
  vegDetailDate: string | null;
  onOpenVegDetailDate: (date: string | null) => void;
  onOpenPrintPreview: (opts: {
    statement: StatementResult | null;
    vegDate?: string | null;
  }) => void;
}

export const LedgerView: React.FC<LedgerViewProps> = ({
  dataset,
  directory,
  lang,
  selectedCustomer,
  loadingCustomer,
  onSelectCustomerKey,
  onClearCustomer,
  onOpenUpload,
  onSyncCloud,
  periodPreset,
  fromDate,
  toDate,
  onChangePreset,
  onChangeRange,
  inlineVeg,
  onToggleInlineVeg,
  scale,
  onChangeScale,
  vegDetailDate,
  onOpenVegDetailDate,
  onOpenPrintPreview,
}) => {
  const [searchText, setSearchText] = useState(selectedCustomer?.name || '');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [pickerFilter, setPickerFilter] = useState<PickerFilter>('all');
  const [newestFirst, setNewestFirst] = useState(true);

  // Account statement & veg detail filters
  const [txQuery, setTxQuery] = useState('');
  const [txType, setTxType] = useState<TxTypeFilter>('all');
  const [vegQuery, setVegQuery] = useState('');

  const pickerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setSearchText(selectedCustomer?.name || '');
    setTxQuery('');
    setTxType('all');
    setVegQuery('');
  }, [selectedCustomer?.key, selectedCustomer?.name]);

  useEffect(() => {
    setVegQuery('');
  }, [vegDetailDate]);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, []);

  const pickerPool = useMemo(() => {
    return dataset ? dataset.customers : directory;
  }, [dataset, directory]);

  const pickerMatches = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    const effectiveQ = selectedCustomer && q === selectedCustomer.key ? '' : q;
    const filtered = pickerPool.filter((c) => {
      if (pickerFilter === 'pending' && c.balance <= 0) return false;
      if (pickerFilter === 'with_mobile' && !(c.mobile || '').trim()) return false;
      if (!effectiveQ) return true;
      return (
        c.key.includes(effectiveQ) ||
        (c.code || '').toLowerCase().includes(effectiveQ) ||
        (c.mobile || '').includes(effectiveQ)
      );
    });
    if (effectiveQ) {
      filtered.sort(
        (a, b) =>
          Number((b.code || '').toLowerCase() === effectiveQ) -
            Number((a.code || '').toLowerCase() === effectiveQ) ||
          Number(b.key.startsWith(effectiveQ)) - Number(a.key.startsWith(effectiveQ)),
      );
    }
    return filtered.slice(0, 120);
  }, [pickerPool, pickerFilter, searchText, selectedCustomer]);

  const statement = useMemo(() => {
    if (!selectedCustomer) return null;
    return buildStatement(selectedCustomer, dataset?.details?.map, fromDate, toDate);
  }, [selectedCustomer, dataset?.details?.map, fromDate, toDate]);

  const allCustomerVegDates = useMemo(() => {
    if (!selectedCustomer) return [];
    return getCustomerVegDates(selectedCustomer.key, dataset?.details?.map);
  }, [selectedCustomer, dataset?.details?.map]);

  const displayLines = useMemo(() => {
    if (!statement) return [];
    const q = txQuery.trim().toLowerCase();
    const filtered = statement.lines.filter((line) => {
      if (txType === 'purchase' && line.cr <= 0) return false;
      if (txType === 'deposit' && line.dr <= 0) return false;
      if (txType === 'veg' && line.vegCount <= 0) return false;
      if (txType === 'mismatch' && !line.hasMismatch) return false;
      if (!q) return true;
      const itemsOnDay = statement.items[line.d] || [];
      const matchesVeg = itemsOnDay.some((item) => item[1].toLowerCase().includes(q));
      return (
        dmy(line.d).toLowerCase().includes(q) ||
        line.particulars.toLowerCase().includes(q) ||
        matchesVeg
      );
    });
    return newestFirst ? [...filtered].reverse() : filtered;
  }, [statement, newestFirst, txQuery, txType]);

  // Vegetable-Wise Bill Detail computations
  const vegBillItems = useMemo(() => {
    if (!selectedCustomer || !vegDetailDate || !dataset?.details?.map) return [];
    const list = dataset.details.map[selectedCustomer.key] || [];
    return list.filter((item) => item[0] === vegDetailDate);
  }, [selectedCustomer, vegDetailDate, dataset?.details?.map]);

  const filteredVegBillItems = useMemo(() => {
    const q = vegQuery.trim().toLowerCase();
    if (!q) return vegBillItems;
    return vegBillItems.filter((item) => item[1].toLowerCase().includes(q));
  }, [vegBillItems, vegQuery]);

  const vegBillSummary = useMemo(() => {
    const sum = vegBillItems.reduce(
      (acc, x) => ({
        dag: round2(acc.dag + x[2]),
        weight: round2(acc.weight + x[3]),
        hamali: round2(acc.hamali + x[5]),
        total: round2(acc.total + x[6]),
      }),
      { dag: 0, weight: 0, hamali: 0, total: 0 },
    );
    const ledgerRowForDate = selectedCustomer?.rows.find((r) => r[0] === vegDetailDate);
    const sheet1Cr = ledgerRowForDate ? ledgerRowForDate[1] : 0;
    const diff = round2(sum.total - sheet1Cr);
    return { ...sum, sheet1Cr, diff, hasMismatch: vegBillItems.length > 0 && Math.abs(diff) > 1 };
  }, [vegBillItems, selectedCustomer, vegDetailDate]);

  const filteredVegTotal = useMemo(
    () => round2(filteredVegBillItems.reduce((s, x) => s + x[6], 0)),
    [filteredVegBillItems],
  );

  const currentVegDateIdx = vegDetailDate ? allCustomerVegDates.indexOf(vegDetailDate) : -1;
  const prevOlderDate =
    currentVegDateIdx >= 0 && currentVegDateIdx < allCustomerVegDates.length - 1
      ? allCustomerVegDates[currentVegDateIdx + 1]
      : null;
  const nextNewerDate = currentVegDateIdx > 0 ? allCustomerVegDates[currentVegDateIdx - 1] : null;

  const handleChooseFromPicker = (key: string) => {
    setDropdownOpen(false);
    onOpenVegDetailDate(null);
    onSelectCustomerKey(key);
  };

  const handleWhatsAppShare = () => {
    if (!selectedCustomer || !statement) return;
    const text = buildWhatsAppText(
      selectedCustomer,
      statement,
      fromDate,
      toDate,
      vegDetailDate || undefined,
      vegDetailDate ? vegBillItems : undefined,
    );
    const url = formatWhatsAppUrl(selectedCustomer.mobile, text);
    const link = document.createElement('a');
    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.click();
  };

  const handleQuickToggleVegScreen = () => {
    if (vegDetailDate) {
      onOpenVegDetailDate(null);
      return;
    }
    if (allCustomerVegDates.length > 0) {
      onOpenVegDetailDate(allCustomerVegDates[0]);
    } else {
      onToggleInlineVeg();
    }
  };

  if (pickerPool.length === 0 && !loadingCustomer && !selectedCustomer) {
    return (
      <div className="rounded-2xl border border-[#dce5df] dark:border-[#184028] bg-white dark:bg-[#0b2616] p-8 sm:p-12 text-center">
        <h1 className="text-xl font-extrabold text-[#0b2b17] dark:text-white">
          {lang === 'mr' ? 'अद्याप कोणताही डेटा अपलोड केलेला नाही' : 'No Ledger Loaded Yet'}
        </h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-emerald-100/70 max-w-md mx-auto">
          {lang === 'mr'
            ? 'खाते व भाजीपाला बिले पाहण्यासाठी Excel / CSV फाइल अपलोड करा किंवा क्लाउड सिंक करा.'
            : 'Upload an Excel / CSV ledger file or sync from cloud to view accounts and vegetable bills.'}
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={onOpenUpload}
            className="inline-flex items-center gap-2 rounded-lg bg-amber-500 dark:bg-amber-400 px-5 py-2.5 text-sm font-bold text-slate-950 hover:bg-amber-400 dark:hover:bg-amber-300 transition-colors cursor-pointer"
          >
            <Upload className="h-4 w-4" aria-hidden="true" />
            {tr('uploadFile', lang)}
          </button>
          <button
            type="button"
            onClick={onSyncCloud}
            className="inline-flex items-center gap-2 rounded-lg border border-[#c9d7ce] dark:border-[#245a39] bg-[#f6f8f6] dark:bg-[#06180d] px-5 py-2.5 text-sm font-semibold text-[#0b2b17] dark:text-emerald-50 hover:bg-[#edf3ee] dark:hover:bg-[#10331e] transition-colors cursor-pointer"
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            {tr('navCloud', lang)}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Customer Search Picker */}
      <div ref={pickerRef} className="relative">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-emerald-300/60"
            aria-hidden="true"
          />
          <input
            type="text"
            role="combobox"
            aria-expanded={dropdownOpen}
            aria-controls="customer-picker-listbox"
            aria-label="Select customer by name or account code"
            value={searchText}
            onFocus={(e) => {
              if (selectedCustomer) e.target.select();
              setDropdownOpen(true);
              setActiveIndex(0);
            }}
            onChange={(e) => {
              setSearchText(e.target.value);
              setDropdownOpen(true);
              setActiveIndex(0);
            }}
            onKeyDown={(e) => {
              if (!dropdownOpen) return;
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActiveIndex((i) => Math.min(pickerMatches.length - 1, i + 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActiveIndex((i) => Math.max(0, i - 1));
              } else if (e.key === 'Enter' && pickerMatches[activeIndex]) {
                e.preventDefault();
                handleChooseFromPicker(pickerMatches[activeIndex].key);
              } else if (e.key === 'Escape') {
                setDropdownOpen(false);
              }
            }}
            placeholder={tr('searchCustomerPlaceholder', lang)}
            className="h-12 w-full rounded-xl border border-[#c9d7ce] dark:border-[#245a39] bg-white dark:bg-[#0b2616] pl-11 pr-11 text-sm font-medium text-[#0b2b17] dark:text-white placeholder:text-slate-400 dark:placeholder:text-emerald-200/50 focus:border-amber-500 focus:outline-none"
          />
          {(searchText || selectedCustomer) && (
            <button
              type="button"
              aria-label="Clear selected customer"
              onClick={() => {
                setSearchText('');
                onClearCustomer();
                setDropdownOpen(true);
              }}
              className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 dark:text-emerald-200/60 hover:bg-[#edf3ee] dark:hover:bg-[#10331e] hover:text-[#0b2b17] dark:hover:text-white cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {dropdownOpen && (
          <div
            id="customer-picker-listbox"
            role="listbox"
            className="absolute left-0 right-0 top-14 z-30 max-h-80 overflow-y-auto rounded-xl border border-[#dce5df] dark:border-[#245a39] bg-white dark:bg-[#0b2616] shadow-2xl divide-y divide-[#ebf1ed] dark:divide-[#143521]"
          >
            {/* Quick Dropdown Filter Bar */}
            <div
              onMouseDown={(e) => e.preventDefault()}
              className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 bg-[#f4f8f5] dark:bg-[#06180d] px-3 py-2 text-xs"
            >
              <div className="flex items-center gap-1.5">
                {(
                  [
                    ['all', lang === 'mr' ? 'सर्व' : 'All'],
                    ['pending', lang === 'mr' ? 'येणे बाकी' : 'Pending BAL.'],
                    ['with_mobile', lang === 'mr' ? 'मोबाईल' : 'With Mobile'],
                  ] as [PickerFilter, string][]
                ).map(([pf, label]) => (
                  <button
                    key={pf}
                    type="button"
                    onClick={() => {
                      setPickerFilter(pf);
                      setActiveIndex(0);
                    }}
                    className={`rounded-md px-2.5 py-1 font-semibold cursor-pointer ${
                      pickerFilter === pf
                        ? 'bg-[#0b2b17] text-white dark:bg-amber-400 dark:text-slate-950'
                        : 'text-slate-600 dark:text-emerald-100/75 hover:bg-white dark:hover:bg-[#10331e]'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <span className="text-[11px] text-slate-500 dark:text-emerald-100/60 tabular-nums">
                {pickerMatches.length} matches
              </span>
            </div>

            {pickerMatches.length > 0 ? (
              pickerMatches.map((c, idx) => (
                <button
                  key={c.key}
                  type="button"
                  role="option"
                  aria-selected={idx === activeIndex}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => handleChooseFromPicker(c.key)}
                  className={`flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors cursor-pointer ${
                    idx === activeIndex
                      ? 'bg-amber-50 dark:bg-[#133b23]'
                      : 'hover:bg-[#f4f8f5] dark:hover:bg-[#10331e]'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-[#0b2b17] dark:text-white">
                      {nameOnly(c.name)}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-emerald-100/65">
                      {c.code ? `Account ${c.code}` : 'Ledger account'}
                      {c.mobile ? ` · ${c.mobile}` : ''}
                    </div>
                  </div>
                  <div
                    className={`shrink-0 text-sm font-bold tabular-nums ${
                      c.balance < 0
                        ? 'text-red-600 dark:text-red-400'
                        : 'text-amber-700 dark:text-amber-400'
                    }`}
                  >
                    {money(c.balance)}
                  </div>
                </button>
              ))
            ) : (
              <div className="px-4 py-6 text-center text-sm text-slate-500 dark:text-emerald-100/65">
                ग्राहक सापडला नाही (No matching customer)
              </div>
            )}
          </div>
        )}
      </div>

      {/* Loading Single Customer On-Demand */}
      {loadingCustomer && (
        <div className="rounded-xl border border-[#dce5df] dark:border-[#184028] bg-white dark:bg-[#0b2616] p-8 text-center">
          <div className="text-sm font-semibold text-[#0b2b17] dark:text-emerald-50">
            Loading account…
          </div>
        </div>
      )}

      {/* No Customer Selected State */}
      {!loadingCustomer && !selectedCustomer && (
        <div className="rounded-xl border border-[#dce5df] dark:border-[#184028] bg-white dark:bg-[#0b2616] p-8 sm:p-12 text-center">
          <h2 className="text-lg font-bold text-[#0b2b17] dark:text-white">
            {lang === 'mr' ? 'खाते पाहण्यासाठी वर ग्राहक निवडा' : 'Select a customer above to inspect their ledger'}
          </h2>
          <p className="mt-1.5 text-sm text-slate-600 dark:text-emerald-100/70 max-w-md mx-auto">
            Search by Marathi/English name or account code (e.g. b332, c1). Tap any billed date to inspect the vegetable-wise breakdown.
          </p>
          {pickerPool.length > 0 && (
            <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
              {pickerPool.slice(0, 5).map((c) => (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => handleChooseFromPicker(c.key)}
                  className="rounded-lg border border-[#c9d7ce] dark:border-[#245a39] bg-[#f6f8f6] dark:bg-[#06180d] px-3.5 py-2 text-xs font-semibold text-[#0b2b17] dark:text-emerald-50 hover:border-amber-500 dark:hover:border-amber-400 transition-colors cursor-pointer"
                >
                  {c.name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Selected Customer Content */}
      {!loadingCustomer && selectedCustomer && statement && (
        <div className="ledger-scaled space-y-4">
          {/* Action Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
              <button
                type="button"
                onClick={() =>
                  onOpenPrintPreview({
                    statement,
                    vegDate: vegDetailDate,
                  })
                }
                className="inline-flex h-9 sm:h-10 items-center gap-1.5 rounded-lg bg-amber-500 dark:bg-amber-400 px-3 sm:px-3.5 text-xs font-bold text-slate-950 hover:bg-amber-400 dark:hover:bg-amber-300 transition-colors whitespace-nowrap cursor-pointer"
              >
                <Printer className="h-3.5 w-3.5 sm:h-4 sm:w-4" aria-hidden="true" />
                {tr('printPdf', lang)}
              </button>

              <button
                type="button"
                onClick={handleQuickToggleVegScreen}
                className={`inline-flex h-9 sm:h-10 items-center gap-1.5 rounded-lg border px-3 sm:px-3.5 text-xs font-bold transition-colors whitespace-nowrap cursor-pointer ${
                  vegDetailDate
                    ? 'border-amber-500 bg-amber-500/15 text-amber-800 dark:text-amber-300'
                    : 'border-[#c9d7ce] dark:border-[#245a39] bg-white dark:bg-[#0b2616] text-[#0b2b17] dark:text-emerald-50 hover:border-amber-500'
                }`}
              >
                {vegDetailDate ? (
                  <>
                    <FileText className="h-3.5 w-3.5 sm:h-4 sm:w-4" aria-hidden="true" />
                    {tr('ledgerViewBtn', lang)}
                  </>
                ) : (
                  <>
                    <Leaf className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-emerald-700 dark:text-emerald-400" aria-hidden="true" />
                    {lang === 'mr' ? `भाजी बिले (${allCustomerVegDates.length})` : `Veg Bills (${allCustomerVegDates.length})`}
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleWhatsAppShare}
                className="inline-flex h-9 sm:h-10 items-center gap-1.5 rounded-lg border border-[#c9d7ce] dark:border-[#245a39] bg-white dark:bg-[#0b2616] px-3 text-xs font-semibold text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-[#10331e] transition-colors whitespace-nowrap cursor-pointer"
              >
                <Share2 className="h-3.5 w-3.5 sm:h-4 sm:w-4" aria-hidden="true" />
                WhatsApp
              </button>

              {(() => {
                const digits = String(selectedCustomer.mobile || '').replace(/\D/g, '');
                if (digits.length < 6) return null;
                const telHref = digits.length === 10 ? `tel:+91${digits}` : `tel:+${digits}`;
                return (
                  <a
                    href={telHref}
                    className="inline-flex h-9 sm:h-10 items-center gap-1.5 rounded-lg border border-[#c9d7ce] dark:border-[#245a39] bg-white dark:bg-[#0b2616] px-3 text-xs font-semibold text-[#0b2b17] dark:text-emerald-50 hover:bg-[#f2f7f3] dark:hover:bg-[#10331e] transition-colors whitespace-nowrap"
                  >
                    <Phone className="h-3.5 w-3.5 sm:h-4 sm:w-4" aria-hidden="true" />
                    Call
                  </a>
                );
              })()}
            </div>

            {/* Text Zoom Controls */}
            <div className="inline-flex items-center rounded-lg border border-[#c9d7ce] dark:border-[#245a39] bg-white dark:bg-[#0b2616] p-0.5">
              <button
                type="button"
                aria-label="Decrease ledger text size"
                onClick={() => onChangeScale(Math.max(0.85, round2(scale - 0.1)))}
                className="flex h-8 w-8 items-center justify-center rounded-md text-slate-600 dark:text-emerald-100/80 hover:bg-[#edf3ee] dark:hover:bg-[#10331e] cursor-pointer"
              >
                <Minus className="h-3.5 w-3.5" />
              </button>
              <span className="px-1.5 text-xs font-semibold tabular-nums text-slate-600 dark:text-emerald-100/75">
                {Math.round(scale * 100)}%
              </span>
              <button
                type="button"
                aria-label="Increase ledger text size"
                onClick={() => onChangeScale(Math.min(1.4, round2(scale + 0.1)))}
                className="flex h-8 w-8 items-center justify-center rounded-md text-slate-600 dark:text-emerald-100/80 hover:bg-[#edf3ee] dark:hover:bg-[#10331e] cursor-pointer"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* ================= MODE A: VEGETABLE-WISE BILL DETAIL ================= */}
          {vegDetailDate ? (
            <section
              aria-label="Vegetable-wise bill detail"
              className="rounded-xl border border-[#dce5df] dark:border-[#184028] bg-white dark:bg-[#0b2616] p-5 sm:p-6 space-y-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <button
                    type="button"
                    onClick={() => onOpenVegDetailDate(null)}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700 dark:text-amber-400 hover:underline cursor-pointer mb-2"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
                    {tr('backToLedger', lang)}
                  </button>
                  <h2 className="ledger-scaled-title font-extrabold tracking-tight text-[#0b2b17] dark:text-white">
                    {tr('vegBillTitle', lang)}
                  </h2>
                  <div className="mt-1.5 space-y-0.5 text-xs sm:text-sm text-slate-600 dark:text-emerald-100/80">
                    <div>
                      Customer Name: <strong className="text-[#0b2b17] dark:text-white">{nameOnly(selectedCustomer.name)}</strong>
                      <span aria-hidden="true"> · </span>
                      Account No.: <strong className="text-[#0b2b17] dark:text-white">{selectedCustomer.code || '—'}</strong>
                    </div>
                    <div>
                      Mobile: {selectedCustomer.mobile || 'Not recorded'}
                      <span aria-hidden="true"> · </span>
                      Statement Date: <strong className="text-[#0b2b17] dark:text-white">{dmy(vegDetailDate)}</strong>
                    </div>
                  </div>
                </div>
              </div>

              {/* Prev / Date Selector / Next + Vegetable Filter Bar */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-2.5">
                <div className="flex flex-wrap items-center gap-2.5">
                  <button
                    type="button"
                    disabled={!prevOlderDate}
                    onClick={() => prevOlderDate && onOpenVegDetailDate(prevOlderDate)}
                    className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-[#c9d7ce] dark:border-[#245a39] bg-[#f6f8f6] dark:bg-[#06180d] px-3.5 text-xs font-bold text-[#0b2b17] dark:text-emerald-50 hover:border-amber-500 disabled:opacity-40 cursor-pointer"
                  >
                    <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                    Prev Date
                  </button>

                  <select
                    aria-label="Select vegetable bill date"
                    value={vegDetailDate}
                    onChange={(e) => onOpenVegDetailDate(e.target.value)}
                    className="h-10 min-w-[165px] rounded-lg border border-amber-500/70 bg-white dark:bg-[#06180d] pl-3.5 pr-8 text-sm font-bold tabular-nums text-[#0b2b17] dark:text-white dark:[color-scheme:dark] focus:outline-none cursor-pointer"
                  >
                    {allCustomerVegDates.map((d) => (
                      <option key={d} value={d}>
                        {dmy(d)}
                      </option>
                    ))}
                    {!allCustomerVegDates.includes(vegDetailDate) && (
                      <option value={vegDetailDate}>{dmy(vegDetailDate)}</option>
                    )}
                  </select>

                  <button
                    type="button"
                    disabled={!nextNewerDate}
                    onClick={() => nextNewerDate && onOpenVegDetailDate(nextNewerDate)}
                    className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-[#c9d7ce] dark:border-[#245a39] bg-[#f6f8f6] dark:bg-[#06180d] px-3.5 text-xs font-bold text-[#0b2b17] dark:text-emerald-50 hover:border-amber-500 disabled:opacity-40 cursor-pointer"
                  >
                    Next Date
                    <ChevronRight className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>

                {vegBillItems.length > 0 && (
                  <div className="relative w-full md:w-64">
                    <Search
                      className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400 dark:text-emerald-300/60"
                      aria-hidden="true"
                    />
                    <input
                      type="search"
                      aria-label="Filter vegetable items"
                      value={vegQuery}
                      onChange={(e) => setVegQuery(e.target.value)}
                      placeholder={lang === 'mr' ? 'भाजी शोधा…' : 'Search vegetable (भाजी)…'}
                      className="h-10 w-full rounded-lg border border-[#c9d7ce] dark:border-[#245a39] bg-[#f6f8f6] dark:bg-[#06180d] pl-8 pr-3 text-xs text-[#0b2b17] dark:text-white focus:border-amber-500 focus:outline-none"
                    />
                  </div>
                )}
              </div>

              {/* Vegetable Breakdown Table */}
              {filteredVegBillItems.length > 0 ? (
                <div className="overflow-x-auto rounded-xl border border-[#dce5df] dark:border-[#184028]">
                  <table className="w-full border-collapse text-right tabular-nums">
                    <thead>
                      <tr className="border-b border-[#dce5df] dark:border-[#184028] bg-[#f4f8f5] dark:bg-[#06180d] text-xs font-semibold text-slate-600 dark:text-emerald-100/70">
                        <th className="py-3 pl-4 pr-2 text-left">भाजी (Item)</th>
                        <th className="py-3 px-2.5">वजन</th>
                        <th className="py-3 px-2.5">डाग</th>
                        <th className="py-3 px-2.5">भाव</th>
                        <th className="py-3 px-2.5">हमाली</th>
                        <th className="py-3 pl-2.5 pr-4">एकूण पैसे (Purchase)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#ebf1ed] dark:divide-[#143521]">
                      {filteredVegBillItems.map((item, idx) => (
                        <tr key={`${item[0]}-${item[1]}-${idx}`} className="hover:bg-[#f4f8f5] dark:hover:bg-[#10331e]">
                          <td className="py-3 pl-4 pr-2 text-left font-semibold text-[#0b2b17] dark:text-white">
                            {item[1]}
                          </td>
                          <td className="py-3 px-2.5 text-slate-700 dark:text-emerald-50">{fmt(item[3])}</td>
                          <td className="py-3 px-2.5 text-slate-700 dark:text-emerald-50">{fmt(item[2])}</td>
                          <td className="py-3 px-2.5 text-slate-600 dark:text-emerald-100/80">{fmtFixed(item[4])}</td>
                          <td className="py-3 px-2.5 text-slate-600 dark:text-emerald-100/80">{fmtFixed(item[5])}</td>
                          <td className="py-3 pl-2.5 pr-4 font-bold text-amber-700 dark:text-amber-400">
                            {fmtFixed(item[6])}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="rounded-xl border border-[#dce5df] dark:border-[#184028] p-8 text-center text-sm text-slate-500 dark:text-emerald-100/65">
                  {vegBillItems.length > 0
                    ? `No vegetable item matching "${vegQuery}".`
                    : `No itemised vegetable purchase recorded for ${dmy(vegDetailDate)}.`}
                </div>
              )}

              {/* Total Daily Veg Purchase Footer Bar */}
              <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-[#dce5df] dark:border-[#184028] bg-[#f4f8f5] dark:bg-[#06180d] px-5 py-4">
                <div>
                  <div className="text-sm font-bold text-[#0b2b17] dark:text-emerald-50">
                    {tr('totalDayPurchase', lang)}
                  </div>
                  <div className="text-xs text-slate-600 dark:text-emerald-100/70 mt-0.5 tabular-nums">
                    {vegBillItems.length} items · {fmt(vegBillSummary.dag)} डाग · {fmt(vegBillSummary.weight)} वजन · Hamali ₹{fmt(vegBillSummary.hamali)}
                    {vegQuery.trim() && (
                      <span className="ml-2 font-semibold text-amber-700 dark:text-amber-400">
                        · Filtered sum: {money(filteredVegTotal, true)}
                      </span>
                    )}
                    {vegBillSummary.sheet1Cr > 0 && !vegBillSummary.hasMismatch && (
                      <span className="ml-2 font-semibold text-emerald-700 dark:text-emerald-400">
                        · Matches Sheet1 Cr.
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-2xl font-extrabold tabular-nums text-amber-700 dark:text-amber-400">
                  {money(vegBillSummary.total, true)}
                </div>
              </div>

              {/* Reconciliation Check Notice */}
              {vegBillSummary.hasMismatch && (
                <div className="flex items-start gap-2.5 rounded-xl border border-red-300 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 p-3.5 text-xs text-red-700 dark:text-red-300">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
                  <span>
                    Reconciliation difference: Sheet2 vegetable total ({money(vegBillSummary.total, true)}) differs from Sheet1 ledger Cr. ({money(vegBillSummary.sheet1Cr, true)}) by{' '}
                    <strong>{money(vegBillSummary.diff, true)}</strong>.
                  </span>
                </div>
              )}
            </section>
          ) : (
            /* ================= MODE B: ACCOUNT STATEMENT LEDGER ================= */
            <>
              {/* Customer Balance Summary Header */}
              <div className="rounded-xl border border-[#dce5df] dark:border-[#184028] bg-white dark:bg-[#0b2616] p-5 sm:p-6 space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                  <div>
                    <h1 className="ledger-scaled-title font-extrabold tracking-tight text-[#0b2b17] dark:text-white">
                      {nameOnly(selectedCustomer.name)}
                    </h1>
                    <p className="mt-1 text-xs text-slate-600 dark:text-emerald-100/70">
                      <span>Account {selectedCustomer.code || '—'}</span>
                      <span aria-hidden="true"> · </span>
                      <span>Mobile: {selectedCustomer.mobile || 'Not recorded'}</span>
                      <span aria-hidden="true"> · </span>
                      <span>As of {dmy(toDate || dataset?.lastDate || '') || '—'}</span>
                    </p>
                  </div>

                  <div className="sm:text-right">
                    <div className="text-xs font-semibold text-slate-600 dark:text-emerald-100/70">
                      {statement.close < 0 ? 'Advance Surplus (BAL.)' : tr('pendingBal', lang)}
                    </div>
                    <div
                      className={`ledger-scaled-balance font-extrabold tabular-nums tracking-tight mt-0.5 ${
                        statement.close < 0
                          ? 'text-red-600 dark:text-red-400'
                          : 'text-amber-700 dark:text-amber-400'
                      }`}
                    >
                      {money(statement.close, true)}
                    </div>
                  </div>
                </div>

                {/* 3 Financial Totals (Old Balance, Purchase Cr., Deposited Dr.) */}
                <div className="grid grid-cols-3 gap-2.5 sm:gap-4 border-t border-[#ebf1ed] dark:border-[#143521] pt-4 tabular-nums">
                  <div className="flex flex-col justify-between">
                    <div className="text-[11px] sm:text-xs text-slate-600 dark:text-emerald-100/70 truncate">
                      {tr('oldBalance', lang)}
                    </div>
                    <div className="mt-1 text-sm sm:text-base font-bold text-[#0b2b17] dark:text-white">
                      {money(statement.open, true)}
                    </div>
                  </div>
                  <div className="flex flex-col justify-between">
                    <div className="text-[11px] sm:text-xs text-slate-600 dark:text-emerald-100/70 truncate">
                      {tr('purchaseCr', lang)}
                    </div>
                    <div className="mt-1 text-sm sm:text-base font-bold text-amber-700 dark:text-amber-400">
                      {money(statement.tCr, true)}
                    </div>
                  </div>
                  <div className="flex flex-col justify-between">
                    <div className="text-[11px] sm:text-xs text-slate-600 dark:text-emerald-100/70 truncate">
                      {tr('depositedDr', lang)}
                    </div>
                    <div className="mt-1 text-sm sm:text-base font-bold text-emerald-700 dark:text-emerald-400">
                      {money(statement.tDr, true)}
                    </div>
                  </div>
                </div>

                {/* Period Presets & Custom Range */}
                <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-3 border-t border-[#ebf1ed] dark:border-[#143521] pt-4">
                  <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
                    {(
                      [
                        ['7', lang === 'en' ? '7 Days' : '७ दिवस'],
                        ['month', lang === 'en' ? 'This Month' : 'हा महिना'],
                        ['last', lang === 'en' ? 'Last Month' : 'मागील महिना'],
                        ['30', lang === 'en' ? '30 Days' : '३० दिवस'],
                        ['all', lang === 'en' ? 'All' : 'सर्व'],
                      ] as [PeriodPreset, string][]
                    ).map(([preset, label]) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => onChangePreset(preset)}
                        className={`h-9 rounded-lg px-2.5 sm:px-3 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                          periodPreset === preset
                            ? 'bg-[#0b2b17] text-white dark:bg-amber-400 dark:text-slate-950'
                            : 'border border-[#dce5df] dark:border-[#245a39] text-slate-700 dark:text-emerald-100/80 hover:bg-[#f2f7f3] dark:hover:bg-[#10331e]'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  <div className="grid grid-cols-2 sm:flex sm:items-end gap-2.5">
                    <label className="text-[11px] font-medium text-slate-600 dark:text-emerald-100/70">
                      {tr('fromDate', lang)}
                      <input
                        type="date"
                        value={fromDate}
                        onChange={(e) => onChangeRange(e.target.value, toDate)}
                        className="mt-1 block h-9 w-full rounded-lg border border-[#c9d7ce] dark:border-[#245a39] bg-white dark:bg-[#06180d] px-2.5 text-xs text-[#0b2b17] dark:text-white dark:[color-scheme:dark] tabular-nums"
                      />
                    </label>
                    <label className="text-[11px] font-medium text-slate-600 dark:text-emerald-100/70">
                      {tr('toDate', lang)}
                      <input
                        type="date"
                        value={toDate}
                        onChange={(e) => onChangeRange(fromDate, e.target.value)}
                        className="mt-1 block h-9 w-full rounded-lg border border-[#c9d7ce] dark:border-[#245a39] bg-white dark:bg-[#06180d] px-2.5 text-xs text-[#0b2b17] dark:text-white dark:[color-scheme:dark] tabular-nums"
                      />
                    </label>
                  </div>
                </div>

                {/* Ledger Transaction Search & Multi-Filter Bar */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-2.5 border-t border-[#ebf1ed] dark:border-[#143521] pt-3">
                  <div className="relative flex-1 max-w-sm">
                    <Search
                      className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400 dark:text-emerald-300/60"
                      aria-hidden="true"
                    />
                    <input
                      type="search"
                      aria-label="Filter ledger transactions by date or vegetable"
                      value={txQuery}
                      onChange={(e) => setTxQuery(e.target.value)}
                      placeholder={lang === 'mr' ? 'तारीख किंवा भाजी शोधा…' : 'Search date or vegetable item…'}
                      className="h-9 w-full rounded-lg border border-[#c9d7ce] dark:border-[#245a39] bg-[#f6f8f6] dark:bg-[#06180d] pl-8 pr-3 text-xs text-[#0b2b17] dark:text-white focus:border-amber-500 focus:outline-none"
                    />
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    {(
                      [
                        ['all', lang === 'mr' ? 'सर्व नोंदी' : 'All Entries'],
                        ['purchase', lang === 'mr' ? 'खरेदी (Cr.)' : 'Purchase Cr.'],
                        ['deposit', lang === 'mr' ? 'जमा (Dr.)' : 'Deposited Dr.'],
                        ['veg', lang === 'mr' ? 'भाजी बिले' : 'Veg Bills'],
                        ['mismatch', lang === 'mr' ? 'फरक' : 'Check Bill'],
                      ] as [TxTypeFilter, string][]
                    ).map(([tKey, label]) => (
                      <button
                        key={tKey}
                        type="button"
                        onClick={() => setTxType(tKey)}
                        className={`h-8 rounded-md px-2.5 text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                          txType === tKey
                            ? 'bg-amber-500 text-slate-950 dark:bg-amber-400'
                            : 'border border-[#dce5df] dark:border-[#245a39] text-slate-600 dark:text-emerald-100/80 hover:bg-[#f2f7f3] dark:hover:bg-[#10331e]'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Ledger Table Container */}
              <div className="overflow-hidden rounded-xl border border-[#dce5df] dark:border-[#184028] bg-white dark:bg-[#0b2616]">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#dce5df] dark:border-[#184028] px-4 py-3 text-xs">
                  <span className="font-medium text-slate-600 dark:text-emerald-100/70">
                    {lang === 'mr'
                      ? 'भाजी तपशीलासाठी कोणत्याही तारखेवर क्लिक करा'
                      : 'Select any billed date to view vegetable items'}
                    {(txQuery || txType !== 'all') && ` · ${displayLines.length}/${statement.lines.length} shown`}
                  </span>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={onToggleInlineVeg}
                      className="font-semibold text-[#0b2b17] dark:text-emerald-100 hover:text-amber-700 dark:hover:text-amber-400 cursor-pointer"
                    >
                      {inlineVeg ? 'Hide Inline Veg' : 'Show Inline Veg'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setNewestFirst((v) => !v)}
                      className="inline-flex items-center gap-1 font-semibold text-[#0b2b17] dark:text-emerald-100 hover:text-amber-700 dark:hover:text-amber-400 cursor-pointer"
                    >
                      <ArrowDownUp className="h-3.5 w-3.5" aria-hidden="true" />
                      {newestFirst ? 'Newest First' : 'Oldest First'}
                    </button>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-right tabular-nums">
                    <thead>
                      <tr className="border-b border-[#dce5df] dark:border-[#184028] bg-[#f4f8f5] dark:bg-[#06180d] text-xs font-semibold text-slate-600 dark:text-emerald-100/70">
                        <th className="py-3 pl-4 pr-2 text-left">Date &amp; Particulars</th>
                        <th className="py-3 px-2.5">{tr('purchaseCr', lang)}</th>
                        <th className="py-3 px-2.5">{tr('depositedDr', lang)}</th>
                        <th className="py-3 pl-2.5 pr-4">{tr('pendingBal', lang)}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#ebf1ed] dark:divide-[#143521]">
                      {!newestFirst && (
                        <tr className="bg-[#f4f8f5]/80 dark:bg-[#06180d]/70 font-semibold">
                          <td className="py-3 pl-4 pr-2 text-left text-slate-700 dark:text-emerald-100">
                            {tr('oldBalance', lang)}
                          </td>
                          <td className="py-3 px-2.5"></td>
                          <td className="py-3 px-2.5"></td>
                          <td className="py-3 pl-2.5 pr-4 text-[#0b2b17] dark:text-white">
                            {fmtFixed(statement.open)}
                          </td>
                        </tr>
                      )}

                      {displayLines.map((line) => {
                        const hasVeg = line.vegCount > 0;
                        return (
                          <React.Fragment key={line.d}>
                            <tr
                              className={`transition-colors ${
                                hasVeg
                                  ? 'hover:bg-amber-50/70 dark:hover:bg-[#133b23]'
                                  : 'hover:bg-[#f4f8f5] dark:hover:bg-[#10331e]'
                              }`}
                            >
                              <td className="py-3 pl-4 pr-2 text-left">
                                {hasVeg ? (
                                  <button
                                    type="button"
                                    onClick={() => onOpenVegDetailDate(line.d)}
                                    className="group text-left cursor-pointer focus-visible:outline-none focus-visible:underline"
                                  >
                                    <div className="flex items-center gap-1.5 font-semibold text-[#0b2b17] dark:text-white group-hover:text-amber-700 dark:group-hover:text-amber-400">
                                      <span>{dmy(line.d)}</span>
                                      <ChevronRight className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" aria-hidden="true" />
                                    </div>
                                    <div className="text-xs text-slate-500 dark:text-emerald-100/65">
                                      {line.particulars} · {line.vegCount} veg item{line.vegCount === 1 ? '' : 's'}
                                      {line.hasMismatch && (
                                        <span className="ml-1.5 font-semibold text-red-600 dark:text-red-400">
                                          · Check bill
                                        </span>
                                      )}
                                    </div>
                                  </button>
                                ) : (
                                  <div>
                                    <div className="font-semibold text-[#0b2b17] dark:text-white">
                                      {dmy(line.d)}
                                    </div>
                                    <div className="text-xs text-slate-500 dark:text-emerald-100/65">
                                      {line.particulars}
                                    </div>
                                  </div>
                                )}
                              </td>
                              <td className="py-3 px-2.5 font-semibold text-amber-700 dark:text-amber-400">
                                {line.cr ? fmtFixed(line.cr) : '—'}
                              </td>
                              <td className="py-3 px-2.5 font-semibold text-emerald-700 dark:text-emerald-400">
                                {line.dr ? fmtFixed(line.dr) : '—'}
                              </td>
                              <td
                                className={`py-3 pl-2.5 pr-4 font-bold ${
                                  line.bal < 0
                                    ? 'text-red-600 dark:text-red-400'
                                    : 'text-[#0b2b17] dark:text-white'
                                }`}
                              >
                                {fmtFixed(line.bal)}
                              </td>
                            </tr>

                            {inlineVeg && hasVeg && statement.items[line.d] && (
                              <tr className="bg-[#f4f8f5] dark:bg-[#06180d]">
                                <td colSpan={4} className="px-4 py-2.5">
                                  <div className="overflow-x-auto rounded-lg border border-dashed border-[#c9d7ce] dark:border-[#245a39]">
                                    <table className="w-full text-xs text-right tabular-nums">
                                      <thead>
                                        <tr className="border-b border-dashed border-[#c9d7ce] dark:border-[#245a39] text-slate-600 dark:text-emerald-100/70">
                                          <th className="py-1.5 pl-3 pr-2 text-left">भाजी</th>
                                          <th className="py-1.5 px-2">वजन</th>
                                          <th className="py-1.5 px-2">डाग</th>
                                          <th className="py-1.5 px-2">भाव</th>
                                          <th className="py-1.5 px-2">हमाली</th>
                                          <th className="py-1.5 pl-2 pr-3">एकूण</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-[#dce5df]/60 dark:divide-[#143521]">
                                        {statement.items[line.d].map((item, idx) => (
                                          <tr key={`${line.d}-inline-${idx}`}>
                                            <td className="py-1.5 pl-3 pr-2 text-left font-medium text-[#0b2b17] dark:text-emerald-50">
                                              {item[1]}
                                            </td>
                                            <td className="py-1.5 px-2">{fmt(item[3])}</td>
                                            <td className="py-1.5 px-2">{fmt(item[2])}</td>
                                            <td className="py-1.5 px-2">{fmt(item[4])}</td>
                                            <td className="py-1.5 px-2">{fmt(item[5])}</td>
                                            <td className="py-1.5 pl-2 pr-3 font-semibold text-amber-700 dark:text-amber-400">
                                              {fmt(item[6])}
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                  {line.hasMismatch && (
                                    <div className="mt-1.5 text-left text-xs font-semibold text-red-600 dark:text-red-400">
                                      ⚠ भाजी एकूण ₹{fmt(line.vegTotal)} ≠ Cr. ₹{fmt(line.cr)}
                                    </div>
                                  )}
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}

                      {newestFirst && (
                        <tr className="bg-[#f4f8f5]/80 dark:bg-[#06180d]/70 font-semibold">
                          <td className="py-3 pl-4 pr-2 text-left text-slate-700 dark:text-emerald-100">
                            मागील बाकी (Opening before {dmy(fromDate) || 'start'})
                          </td>
                          <td className="py-3 px-2.5"></td>
                          <td className="py-3 px-2.5"></td>
                          <td className="py-3 pl-2.5 pr-4 text-[#0b2b17] dark:text-white">
                            {fmtFixed(statement.open)}
                          </td>
                        </tr>
                      )}

                      {displayLines.length === 0 && (
                        <tr>
                          <td colSpan={4} className="py-10 text-center text-sm text-slate-500 dark:text-emerald-100/65">
                            {statement.lines.length === 0
                              ? 'या कालावधीत कोणतीही नोंद नाही. (No entries in this date range.)'
                              : 'No ledger entries match your active search/type filters.'}
                          </td>
                        </tr>
                      )}

                      <tr className="bg-[#eaf2ec] dark:bg-[#041209] font-extrabold">
                        <td className="py-3.5 pl-4 pr-2 text-left text-[#0b2b17] dark:text-white">
                          Period Total / {tr('pendingBal', lang)}
                        </td>
                        <td className="py-3.5 px-2.5 text-amber-700 dark:text-amber-400">
                          {fmtFixed(statement.tCr)}
                        </td>
                        <td className="py-3.5 px-2.5 text-emerald-700 dark:text-emerald-400">
                          {fmtFixed(statement.tDr)}
                        </td>
                        <td
                          className={`py-3.5 pl-2.5 pr-4 ${
                            statement.close < 0
                              ? 'text-red-600 dark:text-red-400'
                              : 'text-[#0b2b17] dark:text-amber-300'
                          }`}
                        >
                          {fmtFixed(statement.close)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};
