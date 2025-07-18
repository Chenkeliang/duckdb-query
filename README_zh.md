# 交互式数据查询平台

一个基于Web的交互式工具，用于查询和连接来自不同数据源（如CSV、Excel、以及MySQL、PostgreSQL等数据库）的数据。本项目利用了DuckDB和Pandas的强大能力。

## 核心功能

- **多数据源支持**：可上传本地文件（CSV, Excel, PDF），或连接到实时数据库（MySQL, PostgreSQL）。
- **交互式查询构建器**：通过可视化界面构建跨数据源的复杂JOIN查询。
- **强大的SQL引擎**：使用DuckDB进行高性能的进程内分析查询。
- **数据处理能力**：集成Pandas进行稳健的数据操作和转换。
- **现代化的前端**：基于React和AG-Grid构建的用户友好、响应式界面。
- **便捷的部署方式**：支持一键部署到Vercel、Cloudflare Pages，或使用Docker进行自托管。

## 技术栈

| 类别 | 技术选型 |
| :--- | :--- |
| **后端** | FastAPI (Python) |
| **数据引擎** | DuckDB |
| **数据处理** | Pandas |
| **前端** | React (使用 Vite) |
| **UI组件** | Material-UI (MUI), AG-Grid |
| **部署** | Docker, Vercel, Cloudflare Pages |

## 项目结构

```
/interactive-data-query/
├── .github/
│   └── workflows/
│       └── deploy.yml
├── .gitignore
├── README.md          # 英文文档
├── README_zh.md       # 中文文档
├── docker-compose.yml
├── vercel.json
├── api/               # 后端 (FastAPI)
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── main.py
│   ├── core/
│   │   ├── duckdb_engine.py
│   │   └── resource_manager.py
│   ├── models/
│   │   └── query_models.py
│   └── routers/
│       ├── data_sources.py
│       └── query.py
└── frontend/          # 前端 (React + Vite)
    ├── .env.development
    ├── .env.production
    ├── package.json
    ├── vite.config.js
    ├── index.html
    └── src/
        ├── App.jsx
        ├── main.jsx
        ├── assets/
        ├── components/
        │   ├── DataGrid.jsx
        │   ├── DataSourceManager/
        │   └── QueryBuilder/
        └── services/
            └── apiClient.js
```

## 本地快速启动

### 环境要求

- [Node.js](https://nodejs.org/) (v18 或更高版本)
- [Python](https://www.python.org/) (v3.9 或更高版本)
- [Docker](https://www.docker.com/) (可选, 用于容器化部署)

### 方式一：使用 Python 和 Node.js 直接运行

**1. 启动后端服务**

```bash
cd api
python -m venv venv
# 在 macOS/Linux 上执行:
source venv/bin/activate
# 在 Windows 上执行:
# venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload
```

后端API将在 `http://127.0.0.1:8000` 运行。

**2. 启动前端服务**

```bash
cd frontend
npm install
npm run dev
```

前端开发服务器将在 `http://127.0.0.1:5173` 运行。

### 方式二：使用 Docker 一键启动

这是最简单的启动方式。

```bash
docker-compose up --build
```

应用将可以通过 `http://localhost:5173` 访问。

## 部署指南

### Vercel

本项目已为Vercel部署进行了优化。您只需将您的GitHub仓库连接到Vercel，它将根据`vercel.json`配置文件自动完成构建和部署。

### Cloudflare Pages

1.  将您的GitHub仓库连接到Cloudflare Pages。
2.  构建命令设置为 `npm run build`，并指定工作目录为 `frontend`。
3.  构建输出目录设置为 `frontend/dist`。
4.  对于后端，您需要将 `api` 目录部署为一个Cloudflare Worker。

### GitHub Pages

**重要提示**：GitHub Pages仅支持静态网站，无法直接运行Python后端。

1.  将 `frontend` 目录下的应用部署到GitHub Pages。
2.  将 `api` 后端部署到一个独立的服务平台（如Vercel, Heroku, 或您自己的云服务器）。
3.  在 `frontend/.env.production` 文件中，将 `VITE_API_URL` 的值更新为您线上后端的URL。

### Docker (自托管)

您可以构建生产环境的Docker镜像并在您自己的服务器上运行。

```bash
docker-compose -f docker-compose.yml build
docker-compose -f docker-compose.yml up -d
```

## API 文档

当后端服务运行时，您可以访问 `http://127.0.0.1:8000/docs` 来查看和测试交互式的API文档 (Swagger UI)。
