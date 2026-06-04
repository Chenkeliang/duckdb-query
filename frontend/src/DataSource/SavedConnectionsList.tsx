import { useState } from "react";
import { useTranslation } from "react-i18next";
import { EmptyState } from "@/components/EmptyState";
import { showSuccessToast, showErrorToast } from "@/utils/toastHelpers";
import { deleteDatabaseConnection } from "@/api";
import { useQueryClient } from "@tanstack/react-query";
import {
  Database,
  FileText,
  Trash2,
  Play,
  RefreshCw,
  Loader2,
  List,
  LayoutGrid,
  Plus,
} from "lucide-react";
import {
  useDatabaseConnections,
  type DatabaseConnection,
  type DatabaseType,
} from "../hooks/useDatabaseConnections";
import { invalidateAfterDatabaseChange } from "../utils/cacheInvalidation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface SavedConnectionsListProps {
  onSelect: (config: DatabaseConnection) => void;
  /** Open the drawer to create a new connection. */
  onNew?: () => void;
}

type ViewMode = "list" | "card";
const VIEW_STORAGE_KEY = "dq-conn-view";

/** Per-type presentation: label, lucide icon, and the cool identity color token. */
const TYPE_META: Record<
  DatabaseType,
  { label: string; icon: typeof Database; color: string; bg: string }
> = {
  mysql: { label: "MySQL", icon: Database, color: "text-ds-mysql", bg: "bg-ds-mysql/12" },
  postgresql: { label: "PostgreSQL", icon: Database, color: "text-ds-pg", bg: "bg-ds-pg/12" },
  sqlite: { label: "SQLite", icon: FileText, color: "text-ds-sqlite", bg: "bg-ds-sqlite/12" },
  sqlserver: { label: "SQL Server", icon: Database, color: "text-ds-pg", bg: "bg-ds-pg/12" },
};

/** Build the mono "host:port / database · user" (or path) meta string. */
function connMeta(c: DatabaseConnection): { primary: string; secondary: string } {
  const p = c.params || {};
  if (c.type === "sqlite") {
    return { primary: p.database || c.name, secondary: "" };
  }
  const hostPort = [p.host, p.port].filter(Boolean).join(":");
  let dbUser = [p.database, p.username].filter(Boolean).join(" · ");
  if (p.schema && p.schema !== "public") dbUser += ` (${p.schema})`;
  return { primary: hostPort, secondary: dbUser };
}

