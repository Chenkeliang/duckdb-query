/**
 * JSON 单元格检测与渲染工具
 *
 * 判断规则：
 *   - 非 null 对象/数组 → 是
 *   - 字符串（trim 后以 { 或 [ 开头/结尾）且能 JSON.parse 为对象或数组 → 是
 *   - 纯数字字符串、布尔字符串等 → 否
 */

import * as React from 'react';
import i18next from 'i18next';
import { Braces } from 'lucide-react';
import type { CellRendererProps } from '../types';

export function isJsonViewable(value: unknown): boolean {
  if (value === null || value === undefined) return false;

  // JS 对象/数组（DuckDB VARIANT 列可能已被反序列化）
  if (typeof value === 'object') return true;

  if (typeof value !== 'string') return false;

  const trimmed = value.trim();
  if (
    !(
      (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
      (trimmed.startsWith('[') && trimmed.endsWith(']'))
    )
  ) {
    return false;
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    return typeof parsed === 'object' && parsed !== null;
  } catch {
    return false;
  }
}

/**
 * 将任意 JSON 可视值转换为格式化字符串（缩进 2 空格）。
 * 若值已是字符串则先 parse，再 stringify。
 */
export function toFormattedJson(value: unknown): string {
  try {
    const obj =
      typeof value === 'string' ? (JSON.parse(value.trim()) as unknown) : value;
    return JSON.stringify(obj, null, 2);
  } catch {
    return typeof value === 'string' ? value : String(value);
  }
}

/**
 * 采样列数据，判断该列的多数值是否为 JSON。
 * 与 columnMostlyHttpUrls 风格一致。
 */
export function columnMostlyJson(
  data: Record<string, unknown>[],
  field: string,
  sampleSize = 100,
  threshold = 0.4
): boolean {
  if (!data.length) return false;
  const sample = data.slice(0, sampleSize);
  let nonEmpty = 0;
  let jsonLike = 0;
  for (const row of sample) {
    const value = row[field];
    if (value === null || value === undefined || value === '') continue;
    nonEmpty += 1;
    if (isJsonViewable(value)) jsonLike += 1;
  }
  if (nonEmpty === 0) return false;
  return jsonLike / nonEmpty >= threshold;
}

/**
 * 生成 JSON 列的 cellRenderer。
 *
 * 单元格显示紧凑文本（截断），右侧出现一个悬停可见的 Braces 按钮，
 * 点击后调用 onViewJson（由网格根层级通过 CellRendererProps 注入）。
 * DOM 极轻：按钮通过 CSS group-hover 控制，不持有任何 state。
 */
export function createJsonCellRenderer(): (props: CellRendererProps) => React.ReactNode {
  return ({ value, onViewJson }) => {
    if (value === null || value === undefined) {
      return React.createElement('span', { className: 'text-muted-foreground' }, 'NULL');
    }

    // 紧凑单行展示（object 先序列化）
    const display =
      typeof value === 'object'
        ? (() => {
            try {
              const s = JSON.stringify(value);
              return s.length > 200 ? `${s.slice(0, 197)}…` : s;
            } catch {
              return String(value);
            }
          })()
        : (() => {
            const s = String(value).trim();
            return s.length > 200 ? `${s.slice(0, 197)}…` : s;
          })();

    const handleOpen = (e: React.MouseEvent) => {
      e.stopPropagation();
      onViewJson?.(value);
    };

    return React.createElement(
      'span',
      { className: 'group flex items-center gap-1 w-full overflow-hidden' },
      React.createElement(
        'span',
        { className: 'truncate font-mono text-xs flex-1', title: display },
        display
      ),
      onViewJson
        ? React.createElement(
            'button',
            {
              type: 'button',
              className:
                'flex-shrink-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 ' +
                'rounded p-0.5 text-muted-foreground hover:text-foreground ' +
                'transition-opacity duration-100',
              title: i18next.t('query.json.view', { ns: 'common', defaultValue: 'View JSON' }),
              'aria-label': i18next.t('query.json.view', { ns: 'common', defaultValue: 'View JSON' }),
              onMouseDown: (e: React.MouseEvent) => e.stopPropagation(),
              onClick: handleOpen,
            },
            React.createElement(Braces, { className: 'h-3 w-3' })
          )
        : null
    );
  };
}
