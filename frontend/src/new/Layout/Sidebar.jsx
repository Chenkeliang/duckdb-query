import React from "react";
import { Sun, Moon, Languages, Github, Home } from "lucide-react";
import { useTranslation } from "react-i18next";

/**
 * New sidebar (shadcn+tailwind+token) for the new layout.
 * Props come from DuckQueryApp: navItems [{id,label,icon}], activeId, onSelect,
 * theme/lang toggles, GitHub/back/welcome actions.
 */
const Sidebar = ({
  navItems = [],
  activeId,
  onSelect,
  isDarkMode,
  onToggleTheme,
  locale,
  onLocaleChange,
  onOpenGithub,
  onShowWelcome,
  onSwitchLegacy,
  logoLight,
  logoDark
}) => {
  const { i18n } = useTranslation();

  const handleLocaleToggle = () => {
    if (onLocaleChange) {
      // 让外部处理语言切换逻辑（例如同步到 localStorage）
      onLocaleChange();
      return;
    }
    const current = locale || i18n.language || "zh";
    const next = current.startsWith("zh") ? "en" : "zh";
    i18n.changeLanguage(next);
  };

  const NavButton = ({ item }) => {
    const Icon = item.icon;
    const active = item.id === activeId;
    const base =
      "w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-lg transition-all border border-transparent";
    const activeClasses = "nav-active";
    const inactiveClasses =
      "text-muted-foreground hover:text-foreground hover:bg-muted";

    return (
      <button
        type="button"
        onClick={() => onSelect?.(item.id)}
        className={`${base} ${active ? activeClasses : inactiveClasses}`}
      >
        {Icon ? <Icon className="h-4 w-4" /> : null}
        <span className="truncate">{item.label}</span>
      </button>
    );
  };

  const safeLocale = (locale || i18n.language || "zh").slice(0, 2);

  return (
    <div className="dq-layout-sidebar-inner flex h-full w-full flex-col bg-surface text-foreground">
      {/* Logo 区域 */}
      <div className="h-14 flex items-center gap-3 px-5 border-b border-border">
        {logoLight || logoDark ? (
          <img
            src={isDarkMode ? logoDark || logoLight : logoLight || logoDark}
            alt="DuckQuery"
            className="h-8 w-auto"
          />
        ) : (
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground font-bold shadow-lg shadow-orange-900/20">
            D
          </div>
        )}
        <div>
          <div className="font-bold text-sm tracking-wide text-foreground">
            DuckQuery
          </div>
          <div className="text-[10px] text-muted-foreground font-mono">
            v2.0.1 PRO
          </div>
        </div>
      </div>

      {/* 导航 */}
      <nav className="flex-1 p-3 space-y-1">
        {navItems.map(item => (
          <NavButton key={item.id} item={item} />
        ))}
      </nav>

      {/* 底部操作区 */}
      <div className="p-4 border-t border-border space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onToggleTheme}
            className="flex items-center justify-center gap-2 rounded-lg border border-border bg-surface px-2 py-2 text-xs text-muted-foreground hover:bg-surface-hover"
          >
            {isDarkMode ? (
              <Sun className="h-4 w-4" />
            ) : (
              <Moon className="h-4 w-4" />
            )}
          </button>
          <button
            type="button"
            onClick={handleLocaleToggle}
            className="flex items-center justify-center gap-2 rounded-lg border border-border bg-surface px-2 py-2 text-xs text-muted-foreground hover:bg-surface-hover"
          >
            <Languages className="h-4 w-4" />
            <span className="uppercase">{safeLocale}</span>
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onOpenGithub}
            className="flex items-center justify-center gap-2 rounded-lg border border-border bg-surface px-2 py-2 text-xs text-muted-foreground hover:bg-surface-hover"
          >
            <Github className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onShowWelcome}
            className="flex items-center justify-center gap-2 rounded-lg border border-border bg-surface px-2 py-2 text-xs text-muted-foreground hover:bg-surface-hover"
          >
            <Home className="h-4 w-4" />
          </button>
        </div>
        <button
          type="button"
          onClick={onSwitchLegacy}
          className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-xs text-muted-foreground hover:bg-surface-hover"
        >
          Legacy
        </button>
      </div>
    </div>
  );
};

export default Sidebar;
