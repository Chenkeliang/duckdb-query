# Interactive Data Query Platform

[![Version](https://img.shields.io/badge/version-2.2.0-blue.svg)](https://github.com/your-repo/interactive-data-query)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](./LICENSE)
[![Python](https://img.shields.io/badge/python-3.9+-blue.svg)](https://www.python.org/)
[![React](https://img.shields.io/badge/react-18.2+-blue.svg)](https://reactjs.org/)

[中文文档](./README_zh.md) | [Documentation](./docs/) | [Contributing](./docs/fix-summaries/CONTRIBUTING.md)

A powerful, modern web-based platform for interactive data analysis and multi-source data joining. Seamlessly query and analyze data from various sources including CSV files, Excel spreadsheets, and databases (MySQL, PostgreSQL) using the high-performance DuckDB engine.

## ✨ Core Features

- **🔗 Multi-Source Data Joining**: Advanced JOIN operations across different data sources (files + databases)
- **📊 Multiple Data Formats**: Support for CSV, Excel (.xlsx/.xls), JSON, Parquet, and PDF files
- **🗄️ Database Integration**: Native support for MySQL, PostgreSQL, and SQLite with connection pooling
- **⚡ High-Performance Engine**: Powered by DuckDB for lightning-fast analytical queries
- **💾 Data Persistence**: Full data persistence with automatic recovery after restarts
- **🎨 Modern UI/UX**: Responsive interface built with React, Material-UI, and AG-Grid
- **📈 Visual Query Builder**: Intuitive drag-and-drop interface for building complex queries
- **🔄 Smart Query Proxy**: Automatic request format conversion for seamless frontend-backend communication
- **🔄 Auto Data Source Refresh**: Real-time data source list updates without manual page refresh
- **📤 Export Capabilities**: Export results to Excel, CSV, JSON, and Parquet formats
- **🔔 Toast Notification System**: Comprehensive user feedback with success/error notifications for all operations
- **🧪 Comprehensive Testing**: Full test suite with 80%+ coverage and automated testing
- **🐳 Easy Deployment**: Multiple deployment options including Docker, Vercel, and self-hosted

## 🛠️ Tech Stack

| Category          | Technology                               | Version    |
| ----------------- | ---------------------------------------- | ---------- |
| **Backend**       | FastAPI (Python)                        | Latest     |
| **Data Engine**   | DuckDB                                   | Latest     |
| **Data Processing** | Pandas, SQLAlchemy                     | Latest     |
| **Frontend**      | React with Vite                         | 18.2+      |
| **UI Framework**  | Material-UI (MUI), AG-Grid              | 5.14+      |
| **Database**      | MySQL, PostgreSQL, SQLite               | Multiple   |
| **Deployment**    | Docker, Vercel, Cloudflare Pages        | -          |
| **Testing**       | Comprehensive test suite                 | 80%+ coverage |

## 📁 Project Structure

```
interactive-data-query/
├── 📄 README.md                    # Project documentation (English)
├── 📄 README_zh.md                 # Project documentation (Chinese)
├── 📄 LICENSE                      # MIT License
├── 🐳 docker-compose.yml           # Docker deployment configuration
├── 🔧 .gitignore                   # Git ignore rules
│
├── 🖥️ api/                         # Backend API (FastAPI)
│   ├── 🐳 Dockerfile               # Backend Docker configuration
│   ├── 📄 requirements.txt         # Python dependencies
│   ├── 🚀 main.py                  # FastAPI application entry point
│   ├── 📁 core/                    # Core business logic
│   │   ├── database_manager.py     # Database connection management
│   │   ├── duckdb_engine.py        # DuckDB query engine
│   │   ├── file_datasource_manager.py # File data source handling
│   │   └── resource_manager.py     # Resource management utilities
│   ├── 📁 models/                  # Pydantic data models
│   │   └── query_models.py         # Query request/response models
│   ├── 📁 routers/                 # API route handlers
│   │   ├── data_sources.py         # Data source management endpoints
│   │   ├── mysql_datasource_manager.py # MySQL connection management
│   │   ├── mysql_query.py          # MySQL query execution
│   │   ├── paste_data.py           # Data paste board functionality
│   │   ├── query.py                # General query endpoints
│   │   └── query_proxy.py          # Query proxy for format conversion
│   ├── 📁 utils/                   # Utility functions
│   └── 📁 exports/                 # Export file storage
│
├── 🎨 frontend/                    # Frontend React Application
│   ├── 🐳 Dockerfile               # Frontend Docker configuration
│   ├── 📄 package.json             # Node.js dependencies
│   ├── ⚙️ vite.config.js           # Vite build configuration
│   └── 📁 src/                     # React source code
│       ├── 🚀 main.jsx             # Application entry point
│       ├── 📱 ModernApp.jsx        # Main application component
│       ├── 📁 components/          # Reusable React components
│       │   ├── DataSourceManager/  # Data source management UI
│       │   ├── QueryInterface/     # Query building interface
│       │   ├── ResultsDisplay/     # Results visualization
│       │   └── common/             # Common UI components
│       ├── 📁 services/            # API service layer
│       ├── 📁 styles/              # CSS and styling
│       └── 📁 theme/               # Material-UI theme configuration
│
├── ⚙️ config/                      # Configuration files
│   ├── 📄 mysql-configs.json.example # MySQL configuration template
│   ├── 📄 datasources.json.example # Data source configuration template
│   └── 📁 deployment/              # Deployment configurations
│
├── 💾 data/                        # Data storage
│   ├── 📁 duckdb/                  # DuckDB database files
│   ├── 📄 duckdb_data.db           # Main DuckDB database
│   ├── 📄 file_datasources.json    # File data source registry
│   └── 📁 uploads/                 # Uploaded file storage
│
├── 🔧 scripts/                     # Utility scripts
│   ├── 🐳 docker-dev.sh            # Development Docker setup
│   ├── 🐳 docker-start.sh          # Production Docker startup
│   └── 🔧 debug-backend.sh         # Backend debugging utilities
│
├── 📚 docs/                        # Documentation
│   ├── 📄 README.md                # Documentation index
│   ├── 📄 api-documentation.md     # API documentation
│   ├── 📄 deployment-guide.md      # Deployment instructions
│   └── 📁 fix-summaries/           # Development fix summaries
│
└── 🧪 tests/                       # Test suites
    ├── 📁 backend/                 # Backend API tests
    ├── 📁 frontend/                # Frontend component tests
    ├── 📁 e2e/                     # End-to-end tests
    └── 📄 run-all-tests.sh         # Test runner script
```

```

> **Note**: This structure reflects the clean, organized architecture for better maintainability and development experience.

## 🚀 Quick Start

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or later)
- [Python](https://www.python.org/) (v3.9 or later)
- [Docker](https://www.docker.com/) (optional, for containerized setup)

### Method 1: Docker Deployment (Recommended)

The fastest and most reliable way to get started:

```bash
# Clone the repository
git clone <repository-url>
cd interactive-data-query

# 🚀 One-click startup (Recommended)
docker-compose up --build -d

# Or use the startup script
./scripts/docker-start.sh
```

**Access the application:**
- 🌐 Frontend Interface: http://localhost:3000
- 📡 Backend API: http://localhost:8000
- 📚 API Documentation: http://localhost:8000/docs
- 🔍 Health Check: http://localhost:8000/health
- 🔄 Query Proxy: http://localhost:8000/api/query_proxy
- 📤 Download Proxy: http://localhost:8000/api/download_proxy

**Common Docker commands:**
```bash
# View service status
docker-compose ps

# View real-time logs
docker-compose logs -f

# Stop services
docker-compose down

# Rebuild and start
docker-compose up --build -d

# Restart services
docker-compose restart
```

### Method 2: Local Development Setup

For development and customization:

```bash
# Clone the repository
git clone <repository-url>
cd interactive-data-query

# Start backend
cd api
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8000

# In a new terminal, start frontend
cd frontend
npm install
npm run dev
```

**Access the application:**
- Frontend: http://localhost:5173
- Backend API: http://localhost:8000

## ⚙️ Configuration

### Database Configuration

1. **Copy configuration templates:**
```bash
cp config/mysql-configs.json.example config/mysql-configs.json
cp config/datasources.json.example config/datasources.json
```

2. **Edit MySQL configuration** (`config/mysql-configs.json`):
```json
{
  "connections": [
    {
      "name": "production",
      "host": "localhost",
      "port": 3306,
      "user": "your_username",
      "password": "your_password",
      "database": "your_database"
    }
  ]
}
```

3. **Configure data sources** (`config/datasources.json`):
```json
{
  "file_sources": [],
  "database_sources": []
}
```

### Environment Variables

Create `.env` files for environment-specific settings:

```bash
# Backend (.env in api/ directory)
DATABASE_URL=sqlite:///./data/duckdb_data.db
MYSQL_CONFIG_PATH=../config/mysql-configs.json
UPLOAD_DIR=../data/uploads

# Frontend (.env in frontend/ directory)
VITE_API_BASE_URL=http://localhost:8000
```

## 🧪 Testing

This project includes a comprehensive testing framework with 80%+ test coverage.

### Run All Tests

```bash
# Quick test runner (recommended)
./run-tests.sh

# Comprehensive test suite
./tests/run-all-tests.sh
```

### Test Categories

- **Core Functionality Tests**: Essential features and API endpoints
- **Data Source Tests**: File upload, database connections, data preview
- **Query Tests**: JOIN operations, SQL execution, result validation
- **UI Tests**: Frontend components, user interactions, responsive design
- **Integration Tests**: End-to-end workflows and data processing

### Test Results

Current test status:
- **Total Test Scripts**: 10
- **Passing Tests**: 8 (80% success rate)
- **Test Coverage**: Core functionality, API endpoints, UI components

## 🚀 Deployment

### Cloud Platforms

#### Vercel (Recommended for Frontend)
```bash
# Connect your GitHub repository to Vercel
# The vercel.json configuration handles automatic deployment
```

#### Cloudflare Pages
```bash
# Build settings:
# Build command: npm run build (in frontend directory)
# Output directory: frontend/dist
# Deploy backend separately as Cloudflare Worker
```

#### Railway/Render (Full-Stack)
```bash
# Deploy both frontend and backend together
# Use the provided Docker configuration
```

### Self-Hosted Deployment

#### Docker Production Setup
```bash
# Production deployment
docker-compose -f config/docker/docker-compose.yml up -d

# With custom environment
cp frontend/.env.example frontend/.env.production
# Edit environment variables as needed
docker-compose -f config/docker/docker-compose.yml up --build -d

# Check service status
docker-compose -f config/docker/docker-compose.yml ps

# View service logs
docker-compose -f config/docker/docker-compose.yml logs -f
```

#### Traditional Server Setup
```bash
# Backend (Python/FastAPI)
cd api
pip install -r requirements.txt
gunicorn main:app --workers 4 --worker-class uvicorn.workers.UvicornWorker

# Frontend (React/Vite)
cd frontend
npm install
npm run build
# Serve the dist/ directory with nginx or apache
```

### Environment Configuration

Create environment files:
```bash
# Frontend environment
cp frontend/.env.example frontend/.env.production

# Backend environment (if needed)
export DATABASE_URL="your-database-connection-string"
export CORS_ORIGINS="https://your-frontend-domain.com"
```

## 💡 Usage Examples

### Basic Data Analysis Workflow

1. **Upload Data Sources**
   - Upload CSV/Excel files or connect to databases
   - Preview data and verify schema detection

2. **Build Queries**
   - Use the visual query builder to create JOIN operations
   - Preview SQL queries before execution

3. **Analyze Results**
   - View results in the interactive data grid
   - Sort, filter, and explore your data

4. **Export Results**
   - Export to Excel, CSV, JSON, or Parquet formats
   - Download for further analysis

### Advanced Features

- **Multi-table JOINs**: Combine data from 3+ sources
- **Database Integration**: Query live production databases
- **Performance Optimization**: Leverage DuckDB's analytical engine
- **Smart Query Proxy**: Automatic format conversion between frontend and backend
- **Auto Data Source Refresh**: Real-time updates when data sources are added, modified, or deleted
- **Responsive Design**: Works on desktop, tablet, and mobile

### Query Proxy System

The platform includes an intelligent query proxy (`/api/query_proxy`) that automatically converts between different request formats:

- **Automatic Data Source Conversion**: Converts frontend data source objects to backend-compatible format
- **JOIN Format Translation**: Transforms `{left_on, right_on, how}` to `{join_type, conditions}` format
- **Backward Compatibility**: Supports mixed format requests for seamless upgrades
- **Error Prevention**: Eliminates 422 validation errors from format mismatches

**Usage**: Frontend automatically uses the proxy endpoints for all query and export operations, ensuring seamless communication regardless of data format differences.

### Data Persistence

The platform now features complete data persistence with automatic recovery capabilities:

- **Persistent Storage**: All data sources (files, MySQL queries, database connections) are stored persistently using DuckDB's file-based storage
- **Automatic Recovery**: After service restarts, all data sources are automatically reloaded and available immediately
- **No Data Loss**: File uploads, MySQL query results, and database connections persist across restarts
- **Smart Reloading**: MySQL data sources are re-executed from their original SQL queries to ensure data freshness

**Key Benefits**:
- ✅ No need to re-upload files after restarts
- ✅ MySQL data sources automatically restored
- ✅ Database connections maintained
- ✅ Query history and results preserved
- ✅ Zero downtime data recovery

**Technical Implementation**:
- Uses `CREATE TABLE` instead of temporary `register()` for true persistence
- Startup process automatically reloads all configured data sources
- Configuration files (`mysql_datasources.json`, `file_datasources.json`) track data source metadata
- DuckDB file storage ensures data survives container restarts

### Auto Data Source Refresh

The platform features intelligent real-time data source management that eliminates the need for manual page refreshes:

- **Real-time Updates**: Data source lists automatically update when sources are added, modified, or deleted
- **Cross-Component Sync**: Changes in one page (e.g., deleting a DuckDB table) immediately reflect in query pages
- **Smart State Management**: Global state management ensures consistent data source visibility across all components
- **No Manual Refresh**: Users never need to manually refresh the browser to see updated data sources

**Key Benefits**:
- ✅ Delete DuckDB tables and see immediate updates in query builder
- ✅ Upload files and instantly access them in data source selectors
- ✅ Remove files and see real-time removal from available sources
- ✅ Save SQL query results as tables with automatic data source registration
- ✅ Seamless user experience without page refreshes

**Technical Implementation**:
- Global refresh trigger system using React state management
- Callback-based communication between components
- Automatic data source list updates after CRUD operations
- Comprehensive test coverage for all refresh scenarios

### Export System

The platform includes intelligent export capabilities with automatic format handling:

- **Download Proxy**: `/api/download_proxy` endpoint automatically converts request formats for Excel/CSV exports
- **Column Name Handling**: Multi-table JOINs use A_1, A_2, B_1, B_2 aliases to avoid Chinese column name conflicts
- **Format Support**: Exports maintain the same column naming convention as query results
- **Error Prevention**: Eliminates 422 validation errors from export format mismatches

**Export Features**:
- Excel (.xlsx) and CSV export with proper encoding
- Preserves A_1, B_1 alias format for multi-table results
- Automatic request format conversion
- Support for large dataset exports

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](./docs/fix-summaries/CONTRIBUTING.md) for details.

### Development Setup

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run the test suite: `./run-tests.sh`
5. Submit a pull request

### Reporting Issues

- Use GitHub Issues for bug reports and feature requests
- Include detailed reproduction steps
- Provide system information and error logs

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](./LICENSE) file for details.

## 🙏 Acknowledgments

- **DuckDB Team** - For the amazing analytical database engine
- **FastAPI** - For the modern Python web framework
- **React Team** - For the excellent frontend framework
- **Material-UI** - For the beautiful UI components
- **AG-Grid** - For the powerful data grid component

## 📞 Support

- **Documentation**: [./docs/](./docs/)
- **Issues**: [GitHub Issues](https://github.com/your-repo/interactive-data-query/issues)
- **Discussions**: [GitHub Discussions](https://github.com/your-repo/interactive-data-query/discussions)

## 📋 版本历史

### v2.3.0 (2025-08-01) - 最新版本 🎉
- **🔔 Toast通知系统**：为所有操作按钮添加完善的成功/失败反馈机制
- **🎨 用户体验大幅提升**：统一的错误处理，中文友好的错误信息
- **📱 响应式通知**：智能Toast堆叠显示，自动隐藏，手动关闭功能
- **🧪 完整测试覆盖**：新增Toast通知系统的自动化测试和文档

### v2.2.0 (2025-07-30)
- **🔧 数据库连接系统重构**：修复MySQL连接参数不一致问题，新增连接测试功能
- **📁 文件上传系统升级**：解决413错误，支持100MB大文件上传
- **🛡️ 安全增强**：修复容器内敏感数据残留，完善清理系统
- **🎨 用户体验提升**：新增测试连接按钮，改进错误处理和表单验证
- **详细说明**：[查看完整发布说明](./RELEASE_NOTES_v2.2.0.md)

### v2.1.0 (2025-07-29)
- 多数据源支持和查询构建器
- 数据粘贴板功能
- Docker容器化部署

### v2.0.0 (2025-07-28)
- 项目架构重构
- 现代化UI设计
- 企业级功能特性

---

**Made with ❤️ for data analysts and developers**

*Star ⭐ this repository if you find it helpful!*
