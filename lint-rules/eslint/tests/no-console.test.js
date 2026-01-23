/**
 * @fileoverview Tests for no-console rule
 */

const { RuleTester } = require('eslint');
const rule = require('../rules/no-console');

const ruleTester = new RuleTester({
  parserOptions: {
    ecmaVersion: 2020,
    sourceType: 'module',
  },
});

ruleTester.run('no-console', rule, {
  valid: [
    // 使用 logger
    {
      code: "import { logger } from '@/utils/logger'; logger.debug('test');",
    },
    {
      code: "logger.error('error message', { context });",
    },
    {
      code: "logger.warn('warning');",
    },
    {
      code: "logger.info('info');",
    },
    // 允许特定方法
    {
      code: "console.log('test');",
      options: [{ allow: ['log'] }],
    },
    {
      code: "console.error('error');",
      options: [{ allow: ['error'] }],
    },
    // 非 console 对象
    {
      code: "myConsole.log('test');",
    },
  ],

  invalid: [
    // console.log
    {
      code: "console.log('test');",
      errors: [
        {
          messageId: 'noConsole',
          data: { method: 'log', suggestedMethod: 'debug' },
        },
      ],
    },
    // console.error
    {
      code: "console.error('error');",
      errors: [
        {
          messageId: 'noConsole',
          data: { method: 'error', suggestedMethod: 'error' },
        },
      ],
    },
    // console.warn
    {
      code: "console.warn('warning');",
      errors: [
        {
          messageId: 'noConsole',
          data: { method: 'warn', suggestedMethod: 'warn' },
        },
      ],
    },
    // console.debug
    {
      code: "console.debug('debug');",
      errors: [
        {
          messageId: 'noConsole',
          data: { method: 'debug', suggestedMethod: 'debug' },
        },
      ],
    },
    // console.info
    {
      code: "console.info('info');",
      errors: [
        {
          messageId: 'noConsole',
          data: { method: 'info', suggestedMethod: 'info' },
        },
      ],
    },
    // console.trace
    {
      code: "console.trace('trace');",
      errors: [
        {
          messageId: 'noConsole',
          data: { method: 'trace', suggestedMethod: 'debug' },
        },
      ],
    },
    // console.table
    {
      code: "console.table(data);",
      errors: [
        {
          messageId: 'noConsole',
          data: { method: 'table', suggestedMethod: 'debug' },
        },
      ],
    },
    // 多个 console 调用
    {
      code: `
        console.log('log');
        console.error('error');
      `,
      errors: [
        {
          messageId: 'noConsole',
          data: { method: 'log', suggestedMethod: 'debug' },
        },
        {
          messageId: 'noConsole',
          data: { method: 'error', suggestedMethod: 'error' },
        },
      ],
    },
    // try-catch 中的 console.error
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
          messageId: 'noConsole',
          data: { method: 'error', suggestedMethod: 'error' },
        },
      ],
    },
  ],
});

console.log('✅ no-console tests passed');
