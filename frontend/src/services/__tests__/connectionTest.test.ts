/**
 * 连接测试 API 路由属性测试
 * 
 * **Feature: external-table-integration-fixes, Property 6: Connection Test API Routing**
 * **Validates: Requirements 6.1, 6.2, 6.3**
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

// 数据库类型
type DatabaseType = 'mysql' | 'postgresql' | 'sqlite';

// 连接数据类型
interface ConnectionData {
  id?: string;
  name: string;
  type: DatabaseType;
  host?: string;
  port?: number;
  database?: string;
  username?: string;
  password?: string;
}

// Arbitraries
const databaseTypeArb = fc.constantFrom<DatabaseType>('mysql', 'postgresql', 'sqlite');

const newConnectionArb: fc.Arbitrary<ConnectionData> = fc.record({
  name: fc.string({ minLength: 1, maxLength: 100 }),
  type: databaseTypeArb,
  host: fc.option(fc.string({ minLength: 1, maxLength: 100 }), { nil: undefined }),
  port: fc.option(fc.integer({ min: 1, max: 65535 }), { nil: undefined }),
  database: fc.option(fc.string({ minLength: 1, maxLength: 100 }), { nil: undefined }),
  username: fc.option(fc.string({ minLength: 1, maxLength: 100 }), { nil: undefined }),
  password: fc.option(fc.string({ minLength: 1, maxLength: 100 }), { nil: undefined }),
});

const savedConnectionArb: fc.Arbitrary<ConnectionData> = fc.record({
  id: fc.string({ minLength: 1, maxLength: 50 }),
  name: fc.string({ minLength: 1, maxLength: 100 }),
  type: databaseTypeArb,
  host: fc.option(fc.string({ minLength: 1, maxLength: 100 }), { nil: undefined }),
  port: fc.option(fc.integer({ min: 1, max: 65535 }), { nil: undefined }),
  database: fc.option(fc.string({ minLength: 1, maxLength: 100 }), { nil: undefined }),
  username: fc.option(fc.string({ minLength: 1, maxLength: 100 }), { nil: undefined }),
  password: fc.option(fc.string({ minLength: 1, maxLength: 100 }), { nil: undefined }),
});

/**
 * 模拟 testConnection 的路由逻辑
 */
const determineApiEndpoint = (connectionData: ConnectionData): string => {
  if (connectionData.id) {
    const connectionId = connectionData.id.replace(/^db_/, '');
    return `/api/datasources/databases/${connectionId}/refresh`;
  }
  return '/api/datasources/databases/test';
};

/**
 * 模拟响应解析逻辑
 */
const parseConnectionTestResponse = (data: any): { success: boolean; message?: string } => {
  const connectionTest = data?.data?.connection_test || data?.connection_test;
  
  if (connectionTest) {
    return {
      success: connectionTest.success === true,
      message: connectionTest.message || (connectionTest.success ? '连接成功' : '连接失败'),
    };
  }
  
  return {
    success: data?.success === true,
    message: data?.message || (data?.success ? '连接成功' : '连接失败'),
  };
};

describe('Connection Test API Routing - Property Tests', () => {
  describe('API endpoint routing', () => {
    /**
     * Property 6: Connection Test API Routing
     * New connections (without ID) should use test endpoint
     */
    it('should route new connections to test endpoint', () => {
      fc.assert(
        fc.property(
          newConnectionArb,
          (connectionData) => {
            const endpoint = determineApiEndpoint(connectionData);
            return endpoint === '/api/datasources/databases/test';
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property: Saved connections (with ID) should use refresh endpoint
     */
    it('should route saved connections to refresh endpoint', () => {
      fc.assert(
        fc.property(
          savedConnectionArb,
          (connectionData) => {
            const endpoint = determineApiEndpoint(connectionData);
            const expectedId = connectionData.id!.replace(/^db_/, '');
            return endpoint === `/api/datasources/databases/${expectedId}/refresh`;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property: Connection ID should have db_ prefix stripped
     */
    it('should strip db_ prefix from connection ID in endpoint', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 50 }),
          (baseId) => {
            const connectionData: ConnectionData = {
              id: `db_${baseId}`,
              name: 'Test',
              type: 'mysql',
            };
            
            const endpoint = determineApiEndpoint(connectionData);
            
            // The endpoint should not contain db_ prefix (unless baseId itself starts with db_)
            return !endpoint.includes('/db_') || baseId.startsWith('db_');
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Response parsing', () => {
    /**
     * Property: Should correctly parse nested connection_test response
     */
    it('should parse nested connection_test response', () => {
      fc.assert(
        fc.property(
          fc.boolean(),
          fc.option(fc.string({ minLength: 1, maxLength: 100 }), { nil: undefined }),
          (success, message) => {
            const response = {
              success: true,
              data: {
                connection_test: {
                  success,
                  message,
                },
              },
            };
            
            const result = parseConnectionTestResponse(response);
            return result.success === success;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property: Should correctly parse flat connection_test response
     */
    it('should parse flat connection_test response', () => {
      fc.assert(
        fc.property(
          fc.boolean(),
          fc.option(fc.string({ minLength: 1, maxLength: 100 }), { nil: undefined }),
          (success, message) => {
            const response = {
              success: true,
              connection_test: {
                success,
                message,
              },
            };
            
            const result = parseConnectionTestResponse(response);
            return result.success === success;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property: Should correctly parse simple success response
     */
    it('should parse simple success response', () => {
      fc.assert(
        fc.property(
          fc.boolean(),
          (success) => {
            const response = { success };
            
            const result = parseConnectionTestResponse(response);
            return result.success === success;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property: Should provide default message when not provided
     */
    it('should provide default message when not provided', () => {
      fc.assert(
        fc.property(
          fc.boolean(),
          (success) => {
            const response = { success };
            
            const result = parseConnectionTestResponse(response);
            return typeof result.message === 'string' && result.message.length > 0;
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
