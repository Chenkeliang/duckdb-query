# Interactive Data Query Platform

A modern, powerful, and easy-to-use web-based platform for data query and analysis. It allows you to connect to multiple data sources (like MySQL), upload local files (CSV/Excel), and perform SQL queries, analysis, and visualizations through a unified interface.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## ✨ Core Features

- **Multiple Data Source Support**: Seamlessly connect to and query various relational databases.
- **Local File Query**: Upload CSV or Excel files and use the DuckDB engine for high-performance SQL queries without importing them into a database.
- **Unified SQL Editor**: A consistent and intelligent SQL editing and execution experience for all data sources.
- **Data Visualization**: Quickly generate charts from query results for intuitive data insights.
- **Query History**: Automatically saves your query history for easy review and reuse.
- **Large File Uploads**: Supports chunked uploads to handle large, GB-sized fileseffortlessly.
- **Export Results**: Export query results to CSV or Excel files.
- **Containerized Deployment**: Simple and fast one-click deployment using Docker Compose.

## 🛠️ Technology Stack

- **Backend**: Python / FastAPI / DuckDB / SQLAlchemy
- **Frontend**: React / Vite / Ant Design / Tailwind CSS
- **Containerization**: Docker / Docker Compose

## 🚀 Quick Start (for Users)

All you need is a machine with Docker and Docker Compose installed to get the entire platform running with these simple steps.

> **Note**: `curl` is usually pre-installed on macOS and Linux. Windows users may need to download the files through other means or install `curl`.

```bash
# 1. Create and enter a new directory
mkdir my-data-query-app && cd my-data-query-app

# 2. Download the docker-compose.yml for deployment
# IMPORTANT: Replace the URL below with the one for your own GitHub repository
curl -o docker-compose.yml https://raw.githubusercontent.com/graychenk/interactive-data-query/main/deployment/docker-compose.yml

# 3. Create the config directory and sample files
mkdir -p config
curl -o config/app-config.json https://raw.githubusercontent.com/graychenk/interactive-data-query/main/deployment/config/app-config.json
curl -o config/datasources.json https://raw.githubusercontent.com/graychenk/interactive-data-query/main/deployment/config/datasources.json.example

echo "Configuration downloaded. Edit config/datasources.json if you need to configure your own data sources."

# 4. Create directories for data persistence and exports
mkdir data

# 5. Start the services
docker compose up -d

# 6. Done!
echo "Application started! Open your browser to http://localhost:3000"
echo "Use 'docker compose logs -f' to see live logs."
```

## 👨‍💻 Guide for Developers

If you want to contribute, modify the code, or build from the source, follow these steps.

1.  **Clone the Repository**
    ```bash
    git clone https://github.com/graychenk/interactive-data-query.git
    cd interactive-data-query
    ```

2.  **Configuration (Optional)**
    You can modify the configuration files in the `config/` directory as needed.

3.  **Build and Start with Docker Compose**
    The `docker-compose.yml` file in the project root is designed for the development environment and will build images from the local source code.
    ```bash
    docker compose up --build -d
    ```

4.  **Access the Application**
    - Frontend: `http://localhost:3000`
    - Backend API Docs: `http://localhost:8000/docs`

## ⚙️ Configuration

- `config/app-config.json`: The core application configuration file for settings like CORS, file upload size limits, etc.
- `config/datasources.json`: Define your database connections and preset data source queries here.
- `config/mysql-configs.json`: (If used) Specifically for storing MySQL connection credentials.

## 📄 License

This project is licensed under the [MIT License](https://opensource.org/licenses/MIT).