import { useTranslation } from "react-i18next";
import { FileType, HardDrive, Server } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { stemFromFilename } from "./uploadPathUtils";
import { CsvOptionsPanel, type CsvOptions } from "./CsvOptionsPanel";

export interface ServerFileEntry {
  path: string;
  name: string;
  type: string;
  extension?: string;
  /** 后端权威的「可导入」标志（来自 SUPPORTED_FORMATS） */
  supported?: boolean;
  suggested_table_name?: string;
}

export interface ServerMount {
  path: string;
  label?: string;
}

export interface ServerBrowseCardProps {
  serverMounts: ServerMount[];
  serverMountLoading: boolean;
  selectedMount: string;
  currentPath: string;
  serverEntries: ServerFileEntry[];
  serverLoading: boolean;
  serverError: string;
  serverSelectedFile: ServerFileEntry | null;
  serverAlias: string;
  serverImporting: boolean;
  csvOptions: CsvOptions;
  onMountChange: (path: string) => void;
  onBrowseDirectory: (path: string) => void;
  onSelectFile: (entry: ServerFileEntry) => void;
  onServerAliasChange: (alias: string) => void;
  onCsvOptionsChange: (opts: CsvOptions) => void;
  onImport: () => void;
}

export type { CsvOptions };

/**
 * Web/Docker 构建专用：挂载目录浏览 + 别名 + 导入按钮。
 * 桌面端（Tauri）不渲染此分段，改用原生选择器 + 拖拽（见 UploadPanel 的 isTauri 分支）。
 */
export function ServerBrowseCard({
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
  csvOptions,
  onMountChange,
  onBrowseDirectory,
  onSelectFile,
  onServerAliasChange,
  onCsvOptionsChange,
  onImport,
}: ServerBrowseCardProps) {
  const isCsvSelected =
    (serverSelectedFile?.extension || "").toLowerCase() === "csv";
  const { t } = useTranslation("common");

  return (
    <Card className="rounded-xl shadow-sm">
      <CardContent className="p-6 space-y-5">
        <p className="text-sm leading-relaxed text-muted-foreground">
          {t("page.datasource.cardServerDesc")}
        </p>

        <div className="space-y-2">
          <Label className="flex items-center gap-2 text-xs">
            <HardDrive className="h-3.5 w-3.5" />
            {t("page.datasource.serverSelectMount")}
          </Label>
          {serverMountLoading ? (
            <div className="text-xs text-muted-foreground">{t("actions.loading")}</div>
          ) : serverMounts.length === 0 ? (
            <div className="space-y-2 text-xs text-muted-foreground">
              <div>{t("page.datasource.serverNoMount")}</div>
              <div>{t("page.datasource.serverMountAlert")}</div>
            </div>
          ) : (
            <Select value={selectedMount} onValueChange={onMountChange}>
              <SelectTrigger className="h-9 w-full font-ds-mono text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {serverMounts.map(m => (
                  <SelectItem key={m.path} value={m.path} className="font-ds-mono text-xs">
                    {m.label || m.path}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {serverError ? (
            <div className="text-xs text-muted-foreground">
              {t(`errors:${serverError}`, { defaultValue: serverError })}
            </div>
          ) : null}
        </div>

        {/* 面包屑：当前目录路径，每段可点击回跳 */}
        {selectedMount && serverEntries.length > 0
          ? (() => {
              const mount = serverMounts.find(m => m.path === selectedMount);
              const rootLabel =
                mount?.label || selectedMount.split("/").filter(Boolean).pop() || "/";
              const rel =
                currentPath && currentPath.startsWith(selectedMount)
                  ? currentPath.slice(selectedMount.length).replace(/^\/+/, "")
                  : "";
              const parts = rel ? rel.split("/").filter(Boolean) : [];
              const crumbs = [{ label: rootLabel, path: selectedMount }];
              let acc = selectedMount;
              for (const p of parts) {
                acc = `${acc}/${p}`;
                crumbs.push({ label: p, path: acc });
              }
              return (
                <div className="flex flex-wrap items-center gap-1 font-mono text-xs text-muted-foreground">
                  {crumbs.map((c, i) => (
                    <span key={c.path} className="flex items-center gap-1">
                      {i > 0 ? <span className="text-muted-foreground/40">/</span> : null}
                      {i === crumbs.length - 1 ? (
                        <span className="text-foreground">{c.label}</span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onBrowseDirectory(c.path)}
                          className="rounded px-1 hover:bg-surface-hover hover:text-foreground"
                        >
                          {c.label}
                        </button>
                      )}
                    </span>
                  ))}
                </div>
              );
            })()
          : null}

        <div className="rounded-lg border border-border bg-surface max-h-48 overflow-auto space-y-1 text-sm">
          {serverLoading ? (
            <div className="px-3 py-2 text-xs text-muted-foreground">
              {t("actions.loading")}
            </div>
          ) : serverEntries.length === 0 ? (
            <div className="px-3 py-2 text-xs text-muted-foreground">
              {t("page.datasource.serverNoFiles")}
            </div>
          ) : (
            <>
              {serverEntries
                .filter(entry => {
                  if (entry.type === "directory") return true;
                  // 以后端权威 supported 为准；旧后端无该字段时回退到完整扩展名列表
                  if (typeof entry.supported === "boolean") return entry.supported;
                  const ext = (entry.extension || "").toLowerCase();
                  return ["csv", "excel", "json", "jsonl", "parquet", "xlsx", "xls", "pq"].includes(
                    ext
                  );
                })
                .map(entry => {
                  const selected = serverSelectedFile?.path === entry.path;
                  const isDir = entry.type === "directory";
                  return (
                    <button
                      key={entry.path}
                      type="button"
                      onClick={() => {
                        if (isDir) {
                          onBrowseDirectory(entry.path);
                        } else {
                          onSelectFile(entry);
                          if (!serverAlias.trim()) {
                            onServerAliasChange(stemFromFilename(entry.name));
                          }
                        }
                      }}
                      className={`flex w-full items-center justify-between rounded-md px-3 py-1.5 text-left cursor-pointer ${
                        selected ? "bg-surface-hover" : "hover:bg-surface-hover"
                      }`}
                    >
                      <span className="flex items-center gap-2 text-xs text-foreground">
                        <Server className="h-3 w-3 text-muted-foreground" />
                        {entry.name}
                      </span>
                      <span className="text-xs text-muted-foreground">
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

        {serverSelectedFile ? (
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
        ) : null}

        <div className="space-y-2">
          <Label htmlFor="server-alias" className="flex items-center gap-2 text-xs">
            <FileType className="h-3.5 w-3.5" />
            {t("page.datasource.serverAliasLabel")}
          </Label>
          <Input
            id="server-alias"
            value={serverAlias}
            onChange={e => onServerAliasChange(e.target.value)}
            placeholder={t("page.datasource.serverAliasPlaceholder")}
            className="font-ds-mono text-xs"
          />
          <p className="text-xs text-muted-foreground">
            {t("page.datasource.serverAliasHelper")}
          </p>
        </div>

        {isCsvSelected ? (
          <CsvOptionsPanel value={csvOptions} onChange={onCsvOptionsChange} />
        ) : null}

        <div className="flex gap-3">
          <Button
            onClick={onImport}
            disabled={
              serverImporting || !serverSelectedFile || !serverAlias.trim()
            }
          >
            {serverImporting
              ? t("page.datasource.connection.saving")
              : t("page.datasource.btnImportServer")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
