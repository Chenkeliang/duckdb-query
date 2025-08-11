# Interactive Data Query - Next-Gen Interactive Data Query and Analysis Platform

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**Interactive Data Query** is a modern web platform designed to solve ad-hoc, complex data analysis needs. With DuckDB at its core, it empowers users to perform high-performance SQL queries on data from multiple sources directly in the browser, aiming for an ultimate zero-ETL, zero-import analysis experience.

## 1. Features and Usage

The platform's core design philosophy is "query anything." Whether it's a local file, a file on a remote server, or an existing database, it can be easily loaded into the query engine and analyzed like a regular data table.

### 1.1 Big Data Analysis with DuckDB

The platform features a powerful built-in DuckDB analytics engine, allowing you to process large datasets without relying on any external database.

- **Multiple Data Sources**: Directly upload **CSV**, **Parquet**, **Excel** files, or **paste** table-like data (e.g., TSV) directly on the page. The platform automatically loads this data into tables within DuckDB.
- **High-Performance Queries**: All loaded data is processed by DuckDB in the background, enabling sub-second complex queries and aggregations even on multi-gigabyte files.
- **Full DuckDB SQL Syntax**: You can leverage DuckDB's rich SQL dialect, including advanced features like window functions, complex data types, and statistical functions.

### 1.2 Cross-Source Data Joins

One of the platform's most powerful features is its ability to effortlessly handle join operations across different databases and data sources.

- **Mechanism**: You can load data from various origins—for example, a query result from MySQL, an uploaded CSV file, and a Parquet file from a remote URL—into DuckDB. Once loaded, they all become standard tables in the DuckDB environment.
- **Unified Queries**: In the SQL editor, you can use standard `LEFT JOIN`, `RIGHT JOIN`, `INNER JOIN`, `FULL JOIN`, etc., to perform arbitrary joins across these tables from disparate sources, just as if they were in the same database all along.

### 1.3 Remote Files as a Data Source

In addition to local files, you can also use any publicly accessible URL as a data source.

- **Usage**: Simply provide the file's URL, and the platform will automatically download its content, infer its format (CSV, Parquet, JSON, etc.), and load it as a queryable table.
- **GitHub Support**: The system intelligently recognizes GitHub `blob` links and automatically converts them to the downloadable `raw` format.

### 1.4 Connecting Remote Databases

The platform also supports connecting to your existing remote databases (e.g., MySQL, PostgreSQL) and making them part of your analysis.

- **Data Loading**: You can execute a SQL query to pull a required subset of data from a remote database.
- **Integration with DuckDB**: The fetched data can be seamlessly loaded as a new table in DuckDB, making it available for joins with any other data source.

## 2. Quick Start and Usage

All you need is a machine with Docker and Docker Compose installed to get the entire platform running with these simple steps.

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

# 4. Create a directory for data persistence
mkdir data

# 5. Start the services
docker compose up -d

# 6. Done!
echo "Application started! Open your browser to http://localhost:3000"
```

## 3. Security

We take your data security and privacy very seriously.

- **No Login Required**: The platform is ready to use out-of-the-box without any registration or login, and it does not collect any user information.
- **No Data Storage**: Your data (whether uploaded files or database connection configurations) is managed solely by you through Docker's volume functionality. Our servers do not store any of your business data or files, beyond what you explicitly manage in your local directories.
- **In-Memory Processing**: All data queries and computations are performed in the container's memory and released upon completion, ensuring the temporary and secure handling of your data.

## 4. Open Source

This is a fully open-source project licensed under the [MIT License](https://opensource.org/licenses/MIT). We welcome contributions of all forms, whether it's code submissions, feature suggestions, or bug reports.

If you find this project helpful, please give us a Star on GitHub!