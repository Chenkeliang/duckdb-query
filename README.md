# Interactive Data Query

[中文文档](./README_zh.md)

An interactive web-based tool for querying and joining data from various sources like CSV, Excel, and databases (MySQL, PostgreSQL) using the power of DuckDB and Pandas.

## Core Features

- **Multiple Data Sources**: Upload local files (CSV, Excel, PDF) or connect to live databases (MySQL, PostgreSQL).
- **Interactive Query Builder**: Visually build complex join queries between different data sources.
- **Powerful SQL Engine**: Uses DuckDB for high-performance, in-process analytical queries.
- **Data Manipulation**: Leverages Pandas for robust data handling and transformation.
- **Modern Frontend**: A responsive and user-friendly interface built with React and AG-Grid.
- **Easy Deployment**: Deployable to Vercel, Cloudflare Pages, or your own server using Docker.

## Tech Stack

| Category          | Technology                               |
| ----------------- | ---------------------------------------- |
| **Backend**       | FastAPI (Python)                         |
| **Data Engine**   | DuckDB                                   |
| **Data Handling** | Pandas                                   |
| **Frontend**      | React (with Vite)                        |
| **UI Components** | Material-UI (MUI), AG-Grid               |
| **Deployment**    | Docker, Vercel, Cloudflare Pages         |

## Project Structure

```
/interactive-data-query/
├── .github/
│   └── workflows/
│       └── deploy.yml
├── .gitignore
├── README.md
├── docker-compose.yml
├── vercel.json
├── api/
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
└── frontend/
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

## Local Quick Start

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or later)
- [Python](https://www.python.org/) (v3.9 or later)
- [Docker](https://www.docker.com/) (optional, for containerized setup)

### Method 1: Running with Python and Node.js

**1. Start the Backend**

```bash
cd api
python -m venv venv
source venv/bin/activate  # On Windows use `venv\Scripts\activate`
pip install -r requirements.txt
uvicorn main:app --reload
```

The backend API will be running at `http://127.0.0.1:8000`.

**2. Start the Frontend**

```bash
cd frontend
npm install
npm run dev
```

The frontend development server will be running at `http://127.0.0.1:5173`.

### Method 2: Running with Docker

This is the easiest way to get started.

```bash
docker-compose up --build
```

The application will be available at `http://localhost:5173`.

## Deployment

### Vercel

This project is optimized for Vercel. Simply connect your GitHub repository to Vercel, and it will automatically build and deploy using the `vercel.json` configuration.

### Cloudflare Pages

1.  Connect your GitHub repository to Cloudflare Pages.
2.  Set the build command to `npm run build` in the `frontend` directory.
3.  Set the output directory to `frontend/dist`.
4.  For the backend, you will need to deploy the `api` directory as a Cloudflare Worker.

### GitHub Pages

**Important**: GitHub Pages only supports static sites. You cannot run the Python backend here.

1.  Deploy the `frontend` to GitHub Pages.
2.  Deploy the `api` backend to a separate service (like Vercel, Heroku, or a VPS).
3.  Update the `VITE_API_URL` in `frontend/.env.production` to point to your live backend URL.

### Docker (Self-Hosted)

You can build and run the Docker containers in a production environment.

```bash
docker-compose -f docker-compose.yml build
docker-compose -f docker-compose.yml up -d
```

## API Documentation

When the backend is running, you can access the interactive API documentation (Swagger UI) at `http://127.0.0.1:8000/docs`.
