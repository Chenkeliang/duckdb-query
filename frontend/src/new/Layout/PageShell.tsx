import React, { ReactNode } from "react";
import { QueryProvider } from "@/new/providers/QueryProvider";

interface PageShellProps {
  sidebar?: ReactNode;
  header?: ReactNode;
  children: ReactNode;
  sidebarCollapsed?: boolean;
}

/**
 * Minimal page shell for the new layout.
 * Provides sidebar + header slots with tokenized background/border.
 * Includes QueryProvider for TanStack Query support.
 * Supports collapsible sidebar.
 * 
 * Note: Toaster is rendered globally in main.jsx
 */
const PageShell: React.FC<PageShellProps> = ({ sidebar, header, children, sidebarCollapsed = false }) => {
  return (
    <QueryProvider>
      <div className="dq-layout-shell flex min-h-screen bg-background text-foreground">
        <aside 
          className={`bg-surface border-r border-border flex flex-col shrink-0 z-50 transition-all duration-200 ${
            sidebarCollapsed ? 'w-14' : 'w-64'
          }`}
        >
          {sidebar}
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="dq-layout-header shrink-0">{header}</header>
          <main className="dq-layout-main flex-1 min-w-0 overflow-auto bg-background">
            {children}
          </main>
        </div>
      </div>
    </QueryProvider>
  );
};

export default PageShell;
