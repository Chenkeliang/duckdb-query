/**
 * DuckQuery ESLint 插件
 * 
 * 提供项目特定的代码规范检查规则
 */

const rules = require('./rules');

module.exports = {
  rules,
  configs: {
    recommended: {
      plugins: ['duckquery'],
      rules: {
        'duckquery/no-mui-in-new-layout': 'error',
        'duckquery/no-fetch-in-useeffect': 'error',
        'duckquery/require-tanstack-query': 'error',
        'duckquery/no-hardcoded-colors': 'warn',
        'duckquery/no-arbitrary-tailwind': 'error',
        'duckquery/enforce-import-order': 'warn',
        'duckquery/require-i18n': 'warn',
        'duckquery/no-console': 'error',
        'duckquery/no-empty-catch': 'error',
        'duckquery/require-error-logging': 'warn',
      },
    },
    strict: {
      plugins: ['duckquery'],
      rules: {
        'duckquery/no-mui-in-new-layout': 'error',
        'duckquery/no-fetch-in-useeffect': 'error',
        'duckquery/require-tanstack-query': 'error',
        'duckquery/no-hardcoded-colors': 'error',
        'duckquery/no-arbitrary-tailwind': 'error',
        'duckquery/enforce-import-order': 'error',
        'duckquery/require-i18n': 'error',
        'duckquery/no-console': 'error',
        'duckquery/no-empty-catch': 'error',
        'duckquery/require-error-logging': 'error',
      },
    },
  },
};
