import React, { useMemo, useState } from 'react';
import {
  ArrowRight,
  Calendar,
  Clock,
  CloudOff,
  Eye,
  EyeOff,
  HardDrive,
  Lock,
  MapPin,
  Moon,
  Phone,
  Printer,
  RefreshCw,
  Search,
  ShieldCheck,
  Sun,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import type { CloudMeta, CustomerRecord, DirectoryEntry, LanguageMode, LedgerDataset } from '../types/ledger';
import { SHOP_INFO } from '../types/ledger';
import {
  computeDashboardDailyStats,
  computeDashboardForRange,
  computeDateRange,
  dmy,
  fmt,
  formatStamp,
  money,
  nameOnly,
  round2,
} from '../utils/ledgerMath';
import { tr } from '../utils/i18n';
import { PWAInstallButton } from './PWAControls';

type BalanceFilter = 'all' | 'pending' | 'active' | 'high' | 'settled';
type ContactFilter = 'all' | 'with_mobile' | 'no_mobile';
type DashDatePreset = 'all' | 'latest' | '7' | 'month' | 'custom';
type SortOption = 'balance_desc' | 'range_cr_desc' | 'range_dr_desc' | 'name_asc' | 'code_asc' | 'recent_desc';

interface DashboardViewProps {
  dataset: LedgerDataset | null;
  directory: DirectoryEntry[];
  cloudMeta?: CloudMeta | null;
  lang: LanguageMode;
  theme: 'dark' | 'light';
  syncing: boolean;
  syncMessage: string;
  onSelectCustomer: (customerKey: string) => void;
  onPrintAllBalances: () => void;
  onSyncCloud: () => void;
  onOpenUpload: () => void;
  onToggleTheme: (next: 'dark' | 'light') => void;
  onClearOffline: () => Promise<void> | void;
  onClearCloud: (password: string) => Promise<{ ok: boolean; msg: string }>;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  dataset,
  directory,
  cloudMeta,
  lang,
  theme,
  syncing,
  syncMessage,
  onSelectCustomer,
  onPrintAllBalances,
  onSyncCloud,
  onOpenUpload,
  onToggleTheme,
  onClearOffline,
  onClearCloud,
}) => {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<BalanceFilter>('all');
  const [contactFilter, setContactFilter] = useState<ContactFilter>('all');
  const [sortBy, setSortBy] = useState<SortOption>('balance_desc');

  // Dashboard Date Range Filter
  const [datePreset, setDatePreset] = useState<DashDatePreset>('all');
  const [dashFrom, setDashFrom] = useState<string>('');
  const [dashTo, setDashTo] = useState<string>('');

  // Clear Modal State
  const [clearModalOpen, setClearModalOpen] = useState(false);
  const [clearingOffline, setClearingOffline] = useState(false);
  const [cloudClearOpen, setCloudClearOpen] = useState(false);
  const [cloudPassword, setCloudPassword] = useState('');
  const [showCloudPass, setShowCloudPass] = useState(false);
  const [clearingCloud, setClearingCloud] = useState(false);
  const [clearError, setClearError] = useState('');

  const sourceList: (CustomerRecord | DirectoryEntry)[] = dataset ? dataset.customers : directory;

  const daily = useMemo(() => computeDashboardDailyStats(dataset), [dataset]);
  const ranged = useMemo(
    () => computeDashboardForRange(dataset, dashFrom, dashTo),
    [dataset, dashFrom, dashTo],
  );

  const handleApplyDashPreset = (preset: DashDatePreset) => {
    setDatePreset(preset);
    const end = dataset?.lastDate || '';
    if (preset === 'all') {
      setDashFrom('');
      setDashTo('');
    } else if (preset === 'latest') {
      setDashFrom(end);
      setDashTo(end);
    } else if (preset === '7' || preset === 'month') {
      const r = computeDateRange(preset, end);
      setDashFrom(r.from);
      setDashTo(r.to);
    }
  };

  const openClearDialog = () => {
    setClearError('');
    setCloudPassword('');
    setShowCloudPass(false);
    setCloudClearOpen(false);
    setClearModalOpen(true);
  };

  const closeClearDialog = () => {
    if (clearingOffline || clearingCloud) return;
    setClearModalOpen(false);
    setClearError('');
    setCloudPassword('');
  };

  const handleRunOfflineClear = async () => {
    setClearingOffline(true);
    setClearError('');
    try {
      await onClearOffline();
      setClearModalOpen(false);
    } finally {
      setClearingOffline(false);
    }
  };

  const handleRunCloudClear = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cloudPassword.trim()) {
      setClearError(lang === 'mr' ? 'क्लाउड पासवर्ड टाका.' : 'Enter Cloud password.');
      return;
    }
    setClearingCloud(true);
    setClearError('');
    try {
      const res = await onClearCloud(cloudPassword.trim());
      if (res.ok) {
        setCloudPassword('');
        setCloudClearOpen(false);
        setClearModalOpen(false);
      } else {
        setClearError(res.msg);
      }
    } finally {
      setClearingCloud(false);
    }
  };

  const ThemeSwitcher = (
    <div
      role="group"
      aria-label="Theme mode"
      className="inline-flex h-9 items-center rounded-lg border border-[#c9d7ce] dark:border-[#245a39] bg-white dark:bg-[#0b2616] p-0.5 shrink-0"
    >
      <button
        type="button"
        aria-pressed={theme === 'dark'}
        onClick={() => onToggleTheme('dark')}
        className={`inline-flex h-full items-center gap-1.5 rounded-md px-2.5 text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
          theme === 'dark'
            ? 'bg-amber-400 text-slate-950'
            : 'text-slate-600 dark:text-emerald-100/75 hover:text-[#0b2b17] dark:hover:text-white'
        }`}
      >
        <Moon className="h-3.5 w-3.5" aria-hidden="true" />
        Dark
      </button>
      <button
        type="button"
        aria-pressed={theme === 'light'}
        onClick={() => onToggleTheme('light')}
        className={`inline-flex h-full items-center gap-1.5 rounded-md px-2.5 text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
          theme === 'light'
            ? 'bg-[#0b2b17] text-white'
            : 'text-slate-600 dark:text-emerald-100/75 hover:text-[#0b2b17] dark:hover:text-white'
        }`}
      >
        <Sun className="h-3.5 w-3.5" aria-hidden="true" />
        White
      </button>
    </div>
  );

  const ClearModal = clearModalOpen && (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="clear-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#030f08]/80 p-4 backdrop-blur-sm"
    >
      <div className="w-full max-w-md rounded-2xl border border-[#dce5df] dark:border-[#184028] bg-white dark:bg-[#0b2616] p-5 sm:p-6 shadow-2xl space-y-5">
        <div className="flex items-start justify-between gap-3 border-b border-[#ebf1ed] dark:border-[#143521] pb-3.5">
          <div>
            <h2 id="clear-modal-title" className="text-lg font-extrabold text-[#0b2b17] dark:text-white">
              {lang === 'mr' ? 'डेटा साफ करा (Clear)' : 'Clear Ledger Data'}
            </h2>
            <p className="mt-0.5 text-xs text-slate-600 dark:text-emerald-100/70">
              {lang === 'mr'
                ? 'ऑफलाइन (पासवर्ड नाही) किंवा क्लाउड डेटा (पासवर्ड आवश्यक) निवडा.'
                : 'Choose Offline Clear (no password) or Cloud Clear (password required).'}
            </p>
          </div>
          <button
            type="button"
            aria-label="Close clear dialog"
            onClick={closeClearDialog}
            disabled={clearingOffline || clearingCloud}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 dark:text-emerald-200/70 hover:bg-[#edf3ee] dark:hover:bg-[#10331e] cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Option 1: Offline Clear (NO password) */}
        <div className="rounded-xl border border-[#dce5df] dark:border-[#184028] bg-[#f6f8f6] dark:bg-[#06180d] p-4 space-y-3">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/15 text-amber-700 dark:text-amber-400">
              <HardDrive className="h-4 w-4" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-bold text-[#0b2b17] dark:text-white">
                {lang === 'mr' ? 'ऑफलाइन क्लिअर (Offline Clear)' : 'Offline Clear'}
              </div>
              <p className="mt-0.5 text-xs text-slate-600 dark:text-emerald-100/70">
                {lang === 'mr'
                  ? 'फक्त या डिव्हाइसवरील डेटा साफ करेल (पासवर्ड लागत नाही). बॅकअप सुरक्षित राहतील.'
                  : 'Clears cached ledger data on this device only. No password required.'}
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={clearingOffline || clearingCloud}
            onClick={() => void handleRunOfflineClear()}
            className="w-full h-10 rounded-lg border border-[#c9d7ce] dark:border-[#245a39] bg-white dark:bg-[#0b2616] text-xs font-bold text-[#0b2b17] dark:text-emerald-50 hover:border-amber-500 transition-colors cursor-pointer disabled:opacity-50"
          >
            {clearingOffline
              ? 'Clearing…'
              : lang === 'mr'
                ? 'ऑफलाइन डेटा साफ करा'
                : 'Offline Clear Now'}
          </button>
        </div>

        {/* Option 2: Cloud Clear (Password Required) */}
        <div className="rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50/50 dark:bg-red-950/20 p-4 space-y-3">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-red-500/15 text-red-600 dark:text-red-400">
              <CloudOff className="h-4 w-4" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-sm font-bold text-[#0b2b17] dark:text-white">
                <span>{lang === 'mr' ? 'क्लाउड क्लिअर (Cloud Clear)' : 'Cloud Clear'}</span>
                <Lock className="h-3.5 w-3.5 text-red-600 dark:text-red-400" aria-hidden="true" />
              </div>
              <p className="mt-0.5 text-xs text-slate-600 dark:text-emerald-100/70">
                {lang === 'mr'
                  ? 'Google Sheet मधील सक्रिय डेटा साफ करण्यासाठी पासवर्ड टाका.'
                  : 'Erases active Google Sheet ledger data. Password required.'}
              </p>
            </div>
          </div>

          {!cloudClearOpen ? (
            <button
              type="button"
              disabled={clearingOffline || clearingCloud}
              onClick={() => {
                setCloudClearOpen(true);
                setClearError('');
              }}
              className="w-full h-10 rounded-lg bg-red-600 px-4 text-xs font-bold text-white hover:bg-red-500 transition-colors cursor-pointer disabled:opacity-50"
            >
              {lang === 'mr' ? 'क्लाउड क्लिअर निवडा' : 'Cloud Clear (Requires Password)'}
            </button>
          ) : (
            <form onSubmit={(e) => void handleRunCloudClear(e)} className="space-y-3 pt-1">
              <div className="relative">
                <input
                  type={showCloudPass ? 'text' : 'password'}
                  aria-label="Cloud Clear password"
                  value={cloudPassword}
                  onChange={(e) => {
                    setCloudPassword(e.target.value);
                    if (clearError) setClearError('');
                  }}
                  placeholder={lang === 'mr' ? 'क्लाउड पासवर्ड टाका' : 'Enter Cloud password'}
                  autoFocus
                  className="h-10 w-full rounded-lg border border-[#c9d7ce] dark:border-[#245a39] bg-white dark:bg-[#06180d] pl-3 pr-10 text-xs text-[#0b2b17] dark:text-white focus:border-red-500 focus:outline-none"
                />
                <button
                  type="button"
                  aria-label={showCloudPass ? 'Hide password' : 'Show password'}
                  onClick={() => setShowCloudPass((v) => !v)}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 flex h-7 w-7 items-center justify-center rounded-md text-slate-500 dark:text-emerald-200/70 hover:bg-[#edf3ee] dark:hover:bg-[#10331e] cursor-pointer"
                >
                  {showCloudPass ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
              </div>

              {clearError && (
                <div
                  role="alert"
                  className="rounded-lg border border-red-300 dark:border-red-900/60 bg-red-50 dark:bg-red-950/50 px-3 py-2 text-xs font-semibold text-red-700 dark:text-red-300"
                >
                  {clearError}
                </div>
              )}

              <div className="flex items-center gap-2">
                <button
                  type="submit"
                  disabled={clearingCloud}
                  className="flex-1 h-10 rounded-lg bg-red-600 px-3 text-xs font-bold text-white hover:bg-red-500 cursor-pointer disabled:opacity-50"
                >
                  {clearingCloud
                    ? 'Clearing Cloud…'
                    : lang === 'mr'
                      ? 'क्लाउड डेटा साफ करा'
                      : 'Confirm Cloud Clear'}
                </button>
                <button
                  type="button"
                  disabled={clearingCloud}
                  onClick={() => {
                    setCloudClearOpen(false);
                    setCloudPassword('');
                    setClearError('');
                  }}
                  className="h-10 rounded-lg border border-[#c9d7ce] dark:border-[#245a39] px-3 text-xs font-semibold text-slate-700 dark:text-emerald-100 cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );

  const totals = useMemo(() => {
    if (dataset) {
      return {
        receivable: ranged.totalReceivable,
        advance: ranged.totalAdvance,
        totalOpening: ranged.totalOpening,
        totalCr: ranged.totalCr,
        totalDr: ranged.totalDr,
        pendingCount: ranged.pendingCount,
        netClosing: ranged.netClosing,
      };
    }
    let receivable = 0;
    let advance = 0;
    let totalOpening = 0;
    let totalCr = 0;
    let totalDr = 0;
    let pendingCount = 0;
    for (const c of sourceList) {
      totalOpening += c.opening || 0;
      totalCr += c.totalCr || 0;
      totalDr += c.totalDr || 0;
      if (c.balance > 0) {
        receivable += c.balance;
        pendingCount += 1;
      } else if (c.balance < 0) {
        advance += Math.abs(c.balance);
      }
    }
    return {
      receivable: round2(receivable),
      advance: round2(advance),
      totalOpening: round2(totalOpening),
      totalCr: round2(totalCr),
      totalDr: round2(totalDr),
      pendingCount,
      netClosing: round2(totalOpening + totalCr - totalDr),
    };
  }, [dataset, ranged, sourceList]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = sourceList.filter((c) => {
      const m = dataset ? ranged.byKey[c.key] : undefined;
      const bal = m ? m.balance : c.balance;
      const active = m ? m.activeInRange : Boolean(daily.latestByKey[c.key]);

      if (filter === 'pending' && bal <= 0) return false;
      if (filter === 'active' && !active) return false;
      if (filter === 'high' && bal < 25000) return false;
      if (filter === 'settled' && bal > 0) return false;

      if (contactFilter === 'with_mobile' && !(c.mobile || '').trim()) return false;
      if (contactFilter === 'no_mobile' && Boolean((c.mobile || '').trim())) return false;

      if (!q) return true;
      return (
        c.key.includes(q) ||
        (c.code || '').toLowerCase().includes(q) ||
        (c.mobile || '').includes(q)
      );
    });

    return [...list].sort((a, b) => {
      const ma = dataset ? ranged.byKey[a.key] : undefined;
      const mb = dataset ? ranged.byKey[b.key] : undefined;
      const balA = ma ? ma.balance : a.balance;
      const balB = mb ? mb.balance : b.balance;
      if (sortBy === 'balance_desc') return balB - balA;
      if (sortBy === 'range_cr_desc') return (mb?.cr ?? b.totalCr) - (ma?.cr ?? a.totalCr) || balB - balA;
      if (sortBy === 'range_dr_desc') return (mb?.dr ?? b.totalDr) - (ma?.dr ?? a.totalDr) || balB - balA;
      if (sortBy === 'name_asc') return a.name.localeCompare(b.name);
      if (sortBy === 'code_asc') return (a.code || 'zzz').localeCompare(b.code || 'zzz');
      return (mb?.lastDate || b.lastTxDate || '').localeCompare(ma?.lastDate || a.lastTxDate || '');
    });
  }, [sourceList, dataset, ranged.byKey, daily.latestByKey, filter, contactFilter, query, sortBy]);

  if (!sourceList.length) {
    return (
      <div className="py-4 sm:py-8">
        {ClearModal}
        <section className="mx-auto max-w-4xl rounded-2xl border border-[#dce5df] dark:border-[#184028] bg-white dark:bg-[#0b2616] p-5 sm:p-10 shadow-sm space-y-6">
          <div className="flex flex-wrap items-center justify-end gap-2">
            <PWAInstallButton compact />
            {ThemeSwitcher}
            <button
              type="button"
              onClick={openClearDialog}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-red-200 dark:border-red-900/50 bg-white dark:bg-[#0b2616] px-3 text-xs font-semibold text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors cursor-pointer"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              {lang === 'mr' ? 'साफ करा' : 'Clear'}
            </button>
          </div>

          <div className="flex flex-col md:flex-row md:items-center gap-6 sm:gap-8">
            <div className="flex h-24 w-24 sm:h-28 sm:w-28 shrink-0 items-center justify-center rounded-2xl bg-white p-2 ring-1 ring-[#dce5df] dark:ring-white/15 shadow-sm">
              <img
                src={SHOP_INFO.logoPath}
                alt={SHOP_INFO.firmName}
                className="h-full w-full object-contain"
                referrerPolicy="no-referrer"
              />
            </div>

            <div className="space-y-2.5 min-w-0">
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#0b2b17] dark:text-white text-balance">
                {SHOP_INFO.firmName}
              </h1>
              <p className="text-sm sm:text-base font-bold text-amber-700 dark:text-amber-400">
                {SHOP_INFO.name}
              </p>
              <p className="text-sm text-slate-600 dark:text-emerald-100/80 leading-relaxed max-w-2xl">
                {SHOP_INFO.marathiTagline}
              </p>

              <div className="pt-1 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-slate-600 dark:text-emerald-100/75">
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 shrink-0" aria-hidden="true" />
                  {SHOP_INFO.addr}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <ShieldCheck className="h-3.5 w-3.5 text-emerald-700 dark:text-emerald-400 shrink-0" aria-hidden="true" />
                  Udyam Reg. No.: <strong className="text-[#0b2b17] dark:text-amber-300">{SHOP_INFO.udyamReg}</strong>
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs sm:text-sm font-semibold tabular-nums text-[#0b2b17] dark:text-white">
                <Phone className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 shrink-0" aria-hidden="true" />
                <span className="text-slate-500 dark:text-emerald-200/75 font-medium">Mobile No. :</span>
                <span>
                  <a href="tel:+919552233488" className="hover:text-amber-700 dark:hover:text-amber-400 transition-colors">
                    +91 95522 33488
                  </a>
                  <span className="text-slate-400 dark:text-emerald-500/60">,</span>
                </span>
                <a href="tel:+919975649575" className="hover:text-amber-700 dark:hover:text-amber-400 transition-colors">
                  +91 99756 49575
                </a>
              </div>
            </div>
          </div>

          {cloudMeta?.updatedAt && (
            <div className="rounded-xl border border-[#dce5df] dark:border-[#184028] bg-[#f4f8f5] dark:bg-[#082012] px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs tabular-nums">
              <div className="flex items-center gap-2">
                <Clock className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 shrink-0" aria-hidden="true" />
                <span className="text-slate-600 dark:text-emerald-100/75">{tr('lastUpdatedOn', lang)}:</span>
                <strong className="font-bold text-[#0b2b17] dark:text-amber-300">{formatStamp(cloudMeta.updatedAt)}</strong>
              </div>
              {cloudMeta.dataUpTo && (
                <span className="text-slate-600 dark:text-emerald-100/75">
                  {tr('dataUpToLabel', lang)}:{' '}
                  <strong className="font-bold text-[#0b2b17] dark:text-white">{dmy(cloudMeta.dataUpTo) || '—'}</strong>
                </span>
              )}
            </div>
          )}

          <div className="pt-6 border-t border-[#e8efe9] dark:border-[#184028] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="text-sm text-slate-600 dark:text-emerald-100/75">
              {syncMessage ||
                (lang === 'mr'
                  ? 'खाते पाहण्यासाठी Excel / CSV फाइल अपलोड करा किंवा Cloud Sync करा.'
                  : 'Upload your Excel / CSV ledger file or sync from cloud to open accounts.')}
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 sm:gap-3 shrink-0">
              <button
                type="button"
                onClick={onOpenUpload}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-amber-500 dark:bg-amber-400 px-5 py-2.5 text-sm font-bold text-slate-950 hover:bg-amber-400 dark:hover:bg-amber-300 transition-colors cursor-pointer whitespace-nowrap"
              >
                <Upload className="h-4 w-4" aria-hidden="true" />
                {tr('uploadFile', lang)}
              </button>
              <button
                type="button"
                onClick={onSyncCloud}
                disabled={syncing}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-[#c9d7ce] dark:border-[#245a39] bg-[#f6f8f6] dark:bg-[#06180d] px-5 py-2.5 text-sm font-semibold text-[#0b2b17] dark:text-emerald-50 hover:bg-[#edf3ee] dark:hover:bg-[#10331e] transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap"
              >
                <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} aria-hidden="true" />
                {syncing ? 'Syncing…' : tr('navCloud', lang)}
              </button>
            </div>
          </div>
        </section>
      </div>
    );
  }

  const vegDisplay = ranged.isFiltered ? ranged.topVegetables : daily.topVegetables;
  const vegScope = ranged.isFiltered ? ranged.topVegScopeLabel : daily.topVegScopeLabel;
  const maxVegTotal = vegDisplay.length > 0 ? vegDisplay[0].total : 1;
  const activeCount = ranged.isFiltered ? ranged.activeCount : Object.keys(daily.latestByKey).length;

  const lastUpdatedIso = dataset?.loadedAt || cloudMeta?.updatedAt || '';
  const dataUpToFormatted = dmy(dataset?.lastDate || cloudMeta?.dataUpTo || '') || '—';
  const updatedByText = dataset?.uploadedBy || cloudMeta?.uploadedBy || '—';
  const sourceText = dataset
    ? dataset.source === 'Cloud Sync'
      ? 'Cloud Sync'
      : dataset.files?.[0] || dataset.source || 'Excel Upload'
    : 'Cloud';

  return (
    <div className="space-y-4 sm:space-y-5">
      {ClearModal}

      {/* Page Header & Actions (Cleanly responsive across mobile / tablet / laptop / PC) */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#0b2b17] dark:text-white">
            {tr('dashTitle', lang)}
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-slate-600 dark:text-emerald-100/70">
            {dataset ? (
              <span>
                {dataset.customers.length.toLocaleString('en-IN')}{' '}
                {lang === 'mr' ? 'खाती सक्रिय' : 'active accounts'}
                {' · '}
                {dataset.dateRows.toLocaleString('en-IN')}{' '}
                {lang === 'mr' ? 'दिवस नोंदी' : 'day rows'}
              </span>
            ) : (
              <span>{syncMessage || `${directory.length} accounts ready`}</span>
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {ThemeSwitcher}
          <PWAInstallButton compact />

          <button
            type="button"
            onClick={onSyncCloud}
            disabled={syncing}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#c9d7ce] dark:border-[#245a39] bg-white dark:bg-[#0b2616] px-3 text-xs font-semibold text-[#0b2b17] dark:text-emerald-50 hover:bg-[#f2f7f3] dark:hover:bg-[#10331e] transition-colors whitespace-nowrap cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`} aria-hidden="true" />
            {syncing ? 'Syncing…' : 'Sync'}
          </button>

          <button
            type="button"
            onClick={onPrintAllBalances}
            disabled={!dataset}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#c9d7ce] dark:border-[#245a39] bg-white dark:bg-[#0b2616] px-3 text-xs font-semibold text-[#0b2b17] dark:text-emerald-50 hover:bg-[#f2f7f3] dark:hover:bg-[#10331e] transition-colors whitespace-nowrap cursor-pointer disabled:opacity-50"
          >
            <Printer className="h-3.5 w-3.5" aria-hidden="true" />
            {lang === 'mr' ? 'बाकी यादी' : 'Balance List'}
          </button>

          <button
            type="button"
            onClick={openClearDialog}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-red-200 dark:border-red-900/60 bg-white dark:bg-[#0b2616] px-3 text-xs font-semibold text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors whitespace-nowrap cursor-pointer"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            {lang === 'mr' ? 'साफ करा' : 'Clear'}
          </button>
        </div>
      </div>

      {/* Small Last Updated Information Panel (Accurate Date DD-MM-YYYY + Exact Time) */}
      <section
        aria-label="Last updated information"
        className="rounded-xl border border-[#dce5df] dark:border-[#184028] bg-[#f4f8f5] dark:bg-[#082012] px-4 py-2.5 flex flex-wrap items-center justify-between gap-x-6 gap-y-2 text-xs tabular-nums"
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-amber-500/15 text-amber-700 dark:text-amber-400 shrink-0">
            <Clock className="h-3.5 w-3.5" aria-hidden="true" />
          </span>
          <span className="font-semibold text-slate-600 dark:text-emerald-100/75">
            {tr('lastUpdatedOn', lang)}:
          </span>
          <strong className="font-bold text-[#0b2b17] dark:text-amber-300">
            {formatStamp(lastUpdatedIso)}
          </strong>
        </div>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-slate-600 dark:text-emerald-100/75">
          <span>
            {tr('dataUpToLabel', lang)}:{' '}
            <strong className="font-bold text-[#0b2b17] dark:text-white">{dataUpToFormatted}</strong>
          </span>
          <span>
            {tr('updatedByLabel', lang)}:{' '}
            <strong className="font-semibold text-[#0b2b17] dark:text-emerald-100">{updatedByText}</strong>
          </span>
          <span className="hidden sm:inline">
            {tr('sourceLabel', lang)}:{' '}
            <strong className="font-semibold text-[#0b2b17] dark:text-emerald-100">{sourceText}</strong>
          </span>
        </div>
      </section>

      {/* Dashboard Date Range Bar */}
      {dataset && (
        <div className="rounded-xl border border-[#dce5df] dark:border-[#184028] bg-white dark:bg-[#0b2616] px-4 py-3 flex flex-col xl:flex-row xl:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[#0b2b17] dark:text-emerald-100 mr-1">
              <Calendar className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" aria-hidden="true" />
              {lang === 'mr' ? 'तारीख फिल्टर:' : 'Date Filter:'}
            </span>
            {(
              [
                ['all', tr('allDates', lang)],
                ['latest', `${tr('latestDayLabel', lang)} (${dmy(dataset.lastDate)})`],
                ['7', lang === 'mr' ? '७ दिवस' : '7 Days'],
                ['month', lang === 'mr' ? 'हा महिना' : 'This Month'],
              ] as [DashDatePreset, string][]
            ).map(([pKey, label]) => (
              <button
                key={pKey}
                type="button"
                onClick={() => handleApplyDashPreset(pKey)}
                className={`h-8 rounded-lg px-2.5 text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                  datePreset === pKey
                    ? 'bg-[#0b2b17] text-white dark:bg-amber-400 dark:text-slate-950'
                    : 'border border-[#dce5df] dark:border-[#245a39] text-slate-700 dark:text-emerald-100/80 hover:bg-[#f2f7f3] dark:hover:bg-[#10331e]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 sm:flex sm:flex-wrap sm:items-center gap-2 text-xs">
            <label className="flex flex-col sm:flex-row sm:items-center gap-1 font-medium text-slate-600 dark:text-emerald-100/75">
              <span>{tr('fromDate', lang)}</span>
              <input
                type="date"
                aria-label="Dashboard from date"
                value={dashFrom}
                onChange={(e) => {
                  setDatePreset('custom');
                  setDashFrom(e.target.value);
                }}
                className="h-8 w-full sm:w-auto rounded-lg border border-[#c9d7ce] dark:border-[#245a39] bg-[#f6f8f6] dark:bg-[#06180d] px-2 text-xs text-[#0b2b17] dark:text-white dark:[color-scheme:dark] tabular-nums"
              />
            </label>
            <label className="flex flex-col sm:flex-row sm:items-center gap-1 font-medium text-slate-600 dark:text-emerald-100/75">
              <span>{tr('toDate', lang)}</span>
              <input
                type="date"
                aria-label="Dashboard to date"
                value={dashTo}
                onChange={(e) => {
                  setDatePreset('custom');
                  setDashTo(e.target.value);
                }}
                className="h-8 w-full sm:w-auto rounded-lg border border-[#c9d7ce] dark:border-[#245a39] bg-[#f6f8f6] dark:bg-[#06180d] px-2 text-xs text-[#0b2b17] dark:text-white dark:[color-scheme:dark] tabular-nums"
              />
            </label>
            {(dashFrom || dashTo) && (
              <button
                type="button"
                onClick={() => handleApplyDashPreset('all')}
                className="col-span-2 sm:col-span-1 h-8 rounded-lg px-2 text-xs font-semibold text-amber-700 dark:text-amber-400 hover:underline cursor-pointer text-left sm:text-center"
              >
                {lang === 'mr' ? 'रद्द' : 'Reset'}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Primary 4 KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="rounded-xl border border-[#dce5df] dark:border-[#184028] bg-white dark:bg-[#0b2616] p-4">
          <div className="text-xs font-medium text-slate-600 dark:text-emerald-100/70">
            {tr('totalPendingBal', lang)}
          </div>
          <div className="mt-1.5 text-xl sm:text-2xl font-extrabold tabular-nums text-amber-700 dark:text-amber-400">
            {money(totals.receivable)}
          </div>
          <div className="mt-1 text-xs text-slate-500 dark:text-emerald-100/60 tabular-nums">
            {totals.pendingCount} {lang === 'mr' ? 'येणे खाती' : 'pending'}
            {totals.advance > 0 ? ` · Adv. ${money(totals.advance)}` : ''}
          </div>
        </div>

        <div className="rounded-xl border border-[#dce5df] dark:border-[#184028] bg-white dark:bg-[#0b2616] p-4">
          <div className="text-xs font-medium text-slate-600 dark:text-emerald-100/70">
            {tr('totalPurchaseCr', lang)}
          </div>
          <div className="mt-1.5 text-xl sm:text-2xl font-extrabold tabular-nums text-[#0b2b17] dark:text-white">
            {money(totals.totalCr)}
          </div>
          <div className="mt-1 text-xs text-slate-500 dark:text-emerald-100/60 tabular-nums">
            {lang === 'mr' ? 'मागील बाकी' : 'Old Bal.'} {money(totals.totalOpening)}
          </div>
        </div>

        <div className="rounded-xl border border-[#dce5df] dark:border-[#184028] bg-white dark:bg-[#0b2616] p-4">
          <div className="text-xs font-medium text-slate-600 dark:text-emerald-100/70">
            {tr('totalDepositedDr', lang)}
          </div>
          <div className="mt-1.5 text-xl sm:text-2xl font-extrabold tabular-nums text-emerald-700 dark:text-emerald-400">
            {money(totals.totalDr)}
          </div>
          <div className="mt-1 text-xs text-slate-500 dark:text-emerald-100/60 tabular-nums">
            {totals.totalCr + totals.totalOpening > 0
              ? `${Math.min(100, Math.round((totals.totalDr / (totals.totalCr + totals.totalOpening)) * 100))}% ${lang === 'mr' ? 'जमा' : 'collected'}`
              : 'Deposits'}
          </div>
        </div>

        <div className="rounded-xl border border-[#dce5df] dark:border-[#184028] bg-white dark:bg-[#0b2616] p-4">
          <div className="text-xs font-medium text-slate-600 dark:text-emerald-100/70">
            {ranged.isFiltered
              ? `${ranged.topVegScopeLabel}`
              : daily.latestDate
                ? `${tr('latestDayLabel', lang)} (${dmy(daily.latestDate)})`
                : 'Accounts'}
          </div>
          {dataset && (ranged.isFiltered || daily.latestDate) ? (
            <>
              <div className="mt-1.5 flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5 tabular-nums">
                <span className="text-base sm:text-lg font-extrabold text-amber-700 dark:text-amber-400">
                  Cr. {money(ranged.isFiltered ? totals.totalCr : daily.latestPurchaseCr)}
                </span>
                <span className="text-sm sm:text-base font-bold text-emerald-700 dark:text-emerald-400">
                  Dr. {money(ranged.isFiltered ? totals.totalDr : daily.latestDepositedDr)}
                </span>
              </div>
              <div className="mt-1 text-xs text-slate-500 dark:text-emerald-100/60 tabular-nums">
                {ranged.isFiltered
                  ? `${ranged.activeCount} ${lang === 'mr' ? 'सक्रिय ग्राहक' : 'active accounts'}`
                  : `${daily.latestBuyersCount} bought · ${daily.latestPayersCount} deposited`}
              </div>
            </>
          ) : (
            <>
              <div className="mt-1.5 text-xl sm:text-2xl font-extrabold tabular-nums text-[#0b2b17] dark:text-white">
                {sourceList.length.toLocaleString('en-IN')}
              </div>
              <div className="mt-1 text-xs text-slate-500 dark:text-emerald-100/60">
                Ready for inspection
              </div>
            </>
          )}
        </div>
      </div>

      {/* Ledger Balance Equation & Top Vegetables Purchased (Sheet2 एकूण पैसे) */}
      <div className={`grid grid-cols-1 ${vegDisplay.length > 0 ? 'lg:grid-cols-12' : ''} gap-4`}>
        <div
          className={`${vegDisplay.length > 0 ? 'lg:col-span-7' : ''} rounded-xl border border-[#dce5df] dark:border-[#184028] bg-white dark:bg-[#0b2616] p-4 sm:p-5 flex flex-col justify-between gap-4`}
        >
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-bold text-[#0b2b17] dark:text-white">
                {tr('sheet1Breakdown', lang)}
                {ranged.isFiltered ? ` (${ranged.topVegScopeLabel})` : ''}
              </h2>
              <p className="text-xs text-slate-500 dark:text-emerald-100/65">
                {tr('oldBalance', lang)} + {tr('purchaseCr', lang)} − {tr('depositedDr', lang)} = {tr('pendingBal', lang)}
              </p>
            </div>
            {dataset && (
              <span className="text-xs font-semibold text-slate-600 dark:text-emerald-100/75 tabular-nums whitespace-nowrap">
                {dataset.dateRows} {lang === 'mr' ? 'दिवस' : 'trading days'}
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1 border-t border-[#ebf1ed] dark:border-[#143521] tabular-nums">
            <div>
              <div className="text-[11px] font-medium text-slate-500 dark:text-emerald-100/65">
                {tr('oldBalance', lang)}
              </div>
              <div className="mt-0.5 text-sm sm:text-base font-bold text-[#0b2b17] dark:text-white">
                {money(totals.totalOpening)}
              </div>
            </div>
            <div>
              <div className="text-[11px] font-medium text-slate-500 dark:text-emerald-100/65">
                + {tr('purchaseCr', lang)}
              </div>
              <div className="mt-0.5 text-sm sm:text-base font-bold text-amber-700 dark:text-amber-400">
                {money(totals.totalCr)}
              </div>
            </div>
            <div>
              <div className="text-[11px] font-medium text-slate-500 dark:text-emerald-100/65">
                − {tr('depositedDr', lang)}
              </div>
              <div className="mt-0.5 text-sm sm:text-base font-bold text-emerald-700 dark:text-emerald-400">
                {money(totals.totalDr)}
              </div>
            </div>
            <div>
              <div className="text-[11px] font-medium text-slate-500 dark:text-emerald-100/65">
                = {tr('pendingBal', lang)}
              </div>
              <div className="mt-0.5 text-sm sm:text-base font-extrabold text-[#0b2b17] dark:text-amber-300">
                {money(totals.netClosing)}
              </div>
            </div>
          </div>
        </div>

        {vegDisplay.length > 0 && (
          <div className="lg:col-span-5 rounded-xl border border-[#dce5df] dark:border-[#184028] bg-white dark:bg-[#0b2616] p-4 sm:p-5 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-bold text-[#0b2b17] dark:text-white">
                {tr('topVegTitle', lang)}
              </h2>
              <span className="text-xs font-semibold text-amber-700 dark:text-amber-400 whitespace-nowrap">
                {vegScope}
              </span>
            </div>

            <div className="space-y-2">
              {vegDisplay.map((veg) => {
                const widthPct = Math.max(8, Math.round((veg.total / maxVegTotal) * 100));
                return (
                  <div key={veg.name} className="space-y-1">
                    <div className="flex items-center justify-between gap-2 text-xs tabular-nums">
                      <span className="font-semibold text-[#0b2b17] dark:text-emerald-50 truncate">
                        {veg.name}{' '}
                        <span className="font-normal text-slate-500 dark:text-emerald-100/65">
                          ({fmt(veg.dag)} डाग · {fmt(veg.weight)} kg)
                        </span>
                      </span>
                      <span className="font-bold text-amber-700 dark:text-amber-400 shrink-0">
                        {money(veg.total)}
                      </span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#e9f0eb] dark:bg-[#06180d]">
                      <div
                        className="h-full rounded-full bg-amber-500 dark:bg-amber-400"
                        style={{ width: `${widthPct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Multi-Filter & Search Controls */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search
            className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-emerald-300/60"
            aria-hidden="true"
          />
          <input
            type="search"
            aria-label="Filter customers by name, account code, or mobile"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={tr('searchCustomerPlaceholder', lang)}
            className="h-11 w-full rounded-xl border border-[#c9d7ce] dark:border-[#245a39] bg-white dark:bg-[#0b2616] pl-10 pr-4 text-sm text-[#0b2b17] dark:text-white placeholder:text-slate-400 dark:placeholder:text-emerald-200/50 focus:border-amber-500 focus:outline-none"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex flex-wrap items-center rounded-lg bg-[#e9f0eb] dark:bg-[#0b2616] p-1 border border-[#dce5df] dark:border-[#184028]">
            {(
              [
                ['all', lang === 'mr' ? 'सर्व' : 'All'],
                ['pending', lang === 'mr' ? 'येणे बाकी' : 'Pending BAL.'],
                ...(activeCount > 0
                  ? ([[
                      'active',
                      ranged.isFiltered
                        ? `${lang === 'mr' ? 'सक्रिय' : 'Active'} (${activeCount})`
                        : `${lang === 'mr' ? 'अखेरचा दिवस' : 'Latest'} (${activeCount})`,
                    ]] as [BalanceFilter, string][])
                  : []),
                ['high', '≥ ₹25k'],
                ['settled', '₹0 / Adv.'],
              ] as [BalanceFilter, string][]
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                  filter === key
                    ? 'bg-white dark:bg-[#17462a] text-[#0b2b17] dark:text-amber-300 shadow-xs'
                    : 'text-slate-600 dark:text-emerald-100/70 hover:text-[#0b2b17] dark:hover:text-white'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <select
            aria-label="Filter by mobile presence"
            value={contactFilter}
            onChange={(e) => setContactFilter(e.target.value as ContactFilter)}
            className="h-10 rounded-lg border border-[#c9d7ce] dark:border-[#245a39] bg-white dark:bg-[#0b2616] pl-3 pr-7 text-xs font-semibold text-[#0b2b17] dark:text-emerald-50 dark:[color-scheme:dark] focus:border-amber-500 focus:outline-none cursor-pointer"
          >
            <option value="all">{lang === 'mr' ? 'सर्व मोबाईल' : 'All Contacts'}</option>
            <option value="with_mobile">{lang === 'mr' ? 'मोबाईल असलेले' : 'With Mobile'}</option>
            <option value="no_mobile">{lang === 'mr' ? 'मोबाईल नसलेले' : 'Missing Mobile'}</option>
          </select>

          <select
            aria-label="Sort customers"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortOption)}
            className="h-10 rounded-lg border border-[#c9d7ce] dark:border-[#245a39] bg-white dark:bg-[#0b2616] pl-3 pr-8 text-xs font-semibold text-[#0b2b17] dark:text-emerald-50 dark:[color-scheme:dark] focus:border-amber-500 focus:outline-none cursor-pointer"
          >
            <option value="balance_desc">{lang === 'mr' ? 'जास्त बाकी प्रथम' : 'Highest Pending (BAL.)'}</option>
            <option value="range_cr_desc">{lang === 'mr' ? 'जास्त खरेदी (Cr.)' : 'Highest Purchase (Cr.)'}</option>
            <option value="range_dr_desc">{lang === 'mr' ? 'जास्त जमा (Dr.)' : 'Highest Deposited (Dr.)'}</option>
            <option value="name_asc">{lang === 'mr' ? 'नाव (A–Z)' : 'Name (A–Z)'}</option>
            <option value="code_asc">{lang === 'mr' ? 'कोड नुसार' : 'Account Code'}</option>
            <option value="recent_desc">{lang === 'mr' ? 'अलीकडील तारीख' : 'Recent Date'}</option>
          </select>
        </div>
      </div>

      {/* Customer Directory Table (Now includes explicit Date Column across all screens) */}
      <div className="overflow-hidden rounded-xl border border-[#dce5df] dark:border-[#184028] bg-white dark:bg-[#0b2616]">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-[#dce5df] dark:border-[#184028] bg-[#f4f8f5] dark:bg-[#06180d] text-xs font-semibold text-slate-600 dark:text-emerald-100/70">
                <th className="py-3 pl-4 pr-2 w-10">#</th>
                <th className="py-3 px-3">{lang === 'mr' ? 'ग्राहक / खाते' : 'Customer / Account'}</th>
                <th className="py-3 px-3 whitespace-nowrap">{lang === 'mr' ? 'तारीख' : 'Date'}</th>
                <th className="py-3 px-3 text-right hidden sm:table-cell">{tr('oldBalance', lang)}</th>
                <th className="py-3 px-3 text-right hidden md:table-cell">{tr('purchaseCr', lang)}</th>
                <th className="py-3 px-3 text-right hidden md:table-cell">{tr('depositedDr', lang)}</th>
                <th className="py-3 px-3 text-right">{tr('pendingBal', lang)}</th>
                <th className="py-3 pl-2 pr-4 w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#ebf1ed] dark:divide-[#143521] text-sm tabular-nums">
              {filtered.slice(0, 200).map((c, idx) => {
                const rm = dataset ? ranged.byKey[c.key] : undefined;
                const openVal = rm ? rm.opening : c.opening;
                const crVal = rm ? rm.cr : c.totalCr;
                const drVal = rm ? rm.dr : c.totalDr;
                const balVal = rm ? rm.balance : c.balance;
                const displayDate = rm?.lastDate || c.lastTxDate || dataset?.lastDate || '';
                const dayAct = daily.latestByKey[c.key];
                return (
                  <tr
                    key={c.key}
                    className="hover:bg-[#f4f8f5] dark:hover:bg-[#10331e] transition-colors"
                  >
                    <td className="py-3 pl-4 pr-2 text-xs text-slate-400 dark:text-emerald-200/50">{idx + 1}</td>
                    <td className="py-3 px-3">
                      <button
                        type="button"
                        onClick={() => onSelectCustomer(c.key)}
                        className="text-left group cursor-pointer focus-visible:outline-none focus-visible:underline"
                      >
                        <div className="font-semibold text-[#0b2b17] dark:text-white group-hover:text-amber-700 dark:group-hover:text-amber-400 transition-colors">
                          {nameOnly(c.name)}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-emerald-100/65">
                          {c.code ? `Code ${c.code}` : 'No code'}
                          {c.mobile ? ` · ${c.mobile}` : ''}
                          {!ranged.isFiltered && dayAct && (
                            <span className="ml-1.5 font-semibold text-amber-700 dark:text-amber-400">
                              · {dayAct.cr > 0 ? `Buy ₹${fmt(dayAct.cr)}` : ''}
                              {dayAct.cr > 0 && dayAct.dr > 0 ? ' / ' : ''}
                              {dayAct.dr > 0 ? `Paid ₹${fmt(dayAct.dr)}` : ''}
                            </span>
                          )}
                        </div>
                        <div className="mt-0.5 text-[11px] text-slate-500 dark:text-emerald-100/60 md:hidden">
                          Old ₹{fmt(openVal)} · Cr ₹{fmt(crVal)} · Dr ₹{fmt(drVal)}
                        </div>
                      </button>
                    </td>
                    <td className="py-3 px-3 text-xs sm:text-sm text-slate-600 dark:text-emerald-100/80 whitespace-nowrap">
                      {displayDate ? dmy(displayDate) : '—'}
                    </td>
                    <td className="py-3 px-3 text-right text-slate-600 dark:text-emerald-100/70 hidden sm:table-cell">
                      {fmt(openVal)}
                    </td>
                    <td className="py-3 px-3 text-right font-medium text-amber-700 dark:text-amber-400 hidden md:table-cell">
                      {fmt(crVal)}
                    </td>
                    <td className="py-3 px-3 text-right font-medium text-emerald-700 dark:text-emerald-400 hidden md:table-cell">
                      {fmt(drVal)}
                    </td>
                    <td
                      className={`py-3 px-3 text-right font-bold whitespace-nowrap ${
                        balVal < 0
                          ? 'text-red-600 dark:text-red-400'
                          : balVal === 0
                            ? 'text-slate-400 dark:text-emerald-200/50'
                            : 'text-[#0b2b17] dark:text-amber-300'
                      }`}
                    >
                      <div>{money(balVal, true)}</div>
                      {balVal < 0 && (
                        <div className="text-[10px] font-semibold uppercase tracking-wide text-red-500 dark:text-red-400/90">
                          Advance
                        </div>
                      )}
                    </td>
                    <td className="py-3 pl-2 pr-4 text-right">
                      <button
                        type="button"
                        aria-label={`Open ledger for ${c.name}`}
                        onClick={() => onSelectCustomer(c.key)}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 dark:text-emerald-200/60 hover:bg-[#e7f0ea] dark:hover:bg-[#17462a] hover:text-[#0b2b17] dark:hover:text-white transition-colors cursor-pointer"
                      >
                        <ArrowRight className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-sm text-slate-500 dark:text-emerald-100/65">
                    {lang === 'mr' ? 'शोधलेल्या अटींनुसार कोणतेही खाते सापडले नाही.' : 'No customers match your current filters.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {filtered.length > 200 && (
          <div className="border-t border-[#dce5df] dark:border-[#184028] px-4 py-2.5 text-center text-xs text-slate-500 dark:text-emerald-100/65">
            Showing first 200 of {filtered.length} matching accounts. Use search to narrow further.
          </div>
        )}
      </div>
    </div>
  );
};
