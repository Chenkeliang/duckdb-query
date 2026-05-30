import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, def?: string) => def ?? _key,
    i18n: { language: 'zh' },
  }),
}));

import { AskBar } from '../AskBar';

describe('AskBar', () => {
  it('guide mode renders a clickable guidance row -> onOpenSettings', () => {
    const onOpenSettings = vi.fn();
    render(<AskBar mode="guide" onSubmit={vi.fn()} onOpenSettings={onOpenSettings} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
  });

  it('ready mode submits typed question', () => {
    const onSubmit = vi.fn();
    render(<AskBar mode="ready" onSubmit={onSubmit} onOpenSettings={vi.fn()} />);
    fireEvent.change(screen.getByTestId('ask-bar-input'), { target: { value: '多少订单' } });
    fireEvent.click(screen.getByText('生成'));
    expect(onSubmit).toHaveBeenCalledWith('多少订单');
  });

  it('renders used-tables chips', () => {
    render(<AskBar mode="ready" usedTables={['orders', 'customers']} onSubmit={vi.fn()} onOpenSettings={vi.fn()} />);
    expect(screen.getByText('orders')).toBeInTheDocument();
    expect(screen.getByText('customers')).toBeInTheDocument();
  });

  it('does not submit empty/whitespace question', () => {
    const onSubmit = vi.fn();
    render(<AskBar mode="ready" onSubmit={onSubmit} onOpenSettings={vi.fn()} />);
    fireEvent.change(screen.getByTestId('ask-bar-input'), { target: { value: '   ' } });
    fireEvent.click(screen.getByText('生成'));
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