const SavedConnectionsList = ({ onSelect, onNew }: SavedConnectionsListProps) => {
  const { t } = useTranslation("common");
  const queryClient = useQueryClient();
  const { connections: configs, isLoading: loading, refresh } = useDatabaseConnections();

  const [view, setView] = useState<ViewMode>(() => {
    const saved = localStorage.getItem(VIEW_STORAGE_KEY);
    return saved === "card" ? "card" : "list";
  });
  const changeView = (v: ViewMode) => {
    setView(v);
    localStorage.setItem(VIEW_STORAGE_KEY, v);
  };

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [configToDelete, setConfigToDelete] = useState<DatabaseConnection | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDeleteConfirm = async () => {
    if (!configToDelete) return;
    setIsDeleting(true);
    try {
      await deleteDatabaseConnection(configToDelete.id);
      await invalidateAfterDatabaseChange(queryClient);
      const successMsg = t("page.datasource.list.deleteSuccess", {
        name: configToDelete.name || configToDelete.id,
      });
      showSuccessToast(t, "CONNECTION_DELETED", successMsg);
      setDeleteDialogOpen(false);
      setConfigToDelete(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      showErrorToast(t, err as Error, t("page.datasource.list.deleteFail", { message }));
    } finally {
      setIsDeleting(false);
    }
  };

  if (loading && configs.length === 0) {
    return <div className="text-sm text-muted-foreground">{t("actions.loading")}</div>;
  }

  const isEmpty = configs.length === 0;

  const statusLabel = (c: DatabaseConnection) =>
    c.type === "sqlite"
      ? t("page.datasource.list.local", { defaultValue: "本地" })
      : c.status === "active"
        ? t("page.datasource.list.online", { defaultValue: "在线" })
        : t("page.datasource.list.offline", { defaultValue: "离线" });

  const Tile = ({ c, size = 38 }: { c: DatabaseConnection; size?: number }) => {
    const meta = TYPE_META[c.type] ?? TYPE_META.mysql;
    const Icon = meta.icon;
    return (
      <span
        className={cn("grid place-items-center rounded-[10px] shrink-0", meta.bg, meta.color)}
        style={{ width: size, height: size }}
      >
        <Icon style={{ width: size * 0.5, height: size * 0.5 }} strokeWidth={1.7} />
      </span>
    );
  };

  const Dot = ({ c }: { c: DatabaseConnection }) => (
    <span
      className={cn(
        "h-[7px] w-[7px] rounded-full shrink-0",
        c.status === "active" || c.type === "sqlite" ? "bg-ds-live" : "bg-muted-foreground/50"
      )}
    />
  );

  const ConnectBtn = ({ c }: { c: DatabaseConnection }) => (
    <button
      onClick={() => onSelect(c)}
      className="inline-flex items-center gap-1.5 rounded-lg border border-primary/35 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary transition-colors hover:bg-primary hover:text-white"
    >
      <Play className="h-3 w-3 fill-current" />
      {t("page.datasource.list.connect")}
    </button>
  );

  const DeleteBtn = ({ c }: { c: DatabaseConnection }) => (
    <button
      onClick={() => {
        setConfigToDelete(c);
        setDeleteDialogOpen(true);
      }}
      title={t("actions.delete")}
      className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground/70 transition-colors hover:bg-surface-hover hover:text-error"
    >
      <Trash2 className="h-[15px] w-[15px]" />
    </button>
  );

  return (
    <div className="font-ds-sans">
      {/* header: title + count + view toggle + refresh */}
      <div className="mb-4 flex items-center gap-3">
        <h3 className="text-base font-bold tracking-tight text-foreground">
          {t("page.datasource.list.title")}
        </h3>
        <span className="font-ds-mono text-xs text-muted-foreground">{configs.length}</span>
        <div className="flex-1" />
        {!isEmpty && (
          <div className="inline-flex rounded-lg bg-muted p-0.5 text-muted-foreground">
            {(["list", "card"] as ViewMode[]).map((v) => (
              <button
                key={v}
                onClick={() => changeView(v)}
                className={cn(
                  "grid h-7 w-7 place-items-center rounded-md transition-all",
                  view === v
                    ? "bg-surface text-foreground shadow-sm"
                    : "hover:text-foreground"
                )}
                title={v === "list" ? t("page.datasource.list.viewList", { defaultValue: "列表" }) : t("page.datasource.list.viewCard", { defaultValue: "卡片" })}
              >
                {v === "list" ? <List className="h-4 w-4" /> : <LayoutGrid className="h-4 w-4" />}
              </button>
            ))}
          </div>
        )}
        <Button variant="ghost" size="sm" onClick={() => refresh()} title={t("actions.refresh")}>
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
        </Button>
        <Button size="sm" onClick={() => onNew?.()}>
          <Plus className="mr-1 h-4 w-4" />
          {t("page.datasource.list.newConnection", { defaultValue: "新建连接" })}
        </Button>
      </div>

      {/* ===== EMPTY STATE ===== */}
      {isEmpty ? (
        <EmptyState
          variant="dashed"
          icon={Database}
          className="bg-surface py-16"
          title={t("page.datasource.list.empty", { defaultValue: "还没有保存的连接" })}
          action={
            <Button size="sm" onClick={() => onNew?.()}>
              <Plus className="mr-1 h-4 w-4" />
              {t("page.datasource.list.newConnection", { defaultValue: "新建连接" })}
            </Button>
          }
        />
      ) : null}

      {/* ===== LIST VIEW ===== */}
      {!isEmpty && (view === "list" ? (
        <div className="overflow-hidden rounded-xl border border-border bg-surface">
          {configs.map((c, i) => {
            const meta = connMeta(c);
            return (
              <div
                key={`${c.type}-${c.id}`}
                onClick={() => onSelect(c)}
                className={cn(
                  "flex cursor-pointer items-center gap-4 px-4 py-3 transition-colors hover:bg-surface-hover",
                  i !== configs.length - 1 && "border-b border-border"
                )}
              >
                <Tile c={c} size={34} />
                <div className="w-[168px] shrink-0">
                  <div className="truncate text-sm font-semibold text-foreground">{c.name || c.id}</div>
                  <div className="text-xs text-muted-foreground">{TYPE_META[c.type]?.label}</div>
                </div>
                <div className="min-w-0 flex-1 truncate text-[13px]">
                  <span className="text-foreground/80">{meta.secondary || meta.primary}</span>
                  {meta.secondary && (
                    <span className="ml-2.5 text-muted-foreground/70">{meta.primary}</span>
                  )}
                </div>
                <div className="flex w-[84px] shrink-0 items-center gap-2 text-xs text-muted-foreground">
                  <Dot c={c} />
                  {statusLabel(c)}
                </div>
                <div
                  className="flex shrink-0 items-center gap-1.5"
                  onClick={(e) => e.stopPropagation()}
                >
                  <DeleteBtn c={c} />
                  <ConnectBtn c={c} />
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* ===== CARD VIEW ===== */
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {configs.map((c) => {
            const meta = connMeta(c);
            return (
              <div
                key={`${c.type}-${c.id}`}
                onClick={() => onSelect(c)}
                className="group cursor-pointer rounded-xl border border-border bg-surface p-4 shadow-xs transition-all hover:-translate-y-0.5 hover:border-border-strong hover:shadow-lg"
              >
                <div className="mb-3.5 flex items-center gap-2.5">
                  <Tile c={c} />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 truncate text-sm font-semibold text-foreground">
                      {c.name || c.id}
                      <Dot c={c} />
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {TYPE_META[c.type]?.label} · {statusLabel(c)}
                    </div>
                  </div>
                </div>
                <div className="truncate text-[13px] leading-relaxed text-foreground/80">
                  {meta.secondary || meta.primary}
                </div>
                {meta.secondary && (
                  <div className="truncate text-xs leading-relaxed text-muted-foreground/70">
                    {meta.primary}
                  </div>
                )}
                <div
                  className="mt-3.5 flex items-center gap-2 border-t border-border pt-3"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex-1" />
                  <DeleteBtn c={c} />
                  <ConnectBtn c={c} />
                </div>
              </div>
            );
          })}
        </div>
      ))}

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("actions.delete")}</DialogTitle>
            <DialogDescription>{t("page.datasource.list.deleteConfirmDesc")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)} disabled={isDeleting}>
              {t("actions.cancel")}
            </Button>
            <Button variant="destructive" onClick={handleDeleteConfirm} disabled={isDeleting}>
              {isDeleting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t("actions.deleting", { defaultValue: t("actions.delete") })}
                </>
              ) : (
                t("actions.delete")
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SavedConnectionsList;
