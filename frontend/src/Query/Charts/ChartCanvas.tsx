import {
  ResponsiveContainer,
  BarChart, Bar, LineChart, Line, AreaChart, Area, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';
import type { ChartSpec } from './chartSpec';

const COLORS = ['#f97316', '#3b82f6', '#10b981', '#a855f7', '#ef4444', '#eab308', '#06b6d4', '#ec4899'];

export interface ChartCanvasProps {
  spec: ChartSpec;
  data: Array<Record<string, string | number>>;
  metricKeys: string[];
  kpi?: number;
}

export function ChartCanvas({ spec, data, metricKeys, kpi }: ChartCanvasProps) {
  if (spec.type === 'kpi') {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <div className="text-4xl font-semibold tabular-nums">
          {kpi != null ? kpi.toLocaleString() : '-'}
        </div>
      </div>
    );
  }
  if (spec.type === 'pie' || spec.type === 'donut') {
    const key = metricKeys[0];
    return (
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Tooltip />
          <Legend />
          <Pie
            data={data}
            dataKey={key}
            nameKey="dim"
            innerRadius={spec.type === 'donut' ? '55%' : 0}
            outerRadius="80%"
          >
            {data.map((_, i) => (
              <Cell key={i} fill={COLORS[i % COLORS.length]} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
    );
  }
  const common = (
    <>
      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
      <XAxis dataKey="dim" tick={{ fontSize: 11 }} />
      <YAxis tick={{ fontSize: 11 }} />
      <Tooltip />
      <Legend />
    </>
  );
  if (spec.type === 'line') {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          {common}
          {metricKeys.map((k, i) => (
            <Line key={k} type="monotone" dataKey={k} stroke={COLORS[i % COLORS.length]} dot={false} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    );
  }
  if (spec.type === 'area') {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data}>
          {common}
          {metricKeys.map((k, i) => (
            <Area
              key={k}
              type="monotone"
              dataKey={k}
              stackId={spec.stacked ? 'a' : undefined}
              stroke={COLORS[i % COLORS.length]}
              fill={COLORS[i % COLORS.length]}
              fillOpacity={0.25}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    );
  }
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data}>
        {common}
        {metricKeys.map((k, i) => (
          <Bar key={k} dataKey={k} stackId={spec.stacked ? 'a' : undefined} fill={COLORS[i % COLORS.length]} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
