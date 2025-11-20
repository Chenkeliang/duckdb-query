# Changelog

This document records every functional update. All new features **must** append an entry here via the changelog automation (or, temporarily, manual edits following the same format) before merging.

## 2025-11-18

- Initialize the changelog workflow. All future features must update this file and refresh the related guides (README, getting started, integration guide).

## 2025-11-19

- fix: PivotConfigurator now passes the actual column name as the select value so 行/列字段可正常写入配置，不再触发“未选择字段”或“列字段过多”的误报。

## 2025-11-20

- feat: Added DuckDB 表元数据缓存（默认 24 小时，可通过 `table_metadata_cache_ttl_hours` 配置），提供刷新 API 与“数据表管理 / DuckDB 管理”界面可触发的“刷新缓存”按钮，避免 visual-query 请求频繁扫全表造成的卡顿。
- fix: DuckDB 表元数据改为在选择数据源时按需加载并会话缓存，避免首页批量请求；选中后即可展示列信息，不再显示 0 列占位。
- chore: 前端代理目标支持通过环境变量 `VITE_API_PROXY_TARGET` 覆盖，便于本地开发自定义后端端口。
