import js from "@eslint/js";
import reactPlugin from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";

export default [
  {
    ignores: ["dist/**", "node_modules/**", "**/dist/**"],
    linterOptions: {
      reportUnusedDisableDirectives: false
    }
  },
  {
    files: [
      "src/ShadcnApp.jsx",
      "src/DuckQueryApp.jsx",
      "src/hooks/**/*.{js,jsx}",
      "src/components/Layout/**/*.{js,jsx}"
    ],
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
      "react-hooks": reactHooks
    },
    settings: {
      react: {
        version: "detect"
      }
    },
    rules: {
      ...js.configs.recommended.rules,
      ...reactPlugin.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      "no-useless-catch": "off",
      "react/prop-types": "off",
      "no-unused-vars": "off",
      "no-constant-binary-expression": "off",
      "no-useless-escape": "off",
      "react-hooks/exhaustive-deps": "off",
      "no-empty": "off",
      "react/no-unescaped-entities": "off",
      "react/display-name": "off",
      "react-hooks/use-memo": "off",
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/refs": "off",
      "react-hooks/static-components": "off",
      "react-hooks/immutability": "off",
      "react/no-unknown-property": "off",
      "no-undef": "off"
    }
  }
];
