import * as React from 'react';
import type { CellRendererProps } from '../types';

const HTTP_URL_PATTERN = /^https?:\/\/[^\s]+$/i;

export function looksLikeHttpUrl(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  const text = String(value).trim();
  if (!text) return false;
  return HTTP_URL_PATTERN.test(text);
}

export function columnMostlyHttpUrls(
  data: Record<string, unknown>[],
  field: string,
  sampleSize = 100,
  threshold = 0.5
): boolean {
  if (!data.length) return false;
  const sample = data.slice(0, sampleSize);
  let nonEmpty = 0;
  let urlLike = 0;
  for (const row of sample) {
    const value = row[field];
    if (value === null || value === undefined || value === '') continue;
    nonEmpty += 1;
    if (looksLikeHttpUrl(value)) urlLike += 1;
  }
  if (nonEmpty === 0) return false;
  return urlLike / nonEmpty >= threshold;
}

export function createUrlCellRenderer(): (props: CellRendererProps) => React.ReactNode {
  return ({ value }) => {
    if (!looksLikeHttpUrl(value)) {
      return React.createElement('span', { className: 'truncate' }, String(value ?? ''));
    }
    const href = String(value).trim();
    return React.createElement(
      'a',
      {
        href,
        target: '_blank',
        rel: 'noopener noreferrer',
        className: 'truncate text-primary underline underline-offset-2 hover:text-primary/80',
        onMouseDown: (e: React.MouseEvent) => e.stopPropagation(),
        onClick: (e: React.MouseEvent) => e.stopPropagation(),
      },
      href
    );
  };
}
