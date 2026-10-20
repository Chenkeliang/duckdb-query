import React from "react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export interface RailItem {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Active state; defaults to `id === activeId`. */
  active?: boolean;
  /** Small dot on the icon, e.g. running async work. */
  badge?: boolean;
  onClick?: () => void;
  mobileOnly?: boolean;
}

interface AppRailProps {
  logo: string;
  items: RailItem[];
  footerItems?: RailItem[];
  activeId?: string;
  onSelect?: (id: string) => void;
}

/**
 * 56px icon rail (graphite redesign). Replaces the collapsible sidebar:
 * one control per destination, a 2px ink bar marks the active one,
 * labels live in tooltips and aria-labels.
 */
const AppRail: React.FC<AppRailProps> = ({ logo, items, footerItems = [], activeId, onSelect }) => {
  const renderItem = (item: RailItem) => {
    const Icon = item.icon;
    const active = item.active ?? item.id === activeId;
    return (
      <Tooltip key={item.id}>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={() => (item.onClick ? item.onClick() : onSelect?.(item.id))}
            aria-label={item.label}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative grid h-10 w-10 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring",
              active && "bg-muted text-foreground",
              item.mobileOnly && "sm:hidden"
            )}
          >
            {active && (
              <span aria-hidden className="absolute -top-1.5 left-2.5 right-2.5 h-0.5 rounded-full sm:-left-2 sm:right-auto sm:top-2.5 sm:bottom-2.5 sm:h-auto sm:w-0.5 bg-foreground" />
            )}
            <Icon className="size-4.5" />
            {item.badge && (
              <span aria-hidden className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-primary ring-2 ring-background" />
            )}
          </button>
        </TooltipTrigger>
        <TooltipContent side="right">{item.label}</TooltipContent>
      </Tooltip>
    );
  };

  return (
    <TooltipProvider delayDuration={300}>
      <nav aria-label="DuckQuery" className="flex h-13 w-full items-center justify-around gap-0.5 px-1 sm:h-full sm:w-14 sm:flex-col sm:justify-start sm:px-0 sm:py-3">
        <div className="mb-3 hidden h-8 w-8 place-items-center sm:grid">
          <img src={logo} alt="DuckQuery" className="h-6 w-7" />
        </div>
        {items.map(renderItem)}
        <div className="hidden sm:block sm:flex-1" />
        {footerItems.map(renderItem)}
      </nav>
    </TooltipProvider>
  );
};

export default AppRail;
