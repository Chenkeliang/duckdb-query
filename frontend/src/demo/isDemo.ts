/**
 * Demo(浏览器内 DuckDB-Wasm 试用)模式开关。
 *
 * 仅 gh-pages 构建设 `VITE_DEMO=true`;正常/自托管构建此值为 undefined →
 * IS_DEMO 在编译期折叠为 false,所有 `if (IS_DEMO)` 分支(含 wasm 动态 import)
 * 被 Rollup 整段剥离,正常包不含任何 demo/wasm 代码。
 */
export const IS_DEMO = import.meta.env.VITE_DEMO === 'true';
