import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: string | { defaultValue?: string }) =>
      typeof options === 'string' ? options : options?.defaultValue ?? key,
  }),
}));

import { JsonCellViewerDialog } from '../JsonCellViewerDialog';

describe('JsonCellViewerDialog', () => {
  const writeText = vi.fn<(_text: string) => Promise<void>>();

  beforeEach(() => {
    writeText.mockReset();
    writeText.mockResolvedValue();
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
  });

  it('bounds visible text but copies the complete source and exposes paths', async () => {
    const raw = `{"payload":"${'x'.repeat(210_000)}"}`;
    render(<JsonCellViewerDialog value={raw} onClose={vi.fn()} />);

    expect(document.querySelector('pre')?.textContent).toHaveLength(200_000);
    expect(screen.getByRole('button', { name: '复制路径' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '复制' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(raw));
  });
});
