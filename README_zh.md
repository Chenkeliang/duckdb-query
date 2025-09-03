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

**为什么选择Duck Query？**
- 🚫 **告别繁琐ETL** - 文件拖拽即用，数据库直连查询
- 🔗 **跨源数据关联** - MySQL + CSV + Parquet 一个SQL搞定  
- ⚡ **DuckDB引擎** - 列式存储，亿级数据秒级响应
- 🌐 **现代化界面** - Web端SQL编辑器，支持智能补全和可视化

## ✨ 功能特性

### 🗃️ 全格式数据源支持

**文件格式**
- 📄 **CSV, Excel** (xls/xlsx) - 电子表格数据
- 📊 **Parquet, JSON, JSONL** - 大数据格式支持
- 🌐 **URL远程文件** - 直读网络文件，无需下载
- 📋 **剪贴板数据快速成表** - 复制粘贴表格数据即可分析

**数据库连接**
- 🐬 **MySQL** - 业务系统数据库
- 🐘 **PostgreSQL** - 数据仓库连接

**DuckDB特性**
- ⚡ 上传文件自动建表，无需手动导入
- 🔄 任意SQL查询结果可一键保存为新表
- 💡 利用DuckDB强大的数据处理能力快速成表

### 🔄 强大的跨源JOIN能力

Duck Query 的核心优势 - 在同一个SQL查询中自由关联不同数据源：

```sql
-- 示例：关联业务数据库 + 本地文件 + 远程数据
SELECT 
    u.user_name,           -- 来自MySQL用户表
    s.sale_amount,         -- 来自上传的销售CSV
    p.product_name         -- 来自远程产品Parquet文件
FROM mysql_users u
JOIN uploaded_sales_csv s ON u.user_id = s.user_id
JOIN uploaded_products p ON s.product_id = p.product_id
WHERE s.sale_date >= '2024-01-01'
ORDER BY s.sale_amount DESC;
```

### 🦆 基于DuckDB的现代SQL引擎

**DuckDB核心优势**
- 🏛️ **列式存储** - OLAP查询性能优化，聚合分析极速
- 🚀 **向量化执行** - 充分利用现代CPU SIMD指令
- 📊 **内存处理** - 零配置，启动即用的嵌入式数据库
- 🔧 **PostgreSQL兼容** - 支持标准SQL和丰富的分析函数

**现代SQL特性支持**
```sql
-- 窗口函数分析
SELECT 
    product_name,
    sales_amount,
    ROW_NUMBER() OVER (ORDER BY sales_amount DESC) as sales_rank,
    LAG(sales_amount) OVER (ORDER BY date) as prev_sales
FROM sales_data;

-- JSON数据处理
SELECT 
    json_extract(user_profile, '$.age') as age,
    json_extract(user_profile, '$.preferences[0]') as first_preference
FROM user_data;

-- 数组和列表操作
SELECT 
    product_id,
    unnest(string_split(tags, ',')) as tag
FROM products;
```

### 💻 专业级Web界面

- 📝 **Monaco Editor** - VS Code同款编辑器，专业SQL开发体验
- 🔍 **DuckDB语法支持** - 针对DuckDB优化的语法高亮和补全
- ✅ **实时语法检查** - SQL错误实时提示，提升开发效率
- 📊 **查询结果可视化** - 数据洞察一目了然
- 💾 **多格式导出** - CSV、Excel、Parquet格式结果导出

## 🚀 快速开始

### 环境要求

- 🐳 **Docker** 20.10+
- 🔧 **Docker Compose** 2.0+
- 💻 **操作系统**: Linux / macOS / Windows

### 一键Docker部署

```bash
# 1. 创建项目目录
mkdir duck-query && cd duck-query

# 2. 下载部署配置
curl -o docker-compose.yml https://raw.githubusercontent.com/your-username/duck-query/main/deployment/docker-compose.yml

# 3. 创建配置和数据目录
mkdir -p config data

# 4. 启动所有服务
docker-compose up -d

# 5. 查看服务状态
docker-compose ps

# 6. 访问应用
# 🌐 Web界面: http://localhost:3000
# 📚 API文档: http://localhost:8000/docs
# 💓 健康检查: http://localhost:8000/health
```

### 从源码部署

