import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
// @ts-ignore — only available in Tauri builds; falls back gracefully in web
import { open as tauriOpen } from "@tauri-apps/plugin-dialog";
// @ts-ignore — only available in Tauri builds; falls back gracefully in web
import { getCurrentWebview, type DragDropEvent } from "@tauri-apps/api/webview";
import { toast } from "sonner";
import {
  showSuccessToast,
  showErrorToast,
  showResponseToast
} from "@/utils/toastHelpers";
import { useQueryClient } from "@tanstack/react-query";
import {
  uploadFileAuto,
  readFromUrl,
  getServerMounts,
  browseServerDirectory,
  importServerFile,
  type ApiError,
  type FileImportMode,
} from "@/api";
import ExcelSheetSelector from "./ExcelSheetSelector";
import { stemFromFilename, stemFromUrl } from "./upload/uploadPathUtils";
import { LocalUploadCard } from "./upload/LocalUploadCard";
import { RemoteUrlCard } from "./upload/RemoteUrlCard";
import { ServerBrowseCard } from "./upload/ServerBrowseCard";
import { DesktopLocalCard } from "./upload/DesktopLocalCard";
import { ImportModeSelect } from "./upload/ImportModeSelect";
import { cn } from "@/lib/utils";
import { useAppConfig } from "@/hooks/useAppConfig";
import { invalidateAfterFileUpload } from "@/utils/cacheInvalidation";
import type {
  ServerFileEntry,
  ServerMount,
  CsvOptions,
} from "./upload/ServerBrowseCard";

// 类型定义
interface PendingExcel {
  file_id: string;
  original_filename: string;
  table_alias?: string | null;
  default_table_prefix?: string;
}

interface ServerExcelPending {
  path: string;
  filename: string;
  /** 表名前缀，桌面路径导入按文件名 stem；Web 服务器浏览沿用用户填写的别名 */
  alias: string;
}

const EXCEL_EXTENSIONS = new Set(["xlsx", "xls"]);

const basenameFromPath = (p: string): string => p.split(/[/\\]/).pop() || "";

const extensionOf = (filename: string): string =>
  filename.includes(".") ? filename.split(".").pop()!.toLowerCase() : "";

export interface DataSourceSavedPayload {
  id: string;
  type: string;
  name: string;
  row_count?: number;
  columns?: unknown[];
}

export interface UploadPanelProps {
  onDataSourceSaved?: (payload: DataSourceSavedPayload) => void;
}

const toServerFileEntry = (item: {
  name: string;
  path: string;
  type: string;
  extension?: string;
  supported?: boolean;
  suggested_table_name?: string;
}): ServerFileEntry => ({
  path: item.path,
  name: item.name,
  type: item.type,
  extension: item.extension ?? (item.name.includes(".") ? item.name.split(".").pop() : undefined),
  supported: item.supported,
  suggested_table_name: item.suggested_table_name ?? stemFromFilename(item.name),
});

const formatBrowseError = (err: unknown, fallback: string): string => {
  const apiErr = err as ApiError;
  return apiErr.messageCode || apiErr.code || apiErr.message || fallback;
};

/**
 * 数据源视图 A：智能文件上传（本地文件 + URL + 服务器目录）。
 * 视觉与布局参考 docs/datasource_preview.html 的 #view-file。
 *
 * Now using shadcn/ui components:
 * - Card for containers
 * - Button for all actions
 * - Input for form fields
 * - Label for field labels
 */
