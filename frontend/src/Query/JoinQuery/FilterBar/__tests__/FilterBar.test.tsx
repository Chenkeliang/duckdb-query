import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { FilterBar } from '../FilterBar';
import type { FilterGroup } from '../types';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, fallback?: string) => fallback ?? _key,
  }),
}));

function filterTree(): FilterGroup {
  return {
    id: 'root',
    type: 'group',
    logic: 'AND',
    children: [
      {
        id: 'on-condition',
        type: 'condition',
        table: 'sorting_info',
        column: 'update_time',
        operator: '>=',
        value: '2026-06-01',
        placement: 'on',
      },
      {
        id: 'where-condition',
        type: 'condition',
        table: 'sorting_info',
        column: 'status',
        operator: '=',
        value: 'paid',
        placement: 'where',
      },
    ],
  };
}

describe('FilterBar SQL mode placement', () => {
  it('shows only WHERE conditions in the SQL editor', () => {
    render(
      <FilterBar
        filterTree={filterTree()}
        onFilterChange={() => {}}
        availableColumns={[]}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'SQL' }));

    const sql = (screen.getByRole('textbox') as HTMLTextAreaElement).value;
    expect(sql).toContain('"sorting_info"."status"');
    expect(sql).not.toContain('"sorting_info"."update_time"');
  });

  it('preserves ON conditions when switching to SQL and back', () => {
    const onFilterChange = vi.fn();
    const tree = filterTree();
    tree.children = [tree.children[0]];
    render(
      <FilterBar
        filterTree={tree}
        onFilterChange={onFilterChange}
        availableColumns={[]}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'SQL' }));
    fireEvent.click(screen.getByRole('button', { name: '表单' }));

    expect(onFilterChange).toHaveBeenCalledTimes(1);
    const updated = onFilterChange.mock.calls[0][0] as FilterGroup;
    expect(updated.children).toHaveLength(1);
    expect(updated.children[0]).toMatchObject({
      id: 'on-condition',
      placement: 'on',
    });
  });
});
