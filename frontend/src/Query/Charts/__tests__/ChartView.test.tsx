import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChartView } from '../ChartView';

const api = vi.hoisted(() => ({ runAgent: vi.fn(), executeDuckDBSQL: vi.fn(), executeFederatedQuery: vi.fn(), executeQuackQuery: vi.fn() }));
vi.mock('@/api', () => api);
vi.mock('@/api/queryApi', () => api);
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('../ChartCanvas', () => ({ ChartCanvas: ({ spec, unit }: { spec: unknown; unit?: string }) => <><div data-testid="chart-spec">{JSON.stringify(spec)}</div><div data-testid="chart-unit">{unit}</div></> }));

const columns = [{ name: 'order_id', type: 'BIGINT' }, { name: 'day', type: 'DATE' }, { name: 'amount', type: 'DECIMAL(20,4)' }];
const rows = [{ order_id: 1, day: '2026-10-01', amount: '9007199254740993.1234' }];
const source = { sql: 'SELECT * FROM orders LIMIT 100', baseSql: 'SELECT * FROM orders', requiresFederated: false };
function view(extra = {}) {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const result = render(<QueryClientProvider client={client}>
    <ChartView columns={columns} rows={rows} truncated={false} source={source} aiEnabled {...extra} />
  </QueryClientProvider>);
  return { ...result, replaceRows: (next: typeof rows) => result.rerender(<QueryClientProvider client={client}>
    <ChartView columns={columns} rows={next} truncated={false} source={source} aiEnabled {...extra} />
  </QueryClientProvider>) };
}

beforeEach(() => {
  vi.clearAllMocks();
  api.runAgent.mockResolvedValue({ result: { type: 'bar', x: 'day', y: ['order_id'], agg: 'sum', dataMode: 'rows', reason: 'Example reason' } });
  api.executeDuckDBSQL.mockResolvedValue({ data: [{ dim: '2026-10-01', m_0: '9007199254740993.1234' }] });
});