**克隆项目**
```bash
git clone https://github.com/your-username/duck-query.git
cd duck-query
```

**后端服务部署**
```bash
cd api
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000
```

**前端服务部署**
```bash
cd frontend
npm install
npm run build
npm run preview
```

## ⚙️ 配置说明

### 应用基础配置

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
  "max_query_rows": 10000,           // 页面查询结果最大行数，更大使用异步任务
  "max_tables": 200,                 // 最大表数量
  "enable_caching": true,            // 启用缓存
  "cache_ttl": 3600,                 // 缓存生存时间(秒)
  "timezone": "Asia/Shanghai"        // 时区设置
}
```

### 数据库连接配置

创建 `config/datasources.json`：

```json
{
  "database_sources": [
    {
      "id": "production_mysql",
      "name": "生产环境MySQL",
      "type": "mysql",
      "host": "mysql.company.com",
      "port": 3306,
      "database": "production",
      "username": "analyst_user",
      "password": "encrypted_password",
      "pool_size": 5,
      "max_overflow": 10
    },
    {
      "id": "warehouse_postgresql", 
      "name": "数据仓库PostgreSQL",
      "type": "postgresql",
      "host": "postgres.company.com",
      "port": 5432,
      "database": "warehouse",
      "username": "readonly_user",
      "password": "encrypted_password",
      "schema": "analytics"
    }
  ]
}
```

### DuckDB引擎配置

Duck Query 在应用启动时自动配置DuckDB，包含以下设置：

**自动化配置系统** (在 `api/core/duckdb_engine.py` 中)：
```python
# 系统自动读取所有duckdb_开头的配置项
def _apply_duckdb_configuration(connection, temp_dir):
    config_items = {k: v for k, v in app_config.__dict__.items() 
                   if k.startswith('duckdb_')}
    
    # 自动应用配置
    if config_items.get('duckdb_threads'):
        connection.execute(f"SET threads={config_items['duckdb_threads']}")
    if config_items.get('duckdb_memory_limit'):
        connection.execute(f"SET memory_limit='{config_items['duckdb_memory_limit']}'")
    # ... 自动应用所有配置项
```

**可配置参数** (在 `config/app-config.json` 中)：
```json
{
  "duckdb_memory_limit": "8GB",           // 内存限制
  "duckdb_threads": 8,                    // 线程数
  "duckdb_temp_directory": "./temp",      // 临时目录
  "duckdb_home_directory": "./home",      // 主目录
  "duckdb_extension_directory": "./ext",  // 扩展目录
  "duckdb_enable_profiling": true,        // 启用性能分析
  "duckdb_profiling_output": "./profile.json", // 性能分析输出
  "duckdb_force_index_join": false,       // 强制索引JOIN
  "duckdb_enable_object_cache": true,     // 启用对象缓存
  "duckdb_preserve_insertion_order": false, // 保持插入顺序
  "duckdb_enable_progress_bar": false,   // 启用进度条
  "duckdb_extensions": ["excel", "json", "parquet"] // 扩展列表
}
```

系统会自动处理DuckDB的初始化和优化配置，大部分参数已优化，用户无需手动设置。

**完整配置示例**：参考 `config/app-config-duckdb-example.json` 文件，包含所有可配置的DuckDB参数。

## 📖 使用指南

### 基本操作流程

**1. 数据源准备**
- 📁 上传本地文件 (CSV, Excel, Parquet等)
- 🔗 配置数据库连接 (MySQL, PostgreSQL)
- 📋 粘贴剪贴板数据快速成表

**2. 跨源数据分析**
- 🔄 在同一查询中JOIN不同数据源
- 📊 使用DuckDB强大的分析函数
- ⚡ 享受列式存储带来的查询性能

**3. 结果查看和导出**
- 📋 表格形式查看查询结果
- 💾 导出为CSV、Excel、Parquet格式

### DuckDB特性使用

**上传文件自动成表 支持自定义别名**
```sql
-- 上传CSV文件后，系统自动创建表
SELECT * FROM uploaded_sales_data;

-- 上传Excel文件后，每个工作表成为一个表
SELECT * FROM excel_sheet1;
SELECT * FROM excel_sheet2;

