/** Regression 2026-10-12: viewing task results must never dispatch editor SQL. */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
const response = { success: true, data: [{ value: 7 }], columns: ['value'] };
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('../Query/QueryWorkspace', () => ({ QueryWorkspace: ({ backgroundResult }: { backgroundResult?: { sql: string } }) => <div>{backgroundResult?.sql}</div> }));
vi.mock('../Query/AsyncTasks', () => ({ AsyncTaskPanel: ({ onPreviewResult }: { onPreviewResult: (r: unknown, sql: string, source: unknown) => void }) => <button onClick={() => onPreviewResult(response, 'SELECT original_result', { type: 'duckdb' })}>view task</button> }));
vi.mock('../components/ui/sheet', () => ({ Sheet: ({ children }: { children: React.ReactNode }) => <>{children}</>, SheetContent: ({ children }: { children: React.ReactNode }) => <>{children}</>, SheetTitle: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
import { QueryWorkbenchPage } from '../QueryWorkbenchPage';
describe('task results stay independent from SQL drafts', () => {
  it('passes the result directly and closes the drawer without requesting SQL preview', () => {
    const preview = vi.fn(); const close = vi.fn();
    const props = { asyncTasksOpen: true, onPreviewSQL: preview, onAsyncTasksOpenChange: close };
    render(<QueryWorkbenchPage {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'view task' }));
    expect(screen.getByText('SELECT original_result')).toBeInTheDocument();
    expect(close).toHaveBeenCalledWith(false);
    expect(preview).not.toHaveBeenCalled();
  });
});
