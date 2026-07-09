import reactPlugin from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";
import globals from "globals";
// 项目自定义规则（lint-rules/eslint，CommonJS）。用相对路径导入：
// 本地无需 npm link，CI 的 link 方式也兼容。只启用 rules/index.js 注册的规则；
// 插件 configs.recommended 引用了未注册的规则名（no-console 等），不可直接展开。
import duckquery from "../lint-rules/eslint/index.js";

export default [
  {
    ignores: ["dist/**", "node_modules/**", "**/dist/**", "src-tauri/**"],
  },
  {
    linterOptions: {
      reportUnusedDisableDirectives: false
    }
  },
  ...tseslint.config({
    files: ["src/**/*.{ts,tsx}"],
    extends: [tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      parserOptions: {
        ecmaFeatures: {
          jsx: true
        }
      },
      globals: {
        ...globals.browser,
        ...globals.es2021,
        ...globals.jest,
        process: "readonly"
      }
    },
    plugins: {
      react: reactPlugin,
      "react-hooks": reactHooks,
      duckquery
    },
    settings: {
      react: {
        version: "detect"
      }
    },
    rules: {
      ...reactPlugin.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      "react/prop-types": "off",
      "react/react-in-jsx-scope": "off",
      "react/no-unknown-property": "off",
      // Same convention as the legacy .jsx block above: leading underscore marks an
      // intentionally-unused binding (catch params, unused destructured args, etc).
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" }
      ],
      // Noise for this codebase (存量原因关闭，非逐条 violation 豁免):
      // - no-explicit-any: codebase has 300+ untyped API/legacy boundaries; enabling would
      //   require a large typing pass unrelated to this change.
      "@typescript-eslint/no-explicit-any": "off",
      // - react/display-name: mirrors the legacy .jsx block's existing policy; fires on
      //   inline anonymous cell renderers and test mocks with no real bug behind it.
      "react/display-name": "off",
      // - react-hooks v7's "recommended" bundles several React Compiler readiness rules
      //   (exhaustive-deps, set-state-in-effect, refs, static-components, immutability,
      //   use-memo, incompatible-library, preserve-manual-memoization). This project does
      //   not use the React Compiler and the legacy .jsx block already disables the
      //   overlapping ones for the same reason; suggested fixes for these can change effect
      //   timing/behavior, so blanket-applying them here would be a behavior risk, not a
      //   lint fix.
      "react-hooks/exhaustive-deps": "off",
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/refs": "off",
      "react-hooks/static-components": "off",
      "react-hooks/immutability": "off",
      "react-hooks/use-memo": "off",
      "react-hooks/incompatible-library": "off",
      "react-hooks/preserve-manual-memoization": "off",
      // ---- duckquery 自定义规则（AGENTS.md §4/§5 的自动化兜底，2026-07-09 接线）----
      // 存量为零/已清零的规则，直接强制：
      "duckquery/no-mui-in-new-layout": "error",
      "duckquery/no-fetch-in-useeffect": "error",
      "duckquery/require-tanstack-query": "error",
      // 存量过大暂关（接线时实测计数，烧完一类开一类；与上方 no-explicit-any 同为
      // 存量原因关闭，非逐条 violation 豁免）：
      // - no-hardcoded-colors: 75 处存量
      // - no-arbitrary-tailwind: 223 处存量
      // - enforce-import-order: 641 处存量（--fix 可修 400+，但会重排含 CSS 副作用的
      //   import 顺序，须专项批次处理，不随接线盲扫）
      // - require-i18n: 648 处存量
      "duckquery/no-hardcoded-colors": "off",
      "duckquery/no-arbitrary-tailwind": "off",
      "duckquery/enforce-import-order": "off",
      "duckquery/require-i18n": "off"
    }
  }),
  {
    // @ts-ignore here predates a strict type-check pass; swapping to @ts-expect-error
    // currently fails `tsc --noEmit` because the underlying import already resolves
    // without error, so `@ts-expect-error` would be flagged as unused.
    // (Moved from UploadPanel.tsx when the Tauri desktop-import logic was extracted
    // into its own hook — the imports carrying these comments moved with it.)
    files: ["src/DataSource/upload/useDesktopImport.ts"],
    rules: {
      "@typescript-eslint/ban-ts-comment": "off"
    }
  }
];