-- 剪贴板粘贴数据也会自动成表
SELECT * FROM pasted_data_table;
```

**高级数据处理**
```sql
-- 复杂JSON数据分析
SELECT 
    json_extract(event_data, '$.user_id') as user_id,
    json_extract(event_data, '$.event_type') as event_type,
    json_extract_path(event_data, 'properties', 'page') as page
FROM events
WHERE json_extract(event_data, '$.timestamp') > '2024-01-01';

-- 时间序列分析
SELECT 
    date_trunc('month', order_date) as month,
    COUNT(*) as order_count,
    SUM(amount) as total_revenue,
    AVG(amount) as avg_order_value
FROM orders
WHERE order_date >= '2024-01-01'
GROUP BY date_trunc('month', order_date)
ORDER BY month;

-- 数组和列表处理
SELECT 
    product_id,
    unnest(string_split(tags, ',')) as tag,
    list_aggregate(ratings, 'avg') as avg_rating
FROM products
WHERE array_length(ratings) > 0;
```

## 🛠️ 开发指南

### AI驱动开发

本项目完全基于AI技术栈开发：

- 🤖 **代码生成**: 使用 Cursor、AugmentCode 编程助手进行代码生成
- 💬 **架构设计**: 基于 Claude 大模型进行系统架构设计和优化
- 🎭 **自动化测试**: 使用 Playwright 进行端到端自动化测试
- 🔧 **持续优化**: AI辅助代码重构和性能优化

## 🤝 贡献指南

我们热烈欢迎各种形式的贡献！

### 项目贡献

欢迎通过以下方式参与项目：

- 🌟 **Star项目** - 给项目点星标支持
- 🍴 **Fork代码** - 基于项目进行二次开发
- 💡 **功能建议** - 在Issues中提出改进建议
- 📖 **文档完善** - 帮助改进使用文档

## 📊 性能说明

### DuckDB性能优势

Duck Query 基于 [DuckDB](https://duckdb.org) 引擎，具有以下性能特点：

- **🏛️ 列式存储**: 针对OLAP查询优化，聚合分析性能卓越
- **🚀 向量化执行**: 充分利用现代CPU SIMD指令，加速计算
- **📊 内存处理**: 零配置嵌入式数据库，启动即用
- **⚡ 并行处理**: 自动多线程并行处理大数据集
- **🔧 查询优化**: 智能查询计划优化，复杂查询性能提升

### 性能基准

| 数据量 | 查询类型 | 执行时间 | 内存使用 |
|--------|----------|----------|----------|
| 1M行   | 简单聚合 | <100ms   | <50MB    |
| 10M行  | GROUP BY | <500ms   | <200MB   |
| 100M行 | 复杂JOIN | <5s      | <1GB     |

## 🔒 安全特性

- 🛡️ **SQL注入防护**: 自动检测和阻止危险SQL操作
- 🔐 **数据库密码加密**: 使用AES-256加密存储连接密码
- 📝 **文件类型验证**: 可自定义上传文件类型和大小
- 🌐 **CORS安全配置**: 跨域请求安全控制
- 🏠 **网络隔离**: Docker容器网络隔离保护、数据只存储在本地

## 📄 许可证

本项目采用 [MIT 许可证](LICENSE) 开源。

MIT许可证允许您：
- ✅ 商业使用
- ✅ 修改源码  
- ✅ 分发软件
- ✅ 私人使用

## 🙏 致谢

特别感谢以下优秀的开源项目：

### 核心依赖
- 🦆 **[DuckDB](https://duckdb.org)** - 高性能嵌入式分析数据库引擎
- ⚡ **[FastAPI](https://fastapi.tiangolo.com)** - 现代化Python API框架
- ⚛️ **[React](https://reactjs.org)** - 用户界面构建库

### 技术支持
- 🐳 **[Docker](https://docker.com)** - 容器化部署技术
- 📊 **[Pandas](https://pandas.pydata.org)** - Python数据处理库

---

<div align="center">

**🦆 基于DuckDB，让数据分析更简单、更强大**

**现代化的方式，解决跨源数据分析的痛点**

[⭐ Star项目](https://github.com/your-username/duck-query) • [🍴 Fork代码](https://github.com/your-username/duck-query/fork) • [📥 下载发布](https://github.com/your-username/duck-query/releases) • [🤝 参与贡献](https://github.com/your-username/duck-query/pulls)

</div>