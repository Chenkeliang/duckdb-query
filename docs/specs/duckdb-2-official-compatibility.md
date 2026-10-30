# DuckDB 2.0 官方兼容性核对与 DuckQuery 处理

> 核对日期：2026-10-30
>
> 当前源码版本：Python `2.0.0`，engine `v2.0.0`
>
> DuckDB 2.0.0 LTS 已于 2026-10-21 发布；DuckQuery v2.1.2 使用正式引擎；v2.1.1 固定原 alpha 引擎。

## 结论表

| 官方变化 | 兼容风险 | DuckQuery 2.0 处理 |
|---|---|---|
| 默认 storage 升为 `v2.0.0` | 1.5 对新文件只有 best-effort forward compatibility，不能作为降级保证 | 新库显式固定 `v2.0.0`；旧库不静默迁移；迁移前备份，降级恢复备份或导出/导入 |
| 新引擎读取旧 storage | 官方从 0.10 起承诺 backward compatibility | 启动允许直接读取旧 `main.db` / `system.db`，UI 显示实际 storage 并提示显式迁移 |
| Lambda `x -> ...` 默认禁用 | 原查询会 Binder Error；`->` 同时是 JSON 运算符，不能做文本替换 | 文档要求 `lambda x: ...`；真实测试同时验证旧 lambda 失败、新 lambda 与 JSON `->` 正常 |
| 新 PEG SQL parser | 错误文案、位置和边界行为可能变化 | 不依赖固定英文错误文本；后端输出 `details.sql_location`，前端按结构化位置标记 |
| 扩展按 version + platform 绑定 | 1.5 artifact 被 2.0 拒绝；平台名也可能变化 | URL/目录来自运行时 `version()` + `PRAGMA platform`；canonical artifact；autoinstall=false 精确 LOAD 验证 |
| ICU 从内核依赖调整为原生实现 | IANA 时区、calendar、地区 collation 需保持既有行为 | Python/离线包在 autoinstall=false 下验证 `icu`、时区与地区 collation |
| 新 C API / 自定义扩展仓库 | GA 中 C API v2 尚未稳定，扩展仓库机制仍在演进 | 当前不开放；后续按实际需求单独设计 |
| Python 结果与连接 API | 结果读取、并行连接、事务失败行为有变化 | 沿用 execute + fetch 路径与独占连接，回归查询、导出、取消和存储恢复；应用退出前停止所有任务监控线程 |
| `CONNECT`、Triggers、DML-in-CTE | 产生会话或写入副作用，连接池中可能跨请求残留 | 普通查询端点 fail-closed；不因 parser 已支持就自动开放 |

## 官方来源

- [Announcing DuckDB 2.0.0 LTS](https://duckdb.org/2026/10/21/announcing-duckdb-200)：正式版发布与主要能力。
- [Migrating to DuckDB 2.0](https://duckdb.org/docs/2.0/operations_manual/migration)：存储、SQL、ICU 与配置变更。
- [Migrating Python Code to DuckDB 2.0](https://duckdb.org/docs/2.0/clients/python/migration)：结果读取、并发与事务行为。
- [Storage Versions and Format](https://duckdb.org/docs/stable/internals/storage)：backward / forward compatibility 定义、storage version 与跨版本迁移方法。
- [Lambda Functions](https://duckdb.org/docs/current/sql/functions/lambda)：2.0 默认禁用 single-arrow lambda，2.1 完全移除开关。
- [Extension Distribution](https://duckdb.org/docs/current/extensions/extension_distribution)：扩展二进制绑定 DuckDB version 和 platform。
- [ICU Extension](https://duckdb.org/docs/current/core_extensions/icu)：时区与地区 collation 的扩展边界。

## v2.1.2 桌面发布的验收条件

以下任一条件未满足，不应将源码适配结果作为三平台桌面正式发布的验收结论：

1. 官方 2.0 GA Python wheel 已发布并替换 dev pin；
2. 后端、前端、MCP、Docker、三平台冻结包矩阵通过；
3. 旧库读取、v2 新库、显式迁移、备份恢复均通过；
4. 核心与离线扩展能按 GA version/platform 精确加载；
5. alpha 阶段 nanobind shutdown warning 已消失或有官方结论。
