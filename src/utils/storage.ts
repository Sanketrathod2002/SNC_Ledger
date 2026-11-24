import type { CloudConfig, LanguageMode, LedgerDataset, LocalBackupEntry } from '../types/ledger';

const DB_NAME = 'snc-ledger-db';
const DB_VERSION = 2;
const STORE_NAME = 'kv';
const BACKUP_STORE = 'backups';
const DATA_KEY = 'dataset';

const CONFIG_KEY = 'snc-cloud-config-v2';
const PREF_THEME = 'snc-theme-v2';
const PREF_SCALE = 'snc-scale-v2';
const PREF_VEG_INLINE = 'snc-veg-inline-v2';
const PREF_LANG = 'snc-lang-v1';
const CLOUD_LOCK_PIN_KEY = 'snc-cloud-lock-pin-v1';

export const DEFAULT_CLOUD_SYNC_PASSWORD = '2002';

const PREVIOUS_DEFAULT_APPS_SCRIPT_URL =
  'https://script.google.com/macros/s/AKfycby6hUYpPI79pfAH8y_KWBiSWiaaYI_af2uUjWEzaUnsEwcWquOmjFEG45KS8D33Edft/exec';

const ENV_APPS_SCRIPT_URL =
  typeof import.meta !== 'undefined' && import.meta.env && typeof import.meta.env.VITE_APPS_SCRIPT_URL === 'string'
    ? import.meta.env.VITE_APPS_SCRIPT_URL.trim()
    : '';

export const DEFAULT_APPS_SCRIPT_URL =
  ENV_APPS_SCRIPT_URL ||
  'https://script.google.com/macros/s/AKfycbwZyXLij6ZenFcBbw_9tc208dRa7ZTzSPT9N-4Dv67dICf_RsI1AjV36CDcfkqJTGM/exec';

export const DEFAULT_CLOUD_CONFIG: CloudConfig = {
  apiUrl: DEFAULT_APPS_SCRIPT_URL,
  readPin: '',
  operatorName: '',
  autoSyncOnStart: false,
};

function openIDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE_NAME)) {
        req.result.createObjectStore(STORE_NAME);
      }
      if (!req.result.objectStoreNames.contains(BACKUP_STORE)) {
        req.result.createObjectStore(BACKUP_STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export const ledgerDB = {
  async get(): Promise<LedgerDataset | null> {
    try {
      const db = await openIDB();
      return await new Promise((resolve) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const req = tx.objectStore(STORE_NAME).get(DATA_KEY);
        req.onsuccess = () => resolve((req.result as LedgerDataset) || null);
        req.onerror = () => resolve(null);
      });
    } catch {
      return null;
    }
  },
  async put(dataset: LedgerDataset): Promise<void> {
    try {
      const db = await openIDB();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        store.delete(DATA_KEY);
        store.put(dataset, DATA_KEY);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch {
      // Ignore storage quota / private mode failures
    }
  },
  async clear(): Promise<void> {
    try {
      const db = await openIDB();
      await new Promise<void>((resolve) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).delete(DATA_KEY);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      });
    } catch {
      // Ignore
    }
  },
};

