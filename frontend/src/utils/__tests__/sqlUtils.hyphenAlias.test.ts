/**
 * 回归测试：连接名/ID 含连字符（如用户真实连接 "ALARM-SQLITE"）时，
 * generateExternalTableReference 生成的 SQL 别名必须是合法标识符，
 * 且与联邦执行时 attachDatabase.alias 保持一致（同一次调用生成，天然同步）。
 */

import { describe, it, expect } from 'vitest';
import { generateExternalTableReference } from '../sqlUtils';
import type { SelectedTableObject } from '@/types/SelectedTable';

describe('generateExternalTableReference: hyphenated connection name/id', () => {
  it('sanitizes a hyphenated connection name into a valid bare identifier', () => {
    const table: SelectedTableObject = {
      name: 'alarms',
      source: 'external',
      connection: { id: 'conn-alarm-sqlite', name: 'ALARM-SQLITE', type: 'sqlite' },
    };

    const { qualifiedName, attachDatabase } = generateExternalTableReference(table);

    // 别名不含连字符/大写，是合法裸标识符
    expect(attachDatabase).not.toBeNull();
    expect(attachDatabase!.alias).toMatch(/^[a-z_][a-z0-9_]*$/);
    expect(attachDatabase!.alias).not.toContain('-');
    expect(attachDatabase!.connectionId).toBe('conn-alarm-sqlite');

    // qualifiedName 中使用的别名与 attachDatabase.alias 完全一致（同一来源，不会错位）
    expect(qualifiedName).toBe(`${attachDatabase!.alias}.alarms`);
  });

  it('keeps qualifiedName alias and attachDatabase alias in sync for a hyphenated duckdb file connection', () => {
    const table: SelectedTableObject = {
      name: 'products',
      source: 'external',
      connection: { id: 'conn-2', name: 'my-duckdb-file', type: 'duckdb' },
    };

    const { qualifiedName, attachDatabase } = generateExternalTableReference(table);

    expect(attachDatabase!.alias).toBe('duckdb_my_duckdb_file');
    expect(qualifiedName).toBe('duckdb_my_duckdb_file.products');
  });
});
