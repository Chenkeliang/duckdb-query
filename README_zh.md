# Interactive Data Query - 新一代交互式数据查询分析平台

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**Interactive Data Query** 是一个为解决临时、复杂数据分析需求而设计的现代网页平台。它以 DuckDB 为核心，赋予用户直接在浏览器中对多种来源的数据执行高性能 SQL 查询的能力，旨在打造零ETL、零数据导入的极致分析体验。

## 1. 功能使用说明

平台的核心设计哲学是“万物皆可查”。无论是本地文件、远程服务器上的文件，还是已有的数据库，都可以被轻松地加载到查询引擎中，像操作普通数据表一样进行关联分析。

### 1.1 基于 DuckDB 的大数据分析

平台内置了强大的 DuckDB 分析引擎，让您无需依赖任何外部数据库即可处理大型数据集。

- **支持多种数据源**: 您可以直接上传 **CSV**、**Parquet**、**Excel** 文件，或直接在页面上**粘贴**类表格数据（如 TSV）。平台会自动将这些数据加载为 DuckDB 中的表。
- **高性能查询**: 所有加载的数据均由 DuckDB 在后台处理，即使是数 GB 大小的文件，也能实现亚秒级的复杂查询和聚合。
- **完整的 DuckDB SQL 语法**: 您可以利用 DuckDB 丰富的 SQL 方言，包括窗口函数、复杂数据类型、统计函数等高级功能。

### 1.2 跨源数据关联 (JOIN)

本平台最大的特色之一是能够轻松解决跨库、跨数据源的关联查询问题。

- **实现机制**: 您可以将来自不同来源的数据（例如，一个来自 MySQL 的查询结果，一个上传的 CSV 文件，一个来自远程 URL 的 Parquet 文件）全部加载到 DuckDB 中。一旦加载完成，它们就都变成了 DuckDB 环境下的普通表。
- **统一查询**: 您可以在 SQL 编辑器中，使用标准的 `LEFT JOIN`, `RIGHT JOIN`, `INNER JOIN`, `FULL JOIN` 等语法，将这些来自五湖四海的表进行任意的关联查询，就像它们本来就在同一个数据库中一样。

### 1.3 将远程文件作为数据源

除了上传本地文件，您还可以直接将一个可公开访问的 URL 作为数据源。

- **用法**: 只需提供文件的 URL，平台会自动下载文件内容，推断其格式（CSV, Parquet, JSON 等），并将其加载为一张可查询的表。
- **GitHub 支持**: 系统能智能识别 GitHub 的 `blob` 链接，并自动转换为可供下载的 `raw` 链接。

### 1.4 连接远程数据库

平台同样支持连接到您已有的远程数据库（如 MySQL、PostgreSQL 等），并将其作为数据分析的一部分。

- **数据加载**: 您可以执行一条 SQL 查询从远程数据库中拉取所需的数据子集。
- **融入 DuckDB**: 拉取的数据可以被无缝地加载为 DuckDB 中的一张新表，从而可以与其它任何来源的数据进行关联分析。

## 2. 快速启动和使用方式

您只需要一台安装了 Docker 和 Docker Compose 的机器，就可以通过以下简单的步骤启动整个平台。

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

# 4. 创建数据目录
mkdir data

# 5. 启动服务
docker compose up -d

# 6. 完成!
echo "应用已启动！请在浏览器中打开 http://localhost:3000"
```

## 3. 安全性

我们高度重视您的数据安全和隐私。

- **无需登录**: 平台开箱即用，无需注册或登录，不收集任何用户信息。
- **无数据存储**: 您的数据（无论是上传的文件还是数据库连接配置）仅由您自己通过 Docker 的 volume 功能管理。除了您明确指定的本地目录，我们的服务器不会存储您的任何业务数据或文件。
- **纯内存处理**: 所有的数据查询和计算都在容器的内存中进行，操作完成后即释放，确保了数据的临时性和安全性。

## 4. 开源

本项目是一个完全开源的项目，采用 [MIT License](https://opensource.org/licenses/MIT) 授权。我们欢迎任何形式的贡献，无论是代码提交、功能建议还是问题反馈。

如果您觉得这个项目对您有帮助，请在 GitHub 上给我们一个 Star！