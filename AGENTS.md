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
- DuckDB integration helpers should accept an optional connection argument and internally call `_use_connection()` / `with_duckdb_connection()`; do not keep a module-level singleton connection alive across requests.
- Normalize timestamps to UTC (naive) before writing them back to DuckDB—`TaskManager._normalize_datetime` is the canonical reference—to avoid mixing tz-aware and naive datetimes.

Follow PEP 8 in Python: four-space indents, snake_case modules, descriptive docstrings, and type hints on new public APIs. Align router names and response models with existing patterns such as `visual-query` and `data_sources`. Frontend code keeps ES modules, PascalCase React components, camelCase hooks/utilities, and Tailwind utility classes; run `npm run lint -- --fix` before review to auto-resolve stylistic issues.

## Testing Guidelines
Backend tests rely on Pytest and FastAPI’s `TestClient`; add coverage under `api/tests` with `test_*.py` files and reuse fixtures from suites like `test_visual_query_api.py`. Cover success and failure paths for DuckDB ingestion, async pipelines, and validation helpers, then rerun `python -m pytest api/tests`. Frontend automation is not yet in place, so accompany UI changes with lint checks, manual verification, and screenshots, and keep shared fixtures in `api/tests/config` or `api/tests/exports`.

## Commit & Pull Request Guidelines
History mixes Conventional Commit prefixes (`feat:`, `fix:`) with concise Chinese summaries; continue using a lowercase prefix plus a present-tense description (for example, `feat: add parquet preview caching`). Exclude generated assets, keep commits logically scoped, and document problem, solution, and verification (`pytest`, `npm run lint`, manual checks) in each PR alongside linked issues. Attach UI captures when frontend layouts shift and flag new config keys or volume changes so reviewers can sync environments.

- Every PR that changes behavior must append an entry to `docs/CHANGELOG.md`; only refresh the other docs when that change affects their scope:
  - `README.md` highlights top-level features, positioning, and install commands—touch it when product messaging or capability headlines change.
  - `docs/duckdb-getting-started.md` is the onboarding walkthrough—update it when the quick-start flow, setup steps, or first-use UX shifts.
  - `docs/duckdb-integration-guide.md` covers hand-offs to BI/automation tooling—update it when integration APIs, exports, or cross-tool workflows change.
  - Pure bugfixes and internal refactors normally only need the changelog entry.

## Security & Configuration Tips
Secrets and connection details live in `config/` (for example `datasources.json`, `secret.key`); commit only sanitized `.example` variants. Clear sensitive artifacts from `temp_files/` before pushing. Document new DuckDB exports and confirm matching volume mounts inside `docker-compose.yml`.

## CSS & UI Guidelines
- Define global visual tokens in `frontend/src/styles/modern.css` and always rely on existing `--dq-*` variables (e.g. `--dq-surface-card`, `--dq-border-card`, `--dq-radius-card`, `--dq-accent-primary`) for both light and `.dark` themes.
- Reuse the shared components in `frontend/src/components/common/` (`CardSurface`, `RoundedButton`, `RoundedTextField`, `SectionHeader`) when building new UI to avoid ad-hoc `sx` colors or border-radii.
- For dialogs/cards that need local theming, wrap only the affected subtree with a dedicated `ThemeProvider` so the Query Builder and other screens stay untouched.
- Validate every styling update in both light and `.dark` modes to prevent low contrast or odd shadows; extend `modern.css` tokens first before hard-coding colors.
- On the data source views, remove the blue `SectionHeader` dot when an adjacent SVG/icon already conveys the state, preventing duplicate visual markers.
- Typographic scale: primary module headings 20px / semi-bold, primary tabs 18px / semi-bold, secondary tabs 16px / medium, content headings 16px or 18px / 600, body text 14px, supporting text 13px. New or updated copy should follow these levels.
- Custom dialogs must use the shared `.dq-dialog` styles (defined in `frontend/src/styles/modern.css`) or follow the Excel sheet selector example. Avoid native `alert`/`confirm`/`prompt`; ensure padding, radius, and shadows stay consistent in both light and dark themes.
- If any requirement or context remains unclear, ask clarifying questions instead of guessing.

## Agent Constraints
- Do not modify repository code unless the user explicitly instructs you to do so; when the user only asks for analysis, respond with analysis and leave the code untouched.
- Avoid introducing `!important` in new CSS. If a legacy rule forces it, prefer refactoring the base styles instead of relying on `!important`.
- CSS must reuse existing design tokens (`--dq-*`) whenever they fit the need. If no suitable token exists, create a reusable token (and register it in the theme/docs) before using it; never hard-code one-off values.
- When implementing UI, prefer the official shared component first. Only fall back to a custom build if no existing component fits, then check for design tokens before adding new styles.
- Never trigger native `alert`/`confirm`/`prompt` dialogs in the product UI; use the shared dialog component and existing design tokens for any modal or confirmation flow.
