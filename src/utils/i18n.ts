import type { LanguageMode } from '../types/ledger';

interface LabelTriple {
  en: string;
  mr: string;
  both: string;
}

const DICT = {
  // Navigation
  navDashboard: { en: 'Dashboard', mr: 'डॅशबोर्ड', both: 'Dashboard' },
  navLedger: { en: 'Ledger', mr: 'खाते उतारा', both: 'Ledger' },
  navAudit: { en: 'Audit', mr: 'तपासणी (Audit)', both: 'Audit' },
  navCloud: { en: 'Cloud Sync', mr: 'क्लाउड सिंक', both: 'Cloud Sync' },
  uploadFile: { en: 'Upload File', mr: 'फाइल अपलोड', both: 'Upload File' },

  // Dashboard
  dashTitle: {
    en: 'Customer Ledger Dashboard',
    mr: 'ग्राहक खाते बूक डॅशबोर्ड',
    both: 'Customer Ledger Dashboard',
  },
  totalPendingBal: {
    en: 'Total Pending (BAL.)',
    mr: 'एकूण शिल्लक बाकी (BAL.)',
    both: 'Total Pending (BAL. बाकी)',
  },
  totalPurchaseCr: {
    en: 'Total Purchase (Cr.)',
    mr: 'एकूण खरेदी माल (Cr.)',
    both: 'Total Purchase (Cr. खरेदी)',
  },
  totalDepositedDr: {
    en: 'Total Deposited (Dr.)',
    mr: 'एकूण जमा रक्कम (Dr.)',
    both: 'Total Deposited (Dr. जमा)',
  },
  latestDayLabel: {
    en: 'Latest Day',
    mr: 'शेवटचा दिवस',
    both: 'Latest Day',
  },
  sheet1Breakdown: {
    en: 'Sheet 1 Summary Breakdown',
    mr: 'शीट १ हिशोब सारांश',
    both: 'Sheet 1 Summary Breakdown',
  },
  oldBalance: {
    en: 'Old Balance',
    mr: 'मागील बाकी',
    both: 'Old Balance (मागील बाकी)',
  },
  purchaseCr: {
    en: 'Purchase (Cr.)',
    mr: 'खरेदी (Cr.)',
    both: 'Purchase (Cr. खरेदी)',
  },
  depositedDr: {
    en: 'Deposited (Dr.)',
    mr: 'जमा (Dr.)',
    both: 'Deposited (Dr. जमा)',
  },
  pendingBal: {
    en: 'Pending (BAL.)',
    mr: 'शिल्लक बाकी (BAL.)',
    both: 'Pending (BAL. बाकी)',
  },
  topVegTitle: {
    en: 'Top Vegetables (Total Purchase)',
    mr: 'प्रमुख भाज्या (एकूण पैसे)',
    both: 'Top Vegetables (एकूण पैसे)',
  },
  searchCustomerPlaceholder: {
    en: 'Search customer, code (b41, d402), or mobile…',
    mr: 'ग्राहक नाव, कोड (b41, d402) किंवा मोबाईल शोधा…',
    both: 'Search customer / ग्राहक, code (b41), or mobile…',
  },
  allDates: { en: 'All Dates', mr: 'सर्व तारखा', both: 'All Dates' },
  fromDate: { en: 'From', mr: 'पासून', both: 'पासून (From)' },
  toDate: { en: 'To', mr: 'पर्यंत', both: 'पर्यंत (To)' },
  lastUpdatedOn: { en: 'Last Updated On', mr: 'शेवटचे अपडेट', both: 'Last Updated On' },
  dataUpToLabel: { en: 'Data Up To', mr: 'अखेरची तारीख', both: 'Data Up To' },
  updatedByLabel: { en: 'Updated By', mr: 'अपलोड केलेले', both: 'Updated By' },
  sourceLabel: { en: 'Source', mr: 'स्रोत', both: 'Source' },

  // Ledger
  vegBillTitle: {
    en: 'Vegetable-Wise Bill Detail',
    mr: 'भाजीपाला बिल तपशील (Sheet 2)',
    both: 'Vegetable-Wise Bill Detail',
  },
  totalDayPurchase: {
    en: 'Total Day Purchase',
    mr: 'आजची एकूण खरेदी (एकूण पैसे)',
    both: 'Total Day Purchase (एकूण पैसे)',
  },
  ledgerViewBtn: { en: 'Ledger View', mr: 'खाते उतारा पहा', both: 'Ledger View' },
  backToLedger: {
    en: 'Back to Account Statement',
    mr: 'खाते उताऱ्यावर परत जा',
    both: 'Back to Account Statement',
  },
  printPdf: { en: 'Print / PDF', mr: 'प्रिंट / PDF', both: 'Print / PDF' },

  // Audit
  auditTitle: {
    en: 'Reconciliation Audit',
    mr: 'हिशोब तपासणी (Audit)',
    both: 'Reconciliation Audit',
  },
  auditSubtitle: {
    en: 'Cross-checks daily Sheet 1 Purchase (Cr.) against Sheet 2 एकूण पैसे totals.',
    mr: 'शीट १ मधील दैनंदिन खरेदी (Cr.) आणि शीट २ मधील एकूण पैसे यांची तुलना.',
    both: 'Cross-checks Sheet 1 Purchase (Cr.) against Sheet 2 एकूण पैसे totals.',
  },
  billsChecked: { en: 'Bills Checked', mr: 'तपासलेली बिले', both: 'Bills Checked' },
  exactMatches: { en: 'Exact Matches', mr: 'जुळलेली बिले', both: 'Exact Matches' },
  discrepancies: { en: 'Discrepancies', mr: 'फरक आढळलेले', both: 'Discrepancies' },
  totalVariance: { en: 'Total Abs. Variance', mr: 'एकूण फरक रक्कम', both: 'Total Abs. Variance' },
  printAuditReport: { en: 'Print Audit Report', mr: 'ऑडिट रिपोर्ट प्रिंट', both: 'Print Audit Report' },

  // Cloud Sync
  cloudTitle: { en: 'Cloud Sync', mr: 'क्लाउड सिंक व बॅकअप', both: 'Cloud Sync' },
  cloudSubtitle: {
    en: 'Protected settings, setup steps, daily multi-upload backups, and theme.',
    mr: 'संरक्षित क्लाउड सेटिंग्ज, सेटअप, दैनंदिन बॅकअप व थीम.',
    both: 'Password-protected settings, setup steps, backups, and theme.',
  },
  cloudLockedTitle: {
    en: 'Cloud Sync Protected',
    mr: 'क्लाउड सिंक पासवर्ड संरक्षित आहे',
    both: 'Cloud Sync Password Protected',
  },
  cloudLockedDesc: {
    en: 'Enter Cloud Sync password to open connection settings, scripts, and backups.',
    mr: 'क्लाउड सेटिंग्ज, स्क्रिप्ट आणि बॅकअप पाहण्यासाठी पासवर्ड टाका.',
    both: 'Enter Cloud Sync password to view settings and backups.',
  },
  unlockCloudBtn: { en: 'Unlock Cloud Sync', mr: 'क्लाउड सिंक उघडा', both: 'Unlock Cloud Sync' },
} as const satisfies Record<string, LabelTriple>;

export type DictKey = keyof typeof DICT;

export function tr(key: DictKey, lang: LanguageMode): string {
  return DICT[key][lang];
}
