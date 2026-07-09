import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { type FileImportMode } from "@/api";
import ExcelSheetSelector from "./ExcelSheetSelector";
import { LocalUploadCard } from "./upload/LocalUploadCard";
import { RemoteUrlCard } from "./upload/RemoteUrlCard";
import { ServerBrowseCard } from "./upload/ServerBrowseCard";
import { DesktopLocalCard } from "./upload/DesktopLocalCard";
import { ImportModeSelect } from "./upload/ImportModeSelect";
import { useLocalUpload } from "./upload/useLocalUpload";
import { useRemoteUrl } from "./upload/useRemoteUrl";
import { useServerBrowse } from "./upload/useServerBrowse";
import { useDesktopImport } from "./upload/useDesktopImport";
import { cn } from "@/lib/utils";
import { useAppConfig } from "@/hooks/useAppConfig";

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

  const [importMode, setImportMode] = useState<FileImportMode>("auto");
  /** 文件上传方式分段：本地 / 远程 URL / 服务器目录（一次展示一种） */
  const [uploadMethod, setUploadMethod] = useState<"local" | "url" | "server">("local");

  const local = useLocalUpload({
    t,
    queryClient,
    onDataSourceSaved,
    importMode,
    maxFileSize,
    maxFileSizeDisplay,
  });

  const remote = useRemoteUrl({ t, queryClient, onDataSourceSaved, importMode });

  // excelQueue 归 useDesktopImport 持有；handleServerImport 选中 Excel 时通过 enqueueExcel 塞入同一队列。
  const server = useServerBrowse({
    t,
    queryClient,
    onDataSourceSaved,
    importMode,
    enqueueExcel: (item) => desktop.enqueueExcel(item),
  });

  const desktop = useDesktopImport({
    t,
    queryClient,
    onDataSourceSaved,
    importMode,
    setServerImporting: server.setServerImporting,
    setServerSelectedFile: server.setServerSelectedFile,
    setServerAlias: server.setServerAlias,
  });

  return (
    <>
      {/* 顶部一行：左=上传方式分段（桌面端只有 本地/URL；Web/Docker 三段），右=紧凑的数据类型设置 */}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-lg bg-muted p-1 text-muted-foreground">
          {(
            [
              ["local", t("page.datasource.cardLocalTitle")] as const,
              ["url", t("page.datasource.cardRemoteTitle")] as const,
              ...(desktop.isTauri
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
        desktop.isTauri ? (
          <DesktopLocalCard
            onPickFiles={desktop.handlePickFiles}
            dragOver={desktop.desktopDragOver}
            importing={server.serverImporting}
          />
        ) : (
          <LocalUploadCard
            maxFileSizeDisplay={maxFileSizeDisplay}
            selectedFile={local.selectedFile}
            uploadAlias={local.uploadAlias}
            uploading={local.uploading}
            uploadProgress={local.uploadProgress}
            dragOver={local.dragOver}
            csvOptions={local.localCsvOptions}
            onFileSelect={local.onFileSelect}
            onUploadAliasChange={local.setUploadAlias}
            onDragOver={local.setDragOver}
            onCsvOptionsChange={local.setLocalCsvOptions}
            onUpload={local.handleUpload}
            onClear={local.onClear}
          />
        )
      )}

      {uploadMethod === "url" && (
        <RemoteUrlCard
          url={remote.url}
          remoteAlias={remote.remoteAlias}
          urlLoading={remote.urlLoading}
          remoteStorageConfigured={remoteStorageConfigured}
          jsonImportColumnType={jsonImportColumnType}
          onUrlChange={remote.onUrlChange}
          onRemoteAliasChange={remote.setRemoteAlias}
          onImport={remote.handleUrlImport}
        />
      )}

      {uploadMethod === "server" && (
        <ServerBrowseCard
          serverMounts={server.serverMounts}
          serverMountLoading={server.serverMountLoading}
          selectedMount={server.selectedMount}
          currentPath={server.currentPath}
          serverEntries={server.serverEntries}
          serverLoading={server.serverLoading}
          serverError={server.serverError}
          serverSelectedFile={server.serverSelectedFile}
          serverAlias={server.serverAlias}
          serverImporting={server.serverImporting}
          csvOptions={server.serverCsvOptions}
          onMountChange={path => {
            server.setSelectedMount(path);
            server.loadServerDirectory(path);
          }}
          onBrowseDirectory={server.loadServerDirectory}
          onSelectFile={entry => {
            server.setServerSelectedFile(entry);
            server.setServerCsvOptions({});
          }}
          onServerAliasChange={server.setServerAlias}
          onCsvOptionsChange={server.setServerCsvOptions}
          onImport={server.handleServerImport}
        />
      )}

      {/* Excel 工作表选择器 (文件上传) */}
      {local.pendingExcel && (
        <ExcelSheetSelector
          open={true}
          pendingInfo={local.pendingExcel}
          onClose={local.handleExcelClose}
          onImported={local.handleExcelImported}
          sourceType="upload"
          importMode={importMode}
        />
      )}

      {/* Excel 工作表选择器 (服务器文件) */}
      {desktop.serverExcelPending && (
        <ExcelSheetSelector
          open={true}
          pendingInfo={null}
          onClose={desktop.handleServerExcelClose}
          onImported={desktop.handleServerExcelImported}
          sourceType="server"
          serverPath={desktop.serverExcelPending.path}
          importMode={importMode}
          tablePrefix={desktop.serverExcelPending.alias}
        />
      )}
    </>
  );
};

export default UploadPanel;
