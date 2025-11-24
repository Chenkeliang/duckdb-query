import React from "react";
import {
  ChevronLeft,
  ChevronRight,
  Github,
  HardDrive,
  Info,
  Languages,
  LayoutDashboard,
  ListTodo,
  Moon,
  Sun,
  Terminal
} from "lucide-react";
import duckLogoDark from "../../assets/duckquery-dark.svg";
import duckLogoLight from "../../assets/Duckquerylogo.svg";
import duckLogoDarkSmall from "../../../assets/duck-query-dark-small.svg";
import duckLogoLightSmall from "../../../assets/duck-query-light-small.svg";

const navItems = [
  { id: "datasource", label: "nav.datasource", icon: HardDrive },
  { id: "unifiedquery", label: "nav.unifiedquery", icon: LayoutDashboard },
  { id: "tablemanagement", label: "nav.tablemanagement", icon: Terminal },
  { id: "asynctasks", label: "nav.asynctasks", icon: ListTodo }
];

const Sidebar = ({
  currentTab,
  onTabChange,
  isDarkMode,
  isExpanded = true,
  isPinned = true,
  locale = "zh",
  onLocaleChange,
  onToggleTheme,
  onOpenGithub,
  githubStars,
  onShowWelcome,
  onSwitchLegacy,
  onTogglePin,
  t
}) => {
  const wrapperPadding = isExpanded ? "px-3" : "px-2";

  return (
    <div
      className={`dq-layout-sidebar__inner flex h-full flex-col ${wrapperPadding} py-4 overflow-hidden`}
    >
      {isExpanded ? (
        <div className="flex h-12 items-center gap-2 rounded-[14px] px-2">
          <div className="flex items-center gap-2 justify-start">
            <img
              src={isDarkMode ? duckLogoDark : duckLogoLight}
              alt="Duck Query"
              className="h-10 w-auto select-none"
              draggable={false}
            />
          </div>
          <div className="ml-auto hidden lg:block">
            <button
              type="button"
              onClick={onTogglePin}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--dq-border-subtle)] bg-[var(--dq-surface)] text-[var(--dq-text-primary)] transition-colors hover:border-[var(--dq-border-hover)] hover:bg-[var(--dq-surface-hover)]"
              title={isPinned ? "收起导航" : "展开导航"}
            >
              {isPinned ? (
                <ChevronLeft className="h-[16px] w-[16px]" />
              ) : (
                <ChevronRight className="h-[16px] w-[16px]" />
              )}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex h-12 w-full items-center justify-center">
          <img
            src={isDarkMode ? duckLogoDarkSmall : duckLogoLightSmall}
            alt="Duck Query"
            className="h-10 w-10 select-none"
            draggable={false}
          />
        </div>
      )}

      <div className="mt-6 flex flex-1 flex-col gap-2">
        {navItems.map(({ id, label, icon: Icon }) => {
          const active = currentTab === id;
          const borderColor = active
            ? "var(--dq-accent-primary)"
            : "var(--dq-border-subtle)";
          return (
            <button
              key={id}
              type="button"
              onClick={() => onTabChange?.(id)}
              aria-current={active ? "page" : undefined}
              aria-label={t?.(label) ?? label}
              className={[
                "group flex items-center gap-3 rounded-[14px] border bg-[var(--dq-surface)] text-sm font-medium transition-all duration-150",
                isExpanded
                  ? "h-12 w-full px-3 justify-start"
                  : "h-12 w-12 px-0 justify-center",
                active
                  ? "text-[var(--dq-accent-primary)] shadow-[0_16px_36px_-28px_rgba(0,0,0,0.55)]"
                  : "text-[var(--dq-text-primary)] hover:bg-[var(--dq-surface-hover)]"
              ].join(" ")}
              style={{ borderColor }}
            >
              <span
                className={`flex h-9 w-9 shrink-0 items-center justify-center transition-colors ${
                  active
                    ? "text-[var(--dq-accent-primary)]"
                    : "text-[var(--dq-text-primary)]"
                }`}
              >
                <Icon className="h-[18px] w-[18px]" />
              </span>
              {isExpanded ? (
                <span className="truncate">{t?.(label) ?? label}</span>
              ) : null}
            </button>
          );
        })}
      </div>

      <div className="mt-auto border-t border-[var(--dq-border-subtle)] pt-3">
        <div
          className={`flex ${
            isExpanded ? "flex-wrap gap-2" : "flex-col items-center gap-2"
          }`}
        >
          <button
            type="button"
            onClick={onToggleTheme}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--dq-border-subtle)] bg-[var(--dq-surface-active)] text-[var(--dq-text-primary)] transition-colors hover:border-[var(--dq-border-hover)] hover:bg-[var(--dq-surface-hover)]"
            title={isDarkMode ? "切换到浅色" : "切换到暗色"}
          >
            {isDarkMode ? (
              <Sun className="h-[16px] w-[16px]" />
            ) : (
              <Moon className="h-[16px] w-[16px]" />
            )}
          </button>

          <button
            type="button"
            onClick={() => onLocaleChange?.(locale === "zh" ? "en" : "zh")}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--dq-border-subtle)] bg-[var(--dq-surface-active)] text-[var(--dq-text-primary)] transition-colors hover:border-[var(--dq-border-hover)] hover:bg-[var(--dq-surface-hover)]"
            title="中 / EN"
          >
            <Languages className="h-[16px] w-[16px]" />
          </button>

          <button
            type="button"
            onClick={onOpenGithub}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--dq-border-subtle)] bg-[var(--dq-surface-active)] text-[var(--dq-text-primary)] transition-colors hover:border-[var(--dq-border-hover)] hover:bg-[var(--dq-surface-hover)]"
            title="GitHub"
          >
            <Github className="h-[16px] w-[16px]" />
          </button>

          {onShowWelcome ? (
            <button
              type="button"
              onClick={onShowWelcome}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--dq-border-subtle)] bg-[var(--dq-surface-active)] text-[var(--dq-text-primary)] transition-colors hover:border-[var(--dq-border-hover)] hover:bg-[var(--dq-surface-hover)]"
              title="功能简介"
            >
              <Info className="h-[16px] w-[16px]" />
            </button>
          ) : null}

          {onSwitchLegacy ? (
            <button
              type="button"
              onClick={onSwitchLegacy}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--dq-border-subtle)] bg-[var(--dq-surface-active)] text-[var(--dq-text-primary)] transition-colors hover:border-[var(--dq-border-hover)] hover:bg-[var(--dq-surface-hover)]"
              title="回到旧版"
            >
              <LayoutDashboard className="h-[16px] w-[16px]" />
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default Sidebar;
