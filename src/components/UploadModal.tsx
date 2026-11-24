import React, { useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  CloudUpload,
  FileSpreadsheet,
  HardDrive,
  Lock,
  Upload,
  X,
} from 'lucide-react';
import type { CloudConfig, LanguageMode, LedgerDataset } from '../types/ledger';
import { computeAuditReport, dmy, money } from '../utils/ledgerMath';
import { parseUploadedFiles } from '../utils/ledgerParser';
import { isValidAppsScriptUrl, uploadLedgerToCloud } from '../utils/appsScriptApi';

interface UploadModalProps {
  open: boolean;
  onClose: () => void;
  cloudConfig: CloudConfig;
  lang: LanguageMode;
  onDatasetCommitted: (dataset: LedgerDataset, uploadedToCloud: boolean) => void;
  onUpdateOperatorName: (name: string) => void;
}

export const UploadModal: React.FC<UploadModalProps> = ({
  open,
  onClose,
  cloudConfig,
  lang,
  onDatasetCommitted,
  onUpdateOperatorName,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [parsing, setParsing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusLabel, setStatusLabel] = useState('');
  const [error, setError] = useState('');
  const [parsedDataset, setParsedDataset] = useState<LedgerDataset | null>(null);
  const [pin, setPin] = useState('');
  const [operatorName, setOperatorName] = useState(cloudConfig.operatorName || '');

  if (!open) return null;

  const resetState = () => {
    setParsing(false);
    setUploading(false);
    setIsDragging(false);
    setProgress(0);
    setStatusLabel('');
    setError('');
    setParsedDataset(null);
    setPin('');
  };

  const handleClose = () => {
    if (parsing || uploading) return;
    resetState();
    onClose();
  };

  const handleFileList = async (files: FileList | null) => {
    if (!files || !files.length) return;
    const list = Array.from(files);
    setError('');
    setParsing(true);
    setProgress(8);
    setStatusLabel('Reading file…');
    try {
      const ds = await parseUploadedFiles(list, (pct, msg) => {
        setProgress(pct);
        setStatusLabel(msg);
      });
      setParsedDataset(ds);
      setProgress(100);
      setStatusLabel('Ready');
    } catch (err) {
      setParsedDataset(null);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setParsing(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!parsing && !uploading) setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (parsing || uploading) return;
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      void handleFileList(e.dataTransfer.files);
    }
  };

  const handleSaveLocalOnly = () => {
    if (!parsedDataset) return;
    const finalDataset: LedgerDataset = {
      ...parsedDataset,
      uploadedBy: operatorName.trim() || 'Local Device',
    };
    if (operatorName.trim()) onUpdateOperatorName(operatorName.trim());
    onDatasetCommitted(finalDataset, false);
    resetState();
    onClose();
  };

  const handleUploadCloud = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!parsedDataset) return;
    if (!isValidAppsScriptUrl(cloudConfig.apiUrl)) {
      setError('Configure your Web App URL in the Cloud Sync tab first.');
      return;
    }
    if (!pin.trim()) {
      setError('Enter the Operator PIN to upload.');
      return;
    }
    setError('');
    setUploading(true);
    setProgress(5);
    setStatusLabel('Preparing fast upload…');

    try {
      const opName = operatorName.trim() || 'Operator';
      if (operatorName.trim()) onUpdateOperatorName(opName);
      const result = await uploadLedgerToCloud(
        cloudConfig.apiUrl,
        parsedDataset,
        pin.trim(),
        opName,
        (pct, msg) => {
          setProgress(pct);
          setStatusLabel(msg);
        },
      );
      const finalDataset: LedgerDataset = {
        ...parsedDataset,
        uploadId: result.uploadId,
        uploadedBy: opName,
        loadedAt: result.meta?.updatedAt || new Date().toISOString(),
        source: 'Cloud Sync',
      };
      onDatasetCommitted(finalDataset, true);
      resetState();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setUploading(false);
    }
  };

  const auditPreview = parsedDataset ? computeAuditReport(parsedDataset) : null;
  const totalBalance = parsedDataset
    ? parsedDataset.customers.reduce((sum, c) => sum + c.balance, 0)
    : 0;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="upload-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#030f08]/80 p-4 backdrop-blur-sm"
    >
      <div className="w-full max-w-xl rounded-2xl border border-[#dce5df] dark:border-[#184028] bg-white dark:bg-[#0b2616] shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between border-b border-[#dce5df] dark:border-[#184028] px-6 py-4">
          <div>
            <h2 id="upload-modal-title" className="text-lg font-bold text-[#0b2b17] dark:text-white">
              Upload Ledger File
            </h2>
            <p className="text-xs text-slate-600 dark:text-emerald-100/70 mt-0.5">
              Excel (.xlsx, .xlsm, .xls) or CSV
            </p>
          </div>
          <button
            type="button"
            aria-label="Close upload modal"
            onClick={handleClose}
            disabled={parsing || uploading}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 dark:text-emerald-200/70 hover:bg-[#edf3ee] dark:hover:bg-[#10331e] disabled:opacity-40 cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 space-y-5 max-h-[80vh] overflow-y-auto">
          {/* File Dropzone */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".xlsx,.xlsm,.xls,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
            className="hidden"
            onChange={(e) => {
              void handleFileList(e.target.files);
              e.target.value = '';
            }}
          />

          <button
            type="button"
            disabled={parsing || uploading}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`w-full rounded-xl border-2 border-dashed p-6 text-center transition-colors cursor-pointer disabled:opacity-50 ${
              isDragging
                ? 'border-amber-500 bg-amber-50/70 dark:border-amber-400 dark:bg-[#133b23]'
                : 'border-[#c9d7ce] dark:border-[#245a39] bg-[#f4f8f5] dark:bg-[#06180d] hover:border-amber-500 dark:hover:border-amber-400'
            }`}
          >
            <FileSpreadsheet className="mx-auto h-8 w-8 text-amber-600 dark:text-amber-400" aria-hidden="true" />
            <p className="mt-2.5 text-sm font-semibold text-[#0b2b17] dark:text-white">
              {isDragging
                ? 'Drop Files Here'
                : parsedDataset
                  ? 'Select Different File'
                  : 'Select or Drag & Drop Excel / CSV File'}
            </p>
          </button>

          {/* Progress Bar */}
          {(parsing || uploading) && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-medium">
                <span className="text-slate-600 dark:text-emerald-100/80">{statusLabel}</span>
                <span className="tabular-nums text-amber-700 dark:text-amber-400">{progress}%</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-[#dce5df] dark:bg-[#143521]">
                <div
                  className="h-full bg-amber-500 dark:bg-amber-400 transition-all duration-150"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          {/* Error Banner */}
          {error && (
            <div
              role="alert"
              className="flex items-start gap-2.5 rounded-xl border border-red-300 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 p-3.5 text-xs text-red-700 dark:text-red-300"
            >
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
              <span>{error}</span>
            </div>
          )}

          {/* Parsed Summary Preview */}
          {parsedDataset && !parsing && (
            <form onSubmit={handleUploadCloud} className="space-y-4">
              <div className="rounded-xl border border-[#dce5df] dark:border-[#184028] bg-[#f4f8f5] dark:bg-[#06180d] p-4 space-y-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-emerald-700 dark:text-emerald-400">
                  <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                  <span className="truncate">{parsedDataset.files?.join(', ')}</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1 text-xs tabular-nums">
                  <div>
                    <div className="text-slate-600 dark:text-emerald-100/70">Accounts</div>
                    <div className="font-bold text-[#0b2b17] dark:text-white text-sm mt-0.5">
                      {parsedDataset.customers.length.toLocaleString('en-IN')}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-600 dark:text-emerald-100/70">Days</div>
                    <div className="font-bold text-[#0b2b17] dark:text-white text-sm mt-0.5">
                      {parsedDataset.dateRows.toLocaleString('en-IN')}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-600 dark:text-emerald-100/70">Veg Items</div>
                    <div className="font-bold text-[#0b2b17] dark:text-white text-sm mt-0.5">
                      {(parsedDataset.details?.count || 0).toLocaleString('en-IN')}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-600 dark:text-emerald-100/70">Up To</div>
                    <div className="font-bold text-[#0b2b17] dark:text-white text-sm mt-0.5">
                      {dmy(parsedDataset.lastDate)}
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#dce5df] dark:border-[#184028] pt-2.5 text-xs text-slate-600 dark:text-emerald-100/75">
                  <span>
                    Net Outstanding:{' '}
                    <strong className="text-[#0b2b17] dark:text-white tabular-nums">
                      {money(totalBalance, true)}
                    </strong>
                  </span>
                  {auditPreview && auditPreview.mismatches.length > 0 && (
                    <span className="font-semibold text-amber-700 dark:text-amber-400">
                      {auditPreview.mismatches.length} mismatch{auditPreview.mismatches.length === 1 ? '' : 'es'}
                    </span>
                  )}
                </div>
                <div className="border-t border-[#dce5df] dark:border-[#184028] pt-2 text-[11px] text-emerald-700 dark:text-emerald-300/85">
                  {lang === 'mr'
                    ? 'नवीन फाइल जुना सक्रिय डेटा पुसेल आणि या अपलोडच्या सर्व नोंदी बॅकअपमध्ये जतन करेल.'
                    : lang === 'en'
                      ? 'Replaces previous active data cleanly and saves all entries into daily backup.'
                      : 'Replaces previous active data cleanly · जुना डेटा बदलून सर्व नोंदी बॅकअपमध्ये सेव्ह होतील.'}
                </div>
              </div>

              {/* Operator Name & PIN */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="block text-xs font-medium text-slate-700 dark:text-emerald-100/85">
                  Operator Name
                  <input
                    type="text"
                    value={operatorName}
                    onChange={(e) => setOperatorName(e.target.value)}
                    placeholder="e.g. Parag"
                    className="mt-1.5 w-full rounded-lg border border-[#c9d7ce] dark:border-[#245a39] bg-white dark:bg-[#06180d] px-3 py-2 text-sm text-[#0b2b17] dark:text-white focus:border-amber-500 focus:outline-none"
                  />
                </label>
                <label className="block text-xs font-medium text-slate-700 dark:text-emerald-100/85">
                  Operator PIN
                  <div className="relative mt-1.5">
                    <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-emerald-200/60" />
                    <input
                      type="password"
                      inputMode="numeric"
                      autoComplete="off"
                      value={pin}
                      onChange={(e) => setPin(e.target.value)}
                      placeholder="Enter PIN"
                      className="w-full rounded-lg border border-[#c9d7ce] dark:border-[#245a39] bg-white dark:bg-[#06180d] pl-9 pr-3 py-2 text-sm text-[#0b2b17] dark:text-white focus:border-amber-500 focus:outline-none"
                    />
                  </div>
                </label>
              </div>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  disabled={uploading}
                  onClick={handleSaveLocalOnly}
                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-[#c9d7ce] dark:border-[#245a39] bg-white dark:bg-[#06180d] px-4 py-2.5 text-sm font-semibold text-[#0b2b17] dark:text-emerald-50 hover:bg-[#f2f7f3] dark:hover:bg-[#10331e] transition-colors cursor-pointer disabled:opacity-50"
                >
                  <HardDrive className="h-4 w-4" aria-hidden="true" />
                  Save Offline
                </button>
                <button
                  type="submit"
                  disabled={uploading}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-amber-500 dark:bg-amber-400 px-4 py-2.5 text-sm font-bold text-slate-950 hover:bg-amber-400 dark:hover:bg-amber-300 transition-colors cursor-pointer disabled:opacity-50"
                >
                  <CloudUpload className="h-4 w-4" aria-hidden="true" />
                  {uploading ? 'Uploading…' : 'Upload to Cloud'}
                </button>
              </div>
            </form>
          )}

          {!parsedDataset && !parsing && (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700 dark:text-amber-400 hover:underline whitespace-nowrap cursor-pointer"
              >
                <Upload className="h-3.5 w-3.5" aria-hidden="true" />
                Browse Files
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
