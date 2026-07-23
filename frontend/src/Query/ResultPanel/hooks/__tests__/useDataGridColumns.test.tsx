import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useDataGridColumns } from '../useDataGridColumns';

describe('useDataGridColumns date display', () => {
  it('preserves database date and timestamp text without browser localization', () => {
    const row = {
      event_date: '2026-07-05',
      created_at: '2026-07-05 00:00:00',
      zoned_at: '2026-07-05T00:00:00+08:00',
    };

    const { result } = renderHook(() =>
      useDataGridColumns({
        data: [row],
        fieldOrder: Object.keys(row),
      })
    );

    for (const [field, value] of Object.entries(row)) {
      const column = result.current.columns.find((item) => item.field === field);
      expect(column?.type).toBe('date');
      expect(column?.valueFormatter?.(value)).toBe(value);
    }
  });

  it('renders null date values consistently', () => {
    const { result } = renderHook(() =>
      useDataGridColumns({
        data: [{ created_at: '2026-07-05 00:00:00' }, { created_at: null }],
      })
    );

    expect(result.current.columns[0]?.valueFormatter?.(null)).toBe('NULL');
  });
});
