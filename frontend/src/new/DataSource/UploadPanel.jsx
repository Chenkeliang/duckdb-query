import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Upload, FileType, Link2, Server, HardDrive } from "lucide-react";
import {
  uploadFile,
  readFromUrl,
  getServerMounts,
  browseServerDirectory,
  importServerFile
} from "../../services/apiClient";

/**
 * 数据源视图 A：智能文件上传（本地文件 + URL + 服务器目录）。
 * 视觉与布局参考 docs/datasource_preview.html 的 #view-file。
 */
const UploadPanel = ({ onDataSourceSaved, showNotification }) => {
  const { t } = useTranslation("common");
  const fileInputRef = useRef(null);

  const [alias, setAlias] = useState("");
  const [selectedFile, setSelectedFile] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [url, setUrl] = useState("");
  const [urlLoading, setUrlLoading] = useState(false);

  // 服务器目录状态
  const [serverMounts, setServerMounts] = useState([]);
  const [serverMountLoading, setServerMountLoading] = useState(false);
  const [selectedMount, setSelectedMount] = useState("");
  const [serverEntries, setServerEntries] = useState([]);
  const [serverLoading, setServerLoading] = useState(false);
  const [serverError, setServerError] = useState("");
  const [serverSelectedFile, setServerSelectedFile] = useState(null);
  const [serverAlias, setServerAlias] = useState("");
  const [serverImporting, setServerImporting] = useState(false);

  const notify = (message, severity = "info") => {
    if (!message) return;
    showNotification?.(message, severity);
  };

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
      notify(t("page.datasource.pickFileFirst"), "warning");
      return;
    }
    setUploading(true);
    try {
      const response = await uploadFile(selectedFile, alias || null);
      if (response?.success) {
        notify(
          t("page.datasource.uploadSuccessTable", {
            table: response.file_id
          }),
          "success"
        );
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
      } else {
        notify(response?.message || t("page.datasource.uploadFail"), "error");
      }
    } catch (err) {
      notify(err?.message || t("page.datasource.uploadFail"), "error");
    } finally {
      setUploading(false);
    }
  };

  const handleUrlImport = async () => {
    if (!url.trim()) {
      notify(t("page.datasource.enterUrl"), "warning");
      return;
    }
    if (!alias.trim()) {
      notify(t("page.datasource.enterAlias"), "warning");
      return;
    }
    setUrlLoading(true);
    try {
      const result = await readFromUrl(url.trim(), alias.trim());
      if (result?.success) {
        notify(
          t("page.datasource.urlReadSuccess", { table: result.table_name }),
          "success"
        );
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
        notify(result?.message || t("page.datasource.urlReadFail"), "error");
      }
    } catch (err) {
      notify(
        t("page.datasource.urlReadFailDetail", {
          message: err?.message || t("common.unknown")
        }),
        "error"
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

  const handleServerImport = async () => {
    if (!serverSelectedFile) {
      notify(t("page.datasource.pickFileFirst"), "warning");
      return;
    }
    const aliasValue =
      serverAlias ||
      serverSelectedFile.suggested_table_name ||
      serverSelectedFile.name?.replace(/\.[^/.]+$/, "") ||
      "";
    if (!aliasValue) {
      notify(t("page.datasource.enterAlias"), "warning");
      return;
    }
    setServerImporting(true);
    try {
      const result = await importServerFile({
        path: serverSelectedFile.path,
        table_alias: aliasValue
      });
      if (result?.success) {
        notify(
          result?.message || t("page.datasource.importSuccess"),
          "success"
        );
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
        notify(result?.message || t("page.datasource.importFail"), "error");
      }
    } catch (err) {
      notify(err?.message || t("page.datasource.importFail"), "error");
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

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
      {/* 左侧：智能文件上传主卡片 */}
      <div className="bg-surface border border-border rounded-xl p-6 space-y-5 shadow-sm">
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
          className={`cursor-pointer rounded-xl border border-dashed px-6 py-10 text-center transition-colors flex flex-col items-center justify-center gap-2 ${
            dragOver
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
            {t("page.datasource.maxSize")}
          </p>
          {selectedFile ? (
            <p className="mt-1 text-xs text-muted-fg">
              {t("page.datasource.selectedFile")}: {selectedFile.name}
            </p>
          ) : null}
        </div>

        <div className="space-y-2">
          <label className="text-xs text-muted-fg">
            {t("page.datasource.aliasLabel")}
          </label>
          <input
            className="h-10 w-full rounded-md border border-border bg-input px-3 text-sm text-foreground placeholder:text-muted-fg focus:outline-none focus:ring-2 focus:ring-primary"
            value={alias}
            onChange={e => setAlias(e.target.value)}
            placeholder={t("page.datasource.aliasPlaceholder")}
          />
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={handleUpload}
            disabled={uploading || !selectedFile}
            className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-60 shadow-sm"
          >
            {uploading
              ? t("page.datasource.connection.saving")
              : t("page.datasource.btnStartUpload")}
          </button>
          <button
            type="button"
            onClick={() => {
              setSelectedFile(null);
              setAlias("");
            }}
            className="px-4 py-2 rounded-md text-sm text-muted-fg hover:text-foreground hover:bg-muted"
          >
            {t("page.datasource.paste.btnClear")}
          </button>
        </div>
      </div>

      {/* 右侧：URL 拉取 + 服务器目录导入卡片 */}
      <div className="flex flex-col gap-6">
        {/* URL 拉取 */}
        <div className="bg-surface border border-border rounded-xl p-6 space-y-4 shadow-sm">
          <div>
            <p className="text-sm text-muted-fg">
              {t("page.datasource.cardRemoteTitle")}
            </p>
            <h3 className="text-lg font-semibold text-foreground">
              {t("page.datasource.cardRemoteDesc")}
            </h3>
          </div>

          <div className="space-y-2">
            <label className="text-xs text-muted-fg flex items-center gap-2">
              <Link2 className="h-4 w-4 text-muted-fg" />
              {t("page.datasource.remoteUrlLabel")}
            </label>
            <input
              className="h-10 w-full rounded-md border border-border bg-input px-3 text-sm text-foreground placeholder:text-muted-fg focus:outline-none focus:ring-2 focus:ring-primary"
              value={url}
              onChange={e => setUrl(e.target.value)}
              placeholder="https://example.com/data.csv"
            />
            <p className="text-[11px] text-muted-fg">
              {t("page.datasource.remoteUrlHelper")}
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-xs text-muted-fg flex items-center gap-2">
              <FileType className="h-4 w-4 text-muted-fg" />
              {t("page.datasource.remoteAliasLabel")}
            </label>
            <input
              className="h-10 w-full rounded-md border border-border bg-input px-3 text-sm text-foreground placeholder:text-muted-fg focus:outline-none focus:ring-2 focus:ring-primary"
              value={alias}
              onChange={e => setAlias(e.target.value)}
              placeholder={t("page.datasource.remoteAliasPlaceholder")}
            />
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleUrlImport}
              disabled={urlLoading || !url.trim()}
              className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-60"
            >
              {urlLoading
                ? t("page.datasource.connection.testing")
                : t("page.datasource.btnReadRemote")}
            </button>
          </div>
        </div>

        {/* 服务器目录导入 */}
        <div className="bg-surface border border-border rounded-xl p-6 space-y-4 shadow-sm">
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
              serverEntries.map(entry => {
                const selected = serverSelectedFile?.path === entry.path;
                const isDir = entry.type === "directory";
                return (
                  <button
                    key={entry.path}
                    type="button"
                    onClick={() =>
                      isDir
                        ? loadServerDirectory(entry.path)
                        : setServerSelectedFile(entry)
                    }
                    className={`flex w-full items-center justify-between rounded-md px-3 py-1.5 text-left ${
                      selected ? "bg-surface-hover" : "hover:bg-surface-hover"
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
              })
            )}
          </div>

          <div className="space-y-2">
            <label className="text-xs text-muted-fg flex items-center gap-2">
              <FileType className="h-4 w-4 text-muted-fg" />
              {t("page.datasource.serverAliasLabel")}
            </label>
            <input
              className="h-10 w-full rounded-md border border-border bg-input px-3 text-sm text-foreground placeholder:text-muted-fg focus:outline-none focus:ring-2 focus:ring-primary"
              value={serverAlias}
              onChange={e => setServerAlias(e.target.value)}
              placeholder={t("page.datasource.serverAliasPlaceholder")}
            />
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleServerImport}
              disabled={serverImporting || !serverSelectedFile}
              className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-60"
            >
              {serverImporting
                ? t("page.datasource.connection.saving")
                : t("page.datasource.btnImportServer")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default UploadPanel;