const UploadPanel = ({ onDataSourceSaved }: UploadPanelProps) => {
  const { t } = useTranslation("common");
  const queryClient = useQueryClient();
  const {
    maxFileSize,
    maxFileSizeDisplay,
    jsonImportColumnType,
    remoteStorageConfigured,
  } = useAppConfig();

  /** 本地上传专用；与远程/服务器别名互不影响 */
  const [uploadAlias, setUploadAlias] = useState("");
  /** 远程 URL 专用（必填） */
  const [remoteAlias, setRemoteAlias] = useState("");
  const [importMode, setImportMode] = useState<FileImportMode>("auto");
  /** 文件上传方式分段：本地 / 远程 URL / 服务器目录（一次展示一种） */
  const [uploadMethod, setUploadMethod] = useState<"local" | "url" | "server">("local");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);

  const [url, setUrl] = useState("");
  const [urlLoading, setUrlLoading] = useState(false);

  // Excel 工作表选择状态 (文件上传)
  const [pendingExcel, setPendingExcel] = useState<PendingExcel | null>(null);
  // Excel 工作表选择状态 (服务器文件 / 桌面路径导入)：队列，逐个弹 ExcelSheetSelector
  const [excelQueue, setExcelQueue] = useState<ServerExcelPending[]>([]);
  const serverExcelPending = excelQueue[0] ?? null;
  // 桌面端：Tauri OS 拖拽悬停状态（HTML5 dataTransfer 在桌面端拿不到文件，见 onDragDropEvent）
  const [desktopDragOver, setDesktopDragOver] = useState(false);

  // 服务器目录状态
  const [serverMounts, setServerMounts] = useState<ServerMount[]>([]);
  const [serverMountLoading, setServerMountLoading] = useState(false);
  const [selectedMount, setSelectedMount] = useState("");
  const [currentPath, setCurrentPath] = useState(""); // 当前浏览路径
  const [serverEntries, setServerEntries] = useState<ServerFileEntry[]>([]);
  const [serverLoading, setServerLoading] = useState(false);
  const [serverError, setServerError] = useState("");
  const [serverSelectedFile, setServerSelectedFile] =
    useState<ServerFileEntry | null>(null);
  const [serverAlias, setServerAlias] = useState("");
  const [serverImporting, setServerImporting] = useState(false);

  // CSV import options — shared between local-upload and server-browse flows
  const [localCsvOptions, setLocalCsvOptions] = useState<CsvOptions>({});
  const [serverCsvOptions, setServerCsvOptions] = useState<CsvOptions>({});

  const handleUpload = async () => {
    if (!selectedFile) {
      toast.warning(t("page.datasource.pickFileFirst"));
      return;
    }

    // 清除之前的 pendingExcel 状态（支持多次上传）
    setPendingExcel(null);

    if (selectedFile.size > maxFileSize) {
      toast.warning(
        t("page.datasource.fileTooLarge", {
          limit: maxFileSizeDisplay,
          defaultValue: `文件超过上限 ${maxFileSizeDisplay}`,
        })
      );
      return;
    }

    setUploading(true);
    setUploadProgress(0);
    try {
      const response = await uploadFileAuto(
        selectedFile,
        uploadAlias.trim() || null,
        {
          importMode,
          onProgress: (progress) => setUploadProgress(progress.percent),
          csvOptions: localCsvOptions,
        }
      );

      if (!response?.success) {
        showResponseToast(t, response, {
          errorFallback: t("page.datasource.uploadFail")
        });
        return;
      }

      // 检查是否需要工作表选择
      if (response.requires_sheet_selection && response.pending_excel) {
        setPendingExcel(response.pending_excel);
        toast.info(response.message || t("page.datasource.uploadSuccess"));
        return;
      }

      // 直接导入成功
      showSuccessToast(
        t,
        "FILE_UPLOADED",
        t("page.datasource.uploadSuccessTable", {
          table: response.file_id
        })
      );

      // 精细化缓存失效：仅刷新文件相关缓存
      await invalidateAfterFileUpload(queryClient);

      const fileId = response.file_id ?? "";
      onDataSourceSaved?.({
        id: fileId,
        type: "duckdb",
        name: t("page.datasource.duckdbTable", {
          table: fileId
        }),
        row_count: response.row_count,
        columns: response.columns || []
      });

      setSelectedFile(null);
      setUploadAlias("");
    } catch (err) {
      console.error("Upload failed:", err);
      showErrorToast(t, err as Error, t("page.datasource.uploadFail"));
    } finally {
      setUploading(false);
      setUploadProgress(null);
    }
  };

  const handleUrlImport = async () => {
    if (!url.trim()) {
      toast.warning(t("page.datasource.enterUrl"));
      return;
    }
    if (!remoteAlias.trim()) {
      toast.warning(t("page.datasource.enterRemoteAlias"));
      return;
    }
    setUrlLoading(true);
    try {
      const result = await readFromUrl(url.trim(), remoteAlias.trim(), {
        importMode,
      });
      if (result?.success) {
        showSuccessToast(
          t,
          "URL_READ_SUCCESS",
          t("page.datasource.urlReadSuccess", { table: result.table_name })
        );
        // 精细化缓存失效
        await invalidateAfterFileUpload(queryClient);
        onDataSourceSaved?.({
          id: result.table_name,
          type: "duckdb",
          name: t("page.datasource.duckdbTable", {
            table: result.table_name
          }),
          row_count: result.row_count,
          columns: result.columns || []
        });
        setUrl("");
        setRemoteAlias("");
      } else {
        showResponseToast(t, result, {
          errorFallback: t("page.datasource.urlReadFail")
        });
      }
    } catch (err) {
      showErrorToast(
        t,
        err as Error,
        t("page.datasource.urlReadFailDetail", {
          message: (err as Error)?.message || t("common.unknown")
        })
      );
    } finally {
      setUrlLoading(false);
    }
  };

  const loadServerDirectory = async (path: string) => {
    if (!path) return;
    setServerLoading(true);
    setServerError("");
    setServerSelectedFile(null);
    setCurrentPath(path); // 记录当前路径
    try {
      const data = await browseServerDirectory(path);
      setServerEntries((data?.items || []).map(toServerFileEntry));
    } catch (err) {
      setServerError(
        formatBrowseError(err, "page.datasource.serverBrowseFail")
      );
    } finally {
      setServerLoading(false);
    }
  };

  const loadServerMounts = async () => {
    setServerMountLoading(true);
    setServerError("");
    try {
      const data = await getServerMounts();
      const mounts = data?.mounts || [];
      setServerMounts(
        mounts.map((mount) => ({ path: mount.path, label: mount.label }))
      );
      if (mounts.length > 0) {
        const first = mounts[0];
        setSelectedMount(first.path);
        await loadServerDirectory(first.path);
      }
    } catch (err) {
      setServerError(
        formatBrowseError(err, "page.datasource.serverBrowseFail")
      );
    } finally {
      setServerMountLoading(false);
    }
  };

  const handleExcelImported = async (result: {
    success?: boolean;
    file_id?: string;
    table_name?: string;
    row_count?: number;
    columns?: unknown[];
    message?: string;
  }) => {
    try {
      if (!result?.success) {
        console.error("Excel import failed:", result);
        showResponseToast(t, result, {
          errorFallback: t("page.datasource.importFail")
        });
        // 保持 pendingExcel 状态，允许用户重试
        return;
      }

      // 清除 pending 状态
      setPendingExcel(null);

      // 精细化缓存失效
      await invalidateAfterFileUpload(queryClient);

      // 调用成功回调
      const tableName = result.table_name ?? result.file_id ?? "";
      onDataSourceSaved?.({
        id: tableName,
        type: "duckdb",
        name: t("page.datasource.duckdbTable", {
          table: tableName
        }),
        row_count: result.row_count,
        columns: result.columns || []
      });

      // 显示成功通知
      showSuccessToast(
        t,
        "FILE_IMPORTED",
        result.message || t("page.datasource.importSuccess")
      );

      // 重置上传状态
      setSelectedFile(null);
      setUploadAlias("");
    } catch (err) {
      console.error("Import handling failed:", err);
      showErrorToast(t, err as Error, t("page.datasource.importFail"));
    }
  };

  const handleExcelClose = () => {
    try {
      setPendingExcel(null);
    } catch (err) {
      console.error("Close handling failed:", err);
      // 即使出错也要尝试清理状态
      setPendingExcel(null);
    }
  };

  const handleServerImport = async () => {
    if (!serverSelectedFile) {
      toast.warning(t("page.datasource.pickFileFirst"));
      return;
    }

    // 检查是否是 Excel 文件，如果是则打开工作表选择器
    const ext = (serverSelectedFile.extension || "").toLowerCase();
    if (ext === "excel" || ext === "xlsx" || ext === "xls") {
      const prefix =
        serverAlias.trim() ||
        stemFromFilename(serverSelectedFile.name || "");
      if (!prefix) {
        toast.warning(t("page.datasource.enterServerAlias"));
        return;
      }
      if (!serverAlias.trim()) {
        setServerAlias(prefix);
      }
      setExcelQueue([{
        path: serverSelectedFile.path,
        filename: serverSelectedFile.name,
        alias: prefix,
      }]);
      return;
    }

    // 非 Excel 文件：直接导入
    const aliasValue =
      serverAlias ||
      serverSelectedFile.suggested_table_name ||
      serverSelectedFile.name?.replace(/\.[^/.]+$/, "") ||
      "";
    if (!aliasValue) {
      toast.warning(t("page.datasource.enterServerAlias"));
      return;
    }
    setServerImporting(true);
    try {
      const result = await importServerFile({
        path: serverSelectedFile.path,
        table_alias: aliasValue,
        import_mode: importMode,
        ...(serverCsvOptions.delimiter !== undefined && { csv_delimiter: serverCsvOptions.delimiter }),
        ...(serverCsvOptions.hasHeader !== undefined && { csv_has_header: serverCsvOptions.hasHeader }),
        ...(serverCsvOptions.encoding !== undefined && { csv_encoding: serverCsvOptions.encoding }),
      });
      if (result?.success) {
        showSuccessToast(
          t,
          "SERVER_FILE_IMPORTED",
          result?.message || t("page.datasource.importSuccess")
        );
        await invalidateAfterFileUpload(queryClient);
        const importedTable = result.table_name ?? "";
        onDataSourceSaved?.({
          id: importedTable,
          type: "duckdb",
          name: t("page.datasource.duckdbTable", {
            table: importedTable
          }),
          row_count: result.row_count,
          columns: result.columns || []
        });
        setServerSelectedFile(null);
        setServerAlias("");
      } else {
        showResponseToast(t, result, {
          errorFallback: t("page.datasource.importFail")
        });
      }
    } catch (err) {
      showErrorToast(t, err as Error, t("page.datasource.importFail"));
    } finally {
      setServerImporting(false);
    }
  };

  const handleServerExcelImported = async (result: any) => {
    try {
      if (!result?.success) {
        console.error("Server Excel import failed:", result);
        showResponseToast(t, result, {
          errorFallback: t("page.datasource.importFail")
        });
        return;
      }

      // 弹下一个队列里的 Excel（若有）
      setExcelQueue(prev => prev.slice(1));
      await invalidateAfterFileUpload(queryClient);

      // 通知成功
      const tables = result.imported_tables || [];
      if (tables.length > 0) {
        onDataSourceSaved?.({
          id: tables[0].table_name,
          type: "duckdb",
          name: t("page.datasource.duckdbTable", {
            table: tables[0].table_name
          }),
          row_count: tables[0].row_count,
          columns: tables[0].columns || []
        });
      }

      showSuccessToast(
        t,
        "EXCEL_SHEETS_IMPORTED",
        result.message || t("page.datasource.importSuccess")
      );
      setServerSelectedFile(null);
      setServerAlias("");
    } catch (err) {
      console.error("Server Excel import handling failed:", err);
      showErrorToast(t, err as Error, t("page.datasource.importFail"));
    }
  };

  const handleServerExcelClose = () => {
    // 用户取消当前 Sheet 选择：跳过它，继续弹队列里的下一个
    setExcelQueue(prev => prev.slice(1));
  };

  const isTauri = Boolean(
    (window as any).__TAURI__ || (window as any).__TAURI_INTERNALS__
  );

  /**
   * 桌面路径导入的统一入口（原生选择器 + 拖拽共用）：按扩展名分类，
   * 非 Excel 逐个直接导入；Excel 进队列，逐个弹 ExcelSheetSelector。
   * 别名一律取文件名 stem，不读 serverAlias（避免多选文件共用同一别名）。
   */
  const importDesktopPaths = async (paths: string[]) => {
    const excelItems: ServerExcelPending[] = [];
    for (const p of paths) {
      const filename = basenameFromPath(p);
      const alias = stemFromFilename(filename);
      if (!alias) continue;

      if (EXCEL_EXTENSIONS.has(extensionOf(filename))) {
        excelItems.push({ path: p, filename, alias });
        continue;
      }

      setServerImporting(true);
      try {
        const result = await importServerFile({ path: p, table_alias: alias });
        if (result?.success) {
          showSuccessToast(
            t,
            "SERVER_FILE_IMPORTED",
            result?.message || t("page.datasource.importSuccess")
          );
          await invalidateAfterFileUpload(queryClient);
          const importedTable = result.table_name ?? "";
          onDataSourceSaved?.({
            id: importedTable,
            type: "duckdb",
            name: t("page.datasource.duckdbTable", { table: importedTable }),
            row_count: result.row_count,
            columns: result.columns || [],
          });
        } else {
          showResponseToast(t, result, { errorFallback: t("page.datasource.importFail") });
        }
      } catch (err) {
        showErrorToast(t, err as Error, t("page.datasource.importFail"));
      } finally {
        setServerImporting(false);
      }
    }

    if (excelItems.length > 0) {
      setExcelQueue(prev => [...prev, ...excelItems]);
    }
  };

  const handlePickFiles = async () => {
    if (!isTauri) return;
    const files = await tauriOpen({
      multiple: true,
      filters: [{ name: "数据文件", extensions: ["csv", "tsv", "xlsx", "xls", "json", "jsonl", "parquet"] }],
    });
    if (!files) return;
    const paths = Array.isArray(files) ? files : [files];
    await importDesktopPaths(paths);
  };

  // 最新版 importDesktopPaths 存进 ref，供下面挂载一次的拖拽监听调用，避免闭包过期
  const importDesktopPathsRef = useRef(importDesktopPaths);
  importDesktopPathsRef.current = importDesktopPaths;

  useEffect(() => {
    if (!serverMounts.length && !serverMountLoading) {
      loadServerMounts();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 桌面端：Tauri v2 默认拦截 OS 拖拽（dragDropEnabled），HTML5 onDrop 拿不到真实路径，
  // 改用 webview 的 onDragDropEvent 监听，拿到路径后走与原生选择器相同的导入逻辑。
  useEffect(() => {
    if (!isTauri) return;
    let unlisten: (() => void) | undefined;
    let cancelled = false;

    getCurrentWebview()
      .onDragDropEvent((event: { payload: DragDropEvent }) => {
        if (event.payload.type === "drop") {
          setDesktopDragOver(false);
          void importDesktopPathsRef.current(event.payload.paths);
        } else if (event.payload.type === "over" || event.payload.type === "enter") {
          setDesktopDragOver(true);
        } else {
          // "leave"
          setDesktopDragOver(false);
        }
      })
      .then((un) => {
        if (cancelled) {
          un();
        } else {
          unlisten = un;
        }
      })
      .catch((err) => {
        console.error("Failed to attach Tauri drag-drop listener:", err);
      });

    return () => {
      cancelled = true;
      unlisten?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTauri]);

  return (
    <>
      {/* 顶部一行：左=上传方式分段（桌面端只有 本地/URL；Web/Docker 三段），右=紧凑的数据类型设置 */}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-lg bg-muted p-1 text-muted-foreground">
          {(
            [
              ["local", t("page.datasource.cardLocalTitle")] as const,
              ["url", t("page.datasource.cardRemoteTitle")] as const,
              ...(isTauri
                ? []
                : [["server", t("page.datasource.cardServerTitle")] as const]),
            ] satisfies Array<readonly [typeof uploadMethod, string]>
          ).map(([m, label]) => (
            <button
              key={m}
              type="button"
              onClick={() => setUploadMethod(m)}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium transition-all",
                uploadMethod === m
                  ? "bg-surface text-foreground shadow-sm"
                  : "hover:text-foreground"
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex-1" />
        <ImportModeSelect value={importMode} onChange={setImportMode} />
      </div>

      {uploadMethod === "local" && (
        isTauri ? (
          <DesktopLocalCard
            onPickFiles={handlePickFiles}
            dragOver={desktopDragOver}
            importing={serverImporting}
          />
        ) : (
          <LocalUploadCard
            maxFileSizeDisplay={maxFileSizeDisplay}
            selectedFile={selectedFile}
            uploadAlias={uploadAlias}
            uploading={uploading}
            uploadProgress={uploadProgress}
            dragOver={dragOver}
            csvOptions={localCsvOptions}
            onFileSelect={file => {
              setSelectedFile(file);
              setLocalCsvOptions({});
              if (!uploadAlias.trim()) {
                setUploadAlias(stemFromFilename(file.name));
              }
            }}
            onUploadAliasChange={setUploadAlias}
            onDragOver={setDragOver}
            onCsvOptionsChange={setLocalCsvOptions}
            onUpload={handleUpload}
            onClear={() => {
              setSelectedFile(null);
              setUploadAlias("");
              setLocalCsvOptions({});
            }}
          />
        )
      )}

      {uploadMethod === "url" && (
        <RemoteUrlCard
          url={url}
          remoteAlias={remoteAlias}
          urlLoading={urlLoading}
          remoteStorageConfigured={remoteStorageConfigured}
          jsonImportColumnType={jsonImportColumnType}
          onUrlChange={next => {
            setUrl(next);
            if (next.trim() && !remoteAlias.trim()) {
              const stem = stemFromUrl(next);
              if (stem) setRemoteAlias(stem);
            }
          }}
          onRemoteAliasChange={setRemoteAlias}
          onImport={handleUrlImport}
        />
      )}

      {uploadMethod === "server" && (
        <ServerBrowseCard
          serverMounts={serverMounts}
          serverMountLoading={serverMountLoading}
          selectedMount={selectedMount}
          currentPath={currentPath}
          serverEntries={serverEntries}
          serverLoading={serverLoading}
          serverError={serverError}
          serverSelectedFile={serverSelectedFile}
          serverAlias={serverAlias}
          serverImporting={serverImporting}
          csvOptions={serverCsvOptions}
          onMountChange={path => {
            setSelectedMount(path);
            loadServerDirectory(path);
          }}
          onBrowseDirectory={loadServerDirectory}
          onSelectFile={entry => {
            setServerSelectedFile(entry);
            setServerCsvOptions({});
          }}
          onServerAliasChange={setServerAlias}
          onCsvOptionsChange={setServerCsvOptions}
          onImport={handleServerImport}
        />
      )}

      {/* Excel 工作表选择器 (文件上传) */}
      {pendingExcel && (
        <ExcelSheetSelector
          open={true}
          pendingInfo={pendingExcel}
          onClose={handleExcelClose}
          onImported={handleExcelImported}
          sourceType="upload"
          importMode={importMode}
        />
      )}

      {/* Excel 工作表选择器 (服务器文件) */}
      {serverExcelPending && (
        <ExcelSheetSelector
          open={true}
          pendingInfo={null}
          onClose={handleServerExcelClose}
          onImported={handleServerExcelImported}
          sourceType="server"
          serverPath={serverExcelPending.path}
          importMode={importMode}
          tablePrefix={serverExcelPending.alias}
        />
      )}
    </>
  );
};

export default UploadPanel;
