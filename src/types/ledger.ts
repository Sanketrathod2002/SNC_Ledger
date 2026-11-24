export type LedgerRow = [date: string, cr: number, dr: number];

export type VegItem = [
  date: string,
  vegName: string,
  dag: number,
  weight: number,
  rate: number,
  hamali: number,
  total: number,
];

export interface CustomerRecord {
  sn: number;
  key: string;
  name: string;
  code: string;
  mobile: string;
  opening: number;
  totalCr: number;
  totalDr: number;
  balance: number;
  lastTxDate: string;
  rows: LedgerRow[];
}

export interface DirectoryEntry {
  key: string;
  name: string;
  code: string;
  mobile: string;
  opening: number;
  totalCr: number;
  totalDr: number;
  balance: number;
  lastTxDate?: string;
}

export interface VegDetailsStore {
  map: Record<string, VegItem[]>;
  count: number;
}

export interface LedgerDataset {
  customers: CustomerRecord[];
  details: VegDetailsStore | null;
  dateRows: number;
  lastDate: string;
  loadedAt: string;
  uploadedBy: string;
  uploadId?: string;
  source: string;
  files?: string[];
  sheetsSeen?: string[];
}

export interface CloudMeta {
  updatedAt: string;
  customerCount: number;
  sheet1Rows: number;
  sheet2Rows: number;
  dataUpTo: string;
  uploadedBy: string;
  uploadId: string;
  driveFolderUrl?: string;
  driveSnapshotId?: string;
  driveBackupCount?: number;
}

export interface DriveBackupEntry {
  id: string;
  name: string;
  createdAt: string;
  sizeBytes: number;
  url: string;
}

export interface StatementLine {
  d: string;
  cr: number;
  dr: number;
  bal: number;
  particulars: string;
  vegCount: number;
  vegTotal: number;
  hasMismatch: boolean;
}

export interface StatementResult {
  open: number;
  lines: StatementLine[];
  items: Record<string, VegItem[]>;
  tCr: number;
  tDr: number;
  close: number;
  hasDet: boolean;
}

export interface AuditMismatch {
  customerKey: string;
  customerName: string;
  customerCode: string;
  date: string;
  sheet1Cr: number;
  sheet2Total: number;
  diff: number;
  itemCount: number;
}

export interface AuditReport {
  checkedDates: number;
  matchedDates: number;
  mismatches: AuditMismatch[];
  netVariance: number;
}

export interface AuditPrintPayload {
  mismatches: AuditMismatch[];
  fromDate: string;
  toDate: string;
  checkedDates: number;
  matchedDates: number;
  netVariance: number;
}

export type PeriodPreset = '7' | 'month' | 'last' | '30' | 'all' | 'custom';
export type NavTab = 'dashboard' | 'ledger' | 'audit' | 'cloud';
export type LanguageMode = 'both' | 'en' | 'mr';

export interface LocalBackupEntry {
  id: string;
  createdAt: string;
  istDate: string;
  fileName: string;
  customerCount: number;
  vegRows: number;
  lastDate: string;
  uploadedToCloud: boolean;
  dataset: LedgerDataset;
}

export interface CloudConfig {
  apiUrl: string;
  readPin: string;
  operatorName: string;
  autoSyncOnStart: boolean;
}

export const SHOP_INFO = {
  firmName: 'M/S Parag Sureshrao Chaware (HUF)',
  name: 'Suresh Namdeorao Chaware — Wholesale Vegetables Merchant',
  marathiName: 'SNC – सुरेश नामदेवराव चवरे',
  shortName: 'Parag Chaware (HUF)',
  addr: 'दुकान क्र. ०८, रामनगर कृषी उत्पन्न बाजार समिती, चंद्रपूर',
  phones: ['+91 95522 33488', '+91 99756 49575'] as const,
  phoneDisplay: '+91 95522 33488 , +91 99756 49575',
  udyamReg: 'UDYAM-MH-08-0029832',
  marathiTagline:
    'महाराष्ट्रातील चंद्रपूरच्या कृषी परिसंस्थेचा महत्त्वाचा भाग असल्याचा आम्हाला अभिमान आहे—शेतकरी, खरेदीदार आणि शहराला जोडणारा दुवा.',
  logoPath: './logo.png',
} as const;
