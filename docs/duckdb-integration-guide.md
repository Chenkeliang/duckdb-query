# DuckQuery × DuckDB 集成手册

本指南汇总了 DuckQuery 与 DuckDB 生态中常用工具、工作流的集成方式，帮助你在现有团队流程中快速引入 DuckQuery。

---

## 1. 与 DuckDB CLI / Python / R 协同

### 1.1 共享 DuckDB 数据库文件

- DuckQuery 默认将 DuckDB 文件存放在 `data/duckdb/duckquery.duckdb`；
- 你可以直接使用 DuckDB CLI 或 Python、R 客户端打开该文件进行交互；
- 示例（CLI）：

```bash
duckdb data/duckdb/duckquery.duckdb
```

### 1.2 Python / R Notebook

- 在 Notebook 中引入 DuckDB：

```python
import duckdb

conn = duckdb.connect("data/duckdb/duckquery.duckdb")
df = conn.execute("SELECT * FROM upload_orders LIMIT 100").fetchdf()
```

- 通过 Notebook 做建模后可将结果写回 DuckDB，再回到 DuckQuery 图形化界面进行可视化或导出。

---

## 2. 与外部数据库同步

### 2.1 定时刷新

- DuckQuery 支持 MySQL / PostgreSQL / SQLite 等数据源；
- 可使用操作系统的定时任务（cron、计划任务）执行 API 调用或 `python scripts/sync_xxx.py`（你可以编写脚本调用 DuckQuery API）；
- 在脚本中调用 `/api/data-sources/reload` 或 `/api/visual-query/preview` 来刷新数据。

### 2.2 数据落地

- 使用 DuckQuery 将远程数据库数据导入 DuckDB 后，可通过 DuckDB 命令将结果导出：

```sql
COPY (
  SELECT * FROM mysql_orders WHERE order_date >= '2024-01-01'
) TO 'exports/mysql_orders_2024.parquet' (FORMAT PARQUET);
```

---

## 3. 与 BI / 报表工具整合

### 3.1 直接查询 DuckDB

- 许多现代 BI 工具（例如 Metabase、Superset、Tableau 通过 ODBC）支持连接 DuckDB；
- 将连接指向 DuckQuery 生成的 DuckDB 数据库文件，或配置 DuckDB HTTP(S) Server（若开启）；
- 优点：DuckQuery 负责数据准备、清洗、联结，BI 工具专注于可视化。

### 3.2 导出数据

- DuckQuery 支持导出 CSV、Parquet；
- 在 BI 工具或数据仓库中加载这些文件，保持流程一致；
- 可以结合对象存储（MinIO、S3）进行自动化落地。

---

## 4. CI/CD 与自动化

### 4.1 集成测试

- 借助 DuckDB 的内存数据库能力，你可以在 CI 中执行快捷测试：

```bash
pytest api/tests -m "duckdb"
```

- 可通过 `config/app-config.json` 设置低资源限制，确保 CI 环境稳定。

### 4.2 构建流水线

- 在 CI 生成最新的 Docker 镜像，打上 `duckdb` 标签：

```bash
docker build -t your-registry/duckquery-duckdb:latest .
docker push your-registry/duckquery-duckdb:latest
```

- 部署时使用 `docker-compose.override.yml` 指定镜像并更新配置。

---

## 5. VS Code / JetBrains DuckDB 插件

1. 安装 DuckDB 官方提供的 VS Code 扩展；
2. 在扩展中配置 `data/duckdb/duckquery.duckdb` 文件路径；
3. 直接在 VS Code 里执行 DuckDB 查询，与 DuckQuery 前端共享同一数据。

---

## 6. API 使用示例

### 6.1 触发查询预览

```bash
curl -X POST http://localhost:8000/api/visual-query/preview \
  -H "Content-Type: application/json" \
  -d '{
    "config": {
      "table_name": "upload_orders",
      "selected_columns": ["order_id", "order_amount"],
      "limit": 50
    },
    "include_metadata": true
  }'
```

### 6.2 提交异步任务

```bash
curl -X POST http://localhost:8000/api/async-tasks/submit \
  -H "Content-Type: application/json" \
  -d '{
    "sql": "SELECT * FROM upload_orders",
    "save_as_table": "async_orders_snapshot"
  }'
```

---

## 7. 最佳实践

- **版本控制**：将 `config/*.json` 纳入 git（敏感信息除外），方便团队同步设置；
- **命名规范**：上传文件后立即在“数据表管理”中重命名 DuckDB 表，保持表名语义化；
- **资源限制**：生产环境建议开启 `duckdb_memory_limit` 与 `query_timeout`，防止单个任务占满资源；
- **监控**：利用 `/api/system/monitor` 或自定义日志，追踪 DuckDB 查询耗时、异步任务状态；
- **安全**：在部署时开启 HTTPS 反向代理，限制 API 访问来源。

---

## 8. 参考资源

- [DuckDB 官方文档](https://duckdb.org/docs/)
- [DuckQuery GitHub 仓库](https://github.com/Chenkeliang/duckdb-query)
- [DuckQuery 产品介绍 · GitHub Pages](https://chenkeliang.github.io/DuckQuery/)

如需更多集成案例或希望补充文档，欢迎在 [Discussions](https://github.com/Chenkeliang/duckdb-query/discussions) 与我们交流。
