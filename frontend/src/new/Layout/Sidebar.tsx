import React from "react";
import { Sun, Moon, Languages, Github, Home } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/new/components/ui/button";

/**
 * New sidebar (shadcn+tailwind+token) for the new layout.
 * Props come from DuckQueryApp: navItems [{id,label,icon}], activeId, onSelect,
 * theme/lang toggles, GitHub/back/welcome actions.
 * 
 * Now using shadcn/ui Button components for all interactive elements.
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

    return (
      <Button
        variant={active ? "default" : "ghost"}
        className="w-full justify-start gap-3"
        onClick={() => onSelect?.(item.id)}
      >
        {Icon ? <Icon className="h-4 w-4" /> : null}
        <span className="truncate">{item.label}</span>
      </Button>
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
          <Button
            variant="outline"
            size="sm"
            onClick={onToggleTheme}
            className="justify-center"
          >
            {isDarkMode ? (
              <Sun className="h-4 w-4" />
            ) : (
              <Moon className="h-4 w-4" />
            )}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleLocaleToggle}
            className="justify-center gap-2"
          >
            <Languages className="h-4 w-4" />
            <span className="uppercase">{safeLocale}</span>
          </Button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onOpenGithub}
            className="justify-center"
          >
            <Github className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onShowWelcome}
            className="justify-center"
          >
            <Home className="h-4 w-4" />
          </Button>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={onSwitchLegacy}
          className="w-full"
        >
          Legacy
        </Button>
      </div>
    </div>
  );
};

export default Sidebar;
