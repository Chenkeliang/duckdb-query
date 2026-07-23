/**
 * Regression (2026-07-23): DuckDB 文件连接的 DUCKDB_CONNECTION_SUCCESS 曾缺
 * i18n 键,中文界面弹出后端英文兜底文案。后端每种连接类型都会发
 * <TYPE>_CONNECTION_SUCCESS / _FAILED 两个 messageCode(database_manager.py),
 * zh/en errors 命名空间必须成对齐全。
 */
import { describe, expect, it } from 'vitest';

import zhErrors from '../i18n/locales/zh/errors.json';
import enErrors from '../i18n/locales/en/errors.json';

const CONNECTION_TYPES = ['MYSQL', 'POSTGRESQL', 'SQLITE', 'DUCKDB'];

describe('connection test toast i18n contract', () => {
  it.each(CONNECTION_TYPES)('%s success/failed codes exist in zh and en', (type) => {
    for (const suffix of ['CONNECTION_SUCCESS', 'CONNECTION_FAILED']) {
      const code = `${type}_${suffix}`;
      expect(zhErrors, `zh 缺 ${code}`).toHaveProperty(code);
      expect(enErrors, `en 缺 ${code}`).toHaveProperty(code);
    }
  });
});
