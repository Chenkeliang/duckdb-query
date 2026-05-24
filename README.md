<p align="center">
  <img src="frontend/src/assets/duckq-logo.svg" alt="DuckQuery" height="80">
</p>

<h1 align="center">DuckQuery</h1>

  <b>The Visual SQL Workbench for Files and Databases.</b><br>
  <b>Seamlessly connect local files (Excel/CSV/JSON) and remote databases (MySQL/PG). Break data silos with one-stop cross-source SQL analysis.</b>
</p>

<p align="center">
  <a href="https://chenkeliang.github.io/duckdb-query/" target="_blank">
    <img src="https://img.shields.io/badge/Live_Demo-Try_Now-success?style=for-the-badge&logo=github&logoColor=white" alt="Live Demo" />
  </a>

<p align="center">
  <a href="#quick-start">Quick Start</a> •
  <a href="#what-can-you-do">What Can You Do</a> •
  <a href="#deployment">Deployment</a> •
  <a href="README_zh.md">中文</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Python-3.12+-3776AB.svg?logo=python&logoColor=white" alt="Python">
  <img src="https://img.shields.io/badge/React-18-61DAFB.svg?logo=react&logoColor=black" alt="React">
  <img src="https://img.shields.io/badge/DuckDB-Powered-FFBF00.svg?logo=duckdb&logoColor=white" alt="DuckDB">
</p>

---

## Quick Start

