// 服务器目录浏览导入（Web/Docker）：挂载点/目录浏览/选中文件/别名/CSV 选项 + 导入处理。
import { useEffect, useState } from "react";
import type { TFunction } from "i18next";
import { toast } from "sonner";
import type { QueryClient } from "@tanstack/react-query";
import { showSuccessToast, showErrorToast, showResponseToast } from "@/utils/toastHelpers";
import {
  getServerMounts,
  browseServerDirectory,
  importServerFile,
  type ApiError,
  type FileImportMode,
} from "@/api";
import { invalidateAfterFileUpload } from "@/utils/cacheInvalidation";
import { stemFromFilename } from "./uploadPathUtils";
import type { ServerFileEntry, ServerMount, CsvOptions } from "./ServerBrowseCard";
import type { DataSourceSavedPayload } from "../UploadPanel";

/** 服务器文件 / 桌面路径导入共用：等待选择工作表的 Excel 文件 */
export interface ServerExcelPending {
  path: string;
  filename: string;
  /** 表名前缀，桌面路径导入按文件名 stem；Web 服务器浏览沿用用户填写的别名 */
  alias: string;
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

export interface UseServerBrowseParams {
  t: TFunction;
  queryClient: QueryClient;
  onDataSourceSaved?: (payload: DataSourceSavedPayload) => void;
  importMode: FileImportMode;
  /** 选中 Excel 文件时，交给桌面导入 hook 统一持有的队列（避免重复状态） */
  enqueueExcel: (item: ServerExcelPending) => void;
}

export function useServerBrowse({
  t,
  queryClient,
  onDataSourceSaved,
  importMode,
  enqueueExcel,
}: UseServerBrowseParams) {
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
  const [serverCsvOptions, setServerCsvOptions] = useState<CsvOptions>({});

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
      enqueueExcel({
        path: serverSelectedFile.path,
        filename: serverSelectedFile.name,
        alias: prefix,
      });
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

  useEffect(() => {
    if (!serverMounts.length && !serverMountLoading) {
      loadServerMounts();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    serverMounts,
    serverMountLoading,
    selectedMount,
    currentPath,
    serverEntries,
    serverLoading,
    serverError,
    serverSelectedFile,
    serverAlias,
    serverImporting,
    serverCsvOptions,
    setSelectedMount,
    setServerSelectedFile,
    setServerAlias,
    setServerCsvOptions,
    setServerImporting,
    loadServerDirectory,
    handleServerImport,
  };
}
