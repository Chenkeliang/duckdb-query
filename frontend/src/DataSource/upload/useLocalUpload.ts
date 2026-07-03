// 本地 HTTP 上传（Web）：文件选择 / 别名 / 上传进度 / CSV 选项 + 上传态 Excel 弹窗状态。
import { useState } from "react";
import type { TFunction } from "i18next";
import { toast } from "sonner";
import type { QueryClient } from "@tanstack/react-query";
import { showSuccessToast, showErrorToast, showResponseToast } from "@/utils/toastHelpers";
import { uploadFileAuto, type FileImportMode } from "@/api";
import { invalidateAfterFileUpload } from "@/utils/cacheInvalidation";
import { stemFromFilename } from "./uploadPathUtils";
import type { CsvOptions } from "./ServerBrowseCard";
import type { DataSourceSavedPayload } from "../UploadPanel";

export interface PendingExcel {
  file_id: string;
  original_filename: string;
  table_alias?: string | null;
  default_table_prefix?: string;
}

export interface UseLocalUploadParams {
  t: TFunction;
  queryClient: QueryClient;
  onDataSourceSaved?: (payload: DataSourceSavedPayload) => void;
  importMode: FileImportMode;
  maxFileSize: number;
  maxFileSizeDisplay: string;
}

export function useLocalUpload({
  t,
  queryClient,
  onDataSourceSaved,
  importMode,
  maxFileSize,
  maxFileSizeDisplay,
}: UseLocalUploadParams) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  /** 本地上传专用；与远程/服务器别名互不影响 */
  const [uploadAlias, setUploadAlias] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [localCsvOptions, setLocalCsvOptions] = useState<CsvOptions>({});
  // Excel 工作表选择状态 (文件上传)
  const [pendingExcel, setPendingExcel] = useState<PendingExcel | null>(null);

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

  const onFileSelect = (file: File) => {
    setSelectedFile(file);
    setLocalCsvOptions({});
    if (!uploadAlias.trim()) {
      setUploadAlias(stemFromFilename(file.name));
    }
  };

  const onClear = () => {
    setSelectedFile(null);
    setUploadAlias("");
    setLocalCsvOptions({});
  };

  return {
    selectedFile,
    uploadAlias,
    dragOver,
    uploading,
    uploadProgress,
    localCsvOptions,
    pendingExcel,
    setUploadAlias,
    setDragOver,
    setLocalCsvOptions,
    handleUpload,
    handleExcelImported,
    handleExcelClose,
    onFileSelect,
    onClear,
  };
}
