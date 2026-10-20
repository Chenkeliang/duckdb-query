import { useEffect, useState } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryTabs } from '../index';
import { agentChatBus } from '../../SQLQuery/ai/agentChatBus';
import { __resetWorkbenchCommands, queueWorkbenchCommand } from '../../workbenchCommands';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string, fallback?: unknown) => typeof fallback === 'string' ? fallback : key, i18n: { language: 'zh' } }) }));
vi.mock('../../SQLQuery', () => ({ SQLQueryPanel: ({ isActive, onSqlChange }: { isActive: boolean; onSqlChange: (sql: string) => void }) => {
  const [draft, setDraft] = useState('');
  useEffect(() => { onSqlChange(draft); }, [draft, onSqlChange]);
  useEffect(() => { if (isActive) return agentChatBus.registerInserter(setDraft); }, [isActive]);
  return <input aria-label={isActive ? 'active editor' : 'inactive editor'} value={draft} onChange={(event) => setDraft(event.target.value)} />;
} }));
vi.mock('../../SQLQuery/ai/AiChatDrawer', () => ({ AiChatDrawer: ({ onInsertSQL }: { onInsertSQL: (sql: string) => void }) => <button onClick={() => onInsertSQL('SELECT 43')}>Preview AI</button> }));
vi.mock('../../SQLQuery/ai/SQLChangePreviewDialog', () => ({ SQLChangePreviewDialog: ({ beforeSql, afterSql, targetClosed, stale, onCancel, onApply }: { beforeSql: string; afterSql: string; targetClosed: boolean; stale: boolean; onCancel: () => void; onApply: () => void }) => <div role="dialog"><pre>{beforeSql}</pre><pre>{afterSql}</pre>{stale && <span>Updated diff</span>}<button onClick={onCancel}>Cancel preview</button><button disabled={targetClosed || beforeSql === afterSql} onClick={onApply}>Apply changes</button></div> }));
vi.mock('../../JoinQuery', () => ({ JoinQueryPanel: () => null }));
vi.mock('../../SetOperations', () => ({ SetOperationsPanel: () => null }));
vi.mock('../../PivotTable/PivotPanel', () => ({ PivotPanel: () => null }));
vi.mock('../../components/SQLPreview', () => ({ SQLPreview: () => null }));
vi.mock('../../hooks/useGlobalHistory', () => ({ useGlobalHistory: () => ({ addToHistory: vi.fn() }) }));
vi.mock('@/hooks/useDatabaseConnections', () => ({ useDatabaseConnections: () => ({ connections: [] }) }));
vi.mock('@/hooks/useAiStatus', () => ({ useAiStatus: () => ({ configured: true }) }));
vi.mock('@/hooks/useFederatedQueryDetection', () => ({ useFederatedQueryDetection: () => ({ attachDatabases: [] }) }));
afterEach(() => { cleanup(); __resetWorkbenchCommands(); agentChatBus.__reset(); });
const execute = vi.fn(async () => undefined);
function Workspace() {
  const [activeTab, onTabChange] = useState('sql');
  return <QueryTabs activeTab={activeTab} onTabChange={onTabChange} selectedTablesByTab={{}} onExecute={execute} />;
}
const change = (sql: string) => fireEvent.change(screen.getByLabelText('active editor'), { target: { value: sql } });
const preview = () => fireEvent.click(screen.getByText('Preview AI'));
const apply = () => fireEvent.click(screen.getByText('Apply changes'));

describe('AI preview targets the concrete SQL tab', () => {
  it('cancel preserves the draft without executing', () => {
    render(<Workspace />); change('SELECT 42'); preview();
    expect(screen.getByRole('dialog')).toHaveTextContent('SELECT 42');
    expect(screen.getByLabelText('active editor')).toHaveValue('SELECT 42');
    fireEvent.click(screen.getByText('Cancel preview'));
    expect(screen.getByLabelText('active editor')).toHaveValue('SELECT 42');
    expect(execute).not.toHaveBeenCalled();
  });
  it('applies only to the tab reviewed even if activation changes', async () => {
    render(<Workspace />); change('SELECT 1');
    act(() => queueWorkbenchCommand('newTab', 'sql')); change('SELECT 2'); preview();
    fireEvent.click(screen.getByRole('tab', { name: 'SQL 1' })); apply();
    await waitFor(() => expect(screen.getByLabelText('active editor')).toHaveValue('SELECT 43'));
    expect(screen.getByRole('tab', { name: 'SQL 2' })).toHaveAttribute('aria-selected', 'true');
    fireEvent.click(screen.getByRole('tab', { name: 'SQL 1' }));
    expect(screen.getByLabelText('active editor')).toHaveValue('SELECT 1');
    expect(execute).not.toHaveBeenCalled();
  });
  it('builder mode reviews the last SQL draft and cancellation keeps the builder active', () => {
    render(<Workspace />); change('SELECT 42');
    fireEvent.click(screen.getByRole('tab', { name: 'query.tabs.join' })); preview();
    expect(screen.getByRole('dialog')).toHaveTextContent('SELECT 42');
    fireEvent.click(screen.getByText('Cancel preview'));
    expect(screen.getByRole('tab', { name: 'query.tabs.join' })).toHaveAttribute('aria-selected', 'true');
  });
  it('updates a stale preview before allowing a second confirmation', async () => {
    render(<Workspace />); change('SELECT 42'); preview(); change('SELECT 99'); apply();
    expect(screen.getByText('Updated diff')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toHaveTextContent('SELECT 99');
    expect(screen.getByLabelText('active editor')).toHaveValue('SELECT 99');
    apply(); await waitFor(() => expect(screen.getByLabelText('active editor')).toHaveValue('SELECT 43'));
  });
  it('does not redirect a closed target into another SQL tab', () => {
    render(<Workspace />); change('SELECT 1');
    act(() => queueWorkbenchCommand('newTab', 'sql')); change('SELECT 2'); preview();
    fireEvent.click(screen.getByRole('button', { name: '关闭 SQL 2' }));
    expect(screen.getByText('Apply changes')).toBeDisabled();
    fireEvent.click(screen.getByRole('tab', { name: 'SQL 1' }));
    expect(screen.getByLabelText('active editor')).toHaveValue('SELECT 1');
  });
  it('disables identical changes', () => {
    render(<Workspace />); change('SELECT 43'); preview(); expect(screen.getByText('Apply changes')).toBeDisabled();
  });
  it('creates a new SQL tab only after confirmation when all SQL tabs were closed', async () => {
    render(<Workspace />); fireEvent.click(screen.getByRole('button', { name: '关闭 SQL 1' })); preview();
    expect(screen.queryByRole('tab', { name: /SQL/ })).not.toBeInTheDocument();
    apply(); await waitFor(() => expect(screen.getByLabelText('active editor')).toHaveValue('SELECT 43'));
  });
});
