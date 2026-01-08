/**
 * DuckQuery 项目 ESLint 配置
 * 
 * 包含自定义规则和推荐配置
 */

module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2021,
    sourceType: 'module',
    ecmaFeatures: {
      jsx: true,
    },
  },
  env: {
    browser: true,
    es2021: true,
    node: true,
  },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react/recommended',
    'plugin:react-hooks/recommended',
    'plugin:duckquery/recommended', // 使用 DuckQuery 推荐配置
  ],
  plugins: [
    '@typescript-eslint',
    'react',
    'react-hooks',
    'duckquery', // DuckQuery 自定义规则插件
  ],
  settings: {
    react: {
      version: 'detect',
    },
  },
  rules: {
    // DuckQuery 自定义规则（已在 plugin:duckquery/recommended 中配置）
    // 可以在这里覆盖严重程度
    
    // 'duckquery/no-mui-in-new-layout': 'error',
    // 'duckquery/no-fetch-in-useeffect': 'error',
    // 'duckquery/require-tanstack-query': 'error',
    // 'duckquery/no-hardcoded-colors': 'warn',
    // 'duckquery/no-arbitrary-tailwind': 'error',
    // 'duckquery/enforce-import-order': 'warn',
    // 'duckquery/require-i18n': 'warn',

    // TypeScript 规则
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/explicit-module-boundary-types': 'off',
    '@typescript-eslint/no-unused-vars': ['warn', {
      argsIgnorePattern: '^_',
      varsIgnorePattern: '^_',
    }],

    // React 规则
    'react/react-in-jsx-scope': 'off', // React 17+ 不需要
    'react/prop-types': 'off', // 使用 TypeScript
    'react-hooks/rules-of-hooks': 'error',
    'react-hooks/exhaustive-deps': 'warn',

    // 通用规则
    'no-console': ['warn', { allow: ['warn', 'error'] }],
    'no-debugger': 'warn',
  },
  overrides: [
    {
      // 测试文件可以放宽一些规则
      files: ['**/__tests__/**/*', '**/*.test.ts', '**/*.test.tsx'],
      rules: {
        '@typescript-eslint/no-explicit-any': 'off',
        'duckquery/require-i18n': 'off',
      },
    },
    {
      // 旧布局文件不应用新布局规则
      files: ['src/components/**/*', 'src/App.tsx'],
      rules: {
        'duckquery/no-mui-in-new-layout': 'off',
        'duckquery/no-fetch-in-useeffect': 'off',
        'duckquery/require-tanstack-query': 'off',
      },
    },
  ],
};
