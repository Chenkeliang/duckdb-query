/**
 * EngineCompatSelfHealBanner 组件单元测试
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EngineCompatSelfHealBanner } from '../EngineCompatSelfHealBanner';
import { saveEngineCompat } from '@/api/engineCompatApi';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, defaultValue: string) => defaultValue,
  }),
}));

vi.mock('@/api/engineCompatApi', () => ({
  saveEngineCompat: vi.fn(),
}));

const MISMATCH_ERROR =
  'Mismatch Type Error: Invalid type in column "updated_at": column was declared as ' +
  'integer, found "2024-01-01" of type "text" instead. SET sqlite_all_varchar=true';

describe('EngineCompatSelfHealBanner', () => {
  beforeEach(() => {
    vi.mocked(saveEngineCompat).mockReset();
  });

  it('should render banner when error matches sqlite type mismatch scenario', () => {
    render(<EngineCompatSelfHealBanner errorMessage={MISMATCH_ERROR} onRerun={vi.fn()} />);

    expect(screen.getByText('SQLite 类型不一致')).toBeInTheDocument();
    expect(screen.getByText('开启 SQLite 兼容模式并重跑')).toBeInTheDocument();
  });

  it('should not render when error does not match any known scenario', () => {
    const { container } = render(
      <EngineCompatSelfHealBanner errorMessage="Binder Error: column not found" onRerun={vi.fn()} />
    );

    expect(container.firstChild).toBeNull();
  });

  it('should call saveEngineCompat and onRerun when the action button is clicked', async () => {
    vi.mocked(saveEngineCompat).mockResolvedValue({
      sqlite_all_varchar: true,
      mysql_incomplete_dates_as_nulls: false,
      pg_array_as_varchar: false,
      unsafe_enable_version_guessing: false,
    });
    const onRerun = vi.fn().mockResolvedValue(undefined);

    render(<EngineCompatSelfHealBanner errorMessage={MISMATCH_ERROR} onRerun={onRerun} />);

    fireEvent.click(screen.getByText('开启 SQLite 兼容模式并重跑'));

    await waitFor(() => {
      expect(saveEngineCompat).toHaveBeenCalledWith({ sqlite_all_varchar: true });
      expect(onRerun).toHaveBeenCalled();
    });
  });

  it('should hide the banner when the close button is clicked', () => {
    const onDismiss = vi.fn();
    render(
      <EngineCompatSelfHealBanner
        errorMessage={MISMATCH_ERROR}
        onRerun={vi.fn()}
        onDismiss={onDismiss}
      />
    );

    fireEvent.click(screen.getByLabelText('关闭'));

    expect(onDismiss).toHaveBeenCalled();
    expect(screen.queryByText('SQLite 类型不一致')).not.toBeInTheDocument();
  });
});
