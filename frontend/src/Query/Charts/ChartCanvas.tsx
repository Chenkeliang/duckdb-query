import { useEffect, useState, type MouseEvent } from 'react';
import {
  ResponsiveContainer,
  BarChart, Bar, LineChart, Line, AreaChart, Area, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';
import type { ChartSpec } from './chartSpec';

/** Fallback = light-theme series (tailwind.css --chart-1..7); real values are read from the theme. */
const FALLBACK_COLORS = ['#2a78d6', '#1baf7a', '#4a3aa7', '#eda100', '#e87ba4', '#008300', '#e34948'];

function readChartColors(): string[] {
  if (typeof document === 'undefined') return FALLBACK_COLORS;
  const cs = getComputedStyle(document.documentElement);
  return FALLBACK_COLORS.map((fb, i) => cs.getPropertyValue(`--chart-${i + 1}`).trim() || fb);
}

/** SVG presentation attributes cannot resolve CSS variables, so resolve them here and follow theme switches. */
function useChartColors(): string[] {
  const [colors, setColors] = useState(readChartColors);
  useEffect(() => {
    const observer = new MutationObserver(() => setColors(readChartColors()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);
  return colors;
}

export interface ChartCanvasProps {
  spec: ChartSpec;
  data: Array<Record<string, string | number>>;
  metricKeys: string[];
  kpi?: number;
  /** 点击柱/饼块/折线点触发,dim 为被点的维度值(与 aggregateRows 产出的 `dim` 字段一致)。 */
  onElementClick?: (dim: string, event: { clientX: number; clientY: number }) => void;
}

export function ChartCanvas({ spec, data, metricKeys, kpi, onElementClick }: ChartCanvasProps) {
  const COLORS = useChartColors();
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
            cursor={onElementClick ? 'pointer' : undefined}
            onClick={
              onElementClick
                ? (d: any, _i: number, e: MouseEvent) => {
                    const dim = d?.payload?.dim ?? d?.name;
                    if (dim != null) onElementClick(String(dim), { clientX: e.clientX, clientY: e.clientY });
                  }
                : undefined
            }
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
  // 折线/面积图没有单点击区域,取图表级点击 + activeLabel(recharts 内置,对应 XAxis dataKey="dim")
  const handleActiveLabelClick = onElementClick
    ? (state: any, e: any) => {
        const dim = state?.activeLabel;
        if (dim != null) onElementClick(String(dim), { clientX: e?.clientX ?? 0, clientY: e?.clientY ?? 0 });
      }
    : undefined;
  if (spec.type === 'line') {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} onClick={handleActiveLabelClick} style={{ cursor: onElementClick ? 'pointer' : undefined }}>
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
        <AreaChart data={data} onClick={handleActiveLabelClick} style={{ cursor: onElementClick ? 'pointer' : undefined }}>
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
          <Bar
            key={k}
            dataKey={k}
            stackId={spec.stacked ? 'a' : undefined}
            fill={COLORS[i % COLORS.length]}
            cursor={onElementClick ? 'pointer' : undefined}
            onClick={
              onElementClick
                ? (d: any, _i: number, e: MouseEvent) => {
                    const dim = d?.payload?.dim;
                    if (dim != null) onElementClick(String(dim), { clientX: e.clientX, clientY: e.clientY });
                  }
                : undefined
            }
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
