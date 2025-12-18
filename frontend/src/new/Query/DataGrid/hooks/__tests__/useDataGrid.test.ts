/**
 * useDataGrid Hook tests
 */
import { describe, expect, it } from 'vitest';
import { renderHook, act } from '@testing-library/react';

import { useDataGrid } from '../useDataGrid';

describe('useDataGrid', () => {
  it('keeps filteredData in sync with filteredRowCount', () => {
    const data = [
      { city: '云浮市', province: '广东省' },
      { city: '赣州市', province: '江西省' },
      { city: '保定市', province: '河北省' },
    ];

    const { result } = renderHook(() => useDataGrid({ data }));

    act(() => {
      result.current.setColumnFilters([
        {
          id: 'city',
          value: { selectedValues: new Set(['云浮市', '自贡市']), mode: 'include' },
        },
      ]);
    });

    expect(result.current.filteredRowCount).toBe(1);
    expect(result.current.filteredData).toHaveLength(1);
    expect(result.current.filteredData[0].city).toBe('云浮市');
  });
});

