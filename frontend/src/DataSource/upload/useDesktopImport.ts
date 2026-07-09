// 桌面路径导入（Tauri）：原生选择器 + onDragDropEvent 拖拽 + Excel 队列（含服务器 Excel 弹窗的队列消费）。
import { useEffect, useRef, useState } from "react";
import type { TFunction } from "i18next";
// @ts-ignore — only available in Tauri builds; falls back gracefully in web
import { open as tauriOpen } from "@tauri-apps/plugin-dialog";
// @ts-ignore — only available in Tauri builds; falls back gracefully in web
import { getCurrentWebview, type DragDropEvent } from "@tauri-apps/api/webview";
import type { QueryClient } from "@tanstack/react-query";
import { showSuccessToast, showErrorToast, showResponseToast } from "@/utils/toastHelpers";
import { importServerFile, type FileImportMode } from "@/api";
import { invalidateAfterFileUpload } from "@/utils/cacheInvalidation";
import { stemFromFilename } from "./uploadPathUtils";
import type { ServerExcelPending } from "./useServerBrowse";
import type { ServerFileEntry } from "./ServerBrowseCard";
import type { DataSourceSavedPayload } from "../UploadPanel";

const EXCEL_EXTENSIONS = new Set(["xlsx", "xls"]);

const basenameFromPath = (p: string): string => p.split(/[/\\]/).pop() || "";

const extensionOf = (filename: string): string =>
  filename.includes(".") ? filename.split(".").pop()!.toLowerCase() : "";

export interface UseDesktopImportParams {
  t: TFunction;
  queryClient: QueryClient;
  onDataSourceSaved?: (payload: DataSourceSavedPayload) => void;
  importMode: FileImportMode;
  /** 与 useServerBrowse 共用同一个「导入中」状态，避免重复状态 */
  setServerImporting: (value: boolean) => void;
  setServerSelectedFile: (entry: ServerFileEntry | null) => void;
  setServerAlias: (alias: string) => void;
}

export function useDesktopImport({
  t,
  queryClient,
  onDataSourceSaved,
  importMode,
  setServerImporting,
  setServerSelectedFile,
  setServerAlias,
}: UseDesktopImportParams) {
  // 桌面端：Tauri OS 拖拽悬停状态（HTML5 dataTransfer 在桌面端拿不到文件，见 onDragDropEvent）
  const [desktopDragOver, setDesktopDragOver] = useState(false);
  // Excel 工作表选择状态 (服务器文件 / 桌面路径导入)：队列，逐个弹 ExcelSheetSelector
  const [excelQueue, setExcelQueue] = useState<ServerExcelPending[]>([]);
  const serverExcelPending = excelQueue[0] ?? null;

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
        const result = await importServerFile({ path: p, table_alias: alias, import_mode: importMode });
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

  /** 供 useServerBrowse 在选中 Excel 文件时把它塞进同一个队列（避免复制一份 excelQueue 状态） */
  const enqueueExcel = (item: ServerExcelPending) => {
    setExcelQueue(prev => [...prev, item]);
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

  return {
    isTauri,
    desktopDragOver,
    serverExcelPending,
    enqueueExcel,
    handlePickFiles,
    handleServerExcelImported,
    handleServerExcelClose,
  };
}
