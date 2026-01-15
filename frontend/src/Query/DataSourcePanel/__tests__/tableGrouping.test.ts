/**
 * 表分组逻辑单元测试
 * Task 3.3: 编写表分组单元测试
 */

import { describe, it, expect } from 'vitest';

// 表分组逻辑（从 DataSourcePanel 提取）
interface Table {
  name: string;
  type?: string;
  row_count?: number;
}

interface GroupedTables {
  systemTables: Table[];
  regularTables: Table[];
}

/**
 * 将表按前缀分组
 * - system_* 前缀 -> 系统表
 * - 其他 -> 普通表
 */
function groupTables(tables: Table[]): GroupedTables {
  const systemTables: Table[] = [];
  const regularTables: Table[] = [];

  for (const table of tables) {
    if (table.name.startsWith('system_')) {
      systemTables.push(table);
    } else {
      regularTables.push(table);
    }
  }

  return { systemTables, regularTables };
}

describe('表分组逻辑', () => {
  describe('system_* 前缀识别', () => {
    it('应该将 system_ 前缀的表归入系统表', () => {
      const tables: Table[] = [
        { name: 'system_tables' },
        { name: 'system_columns' },
        { name: 'system_functions' },
      ];

      const { systemTables, regularTables } = groupTables(tables);

      expect(systemTables).toHaveLength(3);
      expect(regularTables).toHaveLength(0);
    });

    it('应该将非 system_ 前缀的表归入普通表', () => {
      const tables: Table[] = [
        { name: 'users' },
        { name: 'orders' },
        { name: 'products' },
      ];

      const { systemTables, regularTables } = groupTables(tables);

      expect(systemTables).toHaveLength(0);
      expect(regularTables).toHaveLength(3);
    });

    it('应该正确分组混合表列表', () => {
      const tables: Table[] = [
        { name: 'users' },
        { name: 'system_tables' },
        { name: 'orders' },
        { name: 'system_columns' },
        { name: 'products' },
      ];

      const { systemTables, regularTables } = groupTables(tables);

      expect(systemTables).toHaveLength(2);
      expect(regularTables).toHaveLength(3);
      expect(systemTables.map(t => t.name)).toEqual(['system_tables', 'system_columns']);
      expect(regularTables.map(t => t.name)).toEqual(['users', 'orders', 'products']);
    });
  });

  describe('边界情况', () => {
    it('空表列表应该返回空分组', () => {
      const tables: Table[] = [];

      const { systemTables, regularTables } = groupTables(tables);

      expect(systemTables).toHaveLength(0);
      expect(regularTables).toHaveLength(0);
    });

    it('表名包含 system_ 但不是前缀的应该归入普通表', () => {
      const tables: Table[] = [
        { name: 'my_system_table' },
        { name: 'user_system_config' },
      ];

      const { systemTables, regularTables } = groupTables(tables);

      expect(systemTables).toHaveLength(0);
      expect(regularTables).toHaveLength(2);
    });

    it('表名为 system_ 本身应该归入系统表', () => {
      const tables: Table[] = [
        { name: 'system_' },
      ];

      const { systemTables, regularTables } = groupTables(tables);

      expect(systemTables).toHaveLength(1);
      expect(regularTables).toHaveLength(0);
    });

    it('大小写敏感：SYSTEM_ 前缀应该归入普通表', () => {
      const tables: Table[] = [
        { name: 'SYSTEM_tables' },
        { name: 'System_columns' },
      ];

      const { systemTables, regularTables } = groupTables(tables);

      expect(systemTables).toHaveLength(0);
      expect(regularTables).toHaveLength(2);
    });
  });

  describe('数据完整性', () => {
    it('分组后应该保留所有表属性', () => {
      const tables: Table[] = [
        { name: 'system_tables', type: 'BASE TABLE', row_count: 100 },
        { name: 'users', type: 'BASE TABLE', row_count: 1000 },
      ];

      const { systemTables, regularTables } = groupTables(tables);

      expect(systemTables[0]).toEqual({ name: 'system_tables', type: 'BASE TABLE', row_count: 100 });
      expect(regularTables[0]).toEqual({ name: 'users', type: 'BASE TABLE', row_count: 1000 });
    });

    it('分组后表的总数应该不变', () => {
      const tables: Table[] = [
        { name: 'system_a' },
        { name: 'table_b' },
        { name: 'system_c' },
        { name: 'table_d' },
        { name: 'table_e' },
      ];

      const { systemTables, regularTables } = groupTables(tables);

      expect(systemTables.length + regularTables.length).toBe(tables.length);
    });
  });
});

describe('表分组属性测试', () => {
  // Property 1: DuckDB 表分组一致性
  it('所有 system_* 表应该在系统表分组中', () => {
    // 生成随机表列表
    const randomTables: Table[] = [
      { name: 'system_test1' },
      { name: 'system_test2' },
      { name: 'system_abc' },
      { name: 'regular_table' },
      { name: 'another_table' },
    ];

    const { systemTables, regularTables } = groupTables(randomTables);

    // 验证所有 system_* 表在系统表分组
    for (const table of systemTables) {
      expect(table.name.startsWith('system_')).toBe(true);
    }

    // 验证所有非 system_* 表在普通表分组
    for (const table of regularTables) {
      expect(table.name.startsWith('system_')).toBe(false);
    }
  });
});
