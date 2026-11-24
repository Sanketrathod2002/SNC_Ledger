import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
  Cloud,
  Languages,
  LayoutDashboard,
  Phone,
  ShieldAlert,
  Upload,
} from 'lucide-react';
import type {
  AuditPrintPayload,
  CloudConfig,
  CloudMeta,
  CustomerRecord,
  DirectoryEntry,
  LanguageMode,
  LedgerDataset,
  LocalBackupEntry,
  NavTab,
  PeriodPreset,
  StatementResult,
} from './types/ledger';
import { SHOP_INFO } from './types/ledger';
import { computeAuditReport, computeDateRange, sanitizeDatasetDates } from './utils/ledgerMath';
import {
  clearCloudLedger,
  fetchSingleCustomer,
  isValidAppsScriptUrl,
  syncFullLedgerFromCloud,
} from './utils/appsScriptApi';
import {
  ledgerDB,
  loadCloudConfig,
  loadCloudSyncPassword,
  loadLangPref,
  loadScalePref,
  loadThemePref,
  loadVegInlinePref,
  localBackupsDB,
  saveCloudConfig,
  saveCloudSyncPassword,
  saveLangPref,
  saveScalePref,
  saveThemePref,
  saveVegInlinePref,
} from './utils/storage';
import { tr } from './utils/i18n';
import { DashboardView } from './components/DashboardView';
import { LedgerView } from './components/LedgerView';
import { AuditView } from './components/AuditView';
import { CloudDeployView } from './components/CloudDeployView';
import { UploadModal } from './components/UploadModal';
import { PrintPreviewModal } from './components/PrintPreviewModal';
import { OfflineIndicator } from './components/PWAControls';

