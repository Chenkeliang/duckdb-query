import React from 'react';
import { createPortal } from 'react-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useAiDock } from '../SQLQuery/ai/aiDockContext';
import { agentChatBus } from '../SQLQuery/ai/agentChatBus';
const controls = vi.hoisted(() => ({ narrow: true, mediaChanged: () => {}, finishSheetClose: () => {} }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string, fallback?: string) => fallback ?? key }) }));
vi.mock('react-resizable-panels', () => ({
  Panel: React.forwardRef(({ children, id }: { children: React.ReactNode; id?: string }, ref) => {
    React.useImperativeHandle(ref, () => ({ collapse() {}, expand() {}, isExpanded: () => true }));
    return <div data-panel={id}>{children}</div>;
  }),
  PanelGroup: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PanelResizeHandle: () => null, getPanelGroupElement: () => null,
}));
vi.mock('@/components/ui/sheet', () => {
  const Open = React.createContext(false);
  return {
    Sheet: ({ open, children }: { open: boolean; children: React.ReactNode }) => <Open.Provider value={open}>{children}</Open.Provider>,
    SheetTitle: () => null,
    SheetContent: ({ children, showCloseButton }: { children: React.ReactNode; showCloseButton?: boolean }) => {
      const open = React.useContext(Open); const [mounted, setMounted] = React.useState(open);
      React.useEffect(() => {
        if (open) setMounted(true);
        else if (mounted && showCloseButton === false) controls.finishSheetClose = () => setMounted(false);
        else if (!open) setMounted(false);
      }, [open, mounted, showCloseButton]);
      return mounted ? <div data-testid="animated-sheet">{children}</div> : null;
    },
  };
});
vi.mock('@/hooks/useAppConfig', () => ({ useAppConfig: () => ({ maxQueryRows: 100 }) }));
vi.mock('@/hooks/useQueryRunner', () => ({ useQueryRunner: () => ({ selectedTables: { sql: [] }, currentTab: 'sql', resultTabs: [], queryResults: null, execute: vi.fn(), handleTabChange: vi.fn() }) }));
vi.mock('../DataSourcePanel', () => ({ DataSourcePanel: () => null }));
vi.mock('../ResultPanel', () => ({ ResultPanel: () => null }));
vi.mock('../Bookmarks/SavedQueriesPanel', () => ({ SavedQueriesPanel: () => null }));
vi.mock('../History/GlobalHistoryPanel', () => ({ GlobalHistoryPanel: () => null }));
vi.mock('../hooks/useGlobalHistory', () => ({ useGlobalHistory: () => ({ history: [], deleteHistoryItem: vi.fn(), clearHistory: vi.fn() }) }));
vi.mock('../QueryTabs', () => ({ QueryTabs: React.forwardRef(() => {
  const dock = useAiDock(); const [draft, setDraft] = React.useState('');
  const agent = <textarea aria-label="agent draft" value={draft} onChange={(e) => setDraft(e.target.value)} />;
  return <div data-testid="query-editor">Editor stays visible{dock ? createPortal(agent, dock) : agent}</div>;
}) }));
import { QueryWorkspace } from '../QueryWorkspace';
afterEach(() => { cleanup(); agentChatBus.__reset(); vi.unstubAllGlobals(); });
it('late mobile-sheet cleanup cannot clear the new desktop AI dock or lose the draft', async () => {
  controls.narrow = true;
  vi.stubGlobal('matchMedia', () => ({ get matches() { return controls.narrow; }, addEventListener: (_event: string, listener: () => void) => { controls.mediaChanged = listener; }, removeEventListener() {} }));
  agentChatBus.setOpen(true);
  render(<QueryClientProvider client={new QueryClient()}><QueryWorkspace /></QueryClientProvider>);
  await waitFor(() => expect(screen.getByTestId('animated-sheet')).toContainElement(screen.getByLabelText('agent draft')));
  fireEvent.change(screen.getByLabelText('agent draft'), { target: { value: 'keep this question\nand SQL' } });
  act(() => { controls.narrow = false; controls.mediaChanged(); });
  await waitFor(() => expect(document.querySelector('[data-panel="ai"]')).toContainElement(screen.getByLabelText('agent draft')));
  act(() => controls.finishSheetClose());
  expect(document.querySelector('[data-panel="ai"]')).toContainElement(screen.getByLabelText('agent draft'));
  expect(screen.getByLabelText('agent draft')).toHaveValue('keep this question\nand SQL');
  expect(screen.getByTestId('query-editor')).not.toContainElement(screen.getByLabelText('agent draft'));
});
