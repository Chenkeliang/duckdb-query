/**
 * @fileoverview Tests for require-error-logging rule
 */

const { RuleTester } = require('eslint');
const rule = require('../rules/require-error-logging');

const ruleTester = new RuleTester({
  parserOptions: {
    ecmaVersion: 2020,
    sourceType: 'module',
  },
});

ruleTester.run('require-error-logging', rule, {
  valid: [
    // 有 logger.error
    {
      code: `
        try {
          doSomething();
        } catch (error) {
          logger.error('Failed', { error });
        }
      `,
    },
    // 有 logger.error 和 toast
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
    // 有 logger.error 和 throw
    {
      code: `
        try {
          doSomething();
        } catch (error) {
          logger.error('Failed', { error });
          throw error;
        }
      `,
    },
    // 只有 throw（配置允许）
    {
      code: `
        try {
          doSomething();
        } catch (error) {
          throw error;
        }
      `,
      options: [{ allowRethrow: true }],
    },
    // 只有 throw new Error（配置允许）
    {
      code: `
        try {
          doSomething();
        } catch (error) {
          throw new Error('Failed');
        }
      `,
      options: [{ allowRethrow: true }],
    },
  ],

  invalid: [
    // 没有错误记录
    {
      code: `
        try {
          doSomething();
        } catch (error) {
          toast.error('操作失败');
        }
      `,
      errors: [
        {
          messageId: 'missingErrorLog',
        },
      ],
    },
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
          messageId: 'missingErrorLog',
        },
      ],
    },
    // 只有 console.error
    {
      code: `
        try {
          doSomething();
        } catch (error) {
          console.error(error);
        }
      `,
      errors: [
        {
          messageId: 'onlyConsoleError',
        },
      ],
    },
    // 只有 console.error 和 toast
    {
      code: `
        try {
          doSomething();
        } catch (error) {
          console.error(error);
          toast.error('操作失败');
        }
      `,
      errors: [
        {
          messageId: 'onlyConsoleError',
        },
      ],
    },
    // 只有 throw（默认不允许）
    {
      code: `
        try {
          doSomething();
        } catch (error) {
          throw error;
        }
      `,
      errors: [
        {
          messageId: 'missingErrorLog',
        },
      ],
    },
    // 多个 catch 块都没有记录
    {
      code: `
        try {
          doSomething();
        } catch (error) {
          toast.error('失败');
        }
        
        try {
          doAnotherThing();
        } catch (error) {
          console.error(error);
        }
      `,
      errors: [
        {
          messageId: 'missingErrorLog',
        },
        {
          messageId: 'onlyConsoleError',
        },
      ],
    },
    // 嵌套的 catch 块
    {
      code: `
        try {
          try {
            doSomething();
          } catch (innerError) {
            toast.error('内部错误');
          }
        } catch (outerError) {
          logger.error('外部错误', { outerError });
        }
      `,
      errors: [
        {
          messageId: 'missingErrorLog',
        },
      ],
    },
  ],
});

console.log('✅ require-error-logging tests passed');
