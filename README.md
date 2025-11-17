# 🦆 Duck Query - DuckDB驱动的交互式数据分析平台

<div align="center">

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Python](https://img.shields.io/badge/Python-3.11+-blue.svg)](https://python.org)
[![DuckDB](https://img.shields.io/badge/DuckDB-Visual%20Analytics-FFBF00.svg?logo=duckdb&logoColor=white)](https://duckdb.org)
[![Docker](https://img.shields.io/badge/Docker-Supported-2496ED.svg)](https://docker.com)
[![Docs](https://img.shields.io/badge/Docs-DuckQuery%20Pages-3b82f6.svg)](https://chenkeliang.github.io/duckdb-query/)
[![Discussions](https://img.shields.io/badge/Discussions-Welcome-22c55e.svg)](https://github.com/Chenkeliang/duckdb-query/discussions)

**基于 DuckDB 的现代数据分析平台 • 简化跨源数据关联 • 无需建库无需 ETL**

[🚀 快速开始](#-快速开始) • [📖 功能特性](#-功能特性) • [⚙️ 配置说明](#️-配置说明) • [🤝 贡献指南](#-贡献指南)

</div>
 
---

## TL;DR (EN)

- **DuckDB-first analytics**: import Excel/CSV/Parquet, connect MySQL/PostgreSQL, and materialise into DuckDB tables in seconds.  
- **Dual-mode experience**: visual builder with type-conflict guards + full DuckDB SQL editor (window functions, JSON, PIVOT, etc.).  
- **Local & secure**: deploy via Docker or source, keep all DuckDB workloads on your own infrastructure.  
- **Docs & demo**: explore the [DuckQuery product page](https://chenkeliang.github.io/duckdb-query/) and follow the [DuckDB getting started guide](docs/duckdb-getting-started.md).

> 想快速了解？访问 [DuckQuery · DuckDB 可视化分析平台](https://chenkeliang.github.io/duckdb-query/) 浏览单页介绍与应用场景。

## 🎯 项目简介

Duck Query 是基于 **DuckDB** 构建的现代化数据分析平台，专为简化跨源数据分析而设计。
告别复杂的ETL流程，通过简单的复制粘贴即可将任意数据快速转换为可分析的数据表，简化数据分析流程。

### 🔍 针对 DuckDB 用户的亮点

- **DuckDB 即插即用**：内置 DuckDB 运行时、扩展加载与资源限制配置，开箱即用。  
- **跨格式建表**：自动生成列统计与类型画像，便于 DuckDB SQL 进一步建模。  
- **智能类型守护**：JOIN/透视时自动建议 `TRY_CAST`，减少 DuckDB 报错。  
- **DuckDB 原生导出**：结果表可落地为 DuckDB 表或导出 Parquet/CSV，方便重用。

## 🆚 Duck Query vs 传统方案

### 1. vs 文件导入分析
- **Excel**：50MB文件就卡顿，难以处理大数据
- **Duck Query**：支持GB级文件导入，查询计算速度快，完整数据可导出

### 2. vs 多源数据关联
- **Excel**：需要手动VLOOKUP，操作繁琐
- **Duck Query**：图形化选择关联条件，跨源JOIN，简化数据整合

### 3. vs 数据处理能力
- **Excel**：需要熟悉各种函数，学习成本高
- **Duck Query**：会SQL就可以分析数据，支持窗口函数、JSON处理

### 4. vs 环境搭建
- **传统数据库**：安装配置数据库繁琐
- **Duck Query**：Docker一键部署3分钟

### 5. vs 数据安全
- **云服务**：数据要上传有安全风险
- **Duck Query**：数据完全本地处理

### 6. vs 数据仓库建设
- **传统方案**：需要建库建表加载数据源等预处理
- **Duck Query**：直接导入分析，任意数据都可速成表，无需复杂预处理

**核心价值**：
- 📥 **数据接入** - 文件、粘贴数据、直连数据库，快速导入
- 🔗 **数据分析** - 跨源关联查询，复杂场景支持自定义SQL
- ⚡ **性能保障** - DuckDB列式引擎，大数据查询性能优异
- 🎨 **用户体验** - 现代化Web界面，CodeMirror SQL编辑器与可视化并重

## ✨ 功能特性

### 🗃️ 多数据源支持

**文件格式**
- 📄 CSV, Excel (xls/xlsx)
- 📊 Parquet
- 📋 JSON, JSONL
- 🌐 URL远程文件直读
- 📋 剪贴板数据

**数据库连接**
- 🐬 MySQL - 支持自定义SQL查询，结果自动加载到DuckDB
- 🐘 PostgreSQL - 支持自定义SQL查询，结果自动加载到DuckDB

**DuckDB特性**
- ⚡ 上传文件自动建表，无需手动导入
- 🔄 任意SQL查询结果可一键保存为新表
- 💡 利用DuckDB数据处理能力快速成表

### 🔄 跨源JOIN能力

Duck Query 的核心特性 - 在同一个SQL查询中关联不同数据源：

```sql
-- 示例：关联不同数据源
SELECT 
    u.user_name,
    s.amount,
    p.product_name
FROM mysql_users u
JOIN uploaded_sales s ON u.id = s.user_id
JOIN read_parquet('products.parquet') p ON s.product_id = p.id
WHERE s.date >= '2024-01-01';
```

### 🚀 强大的DuckDB SQL

**现代SQL特性**
```sql
-- 窗口函数
SELECT *, ROW_NUMBER() OVER (ORDER BY sales DESC) as rank 
FROM sales_data;

-- JSON处理
SELECT json_extract(data, '$.name') as name
FROM json_table;
```

**性能优势**
- 🏛️ 列式存储引擎，OLAP查询优化
- 📊 支持复杂分析函数和聚合
- ⚡  内存中处理，查询性能优异
- 📈 自动查询优化和向量化执行

### 💻 Web界面特性

- 📝 **CodeMirror Editor** - 专业的SQL编辑体验
- 📊 **结果展示** - 表格和图表可视化
- 💾 **数据导出** - 支持CSV、Parquet格式
- 🌐 **产品页** - [DuckQuery · DuckDB Visual Analytics](https://chenkeliang.github.io/duckdb-query/) 提供演示截图与常见问答

## 🚀 快速开始

### 环境要求

- 🐳 Docker 20.10+
- 🔧 Docker Compose 2.0+
- 🐍 Python 3.8+
- 📦 Node.js 18+

### 🐳 Docker配置

**使用统一的 `docker-compose.yml` 配置文件：**

```bash
# 启动服务
docker-compose up -d

# 重新构建并启动
docker-compose up -d --build

# 停止服务
docker-compose down
```

### 🚀 新用户一键启动（推荐）

```bash
# 1. 克隆项目
git clone https://github.com/Chenkeliang/duckdb-query.git
cd duckdb-query

# 2. 一键启动（自动配置+启动）
./quick-start.sh
```

**💡 提示：** 首次启动前，建议检查 `docker-compose.yml` 中的端口、内存、CPU等配置是否符合你的环境。

> 📘 面向 DuckDB 用户的更详细流程，请阅读 [DuckDB 快速上手指南](docs/duckdb-getting-started.md) 与 [DuckDB 集成手册](docs/duckdb-integration-guide.md)。

**配置调整要点：**
- **端口冲突**：如果8000或3000端口被占用，修改 `docker-compose.yml` 中的端口映射
- **资源限制**：根据服务器配置调整内存和CPU限制
- **目录权限**：确保数据目录有正确的读写权限

## ⚙️ 配置说明

### 应用配置

创建 `config/app-config.json`：

```json
{
  "debug": false,                    // 调试模式开关
  "cors_origins": [                  // 跨域请求允许的源
    "http://localhost:3000",
    "http://localhost:5173"
  ],
  "max_file_size": 53687091200,      // 最大文件大小(50GB)
  "query_timeout": 300,              // 查询超时时间(秒)
  "download_timeout": 600,           // 下载超时时间(秒)
  "max_query_rows": 10000,           // 查询结果最大行数
  "max_tables": 200,                 // 最大表数量
  "enable_caching": true,            // 启用缓存
  "cache_ttl": 3600,                 // 缓存生存时间(秒)
  "timezone": "Asia/Shanghai",       // 时区设置
  
  "duckdb_memory_limit": "8GB",      // DuckDB内存限制
  "duckdb_threads": 8,               // DuckDB线程数
  "duckdb_extensions": [             // DuckDB扩展
    "excel", "json", "parquet"
  ],
  
  "pool_min_connections": 2,         // 连接池最小连接数
  "pool_max_connections": 10,        // 连接池最大连接数
  "db_connect_timeout": 10,          // 数据库连接超时(秒)
  "db_read_timeout": 30,             // 数据库读取超时(秒)
  "db_write_timeout": 30             // 数据库写入超时(秒)
}
```

**💡 提示：** 新用户可以直接复制 `config/app-config.example.json` 作为起点，然后根据需要调整配置。

📖 **详细配置说明**: 查看 [配置文档](docs/CONFIGURATION.md) 了解所有配置项的作用和推荐值。


## 📖 使用指南

### 基本使用流程

1. **上传数据文件**
   - 拖拽CSV、Excel、Parquet文件到上传区域
   - 或通过URL直接读取远程文件
   - 直接粘贴CSV、TSV格式以及任意粘贴板数据，系统都可自动识别并成表

### 服务器目录导入

如果部署在 Docker/K8s 环境，可以把宿主机上的大文件通过挂载目录直接交给 DuckDB 读取，无需经过浏览器上传：

1. 在 `docker-compose.yml` 或 K8s manifest 中，为 `backend` 容器增加需要的挂载目录，例如（可选把 mac 的 Downloads/Documents 映射进来）：
   ```yaml
   volumes:
     - ./server_data:/app/server_mounts
     - ~/Downloads:/app/host_downloads
     - ~/Documents:/app/host_documents
   ```
2. 在 `config/app-config.json` 中的 `server_data_mounts` 写入可用目录（支持多条），同时可以通过 `duckdb_remote_settings` 配置 httpfs/S3。示例：
   ```json
   "server_data_mounts": [
     { "label": "Shared Data", "path": "/app/server_mounts" }
   ]
   ```
3. 重启容器后，前端的“服务器目录”页签会自动展示这些目录，用户即可浏览子目录并一键导入 CSV/Excel/Parquet/JSON 文件。界面会提示挂载要求，并在导入完成后同步刷新 DuckDB 表。 

> 📝 提示：挂载路径不在白名单中将不会出现在页面上；确保生产环境针对这些目录做好只读/权限控制。

2. **连接数据库**
   - 配置MySQL/PostgreSQL连接信息
   - 测试连接并同步表结构

3. **编写SQL查询**
   - 使用CodeMirror编辑器编写查询
   - 享受语法高亮和智能补全
   - 跨源JOIN不同数据源的表

4. **查看结果**
   - 表格形式展示查询结果
   - 自动生成数据可视化图表
   - 导出结果为各种格式

## 🔒 安全特性

- 🛡️ SQL注入防护
- 🔐 数据库密码加密存储
- 📝 文件类型和大小验证
- 🌐 CORS安全配置


## 🤝 贡献指南

欢迎通过以下方式参与：

- 阅读并遵循 [CONTRIBUTING.md](CONTRIBUTING.md)；
- 使用 Issue 模板反馈 [Bug](https://github.com/Chenkeliang/duckdb-query/issues/new?template=bug_report.md) / [Feature 请求](https://github.com/Chenkeliang/duckdb-query/issues/new?template=feature_request.md)，记得附上 DuckDB 版本；
- 发起 Pull Request 前，执行 `pytest` / `npm run lint` 并填好 [PR 模板](.github/PULL_REQUEST_TEMPLATE.md)；
- 任何想法都可以在 [Discussions](https://github.com/Chenkeliang/duckdb-query/discussions) 中交流。

我们期待更多 DuckDB 场景的反馈与实现。


## 📄 许可证

本项目采用 [MIT 许可证](LICENSE)。

## 🙏 致谢

特别感谢以下开源项目：

- [DuckDB](https://duckdb.org) - 高性能嵌入式分析数据库
- [FastAPI](https://fastapi.tiangolo.com) - 现代化Python API框架
- [React](https://reactjs.org) - 用户界面构建库

---

<div align="center">

**基于DuckDB，让数据分析更简单**

[⭐ Star](https://github.com/Chenkeliang/duckdb-query) • [🍴 Fork](https://github.com/Chenkeliang/duckdb-query/fork) • [📥 Download](https://github.com/Chenkeliang/duckdb-query/releases)

</div>
