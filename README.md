# 🦆 Duck Query - DuckDB驱动的交互式数据分析平台

<div align="center">

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Python](https://img.shields.io/badge/Python-3.11+-blue.svg)](https://python.org)
[![DuckDB](https://img.shields.io/badge/DuckDB-Latest-orange.svg)](https://duckdb.org)
[![Docker](https://img.shields.io/badge/Docker-Supported-2496ED.svg)](https://docker.com)

**基于DuckDB的现代数据分析平台 • 5分钟搞定跨源数据关联 • 无需建库无需ETL**

[🚀 快速开始](#-快速开始) • [📖 功能特性](#-功能特性) • [⚙️ 配置说明](#️-配置说明) • [🤝 贡献指南](#-贡献指南)

</div>

---

## 🎯 项目简介

Duck Query 是一个基于 **DuckDB** 构建的现代化数据分析平台，专门为解决跨源数据分析痛点而设计。

**核心价值**：
- 🚫 **无需建库导入** - 文件拖拽即用，数据库直连查询
- 🔗 **跨源数据关联** - MySQL + CSV + Parquet 一个SQL搞定
- ⚡ **DuckDB引擎** - 列式存储，亿级数据秒级响应
- 🌐 **Web界面** - 现代化UI，支持SQL编辑和可视化

## ✨ 功能特性

### 🗃️ 多数据源支持

**文件格式**
- 📄 CSV, Excel (xls/xlsx)
- 📊 Parquet, JSON, JSONL  
- 🌐 URL远程文件直读
- 📋 剪贴板数据快速成表

**数据库连接**
- 🐬 MySQL
- 🐘 PostgreSQL

**DuckDB特性**
- ⚡ 上传文件自动建表，无需手动导入
- 🔄 任意SQL查询结果可一键保存为新表
- 💡 利用DuckDB强大的数据处理能力快速成表

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

-- 文件直读函数
SELECT * FROM read_csv('data.csv');
SELECT * FROM read_parquet('file.parquet');
```

**性能优势**
- 🏛️ 列式存储引擎，OLAP查询优化
- 📊 支持复杂分析函数和聚合
- ⚡ 内存中处理，查询速度极快
- 📈 自动查询优化和向量化执行

### 💻 Web界面特性

- 📝 **Monaco Editor** - VS Code级别的SQL编辑体验
- 🔍 **智能补全** - SQL语法高亮和自动补全
- ✅ **语法检查** - 实时SQL验证和错误提示
- 📊 **结果展示** - 表格和图表可视化
- 💾 **数据导出** - 支持CSV、Excel、Parquet格式

## 🚀 快速开始

### 环境要求

- 🐳 Docker 20.10+
- 🔧 Docker Compose 2.0+

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
git clone https://github.com/Chenkeliang/DuckQuery.git
cd DuckQuery

# 2. 一键启动（自动配置+启动）
./quick-start.sh
```

**💡 提示：** 首次启动前，建议检查 `docker-compose.yml` 中的端口、内存、CPU等配置是否符合你的环境。

### 手动部署

```bash
# 1. 克隆项目
git clone https://github.com/Chenkeliang/DuckQuery.git
cd DuckQuery

# 2. 检查并调整Docker配置
# 编辑 docker-compose.yml，调整端口、资源限制等

# 3. 启动服务
docker-compose up -d --build

# 4. 访问应用
# 前端界面: http://localhost:3000
# API文档: http://localhost:8000/docs
```

**配置调整要点：**
- **端口冲突**：如果8000或3000端口被占用，修改 `docker-compose.yml` 中的端口映射
- **资源限制**：根据服务器配置调整内存和CPU限制
- **目录权限**：确保数据目录有正确的读写权限



### 从源码安装

**克隆仓库**
```bash
git clone https://github.com/Chenkeliang/DuckQuery.git
cd duck-query
```

**后端部署**
```bash
cd api
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000
```

**前端部署**
```bash
cd frontend
npm install
npm run build
npm run preview
```

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

🌍 **环境变量覆盖**: 可以通过环境变量覆盖配置文件中的设置，特别适合Docker部署。

### 数据库连接配置

创建 `config/datasources.json`：

```json
{
  "database_sources": [
    {
      "id": "production_mysql",
      "name": "生产环境MySQL",
      "type": "mysql",
      "host": "localhost",
      "port": 3306,
      "database": "production",
      "username": "user",
      "password": "encrypted_password"
    },
    {
      "id": "warehouse_pg", 
      "name": "数据仓库PostgreSQL",
      "type": "postgresql",
      "host": "postgres.example.com",
      "port": 5432,
      "database": "warehouse",
      "username": "readonly",
      "password": "encrypted_password"
    }
  ]
}
```

### DuckDB引擎配置

Duck Query 在应用启动时自动配置DuckDB引擎，包括：
- 自动优化参数设置（线程数、内存限制、性能优化等）
- 自动安装和加载必要扩展（Excel、JSON、Parquet支持）
- 用户无需手动配置，开箱即用

## 📖 使用指南

### 基本使用流程

1. **上传数据文件**
   - 拖拽CSV、Excel、Parquet文件到上传区域
   - 或通过URL直接读取远程文件

2. **连接数据库**
   - 配置MySQL/PostgreSQL连接信息
   - 测试连接并同步表结构

3. **编写SQL查询**
   - 使用Monaco编辑器编写查询
   - 享受语法高亮和智能补全
   - 跨源JOIN不同数据源的表

4. **查看结果**
   - 表格形式展示查询结果
   - 自动生成数据可视化图表
   - 导出结果为各种格式

### DuckDB特性使用

**上传文件自动成表**
```sql
-- 上传CSV文件后，系统自动创建表
SELECT * FROM uploaded_sales_data;

-- 上传Excel文件后，每个工作表成为一个表
SELECT * FROM excel_sheet1;
SELECT * FROM excel_sheet2;

-- 上传JSON文件后，自动解析为表结构
SELECT * FROM json_events;

-- 剪贴板粘贴数据也会自动成表
SELECT * FROM pasted_data_table;
```

**数据类型和函数**
```sql
-- 处理JSON数据
SELECT json_extract(data, '$.field') FROM table;

-- 数组操作
SELECT unnest([1, 2, 3]) as numbers;

-- 时间序列分析
SELECT date_trunc('month', date_col), COUNT(*)
FROM events
GROUP BY date_trunc('month', date_col);
```

## 🛠️ 开发

### 本地开发环境

```bash
# 克隆项目
git clone https://github.com/Chenkeliang/DuckQuery.git
cd duck-query

# 后端开发
cd api
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload

# 前端开发
cd frontend
npm install
npm run dev
```

### AI驱动开发

本项目完全基于AI技术栈开发：

- 🤖 **代码生成**: 使用 Cursor AI 编程助手进行智能代码生成
- 💬 **架构设计**: 基于 Qwen 大模型进行系统架构设计和优化
- 🎭 **自动化测试**: 使用 Playwright 进行端到端自动化测试
- 🔧 **持续优化**: AI辅助代码重构和性能优化

这是一个展示AI在软件开发全流程应用的实践项目。

## 🤝 贡献指南

我们欢迎各种形式的贡献！

### 项目贡献

欢迎通过以下方式参与项目：

- 🌟 **Star项目** - 给项目点星标支持
- 🍴 **Fork代码** - 基于项目进行二次开发
- 💡 **功能建议** - 在Issues中提出改进建议
- 📖 **文档完善** - 帮助改进使用文档

## 📊 性能说明

Duck Query 基于 DuckDB 引擎，具有以下性能特点：

- **列式存储**: 优化分析查询性能
- **向量化执行**: 充分利用现代CPU特性
- **内存处理**: 减少磁盘I/O，提升查询速度
- **智能优化**: 自动查询计划优化



## 🔒 安全特性

- 🛡️ SQL注入防护
- 🔐 数据库密码加密存储
- 📝 文件类型和大小验证
- 🌐 CORS安全配置

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

[⭐ Star](https://github.com/Chenkeliang/DuckQuery) • [🍴 Fork](https://github.com/Chenkeliang/DuckQuery/fork) • [📥 Download](https://github.com/Chenkeliang/DuckQuery/releases)

</div>