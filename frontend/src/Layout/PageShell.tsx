import React, { ReactNode } from "react";
import { QueryProvider } from "@/providers/QueryProvider";

interface PageShellProps {
  /** 56px icon rail */
  rail?: ReactNode;
  /** 28px status bar along the bottom edge */
  statusBar?: ReactNode;
  children: ReactNode;
}

// macOS desktop runs an Overlay title bar (tauri.conf), so the native bar is
// gone — reserve a slim draggable strip for the traffic lights. Web/Docker and
// other desktop platforms keep their normal chrome (strip not rendered).
const isTauri =
  typeof window !== "undefined" &&
  Boolean((window as { __TAURI__?: unknown; __TAURI_INTERNALS__?: unknown }).__TAURI__ ||
    (window as { __TAURI__?: unknown; __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__);
const isMac =
  typeof navigator !== "undefined" && /Mac/.test(navigator.platform || navigator.userAgent);
const macOverlayTitlebar = isTauri && isMac;

/**
 * App shell (graphite redesign): icon rail | page, status bar underneath.
 * There is no global header — each page owns its own top row.
 * Includes QueryProvider for TanStack Query support; Toaster is global (main.tsx).
 */
const PageShell: React.FC<PageShellProps> = ({ rail, statusBar, children }) => {
  return (
    <QueryProvider>
      <div className="dq-layout-shell flex h-screen flex-col overflow-hidden bg-background text-foreground">
        {macOverlayTitlebar && (
          <div data-tauri-drag-region className="h-7 shrink-0 border-b border-border bg-background" />
        )}
        <div className="flex min-h-0 flex-1 flex-col-reverse sm:flex-row">
          <aside className="z-50 flex shrink-0 border-t border-border bg-background sm:flex-col sm:border-r sm:border-t-0">{rail}</aside>
          <main className="dq-layout-main flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background">
            {children}
          </main>
        </div>
        <div className="hidden sm:block">{statusBar}</div>
      </div>
    </QueryProvider>
  );
};

export default PageShell;
