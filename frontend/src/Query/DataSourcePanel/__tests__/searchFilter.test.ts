/**
 * 搜索过滤功能单元测试
 * Task 6.3: 编写搜索功能单元测试
 */

import { describe, it, expect } from 'vitest';

interface Table {
  name: string;
  type?: string;
}

/**
 * 搜索过滤函数（大小写不敏感）
 */
function filterTables(tables: Table[], query: string): Table[] {
  if (!query.trim()) {
    return tables;
  }
  const lowerQuery = query.toLowerCase();
  return tables.filter(table => 
    table.name.toLowerCase().includes(lowerQuery)
  );
}

/**
 * 高亮匹配文本
 */
function highlightMatch(text: string, query: string): { before: string; match: string; after: string } | null {
  if (!query.trim()) {
    return null;
  }
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const index = lowerText.indexOf(lowerQuery);
  
  if (index === -1) {
    return null;
  }
  
  return {
    before: text.slice(0, index),
    match: text.slice(index, index + query.length),
    after: text.slice(index + query.length),
  };
}

describe('搜索过滤功能', () => {
  describe('大小写不敏感搜索', () => {
    it('小写搜索应该匹配大写表名', () => {
      const tables: Table[] = [
        { name: 'USERS' },
        { name: 'Orders' },
        { name: 'products' },
      ];

      const result = filterTables(tables, 'users');

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('USERS');
    });

    it('大写搜索应该匹配小写表名', () => {
      const tables: Table[] = [
        { name: 'users' },
        { name: 'orders' },
      ];

      const result = filterTables(tables, 'USERS');

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('users');
    });

    it('混合大小写搜索应该正确匹配', () => {
      const tables: Table[] = [
        { name: 'UserOrders' },
        { name: 'user_orders' },
        { name: 'USER_ORDERS' },
      ];

      const result = filterTables(tables, 'userOrder');

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('UserOrders');
    });
  });

  describe('空搜索结果处理', () => {
    it('空搜索词应该返回所有表', () => {
      const tables: Table[] = [
        { name: 'users' },
        { name: 'orders' },
        { name: 'products' },
      ];

      const result = filterTables(tables, '');

      expect(result).toHaveLength(3);
    });

    it('只有空格的搜索词应该返回所有表', () => {
      const tables: Table[] = [
        { name: 'users' },
        { name: 'orders' },
      ];

      const result = filterTables(tables, '   ');

      expect(result).toHaveLength(2);
    });

    it('无匹配结果应该返回空数组', () => {
      const tables: Table[] = [
        { name: 'users' },
        { name: 'orders' },
      ];

      const result = filterTables(tables, 'xyz');

      expect(result).toHaveLength(0);
    });
  });

  describe('部分匹配', () => {
    it('应该匹配表名的开头', () => {
      const tables: Table[] = [
        { name: 'user_profiles' },
        { name: 'user_orders' },
        { name: 'products' },
      ];

      const result = filterTables(tables, 'user');

      expect(result).toHaveLength(2);
    });

    it('应该匹配表名的中间', () => {
      const tables: Table[] = [
        { name: 'user_profiles' },
        { name: 'customer_profiles' },
        { name: 'products' },
      ];

      const result = filterTables(tables, 'profile');

      expect(result).toHaveLength(2);
    });

    it('应该匹配表名的结尾', () => {
      const tables: Table[] = [
        { name: 'user_data' },
        { name: 'order_data' },
        { name: 'products' },
      ];

      const result = filterTables(tables, 'data');

      expect(result).toHaveLength(2);
    });
  });

  describe('跨分组搜索', () => {
    it('应该同时搜索系统表和普通表', () => {
      const tables: Table[] = [
        { name: 'system_tables' },
        { name: 'user_tables' },
        { name: 'system_columns' },
        { name: 'orders' },
      ];

      const result = filterTables(tables, 'table');

      expect(result).toHaveLength(2);
      expect(result.map(t => t.name)).toContain('system_tables');
      expect(result.map(t => t.name)).toContain('user_tables');
    });
  });
});

describe('搜索高亮功能', () => {
  it('应该正确分割匹配文本', () => {
    const result = highlightMatch('user_profiles', 'profile');

    expect(result).not.toBeNull();
    expect(result?.before).toBe('user_');
    expect(result?.match).toBe('profile');
    expect(result?.after).toBe('s');
  });

  it('匹配开头应该正确分割', () => {
    const result = highlightMatch('user_profiles', 'user');

    expect(result).not.toBeNull();
    expect(result?.before).toBe('');
    expect(result?.match).toBe('user');
    expect(result?.after).toBe('_profiles');
  });

  it('匹配结尾应该正确分割', () => {
    const result = highlightMatch('user_profiles', 'profiles');

    expect(result).not.toBeNull();
    expect(result?.before).toBe('user_');
    expect(result?.match).toBe('profiles');
    expect(result?.after).toBe('');
  });

  it('无匹配应该返回 null', () => {
    const result = highlightMatch('user_profiles', 'xyz');

    expect(result).toBeNull();
  });

  it('空搜索词应该返回 null', () => {
    const result = highlightMatch('user_profiles', '');

    expect(result).toBeNull();
  });

  it('大小写不敏感高亮', () => {
    const result = highlightMatch('UserProfiles', 'user');

    expect(result).not.toBeNull();
    expect(result?.match).toBe('User'); // 保留原始大小写
  });
});

describe('搜索属性测试', () => {
  // Property 4: 搜索过滤完整性
  it('搜索返回的所有表都应该包含搜索词', () => {
    const tables: Table[] = [
      { name: 'users' },
      { name: 'user_orders' },
      { name: 'products' },
      { name: 'user_profiles' },
      { name: 'orders' },
    ];
    const query = 'user';

    const result = filterTables(tables, query);

    // 验证所有返回的表都包含搜索词
    for (const table of result) {
      expect(table.name.toLowerCase()).toContain(query.toLowerCase());
    }
  });

  it('搜索不应该返回不匹配的表', () => {
    const tables: Table[] = [
      { name: 'users' },
      { name: 'orders' },
      { name: 'products' },
    ];
    const query = 'user';

    const result = filterTables(tables, query);
    const notMatched = tables.filter(t => !t.name.toLowerCase().includes(query.toLowerCase()));

    // 验证不匹配的表不在结果中
    for (const table of notMatched) {
      expect(result.find(r => r.name === table.name)).toBeUndefined();
    }
  });
});
