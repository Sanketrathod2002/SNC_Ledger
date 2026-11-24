import React, { useEffect, useMemo, useState } from 'react';
import {
  Check,
  CheckCircle2,
  Cloud,
  Copy,
  Download,
  ExternalLink,
  Eye,
  EyeOff,
  FolderArchive,
  KeyRound,
  Link2,
  Lock,
  RefreshCw,
  RotateCcw,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import type {
  CloudConfig,
  CloudMeta,
  DriveBackupEntry,
  LanguageMode,
  LocalBackupEntry,
} from '../types/ledger';
import { APPS_SCRIPT_CODE } from '../data/appsScriptCode';
import { fetchCloudSummary, fetchDriveBackups, isValidAppsScriptUrl } from '../utils/appsScriptApi';
import { dmy, formatStamp } from '../utils/ledgerMath';
import { tr } from '../utils/i18n';
import { PWAInstallButton } from './PWAControls';

interface CloudDeployViewProps {
  config: CloudConfig;
  cloudMeta: CloudMeta | null;
  lang: LanguageMode;
  syncing: boolean;
  unlocked: boolean;
  localBackups: LocalBackupEntry[];
  onUnlock: (password: string) => boolean;
  onLock: () => void;
  onChangePassword: (nextPassword: string) => void;
  onRestoreLocalBackup: (entry: LocalBackupEntry) => void;
  onDeleteLocalBackup: (id: string) => void;
  onSaveConfig: (next: CloudConfig) => void;
  onSyncNow: (force?: boolean) => void;
  onClearLocalCache: () => void;
}

export const CloudDeployView: React.FC<CloudDeployViewProps> = ({
  config,
  cloudMeta,
  lang,
  syncing,
  unlocked,
  localBackups,
  onUnlock,
  onLock,
  onChangePassword,
  onRestoreLocalBackup,
  onDeleteLocalBackup,
  onSaveConfig,
  onSyncNow,
  onClearLocalCache,
}) => {
  // Password Gate State
  const [passwordInput, setPasswordInput] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [authError, setAuthError] = useState('');

  // Settings State
  const [apiUrl, setApiUrl] = useState(config.apiUrl);
  const [readPin, setReadPin] = useState(config.readPin);
  const [operatorName, setOperatorName] = useState(config.operatorName);
  const [autoSync, setAutoSync] = useState(config.autoSyncOnStart);
  const [copiedSetupLink, setCopiedSetupLink] = useState(false);

  useEffect(() => {
    setApiUrl(config.apiUrl);
    setReadPin(config.readPin);
    setOperatorName(config.operatorName);
    setAutoSync(config.autoSyncOnStart);
  }, [config]);

  // Change Password State
  const [newPassword, setNewPassword] = useState('');
  const [pinSavedMsg, setPinSavedMsg] = useState('');

  // Testing / Drive Backups State
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [backups, setBackups] = useState<DriveBackupEntry[]>([]);
  const [driveFolderUrl, setDriveFolderUrl] = useState(cloudMeta?.driveFolderUrl || '');
  const [loadingBackups, setLoadingBackups] = useState(false);
  const [copiedScript, setCopiedScript] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  // Backup Search & Date Filter State
  const [backupQuery, setBackupQuery] = useState('');
  const [backupDate, setBackupDate] = useState('');

  const filteredLocalBackups = useMemo(() => {
    const q = backupQuery.trim().toLowerCase();
    return localBackups.filter((b) => {
      if (backupDate && b.istDate !== backupDate) return false;
      if (!q) return true;
      return (
        b.fileName.toLowerCase().includes(q) ||
        b.istDate.includes(q) ||
        dmy(b.istDate).includes(q) ||
        dmy(b.lastDate).includes(q)
      );
    });
  }, [localBackups, backupQuery, backupDate]);

  const filteredDriveBackups = useMemo(() => {
    const q = backupQuery.trim().toLowerCase();
    return backups.filter((b) => {
      const isoPart = b.createdAt.slice(0, 10);
      if (backupDate && !b.name.includes(backupDate) && isoPart !== backupDate) return false;
      if (!q) return true;
      return b.name.toLowerCase().includes(q) || formatStamp(b.createdAt).toLowerCase().includes(q);
    });
  }, [backups, backupQuery, backupDate]);

  const handleUnlockSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const ok = onUnlock(passwordInput);
    if (ok) {
      setPasswordInput('');
      setAuthError('');
    } else {
      setAuthError(
        lang === 'mr' ? 'चुकीचा पासवर्ड. कृपया पुन्हा प्रयत्न करा.' : 'Incorrect password. Please try again.',
      );
    }
  };

  if (!unlocked) {
    return (
      <div className="py-6 sm:py-12">
        <div className="mx-auto max-w-md rounded-2xl border border-[#dce5df] dark:border-[#184028] bg-white dark:bg-[#0b2616] p-6 sm:p-8 shadow-sm">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-500/15 text-amber-700 dark:text-amber-400">
            <Lock className="h-6 w-6" aria-hidden="true" />
          </div>
          <h1 className="mt-4 text-xl sm:text-2xl font-extrabold tracking-tight text-[#0b2b17] dark:text-white">
            {tr('cloudLockedTitle', lang)}
          </h1>
          <p className="mt-1.5 text-xs sm:text-sm text-slate-600 dark:text-emerald-100/70">
            {tr('cloudLockedDesc', lang)}
          </p>

          <form onSubmit={handleUnlockSubmit} className="mt-6 space-y-4">
            <label className="block text-xs font-semibold text-slate-700 dark:text-emerald-100/85">
              {lang === 'mr' ? 'पासवर्ड' : 'Password'}
              <div className="relative mt-1.5">
                <input
                  type={showPassword ? 'text' : 'password'}
                  aria-label="Cloud Sync password"
                  value={passwordInput}
                  onChange={(e) => {
                    setPasswordInput(e.target.value);
                    if (authError) setAuthError('');
                  }}
                  placeholder="Enter Cloud Sync password"
                  autoFocus
                  className="h-11 w-full rounded-xl border border-[#c9d7ce] dark:border-[#245a39] bg-[#f6f8f6] dark:bg-[#06180d] pl-3.5 pr-11 text-sm text-[#0b2b17] dark:text-white focus:border-amber-500 focus:outline-none"
                />
                <button
                  type="button"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 dark:text-emerald-200/70 hover:bg-[#e7f0ea] dark:hover:bg-[#10331e] cursor-pointer"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </label>

            {authError && (
              <div
                role="alert"
                className="rounded-lg border border-red-300 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 px-3 py-2 text-xs font-semibold text-red-700 dark:text-red-300"
              >
                {authError}
              </div>
            )}

            <button
              type="submit"
              className="w-full h-11 rounded-xl bg-[#0b2b17] dark:bg-amber-400 px-4 text-sm font-bold text-white dark:text-slate-950 hover:opacity-95 transition-opacity cursor-pointer"
            >
              {tr('unlockCloudBtn', lang)}
            </button>
          </form>
        </div>
      </div>
    );
  }

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveConfig({
      apiUrl: apiUrl.trim(),
      readPin: readPin.trim(),
      operatorName: operatorName.trim(),
      autoSyncOnStart: autoSync,
    });
    setTestResult({ ok: true, msg: 'Settings saved.' });
  };

  const handleUpdatePassword = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = newPassword.trim();
    if (clean.length < 4) {
      setPinSavedMsg(lang === 'mr' ? 'किमान ४ अंकी पासवर्ड ठेवा.' : 'Use at least 4 characters.');
      return;
    }
    onChangePassword(clean);
    setNewPassword('');
    setPinSavedMsg(lang === 'mr' ? 'पासवर्ड बदलला.' : 'Cloud Sync password updated.');
    window.setTimeout(() => setPinSavedMsg(''), 3000);
  };

  const handleTestConnection = async () => {
    const trimmed = apiUrl.trim();
    if (!isValidAppsScriptUrl(trimmed)) {
      setTestResult({ ok: false, msg: 'Enter a valid Web App URL ending with /exec.' });
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetchCloudSummary(trimmed, readPin.trim() || undefined);
      setDriveFolderUrl(res.meta.driveFolderUrl || driveFolderUrl);
      setTestResult({
        ok: true,
        msg: `Connected · ${res.meta.customerCount} accounts · Data up to ${dmy(res.meta.dataUpTo) || '—'}`,
      });
    } catch (err) {
      setTestResult({
        ok: false,
        msg: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setTesting(false);
    }
  };

  const handleLoadBackups = async () => {
    const trimmed = apiUrl.trim();
    if (!isValidAppsScriptUrl(trimmed)) {
      setTestResult({ ok: false, msg: 'Enter a valid Web App URL first.' });
      return;
    }
    setLoadingBackups(true);
    try {
      const res = await fetchDriveBackups(trimmed, readPin.trim() || undefined);
      setBackups(res.backups);
      if (res.folderUrl) setDriveFolderUrl(res.folderUrl);
      setTestResult({
        ok: true,
        msg: `${res.backups.length} Drive backup${res.backups.length === 1 ? '' : 's'} available.`,
      });
    } catch (err) {
      setTestResult({
        ok: false,
        msg: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setLoadingBackups(false);
    }
  };

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(APPS_SCRIPT_CODE);
      setCopiedScript(true);
      window.setTimeout(() => setCopiedScript(false), 2000);
    } catch {
      setTestResult({ ok: false, msg: 'Copy failed — use Download instead.' });
    }
  };

  const handleCopySetupLink = async () => {
    const trimmed = apiUrl.trim();
    if (!isValidAppsScriptUrl(trimmed)) {
      setTestResult({ ok: false, msg: 'Save a valid /exec Web App URL first.' });
      return;
    }
    const shareUrl = `${window.location.origin}${window.location.pathname}?api=${encodeURIComponent(trimmed)}`;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopiedSetupLink(true);
      setTestResult({
        ok: true,
        msg:
          lang === 'mr'
            ? 'सेटअप लिंक कॉपी झाली — कोणत्याही फोनवर एकदा उघडताच ही URL कायमची सेव्ह होईल.'
            : 'Setup link copied — open once on any device to save this /exec URL permanently.',
      });
      window.setTimeout(() => setCopiedSetupLink(false), 2500);
    } catch {
      setTestResult({ ok: false, msg: `Share link: ${shareUrl}` });
    }
  };

  const handleDownloadCode = () => {
    const blob = new Blob([APPS_SCRIPT_CODE], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'Code.gs';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadLocalBackup = (entry: LocalBackupEntry) => {
    const blob = new Blob([JSON.stringify(entry.dataset, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Backup_${entry.istDate}_${entry.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Header Row */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#0b2b17] dark:text-white">
            {tr('cloudTitle', lang)}
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-slate-600 dark:text-emerald-100/70">
            {tr('cloudSubtitle', lang)}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onLock}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#c9d7ce] dark:border-[#245a39] bg-white dark:bg-[#0b2616] px-3 py-1.5 text-xs font-semibold text-[#0b2b17] dark:text-emerald-50 hover:border-amber-500 cursor-pointer"
          >
            <Lock className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" aria-hidden="true" />
            {lang === 'mr' ? 'लॉक करा' : 'Lock'}
          </button>

          <PWAInstallButton compact />
        </div>
      </div>

      {/* Main 2-Column Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* Column 1: Connection + Cloud Sync Password */}
        <div className="space-y-5">
          <form
            onSubmit={handleSave}
            className="rounded-xl border border-[#dce5df] dark:border-[#184028] bg-white dark:bg-[#0b2616] p-5 sm:p-6 space-y-4"
          >
            <div className="flex items-center gap-2">
              <Cloud className="h-5 w-5 text-amber-600 dark:text-amber-400" aria-hidden="true" />
              <h2 className="text-base font-bold text-[#0b2b17] dark:text-white">
                Connection
              </h2>
            </div>

            <label className="block text-xs font-semibold text-slate-700 dark:text-emerald-100/85">
              Web App URL (/exec)
              <input
                type="url"
                value={apiUrl}
                onChange={(e) => setApiUrl(e.target.value)}
                placeholder="https://script.google.com/macros/s/.../exec"
                className="mt-1.5 w-full rounded-lg border border-[#c9d7ce] dark:border-[#245a39] bg-[#f6f8f6] dark:bg-[#06180d] px-3 py-2.5 text-xs font-mono text-[#0b2b17] dark:text-white focus:border-amber-500 focus:outline-none"
              />
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="block text-xs font-semibold text-slate-700 dark:text-emerald-100/85">
                Operator Name
                <input
                  type="text"
                  value={operatorName}
                  onChange={(e) => setOperatorName(e.target.value)}
                  placeholder="e.g. Parag"
                  className="mt-1.5 w-full rounded-lg border border-[#c9d7ce] dark:border-[#245a39] bg-[#f6f8f6] dark:bg-[#06180d] px-3 py-2 text-sm text-[#0b2b17] dark:text-white focus:border-amber-500 focus:outline-none"
                />
              </label>
              <label className="block text-xs font-semibold text-slate-700 dark:text-emerald-100/85">
                Read PIN (Optional)
                <input
                  type="password"
                  value={readPin}
                  onChange={(e) => setReadPin(e.target.value)}
                  placeholder="Leave blank if open"
                  className="mt-1.5 w-full rounded-lg border border-[#c9d7ce] dark:border-[#245a39] bg-[#f6f8f6] dark:bg-[#06180d] px-3 py-2 text-sm text-[#0b2b17] dark:text-white focus:border-amber-500 focus:outline-none"
                />
              </label>
            </div>

            <label className="flex items-center gap-2.5 text-xs text-slate-700 dark:text-emerald-100/80 cursor-pointer">
              <input
                type="checkbox"
                checked={autoSync}
                onChange={(e) => setAutoSync(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 accent-amber-500"
              />
              Auto-sync latest ledger on startup
            </label>

            {testResult && (
              <div
                role="status"
                className={`rounded-lg border p-3 text-xs font-medium ${
                  testResult.ok
                    ? 'border-emerald-300 dark:border-emerald-700/60 bg-emerald-50 dark:bg-[#0a301a] text-emerald-800 dark:text-emerald-300'
                    : 'border-red-300 dark:border-red-900/60 bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300'
                }`}
              >
                {testResult.msg}
              </div>
            )}

            <div className="rounded-lg border border-[#dce5df] dark:border-[#184028] bg-[#f4f8f5] dark:bg-[#06180d] px-3 py-2 text-[11px] text-slate-600 dark:text-emerald-100/75 leading-relaxed">
              {lang === 'mr'
                ? 'Save दाबताच ही Web App URL या ब्राउझर/अॅपमध्ये कायमची सेव्ह राहते. इतर फोनवर कोड न बदलता तीच URL लागू करण्यासाठी "Copy Setup Link" वापरा.'
                : 'Clicking Save stores this Web App URL permanently on this browser/app. To apply a new /exec URL on other phones without editing code, tap Copy Setup Link and open it once on each device.'}
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                type="submit"
                className="rounded-lg bg-[#0b2b17] dark:bg-amber-400 px-4 py-2.5 text-xs font-bold text-white dark:text-slate-950 hover:opacity-95 cursor-pointer"
              >
                Save
              </button>
              <button
                type="button"
                disabled={testing}
                onClick={handleTestConnection}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[#c9d7ce] dark:border-[#245a39] px-3.5 py-2.5 text-xs font-semibold text-[#0b2b17] dark:text-emerald-50 hover:bg-[#f2f7f3] dark:hover:bg-[#10331e] cursor-pointer disabled:opacity-50"
              >
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                {testing ? 'Testing…' : 'Test'}
              </button>
              <button
                type="button"
                disabled={syncing}
                onClick={() => onSyncNow(true)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[#c9d7ce] dark:border-[#245a39] px-3.5 py-2.5 text-xs font-semibold text-[#0b2b17] dark:text-emerald-50 hover:bg-[#f2f7f3] dark:hover:bg-[#10331e] cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} aria-hidden="true" />
                Sync Now
              </button>
              <button
                type="button"
                onClick={() => void handleCopySetupLink()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[#c9d7ce] dark:border-[#245a39] px-3.5 py-2.5 text-xs font-semibold text-[#0b2b17] dark:text-emerald-50 hover:border-amber-500 cursor-pointer"
              >
                {copiedSetupLink ? <Check className="h-4 w-4 text-emerald-600" /> : <Link2 className="h-4 w-4 text-amber-600 dark:text-amber-400" />}
                {copiedSetupLink ? 'Link Copied' : 'Copy Setup Link'}
              </button>
            </div>
          </form>

          {/* Change Cloud Sync Password Card */}
          <form
            onSubmit={handleUpdatePassword}
            className="rounded-xl border border-[#dce5df] dark:border-[#184028] bg-white dark:bg-[#0b2616] p-5 sm:p-6 space-y-3"
          >
            <div className="flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-amber-600 dark:text-amber-400" aria-hidden="true" />
              <h2 className="text-sm font-bold text-[#0b2b17] dark:text-white">
                {lang === 'mr' ? 'क्लाउड सिंक पासवर्ड बदला' : 'Cloud Sync Access Password'}
              </h2>
            </div>
            <div className="flex flex-col sm:flex-row gap-2.5">
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder={lang === 'mr' ? 'नवीन पासवर्ड टाका' : 'New password (min 4 chars)'}
                className="h-10 flex-1 rounded-lg border border-[#c9d7ce] dark:border-[#245a39] bg-[#f6f8f6] dark:bg-[#06180d] px-3 text-xs text-[#0b2b17] dark:text-white focus:border-amber-500 focus:outline-none"
              />
              <button
                type="submit"
                className="h-10 rounded-lg border border-[#c9d7ce] dark:border-[#245a39] px-4 text-xs font-bold text-[#0b2b17] dark:text-emerald-50 hover:border-amber-500 cursor-pointer whitespace-nowrap"
              >
                {lang === 'mr' ? 'पासवर्ड अपडेट' : 'Update Password'}
              </button>
            </div>
            {pinSavedMsg && (
              <div className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                {pinSavedMsg}
              </div>
            )}
          </form>
        </div>

        {/* Column 2: Short Step-by-Step Setup + Daily Backups & Storage */}
        <div className="space-y-5">
          {/* Concise Setup Steps */}
          <div className="rounded-xl border border-[#dce5df] dark:border-[#184028] bg-white dark:bg-[#0b2616] p-5 sm:p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-base font-bold text-[#0b2b17] dark:text-white">
                Setup Steps
              </h2>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCopyCode}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 dark:bg-amber-400 px-3 py-1.5 text-xs font-bold text-slate-950 hover:opacity-95 cursor-pointer"
                >
                  {copiedScript ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  {copiedScript ? 'Copied' : 'Copy Code.gs'}
                </button>
                <button
                  type="button"
                  onClick={handleDownloadCode}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[#c9d7ce] dark:border-[#245a39] px-3 py-1.5 text-xs font-semibold text-[#0b2b17] dark:text-emerald-50 hover:bg-[#f2f7f3] dark:hover:bg-[#10331e] cursor-pointer"
                >
                  <Download className="h-3.5 w-3.5" />
                  Download
                </button>
              </div>
            </div>

            <ol className="list-decimal pl-5 space-y-2 text-xs text-slate-700 dark:text-emerald-100/85 leading-relaxed">
              <li>Open Sheet → <strong>Extensions → Apps Script</strong>, paste <code className="font-mono">Code.gs</code>, and save.</li>
              <li>Run <code className="font-mono">setupLedger</code> once and allow access.</li>
              <li><strong>Project Settings → Script properties</strong> → change <code className="font-mono">UPLOAD_PIN</code> and optionally add <code className="font-mono">READ_PIN</code> to protect data on a public URL.</li>
              <li><strong>Deploy → Manage deployments → Edit → Version: New version</strong> (keeps the same <code className="font-mono">/exec</code> URL forever).</li>
            </ol>
          </div>

          {/* Backups & Local Cache with Search + Date Filter */}
          <div className="rounded-xl border border-[#dce5df] dark:border-[#184028] bg-white dark:bg-[#0b2616] p-5 sm:p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <FolderArchive className="h-5 w-5 text-emerald-700 dark:text-emerald-400" aria-hidden="true" />
                <h2 className="text-base font-bold text-[#0b2b17] dark:text-white">
                  {lang === 'mr' ? 'दैनंदिन बॅकअप व स्टोरेज' : 'Daily Upload Backups & Storage'}
                </h2>
              </div>
              <button
                type="button"
                disabled={loadingBackups}
                onClick={handleLoadBackups}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[#c9d7ce] dark:border-[#245a39] px-3 py-1.5 text-xs font-semibold text-[#0b2b17] dark:text-emerald-50 hover:bg-[#f2f7f3] dark:hover:bg-[#10331e] cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${loadingBackups ? 'animate-spin' : ''}`} aria-hidden="true" />
                {lang === 'mr' ? 'Drive बॅकअप पहा' : 'Load Drive Backups'}
              </button>
            </div>

            {/* Backup Search & Date Filter */}
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
              <div className="relative sm:col-span-7">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400 dark:text-emerald-300/60"
                  aria-hidden="true"
                />
                <input
                  type="search"
                  aria-label="Filter backups by file name or date"
                  value={backupQuery}
                  onChange={(e) => setBackupQuery(e.target.value)}
                  placeholder={lang === 'mr' ? 'फाइल नाव किंवा तारीख शोधा…' : 'Search backup filename…'}
                  className="h-9 w-full rounded-lg border border-[#c9d7ce] dark:border-[#245a39] bg-[#f6f8f6] dark:bg-[#06180d] pl-8 pr-2.5 text-xs text-[#0b2b17] dark:text-white focus:border-amber-500 focus:outline-none"
                />
              </div>
              <div className="sm:col-span-5 flex items-center gap-1.5">
                <input
                  type="date"
                  aria-label="Filter backups by upload date"
                  value={backupDate}
                  onChange={(e) => setBackupDate(e.target.value)}
                  className="h-9 flex-1 rounded-lg border border-[#c9d7ce] dark:border-[#245a39] bg-[#f6f8f6] dark:bg-[#06180d] px-2.5 text-xs text-[#0b2b17] dark:text-white dark:[color-scheme:dark] tabular-nums"
                />
                {(backupQuery || backupDate) && (
                  <button
                    type="button"
                    aria-label="Clear backup filters"
                    onClick={() => {
                      setBackupQuery('');
                      setBackupDate('');
                    }}
                    className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#c9d7ce] dark:border-[#245a39] text-slate-500 hover:text-amber-600 cursor-pointer"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/^https:\/\/(?:drive|docs)\.google\.com\//i.test(driveFolderUrl) && (
              <a
                href={driveFolderUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700 dark:text-amber-400 hover:underline"
              >
                Open Drive Backup Folder
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              </a>
            )}

            {/* Device Daily Upload Backups (Every Upload Preserved) */}
            <div className="space-y-2 border-t border-[#dce5df] dark:border-[#184028] pt-3">
              <div className="flex items-center justify-between text-xs font-bold text-[#0b2b17] dark:text-emerald-100">
                <span>
                  {lang === 'mr' ? 'डिव्हाइसवरील दैनंदिन बॅकअप' : 'Device Upload Backups'} ({filteredLocalBackups.length})
                </span>
                <span className="font-normal text-slate-500 dark:text-emerald-100/60">
                  {lang === 'mr' ? 'प्रत्येक अपलोड जतन' : 'Every upload saved'}
                </span>
              </div>

              {filteredLocalBackups.length === 0 ? (
                <div className="text-xs text-slate-500 dark:text-emerald-100/60 py-2">
                  {localBackups.length === 0
                    ? lang === 'mr'
                      ? 'अद्याप कोणतेही अपलोड बॅकअप नाहीत.'
                      : 'No upload backups recorded yet on this device.'
                    : 'No backups match your filter.'}
                </div>
              ) : (
                <ul className="divide-y divide-[#ebf1ed] dark:divide-[#143521] max-h-64 overflow-y-auto">
                  {filteredLocalBackups.map((b) => (
                    <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-xs">
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-semibold text-[#0b2b17] dark:text-emerald-50">
                          {b.fileName}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-emerald-100/65 tabular-nums">
                          {formatStamp(b.createdAt)} · {b.customerCount} ac · {b.vegRows} veg · {b.uploadedToCloud ? 'Cloud' : 'Offline'}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => onRestoreLocalBackup(b)}
                          className="inline-flex items-center gap-1 rounded-md border border-[#c9d7ce] dark:border-[#245a39] px-2 py-1 text-[11px] font-semibold text-[#0b2b17] dark:text-emerald-50 hover:border-amber-500 cursor-pointer"
                        >
                          <RotateCcw className="h-3 w-3" />
                          Restore
                        </button>
                        <button
                          type="button"
                          aria-label={`Download ${b.fileName} JSON backup`}
                          onClick={() => handleDownloadLocalBackup(b)}
                          className="inline-flex items-center justify-center rounded-md border border-[#c9d7ce] dark:border-[#245a39] p-1.5 text-slate-600 dark:text-emerald-100/80 hover:border-amber-500 cursor-pointer"
                        >
                          <Download className="h-3 w-3" />
                        </button>
                        <button
                          type="button"
                          aria-label={`Delete backup ${b.fileName}`}
                          onClick={() => onDeleteLocalBackup(b.id)}
                          className="inline-flex items-center justify-center rounded-md border border-red-200 dark:border-red-900/50 p-1.5 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 cursor-pointer"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {filteredDriveBackups.length > 0 && (
              <div className="space-y-2 border-t border-[#dce5df] dark:border-[#184028] pt-3">
                <div className="text-xs font-bold text-[#0b2b17] dark:text-emerald-100">
                  Google Drive Backups ({filteredDriveBackups.length})
                </div>
                <ul className="divide-y divide-[#ebf1ed] dark:divide-[#143521] max-h-48 overflow-y-auto">
                  {filteredDriveBackups.slice(0, 15).map((b) => (
                    <li key={b.id} className="flex items-center justify-between gap-2 py-2 text-xs">
                      <div className="min-w-0">
                        <div className="truncate font-semibold text-[#0b2b17] dark:text-emerald-50">{b.name}</div>
                        <div className="text-slate-500 dark:text-emerald-100/65">
                          {formatStamp(b.createdAt)} · {(b.sizeBytes / 1024).toFixed(1)} KB
                        </div>
                      </div>
                      {/^https:\/\/(?:drive|docs)\.google\.com\//i.test(b.url) && (
                        <a
                          href={b.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="shrink-0 font-semibold text-amber-700 dark:text-amber-400 hover:underline"
                        >
                          Open
                        </a>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#ebf1ed] dark:border-[#143521] pt-4">
              <div className="text-xs text-slate-600 dark:text-emerald-100/70">
                {lang === 'mr' ? 'डिव्हाइसवरील सध्याचा डेटा साफ करा' : 'Clear active offline ledger cache on this device'}
              </div>
              {confirmClear ? (
                <button
                  type="button"
                  onClick={() => {
                    setConfirmClear(false);
                    onClearLocalCache();
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-red-500 cursor-pointer"
                >
                  Confirm Clear
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmClear(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-red-300 dark:border-red-900/60 px-3 py-1.5 text-xs font-semibold text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 cursor-pointer"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  Clear Cache
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
