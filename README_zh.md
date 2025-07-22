# 交互式数据查询平台

[![版本](https://img.shields.io/badge/版本-2.1.0-blue.svg)](https://github.com/your-repo/interactive-data-query)
[![许可证](https://img.shields.io/badge/许可证-MIT-green.svg)](./LICENSE)
[![Python](https://img.shields.io/badge/python-3.9+-blue.svg)](https://www.python.org/)
[![React](https://img.shields.io/badge/react-18.2+-blue.svg)](https://reactjs.org/)

[English Documentation](./README.md) | [项目文档](./docs/) | [贡献指南](./docs/fix-summaries/CONTRIBUTING.md)

一个功能强大的现代化Web数据分析平台，专为交互式数据分析和多源数据关联而设计。无缝查询和分析来自各种数据源的数据，包括CSV文件、Excel表格和数据库（MySQL、PostgreSQL），采用高性能的DuckDB引擎。

## ✨ 核心功能特性

- **🔗 多源数据关联**: 支持跨不同数据源（文件+数据库）的高级JOIN操作，完整支持多表JOIN
- **📊 多种数据格式**: 支持CSV、Excel (.xlsx/.xls)、JSON、Parquet和PDF文件
- **🗄️ 数据库集成**: 原生支持MySQL、PostgreSQL和SQLite，具备连接池管理
- **⚡ 高性能引擎**: 基于DuckDB的闪电般快速分析查询
- **🎨 现代化界面**: 使用React、Material-UI和AG-Grid构建的响应式界面
- **📈 可视化查询构建器**: 直观的拖拽式界面，用于构建复杂查询
- **📤 导出功能**: 支持导出到Excel、CSV、JSON和Parquet格式
- **🧪 全面测试**: 完整的测试套件，覆盖率达80%+，自动化测试
- **🐳 便捷部署**: 多种部署选项，包括Docker、Vercel和自托管

## 🛠️ 技术架构

| 分类              | 技术栈                                   | 版本       |
| ----------------- | ---------------------------------------- | ---------- |
| **后端框架**      | FastAPI (Python)                        | 最新版     |
| **数据引擎**      | DuckDB                                   | 最新版     |
| **数据处理**      | Pandas, SQLAlchemy                      | 最新版     |
| **前端框架**      | React with Vite                         | 18.2+      |
| **UI框架**        | Material-UI (MUI), AG-Grid              | 5.14+      |
| **数据库支持**    | MySQL, PostgreSQL, SQLite               | 多版本     |
| **部署方式**      | Docker, Vercel, Cloudflare Pages        | -          |
| **测试覆盖**      | 综合测试套件                             | 80%+ 覆盖率 |

## 📁 项目结构

```
interactive-data-query/
├── 📄 README.md                    # 项目文档（英文）
├── 📄 README_zh.md                 # 项目文档（中文）
├── 📄 PROJECT_STRUCTURE.md         # 详细项目结构指南
├── 📄 LICENSE                      # MIT许可证
├── 🔧 run-tests.sh                 # 快速测试运行器
├── 🔧 config/                      # 配置文件目录
│   └── 📁 docker/                  # Docker配置
│       └── 🐳 docker-compose.yml   # Docker部署配置
│
├── 🔧 api/                         # 后端API (FastAPI)
│   ├── 📄 main.py                  # 应用程序入口
│   ├── 📄 requirements.txt         # Python依赖
│   ├── 📁 core/                    # 核心业务逻辑
│   ├── 📁 models/                  # 数据模型
│   ├── 📁 routers/                 # API端点
│   └── 📁 data/                    # 上传的数据文件
│
├── 🎨 frontend/                    # 前端应用 (React)
│   ├── 📄 package.json             # Node.js依赖
│   ├── 📄 vite.config.js           # Vite配置
│   └── 📁 src/                     # 源代码
│       ├── 📁 components/          # React组件
│       ├── 📁 services/            # API客户端服务
│       └── 📁 assets/              # 静态资源
│
├── 🧪 tests/                       # 综合测试套件
│   ├── 🔧 run-all-tests.sh         # 聚合测试运行器
│   └── 📁 scripts/                 # 测试脚本
│       ├── test-all-functions.sh   # 核心功能测试
│       ├── test-api-functions.sh   # API端点测试
│       └── [8个专业测试脚本]        # 其他专业测试
│
├── 📚 docs/                        # 文档
│   └── 📁 fix-summaries/           # 开发和修复文档
│       ├── CHANGELOG.md            # 版本历史
│       ├── CONTRIBUTING.md         # 贡献指南
│       └── [更多文档文件]           # 其他文档
│
└── 🔧 scripts/                     # 实用脚本
    ├── 📁 deployment/              # 部署脚本
    ├── 📁 development/             # 开发工具
    └── 📁 testing/                 # 测试工具
```

## 🚀 快速开始

### 环境要求

- [Node.js](https://nodejs.org/) (v18 或更高版本)
- [Python](https://www.python.org/) (v3.9 或更高版本)
- [Docker](https://www.docker.com/) (可选，用于容器化部署)

### 方式一：Docker部署（推荐）

最快速、最可靠的启动方式：

```bash
# 克隆仓库
git clone <repository-url>
cd interactive-data-query

# 使用Docker Compose启动（指定配置文件路径）
docker-compose -f config/docker/docker-compose.yml up --build -d
```

> **📝 注意**：Docker 配置文件位于 `config/docker/` 目录中，这样可以更好地组织项目结构。

**访问应用：**
- 前端界面：http://localhost:3000
- 后端API：http://localhost:8000
- API文档：http://localhost:8000/docs
- 健康检查：http://localhost:8000/health

**常用 Docker 命令：**
```bash
# 查看服务状态
docker-compose -f config/docker/docker-compose.yml ps

# 查看实时日志
docker-compose -f config/docker/docker-compose.yml logs -f

# 停止服务
docker-compose -f config/docker/docker-compose.yml down

# 重新构建并启动
docker-compose -f config/docker/docker-compose.yml up --build -d
```

### 方式二：本地开发环境

适用于开发和定制：

```bash
# 克隆仓库
git clone <repository-url>
cd interactive-data-query

# 启动后端
cd api
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8000

# 新开终端，启动前端
cd frontend
npm install
npm run dev
```

### 方式三：一键启动脚本

使用提供的便捷脚本：

```bash
# 本地开发（自动安装依赖）
./start-local.sh

# Docker部署（优化设置）
./start-fixed.sh
```

## 🧪 测试系统

本项目包含全面的测试框架，测试覆盖率达80%+。

### 运行所有测试

```bash
# 快速测试运行器（推荐）
./run-tests.sh

# 综合测试套件
./tests/run-all-tests.sh
```

### 测试分类

- **核心功能测试**：基本功能和API端点
- **数据源测试**：文件上传、数据库连接、数据预览
- **查询测试**：JOIN操作、SQL执行、结果验证
- **UI测试**：前端组件、用户交互、响应式设计
- **集成测试**：端到端工作流和数据处理

### 测试结果

当前测试状态：
- **测试脚本总数**：10个
- **通过测试**：8个（80%成功率）
- **测试覆盖**：核心功能、API端点、UI组件

## 💡 使用示例

### 基本数据分析工作流

1. **上传数据源**
   - 上传CSV/Excel文件或连接数据库
   - 预览数据并验证模式检测

2. **构建查询**
   - 使用可视化查询构建器创建JOIN操作
   - 执行前预览SQL查询

3. **分析结果**
   - 在交互式数据网格中查看结果
   - 排序、筛选和探索数据

4. **导出结果**
   - 导出为Excel、CSV、JSON或Parquet格式
   - 下载进行进一步分析

### 高级功能

- **多表关联**：组合来自3个以上数据源的数据
- **数据库集成**：查询实时生产数据库
- **性能优化**：利用DuckDB的分析引擎
- **响应式设计**：支持桌面、平板和移动设备

## 🚀 部署指南

### 云平台部署

#### Vercel（推荐用于前端）
```bash
# 将GitHub仓库连接到Vercel
# vercel.json配置处理自动部署
```

#### Cloudflare Pages
```bash
# 构建设置：
# 构建命令：npm run build（在frontend目录中）
# 输出目录：frontend/dist
# 后端单独部署为Cloudflare Worker
```

### 自托管部署

#### Docker生产环境设置
```bash
# 生产部署
docker-compose -f config/docker/docker-compose.yml up -d

# 使用自定义环境
cp frontend/.env.example frontend/.env.production
# 根据需要编辑环境变量
docker-compose -f config/docker/docker-compose.yml up --build -d

# 查看服务状态
docker-compose -f config/docker/docker-compose.yml ps

# 查看服务日志
docker-compose -f config/docker/docker-compose.yml logs -f
```

## 📚 文档资源

- **API文档**：http://localhost:8000/docs（运行时）
- **项目文档**：[./docs/README.md](./docs/README.md)
- **贡献指南**：[./docs/fix-summaries/CONTRIBUTING.md](./docs/fix-summaries/CONTRIBUTING.md)
- **部署指南**：[./docs/fix-summaries/DEPLOYMENT_REPORT.md](./docs/fix-summaries/DEPLOYMENT_REPORT.md)
- **更新日志**：[./docs/fix-summaries/CHANGELOG.md](./docs/fix-summaries/CHANGELOG.md)

## 🤝 参与贡献

我们欢迎贡献！请查看我们的[贡献指南](./docs/fix-summaries/CONTRIBUTING.md)了解详情。

### 开发环境设置

1. Fork仓库
2. 创建功能分支
3. 进行更改
4. 运行测试套件：`./run-tests.sh`
5. 提交Pull Request

## 📄 许可证

本项目采用MIT许可证 - 详见[LICENSE](./LICENSE)文件。

## 🙏 致谢

- **DuckDB团队** - 提供了出色的分析数据库引擎
- **FastAPI** - 现代化的Python Web框架
- **React团队** - 优秀的前端框架
- **Material-UI** - 美观的UI组件
- **AG-Grid** - 强大的数据网格组件

---

**用❤️为数据分析师和开发者打造**

*如果这个项目对您有帮助，请给个⭐Star！*
