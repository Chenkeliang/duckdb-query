const clampOpacity = (value) => {
  if (Number.isNaN(value)) return 0;
  return Math.min(1, Math.max(0, value));
};

const hexToRgb = (hex) => {
  if (!hex) return null;
  let normalized = hex.replace('#', '').trim();

  if (normalized.length === 3) {
    normalized = normalized
      .split('')
      .map((char) => char + char)
      .join('');
  }

  if (normalized.length === 6) {
    const r = parseInt(normalized.slice(0, 2), 16);
    const g = parseInt(normalized.slice(2, 4), 16);
    const b = parseInt(normalized.slice(4, 6), 16);
    return { r, g, b, a: 1 };
  }

  if (normalized.length === 8) {
    const r = parseInt(normalized.slice(0, 2), 16);
    const g = parseInt(normalized.slice(2, 4), 16);
    const b = parseInt(normalized.slice(4, 6), 16);
    const a = parseInt(normalized.slice(6, 8), 16) / 255;
    return { r, g, b, a };
  }

  return null;
};

const parseRgb = (value) => {
  const match = value.match(/rgba?\(([^)]+)\)/i);
  if (!match) return null;

  const parts = match[1]
    .split(',')
    .map((segment) => segment.trim())
    .map((segment) => (segment.includes('%') ? parseFloat(segment) * 2.55 : parseFloat(segment)));

  if (parts.length < 3) return null;

  const [r, g, b, a = 1] = parts;
  return { r, g, b, a };
};

const resolveCssVariable = (varExpression) => {
  const match = varExpression.match(/^var\((--[^)]+)\)/);
  if (!match) return null;
  const varName = match[1];

  if (typeof window === 'undefined') {
    return null;
  }

  const computed = getComputedStyle(document.documentElement).getPropertyValue(varName);
  if (!computed) return null;
  return computed.trim() || null;
};

const resolveColorValue = (value) => {
  if (!value) return null;
  const trimmed = value.trim();

  if (trimmed.startsWith('var(')) {
    return resolveCssVariable(trimmed);
  }

  if (trimmed.startsWith('#') || trimmed.startsWith('rgb')) {
    return trimmed;
  }

  return null;
};

export const withOpacity = (colorValue, opacity, fallbackColor = '#2563eb') => {
  const resolved = resolveColorValue(colorValue) || fallbackColor;
  const parsedRgb = parseRgb(resolved);
  const parsedHex = parsedRgb ? null : hexToRgb(resolved);

  const color = parsedRgb || parsedHex || hexToRgb(fallbackColor) || parseRgb(fallbackColor);

  if (!color) {
    return fallbackColor;
  }

  const { r, g, b } = color;
  const finalOpacity = clampOpacity(opacity);
  return `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${finalOpacity})`;
};

export const resolveColor = (colorValue, fallbackColor = null) => {
  return resolveColorValue(colorValue) || fallbackColor;
};
