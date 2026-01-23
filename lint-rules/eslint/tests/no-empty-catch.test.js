/**
 * @fileoverview Tests for no-empty-catch rule
 */

const { RuleTester } = require('eslint');
const rule = require('../rules/no-empty-catch');

const ruleTester = new RuleTester({
  parserOptions: {
    ecmaVersion: 2020,
    sourceType: 'module',
  },
});

ruleTester.run('no-empty-catch', rule, {
  valid: [
    // catch 块有错误处理
    {
      code: `
        try {
          doSomething();
        } catch (error) {
          logger.error('Failed', { error });
        }
      `,
    },
    // catch 块有 toast 提示
    {
      code: `
        try {
          doSomething();
        } catch (error) {
          toast.error('操作失败');
        }
      `,
    },
    // catch 块重新抛出错误
    {
      code: `
        try {
          doSomething();
        } catch (error) {
          throw error;
        }
      `,
    },
    // catch 块有多条语句
    {
      code: `
        try {
          doSomething();
        } catch (error) {
          logger.error('Failed', { error });
          toast.error('操作失败');
        }
      `,
    },
    // 允许带注释的空 catch 块（配置允许）
    {
      code: `
        try {
          doSomething();
        } catch (error) {
          // 忽略错误
        }
      `,
      options: [{ allowEmptyWithComment: true }],
    },
  ],

  invalid: [
    // 空的 catch 块
    {
      code: `
        try {
          doSomething();
        } catch (error) {
        }
      `,
      errors: [
        {
          messageId: 'emptyCatch',
        },
      ],
    },
    // 空的 catch 块（单行）
    {
      code: `
        try {
          doSomething();
        } catch (error) {}
      `,
      errors: [
        {
          messageId: 'emptyCatch',
        },
      ],
    },
    // 带注释但为空的 catch 块（默认不允许）
    {
      code: `
        try {
          doSomething();
        } catch (error) {
          // 忽略错误
        }
      `,
      errors: [
        {
          messageId: 'emptyCatchWithComment',
        },
      ],
    },
    // 多个空的 catch 块
    {
      code: `
        try {
          doSomething();
        } catch (error) {
        }
        
        try {
          doAnotherThing();
        } catch (error) {
        }
      `,
      errors: [
        {
          messageId: 'emptyCatch',
        },
        {
          messageId: 'emptyCatch',
        },
      ],
    },
    // 嵌套的空 catch 块
    {
      code: `
        try {
          try {
            doSomething();
          } catch (innerError) {
          }
        } catch (outerError) {
          logger.error('Outer error', { outerError });
        }
      `,
      errors: [
        {
          messageId: 'emptyCatch',
        },
      ],
    },
  ],
});

console.log('✅ no-empty-catch tests passed');
