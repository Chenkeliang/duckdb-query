# Interactive Data Query - Next-Gen Interactive Data Query and Analysis Platform

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Have you ever gone to great lengths to set up a database just to analyze a temporary CSV file? Or found yourself racking your brain trying to join data from two different sources?

**Interactive Data Query** is here to solve those headaches for you! We've built a modern, fluid web platform that lets you query and analyze data as easily as drinking water. At its core is a powerful DuckDB engine, ensuring that no matter if your data comes from local files, remote links, or your business databases, it can all be treated equally and explored with the simplest, most direct SQL.

Our goal: Say goodbye to tedious ETL and data imports, and let data analysis return to its essence—quick insights and free exploration.

## ✨ Core Highlights

### 1. Query Anything, No Import Needed
- **Local Files, Transformed into Tables**: Whether it's CSV, Parquet, or Excel, just drag and drop or paste, and they'll instantly become queryable tables.

### 2. Cross-Source Freedom to JOIN
This might be the coolest feature! You can join business data from MySQL, a local sales CSV, and a remote Parquet file all within the same query using `JOIN`. We help you smooth out the differences in data sources, so you can focus solely on the analysis.

### 3. Powerful SQL & Instant Visualization
- **Full-Featured DuckDB Core**: Enjoy the full power of modern SQL, including window functions, JSON parsing, and more.

## 🚀 Quick Start and Usage

All you need is a machine with Docker and Docker Compose installed to get the entire platform running with these simple steps.

> **Tip**: `curl` is usually pre-installed on macOS and Linux. Windows users may need to download files using other methods or install `curl`.

```bash
# 1. Create and enter a new directory
mkdir my-data-query-app && cd my-data-query-app

# 2. Download the docker-compose.yml deployment file
# IMPORTANT: Replace the URL below with the one for your own GitHub repository
curl -o docker-compose.yml https://raw.githubusercontent.com/chenkeliang/interactive-data-query/main/deployment/docker-compose.yml

# 3. Create the config directory and sample files
mkdir -p config
curl -o config/app-config.json https://raw.githubusercontent.com/chenkeliang/interactive-data-query/main/deployment/config/app-config.json
curl -o config/datasources.json https://raw.githubusercontent.com/chenkeliang/interactive-data-query/main/deployment/config/datasources.json.example

# 4. Create a directory for data persistence
mkdir data

# 5. Start the services
docker compose up -d

# 6. Done!
echo "Application started! Open your browser to http://localhost:3000"
```

## 🔒 Your Data, Only Yours

We deeply understand the importance of data security, which is why we adhere to a "read-and-forget" philosophy from the very beginning:
- **Pure Browser & In-Memory Computing**: We do not operate a server, require no login, and store no business data of yours. All data processing occurs within your browser and container memory.
- **Configuration is Yours to Control**: Sensitive information like database passwords are managed by you through local configuration files, ensuring they never leave your computer.

## 👨‍💻 Developer Guide

If you wish to contribute, modify the code, or build from source, please follow these steps.

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
- `config/mysql-configs.json`: Specifically for storing MySQL connection credentials (please use the page to load, involves password encryption algorithms).
- `config/postgresql-configs.json`: Specifically for storing PostgreSQL connection credentials (please use the page to load, involves password encryption algorithms).

## 📄 License

This project is licensed under the [MIT License](https://opensource.org/licenses/MIT) license.

If you find this project helpful, please give us a Star on GitHub!
