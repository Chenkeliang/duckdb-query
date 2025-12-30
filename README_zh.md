<p align="center">
  <img src="frontend/src/assets/duckq-logo.svg" alt="DuckQuery" height="80">
</p>

<h1 align="center">DuckQuery</h1>

<p align="center">
  <b>DuckDB 的可视化分析界面。查询任意文件、任意数据库，开箱即用。</b>
</p>

<p align="center">
  <a href="#快速开始">快速开始</a> •
  <a href="#你能做什么">你能做什么</a> •
  <a href="#部署方式">部署方式</a> •
  <a href="README.md">English</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Python-3.11+-3776AB.svg?logo=python&logoColor=white" alt="Python">
  <img src="https://img.shields.io/badge/React-18-61DAFB.svg?logo=react&logoColor=black" alt="React">
  <img src="https://img.shields.io/badge/DuckDB-Powered-FFBF00.svg?logo=duckdb&logoColor=white" alt="DuckDB">
</p>

---

## 快速开始

**一条命令启动：**

```bash
git clone https://github.com/Chenkeliang/duckdb-query.git && cd duckdb-query && ./quick-start.sh
```

打开 **http://localhost:3000** 即可开始查询。

---

## 你能做什么

| 功能 | 操作方式 |
|------|---------|
| 📂 **查询任意文件** | 拖拽 CSV/Excel/Parquet 到浏览器，即刻生成表。 |
| 🗄️ **连接外部数据库** | 添加 MySQL/PostgreSQL 连接，与本地文件一起查询。 |
| 🔗 **跨数据源 JOIN** | `SELECT * FROM 本地表 JOIN mysql_db.users ON ...` |
| 📊 **可视化构建器** | 无需 SQL，拖拽完成 JOIN、透视表、合并操作。 |
| 📥 **从 Excel 粘贴** | 复制 Excel 单元格，直接粘贴创建新表。 |
| 🌐 **从 URL 导入** | 输入 CSV/Parquet 链接，自动导入 DuckDB。 |
| 🌙 **深色模式 & 多语言** | 一键切换主题和语言（中文/English）。 |

---

## 工作原理

```
┌─────────────────┐      ┌─────────────────┐      ┌─────────────────┐
│  你的文件        │      │   DuckQuery     │      │  你的数据库      │
│  CSV/Excel/...  │ ───► │  (DuckDB 引擎)  │ ◄─── │  MySQL/Postgres │
└─────────────────┘      └────────┬────────┘      └─────────────────┘
                                  │
                                  ▼
                         ┌─────────────────┐
                         │  SQL + 可视化    │
                         │    查询结果      │
                         └─────────────────┘
```

文件被导入为 **DuckDB 原生表**，查询速度极快。外部数据库通过 DuckDB 的 `ATTACH` 机制连接。

---

## 部署方式

### Docker 启动（推荐）

```bash
./quick-start.sh
# 或手动执行：
docker-compose up -d --build
```

| 服务 | 地址 |
|------|------|
| 前端界面 | http://localhost:3000 |
| API 文档 | http://localhost:8001/docs |

### 本地开发

```bash
# 后端
cd api && pip install -r requirements.txt && uvicorn main:app --reload

# 前端
cd frontend && npm install && npm run dev
```

---

## 配置说明

DuckQuery 开箱即用。如需高级配置，编辑 `config/app-config.json`：

| 配置项 | 默认值 | 作用 |
|--------|--------|------|
| `duckdb_memory_limit` | `8GB` | DuckDB 最大内存 |
| `server_data_mounts` | `[]` | 挂载宿主机目录用于直接读取文件 |
| `cors_origins` | `[localhost:3000]` | 允许的前端访问源 |

👉 **[完整配置参考 →](docs/configuration_zh.md)**

---

## 常见问题

<details>
<summary><b>如何不上传文件直接查询？</b></summary>

在 `docker-compose.yml` 中挂载目录：
```yaml
volumes:
  - /你的数据路径:/app/server_mounts
```
然后在 `config/app-config.json` 添加：
```json
"server_data_mounts": [{"label": "我的数据", "path": "/app/server_mounts"}]
```
</details>

<details>
<summary><b>如何修改默认端口？</b></summary>

编辑 `docker-compose.yml`：
```yaml
services:
  backend:
    ports: ["9000:8000"]  # 后端改为 9000
  frontend:
    ports: ["8080:80"]    # 前端改为 8080
```
</details>

---

## 许可证

MIT © [Chenkeliang](https://github.com/Chenkeliang)
