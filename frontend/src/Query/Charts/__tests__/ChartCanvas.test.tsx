import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { ChartCanvas, ChartTooltipContent } from '../ChartCanvas';

vi.mock('recharts', async (orig) => {
  const actual = (await orig()) as Record<string, unknown>;
  const wrapSvg = ({ children }: { children: React.ReactNode }) => (
    <svg>{children}</svg>
  );
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
      <div style={{ width: 600, height: 300 }}>{children}</div>
    ),
    BarChart: wrapSvg,
    LineChart: wrapSvg,
    AreaChart: wrapSvg,
    PieChart: wrapSvg,
    Bar: () => null,
    Line: () => null,
    Area: () => null,
    Pie: () => null,
    Cell: () => null,
    XAxis: () => null,
    YAxis: () => null,
    CartesianGrid: () => null,
    Tooltip: () => null,
    Legend: () => null,
  };
});

const data = [
  { dim: 'a', amount: 10 },
  { dim: 'b', amount: 20 },
];

describe('ChartCanvas', () => {
  it('renders a bar chart without crashing', () => {
    const { container } = render(
      <ChartCanvas
        spec={{ type: 'bar', x: 'status', y: ['amount'], agg: 'sum' }}
        data={data}
        metricKeys={['amount']}
      />,
    );
    expect(container.querySelector('svg')).toBeTruthy();
  });

  it('renders kpi as a big number', () => {
    const { getByText } = render(
      <ChartCanvas
        spec={{ type: 'kpi', x: null, y: ['amount'], agg: 'sum' }}
        data={[]}
        metricKeys={['amount']}
        kpi={45}
      />,
    );
    expect(getByText('45')).toBeTruthy();
  });

  it('uses themed tooltip surfaces and exact backend labels (regression 2026-11-02)', () => {
    const { getByText } = render(<ChartTooltipContent active label="2026-11-02" labels={{ value_0: 'amount' }} locale="en"
      payload={[{ dataKey: 'value_0', value: 9007199254740994, payload: { rawValues: { value_0: '9007199254740993.1234' } } }]} />);
    expect(getByText('9,007,199,254,740,993.1234')).toBeInTheDocument();
    expect(getByText('2026-11-02').parentElement).toHaveClass('bg-surface-elevated', 'text-foreground');
  });

  it('adds a display unit without converting the exact value', () => {
    const { getByText } = render(<ChartTooltipContent active unit="USD" locale="en" payload={[{ dataKey: 'value_0', payload: { rawValues: { value_0: '9007199254740993.1200' } } }]} />);
    expect(getByText('9,007,199,254,740,993.1200 USD')).toBeInTheDocument();
  });
});
