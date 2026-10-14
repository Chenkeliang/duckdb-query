import React from "react";
import { useTranslation } from "react-i18next";
import { Database, Github, Languages, Loader2, Moon, Sun } from "lucide-react";

import { IS_DEMO } from "@/demo/isDemo";
import { useDuckDBCapabilities } from "@/hooks/useDuckDBCapabilities";
import { useDatabaseConnections } from "@/hooks/useDatabaseConnections";
import { cn } from "@/lib/utils";
import { formatShortcutLabel, useShortcuts } from "@/Settings/shortcuts";

interface StatusBarProps {
  isDarkMode: boolean;
  onToggleTheme: () => void;
  locale: string;
  onToggleLocale: () => void;
  onOpenCommandPalette: () => void;
  onOpenGithub: () => void;
  onOpenDataSources: () => void;
  asyncRunning: number;
  onOpenAsyncTasks: () => void;
}

const itemClass =
  "inline-flex h-5.5 items-center gap-1.5 rounded px-1.5 text-muted-foreground whitespace-nowrap";
const buttonClass = cn(
  itemClass,
  "transition-colors hover:bg-surface-hover hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
);

/** Engine + connection facts come from the backend; the Wasm demo has neither. */
function BackendFacts({ onOpenDataSources }: { onOpenDataSources: () => void }) {
  const { t } = useTranslation("common");
  const { data: caps, isError } = useDuckDBCapabilities();
  const { connections } = useDatabaseConnections();
  const offline = connections.filter((c) => c.status !== "active").length;
  const engine = caps?.engine;

  return (
    <>
      <span className={itemClass} title={engine ? `${engine.platform} · storage ${engine.default_storage_version}` : undefined}>
        <span
          aria-hidden
          className={cn("h-1.5 w-1.5 rounded-full", isError ? "bg-error" : engine ? "bg-success" : "bg-faint")}
        />
        {engine
          ? t("status.engine", { version: engine.version, defaultValue: "DuckDB {{version}}" })
          : isError
            ? t("status.engineDown", "本地引擎未响应")
            : t("status.engineChecking", "正在连接本地引擎…")}
      </span>
      <button type="button" className={buttonClass} onClick={onOpenDataSources}>
        <Database className="h-3 w-3" />
        {t("status.connections", { count: connections.length, defaultValue: "{{count}} 个连接" })}
        {offline > 0 && (
          <span>· {t("status.offline", { count: offline, defaultValue: "{{count}} 个离线" })}</span>
        )}
      </button>
    </>
  );
}

/**
 * 28px status bar (graphite redesign). Holds the facts a long session needs
 * at a glance and the global toggles that used to live in the page header.
 */
const StatusBar: React.FC<StatusBarProps> = ({
  isDarkMode,
  onToggleTheme,
  locale,
  onToggleLocale,
  onOpenCommandPalette,
  onOpenGithub,
  onOpenDataSources,
  asyncRunning,
  onOpenAsyncTasks,
}) => {
  const { t } = useTranslation("common");
  const { getShortcutForAction } = useShortcuts();
  const isZh = locale.startsWith("zh");

  return (
    <footer className="flex h-7 shrink-0 items-center gap-0.5 overflow-hidden border-t border-border bg-background px-1.5 text-xs">
      {IS_DEMO ? (
        <span className={itemClass}>
          <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-success" />
          {t("status.engineDemo", "DuckDB-Wasm · 浏览器内")}
        </span>
      ) : (
        <BackendFacts onOpenDataSources={onOpenDataSources} />
      )}
      {asyncRunning > 0 && (
        <button type="button" className={buttonClass} onClick={onOpenAsyncTasks}>
          <Loader2 className="h-3 w-3 animate-spin text-primary-ink motion-reduce:animate-none" />
          {t("status.asyncRunning", { count: asyncRunning, defaultValue: "{{count}} 个异步任务运行中" })}
        </button>
      )}
      <div className="flex-1" />
      <button
        type="button"
        className={buttonClass}
        onClick={onToggleLocale}
        aria-label={t("actions.toggleLanguage")}
        title={t("actions.toggleLanguage")}
      >
        <Languages className="h-3 w-3" />
        {isZh ? "中文" : "EN"}
      </button>
      <button
        type="button"
        className={buttonClass}
        onClick={onToggleTheme}
        aria-label={isDarkMode ? t("actions.toggleLight") : t("actions.toggleDark")}
        title={isDarkMode ? t("actions.toggleLight") : t("actions.toggleDark")}
      >
        {isDarkMode ? <Moon className="h-3 w-3" /> : <Sun className="h-3 w-3" />}
      </button>
      <button type="button" className={buttonClass} onClick={onOpenGithub} aria-label="GitHub" title="GitHub">
        <Github className="h-3 w-3" />
      </button>
      <button
        type="button"
        className={buttonClass}
        onClick={onOpenCommandPalette}
        aria-label={t("shortcuts.openCommandPalette")}
        title={t("shortcuts.openCommandPalette")}
      >
        <kbd className="rounded border border-border px-1 text-xs leading-4 text-muted-foreground">
          {formatShortcutLabel(getShortcutForAction("openCommandPalette"))}
        </kbd>
      </button>
    </footer>
  );
};

export default StatusBar;
