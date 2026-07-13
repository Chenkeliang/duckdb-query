# DuckQuery 文档

**唯一权威**：[`AGENTS.md`](../AGENTS.md)（开发约束）+ 下表契约与流程。

## 目录结构

| 目录 | 内容 |
|------|------|
| `docs/`（顶层） | 权威参考：契约、调用图、行为与配置（被 `AGENTS.md` / 代码直接引用，**不要移动**） |
| [`guide/`](guide/) | 面向用户的使用手册 |
| [`specs/`](specs/) | 功能规格与前瞻提案 |
| [`history/`](history/) | 开发过程存档（当时的计划 / 设计 / 审计，不随代码更新） |
| [`launch/`](launch/) | 发布与分发材料 |
| [`assets/`](assets/) | README / OG 图 |

## 必读（开发）

| 文档 | 用途 |
|------|------|
| [`API_CONTRACT_FE_BE.md`](API_CONTRACT_FE_BE.md) | 端点、`data` 语义、`frontend/src/api/*`（改 API 先改此表） |
| [`ARCHITECTURE_CALL_MAP.md`](ARCHITECTURE_CALL_MAP.md) | 入湖 / 查询 / 元数据 / 异步 / 透视 调用图 |
| [`frontend/QUERY_EXECUTION_FLOW.md`](frontend/QUERY_EXECUTION_FLOW.md) | 同步、联邦、异步与结果展示 |
| [`API_RESPONSE_STANDARD.md`](API_RESPONSE_STANDARD.md) | 统一响应体（与 AGENTS §8 一致） |

## 行为与配置参考

| 文档 | 用途 |
|------|------|
| [`CONFIGURATION.md`](CONFIGURATION.md) · [`CONFIGURATION_ZH.md`](CONFIGURATION_ZH.md) | 运行与环境变量 |
| [`QUERY_BEHAVIOR_ZH.md`](QUERY_BEHAVIOR_ZH.md) | JOIN / 集合运算 / 工作台：预览 vs 执行、LIMIT、BY NAME |
| [`FILE_IMPORT_PRECISION_AND_UX.md`](FILE_IMPORT_PRECISION_AND_UX.md) | CSV / Excel 导入精度与 UI |

## 使用指南（面向用户）

| 文档 | 用途 |
|------|------|
| [`guide/桌面版使用手册.md`](guide/桌面版使用手册.md) | 桌面版新手手册（零编程基础） |

## 规格与提案

| 文档 | 用途 |
|------|------|
| [`specs/pivot-table/`](specs/pivot-table/) | 透视表功能规格（design / requirements / tasks） |
| [`specs/proposals/drilldown-and-mcp-writeback.md`](specs/proposals/drilldown-and-mcp-writeback.md) | 提案（未实现）：下钻 / MCP write-back / 固定报表等 |

## 历史存档与发布

| 资源 | 用途 |
|------|------|
| [`history/`](history/README.md) | 2026-05 至今的实施计划 / 设计 / 审计（时间线索引） |
| [`launch/LAUNCH_KIT.md`](launch/LAUNCH_KIT.md) | 冷启动分发材料（HN / Reddit / PH 文案） |
| [`lint-rules/README.md`](lint-rules/README.md) | → 根目录 `lint-rules/` |

### Docker 一键启动

```bash
./quick-start.sh
```

| 服务 | 地址 |
|------|------|
| 前端 | http://localhost:48000 |
| API 文档 | http://localhost:48001/docs |

数据目录为宿主机 `./data`（重建容器不会删除已导入表）。国内镜像与网络说明见根目录 README 的 [Docker 镜像与数据](../README.md#docker-镜像与数据)。
