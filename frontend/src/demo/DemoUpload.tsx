import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { UploadCloud, Loader2 } from 'lucide-react';
import { invalidateDuckDBTables } from '@/hooks/useDuckDBTables';
import { showErrorToast, showSuccessToast } from '@/utils/toastHelpers';

/**
 * Demo 文件导入:把本地 CSV/TSV/Parquet/JSON 读进浏览器内 DuckDB-Wasm(不上传服务器),
 * 建表后刷新侧栏并跳到查询工作台。仅 Demo 模式渲染。
 */
export function DemoUpload({ onLoaded }: { onLoaded?: () => void }) {
  const { t } = useTranslation('common');
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const handleFiles = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0 || busy) return;
      setBusy(true);
      try {
        const { registerFile } = await import('@/demo/wasmEngine');
        for (const f of Array.from(files)) {
          const { table, rows } = await registerFile(f);
          showSuccessToast(
            t,
            'DEMO_FILE_LOADED',
            t('demo.uploadOk', '已载入 {{table}}({{rows}} 行)', { table, rows }),
          );
        }
        invalidateDuckDBTables(qc);
        onLoaded?.();
      } catch (e) {
        showErrorToast(t, e as Error, t('demo.uploadFail', '文件解析失败'));
      } finally {
        setBusy(false);
      }
    },
    [busy, qc, t, onLoaded],
  );

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => !busy && inputRef.current?.click()}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && !busy && inputRef.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        handleFiles(e.dataTransfer.files);
      }}
      className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors ${
        dragOver ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'
      } ${busy ? 'pointer-events-none opacity-70' : ''}`}
    >
      <input
        ref={inputRef}
        type="file"
        multiple
        accept=".csv,.tsv,.txt,.parquet,.json,.ndjson"
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
      {busy ? (
        <Loader2 className="mb-2 h-7 w-7 animate-spin text-primary" />
      ) : (
        <UploadCloud className="mb-2 h-7 w-7 text-primary" />
      )}
      <div className="text-sm font-medium text-foreground">
        {busy ? t('demo.uploading', '正在浏览器内解析…') : t('demo.uploadTitle', '拖文件到这里,或点击选择')}
      </div>
      <div className="mt-1 text-xs text-muted-foreground">
        {t('demo.uploadHint', 'CSV / TSV / Parquet / JSON · 在你浏览器内解析,不上传服务器')}
      </div>
    </div>
  );
}
