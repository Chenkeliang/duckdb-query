import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Upload, FileType, Link2, Server, HardDrive } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  uploadFile,
  readFromUrl,
  getServerMounts,
  browseServerDirectory,
  importServerFile
} from '@/api';
import ExcelSheetSelector from "./ExcelSheetSelector";
import { Card, CardContent } from "@/new/components/ui/card";
import { Button } from "@/new/components/ui/button";
import { Input } from "@/new/components/ui/input";
import { Label } from "@/new/components/ui/label";
import { useAppConfig } from "@/new/hooks/useAppConfig";
import { invalidateAfterFileUpload } from "@/new/utils/cacheInvalidation";

// 类型定义
interface PendingExcel {
  file_id: string;
  original_filename: string;
}

interface ServerExcelPending {
  path: string;
  filename: string;
}

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
const UploadPanel = ({ onDataSourceSaved }) => {
  const { t } = useTranslation("common");
  const queryClient = useQueryClient();
  const fileInputRef = useRef(null);
  const { maxFileSizeDisplay } = useAppConfig();

  const [alias, setAlias] = useState("");
  const [selectedFile, setSelectedFile] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [url, setUrl] = useState("");
  const [urlLoading, setUrlLoading] = useState(false);

  // Excel 工作表选择状态 (文件上传)
  const [pendingExcel, setPendingExcel] = useState<PendingExcel | null>(null);
  // Excel 工作表选择状态 (服务器文件)
  const [serverExcelPending, setServerExcelPending] = useState<ServerExcelPending | null>(null);

  // 服务器目录状态
  const [serverMounts, setServerMounts] = useState([]);
  const [serverMountLoading, setServerMountLoading] = useState(false);
  const [selectedMount, setSelectedMount] = useState("");
  const [currentPath, setCurrentPath] = useState(""); // 当前浏览路径
  const [serverEntries, setServerEntries] = useState([]);
  const [serverLoading, setServerLoading] = useState(false);
  const [serverError, setServerError] = useState("");
  const [serverSelectedFile, setServerSelectedFile] = useState(null);
  const [serverAlias, setServerAlias] = useState("");
  const [serverImporting, setServerImporting] = useState(false);


  const handleDrop = e => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    const file = e.dataTransfer?.files?.[0];
    if (file) {
      setSelectedFile(file);
      if (!alias) {
        setAlias(file.name.replace(/\.[^/.]+$/, ""));
      }
    }
  };

  const handleFileChange = e => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      if (!alias) {
        setAlias(file.name.replace(/\.[^/.]+$/, ""));
      }
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      toast.warning(t("page.datasource.pickFileFirst"));
      return;
    }

    // 清除之前的 pendingExcel 状态（支持多次上传）
    setPendingExcel(null);

    setUploading(true);
    try {
      const response = await uploadFile(selectedFile, alias || null);

      if (!response?.success) {
        toast.error(response?.message || t("page.datasource.uploadFail"));
        return;
      }

      // 检查是否需要工作表选择
      if (response.requires_sheet_selection && response.pending_excel) {
        setPendingExcel(response.pending_excel);
        toast.info(response.message || t("page.datasource.uploadSuccess"));
        return;
      }

      // 直接导入成功
      toast.success(
        t("page.datasource.uploadSuccessTable", {
          table: response.file_id
        })
      );

      // 精细化缓存失效：仅刷新文件相关缓存
      await invalidateAfterFileUpload(queryClient);

      onDataSourceSaved?.({
        id: response.file_id,
        type: "duckdb",
        name: t("page.datasource.duckdbTable", {
          table: response.file_id
        }),
        row_count: response.row_count,
        columns: response.columns || []
      });

      setSelectedFile(null);
      setAlias("");
    } catch (err) {
      console.error("Upload failed:", err);
      toast.error(err?.message || t("page.datasource.uploadFail"));
    } finally {
      setUploading(false);
    }
  };

  const handleUrlImport = async () => {
    if (!url.trim()) {
      toast.warning(t("page.datasource.enterUrl"));
      return;
    }
    if (!alias.trim()) {
      toast.warning(t("page.datasource.enterAlias"));
      return;
    }
    setUrlLoading(true);
    try {
      const result = await readFromUrl(url.trim(), alias.trim());
      if (result?.success) {
        toast.success(
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
      } else {
        toast.error(result?.message || t("page.datasource.urlReadFail"));
      }
    } catch (err) {
      toast.error(
        t("page.datasource.urlReadFailDetail", {
          message: err?.message || t("common.unknown")
        })
      );
    } finally {
      setUrlLoading(false);
    }
  };

  const loadServerDirectory = async path => {
    if (!path) return;
    setServerLoading(true);
    setServerError("");
    setServerSelectedFile(null);
    setServerAlias("");
    setCurrentPath(path); // 记录当前路径
    try {
      const data = await browseServerDirectory(path);
      setServerEntries(data?.entries || []);
    } catch (err) {
      setServerError(err?.message || t("page.datasource.serverBrowseFail"));
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
      setServerMounts(mounts);
      if (mounts.length > 0) {
        const first = mounts[0];
        setSelectedMount(first.path);
        await loadServerDirectory(first.path);
      }
    } catch (err) {
      setServerError(err?.message || t("page.datasource.serverBrowseFail"));
    } finally {
      setServerMountLoading(false);
    }
  };

  const handleExcelImported = async (result) => {
    try {
      if (!result?.success) {
        console.error("Excel import failed:", result);
        toast.error(result?.message || t("page.datasource.importFail"));
        // 保持 pendingExcel 状态，允许用户重试
        return;
      }

      // 清除 pending 状态
      setPendingExcel(null);

      // 精细化缓存失效
      await invalidateAfterFileUpload(queryClient);

      // 调用成功回调
      onDataSourceSaved?.({
        id: result.table_name,
        type: "duckdb",
        name: t("page.datasource.duckdbTable", {
          table: result.table_name
        }),
        row_count: result.row_count,
        columns: result.columns || []
      });

      // 显示成功通知
      toast.success(
        result.message || t("page.datasource.importSuccess")
      );

      // 重置上传状态
      setSelectedFile(null);
      setAlias("");
    } catch (err) {
      console.error("Import handling failed:", err);
      toast.error(err?.message || t("page.datasource.importFail"));
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
      setServerExcelPending({
        path: serverSelectedFile.path,
        filename: serverSelectedFile.name,
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
      toast.warning(t("page.datasource.enterAlias"));
      return;
    }
    setServerImporting(true);
    try {
      const result = await importServerFile({
        path: serverSelectedFile.path,
        table_alias: aliasValue
      });
      if (result?.success) {
        toast.success(
          result?.message || t("page.datasource.importSuccess")
        );
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
        setServerSelectedFile(null);
        setServerAlias("");
      } else {
        toast.error(result?.message || t("page.datasource.importFail"));
      }
    } catch (err) {
      toast.error(err?.message || t("page.datasource.importFail"));
    } finally {
      setServerImporting(false);
    }
  };

  const handleServerExcelImported = async (result: any) => {
    try {
      if (!result?.success) {
        console.error("Server Excel import failed:", result);
        toast.error(result?.message || t("page.datasource.importFail"));
        return;
      }

      setServerExcelPending(null);
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

      toast.success(result.message || t("page.datasource.importSuccess"));
      setServerSelectedFile(null);
      setServerAlias("");
    } catch (err) {
      console.error("Server Excel import handling failed:", err);
      toast.error(err?.message || t("page.datasource.importFail"));
    }
  };

  const handleServerExcelClose = () => {
    setServerExcelPending(null);
  };

  useEffect(() => {
    if (!serverMounts.length && !serverMountLoading) {
      loadServerMounts();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* 左侧：智能文件上传主卡片 */}
        <Card className="shadow-sm">
          <CardContent className="p-6 space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-fg">
                  {t("page.datasource.tabLocal")}
                </p>
                <h3 className="text-lg font-semibold text-foreground">
                  {t("page.datasource.cardLocalTitle")}
                </h3>
              </div>
              <span className="text-xs text-muted-fg">
                {t("page.datasource.localTipsFormats")}
              </span>
            </div>

            <div
              onDragOver={e => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`cursor-pointer rounded-xl border border-dashed px-6 py-10 text-center transition-colors flex flex-col items-center justify-center gap-2 ${dragOver
                ? "border-primary bg-surface-hover"
                : "border-border bg-surface hover:border-primary"
                }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                onChange={handleFileChange}
                accept=".csv,.xlsx,.xls,.json,.parquet,.pq"
              />
              <Upload className="h-8 w-8 text-muted-fg" />
              <p className="text-foreground font-medium text-sm">
                {t("page.datasource.dragHere")}
              </p>
              <p className="text-xs text-muted-fg">
                {t("page.datasource.maxSizeTemplate", { size: maxFileSizeDisplay })}
              </p>
              {selectedFile ? (
                <p className="mt-1 text-xs text-muted-fg">
                  {t("page.datasource.selectedFile")}: {selectedFile.name}
                </p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="upload-alias">
                {t("page.datasource.aliasLabel")}
              </Label>
              <Input
                id="upload-alias"
                value={alias}
                onChange={e => setAlias(e.target.value)}
                placeholder={t("page.datasource.aliasPlaceholder")}
              />
            </div>

            <div className="flex flex-wrap gap-3">
              <Button
                onClick={handleUpload}
                disabled={uploading || !selectedFile}
              >
                {uploading
                  ? t("page.datasource.connection.saving")
                  : t("page.datasource.btnStartUpload")}
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setSelectedFile(null);
                  setAlias("");
                }}
              >
                {t("page.datasource.paste.btnClear")}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* 右侧：URL 拉取 + 服务器目录导入卡片 */}
        <div className="flex flex-col gap-6">
          {/* URL 拉取 */}
          <Card className="shadow-sm">
            <CardContent className="p-6 space-y-4">
              <div>
                <p className="text-sm text-muted-fg">
                  {t("page.datasource.cardRemoteTitle")}
                </p>
                <h3 className="text-lg font-semibold text-foreground">
                  {t("page.datasource.cardRemoteDesc")}
                </h3>
              </div>

              <div className="space-y-2">
                <Label htmlFor="remote-url" className="flex items-center gap-2">
                  <Link2 className="h-4 w-4" />
                  {t("page.datasource.remoteUrlLabel")}
                </Label>
                <Input
                  id="remote-url"
                  value={url}
                  onChange={e => setUrl(e.target.value)}
                  placeholder="https://example.com/data.csv"
                />
                <p className="text-[11px] text-muted-foreground">
                  {t("page.datasource.remoteUrlHelper")}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="remote-alias" className="flex items-center gap-2">
                  <FileType className="h-4 w-4" />
                  {t("page.datasource.remoteAliasLabel")}
                </Label>
                <Input
                  id="remote-alias"
                  value={alias}
                  onChange={e => setAlias(e.target.value)}
                  placeholder={t("page.datasource.remoteAliasPlaceholder")}
                />
              </div>

              <div className="flex gap-3">
                <Button
                  onClick={handleUrlImport}
                  disabled={urlLoading || !url.trim()}
                >
                  {urlLoading
                    ? t("page.datasource.connection.testing")
                    : t("page.datasource.btnReadRemote")}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* 服务器目录导入 */}
          <Card className="shadow-sm">
            <CardContent className="p-6 space-y-4">
              <div>
                <p className="text-sm text-muted-fg">
                  {t("page.datasource.cardServerTitle")}
                </p>
                <h3 className="text-lg font-semibold text-foreground">
                  {t("page.datasource.cardServerDesc")}
                </h3>
              </div>

              <div className="space-y-2">
                <label className="text-xs text-muted-fg flex items-center gap-2">
                  <HardDrive className="h-4 w-4 text-muted-fg" />
                  {t("page.datasource.serverSelectMount")}
                </label>
                {serverMountLoading ? (
                  <div className="text-xs text-muted-fg">
                    {t("actions.loading")}
                  </div>
                ) : serverMounts.length === 0 ? (
                  <div className="space-y-2 text-xs text-muted-fg">
                    <div>{t("page.datasource.serverNoMount")}</div>
                    <div>{t("page.datasource.serverMountAlert")}</div>
                  </div>
                ) : (
                  <select
                    className="h-9 w-full rounded-md border border-border bg-input px-2 text-sm text-foreground"
                    value={selectedMount}
                    onChange={e => {
                      const path = e.target.value;
                      setSelectedMount(path);
                      loadServerDirectory(path);
                    }}
                  >
                    {serverMounts.map(m => (
                      <option key={m.path} value={m.path}>
                        {m.label || m.path}
                      </option>
                    ))}
                  </select>
                )}
                {serverError ? (
                  <div className="text-xs text-error">{serverError}</div>
                ) : null}
              </div>

              <div className="rounded-lg border border-border bg-surface max-h-48 overflow-auto space-y-1 text-sm">
                {serverLoading ? (
                  <div className="px-3 py-2 text-xs text-muted-fg">
                    {t("actions.loading")}
                  </div>
                ) : serverEntries.length === 0 ? (
                  <div className="px-3 py-2 text-xs text-muted-fg">
                    {t("page.datasource.serverNoFiles")}
                  </div>
                ) : (
                  <>
                    {/* 返回上一级按钮 */}
                    {currentPath && currentPath !== selectedMount && (
                      <button
                        type="button"
                        onClick={() => {
                          // 计算父目录路径
                          const parentPath = currentPath.split('/').slice(0, -1).join('/') || selectedMount;
                          loadServerDirectory(parentPath);
                        }}
                        className="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-left cursor-pointer hover:bg-surface-hover border-b border-border"
                      >
                        <span className="text-xs text-primary font-medium">← {t("page.datasource.serverGoBack", "返回上一级")}</span>
                      </button>
                    )}

                    {serverEntries
                      .filter(entry => {
                        // 显示所有目录
                        if (entry.type === "directory") return true;
                        // 只显示支持的文件类型
                        // 后端返回的 extension 是映射后的类型：excel, csv, json, parquet 等
                        const ext = (entry.extension || "").toLowerCase();
                        const supportedTypes = ["csv", "excel", "json", "jsonl", "parquet"];
                        return supportedTypes.includes(ext);
                      })
                      .map(entry => {
                        const selected = serverSelectedFile?.path === entry.path;
                        const isDir = entry.type === "directory";
                        return (
                          <button
                            key={entry.path}
                            type="button"
                            onClick={() => {
                              console.log("File clicked:", entry.name, "isDir:", isDir, "extension:", entry.extension);
                              if (isDir) {
                                loadServerDirectory(entry.path);
                              } else {
                                setServerSelectedFile(entry);
                                if (!serverAlias) {
                                  setServerAlias(entry.name.replace(/\.[^/.]+$/, ""));
                                }
                              }
                            }}
                            className={`flex w-full items-center justify-between rounded-md px-3 py-1.5 text-left cursor-pointer ${selected ? "bg-surface-hover" : "hover:bg-surface-hover"
                              }`}
                          >
                            <span className="flex items-center gap-2 text-xs text-foreground">
                              <Server className="h-3 w-3 text-muted-fg" />
                              {entry.name}
                            </span>
                            <span className="text-[10px] text-muted-fg">
                              {isDir
                                ? t("page.datasource.serverTypeFolder")
                                : (entry.extension || "").toUpperCase()}
                            </span>
                          </button>
                        );
                      })}
                  </>
                )}
              </div>

              {/* 显示选中的文件 */}
              {serverSelectedFile && (
                <div className="rounded-lg border border-primary/50 bg-primary/5 p-3">
                  <div className="text-xs font-medium text-foreground mb-1">
                    {t("page.datasource.selectedFile", "已选择文件")}:
                  </div>
                  <div className="text-sm text-foreground font-medium">
                    {serverSelectedFile.name}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {(serverSelectedFile.extension || "").toUpperCase()}
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="server-alias" className="flex items-center gap-2">
                  <FileType className="h-4 w-4" />
                  {t("page.datasource.serverAliasLabel")}
                </Label>
                <Input
                  id="server-alias"
                  value={serverAlias}
                  onChange={e => setServerAlias(e.target.value)}
                  placeholder={t("page.datasource.serverAliasPlaceholder")}
                />
              </div>

              <div className="flex gap-3">
                <Button
                  onClick={handleServerImport}
                  disabled={serverImporting || !serverSelectedFile}
                >
                  {serverImporting
                    ? t("page.datasource.connection.saving")
                    : t("page.datasource.btnImportServer")}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Excel 工作表选择器 (文件上传) */}
      {pendingExcel && (
        <ExcelSheetSelector
          open={true}
          pendingInfo={pendingExcel}
          onClose={handleExcelClose}
          onImported={handleExcelImported}
          sourceType="upload"
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
        />
      )}
    </>
  );
};

export default UploadPanel;
