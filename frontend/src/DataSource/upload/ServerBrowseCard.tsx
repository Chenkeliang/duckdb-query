import { useTranslation } from "react-i18next";
import { FileType, HardDrive, Server } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { stemFromFilename } from "./uploadPathUtils";

export interface ServerFileEntry {
  path: string;
  name: string;
  type: string;
  extension?: string;
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
  onMountChange: (path: string) => void;
  onBrowseDirectory: (path: string) => void;
  onSelectFile: (entry: ServerFileEntry) => void;
  onServerAliasChange: (alias: string) => void;
  onImport: () => void;
}

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
  onMountChange,
  onBrowseDirectory,
  onSelectFile,
  onServerAliasChange,
  onImport,
}: ServerBrowseCardProps) {
  const { t } = useTranslation("common");

  return (
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
            <div className="text-xs text-muted-fg">{t("actions.loading")}</div>
          ) : serverMounts.length === 0 ? (
            <div className="space-y-2 text-xs text-muted-fg">
              <div>{t("page.datasource.serverNoMount")}</div>
              <div>{t("page.datasource.serverMountAlert")}</div>
            </div>
          ) : (
            <select
              className="h-9 w-full rounded-md border border-border bg-input px-2 text-sm text-foreground"
              value={selectedMount}
              onChange={e => onMountChange(e.target.value)}
            >
              {serverMounts.map(m => (
                <option key={m.path} value={m.path}>
                  {m.label || m.path}
                </option>
              ))}
            </select>
          )}
          {serverError ? (
            <div className="text-xs text-error">
              {t(`errors:${serverError}`, { defaultValue: serverError })}
            </div>
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
              {currentPath && currentPath !== selectedMount ? (
                <button
                  type="button"
                  onClick={() => {
                    const parentPath =
                      currentPath.split("/").slice(0, -1).join("/") ||
                      selectedMount;
                    onBrowseDirectory(parentPath);
                  }}
                  className="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-left cursor-pointer hover:bg-surface-hover border-b border-border"
                >
                  <span className="text-xs text-primary font-medium">
                    ← {t("page.datasource.serverGoBack", "返回上一级")}
                  </span>
                </button>
              ) : null}

              {serverEntries
                .filter(entry => {
                  if (entry.type === "directory") return true;
                  const ext = (entry.extension || "").toLowerCase();
                  return ["csv", "excel", "json", "jsonl", "parquet"].includes(
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
                        <Server className="h-3 w-3 text-muted-fg" />
                        {entry.name}
                      </span>
                      <span className="text-xs text-muted-fg">
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
          <Label htmlFor="server-alias" className="flex items-center gap-2">
            <FileType className="h-4 w-4" />
            {t("page.datasource.serverAliasLabel")}
          </Label>
          <Input
            id="server-alias"
            value={serverAlias}
            onChange={e => onServerAliasChange(e.target.value)}
            placeholder={t("page.datasource.serverAliasPlaceholder")}
          />
          <p className="text-xs text-muted-foreground">
            {t("page.datasource.serverAliasHelper")}
          </p>
        </div>

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
