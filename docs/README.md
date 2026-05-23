# DuckQuery 文档

实现与改 API 前以 **[`AGENTS.md`](../AGENTS.md)** 与下表为准；细节规范见 [`.kiro/steering/`](../.kiro/steering/)。

## 必读

| 文档 | 用途 |
|------|------|
| [`API_CONTRACT_FE_BE.md`](API_CONTRACT_FE_BE.md) | 端点、`data` 语义、`frontend/src/api/*` 入口（改 API 先改此表） |
| [`ARCHITECTURE_CALL_MAP.md`](ARCHITECTURE_CALL_MAP.md) | 入湖 / 查询 / 元数据 / 异步 / 透视 分域调用图 |
| [`frontend/QUERY_EXECUTION_FLOW.md`](frontend/QUERY_EXECUTION_FLOW.md) | 同步、联邦、异步查询与结果展示 |
| [`API_RESPONSE_STANDARD.md`](API_RESPONSE_STANDARD.md) | 统一响应体速查（细则见 `.kiro/steering/api-response-format-standard.md`） |

## 配置与专题

| 文档 | 用途 |
|------|------|
| [`CONFIGURATION.md`](CONFIGURATION.md) · [`CONFIGURATION_ZH.md`](CONFIGURATION_ZH.md) | 运行与环境变量 |
| [`FILE_IMPORT_PRECISION_AND_UX.md`](FILE_IMPORT_PRECISION_AND_UX.md) | 文件导入精度与交互 |

## 其它

| 资源 | 用途 |
|------|------|
| [`lint-rules/README.md`](lint-rules/README.md) | 指向仓库根目录 `lint-rules/` |
| [`.kiro/specs/pivot-table/`](../.kiro/specs/pivot-table/) | 透视表功能规格 |
| [`assets/`](assets/) | README 用图与 OG 图 |

## 开发规范（非 docs/）

TanStack Query、DataGrid、API 模块命名等见 `.kiro/steering/`（如 `tanstack-query-standards.md`、`tanstack-datagrid-standards.md`、`api-unification-rules.md`）。