describe('chart recommendation interaction regressions (2026-11-02)', () => {
  it('shows only the three common chart controls until more options are requested (2026-11-02)', () => {
    view();
    fireEvent.click(screen.getByRole('button', { name: 'query.chart.configure' }));
    expect(screen.getAllByRole('combobox')).toHaveLength(3);
    for (const label of ['type', 'dimension', 'metric']) {
      expect(screen.getByRole('combobox', { name: `query.chart.${label}` })).toBeInTheDocument();
    }
    expect(screen.queryByRole('textbox', { name: 'query.chart.unit' })).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'query.chart.calculation' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'query.chart.suggest' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'query.chart.advanced' }));
    expect(screen.getByRole('textbox', { name: 'query.chart.unit' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'query.chart.calculation' })).toBeInTheDocument();
    expect(api.executeDuckDBSQL).not.toHaveBeenCalled();
  });

  it('opens recommendations without calling a model or changing the chart (2026-11-02)', () => {
    view();
    fireEvent.click(screen.getByRole('button', { name: 'query.chart.configure' }));
    fireEvent.click(screen.getByRole('button', { name: 'query.chart.recommendations' }));
    expect(screen.getByRole('button', { name: 'query.chart.suggest' })).toBeInTheDocument();
    expect(screen.getByTestId('chart-spec')).toHaveTextContent('amount');
    expect(api.runAgent).not.toHaveBeenCalled();
    expect(api.executeDuckDBSQL).not.toHaveBeenCalled();
  });

  it('keeps the aggregation meaning visible while advanced settings are collapsed (2026-11-02)', async () => {
    api.runAgent.mockResolvedValueOnce({ result: { type: 'line', x: 'day', y: ['amount'], agg: 'sum', xBin: 'day', dataMode: 'aggregate', reason: 'Daily sum' } });
    view();
    fireEvent.click(screen.getByRole('button', { name: 'query.chart.configure' }));
    fireEvent.click(screen.getByRole('button', { name: 'query.chart.recommendations' }));
    fireEvent.click(screen.getByRole('button', { name: 'query.chart.suggest' }));
    await screen.findByText('Daily sum');
    fireEvent.click(screen.getByRole('button', { name: 'query.chart.previewAi' }));
    await screen.findByRole('button', { name: 'query.chart.apply' });
    fireEvent.click(screen.getByRole('button', { name: 'query.chart.apply' }));
    fireEvent.click(screen.getByRole('button', { name: 'query.chart.recommendations' }));
    expect(screen.getByLabelText('query.chart.calculation')).toHaveTextContent('query.chart.aggregations.sum');
    expect(screen.getByLabelText('query.chart.calculation')).toHaveTextContent('query.chart.day');
    expect(screen.queryByRole('combobox', { name: 'query.chart.calculation' })).not.toBeInTheDocument();
    expect(api.executeDuckDBSQL).toHaveBeenCalledTimes(1);
  });

  it('opening a truncated result never calls a model or reruns the query', () => {
    view({ truncated: true });
    expect(api.runAgent).not.toHaveBeenCalled();
    expect(api.executeDuckDBSQL).not.toHaveBeenCalled();
    expect(api.executeFederatedQuery).not.toHaveBeenCalled();
  });

  it('keeps preview reachable and labels unapplied manual changes (2026-11-02 screenshot)', async () => {
    view();
    fireEvent.click(screen.getByRole('button', { name: 'query.chart.configure' }));
    fireEvent.click(screen.getByRole('button', { name: 'query.chart.recommendations' }));
    expect(screen.getByRole('button', { name: 'query.chart.preview' })).toBeInTheDocument();
    fireEvent.click(screen.getByText('query.chart.area').closest('button')!);
    fireEvent.click(screen.getByRole('button', { name: 'query.chart.apply' }));
    fireEvent.click(screen.getByRole('button', { name: 'query.chart.advanced' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'query.chart.stacked' }));
    expect(screen.getByRole('status')).toHaveTextContent('query.chart.draftHint');
    expect(screen.getByTestId('chart-spec')).toHaveTextContent('"stacked":false');
    expect(api.executeDuckDBSQL).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'query.chart.resetDraft' }));
    expect(screen.queryByText('query.chart.draftHint')).not.toBeInTheDocument();
  });

  it('keeps AI suggestions as previews until the user applies them', async () => {
    view();
    fireEvent.click(screen.getByRole('button', { name: 'query.chart.configure' }));
    fireEvent.click(screen.getByRole('button', { name: 'query.chart.recommendations' }));
    fireEvent.click(screen.getByRole('button', { name: 'query.chart.suggest' }));
    await screen.findByText('Example reason');
    expect(screen.getByTestId('chart-spec')).toHaveTextContent('amount');
    fireEvent.click(screen.getByRole('button', { name: 'query.chart.previewAi' }));
    await screen.findByRole('button', { name: 'query.chart.apply' });
    expect(api.executeDuckDBSQL).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'query.chart.apply' }));
    await waitFor(() => expect(screen.getByTestId('chart-spec')).toHaveTextContent('order_id'));
  });

  it('binds display units to the selected measure and restores them when a preview is discarded', async () => {
    view();
    fireEvent.click(screen.getByRole('button', { name: 'query.chart.configure' }));
    fireEvent.click(screen.getByRole('button', { name: 'query.chart.recommendations' }));
    fireEvent.click(screen.getByRole('button', { name: 'query.chart.advanced' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'query.chart.unit' }), { target: { value: 'USD' } });
    expect(screen.getByTestId('chart-unit')).toHaveTextContent('USD');
    fireEvent.click(screen.getByRole('button', { name: 'query.chart.suggest' }));
    await screen.findByText('Example reason');
    fireEvent.click(screen.getByRole('button', { name: 'query.chart.previewAi' }));
    expect(screen.getByTestId('chart-unit')).toBeEmptyDOMElement();
    fireEvent.click(screen.getByRole('button', { name: 'query.chart.discard' }));
    expect(screen.getByTestId('chart-unit')).toHaveTextContent('USD');
  });

  it('shows failures without replacing the chart and permits explicit retry', async () => {
    api.runAgent.mockRejectedValueOnce(new Error('Synthetic provider failure'));
    view();
    fireEvent.click(screen.getByRole('button', { name: 'query.chart.configure' }));
    fireEvent.click(screen.getByRole('button', { name: 'query.chart.recommendations' }));
    fireEvent.click(screen.getByRole('button', { name: 'query.chart.suggest' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Synthetic provider failure');
    expect(screen.getByTestId('chart-spec')).toHaveTextContent('amount');
    fireEvent.click(screen.getByRole('button', { name: 'query.chart.suggest' }));
    await screen.findByText('Example reason');
    expect(api.runAgent).toHaveBeenCalledTimes(2);
    expect(api.runAgent.mock.calls[1][0].context).toMatchObject({ current_sql: source.sql, chart_goal: 'auto', chart_summary: { row_count: 1, truncated: false } });
  });

  it('ignores an old AI response when result values change under the same column names', async () => {
    let resolve!: (value: unknown) => void;
    api.runAgent.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    const result = view();
    fireEvent.click(screen.getByRole('button', { name: 'query.chart.configure' }));
    fireEvent.click(screen.getByRole('button', { name: 'query.chart.recommendations' }));
    fireEvent.click(screen.getByRole('button', { name: 'query.chart.suggest' }));
    await waitFor(() => expect(api.runAgent).toHaveBeenCalledTimes(1));
    result.replaceRows([{ order_id: 99, day: '2026-11-02', amount: '12.5000' }]);
    await act(async () => resolve({ result: { type: 'bar', x: 'day', y: ['order_id'], agg: 'sum', reason: 'Old result reason' } }));
    expect(screen.queryByText('Old result reason')).not.toBeInTheDocument();
    expect(screen.getByTestId('chart-spec')).toHaveTextContent('amount');
  });

  it('reruns aggregation only after preview and retains the intentional source LIMIT', async () => {
    api.runAgent.mockResolvedValueOnce({ result: { type: 'line', x: 'day', y: ['amount'], agg: 'sum', dataMode: 'aggregate', reason: 'Regroup the selected result' } });
    view({ truncated: true });
    fireEvent.click(screen.getByRole('button', { name: 'query.chart.configure' }));
    fireEvent.click(screen.getByRole('button', { name: 'query.chart.recommendations' }));
    fireEvent.click(screen.getByRole('button', { name: 'query.chart.suggest' }));
    await screen.findByText('Regroup the selected result');
    expect(api.executeDuckDBSQL).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'query.chart.previewAi' }));
    await screen.findByRole('button', { name: 'query.chart.apply' });
    expect(api.executeDuckDBSQL).toHaveBeenCalledTimes(1);
    expect(api.executeDuckDBSQL.mock.calls[0][0]).toContain('FROM (\nSELECT * FROM orders LIMIT 100\n) AS _preview LIMIT 1');
    fireEvent.click(screen.getByRole('button', { name: 'query.chart.apply' }));
    expect(api.executeDuckDBSQL).toHaveBeenCalledTimes(1);
  });

  it('ignores a late aggregation result after a new query has completed', async () => {
    api.runAgent.mockResolvedValueOnce({ result: { type: 'line', x: 'day', y: ['amount'], agg: 'sum', dataMode: 'aggregate', reason: 'Aggregate' } });
    let resolve!: (value: unknown) => void;
    api.executeDuckDBSQL.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    const result = view();
    fireEvent.click(screen.getByRole('button', { name: 'query.chart.configure' }));
    fireEvent.click(screen.getByRole('button', { name: 'query.chart.recommendations' }));
    fireEvent.click(screen.getByRole('button', { name: 'query.chart.suggest' }));
    await screen.findByText('Aggregate');
    fireEvent.click(screen.getByRole('button', { name: 'query.chart.previewAi' }));
    await waitFor(() => expect(api.executeDuckDBSQL).toHaveBeenCalledTimes(1));
    result.replaceRows([{ order_id: 99, day: '2026-11-02', amount: '12.5000' }]);
    await act(async () => resolve({ data: [{ dim: 'old', m_0: '999999' }] }));
    expect(screen.queryByRole('button', { name: 'query.chart.apply' })).not.toBeInTheDocument();
  });

  it('keeps a manually applied chart when a slower AI suggestion arrives', async () => {
    let resolve!: (value: unknown) => void;
    api.runAgent.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    view();
    fireEvent.click(screen.getByRole('button', { name: 'query.chart.configure' }));
    fireEvent.click(screen.getByRole('button', { name: 'query.chart.recommendations' }));
    fireEvent.click(screen.getByRole('button', { name: 'query.chart.suggest' }));
    await waitFor(() => expect(api.runAgent).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByText('query.chart.area').closest('button')!);
    fireEvent.click(screen.getByRole('button', { name: 'query.chart.apply' }));
    await act(async () => resolve({ result: { type: 'bar', x: 'day', y: ['order_id'], agg: 'sum', reason: 'A late proposal' } }));
    await screen.findByText('A late proposal');
    expect(screen.getByTestId('chart-spec')).toHaveTextContent('"type":"area"');
    expect(screen.getByTestId('chart-spec')).toHaveTextContent('amount');
  });

  it('only expands the original query scope after the explicit checkbox', async () => {
    api.runAgent.mockResolvedValueOnce({ result: { type: 'line', x: 'day', y: ['amount'], agg: 'sum', dataMode: 'aggregate', reason: 'Aggregate' } });
    view({ truncated: true });
    fireEvent.click(screen.getByRole('button', { name: 'query.chart.configure' }));
    fireEvent.click(screen.getByRole('button', { name: 'query.chart.recommendations' }));
    fireEvent.click(screen.getByRole('button', { name: 'query.chart.suggest' }));
    await screen.findByText('Aggregate');
    fireEvent.click(screen.getByRole('button', { name: 'query.chart.previewAi' }));
    await screen.findByRole('button', { name: 'query.chart.apply' });
    fireEvent.click(screen.getByRole('button', { name: 'query.chart.advanced' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'query.chart.expandScope' }));
    fireEvent.click(screen.getByRole('button', { name: 'query.chart.preview' }));
    await waitFor(() => expect(api.executeDuckDBSQL).toHaveBeenCalledTimes(2));
    expect(api.executeDuckDBSQL.mock.calls[0][0]).toContain('orders LIMIT 100');
    expect(api.executeDuckDBSQL.mock.calls[1][0]).not.toContain('orders LIMIT 100');
  });

  it('keeps configuration and recommendations available in focus mode', async () => {
    view();
    fireEvent.click(screen.getByRole('button', { name: 'query.chart.configure' }));
    fireEvent.click(screen.getByRole('button', { name: 'query.chart.recommendations' }));
    fireEvent.click(screen.getByRole('button', { name: 'query.chart.focus' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getAllByTestId('chart-spec')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'query.chart.suggest' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'query.chart.focus' })).toHaveFocus();
  });
});

