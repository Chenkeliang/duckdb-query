/** Regression 2026-10-30: recommendations and JSON configuration follow table identity. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { InsightsPanel } from '../InsightsPanel';
import type { InsightQueryPayload } from '@/api';

const api = vi.hoisted(() => ({ schema: vi.fn(), paths: vi.fn(), generate: vi.fn() }));
vi.mock('@/api', () => ({
  getColumnInsights: api.schema, getJsonPaths: api.paths, generateColumnInsightQuery: api.generate,
  toAttachDatabasesPayload: (items: { alias: string; connectionId: string }[] = []) => items.map((item) => ({ alias: item.alias, connection_id: item.connectionId })),
}));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string, options?: { index?: number; path?: string }) => `${key}${options?.index ? ` ${options.index}` : ''}${options?.path ? ` ${options.path}` : ''}` }) }));
vi.mock('@/components/SQLHighlight', () => ({ SQLHighlight: ({ sql }: { sql: string }) => <pre>{sql}</pre> }));
vi.mock('@/Query/PivotTable/PivotFilters', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/Query/PivotTable/PivotFilters')>(),
  PivotFilters: ({ onChange }: { onChange: (filters: unknown[]) => void }) => <button onClick={() => onChange([{ id: 'filter', column: 'amount', operator: '>', value: '10' }])}>change filter</button>,
}));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

function setup() {
  api.schema.mockImplementation(async ({ table_name }: { table_name: string }) => ({ columns: table_name.includes('text_only')
    ? [{ name: 'name', type: 'VARCHAR', aggregations: ['COUNT', 'COUNT_DISTINCT'], json_candidate: true }]
    : [{ name: 'amount', type: 'DECIMAL(20,4)', aggregations: ['COUNT', 'COUNT_DISTINCT', 'SUM', 'AVG', 'MIN', 'MAX'], json_candidate: false },
      { name: 'payload', type: 'VARCHAR', aggregations: ['COUNT', 'COUNT_DISTINCT'], json_candidate: true }] }));
  api.generate.mockImplementation(async (payload: InsightQueryPayload) => ({ sql: `SELECT ${payload.metrics?.length ? 'count(*)' : 'json_extract_string(payload)'} FROM ${payload.table_name}`, columns: [], kind: payload.metrics?.length ? 'metrics' : 'json' }));
  api.paths.mockResolvedValue({ paths: [{ pointer: '/user/id', types: ['number'], occurrences: 2 }], sampled_rows: 3, valid_rows: 2, skipped_rows: 1, truncated: false, sample_limit: 100 });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const onExecute = vi.fn(async () => undefined);
  const onResultViewRequest = vi.fn();
  const element = (name: string) => <QueryClientProvider client={client}><InsightsPanel selectedTables={[{ name, source: 'duckdb' }]} onExecute={onExecute} onResultViewRequest={onResultViewRequest} /></QueryClientProvider>;
  return { element, onExecute, onResultViewRequest };
}

describe('InsightsPanel', () => {
  it('previews recommendations without executing; selection controls the exact query', async () => {
    const context = setup();
    render(context.element('sales'));
    const run = screen.getByRole('button', { name: 'query.execute' });
    await waitFor(() => expect(run).toBeEnabled());
    expect(context.onExecute).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'insights.addMetric' }));
    await waitFor(() => expect(api.generate).toHaveBeenLastCalledWith(expect.objectContaining({ metrics: [expect.objectContaining({ aggregation: 'COUNT_ROWS' }), expect.objectContaining({ column: 'amount', aggregation: 'AVG' })] })));
    await waitFor(() => expect(run).toBeEnabled());
    fireEvent.click(run);
    await waitFor(() => expect(context.onExecute).toHaveBeenCalledWith('SELECT count(*) FROM sales', { type: 'duckdb' }, { baseSql: 'SELECT count(*) FROM sales' }));
    expect(context.onResultViewRequest).toHaveBeenCalledWith('metrics');
  });

  it('clears old configuration on table switch and suggests counts for a text-only schema', async () => {
    const context = setup();
    const view = render(context.element('sales'));
    await waitFor(() => expect(screen.getByRole('button', { name: 'insights.addMetric' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'insights.addMetric' }));
    expect(await screen.findByLabelText('insights.outputName 2')).toHaveValue('avg_amount_1');
    view.rerender(context.element('text_only'));
    await waitFor(() => expect(screen.getByRole('button', { name: 'insights.addMetric' })).toBeEnabled());
    expect(screen.queryByLabelText('insights.outputName 2')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'insights.addMetric' }));
    await waitFor(() => expect(api.generate).toHaveBeenLastCalledWith(expect.objectContaining({ metrics: [expect.anything(), expect.objectContaining({ column: 'name', aggregation: 'COUNT_DISTINCT' })] })));
  });

  it('samples only on request and defaults JSON projection to lossless text', async () => {
    const context = setup();
    const user = userEvent.setup();
    Element.prototype.hasPointerCapture = () => false;
    Element.prototype.setPointerCapture = () => undefined;
    Element.prototype.releasePointerCapture = () => undefined;
    Element.prototype.scrollIntoView = () => undefined;
    render(context.element('sales'));
    await waitFor(() => expect(screen.getByRole('button', { name: 'insights.addMetric' })).toBeEnabled());
    await user.click(screen.getByRole('tab', { name: 'insights.json' }));
    await user.click(screen.getByRole('combobox', { name: 'insights.jsonColumn' }));
    await user.click(await screen.findByRole('option', { name: 'payload · VARCHAR' }));
    expect(api.paths).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'insights.discover' }));
    const checkbox = await screen.findByRole('checkbox', { name: 'insights.selectPath /user/id' });
    await user.click(checkbox);
    await waitFor(() => expect(api.generate).toHaveBeenLastCalledWith(expect.objectContaining({ extractions: [expect.objectContaining({ pointer: '/user/id', target_type: 'VARCHAR' })] })));
    const run = screen.getByRole('button', { name: 'query.execute' });
    await waitFor(() => expect(run).toBeEnabled());
    await user.click(run);
    await waitFor(() => expect(context.onResultViewRequest).toHaveBeenCalledWith('table'));
  });

  it('shows generation errors and never executes stale SQL', async () => {
    const context = setup();
    render(context.element('sales'));
    await waitFor(() => expect(screen.getByRole('button', { name: 'query.execute' })).toBeEnabled());
    api.generate.mockRejectedValue(new Error('Output aliases must be unique'));
    fireEvent.change(screen.getByLabelText('insights.outputName 1'), { target: { value: 'duplicate' } });
    expect(await screen.findByRole('alert')).toHaveTextContent('Output aliases must be unique');
    expect(screen.getByRole('button', { name: 'query.execute' })).toBeDisabled();
    expect(context.onExecute).not.toHaveBeenCalled();
  });

  it('invalidates sampled paths after filters change and sends filters on rediscovery', async () => {
    const context = setup();
    const user = userEvent.setup();
    render(context.element('sales'));
    await waitFor(() => expect(screen.getByRole('button', { name: 'insights.addMetric' })).toBeEnabled());
    await user.click(screen.getByRole('tab', { name: 'insights.json' }));
    await user.click(screen.getByRole('combobox', { name: 'insights.jsonColumn' }));
    await user.click(await screen.findByRole('option', { name: 'payload · VARCHAR' }));
    await user.click(screen.getByRole('button', { name: 'insights.discover' }));
    await user.click(await screen.findByRole('checkbox', { name: 'insights.selectPath /user/id' }));
    await user.click(screen.getByRole('button', { name: 'change filter' }));
    expect(screen.queryByRole('checkbox', { name: 'insights.selectPath /user/id' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'query.execute' })).toBeDisabled();
    expect(api.paths).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: 'insights.discover' }));
    await waitFor(() => expect(api.paths).toHaveBeenLastCalledWith(expect.objectContaining({ filters: [{ column: 'amount', operator: '>', value: 10 }] })));
  });

  it('exposes the shared cancel action during an active execution', async () => {
    const context = setup();
    let complete = () => {};
    context.onExecute.mockImplementation(() => new Promise<undefined>((resolve) => { complete = () => resolve(undefined); }));
    const cancel = vi.fn(() => complete());
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><InsightsPanel selectedTables={[{ name: 'sales', source: 'duckdb' }]} onExecute={context.onExecute} onCancel={cancel} /></QueryClientProvider>);
    const run = screen.getByRole('button', { name: 'query.execute' });
    await waitFor(() => expect(run).toBeEnabled());
    fireEvent.click(run);
    fireEvent.click(await screen.findByRole('button', { name: 'query.cancel' }));
    expect(cancel).toHaveBeenCalledTimes(1);
  });
});
