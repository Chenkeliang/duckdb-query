/**
 * 精确数值排序。
 *
 * 后端对 DECIMAL 列、以及超出 JS 安全整数(2^53)的 BIGINT 值返回十进制字符串，
 * 用 Number() 解析比较会在高精度处失真（近值错序、>2^53 的相邻整数判等）。
 * 这里对「纯十进制文本」按 符号 → 整数位数 → 逐位字典序 做精确比较；
 * 无法按纯十进制解析的值回退 Number() 比较。
 */
import type { Row } from '@tanstack/react-table';

interface PlainDecimal {
  neg: boolean;
  int: string;
  frac: string;
}

function parsePlainDecimal(raw: string): PlainDecimal | null {
  const m = /^([+-]?)(\d+)(?:\.(\d+))?$/.exec(raw);
  if (!m) return null;
  const int = m[2].replace(/^0+(?=\d)/, '');
  const frac = (m[3] ?? '').replace(/0+$/, '');
  // -0 / -0.00 视为 0
  const neg = m[1] === '-' && !(int === '0' && frac === '');
  return { neg, int, frac };
}

function compareMagnitude(a: PlainDecimal, b: PlainDecimal): number {
  if (a.int.length !== b.int.length) {
    return a.int.length < b.int.length ? -1 : 1;
  }
  if (a.int !== b.int) {
    return a.int < b.int ? -1 : 1;
  }
  if (a.frac === b.frac) {
    return 0;
  }
  // 去尾零后的小数位字典序即数值序（'1' < '12' ⇔ 0.1 < 0.12）
  return a.frac < b.frac ? -1 : 1;
}

export function compareNumericValues(a: unknown, b: unknown): number {
  const aEmpty = a === null || a === undefined || a === '';
  const bEmpty = b === null || b === undefined || b === '';
  if (aEmpty || bEmpty) {
    if (aEmpty && bEmpty) return 0;
    return aEmpty ? -1 : 1;
  }

  const sa = String(a).trim();
  const sb = String(b).trim();
  const pa = parsePlainDecimal(sa);
  const pb = parsePlainDecimal(sb);
  if (pa && pb) {
    if (pa.neg !== pb.neg) {
      return pa.neg ? -1 : 1;
    }
    const cmp = compareMagnitude(pa, pb);
    return pa.neg ? -cmp : cmp;
  }

  const na = Number(sa);
  const nb = Number(sb);
  const aNan = Number.isNaN(na);
  const bNan = Number.isNaN(nb);
  if (aNan || bNan) {
    if (aNan && bNan) return sa.localeCompare(sb);
    return aNan ? -1 : 1;
  }
  if (na === nb) return 0;
  return na < nb ? -1 : 1;
}

export function exactNumericSortingFn(
  rowA: Row<Record<string, unknown>>,
  rowB: Row<Record<string, unknown>>,
  columnId: string,
): number {
  return compareNumericValues(rowA.getValue(columnId), rowB.getValue(columnId));
}