export default function App() {
  const [activeTab, setActiveTab] = useState<NavTab>('dashboard');
  const [lang, setLang] = useState<LanguageMode>(() => loadLangPref());
  const [dataset, setDataset] = useState<LedgerDataset | null>(null);
  const [directory, setDirectory] = useState<DirectoryEntry[]>([]);
  const [cloudMeta, setCloudMeta] = useState<CloudMeta | null>(null);
  const [cloudConfig, setCloudConfig] = useState<CloudConfig>(() => loadCloudConfig());

  const [cloudUnlocked, setCloudUnlocked] = useState(false);
  const [cloudLockPin, setCloudLockPin] = useState<string>(() => loadCloudSyncPassword());
  const [localBackups, setLocalBackups] = useState<LocalBackupEntry[]>([]);

  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [onDemandCustomer, setOnDemandCustomer] = useState<CustomerRecord | null>(null);
  const [loadingCustomer, setLoadingCustomer] = useState(false);

  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>('month');
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');
  const [vegDetailDate, setVegDetailDate] = useState<string | null>(null);

  const [theme, setTheme] = useState<'dark' | 'light'>(() => loadThemePref());
  const [scale, setScale] = useState<number>(() => loadScalePref());
  const [inlineVeg, setInlineVeg] = useState<boolean>(() => loadVegInlinePref());

  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState('');
  const [uploadOpen, setUploadOpen] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const [printState, setPrintState] = useState<{
    open: boolean;
    customer: CustomerRecord | null;
    statement: StatementResult | null;
    vegDate: string | null;
    auditPrint: AuditPrintPayload | null;
  }>({
    open: false,
    customer: null,
    statement: null,
    vegDate: null,
    auditPrint: null,
  });

  const showToast = useCallback((message: string) => {
    setToastMsg(message);
  }, []);

  useEffect(() => {
    if (!toastMsg) return;
    const t = window.setTimeout(() => setToastMsg(null), 3200);
    return () => window.clearTimeout(t);
  }, [toastMsg]);

  useEffect(() => {
    saveLangPref(lang);
    document.documentElement.lang = lang === 'en' ? 'en' : 'mr';
  }, [lang]);

  // Sync Tailwind v4 dark class & theme-color meta tag
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', theme === 'dark');
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) metaTheme.setAttribute('content', theme === 'dark' ? '#061a0e' : '#f6f8f6');
    saveThemePref(theme);
  }, [theme]);

  // Sync font scale CSS variable
  useEffect(() => {
    document.documentElement.style.setProperty('--ledger-scale', String(scale));
    saveScalePref(scale);
  }, [scale]);

  const handleSyncCloud = useCallback(
    async (force = false, currentUploadId?: string, overrideUrl?: string) => {
      const targetUrl = (overrideUrl || cloudConfig.apiUrl).trim();
      if (!isValidAppsScriptUrl(targetUrl)) {
        showToast('Configure your Web App URL in Cloud Sync first.');
        setActiveTab('cloud');
        return;
      }
      setSyncing(true);
      setSyncMessage('Syncing ledger…');
      try {
        const res = await syncFullLedgerFromCloud(targetUrl, {
          readPin: cloudConfig.readPin || undefined,
          currentUploadId: currentUploadId ?? dataset?.uploadId,
          force,
          onSummary: (meta, dir) => {
            setCloudMeta(meta);
            setDirectory(dir);
          },
          onProgress: (_pct, label) => {
            setSyncMessage(label);
          },
        });
        setCloudMeta(res.meta);
        if (res.skipped) {
          showToast('Ledger is already up to date.');
        } else if (res.dataset) {
          await ledgerDB.clear();
          setDataset(res.dataset);
          setOnDemandCustomer(null);
          setSelectedKey(res.dataset.customers[0]?.key || null);
          await ledgerDB.put(res.dataset);
          const nextRange = computeDateRange('month', res.dataset.lastDate);
          setPeriodPreset('month');
          setFromDate(nextRange.from);
          setToDate(nextRange.to);
          showToast(`Synced ${res.dataset.customers.length} accounts.`);
        }
      } catch (err) {
        showToast(err instanceof Error ? err.message : String(err));
      } finally {
        setSyncing(false);
        setSyncMessage('');
      }
    },
    [cloudConfig.apiUrl, cloudConfig.readPin, dataset?.uploadId, showToast],
  );

  // Hydrate URL override (?api=...), offline IndexedDB dataset & daily backups on startup
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let activeUrl = cloudConfig.apiUrl;
      let autoSync = cloudConfig.autoSyncOnStart;
      let urlUpdatedFromQuery = false;

      try {
        const params = new URLSearchParams(window.location.search);
        const paramApi = (params.get('api') || '').trim();
        if (paramApi && isValidAppsScriptUrl(paramApi)) {
          const updatedConfig: CloudConfig = { ...cloudConfig, apiUrl: paramApi };
          setCloudConfig(updatedConfig);
          saveCloudConfig(updatedConfig);
          activeUrl = paramApi;
          autoSync = true;
          urlUpdatedFromQuery = true;
          params.delete('api');
          const qs = params.toString();
          const cleanUrl = `${window.location.pathname}${qs ? `?${qs}` : ''}${window.location.hash}`;
          window.history.replaceState({}, '', cleanUrl);
          showToast(
            lang === 'mr'
              ? 'नवीन Web App URL कायमस्वरूपी सेव्ह झाला.'
              : 'Web App URL saved permanently on this device.',
          );
        }
      } catch {
        // Ignore URL search parsing errors
      }

      const [saved, savedBackups] = await Promise.all([ledgerDB.get(), localBackupsDB.list()]);
      if (cancelled) return;
      setLocalBackups(savedBackups);

      if (saved && saved.customers && saved.customers.length > 0 && saved.uploadId !== 'demo-seed-2026-11-22') {
        const sanitized = sanitizeDatasetDates(saved);
        setDataset(sanitized);
        setSelectedKey(sanitized.customers[0].key);
        const r = computeDateRange('month', sanitized.lastDate);
        setFromDate(r.from);
        setToDate(r.to);
        if (sanitized.lastDate !== saved.lastDate) {
          void ledgerDB.put(sanitized);
        }
        if ((autoSync || urlUpdatedFromQuery) && navigator.onLine && isValidAppsScriptUrl(activeUrl)) {
          void handleSyncCloud(urlUpdatedFromQuery, sanitized.uploadId, activeUrl);
        }
      } else {
        if (saved?.uploadId === 'demo-seed-2026-11-22') {
          await ledgerDB.clear();
        }
        if ((autoSync || urlUpdatedFromQuery) && navigator.onLine && isValidAppsScriptUrl(activeUrl)) {
          void handleSyncCloud(urlUpdatedFromQuery, undefined, activeUrl);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // Run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedCustomer = useMemo(() => {
    if (!selectedKey) return null;
    const found = dataset?.customers.find((c) => c.key === selectedKey);
    if (found) return found;
    if (onDemandCustomer && onDemandCustomer.key === selectedKey) return onDemandCustomer;
    return null;
  }, [dataset, selectedKey, onDemandCustomer]);

  const auditCount = useMemo(() => computeAuditReport(dataset).mismatches.length, [dataset]);

  const handleSelectCustomerKey = useCallback(
    async (key: string) => {
      setSelectedKey(key);
      setVegDetailDate(null);
      setActiveTab('ledger');

      const existsLocally = dataset?.customers.some((c) => c.key === key);
      if (!existsLocally && isValidAppsScriptUrl(cloudConfig.apiUrl)) {
        setLoadingCustomer(true);
        try {
          const single = await fetchSingleCustomer(cloudConfig.apiUrl, key, cloudConfig.readPin || undefined);
          setOnDemandCustomer(single.customer);
          if (single.veg.length > 0) {
            setDataset((prev) => {
              if (!prev) return prev;
              return {
                ...prev,
                details: {
                  count: (prev.details?.count || 0) + single.veg.length,
                  map: { ...(prev.details?.map || {}), [key]: single.veg },
                },
              };
            });
          }
        } catch (err) {
          showToast(err instanceof Error ? err.message : 'Could not fetch account');
        } finally {
          setLoadingCustomer(false);
        }
      }
    },
    [dataset, cloudConfig.apiUrl, cloudConfig.readPin, showToast],
  );

  const handleChangePreset = (preset: PeriodPreset) => {
    setPeriodPreset(preset);
    const range = computeDateRange(preset, dataset?.lastDate || new Date().toISOString().slice(0, 10));
    setFromDate(range.from);
    setToDate(range.to);
  };

  const handleChangeRange = (from: string, to: string) => {
    setPeriodPreset('custom');
    setFromDate(from);
    setToDate(to);
  };

  const handleDatasetCommitted = async (rawNext: LedgerDataset, uploadedToCloud: boolean) => {
    const next = sanitizeDatasetDates(rawNext);
    // 1. Erase all previous active data before applying new Excel
    await ledgerDB.clear();
    setDirectory([]);
    setOnDemandCustomer(null);
    setSelectedKey(next.customers[0]?.key || null);
    setVegDetailDate(null);

    // 2. Replace active dataset & save to IndexedDB
    setDataset(next);
    const range = computeDateRange('month', next.lastDate);
    setPeriodPreset('month');
    setFromDate(range.from);
    setToDate(range.to);
    await ledgerDB.put(next);

    // 3. Save full snapshot into daily multi-upload backup history
    await localBackupsDB.saveSnapshot(next, uploadedToCloud);
    const updatedList = await localBackupsDB.list();
    setLocalBackups(updatedList);

    showToast(
      uploadedToCloud
        ? `Uploaded ${next.customers.length} accounts & saved daily backup.`
        : `Saved ${next.customers.length} accounts & daily backup offline.`,
    );
  };

  const handleRestoreLocalBackup = async (entry: LocalBackupEntry) => {
    const sanitized = sanitizeDatasetDates(entry.dataset);
    await ledgerDB.clear();
    setDirectory([]);
    setOnDemandCustomer(null);
    setDataset(sanitized);
    setSelectedKey(sanitized.customers[0]?.key || null);
    setVegDetailDate(null);
    const range = computeDateRange('month', sanitized.lastDate);
    setPeriodPreset('month');
    setFromDate(range.from);
    setToDate(range.to);
    await ledgerDB.put(sanitized);
    setActiveTab('dashboard');
    showToast(`Restored backup: ${entry.fileName}`);
  };

  const handleDeleteLocalBackup = async (id: string) => {
    await localBackupsDB.deleteEntry(id);
    setLocalBackups(await localBackupsDB.list());
    showToast('Backup entry removed.');
  };

  const handleUnlockCloud = (entered: string): boolean => {
    if (entered.trim() === cloudLockPin) {
      setCloudUnlocked(true);
      return true;
    }
    return false;
  };

  const handleChangeCloudPassword = (nextPin: string) => {
    const clean = nextPin.trim();
    if (!clean) return;
    setCloudLockPin(clean);
    saveCloudSyncPassword(clean);
  };

  const handleInspectMismatch = (customerKey: string, date: string) => {
    setSelectedKey(customerKey);
    setVegDetailDate(date);
    setActiveTab('ledger');
  };

  const handleSaveCloudConfig = (next: CloudConfig) => {
    setCloudConfig(next);
    saveCloudConfig(next);
    showToast('Cloud settings saved.');
  };

  const handleClearLocalCache = async () => {
    await ledgerDB.clear();
    setDataset(null);
    setDirectory([]);
    setSelectedKey(null);
    setOnDemandCustomer(null);
    setVegDetailDate(null);
    setFromDate('');
    setToDate('');
    showToast(lang === 'mr' ? 'ऑफलाइन डेटा साफ झाला.' : 'Offline cache cleared.');
  };

  const handleClearCloud = async (enteredPassword: string): Promise<{ ok: boolean; msg: string }> => {
    const clean = enteredPassword.trim();
    if (clean !== cloudLockPin) {
      return {
        ok: false,
        msg: lang === 'mr' ? 'चुकीचा पासवर्ड. कृपया पुन्हा प्रयत्न करा.' : 'Incorrect password. Please try again.',
      };
    }
    if (!isValidAppsScriptUrl(cloudConfig.apiUrl)) {
      return {
        ok: false,
        msg: 'Configure your Web App URL in Cloud Sync first.',
      };
    }
    try {
      await clearCloudLedger(cloudConfig.apiUrl, clean, cloudConfig.operatorName || 'Operator');
      setCloudMeta(null);
      setDirectory([]);
      await ledgerDB.clear();
      setDataset(null);
      setSelectedKey(null);
      setOnDemandCustomer(null);
      setVegDetailDate(null);
      setFromDate('');
      setToDate('');
      showToast(lang === 'mr' ? 'क्लाउड डेटा साफ झाला.' : 'Cloud ledger data cleared.');
      return { ok: true, msg: 'Cloud cleared.' };
    } catch (err) {
      return {
        ok: false,
        msg: err instanceof Error ? err.message : String(err),
      };
    }
  };

  const navItems: { id: NavTab; label: string; shortLabel: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'dashboard', label: tr('navDashboard', lang), shortLabel: tr('navDashboard', lang), icon: LayoutDashboard },
    { id: 'ledger', label: tr('navLedger', lang), shortLabel: tr('navLedger', lang), icon: BookOpen },
    {
      id: 'audit',
      label: auditCount > 0 ? `${tr('navAudit', lang)} (${auditCount})` : tr('navAudit', lang),
      shortLabel: tr('navAudit', lang),
      icon: ShieldAlert,
    },
    { id: 'cloud', label: tr('navCloud', lang), shortLabel: tr('navCloud', lang), icon: Cloud },
  ];

  const vegItemsForPrint =
    printState.customer && printState.vegDate && dataset?.details?.map
      ? (dataset.details.map[printState.customer.key] || []).filter((x) => x[0] === printState.vegDate)
      : undefined;

  return (
    <div className="min-h-screen flex flex-col bg-[#f6f8f6] text-slate-900 dark:bg-[#061a0e] dark:text-slate-100 pb-16 md:pb-0">
      {/* Sticky Header: Top Language Strip Above Main Navigation Bar */}
      <header className="no-print sticky top-0 z-30 border-b border-[#dce5df] dark:border-[#184028] bg-white/95 dark:bg-[#061a0e]/95 backdrop-blur-md">
        {/* Top Bar Above Nav: Merchant Subtitle + Language Switcher (मराठी | English | Both) */}
        <div className="border-b border-[#ebf1ed] dark:border-[#12331f] bg-[#f4f8f5] dark:bg-[#041209]">
          <div className="mx-auto flex h-9 max-w-7xl items-center justify-between gap-2 px-4 sm:px-6 text-[11px]">
            <span className="truncate font-semibold text-slate-600 dark:text-emerald-100/75">
              {SHOP_INFO.name}
            </span>
            <div
              role="group"
              aria-label="Language mode switcher"
              className="inline-flex items-center gap-0.5 rounded-md border border-[#dce5df] dark:border-[#1f4d30] bg-white dark:bg-[#0b2616] p-0.5 shrink-0"
            >
              <Languages className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 mx-1 hidden sm:block" aria-hidden="true" />
              {(
                [
                  ['mr', 'मराठी'],
                  ['en', 'English'],
                  ['both', 'Both'],
                ] as [LanguageMode, string][]
              ).map(([code, label]) => (
                <button
                  key={code}
                  type="button"
                  aria-pressed={lang === code}
                  onClick={() => setLang(code)}
                  className={`rounded px-2 py-0.5 text-[11px] font-bold transition-colors whitespace-nowrap cursor-pointer ${
                    lang === code
                      ? 'bg-[#0b2b17] text-white dark:bg-amber-400 dark:text-slate-950'
                      : 'text-slate-600 dark:text-emerald-100/75 hover:text-[#0b2b17] dark:hover:text-white'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Main 3-Zone Navigation Row (clean fit on Mobile, Tablet, Laptop, PC) */}
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-3 md:gap-5 lg:gap-8 px-4 sm:px-6">
          {/* Zone 1: Single-line Brand Identity with Uploaded Logo */}
          <button
            type="button"
            onClick={() => setActiveTab('dashboard')}
            className="flex items-center gap-2.5 text-sm lg:text-[15px] font-extrabold tracking-tight text-[#0b2b17] dark:text-white whitespace-nowrap shrink-0 cursor-pointer"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white p-0.5 ring-1 ring-slate-200 dark:ring-white/15">
              <img
                src={SHOP_INFO.logoPath}
                alt={SHOP_INFO.firmName}
                className="h-full w-full object-contain"
                referrerPolicy="no-referrer"
              />
            </span>
            <span className="hidden lg:inline">{SHOP_INFO.firmName}</span>
            <span className="lg:hidden">{SHOP_INFO.shortName}</span>
          </button>

          {/* Zone 2: 4 Clean Single-Line Nav Links */}
          <nav aria-label="Main navigation" className="hidden md:flex items-center gap-4 lg:gap-7">
            {navItems.map((item) => {
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  aria-current={active ? 'page' : undefined}
                  className={`relative py-4 text-xs lg:text-sm font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    active
                      ? 'text-[#0b2b17] dark:text-amber-400'
                      : 'text-slate-600 dark:text-emerald-100/70 hover:text-[#0b2b17] dark:hover:text-white'
                  }`}
                >
                  {item.label}
                  {active && (
                    <span className="absolute inset-x-0 bottom-0 h-0.5 bg-amber-600 dark:bg-amber-400" />
                  )}
                </button>
              );
            })}
          </nav>

          {/* Zone 3: Single Primary Action */}
          <div className="flex items-center shrink-0">
            <button
              type="button"
              onClick={() => setUploadOpen(true)}
              className="inline-flex items-center gap-2 rounded-lg bg-amber-500 dark:bg-amber-400 px-3 sm:px-3.5 py-2 text-xs sm:text-sm font-bold text-slate-950 hover:bg-amber-400 dark:hover:bg-amber-300 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Upload className="h-4 w-4" aria-hidden="true" />
              {tr('uploadFile', lang)}
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Container */}
      <main className="no-print flex-1 mx-auto w-full max-w-7xl px-4 sm:px-6 py-5 sm:py-8">
        {activeTab === 'dashboard' && (
          <DashboardView
            dataset={dataset}
            directory={directory}
            cloudMeta={cloudMeta}
            lang={lang}
            theme={theme}
            syncing={syncing}
            syncMessage={syncMessage}
            onSelectCustomer={(key) => {
              void handleSelectCustomerKey(key);
            }}
            onPrintAllBalances={() => {
              if (!dataset) return;
              setPrintState({
                open: true,
                customer: null,
                statement: null,
                vegDate: null,
                auditPrint: null,
              });
            }}
            onSyncCloud={() => {
              void handleSyncCloud(false);
            }}
            onOpenUpload={() => setUploadOpen(true)}
            onToggleTheme={setTheme}
            onClearOffline={handleClearLocalCache}
            onClearCloud={handleClearCloud}
          />
        )}

        {activeTab === 'ledger' && (
          <LedgerView
            dataset={dataset}
            directory={directory}
            lang={lang}
            selectedCustomer={selectedCustomer}
            loadingCustomer={loadingCustomer}
            onSelectCustomerKey={(key) => {
              void handleSelectCustomerKey(key);
            }}
            onClearCustomer={() => {
              setSelectedKey(null);
              setVegDetailDate(null);
            }}
            onOpenUpload={() => setUploadOpen(true)}
            onSyncCloud={() => {
              void handleSyncCloud(false);
            }}
            periodPreset={periodPreset}
            fromDate={fromDate}
            toDate={toDate}
            onChangePreset={handleChangePreset}
            onChangeRange={handleChangeRange}
            inlineVeg={inlineVeg}
            onToggleInlineVeg={() => {
              setInlineVeg((v) => {
                saveVegInlinePref(!v);
                return !v;
              });
            }}
            scale={scale}
            onChangeScale={setScale}
            vegDetailDate={vegDetailDate}
            onOpenVegDetailDate={setVegDetailDate}
            onOpenPrintPreview={({ statement, vegDate }) => {
              if (!dataset || !selectedCustomer) return;
              setPrintState({
                open: true,
                customer: selectedCustomer,
                statement,
                vegDate: vegDate ?? null,
                auditPrint: null,
              });
            }}
          />
        )}

        {activeTab === 'audit' && (
          <AuditView
            dataset={dataset}
            lang={lang}
            onInspectMismatch={handleInspectMismatch}
            onPrintAudit={(payload) => {
              setPrintState({
                open: true,
                customer: null,
                statement: null,
                vegDate: null,
                auditPrint: payload,
              });
            }}
          />
        )}

        {activeTab === 'cloud' && (
          <CloudDeployView
            config={cloudConfig}
            cloudMeta={cloudMeta}
            lang={lang}
            syncing={syncing}
            unlocked={cloudUnlocked}
            localBackups={localBackups}
            onUnlock={handleUnlockCloud}
            onLock={() => setCloudUnlocked(false)}
            onChangePassword={handleChangeCloudPassword}
            onRestoreLocalBackup={(entry) => {
              void handleRestoreLocalBackup(entry);
            }}
            onDeleteLocalBackup={(id) => {
              void handleDeleteLocalBackup(id);
            }}
            onSaveConfig={handleSaveCloudConfig}
            onSyncNow={(force) => {
              void handleSyncCloud(Boolean(force));
            }}
            onClearLocalCache={() => {
              void handleClearLocalCache();
            }}
          />
        )}
      </main>

      {/* Quiet Merchant Identity Footer */}
      <footer className="no-print border-t border-[#dce5df] dark:border-[#184028] bg-white/80 dark:bg-[#041209]/80">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-600 dark:text-emerald-100/70">
          <div className="space-y-0.5">
            <div className="font-bold text-[#0b2b17] dark:text-white">
              {SHOP_INFO.firmName}
              <span className="font-semibold text-amber-700 dark:text-amber-400"> · {SHOP_INFO.name}</span>
            </div>
            <div>
              {SHOP_INFO.addr}
              <span aria-hidden="true"> · </span>
              <span>Udyam Reg. No.: <strong className="text-[#0b2b17] dark:text-amber-300">{SHOP_INFO.udyamReg}</strong></span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 shrink-0 font-semibold tabular-nums">
            <span className="inline-flex items-center gap-1.5 text-slate-500 dark:text-emerald-200/70">
              <Phone className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" aria-hidden="true" />
              Mobile No. :
            </span>
            <span>
              <a
                href="tel:+919552233488"
                className="text-[#0b2b17] dark:text-white hover:text-amber-700 dark:hover:text-amber-400 transition-colors"
              >
                +91 95522 33488
              </a>
              <span className="text-slate-400 dark:text-emerald-500/60">,</span>
            </span>
            <a
              href="tel:+919975649575"
              className="text-[#0b2b17] dark:text-white hover:text-amber-700 dark:hover:text-amber-400 transition-colors"
            >
              +91 99756 49575
            </a>
          </div>
        </div>
      </footer>

      {/* Mobile Bottom Tab Bar */}
      <nav
        aria-label="Mobile navigation"
        className="no-print fixed bottom-0 left-0 right-0 z-30 md:hidden border-t border-[#dce5df] dark:border-[#184028] bg-white/95 dark:bg-[#061a0e]/95 backdrop-blur-md"
      >
        <div className="grid grid-cols-4 h-14">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                aria-current={active ? 'page' : undefined}
                className={`flex flex-col items-center justify-center gap-0.5 text-[11px] font-semibold transition-colors cursor-pointer ${
                  active
                    ? 'text-amber-700 dark:text-amber-400'
                    : 'text-slate-500 dark:text-emerald-100/65'
                }`}
              >
                <Icon className="h-5 w-5" aria-hidden="true" />
                <span className="truncate max-w-[78px]">{item.shortLabel}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Modals */}
      <UploadModal
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        cloudConfig={cloudConfig}
        lang={lang}
        onDatasetCommitted={(ds, uploaded) => {
          void handleDatasetCommitted(ds, uploaded);
        }}
        onUpdateOperatorName={(name) => {
          const next = { ...cloudConfig, operatorName: name };
          setCloudConfig(next);
          saveCloudConfig(next);
        }}
      />

      {printState.open && (
        <PrintPreviewModal
          open={printState.open}
          onClose={() => setPrintState((s) => ({ ...s, open: false }))}
          dataset={dataset}
          lang={lang}
          customer={printState.customer}
          statement={printState.statement}
          fromDate={fromDate}
          toDate={toDate}
          includeVeg={inlineVeg}
          vegDetailDate={printState.vegDate}
          vegDetailItems={vegItemsForPrint}
          auditPrint={printState.auditPrint}
        />
      )}

      {/* Offline Banner & Toast */}
      <OfflineIndicator />

      {toastMsg && (
        <div
          role="status"
          aria-live="polite"
          className="no-print fixed bottom-18 md:bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-[#0b2b17] dark:bg-amber-400 px-4 py-2.5 text-xs font-bold text-white dark:text-slate-950 shadow-xl max-w-[90vw] text-center"
        >
          {toastMsg}
        </div>
      )}
    </div>
  );
}
