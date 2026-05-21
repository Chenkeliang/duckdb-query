# DuckQuery 系统架构与流程图

> **版本**: v1.1  
> **更新时间**: 2026-05-21  
> **调用链路（按域）**：[`ARCHITECTURE_CALL_MAP.md`](ARCHITECTURE_CALL_MAP.md)  
> **端点契约**：[`API_CONTRACT_FE_BE.md`](API_CONTRACT_FE_BE.md)

---

## 1. 系统架构总览

```mermaid
flowchart TB
    subgraph Client["🖥️ 前端 React 18"]
        direction LR
        A1[SQL 编辑器]
        A2[可视化查询]
        A3[数据源面板]
        A4[结果面板]
    end

    subgraph StateLayer["📦 状态层"]
        direction LR
        B1[TanStack Query]
        B2[Axios Client]
    end

    subgraph API["⚡ 后端 FastAPI"]
        direction LR
        C1[路由层]
        C2[服务层]
        C3[核心层]
    end

    subgraph Data["💾 数据层"]
        direction LR
        D1[(DuckDB)]
        D2[(MySQL)]
        D3[(PostgreSQL)]
        D4[(文件存储)]
    end

    Client --> StateLayer
    StateLayer --> API
    API --> Data
    D1 -.->|联邦查询| D2
    D1 -.->|联邦查询| D3
```

---

## 2. 后端模块架构

```mermaid
flowchart LR
    subgraph Routers["🔀 路由层"]
        R1[query.py]
        R2[async_tasks.py]
        R3[datasources.py]
        R4[database_tables.py]
    end

    subgraph Services["⚙️ 服务层"]
        S1[task_manager.py]
        S2[visual_query_generator.py]
        S3[cleanup_scheduler.py]
    end

    subgraph Core["🔧 核心层"]
        subgraph DB["Database"]
            DB1[duckdb_engine.py]
            DB2[duckdb_pool.py]
            DB3[database_manager.py]
        end
        subgraph Data["Data"]
            DT1[file_utils.py]
            DT2[excel_import_manager.py]
        end
    end

    R1 --> S2
    R2 --> S1
    R3 --> DB3
    R4 --> DB1
    S1 --> DB1
    S2 --> DB1
    DB1 --> DB2
```

---

## 3. 前端组件架构

```mermaid
flowchart TB
    App[App.tsx]
    
    subgraph Workspace["📋 QueryWorkspace"]
        direction TB
        Tabs[QueryTabs]
        DSPanel[DataSourcePanel]
        Result[ResultPanel]
    end

    subgraph QueryTypes["🔍 查询类型"]
        direction LR
        SQL[SQLQueryPanel]
        Visual[VisualQueryPanel]
        Join[JoinQueryPanel]
        Pivot[PivotPanel]
    end

    subgraph Hooks["🪝 核心 Hooks"]
        direction LR
        H1[useDuckDBTables]
        H2[useDataSources]
        H3[useDatabaseConnections]
        H4[useSQLEditor]
    end

    App --> Workspace
    Tabs --> QueryTypes
    SQL --> H4
    DSPanel --> H1
    DSPanel --> H2
    DSPanel --> H3
    Result --> H1
```

---


## 4. 核心流程图

### 4.1 SQL 查询执行流程

```mermaid
sequenceDiagram
    participant User as 用户
    participant Editor as SQL编辑器
    participant API as queryApi
    participant Router as /api/query
    participant Engine as DuckDB Engine
    participant DB as DuckDB

    User->>Editor: 输入 SQL
    Editor->>API: executeDuckDBSQL()
    API->>Router: POST /api/duckdb/execute
    Router->>Engine: execute_query()
    Engine->>DB: 执行 SQL
    DB-->>Engine: 返回结果
    Engine-->>Router: 格式化响应
    Router-->>API: StandardSuccess
    API-->>Editor: 更新结果
    Editor->>User: 显示数据表格
```

### 4.2 异步任务执行流程

