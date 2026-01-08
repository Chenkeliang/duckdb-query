/**
 * @fileoverview 强制在新布局中使用 TanStack Query 进行服务端数据获取
 * @author DuckQuery Team
 */

'use strict';

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description: '强制在新布局中使用 TanStack Query 进行服务端数据获取',
      category: 'Best Practices',
      recommended: true,
      url: 'https://github.com/duckquery/lint-rules/blob/main/eslint/docs/require-tanstack-query.md'
    },
    messages: {
      noFetchInUseEffect: '禁止在 useEffect 中直接调用 API 获取服务端数据，请使用 TanStack Query',
      noUseStateForServerData: '禁止使用 useState 管理服务端数据，请使用 TanStack Query',
      useTanStackQuery: '请使用 TanStack Query (useQuery/useMutation) 进行服务端数据获取',
      useSharedHook: '常用数据应创建共享 Hook (如 useDuckDBTables)，而不是在组件中直接使用 useQuery'
    },
    schema: [
      {
        type: 'object',
        properties: {
          allowedPaths: {
            type: 'array',
            items: { type: 'string' },
            description: '允许使用传统方式的文件路径模式'
          },
          sharedHookPatterns: {
            type: 'array',
            items: { type: 'string' },
            description: '共享 Hook 的命名模式'
          }
        },
        additionalProperties: false
      }
    ]
  },

  create(context) {
    const options = context.options[0] || {};
    const allowedPaths = options.allowedPaths || [
      '**/components/**', // 旧布局
      '**/services/**',   // API 客户端
      '**/*.test.*',      // 测试文件
      '**/__tests__/**'   // 测试目录
    ];
    const sharedHookPatterns = options.sharedHookPatterns || [
      'useDuckDBTables',
      'useDataSources',
      'useDatabaseConnections',
      'useTableColumns',
      'useSchemas',
      'useSchemaTables'
    ];

    const filename = context.getFilename();
    
    // 检查是否在新布局中
    const isNewLayout = filename.includes('/src/new/') && 
                       !allowedPaths.some(pattern => {
                         const regex = new RegExp(pattern.replace(/\*/g, '.*'));
                         return regex.test(filename);
                       });

    if (!isNewLayout) {
      return {};
    }

    // 检查是否是共享 Hook 文件
    const isSharedHook = filename.includes('/hooks/') && 
                        sharedHookPatterns.some(pattern => filename.includes(pattern));

    // API 调用模式
    const apiCallPatterns = [
      /fetch\s*\(/,
      /axios\./,
      /\.get\(/,
      /\.post\(/,
      /\.put\(/,
      /\.delete\(/,
      /\.patch\(/
    ];

    // 服务端数据状态模式
    const serverDataStatePatterns = [
      /loading/i,
      /fetching/i,
      /data/i,
      /error/i,
      /isLoading/i,
      /isFetching/i
    ];

    let hasUseEffect = false;
    let hasUseState = false;
    let hasApiCall = false;
    let hasTanStackQuery = false;
    let useStateNodes = [];
    let useEffectNodes = [];

    return {
      // 检测 useEffect
      CallExpression(node) {
        if (node.callee.name === 'useEffect') {
          hasUseEffect = true;
          useEffectNodes.push(node);

          // 检查 useEffect 内部是否有 API 调用
          const effectBody = node.arguments[0];
          if (effectBody && effectBody.type === 'ArrowFunctionExpression') {
            const bodyText = context.getSourceCode().getText(effectBody.body);
            
            if (apiCallPatterns.some(pattern => pattern.test(bodyText))) {
              hasApiCall = true;
              context.report({
                node,
                messageId: 'noFetchInUseEffect',
                data: {}
              });
            }
          }
        }

        // 检测 useState
        if (node.callee.name === 'useState') {
          hasUseState = true;
          useStateNodes.push(node);
        }

        // 检测 TanStack Query
        if (node.callee.name === 'useQuery' || 
            node.callee.name === 'useMutation' ||
            node.callee.name === 'useInfiniteQuery') {
          hasTanStackQuery = true;
        }

        // 检测共享 Hook
        if (sharedHookPatterns.some(pattern => node.callee.name === pattern)) {
          hasTanStackQuery = true;
        }
      },

      // 在文件结束时检查
      'Program:exit'(node) {
        // 如果是共享 Hook 文件，允许直接使用 useQuery
        if (isSharedHook) {
          return;
        }

        // 检查是否使用 useState 管理服务端数据
        if (hasUseState && hasApiCall && !hasTanStackQuery) {
          useStateNodes.forEach(stateNode => {
            // 检查 useState 的变量名是否像服务端数据
            const parent = stateNode.parent;
            if (parent && parent.type === 'VariableDeclarator' && parent.id.type === 'ArrayPattern') {
              const stateVarName = parent.id.elements[0]?.name || '';
              
              if (serverDataStatePatterns.some(pattern => pattern.test(stateVarName))) {
                context.report({
                  node: stateNode,
                  messageId: 'noUseStateForServerData',
                  data: {}
                });
              }
            }
          });
        }

        // 检查是否在组件中直接使用 useQuery（应该使用共享 Hook）
        if (hasTanStackQuery && !isSharedHook) {
          const sourceCode = context.getSourceCode();
          const text = sourceCode.getText(node);
          
          // 检查是否直接使用 useQuery
          if (/useQuery\s*\(/.test(text)) {
            // 查找 useQuery 调用
            const tokens = sourceCode.getTokens(node);
            tokens.forEach((token, index) => {
              if (token.value === 'useQuery' && tokens[index + 1]?.value === '(') {
                // 检查是否是常用的 queryKey
                const nextTokens = tokens.slice(index, index + 20);
                const hasCommonQueryKey = [
                  'duckdb-tables',
                  'datasources',
                  'database-connections',
                  'table-columns',
                  'schemas',
                  'schema-tables'
                ].some(key => nextTokens.some(t => t.value.includes(key)));

                if (hasCommonQueryKey) {
                  context.report({
                    loc: token.loc,
                    messageId: 'useSharedHook',
                    data: {}
                  });
                }
              }
            });
          }
        }
      }
    };
  }
};
