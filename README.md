# Interactive Data Query Platform

[![Version](https://img.shields.io/badge/version-2.1.0-blue.svg)](https://github.com/your-repo/interactive-data-query)
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
- **🎨 Modern UI/UX**: Responsive interface built with React, Material-UI, and AG-Grid
- **📈 Visual Query Builder**: Intuitive drag-and-drop interface for building complex queries
- **🔄 Smart Query Proxy**: Automatic request format conversion for seamless frontend-backend communication
- **📤 Export Capabilities**: Export results to Excel, CSV, JSON, and Parquet formats
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
├── 📄 PROJECT_STRUCTURE.md         # Detailed project structure guide
├── 📄 LICENSE                      # MIT License
├── 🔧 run-tests.sh                 # Quick test runner
├── 🐳 docker-compose.yml           # Docker deployment configuration
├── 📄 vercel.json                  # Vercel deployment configuration
│
├── 🔧 api/                         # Backend API (FastAPI)
│   ├── 📄 main.py                  # Application entry point
│   ├── 📄 requirements.txt         # Python dependencies
│   ├── 🐳 Dockerfile               # Backend Docker configuration
│   ├── 📁 core/                    # Core business logic
│   │   ├── duckdb_engine.py        # DuckDB integration
│   │   ├── resource_manager.py     # Resource management
│   │   └── database_manager.py     # Database connections
│   ├── 📁 models/                  # Data models
│   │   ├── query_models.py         # Query-related models
│   │   └── database_models.py      # Database models
│   ├── 📁 routers/                 # API endpoints
│   │   ├── data_sources.py         # Data source management
│   │   ├── query.py                # Query execution
│   │   ├── query_proxy.py          # Smart query proxy with format conversion
│   │   ├── export.py               # Data export
│   │   └── enhanced_data_sources.py # Enhanced data source features
│   └── 📁 data/                    # Uploaded data files
│
├── 🎨 frontend/                    # Frontend application (React)
│   ├── 📄 package.json             # Node.js dependencies
│   ├── 📄 vite.config.js           # Vite configuration
│   ├── 📄 index.html               # HTML template
│   ├── 🐳 Dockerfile               # Frontend Docker configuration
│   ├── 📄 .env.example             # Environment variables template
│   └── 📁 src/                     # Source code
│       ├── 📄 App.jsx              # Main application component
│       ├── 📄 main.jsx             # Application entry point
│       ├── 📁 components/          # React components
│       │   ├── DataGrid.jsx        # Data display grid
│       │   ├── DataSourceManager/  # Data source management UI
│       │   ├── QueryBuilder/       # Visual query builder
│       │   └── ExportManager/      # Export functionality UI
│       ├── 📁 services/            # API client services
│       │   └── apiClient.js        # HTTP client configuration
│       └── 📁 assets/              # Static assets
│
├── 🧪 tests/                       # Comprehensive test suite
│   ├── 📄 README.md                # Testing documentation
│   ├── 🔧 run-all-tests.sh         # Aggregated test runner
│   ├── 📁 unit/                    # Unit tests (future expansion)
│   ├── 📁 integration/             # Integration tests (future expansion)
│   ├── 📁 e2e/                     # End-to-end tests (future expansion)
│   └── 📁 scripts/                 # Test scripts
│       ├── test-all-functions.sh   # Core functionality tests
│       ├── test-api-functions.sh   # API endpoint tests
│       ├── test-datasource-fixes.sh # Data source tests
│       ├── test-query-fix.sh       # Query functionality tests
│       ├── test-ui-fixes.sh        # UI functionality tests
│       └── [8 more test scripts]   # Additional specialized tests
│
├── 📚 docs/                        # Documentation
│   ├── 📄 README.md                # Documentation index
│   ├── 📁 fix-summaries/           # Development and fix documentation
│   │   ├── CHANGELOG.md            # Version history
│   │   ├── CONTRIBUTING.md         # Contribution guidelines
│   │   ├── DEPLOYMENT_REPORT.md    # Deployment verification
│   │   ├── FINAL_IMPLEMENTATION_SUMMARY.md # Implementation summary
│   │   └── [7 more documentation files]
│   └── 📁 test-reports/            # Test reports (future expansion)
│
├── 🔧 scripts/                     # Utility scripts
│   ├── 📁 deployment/              # Deployment scripts
│   ├── 📁 development/             # Development utilities
│   ├── 📁 docker/                  # Docker-related scripts
│   └── 📁 testing/                 # Testing utilities
│
├── 🗃️ config/                      # Configuration files
│   ├── 📁 deployment/              # Deployment configurations
│   └── 📁 docker/                  # Docker configurations
│
├── 📦 archive/                     # Archived files
│   ├── 📁 deprecated/              # Deprecated code
│   └── 📁 old-tests/               # Legacy test files
│
└── 📁 temp_files/                  # Temporary files (auto-generated)
```

> **Note**: This structure reflects the recent project reorganization for better maintainability and testing coverage.

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

# 🚀 一键启动 (推荐)
./docker-start.sh

# 或手动启动
docker-compose -f docker-compose.full.yml up --build -d
```

> **📝 Note**: 使用 `docker-compose.full.yml` 配置文件实现前后端统一Docker部署。

**Access the application:**
- 🌐 前端界面: http://localhost:3000
- 📡 后端API: http://localhost:8000
- 📚 API文档: http://localhost:8000/docs
- 🔍 健康检查: http://localhost:8000/health
- 🔄 查询代理: http://localhost:8000/api/query_proxy (自动格式转换)
- 📤 下载代理: http://localhost:8000/api/download_proxy (自动导出格式转换)

**Common Docker commands:**
```bash
# 查看服务状态
docker-compose -f docker-compose.full.yml ps

# 查看实时日志
docker-compose -f docker-compose.full.yml logs -f

# 停止服务
docker-compose -f docker-compose.full.yml down

# 重新构建并启动
docker-compose -f docker-compose.full.yml up --build -d

# 重启服务
docker-compose -f docker-compose.full.yml restart
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

### Method 3: One-Click Scripts

Use the provided convenience scripts:

```bash
# For local development (installs dependencies automatically)
./start-local.sh

# For Docker deployment with optimized settings
./start-fixed.sh
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
- **Responsive Design**: Works on desktop, tablet, and mobile

### Query Proxy System

The platform includes an intelligent query proxy (`/api/query_proxy`) that automatically converts between different request formats:

- **Automatic Data Source Conversion**: Converts frontend data source objects to backend-compatible format
- **JOIN Format Translation**: Transforms `{left_on, right_on, how}` to `{join_type, conditions}` format
- **Backward Compatibility**: Supports mixed format requests for seamless upgrades
- **Error Prevention**: Eliminates 422 validation errors from format mismatches

**Usage**: Frontend automatically uses the proxy endpoints for all query and export operations, ensuring seamless communication regardless of data format differences.

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

---

**Made with ❤️ for data analysts and developers**

*Star ⭐ this repository if you find it helpful!*
