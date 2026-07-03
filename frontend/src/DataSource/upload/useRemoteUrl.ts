// URL 导入：远程 URL + 别名 + 加载状态与导入处理。
import { useState } from "react";
import type { TFunction } from "i18next";
import { toast } from "sonner";
import type { QueryClient } from "@tanstack/react-query";
import { showSuccessToast, showErrorToast, showResponseToast } from "@/utils/toastHelpers";
import { readFromUrl, type FileImportMode } from "@/api";
import { invalidateAfterFileUpload } from "@/utils/cacheInvalidation";
import { stemFromUrl } from "./uploadPathUtils";
import type { DataSourceSavedPayload } from "../UploadPanel";

export interface UseRemoteUrlParams {
  t: TFunction;
  queryClient: QueryClient;
  onDataSourceSaved?: (payload: DataSourceSavedPayload) => void;
  importMode: FileImportMode;
}

export function useRemoteUrl({
  t,
  queryClient,
  onDataSourceSaved,
  importMode,
}: UseRemoteUrlParams) {
  const [url, setUrl] = useState("");
  /** 远程 URL 专用（必填） */
  const [remoteAlias, setRemoteAlias] = useState("");
  const [urlLoading, setUrlLoading] = useState(false);

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

  const onUrlChange = (next: string) => {
    setUrl(next);
    if (next.trim() && !remoteAlias.trim()) {
      const stem = stemFromUrl(next);
      if (stem) setRemoteAlias(stem);
    }
  };

  return {
    url,
    remoteAlias,
    urlLoading,
    setRemoteAlias,
    onUrlChange,
    handleUrlImport,
  };
}
