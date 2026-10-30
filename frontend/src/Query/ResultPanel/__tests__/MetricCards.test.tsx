/** Regression 2026-10-30: metric cards preserve exact backend scalar encodings. */
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import { MetricCards } from '../MetricCards';
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@/components/SQLHighlight', () => ({ SQLHighlight: ({ sql }: { sql: string }) => <pre>{sql}</pre> }));
afterEach(cleanup);

it('does not round DECIMAL and HUGEINT values and distinguishes NULL and zero', () => {
  render(<MetricCards columns={['amount', 'huge', 'empty', 'zero']} row={{ amount: '0.1234567890123456789', huge: '170141183460469231731687303715884105727', empty: null, zero: 0 }} />);
  expect(screen.getByText('0.1234567890123456789')).toBeInTheDocument();
  expect(screen.getByText('170141183460469231731687303715884105727')).toBeInTheDocument();
  expect(screen.getByText('NULL')).toBeInTheDocument();
  expect(screen.getByText('0')).toBeInTheDocument();
});

it('shows the executed SQL supplied with the result rather than a configuration draft', () => {
  const sql = 'SELECT count(*) AS total FROM sales WHERE active=true';
  render(<MetricCards columns={['total']} row={{ total: 3 }} sql={sql} />);
  fireEvent.click(screen.getByRole('button', { name: 'insights.executedSql' }));
  expect(screen.getByText(sql)).toBeInTheDocument();
});
