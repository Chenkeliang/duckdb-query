# Duck Query - DuckDB 驱动的交互式数据分析平台

<div align="center">

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Python](https://img.shields.io/badge/Python-3.11+-3776AB.svg?logo=python&logoColor=white)](https://python.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-Backend-05998b.svg)](https://fastapi.tiangolo.com/)
[![React](https://img.shields.io/badge/React-Frontend-61dafb.svg?logo=react&logoColor=black)](https://react.dev/)
[![DuckDB](https://img.shields.io/badge/DuckDB-native%20IO-FFBF00.svg?logo=duckdb&logoColor=white)](https://duckdb.org/)
[![Docker](https://img.shields.io/badge/Docker-supported-2496ED.svg?logo=docker&logoColor=white)](https://www.docker.com/)
[![Docs](https://img.shields.io/badge/Docs-DuckQuery%20Pages-3b82f6.svg)](https://chenkeliang.github.io/duckdb-query/)

**DuckDB-first • 可视化构建 + SQL 编辑 • 本地私有部署**

[快速开始](#-快速开始) • [功能特性](#-功能特性) • [配置要点](#-配置要点) • [常用工作流](#-常用工作流) • [开发与测试](#-开发与测试) • [贡献指南](#-贡献指南)

</div>

---

## TL;DR (EN)

- **DuckDB-native ingestion** – every upload/URL/server/clipboard file goes through `read_*` + httpfs，chunked uploads写入 FIFO 供 DuckDB 直接加载。
- **Visual + SQL workspace** – pivot builder, expression filters, history/favorites, and a full DuckDB editor share the same tables.
- **Local & secure** – FastAPI backend + React frontend run anywhere via Docker, all data stays on your infra.
- **Docs & samples** – see the [product site](https://chenkeliang.github.io/duckdb-query/) and the [getting-started guide](docs/duckdb-getting-started.md).

> 访问 [DuckQuery · DuckDB 可视化分析平台](https://chenkeliang.github.io/duckdb-query/) 获取全量截图与应用场景。

## 项目简介

Duck Query 快速帮你打破数据孤岛，剪切板\csv\excel\parquet\json\远程文件\数据库，都能作为数据源在同一个界面中完成图形化分析与 SQL 查询。
不用ETL 不用写脚本，几秒钟内就能导入数据，将你的多个不同的数据源快速的关联查询。


### 面向 DuckDB 用户的核心优势

- **即装即用**：内置 DuckDB 扩展、内存/线程限制、httpfs/S3 设置与导出目录。
- **图形化 Builder**：JSON解析、Pivot透视、表达式过滤、冲突类型转换，可视化生成SQL。
- **SQL 工作区**：CodeMirror 编辑器，支持DuckDB原生语法。
- **全链路 DuckDB**：`read_*` + httpfs + 流式写入/导出（`COPY ... TO`），xls回退 pandas 读取。

## 功能特性

### 1. 数据接入与预处理

- **多格式文件**：CSV/TSV、JSON/JSONL、Parquet、Excel（含多 Sheet）以及剪贴板文本。
- **URL / HTTPFS / S3 / OSS**：配置 `duckdb_remote_settings` 后，可直接 `read_*('https://...')` / `read_*('s3://...')` 建表，无需落地。
- **服务器目录**：Docker/K8s 挂载后在前端浏览并导入宿主机大文件。

### 2. 查询体验

- **图形化查询**：字段、聚合、排序、筛选、表达式、HAVING、指标模板一站配置。
- **Pivot / 多指标**：指标支持基础类型转换（如 DECIMAL/DOUBLE/INTEGER）、聚合格式、JSON 展开。
- **SQL 编辑器**：CodeMirror 语法高亮，支持自动补全、结果分页与 JSON/表格切换。
- **表管理**：查询结果或异步任务可直接物化为 DuckDB 表复用。

### 3. 自动化与协作

- **异步任务**：任意查询可提交异步任务，完成后在“任务中心”下载 Parquet/CSV，并会自动生成DuckDB表用于新的分析查询。
- **导出与缓存**：所有导出都走 DuckDB `COPY ... TO exports/...`，缓存自动清理、可重复下载。
- **数据源管理**：管理 MySQL/PostgreSQL 连接。

### 4. 安全与部署

- **完全自部署**：所有文件、DuckDB 数据库、导出缓存都留在本地或私有云。
- **密钥与配置隔离**：`config/` 目录存放应用配置/秘钥。
- **监控与限流**：可配置 `duckdb_memory_limit`、最大表数量、最大上传文件等参数。
- **容器化**：Docker Compose / quick-start 脚本包含前后端、DuckDB 数据目录、日志、server_data 挂载。

## 快速开始

### 1. Docker 一键启动（推荐）

```bash
git clone https://github.com/Chenkeliang/duckdb-query.git
cd duckdb-query
./quick-start.sh
```

脚本会检查 Docker 环境、复制配置模板、启动 `duckquery-backend` + `duckquery-frontend`。默认端口：

- 前端：http://localhost:3000
- 后端 API：http://localhost:8000
- Swagger 文档：http://localhost:8000/docs

若偏好手动：

```bash
docker-compose up -d --build
```

> **Docker Hub 拉取失败？**  
> 可将 Dockerfile 中的 `FROM python:3.12-bookworm`、`FROM node:22-alpine`、`FROM nginx:stable-alpine`  
> 直接替换为  
> `FROM crpi-pfgvhes8xk1g26q3.cn-beijing.personal.cr.aliyuncs.com/grayliang/dq:python-3.12-bookworm`  
> `FROM crpi-pfgvhes8xk1g26q3.cn-beijing.personal.cr.aliyuncs.com/grayliang/dq:node-22-alpine`  
> `FROM crpi-pfgvhes8xk1g26q3.cn-beijing.personal.cr.aliyuncs.com/grayliang/dq:nginx-stable-alpine`  
> 即可使用公开的阿里云镜像重新构建。

### 2. 本地开发模式

Backend（FastAPI）：

```bash
cd api
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python -m uvicorn main:app --reload
```

Frontend（React + Vite）：

```bash
cd frontend
npm install
npm run dev
```

其他常用命令：

- `python -m pytest api/tests -q`
- `npm run lint` / `npm run build`
- `./quick-start.sh reset`（清理容器与数据）

### 3. 部署提示

- 调整 `docker-compose.yml` 中的端口、CPU/内存限制、卷挂载。
- 将 `server_data`、`exports`、`logs` 等目录映射到稳定的持久化路径。
- 若需 K8s，参考 `docker-compose.yml` 中的环境变量与卷配置自行转写。

## 配置要点

创建或复制 `config/app-config.json`（见 `config/app-config.example.json`）：

```json
{
  "debug": false,
  "max_file_size": 53687091200,
  "max_query_rows": 20000,
  "duckdb_memory_limit": "8GB",
  "duckdb_threads": 8,
  "duckdb_extensions": ["excel", "json", "parquet"],
  "server_data_mounts": [
    { "label": "Shared Data", "path": "/app/server_mounts" }
  ],
  "duckdb_remote_settings": {
    "s3_endpoint": "https://s3.your-cloud.com",
    "s3_access_key_id": "AKIA...",
    "s3_secret_access_key": "YOUR_SECRET",
    "http_proxy": "",
    "use_credentials_from_env": false
  }
}
```

额外配置：

- `datasources.json`：预置数据库连接。
- `secret.key`：前端数据库口令/加密使用。
- `duckdb_remote_settings`：开启 httpfs / S3 / OSS 读取。
- `server_data_mounts`：控制哪些宿主目录可在前端浏览器中显示Duckdb读取。若不通过 Docker/容器启动，请把 `path` 换成本机真实目录（如 `/Users/<you>/Downloads` 或项目内的 `./server_data`），否则前端会提示“路径不存在”。

### 端口调整说明

- 后端（FastAPI / Uvicorn）：可通过启动参数修改端口，例如 `python -m uvicorn main:app --reload --port 9000 --host 0.0.0.0`。docker-compose 模式请调整端口映射。
- 前端（Vite）：默认跑在 5173。若需修改 API 代理目标，设置环境变量 `VITE_API_PROXY_TARGET=http://localhost:<后端端口>` 再 `npm run dev`；若还需改前端自身端口，可运行 `npm run dev -- --port <新端口> --host`。
- CORS：后端允许的前端来源在 `config/app-config.json` 的 `cors_origins` 中配置，前端端口/域名变化时记得同步添加（如 `http://localhost:5173`、`http://localhost:3001` 等）。
- 容器模式：调整 `docker-compose.yml` 中的端口映射，保持前端代理指向容器内的后端服务名/端口。

## 文档索引

- [docs/CHANGELOG.md](docs/CHANGELOG.md)：功能更新日志（每次新增功能必须在此记录）。
- [docs/duckdb-getting-started.md](docs/duckdb-getting-started.md)：5 分钟上手指南。
- [docs/duckdb-integration-guide.md](docs/duckdb-integration-guide.md)：如何与 Notebook、BI、CI/CD 协作。
- [docs/tasks/](docs/tasks/)：功能演进与设计任务说明，包含 typed ingestion、Excel 多 Sheet、Pivot 类型转换、DuckDB 原生 IO 等专题。
- [docs/CONFIGURATION.md](docs/CONFIGURATION.md)：配置项解释、部署建议。

## 贡献指南

- 阅读 [CONTRIBUTING.md](CONTRIBUTING.md) 了解代码规范、PR 模板与分支策略。
- 在提交 PR 前执行 `python -m pytest api/tests -q` 与 `npm run lint`，保证零警告。
- 通过 [Issues](https://github.com/Chenkeliang/duckdb-query/issues/new/choose) 或 [Discussions](https://github.com/Chenkeliang/duckdb-query/discussions) 反馈问题、提交想法。
- 若新增配置/环境变量，请在文档中同步说明；前端 UI 变更建议附上截图或录屏。

## 许可证

[MIT License](LICENSE) — 欢迎在企业/个人项目中使用，保留版权声明即可。

## 致谢

特别感谢：

- [DuckDB](https://duckdb.org/) — 高性能嵌入式分析数据库；
- [FastAPI](https://fastapi.tiangolo.com/) — 现代 Python API 框架；
- [React](https://react.dev/) — 前端 UI；
- 以及所有贡献者与社区伙伴。

<div align="center">

**基于 DuckDB，让数据分析更简单**

[Star](https://github.com/Chenkeliang/duckdb-query) • [Fork](https://github.com/Chenkeliang/duckdb-query/fork) • [Download](https://github.com/Chenkeliang/duckdb-query/releases)

</div>
