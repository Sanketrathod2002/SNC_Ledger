import React from 'react';
import { CheckCircle2, Printer, Share2, X } from 'lucide-react';
import type {
  AuditPrintPayload,
  CustomerRecord,
  LanguageMode,
  LedgerDataset,
  StatementResult,
  VegItem,
} from '../types/ledger';
import { SHOP_INFO } from '../types/ledger';
import {
  buildWhatsAppText,
  dmy,
  fmt,
  fmtFixed,
  formatStamp,
  formatStatementDay,
  formatWhatsAppUrl,
  money,
  nameOnly,
} from '../utils/ledgerMath';
import { tr } from '../utils/i18n';

interface PrintPreviewModalProps {
  open: boolean;
  onClose: () => void;
  dataset: LedgerDataset | null;
  lang?: LanguageMode;
  customer: CustomerRecord | null;
  statement: StatementResult | null;
  fromDate: string;
  toDate: string;
  includeVeg: boolean;
  vegDetailDate?: string | null;
  vegDetailItems?: VegItem[];
  auditPrint?: AuditPrintPayload | null;
}

export const PrintPreviewModal: React.FC<PrintPreviewModalProps> = ({
  open,
  onClose,
  dataset,
  lang = 'both',
  customer,
  statement,
  fromDate,
  toDate,
  includeVeg,
  vegDetailDate,
  vegDetailItems,
  auditPrint,
}) => {
  if (!open) return null;

  const isAuditReport = Boolean(auditPrint);
  const isSingleVegBill = Boolean(
    !isAuditReport && customer && vegDetailDate && vegDetailItems && vegDetailItems.length > 0,
  );
  const generatedLabel = `Printed ${formatStamp(new Date().toISOString())}`;

  const handlePrint = () => {
    window.print();
  };

  const handleWhatsAppShare = () => {
    if (!customer || !statement) return;
    const text = buildWhatsAppText(
      customer,
      statement,
      fromDate,
      toDate,
      isSingleVegBill ? vegDetailDate || undefined : undefined,
      isSingleVegBill ? vegDetailItems : undefined,
    );
    const url = formatWhatsAppUrl(customer.mobile, text);
    const link = document.createElement('a');
    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.click();
  };

  const customers = dataset?.customers || [];
  const totalAllBalance = customers.reduce((sum, c) => sum + c.balance, 0);
  const vegBillTotals = (vegDetailItems || []).reduce(
    (acc, item) => ({
      dag: acc.dag + item[2],
      weight: acc.weight + item[3],
      hamali: acc.hamali + item[5],
      total: acc.total + item[6],
    }),
    { dag: 0, weight: 0, hamali: 0, total: 0 },
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="print-preview-heading"
      className="fixed inset-0 z-50 flex flex-col bg-[#030f08]/85 backdrop-blur-sm print:static print:bg-white"
    >
      {/* Modal Action Bar (hidden during print) */}
      <div className="no-print flex items-center justify-between gap-4 border-b border-[#184028] bg-[#061a0e] px-4 py-3 text-white">
        <div className="min-w-0">
          <h2 id="print-preview-heading" className="text-sm font-bold truncate">
            {isAuditReport
              ? tr('auditTitle', lang)
              : isSingleVegBill
                ? `Vegetable Bill Preview — ${customer?.name}`
                : customer
                  ? `Statement Preview — ${customer.name}`
                  : 'All Customers Balance Sheet Preview'}
          </h2>
          <p className="text-xs text-emerald-100/70">
            Use Print / Save as PDF in the print dialog for A4 export
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {!isAuditReport && customer && statement && (
            <button
              type="button"
              onClick={handleWhatsAppShare}
              className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-600/20 px-3 py-2 text-xs font-semibold text-emerald-300 hover:bg-emerald-600/30 transition-colors whitespace-nowrap cursor-pointer"
            >
              <Share2 className="h-3.5 w-3.5" aria-hidden="true" />
              WhatsApp
            </button>
          )}
          <button
            type="button"
            onClick={handlePrint}
            className="inline-flex items-center gap-1.5 rounded-lg bg-amber-400 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-amber-300 transition-colors whitespace-nowrap cursor-pointer"
          >
            <Printer className="h-3.5 w-3.5" aria-hidden="true" />
            Print / Save PDF
          </button>
          <button
            type="button"
            aria-label="Close print preview"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-emerald-100/80 hover:bg-[#10331e] cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Scrollable A4 Sheet Container */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-8 print:overflow-visible print:p-0">
        <div className="print-sheet mx-auto max-w-[794px] rounded-xl bg-white p-6 sm:p-10 text-slate-900 shadow-2xl">
          {/* Formal Letterhead with Uploaded Logo */}
          <div className="flex flex-wrap items-start justify-between gap-4 border-b-2 border-[#0b2b17] pb-3.5 mb-4">
            <div className="flex items-start gap-3">
              <img
                src={SHOP_INFO.logoPath}
                alt={SHOP_INFO.firmName}
                className="h-14 w-14 object-contain shrink-0"
                referrerPolicy="no-referrer"
              />
              <div>
                <div className="text-base sm:text-lg font-extrabold tracking-tight text-[#0b2b17]">
                  {SHOP_INFO.firmName}
                </div>
                <div className="text-xs font-bold text-amber-800">{SHOP_INFO.name}</div>
                <div className="text-[11px] text-slate-600 mt-0.5">{SHOP_INFO.addr}</div>
                <div className="text-[11px] text-slate-600">
                  Mobile No. : {SHOP_INFO.phoneDisplay} · Udyam: {SHOP_INFO.udyamReg}
                </div>
              </div>
            </div>
            <div className="text-right">
              <div className="text-base font-bold text-[#0b2b17]">
                {isAuditReport
                  ? lang === 'mr'
                    ? 'हिशोब तपासणी अहवाल (Audit)'
                    : 'Reconciliation Audit Report'
                  : isSingleVegBill
                    ? 'भाजी बिल तपशील'
                    : customer
                      ? 'ग्राहक खाते उतारा'
                      : 'ग्राहक बाकी यादी'}
              </div>
              <div className="text-xs text-slate-600 mt-0.5">
                {isAuditReport && auditPrint
                  ? auditPrint.fromDate || auditPrint.toDate
                    ? `${auditPrint.fromDate ? dmy(auditPrint.fromDate) : 'सुरुवात'} ते ${auditPrint.toDate ? dmy(auditPrint.toDate) : dmy(dataset?.lastDate || '')}`
                    : `Data up to ${dmy(dataset?.lastDate || '')}`
                  : isSingleVegBill && vegDetailDate
                    ? formatStatementDay(vegDetailDate)
                    : customer
                      ? `${fromDate ? dmy(fromDate) : 'सुरुवात'} ते ${dmy(toDate)}`
                      : `Data up to ${dmy(dataset?.lastDate || '')}`}
              </div>
            </div>
          </div>

          {!isAuditReport && customer && (
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
              <div className="text-base font-bold text-slate-900">
                ग्राहक: {customer.name}
              </div>
              <div className="text-xs text-slate-600">
                Account: {customer.code || '—'} · Mobile: {customer.mobile || 'Not recorded'}
              </div>
            </div>
          )}

          {/* Mode 4: Reconciliation Audit Report */}
          {isAuditReport && auditPrint && (
            <div className="space-y-4">
              <div className="grid grid-cols-4 gap-2 rounded-lg border border-slate-300 bg-slate-50 p-3 text-xs tabular-nums">
                <div>
                  <div className="text-slate-500">Bills Checked</div>
                  <div className="font-bold text-slate-900 text-sm">{auditPrint.checkedDates}</div>
                </div>
                <div>
                  <div className="text-slate-500">Exact Matches</div>
                  <div className="font-bold text-emerald-700 text-sm">{auditPrint.matchedDates}</div>
                </div>
                <div>
                  <div className="text-slate-500">Discrepancies</div>
                  <div className="font-bold text-red-700 text-sm">{auditPrint.mismatches.length}</div>
                </div>
                <div>
                  <div className="text-slate-500">Net Variance</div>
                  <div className="font-bold text-amber-800 text-sm">{money(auditPrint.netVariance, true)}</div>
                </div>
              </div>

              {auditPrint.mismatches.length === 0 ? (
                <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-6 text-center text-xs text-emerald-900">
                  <CheckCircle2 className="mx-auto h-6 w-6 text-emerald-600 mb-2" />
                  <div className="font-bold">Zero discrepancies in selected report scope.</div>
                </div>
              ) : (
                <table className="w-full border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-100 text-slate-800">
                      <th className="border border-slate-300 px-2 py-2 text-left w-10">#</th>
                      <th className="border border-slate-300 px-2.5 py-2 text-left">Customer / Code</th>
                      <th className="border border-slate-300 px-2.5 py-2 text-left">Date</th>
                      <th className="border border-slate-300 px-2.5 py-2 text-right">Sheet1 Cr.</th>
                      <th className="border border-slate-300 px-2.5 py-2 text-right">Sheet2 एकूण पैसे</th>
                      <th className="border border-slate-300 px-2.5 py-2 text-right">Variance</th>
                    </tr>
                  </thead>
                  <tbody className="tabular-nums">
                    {auditPrint.mismatches.map((m, idx) => (
                      <tr key={`${m.customerKey}-${m.date}`}>
                        <td className="border border-slate-200 px-2 py-1.5 text-slate-500">{idx + 1}</td>
                        <td className="border border-slate-200 px-2.5 py-1.5 font-medium">
                          {nameOnly(m.customerName)} ({m.customerCode || '—'}) · {m.itemCount} items
                        </td>
                        <td className="border border-slate-200 px-2.5 py-1.5 whitespace-nowrap">{dmy(m.date)}</td>
                        <td className="border border-slate-200 px-2.5 py-1.5 text-right">{fmtFixed(m.sheet1Cr)}</td>
                        <td className="border border-slate-200 px-2.5 py-1.5 text-right">{fmtFixed(m.sheet2Total)}</td>
                        <td className="border border-slate-200 px-2.5 py-1.5 text-right font-bold text-red-700">
                          {m.diff > 0 ? `+${fmtFixed(m.diff)}` : fmtFixed(m.diff)}
                        </td>
                      </tr>
                    ))}
                    <tr className="bg-slate-100 font-bold">
                      <td colSpan={5} className="border border-slate-300 px-2.5 py-2 text-left">
                        Total Absolute Variance ({auditPrint.mismatches.length} records)
                      </td>
                      <td className="border border-slate-300 px-2.5 py-2 text-right text-red-700">
                        {money(auditPrint.netVariance, true)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* Mode 1: Single Date Vegetable Bill */}
          {!isAuditReport && isSingleVegBill && vegDetailItems && (
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="bg-slate-100 text-slate-800">
                  <th className="border border-slate-300 px-2.5 py-2 text-left">भाजी (Item)</th>
                  <th className="border border-slate-300 px-2.5 py-2 text-right">वजन</th>
                  <th className="border border-slate-300 px-2.5 py-2 text-right">डाग</th>
                  <th className="border border-slate-300 px-2.5 py-2 text-right">भाव</th>
                  <th className="border border-slate-300 px-2.5 py-2 text-right">हमाली</th>
                  <th className="border border-slate-300 px-2.5 py-2 text-right">एकूण पैसे</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {vegDetailItems.map((item, idx) => (
                  <tr key={`${item[0]}-${item[1]}-${idx}`}>
                    <td className="border border-slate-200 px-2.5 py-1.5 text-left font-medium">{item[1]}</td>
                    <td className="border border-slate-200 px-2.5 py-1.5 text-right">{fmt(item[3])}</td>
                    <td className="border border-slate-200 px-2.5 py-1.5 text-right">{fmt(item[2])}</td>
                    <td className="border border-slate-200 px-2.5 py-1.5 text-right">{fmt(item[4])}</td>
                    <td className="border border-slate-200 px-2.5 py-1.5 text-right">{fmt(item[5])}</td>
                    <td className="border border-slate-200 px-2.5 py-1.5 text-right font-semibold">{fmt(item[6])}</td>
                  </tr>
                ))}
                <tr className="bg-slate-100 font-bold">
                  <td className="border border-slate-300 px-2.5 py-2 text-left">एकूण पैसे (Total Purchase)</td>
                  <td className="border border-slate-300 px-2.5 py-2 text-right">{fmt(vegBillTotals.weight)}</td>
                  <td className="border border-slate-300 px-2.5 py-2 text-right">{fmt(vegBillTotals.dag)}</td>
                  <td className="border border-slate-300 px-2.5 py-2 text-right"></td>
                  <td className="border border-slate-300 px-2.5 py-2 text-right">{fmt(vegBillTotals.hamali)}</td>
                  <td className="border border-slate-300 px-2.5 py-2 text-right">{money(vegBillTotals.total, true)}</td>
                </tr>
              </tbody>
            </table>
          )}

          {/* Mode 2: Customer Account Statement */}
          {!isAuditReport && !isSingleVegBill && customer && statement && (
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="bg-slate-100 text-slate-800">
                  <th className="border border-slate-300 px-2.5 py-2 text-left">तारीख (Date)</th>
                  <th className="border border-slate-300 px-2.5 py-2 text-right">Purchase (Cr.)</th>
                  <th className="border border-slate-300 px-2.5 py-2 text-right">Deposited (Dr.)</th>
                  <th className="border border-slate-300 px-2.5 py-2 text-right">Pending (BAL.)</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                <tr className="bg-slate-50 font-bold">
                  <td className="border border-slate-200 px-2.5 py-1.5 text-left">Old Balance (मागील बाकी)</td>
                  <td className="border border-slate-200 px-2.5 py-1.5"></td>
                  <td className="border border-slate-200 px-2.5 py-1.5"></td>
                  <td className="border border-slate-200 px-2.5 py-1.5 text-right">{fmt(statement.open)}</td>
                </tr>
                {statement.lines.map((line) => (
                  <React.Fragment key={line.d}>
                    <tr>
                      <td className="border border-slate-200 px-2.5 py-1.5 text-left font-medium">{dmy(line.d)}</td>
                      <td className="border border-slate-200 px-2.5 py-1.5 text-right">{line.cr ? fmt(line.cr) : ''}</td>
                      <td className="border border-slate-200 px-2.5 py-1.5 text-right">{line.dr ? fmt(line.dr) : ''}</td>
                      <td className="border border-slate-200 px-2.5 py-1.5 text-right font-semibold">{fmt(line.bal)}</td>
                    </tr>
                    {includeVeg && statement.items[line.d] &&
                      statement.items[line.d].map((item, idx) => (
                        <tr key={`${line.d}-v-${idx}`} className="bg-slate-50/70 text-[11px] text-slate-600">
                          <td className="border border-slate-200 pl-6 pr-2 py-1 text-left">{item[1]}</td>
                          <td colSpan={2} className="border border-slate-200 px-2 py-1 text-right">
                            वजन {fmt(item[3])} · डाग {fmt(item[2])} · भाव {fmt(item[4])} · हमाली {fmt(item[5])}
                          </td>
                          <td className="border border-slate-200 px-2 py-1 text-right">{fmt(item[6])}</td>
                        </tr>
                      ))}
                  </React.Fragment>
                ))}
                <tr className="bg-slate-100 font-bold">
                  <td className="border border-slate-300 px-2.5 py-2 text-left">एकूण / शिल्लक बाकी</td>
                  <td className="border border-slate-300 px-2.5 py-2 text-right">{fmt(statement.tCr)}</td>
                  <td className="border border-slate-300 px-2.5 py-2 text-right">{fmt(statement.tDr)}</td>
                  <td className="border border-slate-300 px-2.5 py-2 text-right">{fmt(statement.close)}</td>
                </tr>
              </tbody>
            </table>
          )}

          {/* Mode 3: All Customers Balance Sheet */}
          {!isAuditReport && !customer && (
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="bg-slate-100 text-slate-800">
                  <th className="border border-slate-300 px-2.5 py-2 text-left w-12">क्र.</th>
                  <th className="border border-slate-300 px-2.5 py-2 text-left">ग्राहक (Customer)</th>
                  <th className="border border-slate-300 px-2.5 py-2 text-right">शेवटची नोंद</th>
                  <th className="border border-slate-300 px-2.5 py-2 text-right">बाकी (Balance)</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {customers.map((c, idx) => (
                  <tr key={c.key}>
                    <td className="border border-slate-200 px-2.5 py-1.5 text-left text-slate-500">{idx + 1}</td>
                    <td className="border border-slate-200 px-2.5 py-1.5 text-left font-medium">{c.name}</td>
                    <td className="border border-slate-200 px-2.5 py-1.5 text-right text-slate-600">
                      {c.lastTxDate ? dmy(c.lastTxDate) : '—'}
                    </td>
                    <td className="border border-slate-200 px-2.5 py-1.5 text-right font-semibold">{fmt(c.balance)}</td>
                  </tr>
                ))}
                <tr className="bg-slate-100 font-bold">
                  <td colSpan={3} className="border border-slate-300 px-2.5 py-2 text-left">
                    एकूण ({customers.length} ग्राहक)
                  </td>
                  <td className="border border-slate-300 px-2.5 py-2 text-right">{money(totalAllBalance, true)}</td>
                </tr>
              </tbody>
            </table>
          )}

          {/* Footer */}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-2.5 text-[11px] text-slate-600">
            <span>
              {isAuditReport && auditPrint
                ? `Discrepancies Printed: ${auditPrint.mismatches.length}`
                : customer && statement
                  ? `शिल्लक बाकी: ${money(statement.close, true)}`
                  : `एकूण येणे बाकी: ${money(totalAllBalance, true)}`}
            </span>
            <span>{generatedLabel}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
