import React from "react";

const MainLayout = ({
  sidebar,
  header,
  children,
  isSidebarOpen = false,
  onCloseSidebar,
  isSidebarExpanded = true,
  onSidebarEnter,
  onSidebarLeave
}) => {
  return (
    <div className="dq-layout-root flex h-screen min-w-[320px] overflow-hidden bg-[var(--dq-background)] text-[var(--dq-text-primary)]">
      <aside
        className={`dq-layout-sidebar relative hidden shrink-0 bg-[var(--dq-surface-alt)] transition-all duration-200 lg:flex ${
          isSidebarExpanded ? "w-[260px]" : "w-[72px]"
        }`}
        onMouseEnter={onSidebarEnter}
        onMouseLeave={onSidebarLeave}
      >
        {sidebar}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-0 w-px bg-[var(--dq-border-card)]"
        />
      </aside>
      <div className="dq-layout-main flex min-w-0 flex-1 flex-col bg-[var(--dq-background)]">
        <div className="dq-layout-header shrink-0 border-b border-[var(--dq-border-subtle)] bg-[var(--dq-background)]">
          {header}
        </div>
        <div className="dq-layout-content flex-1 overflow-auto bg-[var(--dq-background)]">
          {children}
        </div>
      </div>
      {isSidebarOpen ? (
        <div className="dq-layout-sidebar-drawer fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-black/30"
            onClick={onCloseSidebar}
            role="presentation"
          />
          <div className="dq-layout-sidebar-drawer-panel absolute left-0 top-0 h-full w-[240px] bg-[var(--dq-surface-alt)] shadow-lg">
            {sidebar}
            <span
              aria-hidden
              className="pointer-events-none absolute inset-y-0 right-0 w-px bg-[var(--dq-border-card)]"
            />
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default MainLayout;
