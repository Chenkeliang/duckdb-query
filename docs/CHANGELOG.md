# Changelog

This document records every functional update. All new features **must** append an entry here via the changelog automation (or, temporarily, manual edits following the same format) before merging.

## 2025-11-18

- Initialize the changelog workflow. All future features must update this file and refresh the related guides (README, getting started, integration guide).

## 2025-11-19

- fix: PivotConfigurator now passes the actual column name as the select value so 行/列字段可正常写入配置，不再触发“未选择字段”或“列字段过多”的误报。
