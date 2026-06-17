import React, { ReactNode } from "react";
import { QueryProvider } from "@/providers/QueryProvider";

interface PageShellProps {
  sidebar?: ReactNode;
  header?: ReactNode;
  children: ReactNode;
  sidebarCollapsed?: boolean;
}

// macOS desktop runs an Overlay title bar (tauri.conf), so the native white bar is
// gone — reserve a slim dark draggable strip for the traffic lights. Web/Docker and
// other desktop platforms keep their normal chrome (strip not rendered).
const isTauri =
  typeof window !== "undefined" &&
  Boolean((window as { __TAURI__?: unknown; __TAURI_INTERNALS__?: unknown }).__TAURI__ ||
    (window as { __TAURI__?: unknown; __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__);
const isMac =
  typeof navigator !== "undefined" && /Mac/.test(navigator.platform || navigator.userAgent);
const macOverlayTitlebar = isTauri && isMac;

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
      <div className="dq-layout-shell flex flex-col h-screen bg-background text-foreground overflow-hidden">
        {macOverlayTitlebar && (
          <div
            data-tauri-drag-region
            className="h-7 shrink-0 bg-surface border-b border-border"
          />
        )}
        <div className="flex min-h-0 flex-1">
          <aside
            className={`bg-surface border-r border-border flex flex-col shrink-0 z-50 transition-all duration-200 ${
              sidebarCollapsed ? 'w-14' : 'w-64'
            }`}
          >
            {sidebar}
          </aside>
          <div className="flex min-w-0 flex-1 flex-col h-full">
            <header className="dq-layout-header shrink-0">{header}</header>
            <main className="dq-layout-main flex-1 min-w-0 min-h-0 overflow-hidden bg-background">
              {children}
            </main>
          </div>
        </div>
      </div>
    </QueryProvider>
  );
};

export default PageShell;