/** Regression 2026-11-03: explicit chart aggregation must run on its captured service. */
it('regroups Quack results without executing locally', async () => {
  api.runAgent.mockResolvedValueOnce({ result: { type: 'line', x: 'day', y: ['amount'], agg: 'sum', dataMode: 'aggregate', reason: 'Remote aggregation' } });
  api.executeQuackQuery.mockResolvedValueOnce({ data: [{ dim: '2026-10-01', m_0: '9007199254740993.1234' }] });
  view({ source: { ...source, quackServiceId: 'remote-a' } });
  fireEvent.click(screen.getByRole('button', { name: 'query.chart.configure' }));
  fireEvent.click(screen.getByRole('button', { name: 'query.chart.recommendations' }));
  fireEvent.click(screen.getByRole('button', { name: 'query.chart.suggest' }));
  await screen.findByText('Remote aggregation');
  fireEvent.click(screen.getByRole('button', { name: 'query.chart.previewAi' }));
  await screen.findByRole('button', { name: 'query.chart.apply' });
  expect(api.executeQuackQuery).toHaveBeenCalledWith('remote-a', expect.stringContaining('FROM (\nSELECT * FROM orders LIMIT 100\n) AS _preview LIMIT 1'), { isPreview: true });
  expect(api.executeDuckDBSQL).not.toHaveBeenCalled();
  expect(api.executeFederatedQuery).not.toHaveBeenCalled();
});