```mermaid
sequenceDiagram
    participant User as 用户
    participant UI as 异步任务面板
    participant API as asyncTaskApi
    participant Router as /api/async-tasks
    participant TaskMgr as TaskManager
    participant Worker as 后台Worker
    participant DuckDB as DuckDB

    User->>UI: 提交大查询
    UI->>API: submitAsyncQuery()
    API->>Router: POST /api/async-tasks
    Router->>TaskMgr: create_task()
    TaskMgr-->>Router: task_id
    Router-->>API: pending状态
    API-->>UI: 显示任务已提交

    Router->>Worker: BackgroundTasks.add_task()
    activate Worker
    Worker->>DuckDB: 执行查询
    DuckDB-->>Worker: 结果数据
    Worker->>TaskMgr: complete_task()
    deactivate Worker

    loop 轮询状态
        UI->>API: getTaskStatus
        API->>Router: GET /api/async-tasks/id
        Router-->>API: 任务状态
        API-->>UI: 更新进度
    end

    UI->>User: 任务完成
```

### 4.3 联邦查询流程

```mermaid
sequenceDiagram
    participant User as 用户
    participant UI as 查询界面
    participant API as API Client
    participant Router as async_tasks.py
    participant DBMgr as DatabaseManager
    participant DuckDB as DuckDB

    User->>UI: 选择外部数据库 + 编写 SQL
    UI->>API: submitAsyncQuery with attach_databases
    API->>Router: POST /api/async-tasks
    
    Router->>Router: validate_attach_databases()
    Router->>DBMgr: get_connection()
    DBMgr-->>Router: 连接配置

    Router->>DuckDB: ATTACH mysql AS mysql_db
    Note over DuckDB: 挂载外部数据库
    
    Router->>DuckDB: 执行跨库 SQL
    DuckDB-->>Router: 联邦查询结果
    
    Router->>DuckDB: DETACH mysql_db
    Note over DuckDB: 清理挂载
    
    Router-->>API: 查询完成
    API-->>UI: 显示结果
```

### 4.4 文件导入流程

```mermaid
flowchart TD
    A[用户上传文件] --> B{文件大小}
    B -->|小于 10MB| C[直接上传]
    B -->|大于 10MB| D[分块上传]
    
    C --> E[检测文件类型]
    D --> F[chunked_upload.py]
    F --> E
    
    E --> G{文件类型}
    G -->|CSV| H[DuckDB read_csv_auto]
    G -->|Excel| I[pandas + xlrd]
    G -->|JSON| J[DuckDB read_json_auto]
    G -->|Parquet| K[DuckDB read_parquet]
    
    H --> L[创建 DuckDB 表]
    I --> L
    J --> L
    K --> L
    
    L --> M[注册到数据源管理器]
    M --> N[缓存失效通知前端]
    N --> O[刷新数据源列表]
```

### 4.5 可视化查询构建流程

```mermaid
flowchart LR
    subgraph Config["查询配置"]
        Table["选择表"]
        Columns["选择列"]
        Filters["添加筛选"]
        Aggregations["聚合函数"]
        Sorting["排序"]
    end

    subgraph Generator["SQL 生成器"]
        BuildSelect["构建 SELECT"]
        BuildFrom["构建 FROM"]
        BuildWhere["构建 WHERE"]
        BuildGroupBy["构建 GROUP BY"]
        BuildOrderBy["构建 ORDER BY"]
    end

    subgraph Execution["执行"]
        ValidateSQL["SQL 验证"]
        ExecuteSQL["执行查询"]
        FormatResult["格式化结果"]
    end

    Table --> BuildFrom
    Columns --> BuildSelect
    Filters --> BuildWhere
    Aggregations --> BuildSelect
    Aggregations --> BuildGroupBy
    Sorting --> BuildOrderBy

    BuildSelect --> ValidateSQL
    BuildFrom --> ValidateSQL
    BuildWhere --> ValidateSQL
    BuildGroupBy --> ValidateSQL
    BuildOrderBy --> ValidateSQL

    ValidateSQL --> ExecuteSQL
    ExecuteSQL --> FormatResult
```

---

## 5. 数据流架构

