import React from "react";

/**
 * Minimal page shell for the new layout.
 * Provides sidebar + header slots with tokenized background/border.
 */
const PageShell = ({ sidebar, header, children }) => {
  return (
    <div className="dq-layout-shell flex min-h-screen bg-background text-foreground">
      <aside className="dq-layout-sidebar flex w-[260px] shrink-0 border-r border-border bg-surface">
        {sidebar}
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="dq-layout-header shrink-0 border-b border-border bg-background">
          {header}
        </header>
        <main className="dq-layout-main flex-1 min-w-0 overflow-auto bg-background">
          {children}
        </main>
      </div>
    </div>
  );
};

export default PageShell;
