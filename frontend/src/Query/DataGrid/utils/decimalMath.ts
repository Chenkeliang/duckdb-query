/**
 * 精确十进制求和 / 均值（BigInt 定点），供页脚统计等信息性展示使用。
 *
 * 与 numericSort 同一立场：能按「纯十进制文本」解析的值走精确算术
 * （覆盖 DECIMAL 字符串与 >2^53 的 BIGINT 字符串），解析不了的
 * 指数形态浮点由调用方回退 float 路径。
 */

/** 把单元格值转成纯十进制文本；无法无损转换返回 null */
export function toPlainDecimalText(value: unknown): string | null {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null;
    const s = String(value);
    return /^-?\d+(\.\d+)?$/.test(s) ? s : null; // 1e21 等指数形态交回 float 路径
  }
  if (typeof value === 'string') {
    const t = value.replace(/,/g, '').trim();
    return /^-?\d+(\.\d+)?$/.test(t) ? t : null;
  }
  return null;
}

function maxScale(texts: string[]): number {
  let scale = 0;
  for (const t of texts) {
    const dot = t.indexOf('.');
    if (dot >= 0) scale = Math.max(scale, t.length - dot - 1);
  }
  return scale;
}

/** 按目标标度放大为带符号 BigInt 定点数 */
function parseScaled(text: string, scale: number): bigint {
  const m = /^(-?)(\d+)(?:\.(\d+))?$/.exec(text);
  if (!m) throw new Error(`not a plain decimal: ${text}`);
  const units = BigInt(m[2] + (m[3] ?? '').padEnd(scale, '0'));
  return m[1] === '-' ? -units : units;
}

function renderScaled(units: bigint, scale: number): string {
  const neg = units < 0n;
  const abs = (neg ? -units : units).toString().padStart(scale + 1, '0');
  const intPart = abs.slice(0, abs.length - scale) || '0';
  const fracPart = scale > 0 ? `.${abs.slice(abs.length - scale)}` : '';
  return `${neg ? '-' : ''}${intPart}${fracPart}`;
}

function trimTrailingZeros(text: string): string {
  if (!text.includes('.')) return text;
  return text.replace(/0+$/, '').replace(/\.$/, '');
}

/** 精确求和：标度取列内最大值并保留（财务口径，尾零不丢） */
export function sumPlainDecimals(texts: string[]): string {
  const scale = maxScale(texts);
  let acc = 0n;
  for (const t of texts) acc += parseScaled(t, scale);
  return renderScaled(acc, scale);
}

/**
 * 均值 = 精确和 ÷ 个数，在和的标度上多算 extraDigits 位后半进位取整、去尾零。
 * 除法可能除不尽，这是唯一引入舍入的点，且舍入位置显式受控。
 */
export function averagePlainDecimals(texts: string[], extraDigits = 6): string {
  const scale = maxScale(texts);
  let acc = 0n;
  for (const t of texts) acc += parseScaled(t, scale);

  const count = BigInt(texts.length);
  const neg = acc < 0n;
  const numerator = (neg ? -acc : acc) * 10n ** BigInt(extraDigits);
  let quotient = numerator / count;
  if ((numerator % count) * 2n >= count) quotient += 1n;

  const text = renderScaled(neg ? -quotient : quotient, scale + extraDigits);
  return trimTrailingZeros(text);
}
