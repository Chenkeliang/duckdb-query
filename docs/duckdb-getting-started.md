# DuckQuery × DuckDB 快速上手指南

> 新功能发布后请优先查阅 [Changelog](./CHANGELOG.md) 了解最新变更与注意事项。

> 面向首次使用 DuckQuery 的 DuckDB 用户，帮助你在 5 分钟内完成部署、导入数据并执行第一条查询。

## 1. 环境准备

| 依赖项 | 推荐版本 | 说明 |
| --- | --- | --- |
| Docker / Docker Desktop | 20.10+ | 一次启动后端（FastAPI + DuckDB）与前端应用 |
| Docker Compose | 2.0+ | 管理多容器编排 |
| Git | 任意最新版 | 克隆仓库 |
| 可选：Python 3.11+ / Node.js 18+ | 用于本地开发或二次定制 |

> 如果你计划直接在本机编译运行（非 Docker），请提前安装 Python 3.11 与 Node.js 18，并按 `api/requirements.txt`、`frontend/README` 安装依赖。

## 2. 克隆与一键启动

```bash
git clone https://github.com/Chenkeliang/duckdb-query.git
cd duckdb-query
./quick-start.sh
```

脚本会自动完成：

1. 检查 Docker 环境；
2. 创建配置文件与 DuckDB 存储目录；
3. 启动 `duckquery-backend`（FastAPI + DuckDB）与 `duckquery-frontend`（React）容器；
4. 提示访问地址：
   - 前端界面：http://localhost:3000
   - API 文档：http://localhost:8000/docs

若使用 Docker Compose 手动启动：

```bash
docker-compose up -d --build
```

## 3. 第一次导入数据

1. 打开前端界面 →【数据源】页面；
2. 选择【本地文件上传】，拖入 Excel/CSV/Parquet/JSON 文件；
3. DuckQuery 会自动：
   - 检测表头、数据类型；
   - 建立 DuckDB 表（默认命名为 `upload_<timestamp>`）；
   - 生成列统计信息（示例值、Null 数量、Distinct 数量等）；
4. 上传完成后，可在【统一查询】或【数据表管理】中看到该表。

> DuckDB 本地数据库文件位于 `data/duckdb/duckquery.duckdb`，可用 DuckDB CLI 或其他支持 DuckDB 的工具直接打开。

## 4. 运行第一条 DuckDB SQL

1. 进入【统一查询】 → 选择 “SQL 编辑器 · 内部数据”；
2. 在编辑器中编写 DuckDB SQL：

```sql
SELECT
  customer_city,
  SUM(order_amount) AS total_amount,
  COUNT(*) AS order_count
FROM upload_orders
GROUP BY customer_city
ORDER BY total_amount DESC
LIMIT 10;
```

3. 点击“执行查询”，结果会在下方表格展示；
4. 可选：点击“保存为 DuckDB 表”，将结果物化为 `duckdb` 文件中的新表。

## 5. 图形化查询面板

对于非技术用户或需要快速搭建报表的场景，可切换到“图形化查询”模式：

1. 选择数据源 → 勾选需要的字段；
2. 使用聚合面板选择 SUM/COUNT/AVG 等 DuckDB 聚合函数；
3. 通过筛选、排序、透视、类型冲突提示迅速定义查询；
4. DuckQuery 会实时生成 SQL，支持复制或直接执行。

> 类型冲突提示会自动给出 `TRY_CAST` 建议，避免常见的 `Conversion Error`。

## 6. 跨库 / 多源关联

1. 在【数据源】页添加 MySQL 或 PostgreSQL 连接；
2. 选择远程数据库中的表/SQL 结果，加载到 DuckDB；
3. 在查询界面可与本地上传的文件表进行 JOIN，全部在 DuckDB 内执行。

```sql
SELECT
  o.order_id,
  o.order_date,
  crm.customer_level,
  inv.stock_qty
FROM upload_orders AS o
JOIN mysql_crm_customers AS crm
  ON o.customer_id = crm.id
LEFT JOIN postgres_inventory_view AS inv
  ON o.sku = inv.sku_code;
```

## 7. 导出与异步任务

- 查询结果可一键导出为 CSV/Parquet；
- 对于耗时较长的任务，选择“提交异步任务”，DuckQuery 会在后台执行并生成下载链接，不阻塞前端界面。

## 8. 常见问题

| 问题 | 解决方案 |
| --- | --- |
| 表头识别错误 | 上传后可在“表详情”中调整，或通过 Excel 导入弹窗选择表头行号 |
| DuckDB 内存不足 | 编辑 `config/app-config.json`，调整 `duckdb_memory_limit` |
| 端口占用 | 修改 `docker-compose.yml` 中的 `8000:8000` 与 `3000:3000` 映射 |
| 访问慢/首屏加载慢 | 关闭未使用的浏览器扩展，或在生产环境使用反向代理缓存静态资源 |

## 9. 下一步

- 阅读 [DuckDB 集成手册](./duckdb-integration-guide.md)，了解如何与外部工具、CI、BI 平台协同；
- 浏览 [DuckQuery 产品页](https://chenkeliang.github.io/duckdb-query/) 查看最新特性、截图与发布公告；
- 如果遇到问题或希望贡献功能，欢迎在 [Issues](https://github.com/Chenkeliang/duckdb-query/issues/new/choose) / [Discussions](https://github.com/Chenkeliang/duckdb-query/discussions) 留言。

祝使用愉快！DuckDB 与 DuckQuery 的组合能让你的数据分析流程更快、更安全、更轻量。
