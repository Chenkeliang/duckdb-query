# Interactive Data Query - 交互式数据查询分析平台

一个现代、强大、易于使用的网页版数据查询与分析平台。它允许您连接到多种数据源（如 MySQL），上传本地文件（CSV/Excel），并通过统一的界面进行 SQL 查询、分析和可视化。

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## ✨ 核心功能

- **多种数据源支持**: 无缝连接和查询多种关系型数据库。
- **本地文件查询**: 上传 CSV 或 Excel 文件，使用 DuckDB 引擎进行高性能的 SQL 查询，无需将文件导入数据库。
- **统一 SQL 编辑器**: 为所有数据源提供一致、智能的 SQL 编辑和执行体验。
- **数据可视化**: 对查询结果快速生成图表，直观地洞察数据。
- **查询历史**: 自动保存您的查询记录，方便回溯和复用。
- **大文件上传**: 支持分片上传，轻松处理 GB 级的大文件。
- **结果导出**: 将查询结果导出为 CSV 或 Excel 文件。
- **容器化部署**: 使用 Docker Compose，实现简单、快速的一键部署。

## 🛠️ 技术栈

- **后端**: Python / FastAPI / DuckDB / SQLAlchemy
- **前端**: React / Vite / Ant Design / Tailwind CSS
- **容器化**: Docker / Docker Compose

## 🚀 快速开始 (用户)

您只需要一台安装了 Docker 和 Docker Compose 的机器，就可以通过以下简单的步骤启动整个平台。

> **提示**: `curl` 在 macOS 和 Linux 上通常是预装的。Windows 用户可能需要使用其他方式下载文件，或安装 `curl`。

```bash
# 1. 创建并进入新目录
mkdir my-data-query-app && cd my-data-query-app

# 2. 下载 docker-compose.yml 部署文件
# 注意: 请将下面的 URL 替换为您自己的 GitHub 仓库地址
curl -o docker-compose.yml https://raw.githubusercontent.com/graychenk/interactive-data-query/main/deployment/docker-compose.yml

# 3. 创建配置目录和示例文件
mkdir -p config
curl -o config/app-config.json https://raw.githubusercontent.com/graychenk/interactive-data-query/main/deployment/config/app-config.json
curl -o config/datasources.json https://raw.githubusercontent.com/graychenk/interactive-data-query/main/deployment/config/datasources.json.example

echo "配置已下载。如果需要，请修改 config/datasources.json 文件来配置您自己的数据源。"

# 4. 创建用于持久化数据和导出的目录
mkdir data

# 5. 启动服务
docker compose up -d

# 6. 完成!
echo "应用已启动！请在浏览器中打开 http://localhost:3000"
echo "使用 'docker compose logs -f' 命令可以查看实时日志。"
```

## 👨‍💻 开发者指南

如果您想参与开发、修改代码或从源码构建，请按照以下步骤操作。

1.  **克隆仓库**
    ```bash
    git clone https://github.com/graychenk/interactive-data-query.git
    cd interactive-data-query
    ```

2.  **配置 (可选)**
    您可以根据需要修改 `config/` 目录下的配置文件。

3.  **使用 Docker Compose 构建并启动**
    项目根目录下的 `docker-compose.yml` 文件是为开发环境设计的，它会从本地源码构建镜像。
    ```bash
    docker compose up --build -d
    ```

4.  **访问应用**
    - 前端: `http://localhost:3000`
    - 后端 API 文档: `http://localhost:8000/docs`

## ⚙️ 配置

- `config/app-config.json`: 应用的核心配置文件，用于设置 CORS、文件上传大小限制等。
- `config/datasources.json`: 在这里定义您的数据库连接和预设的数据源查询。
- `config/mysql-configs.json`: (如果使用) 专门用于存储 MySQL 的连接凭据。

## 📄 授权许可

本项目采用 [MIT License](https://opensource.org/licenses/MIT) 授权。