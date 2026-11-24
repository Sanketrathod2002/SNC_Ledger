import React, { useState } from 'react';
import { Download, Smartphone, WifiOff, X } from 'lucide-react';
import { SHOP_INFO } from '../types/ledger';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

export const PWAInstallButton: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showGuide, setShowGuide] = useState(false);

  if (isInstalled) {
    return (
      <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
        Installed as App
      </span>
    );
  }

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={install}
        className={`inline-flex items-center justify-center gap-2 rounded-lg bg-amber-500 dark:bg-amber-400 font-bold text-slate-950 hover:bg-amber-400 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
          compact ? 'px-3 py-2 text-xs' : 'px-4 py-2.5 text-sm'
        }`}
      >
        <Download className="h-4 w-4" aria-hidden="true" />
        Install App
      </button>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setShowGuide(true)}
        className={`inline-flex items-center justify-center gap-2 rounded-lg border border-[#c9d7ce] dark:border-[#245a39] bg-white dark:bg-[#0b2616] font-semibold text-[#0b2b17] dark:text-emerald-50 hover:bg-[#f2f7f3] dark:hover:bg-[#10331e] transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
          compact ? 'px-3 py-2 text-xs' : 'px-4 py-2.5 text-sm'
        }`}
      >
        <Smartphone className="h-4 w-4" aria-hidden="true" />
        {isIOS ? 'Install on iPhone' : 'Install PWA'}
      </button>

      {showGuide && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="pwa-guide-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#030f08]/75 p-4 backdrop-blur-sm"
        >
          <div className="w-full max-w-md rounded-2xl border border-[#dce5df] dark:border-[#184028] bg-white dark:bg-[#0b2616] p-6 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <h3 id="pwa-guide-title" className="text-lg font-bold text-[#0b2b17] dark:text-white">
                Install {SHOP_INFO.shortName} Ledger
              </h3>
              <button
                type="button"
                aria-label="Close install instructions"
                onClick={() => setShowGuide(false)}
                className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 dark:text-emerald-200/70 hover:bg-[#edf3ee] dark:hover:bg-[#10331e] cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="mt-4 space-y-3 text-sm text-slate-600 dark:text-emerald-100/80 leading-relaxed">
              {isIOS ? (
                <>
                  <p>1. Open this site in <strong>Safari</strong> on iPhone or iPad.</p>
                  <p>2. Tap the <strong>Share</strong> icon in the bottom toolbar.</p>
                  <p>3. Scroll down and tap <strong>Add to Home Screen</strong>.</p>
                </>
              ) : (
                <>
                  <p>1. Open this app in <strong>Chrome</strong> or <strong>Edge</strong> on Android or Desktop.</p>
                  <p>2. Open the browser menu (<strong>⋮</strong>) and tap <strong>Install app</strong> or <strong>Add to Home screen</strong>.</p>
                  <p>3. Opens full-screen and stays accessible offline.</p>
                </>
              )}
            </div>
            <button
              type="button"
              onClick={() => setShowGuide(false)}
              className="mt-6 w-full rounded-lg bg-[#0b2b17] dark:bg-amber-400 py-2.5 text-sm font-bold text-white dark:text-slate-950 hover:opacity-95 transition-opacity cursor-pointer"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();
  if (isOnline) return null;

  return (
    <div
      role="status"
      className="no-print fixed bottom-20 md:bottom-4 left-4 z-40 flex items-center gap-2 rounded-lg border border-amber-500/40 bg-[#0b2616] px-3.5 py-2 text-xs font-medium text-amber-100 shadow-lg"
    >
      <WifiOff className="h-3.5 w-3.5 text-amber-400" aria-hidden="true" />
      <span>Offline Mode — Showing cached ledger from this device</span>
    </div>
  );
};