function todayIST(): string {
  try {
    const ist = new Date(Date.now() + 5.5 * 3600 * 1000);
    return ist.toISOString().slice(0, 10);
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

export const localBackupsDB = {
  async saveSnapshot(dataset: LedgerDataset, uploadedToCloud: boolean): Promise<LocalBackupEntry | null> {
    try {
      const db = await openIDB();
      const entry: LocalBackupEntry = {
        id: `bk_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        createdAt: new Date().toISOString(),
        istDate: todayIST(),
        fileName: dataset.files?.join(' + ') || dataset.source || 'Ledger Upload',
        customerCount: dataset.customers.length,
        vegRows: dataset.details?.count || 0,
        lastDate: dataset.lastDate || '',
        uploadedToCloud,
        dataset,
      };
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(BACKUP_STORE, 'readwrite');
        tx.objectStore(BACKUP_STORE).put(entry);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      return entry;
    } catch {
      return null;
    }
  },
  async list(): Promise<LocalBackupEntry[]> {
    try {
      const db = await openIDB();
      return await new Promise((resolve) => {
        const tx = db.transaction(BACKUP_STORE, 'readonly');
        const req = tx.objectStore(BACKUP_STORE).getAll();
        req.onsuccess = () => {
          const all = ((req.result as LocalBackupEntry[]) || []).sort((a, b) =>
            b.createdAt.localeCompare(a.createdAt),
          );
          resolve(all);
        };
        req.onerror = () => resolve([]);
      });
    } catch {
      return [];
    }
  },
  async deleteEntry(id: string): Promise<void> {
    try {
      const db = await openIDB();
      await new Promise<void>((resolve) => {
        const tx = db.transaction(BACKUP_STORE, 'readwrite');
        tx.objectStore(BACKUP_STORE).delete(id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      });
    } catch {
      // Ignore
    }
  },
  async clearAll(): Promise<void> {
    try {
      const db = await openIDB();
      await new Promise<void>((resolve) => {
        const tx = db.transaction(BACKUP_STORE, 'readwrite');
        tx.objectStore(BACKUP_STORE).clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      });
    } catch {
      // Ignore
    }
  },
};

export function loadCloudConfig(): CloudConfig {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    if (!raw) return { ...DEFAULT_CLOUD_CONFIG };
    const parsed = JSON.parse(raw) as Partial<CloudConfig>;
    let resolvedUrl = typeof parsed.apiUrl === 'string' ? parsed.apiUrl.trim() : DEFAULT_APPS_SCRIPT_URL;
    if (!resolvedUrl || resolvedUrl === PREVIOUS_DEFAULT_APPS_SCRIPT_URL) {
      resolvedUrl = DEFAULT_APPS_SCRIPT_URL;
      const migrated: CloudConfig = {
        apiUrl: resolvedUrl,
        readPin: typeof parsed.readPin === 'string' ? parsed.readPin : '',
        operatorName: typeof parsed.operatorName === 'string' ? parsed.operatorName : '',
        autoSyncOnStart: Boolean(parsed.autoSyncOnStart),
      };
      saveCloudConfig(migrated);
      return migrated;
    }
    return {
      apiUrl: resolvedUrl,
      readPin: typeof parsed.readPin === 'string' ? parsed.readPin : '',
      operatorName: typeof parsed.operatorName === 'string' ? parsed.operatorName : '',
      autoSyncOnStart: Boolean(parsed.autoSyncOnStart),
    };
  } catch {
    return { ...DEFAULT_CLOUD_CONFIG };
  }
}

export function saveCloudConfig(config: CloudConfig): void {
  try {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
  } catch {
    // Ignore
  }
}

export function loadThemePref(): 'dark' | 'light' {
  try {
    const v = localStorage.getItem(PREF_THEME);
    if (v === 'light' || v === 'dark') return v;
  } catch {
    // Ignore
  }
  return 'dark';
}

export function saveThemePref(theme: 'dark' | 'light'): void {
  try {
    localStorage.setItem(PREF_THEME, theme);
  } catch {
    // Ignore
  }
}

export function loadLangPref(): LanguageMode {
  try {
    const v = localStorage.getItem(PREF_LANG);
    if (v === 'en' || v === 'mr' || v === 'both') return v;
  } catch {
    // Ignore
  }
  return 'both';
}

export function saveLangPref(lang: LanguageMode): void {
  try {
    localStorage.setItem(PREF_LANG, lang);
  } catch {
    // Ignore
  }
}

export function loadCloudSyncPassword(): string {
  try {
    const v = localStorage.getItem(CLOUD_LOCK_PIN_KEY);
    if (v && v.trim()) return v.trim();
  } catch {
    // Ignore
  }
  return DEFAULT_CLOUD_SYNC_PASSWORD;
}

export function saveCloudSyncPassword(pin: string): void {
  try {
    const clean = pin.trim();
    if (clean) localStorage.setItem(CLOUD_LOCK_PIN_KEY, clean);
  } catch {
    // Ignore
  }
}

export function loadScalePref(): number {
  try {
    const n = Number(localStorage.getItem(PREF_SCALE));
    if (Number.isFinite(n) && n >= 0.85 && n <= 1.4) return n;
  } catch {
    // Ignore
  }
  return 1;
}

export function saveScalePref(scale: number): void {
  try {
    localStorage.setItem(PREF_SCALE, String(scale));
  } catch {
    // Ignore
  }
}

export function loadVegInlinePref(): boolean {
  try {
    return localStorage.getItem(PREF_VEG_INLINE) === '1';
  } catch {
    return false;
  }
}

export function saveVegInlinePref(enabled: boolean): void {
  try {
    localStorage.setItem(PREF_VEG_INLINE, enabled ? '1' : '0');
  } catch {
    // Ignore
  }
}
