/** Regression 2026-10-30: planned and actual strategies must be distinguishable. */
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { PushdownStatus } from '../PushdownStatus';
vi.mock('react-i18next', async () => {
  const strings = (await import('@/i18n/locales/en/common.json')).default;
  return { useTranslation: () => ({ t: (key: string, options?: Record<string, unknown>) => {
    let value: unknown = strings;
    for (const part of key.split('.')) value = (value as Record<string, unknown>)?.[part];
    return typeof value === 'string' ? value.replace(/\{\{(\w+)\}\}/g, (_, name) => String(options?.[name] ?? '')) : key;
  } }) };
});
afterEach(cleanup);

it('labels a metadata-only plan separately from an actual source count', () => {
  const report = { mode: 'remote-count' as const, sources: 1, pushed_sources: 1 };
  const view = render(<PushdownStatus report={report} planned />);
  expect(screen.getByRole('status')).toHaveTextContent('Planned execution:');
  expect(screen.getByRole('status')).toHaveTextContent('MySQL computes counts');
  view.rerender(<PushdownStatus report={report} />);
  expect(screen.getByRole('status')).toHaveTextContent('Actual execution:');
});

it('explains partial candidates and warns about local scans without inventing a status', () => {
  const view = render(<PushdownStatus />);
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
  view.rerender(<PushdownStatus report={{ mode: 'candidate', sources: 2, pushed_sources: 1 }} />);
  expect(screen.getByRole('status')).toHaveTextContent('1 / 2 sources pushed');
  view.rerender(<PushdownStatus report={{ mode: 'local', sources: 1, pushed_sources: 0 }} />);
  expect(screen.getByRole('status')).toHaveTextContent('may read many remote rows');
  view.rerender(<PushdownStatus report={{ mode: 'local', sources: 0, pushed_sources: 0 }} />);
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
});
