# 历史存档（history/）

开发过程产物：**当时的**实施计划（`plans/`）、设计文档（`designs/`）与审计报告（`audits/`）。
按写作时间归档，**不随代码演进更新**——描述现状的权威文档见 [`docs/README.md`](../README.md) 索引；两者冲突时以权威文档与代码为准。

## 时间线

| 日期 | 主题 | 计划 | 设计 |
|------|------|------|------|
| 2026-05-30 | AI 能力地基（LLM 接入 / AI 设置 前后端） | [p0-backend](plans/2026-05-30-p0-llm-foundation-backend.md) · [p0b-settings-be](plans/2026-05-30-p0b-ai-settings-backend.md) · [p0c-settings-fe](plans/2026-05-30-p0c-ai-settings-frontend.md) | [ai-assistant](designs/2026-05-30-ai-assistant-design.md) |
| 2026-05-30 | SQL 报错医生（规则版 → LLM 版） | [deterministic](plans/2026-05-30-deterministic-sql-error-doctor.md) · [p1-llm](plans/2026-05-30-p1-llm-error-doctor.md) | — |
| 2026-05-30 | SQL 解释 + 自然语言问数（P2/P3） | [p2-p3](plans/2026-05-30-p2-p3-explain-nl2sql.md) | [p2-p3-design](designs/2026-05-30-p2-p3-explain-nl2sql-design.md) |
| 2026-05-31 | JOIN 时间界建议 | [plan](plans/2026-05-31-join-time-bound-recommendation.md) | [design](designs/2026-05-31-join-time-bound-recommendation-design.md) |
| 2026-06-01 | 查询结果图表 | [plan](plans/2026-06-01-query-result-charts.md) | [design](designs/2026-06-01-query-result-charts-design.md) |
| 2026-06-02 | Wasm 在线 Demo 范围 | — | [scope](designs/2026-06-02-wasm-demo-scope.md) |
| 2026-06-16 | 桌面版（后端就绪 / Tauri 壳与分发 / 打包） | [backend](plans/2026-06-16-desktop-backend-readiness.md) · [shell](plans/2026-06-16-desktop-shell-and-distribution.md) | [packaging](designs/2026-06-16-desktop-packaging-design.md) |
| 2026-06-18 | MCP Server | [plan](plans/2026-06-18-duckquery-mcp-server.md) | [design](designs/2026-06-18-duckquery-mcp-server-design.md) |
| 2026-06-18 | 联邦查询下推优化 | [plan](plans/2026-06-18-federated-pushdown.md) | [design](designs/2026-06-18-federated-pushdown-design.md) |

## 审计（audits/）

| 日期 | 报告 | 说明 |
|------|------|------|
| 2026-07-08 | [第一性原理全栈审查](audits/2026-07-08-first-principles-audit.md) | 后端 / 前端 / MCP 串行复核，24+ 条发现；其中 N1/N3/N4/N5/L18/N7 已于 2026-07-09 修复（`62d3add`） |
