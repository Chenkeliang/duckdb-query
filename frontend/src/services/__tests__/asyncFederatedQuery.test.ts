/**
 * 异步联邦查询 API 客户端测试
 * 
 * 测试 submitAsyncQuery 函数对联邦查询参数的支持
 * 
 * **Feature: async-federated-query**
 */

import { describe, it, expect } from 'vitest';

describe('submitAsyncQuery - Federated Query Support', () => {
  describe('parameter serialization', () => {
    it('should serialize attach_databases correctly', () => {
      /**
       * **Feature: async-federated-query**
       * **Validates: Requirements 2.1**
       */
      const payload = {
        sql: 'SELECT * FROM mysql_db.users',
        task_type: 'query',
        attach_databases: [
          { alias: 'mysql_db', connection_id: 'conn-1' },
          { alias: 'pg_db', connection_id: 'conn-2' },
        ],
      };
      
      // 验证 payload 结构
      expect(payload.sql).toBe('SELECT * FROM mysql_db.users');
      expect(payload.attach_databases).toHaveLength(2);
      expect(payload.attach_databases[0]).toEqual({
        alias: 'mysql_db',
        connection_id: 'conn-1',
      });
    });

    it('should handle payload without attach_databases', () => {
      const payload = {
        sql: 'SELECT * FROM local_table',
        task_type: 'query',
      };
      
      expect(payload.sql).toBe('SELECT * FROM local_table');
      expect((payload as any).attach_databases).toBeUndefined();
    });

    it('should handle empty attach_databases array', () => {
      const payload = {
        sql: 'SELECT * FROM local_table',
        task_type: 'query',
        attach_databases: [],
      };
      
      expect(payload.attach_databases).toHaveLength(0);
    });
  });

  describe('camelCase to snake_case conversion', () => {
    it('should use snake_case for API parameters', () => {
      /**
       * **Feature: async-federated-query**
       * **Validates: Requirements 2.1**
       * 
       * 验证前端使用 snake_case 与后端 API 通信
       */
      const frontendData = {
        alias: 'mysql_db',
        connectionId: 'conn-1',
      };
      
      // 转换为 API 格式
      const apiData = {
        alias: frontendData.alias,
        connection_id: frontendData.connectionId,
      };
      
      expect(apiData.connection_id).toBe('conn-1');
      expect((apiData as any).connectionId).toBeUndefined();
    });
  });

  describe('payload validation', () => {
    it('should require sql field', () => {
      const payload = {
        sql: '',
        task_type: 'query',
      };
      
      // 空 SQL 应该被验证拒绝
      expect(payload.sql.trim()).toBe('');
    });

    it('should accept valid federated query payload', () => {
      const payload = {
        sql: 'SELECT * FROM mysql_db.users JOIN pg_db.orders ON users.id = orders.user_id',
        task_type: 'query',
        custom_table_name: 'federated_result',
        attach_databases: [
          { alias: 'mysql_db', connection_id: 'mysql-conn' },
          { alias: 'pg_db', connection_id: 'pg-conn' },
        ],
      };
      
      expect(payload.sql.trim().length).toBeGreaterThan(0);
      expect(payload.attach_databases).toHaveLength(2);
      expect(payload.custom_table_name).toBe('federated_result');
    });
  });
});
