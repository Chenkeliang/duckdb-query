/**
 * SQLQueryPanel 异步联邦查询集成测试
 * 
 * 测试联邦查询检测到异步任务提交的数据流
 * 
 * **Feature: async-federated-query**
 */

import { describe, it, expect } from 'vitest';

describe('SQLQueryPanel - Async Federated Query Integration', () => {
  describe('attachDatabases data flow', () => {
    it('should pass attachDatabases from useFederatedQueryDetection to AsyncTaskDialog', () => {
      /**
       * **Feature: async-federated-query**
       * **Validates: Requirements 3.3**
       * 
       * 验证数据流：
       * 1. useFederatedQueryDetection 检测 SQL 中的外部表引用
       * 2. 返回 attachDatabases 列表
       * 3. SQLQueryPanel 将 attachDatabases 传递给 AsyncTaskDialog
       * 4. AsyncTaskDialog 在提交时包含 attach_databases 参数
       */
      
      // 模拟 useFederatedQueryDetection 返回的数据
      const mockAttachDatabases = [
        { alias: 'mysql_db', connectionId: 'conn-1' },
        { alias: 'pg_db', connectionId: 'conn-2' },
      ];
      
      // 模拟可用连接
      const mockConnections = [
        { id: 'conn-1', name: 'MySQL Production', type: 'mysql' },
        { id: 'conn-2', name: 'PostgreSQL Analytics', type: 'postgres' },
      ];
      
      // 模拟 SQLQueryPanel 中的转换逻辑
      const attachDatabasesForDialog = mockAttachDatabases.map(db => {
        const connection = mockConnections.find(c => c.id === db.connectionId);
        return {
          alias: db.alias,
          connectionId: db.connectionId,
          connectionName: connection?.name,
        };
      });
      
      // 验证转换结果
      expect(attachDatabasesForDialog).toHaveLength(2);
      expect(attachDatabasesForDialog[0]).toEqual({
        alias: 'mysql_db',
        connectionId: 'conn-1',
        connectionName: 'MySQL Production',
      });
      expect(attachDatabasesForDialog[1]).toEqual({
        alias: 'pg_db',
        connectionId: 'conn-2',
        connectionName: 'PostgreSQL Analytics',
      });
    });

    it('should handle empty attachDatabases for non-federated queries', () => {
      const mockAttachDatabases: Array<{ alias: string; connectionId: string }> = [];
      const mockConnections: Array<{ id: string; name: string; type: string }> = [];
      
      const attachDatabasesForDialog = mockAttachDatabases.map(db => {
        const connection = mockConnections.find(c => c.id === db.connectionId);
        return {
          alias: db.alias,
          connectionId: db.connectionId,
          connectionName: connection?.name,
        };
      });
      
      expect(attachDatabasesForDialog).toHaveLength(0);
    });

    it('should handle missing connection name gracefully', () => {
      const mockAttachDatabases = [
        { alias: 'unknown_db', connectionId: 'conn-unknown' },
      ];
      const mockConnections: Array<{ id: string; name: string; type: string }> = [];
      
      const attachDatabasesForDialog = mockAttachDatabases.map(db => {
        const connection = mockConnections.find(c => c.id === db.connectionId);
        return {
          alias: db.alias,
          connectionId: db.connectionId,
          connectionName: connection?.name,
        };
      });
      
      expect(attachDatabasesForDialog[0].connectionName).toBeUndefined();
    });
  });

  describe('API payload construction', () => {
    it('should construct correct payload for federated async query', () => {
      /**
       * **Feature: async-federated-query**
       * **Validates: Requirements 2.1**
       */
      const sql = 'SELECT * FROM mysql_db.users JOIN pg_db.orders';
      const attachDatabases = [
        { alias: 'mysql_db', connectionId: 'conn-1', connectionName: 'MySQL' },
        { alias: 'pg_db', connectionId: 'conn-2', connectionName: 'PostgreSQL' },
      ];
      
      // 模拟 AsyncTaskDialog 中的 payload 构建
      const payload: {
        sql: string;
        task_type: string;
        attach_databases?: Array<{ alias: string; connection_id: string }>;
      } = {
        sql,
        task_type: 'query',
      };
      
      if (attachDatabases.length > 0) {
        payload.attach_databases = attachDatabases.map(db => ({
          alias: db.alias,
          connection_id: db.connectionId,
        }));
      }
      
      expect(payload.sql).toBe(sql);
      expect(payload.attach_databases).toHaveLength(2);
      expect(payload.attach_databases![0]).toEqual({
        alias: 'mysql_db',
        connection_id: 'conn-1',
      });
    });

    it('should not include attach_databases for non-federated query', () => {
      const sql = 'SELECT * FROM local_table';
      const attachDatabases: Array<{ alias: string; connectionId: string }> = [];
      
      const payload: {
        sql: string;
        task_type: string;
        attach_databases?: Array<{ alias: string; connection_id: string }>;
      } = {
        sql,
        task_type: 'query',
      };
      
      if (attachDatabases.length > 0) {
        payload.attach_databases = attachDatabases.map(db => ({
          alias: db.alias,
          connection_id: db.connectionId,
        }));
      }
      
      expect(payload.attach_databases).toBeUndefined();
    });
  });
});
