'use strict';

/**
 * 自定义 ESLint 规则的前端作用域（与 AGENTS.md 一致：现行代码在 frontend/src/，不含 api / i18n / 测试）。
 */

const DEPRECATED_NEW = /\/src\/new\//;

const DEFAULT_EXCLUDE_PATTERNS = [
  '**/frontend/src/api/**',
  '**/frontend/src/i18n/**',
  '**/frontend/src/components/**', // 旧布局 / shadcn 基元（业务 UI 在 Query/、DataSource/ 等）
  '**/__tests__/**',
  '**/*.test.*',
  '**/*.spec.*',
];

function normalizePath(filename) {
  return filename.replace(/\\/g, '/');
}

function patternToRegExp(pattern) {
  let glob = pattern.replace(/\\/g, '/');
  if (glob.startsWith('**/')) {
    glob = glob.slice(3);
  }
  const escaped = glob
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '<<<GLOBSTAR>>>')
    .replace(/\*/g, '[^/]*')
    .replace(/<<<GLOBSTAR>>>/g, '.*');
  return new RegExp(escaped);
}

function matchesPattern(filename, pattern) {
  return patternToRegExp(pattern).test(filename);
}

function matchesAnyPattern(filename, patterns) {
  return patterns.some((pattern) => matchesPattern(filename, pattern));
}

/**
 * @param {string} filename
 * @param {string[]} [extraExcludePatterns]
 */
function isLintScopedFrontend(filename, extraExcludePatterns = []) {
  const path = normalizePath(filename);
  if (!path.includes('frontend/src/')) return false;
  if (DEPRECATED_NEW.test(path)) return false;
  const excludes = [...DEFAULT_EXCLUDE_PATTERNS, ...extraExcludePatterns];
  if (matchesAnyPattern(path, excludes)) return false;
  return true;
}

module.exports = {
  isLintScopedFrontend,
  DEFAULT_EXCLUDE_PATTERNS,
};
