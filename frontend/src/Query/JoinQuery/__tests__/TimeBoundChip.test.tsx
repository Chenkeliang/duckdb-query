import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TimeBoundChip } from '../TimeBoundChip';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_k: string, d?: string) => d ?? _k,
    i18n: { language: 'zh' },
  }),
}));

describe('TimeBoundChip', () => {
  it('single candidate: clicking adds the recommended column', () => {
    const onAdd = vi.fn();
    render(
      <TimeBoundChip tableName="orders" recommended="create_time" candidates={['create_time']} onAdd={onAdd} />,
    );
    fireEvent.click(screen.getByTestId('time-bound-chip-orders'));
    expect(onAdd).toHaveBeenCalledWith('create_time');
  });

  it('multiple candidates: can pick a non-default column', () => {
    const onAdd = vi.fn();
    render(
      <TimeBoundChip
        tableName="orders"
        recommended="create_time"
        candidates={['create_time', 'updated_at']}
        onAdd={onAdd}
      />,
    );
    fireEvent.click(screen.getByTestId('time-bound-chip-menu-orders'));
    fireEvent.click(screen.getByText('updated_at'));
    expect(onAdd).toHaveBeenCalledWith('updated_at');
  });

  it('shows the recommended column name', () => {
    render(
      <TimeBoundChip tableName="orders" recommended="create_time" candidates={['create_time']} onAdd={() => {}} />,
    );
    expect(screen.getByTestId('time-bound-chip-orders').textContent).toContain('create_time');
  });

  it('clicking the chip while the menu is open closes the menu and adds recommended', () => {
    const onAdd = vi.fn();
    render(
      <TimeBoundChip
        tableName="orders"
        recommended="create_time"
        candidates={['create_time', 'updated_at']}
        onAdd={onAdd}
      />,
    );
    fireEvent.click(screen.getByTestId('time-bound-chip-menu-orders'));
    expect(screen.queryByText('updated_at')).not.toBeNull(); // 菜单已打开
    fireEvent.click(screen.getByTestId('time-bound-chip-orders'));
    expect(onAdd).toHaveBeenCalledWith('create_time');
    expect(screen.queryByText('updated_at')).toBeNull(); // 菜单已关闭
  });
});
