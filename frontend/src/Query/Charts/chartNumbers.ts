/** Keep exact backend scalars separate from approximate SVG coordinates. */
export function formatChartValue(value: unknown, locale = 'zh'): string {
  if (value == null) return '—';
  const text = String(value);
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(text);
  if (!match) return text;
  const integer = BigInt(`${match[1]}${match[2]}`);
  const sign = match[1] && integer === 0n ? '-' : '';
  return `${sign}${integer.toLocaleString(locale)}${match[3] == null ? '' : `.${match[3]}`}`;
}

/** Exact sum/min/max for DECIMAL/HUGEINT strings in an "other" chart bucket. */
export function combineChartValues(values: unknown[], operation: string): string | number | null {
  const present = values.filter((value) => value != null);
  if (!present.length) return null;
  const parts = present.map((value) => /^(-?)(\d+)(?:\.(\d+))?$/.exec(String(value)));
  if (parts.some((part) => !part)) {
    const numbers = present.map(Number).filter(Number.isFinite);
    if (!numbers.length) return null;
    return operation === 'min' ? Math.min(...numbers) : operation === 'max' ? Math.max(...numbers) : numbers.reduce((a, b) => a + b, 0);
  }
  const scale = Math.max(...parts.map((part) => part?.[3]?.length ?? 0));
  const integers = parts.map((part) => BigInt(`${part![1]}${part![2]}${(part![3] ?? '').padEnd(scale, '0')}`));
  const combined = integers.reduce((a, b) => operation === 'min' ? (a < b ? a : b) : operation === 'max' ? (a > b ? a : b) : a + b);
  const digits = (combined < 0n ? -combined : combined).toString().padStart(scale + 1, '0');
  const result = `${combined < 0n ? '-' : ''}${scale ? `${digits.slice(0, -scale)}.${digits.slice(-scale)}` : digits}`;
  return present.some((value) => typeof value === 'string') ? result : Number(result);
}
