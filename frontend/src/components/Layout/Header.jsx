import React from "react";
import { Github, Info, Moon, Sun, Menu } from "lucide-react";

const Header = ({
  title,
  onShowWelcome,
  onSwitchLegacy,
  onToggleSidebar,
  rightContent
}) => {
  return (
    <div className="dq-layout-header__inner flex h-[60px] items-center justify-between px-6">
      <div className="flex items-center gap-2">
        {onToggleSidebar ? (
          <button
            type="button"
            onClick={onToggleSidebar}
            className="flex h-10 w-10 items-center justify-center rounded-card border border-[var(--dq-border-subtle)] bg-[var(--dq-surface)] text-[var(--dq-text-primary)] transition-colors hover:border-[var(--dq-border-hover)] hover:bg-[var(--dq-surface-hover)] lg:hidden"
            aria-label="Toggle sidebar"
          >
            <Menu className="h-5 w-5" />
          </button>
        ) : null}
        <div className="text-lg font-semibold text-[var(--dq-text-primary)]">
          {title}
        </div>
      </div>
      <div className="flex items-center gap-3">{rightContent}</div>
    </div>
  );
};

export default Header;
