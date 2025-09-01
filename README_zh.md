# Duck Query - 新一代交互式数据查询分析平台

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

你是否曾为了分析一个临时的 CSV 文件而大费周章地搭建数据库？或者为了关联两个不同来源的数据而头疼不已？

**Duck Query** 就是为您解决这些烦恼而生的！我们打造了一个现代、流畅的网页平台，让您能像喝水一样轻松地查询和分析数据。它的核心是一个强大的 DuckDB 引擎，无论数据来自本地文件、远程链接，还是您的业务数据库，在这里都能被一视同仁，用最简单直接的 SQL 进行探索。

目标是：告别繁琐的 ETL 和数据导入，让数据分析回归本质——快速洞察，自由探索。

## ✨ 核心亮点

### 1. 万物皆可查询
- **本地文件，变身数据表**：无论是 CSV、Parquet 还是 Excel，只需拖拽上传或粘贴，它们就会立刻变成一张张可以查询的数据表。

### 2. 跨源自由关联 (JOIN)
这可能是最酷的功能！您可以将来自 MySQL 的业务数据、一个本地的销售额 CSV、一个远程的 Parquet 文件，在同一个查询里用 `JOIN` 关联起来。帮您抹平了数据来源的差异，您只需专注于分析本身。

### 3. 强大的 SQL 与即时可视化
- **全功能 DuckDB 内核**：享受窗口函数、JSON 解析等现代 SQL 的全部能力。

## 🚀 快速启动和使用方式

您只需要一台安装了 Docker 和 Docker Compose 的机器，就可以通过以下简单的步骤启动整个平台。

> **提示**: `curl` 在 macOS 和 Linux 上通常是预装的。Windows 用户可能需要使用其他方式下载文件，或安装 `curl`。

```bash
# 1. 创建并进入新目录
mkdir my-data-query-app && cd my-data-query-app

# 2. 下载 docker-compose.yml 部署文件
# 注意: 请将下面的 URL 替换为您自己的 GitHub 仓库地址
curl -o docker-compose.yml https://raw.githubusercontent.com/chenkeliang/interactive-data-query/main/deployment/docker-compose.yml

# 3. 创建配置目录和示例文件
mkdir -p config
curl -o config/app-config.json https://raw.githubusercontent.com/chenkeliang/interactive-data-query/main/deployment/config/app-config.json
curl -o config/datasources.json https://raw.githubusercontent.com/chenkeliang/interactive-data-query/main/deployment/config/datasources.json.example

# 4. 创建数据目录
mkdir data

# 5. 启动服务
docker compose up -d

# 6. 完成!
echo "应用已启动！请在浏览器中打开 http://localhost:3000"
```

## 🔒 您的数据，只属于您

- **纯浏览器与内存计算**：我们不设服务器、无需登录、不存储您的任何业务数据。所有的数据处理都在您的浏览器和容器内存中进行。
- **配置由您掌控**：数据库密码等敏感信息，由您通过本地的配置文件管理，永远不会离开您的电脑。

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
- `config/mysql-configs.json`: 专门用于存储 MySQL 的连接凭据(请使用页面进行加载，涉及到密码的加密算法)。
- `config/postgresql-configs.json`: 专门用于存储 PostgreSQL 的连接凭据(请使用页面进行加载，涉及到密码的加密算法)。

## 📄 授权许可

本项目采用 [MIT License](https://opensource.org/licenses/MIT) 授权。

如果您觉得这个项目对您有帮助，请在 GitHub 上给我们一个 Star！