```mermaid
flowchart TB
    subgraph Input["数据输入"]
        Upload["文件上传"]
        Paste["粘贴数据"]
        URL["URL 导入"]
        DBConnect["数据库连接"]
    end

    subgraph Processing["数据处理"]
        FileParser["文件解析器"]
        TypeInference["类型推断"]
        Validation["数据验证"]
    end

    subgraph Storage["存储层"]
        DuckDB[(DuckDB)]
        FileStore[("文件存储")]
        MetadataStore[("元数据存储")]
    end

    subgraph Query["查询引擎"]
        SQLParser["SQL 解析"]
        Optimizer["查询优化"]
        Executor["执行引擎"]
    end

    subgraph Output["数据输出"]
        JSON["JSON 响应"]
        CSV["CSV 导出"]
        Excel["Excel 导出"]
        Chart["图表可视化"]
    end

    Upload --> FileParser
    Paste --> FileParser
    URL --> FileParser
    DBConnect --> Query

    FileParser --> TypeInference
    TypeInference --> Validation
    Validation --> DuckDB
    Validation --> FileStore
    Validation --> MetadataStore

    DuckDB --> SQLParser
    SQLParser --> Optimizer
    Optimizer --> Executor

    Executor --> JSON
    Executor --> CSV
    Executor --> Excel
    Executor --> Chart
```

---

## 6. 技术栈总览

| 层级 | 技术 | 说明 |
|------|------|------|
| **前端框架** | React 18 + Vite + TypeScript | 现代化 SPA 架构 |
| **UI 组件** | shadcn/ui + Tailwind CSS | 一致性设计系统 |
| **状态管理** | TanStack Query 5.x | 服务端状态缓存 |
| **表格组件** | AG Grid v34 + TanStack Table | 高性能数据展示 |
| **后端框架** | FastAPI + Python 3.11+ | 异步 API 服务 |
| **核心数据库** | DuckDB | OLAP 分析引擎 |
| **外部数据库** | MySQL / PostgreSQL / SQLite | 联邦查询支持 |
| **国际化** | react-i18next | 多语言支持 |
| **代码质量** | ESLint + Pylint | 静态代码分析 |

---

## 7. 部署架构

```mermaid
graph TB
    subgraph Client["客户端"]
        Browser["浏览器"]
    end

    subgraph Docker["Docker Compose"]
        Frontend["前端容器 Nginx"]
        Backend["后端容器 FastAPI"]
        
        subgraph Volumes["数据卷"]
            DataVol["data/"]
            ExportsVol["exports/"]
            ConfigVol["config/"]
        end
    end

    subgraph External["外部服务"]
        MySQL["MySQL Server"]
        PostgreSQL["PostgreSQL Server"]
    end

    Browser -->|HTTP| Frontend
    Frontend -->|API 代理| Backend
    Backend --> DataVol
    Backend --> ExportsVol
    Backend --> ConfigVol
    Backend -.->|联邦查询| MySQL
    Backend -.->|联邦查询| PostgreSQL
```

---

## 8. 安全架构

```mermaid
flowchart LR
    subgraph Input["输入验证"]
        SQLInjection["SQL 注入防护"]
        InputValidation["参数验证"]
        RateLimiter["速率限制"]
    end

    subgraph Auth["认证授权"]
        Encryption["密码加密"]
        SecretKey["密钥管理"]
    end

    subgraph Execution["执行安全"]
        QueryTimeout["查询超时"]
        ResourceLimit["资源限制"]
        Sandboxing["沙箱执行"]
    end

    Request["API 请求"] --> RateLimiter
    RateLimiter --> InputValidation
    InputValidation --> SQLInjection
    SQLInjection --> Auth
    Auth --> Execution
    Execution --> Response["安全响应"]
```

---

## 9. API 端点概览

| 模块 | 端点 | 说明 |
|------|------|------|
| **查询** | `POST /api/query/visual` | 可视化查询 |
| **查询** | `POST /api/duckdb/execute` | 执行 SQL |
| **异步任务** | `POST /api/async-tasks` | 提交异步任务 |
| **异步任务** | `GET /api/async-tasks` | 获取任务列表 |
| **数据源** | `GET /api/datasources` | 获取数据源列表 |
| **数据源** | `POST /api/datasources/connections` | 添加数据库连接 |
| **文件** | `POST /api/chunked-upload` | 分块上传 |
| **表管理** | `GET /api/database-tables` | 获取表列表 |