### 1. Live Demo (No Installation)
**Just want to try the UI?** Use the browser-based version powered by DuckDB Wasm.
👉 **[Click here to try Live Demo](https://chenkeliang.github.io/duckdb-query/)**

### 2. Docker Deployment (Full Features)
**Want the full experience?** Run the full stack (Python Backend + React Frontend) to enable:
- Direct local file system access
- Persistent database connections (MySQL/Postgres)

**Prerequisites:** Docker & Docker Compose

```bash
git clone https://github.com/Chenkeliang/duckdb-query.git && cd duckdb-query && ./quick-start.sh
```

Open **http://localhost:3000** and start querying.

---

## Demo

### Data Source Upload
![Data Source Upload](docs/assets/en_source.gif)

### Query Workbench
![Query Workbench](docs/assets/en_query.gif)

---

## What Can You Do

| Action | How |
|--------|-----|
| 📥 **Paste CSV/TSV from anywhere** | Copy cells from any source, paste directly as a new table. |
| 📂 **Query any file** | Drag CSV/Excel/Parquet/JSON into the browser. Instant table. |
| 🗄️ **Connect databases** | Add MySQL/PostgreSQL. Query alongside local files. |
| 🔗 **Cross-source JOIN** | `SELECT * FROM local_csv JOIN mysql_db.users ON ...` |
| 📊 **Pivot / JOIN / Set ops** | SQL editor + JOIN workbench + pivot + set operations (no separate “visual builder” tab). |
| 🌐 **Import from URL** | Enter a CSV/Parquet/JSON link, auto-import to DuckDB. |
| 🌙 **Dark Mode & i18n** | Switch themes and languages (EN/中文) instantly. |

---

## How It Works

```
┌─────────────────┐      ┌─────────────────┐      ┌─────────────────┐
│  Your Files     │      │  DuckQuery      │      │  Your Databases │
│  CSV/Excel/...  │ ───► │  (DuckDB Core)  │ ◄─── │  MySQL/Postgres │
└─────────────────┘      └────────┬────────┘      └─────────────────┘
                                  │
                                  ▼
                         ┌─────────────────┐
                         │   SQL + Visual  │
                         │   Query Results │
                         └─────────────────┘
```

Files are imported as **native DuckDB tables** for lightning-fast queries. External databases are connected via DuckDB's `ATTACH` mechanism.

---

## Deployment

### Docker (Recommended)

```bash
git clone https://github.com/Chenkeliang/duckdb-query.git
cd duckdb-query
./quick-start.sh
```

| Service | URL |
|---------|-----|
| Frontend | http://localhost:3000 |
| API Docs | http://localhost:8001/docs |

**Data**: Tables and connections live on the host in **`./data`** (bind mount). Re-running `./quick-start.sh` or `docker compose up -d --build` **does not** delete `./data`; log lines saying `Removed` refer to old containers, not your database files.

**Slow or failed pulls from docker.io** (e.g. `node:24-alpine`):

- The script defaults to DaoCloud mirror images; on first run it may copy `.env.docker.cn.example` → `.env`.
- Or: `cp .env.docker.cn.example .env` then `docker compose up -d --build`.
- If Docker Hub works reliably: `USE_DOCKER_HUB=1 ./quick-start.sh`.

**Rebuild frontend only** (keeps `./data`):

```bash
docker compose up -d --build frontend
```

**Stop services** (still keeps `./data`): `docker compose down` (avoid `down -v` unless you intend to wipe named volumes).

### Local Development

```bash
# Backend (default http://localhost:8000 , docs at /docs)
cd api && pip install -r requirements.txt && uvicorn main:app --reload

# Frontend (default http://localhost:5173 , /api proxied to backend)
cd frontend && npm install && npm run dev
```

| Service | Default URL | API from browser |
|---------|-------------|------------------|
| Frontend (Vite) | http://localhost:5173 | `/api/*` proxied to backend |
| Backend | http://localhost:8000 | Direct (e.g. `/docs`) |

**Query APIs**: DuckDB local → `POST /api/duckdb/execute`; external / federated → `POST /api/duckdb/federated-query` with ATTACH. Do **not** use legacy `POST /api/execute_sql`. See [`docs/API_CONTRACT_FE_BE.md`](docs/API_CONTRACT_FE_BE.md) and [`docs/frontend/QUERY_EXECUTION_FLOW.md`](docs/frontend/QUERY_EXECUTION_FLOW.md).

---

## Configuration

DuckQuery works out-of-the-box. For advanced setups, edit `config/app-config.json`:

| Setting | Default | What it does |
|---------|---------|-------------|
| `duckdb_memory_limit` | `8GB` | Max RAM for DuckDB |
| `server_data_mounts` | `[]` | Mount host directories for direct file access |
| `cors_origins` | `3000`, `5173` | Allowed frontend origins |

👉 **[Full Configuration Reference →](docs/CONFIGURATION.md)**

---

## FAQ

<details>
<summary><b>Docker: How to query files without uploading?</b></summary>

Mount your data directory in `docker-compose.yml`:
```yaml
volumes:
  - /your/data/path:/app/server_mounts
```
Then add to `config/app-config.json`:
```json
"server_data_mounts": [{"label": "My Data", "path": "/app/server_mounts"}]
```
</details>

<details>
<summary><b>Local Dev: How to query files without uploading?</b></summary>

Configure local folder in `config/app-config.json`:
```json
"server_data_mounts": [{"label": "My Data", "path": "/Users/yourname/data-folder"}]
```
Restart the backend, then browse and import files from the "Server Directory" tab in the data source page.
</details>

<details>
<summary><b>Docker: How to change default ports?</b></summary>

Edit `docker-compose.yml`:
```yaml
services:
  backend:
    ports: ["9000:8000"]  # Backend on 9000
  frontend:
    ports: ["8080:80"]    # Frontend on 8080
```
</details>

<details>
<summary><b>Local Dev: How to change default ports?</b></summary>

**Backend port** (default 8000):
```bash
cd api && uvicorn main:app --reload --port 9000
```

**Frontend port** (default 5173):
Add `port` to the `server` block in `frontend/vite.config.js`:
```javascript
server: {
  port: 3000,  // Add this line
  proxy: {
    // ... existing config
  },
},
```
Or specify at startup:
```bash
cd frontend && npm run dev -- --port 3000
```

**CORS Note**: Default allows `localhost:3000` and `localhost:5173`. For other ports, add to `config/app-config.json`:
```json
"cors_origins": ["http://localhost:3000", "http://localhost:5173", "http://localhost:YOUR_PORT"]
```
</details>

<details>
<summary><b>Will Docker redeploy delete my tables?</b></summary>

No. DuckDB files are on the host under **`./data`**. `docker compose up -d --build` only recreates containers. `docker compose down` stops containers but **does not** remove `./data`. Avoid `docker compose down -v` unless you mean to wipe volumes. For WAL issues see `./scripts/repair-duckdb-wal.sh`.
</details>

---

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

MIT © [Chenkeliang](https://github.com/Chenkeliang)
