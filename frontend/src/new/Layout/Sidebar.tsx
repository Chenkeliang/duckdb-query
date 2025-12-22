import React from "react";
import { Button } from "@/new/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/new/components/ui/tooltip";
import { PanelLeftClose, PanelLeft } from "lucide-react";
import { useTranslation } from "react-i18next";

interface NavItem {
  id: string;
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
}

interface SidebarProps {
  navItems?: NavItem[];
  activeId?: string;
  onSelect?: (id: string) => void;
  isDarkMode?: boolean;
  logoLight?: string;
  logoDark?: string;
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
}

/**
 * New sidebar (shadcn+tailwind+token) for the new layout.
 * Props come from DuckQueryApp: navItems [{id,label,icon}], activeId, onSelect.
 * 
 * Now using shadcn/ui Button components for all interactive elements.
 * Global actions (theme/language/github) have been moved to Header.
 * Supports collapsed state for space efficiency.
 */
const Sidebar: React.FC<SidebarProps> = ({
  navItems = [],
  activeId,
  onSelect,
  // isDarkMode, // Unused with universal logo
  logoLight,
  // logoDark, // Unused with universal logo
  collapsed = false,
  onCollapsedChange
}) => {
  const { t } = useTranslation("common");

  const NavButton = ({ item }: { item: NavItem }) => {
    const Icon = item.icon;
    const active = item.id === activeId;

    const button = (
      <Button
        variant={active ? "default" : "ghost"}
        className={collapsed ? "w-10 h-10 p-0 justify-center" : "w-full justify-start gap-3"}
        onClick={() => onSelect?.(item.id)}
        aria-label={item.label}
      >
        {Icon ? <Icon className="h-4 w-4 shrink-0" /> : null}
        {!collapsed && <span className="truncate">{item.label}</span>}
      </Button>
    );

    if (collapsed) {
      return (
        <Tooltip>
          <TooltipTrigger asChild>
            {button}
          </TooltipTrigger>
          <TooltipContent side="right">
            {item.label}
          </TooltipContent>
        </Tooltip>
      );
    }

    return button;
  };

  return (
    <TooltipProvider delayDuration={0}>
      <div className="dq-layout-sidebar-inner flex h-full w-full flex-col bg-surface text-foreground">
        {/* Logo 区域 + 折叠按钮 */}
        <div className={`h-14 flex items-center border-b border-border ${collapsed ? 'px-2 justify-center' : 'px-3 justify-between'}`}>
          {/* Logo Area */}
          <div className="flex items-center gap-2 overflow-hidden">
            {/* Logo Icon (Always visible) */}
            <div className={`shrink-0 flex items-center justify-center ${collapsed ? "w-12" : "w-12"}`}>
              {logoLight ? (
                <img src={logoLight} alt="DuckQ" className="h-12 w-12" />
              ) : (
                <div className="w-12 h-12 rounded-lg bg-primary flex items-center justify-center text-primary-foreground font-bold shadow-lg shadow-orange-900/20 text-xl">D</div>
              )}
            </div>

            {/* Brand Text (Visible when expanded) */}
            {!collapsed && (
              <div className="flex flex-col">
                <div className="font-semibold text-lg leading-none tracking-tight">DuckQ</div>
              </div>
            )}
          </div>
          {!collapsed && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => onCollapsedChange?.(!collapsed)}
                  aria-label={t("sidebar.collapse")}
                >
                  <PanelLeftClose className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">
                {t("sidebar.collapse")}
              </TooltipContent>
            </Tooltip>
          )}
        </div>

        {/* 导航 */}
        <nav className={`flex-1 space-y-1 ${collapsed ? 'p-2' : 'p-3'}`}>
          {navItems.map(item => (
            <NavButton key={item.id} item={item} />
          ))}
        </nav>

        {/* 底部区域 - 折叠时显示展开按钮 */}
        {collapsed && (
          <div className="border-t border-border p-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  className="w-10 h-10 p-0 justify-center"
                  onClick={() => onCollapsedChange?.(false)}
                  aria-label={t("sidebar.expand")}
                >
                  <PanelLeft className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">
                {t("sidebar.expand")}
              </TooltipContent>
            </Tooltip>
          </div>
        )}
      </div>
    </TooltipProvider>
  );
};

export default Sidebar;
