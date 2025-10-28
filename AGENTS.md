# Repository Guidelines

## Project Structure & Module Organization
Duck Query pairs FastAPI backend in `api/` with React frontend in `frontend/`. Backend modules live under `api/core`, `api/routers`, and `api/models`; configs and secrets are kept in `config/`, while ingestion buffers and exports go to `temp_files/` and `exports/`. Python tests live in `api/tests`, the SPA in `frontend/src`, docs in `docs/`, and Docker assets rely on the root `docker-compose.yml`.

## Build, Test, and Development Commands
- `python -m uvicorn main:app --reload` (run inside `api/`): start FastAPI service with live reload.
- `python -m pytest api/tests -q`: execute unit and integration suites.
- `npm install && npm run dev` (inside `frontend/`): install dependencies and launch the SPA locally.
- `npm run build`: emit the production bundle to `frontend/dist`.
- `npm run lint`: enforce the zero-warning ESLint policy.
- `docker-compose up -d` or `./quick-start.sh`: boot the full stack with DuckDB volumes configured.

## Coding Style & Naming Conventions
Follow PEP 8 in Python: four-space indents, snake_case modules, descriptive docstrings, and type hints on new public APIs. Align router names and response models with existing patterns such as `visual-query` and `data_sources`. Frontend code keeps ES modules, PascalCase React components, camelCase hooks/utilities, and Tailwind utility classes; run `npm run lint -- --fix` before review to auto-resolve stylistic issues.

## Testing Guidelines
Backend tests rely on Pytest and FastAPI’s `TestClient`; add coverage under `api/tests` with `test_*.py` files and reuse fixtures from suites like `test_visual_query_api.py`. Cover success and failure paths for DuckDB ingestion, async pipelines, and validation helpers, then rerun `python -m pytest api/tests`. Frontend automation is not yet in place, so accompany UI changes with lint checks, manual verification, and screenshots, and keep shared fixtures in `api/tests/config` or `api/tests/exports`.

## Commit & Pull Request Guidelines
History mixes Conventional Commit prefixes (`feat:`, `fix:`) with concise Chinese summaries; continue using a lowercase prefix plus a present-tense description (for example, `feat: add parquet preview caching`). Exclude generated assets, keep commits logically scoped, and document problem, solution, and verification (`pytest`, `npm run lint`, manual checks) in each PR alongside linked issues. Attach UI captures when frontend layouts shift and flag new config keys or volume changes so reviewers can sync environments.

## Security & Configuration Tips
Secrets and connection details live in `config/` (for example `datasources.json`, `secret.key`); commit only sanitized `.example` variants. Clear sensitive artifacts from `temp_files/` before pushing. Document new DuckDB exports and confirm matching volume mounts inside `docker-compose.yml`.

## CSS & UI Guidelines
- 全局视觉 token 定义在 `frontend/src/styles/modern.css`，浅色/暗色模式均需使用已有的 `--dq-*` 变量（如 `--dq-surface-card`, `--dq-border-card`, `--dq-radius-card`, `--dq-accent-primary`）。
- 前端新 UI 组件优先复用 `frontend/src/components/common/` 中的封装（`CardSurface`, `RoundedButton`, `RoundedTextField`, `SectionHeader`），避免散落的 `sx` 内联颜色或圆角。
- 涉及弹窗、卡片的局部主题调整，通过子级 `ThemeProvider` 覆写 MUI 组件，作用范围限制在具体模块，确保 Query Builder 等现有页面不受影响。
- 调整样式时同时验证浅色与 `.dark` 模式，避免对比度不足或阴影突兀；必要时扩展 `modern.css` 变量再引用。
- 数据源页面若使用 `SectionHeader` 的蓝色圆点指示，但紧邻已有 SVG/icon，则移除该蓝点，避免重复视觉元素。
- 字体层级约定：主模块标题 20px/semi-bold、一级 Tab 18px/semi-bold、二级 Tab 16px/medium、内容标题 16px/600 或 18px/600（视层级）、正文 14px、辅助 13px；新增/更新文案须遵循。
