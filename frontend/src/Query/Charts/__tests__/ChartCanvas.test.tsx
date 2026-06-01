import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { ChartCanvas } from '../ChartCanvas';

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
});
