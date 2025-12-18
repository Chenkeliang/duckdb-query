# DuckDB Extension Unified Management - Design Document

## Overview

本设计文档描述 DuckDB 扩展统一管理功能的技术实现方案。核心目标是将扩展管理收拢到配置系统中，在启动时自动安装和加载，并支持跨数据库联邦查询。

**设计原则：**
- 扩展默认加载，无需运行时查询状态
- 复用现有的扩展管理逻辑
- 符合项目现有的代码规范和架构

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Configuration Layer                       │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │
│  │ app-config.json │  │ Environment Vars │  │ quick-start.sh  │  │
│  │ duckdb_extensions│  │ DUCKDB_EXTENSIONS│  │ Default Config  │  │
│  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘  │
│           └────────────────────┼────────────────────┘           │
│                                ▼                                 │
│                    ┌─────────────────────┐                      │
│                    │   ConfigManager     │                      │
│                    │ _resolve_extensions │                      │
│                    └──────────┬──────────┘                      │
└───────────────────────────────┼─────────────────────────────────┘
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                        Extension Layer                           │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                  DuckDB Engine                           │    │
│  │  ┌─────────────────────┐  ┌─────────────────────────┐   │    │
│  │  │_install_duckdb_     │  │_apply_duckdb_           │   │    │
│  │  │extensions()         │  │configuration()          │   │    │
│  │  └─────────────────────┘  └─────────────────────────┘   │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                ▼                                 │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                  Connection Pool                         │    │
│  │  ┌─────────────────────┐  ┌─────────────────────────┐   │    │
│  │  │ _configure_connection│  │ get_connection()        │   │    │
│  │  └─────────────────────┘  └─────────────────────────┘   │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                        API Layer                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ POST /duckdb/query + attach_databases parameter          │   │
│  │ (扩展已默认加载，无需状态查询 API)                         │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

## Components and Interfaces

### 1. Configuration Manager Enhancement

**File:** `api/core/config_manager.py`

修改 `AppConfig` 类的默认扩展列表：

```python
@dataclass
class AppConfig:
    # ... existing fields ...
    
    duckdb_extensions: List[str] = None
    """要自动安装和加载的DuckDB扩展列表"""

    def __post_init__(self):
        # 设置默认DuckDB扩展（包含联邦查询扩展）
        if self.duckdb_extensions is None:
            self.duckdb_extensions = ["excel", "json", "parquet", "mysql", "postgres"]
```

### 2. Query API Enhancement

**File:** `api/routers/duckdb_query.py`

新增 `attach_databases` 参数支持：

```python
class AttachDatabase(BaseModel):
    """外部数据库连接信息"""
    alias: str  # SQL 中使用的别名
    connection_id: str  # 数据库连接 ID

class QueryRequest(BaseModel):
    sql: str
    connection_id: Optional[str] = None
    attach_databases: Optional[List[AttachDatabase]] = None
```

### 3. ATTACH SQL Builder

**File:** `api/core/duckdb_engine.py`

新增函数构建 ATTACH SQL：

```python
def build_attach_sql(alias: str, db_config: dict) -> str:
    """
    根据数据库配置构建 ATTACH SQL 语句
    
    Args:
        alias: SQL 中使用的别名
        db_config: 数据库连接配置
        
    Returns:
        ATTACH SQL 语句
    """
    db_type = db_config.get('type', '').lower()
    
    if db_type == 'mysql':
        conn_str = f"host={db_config['host']} user={db_config['username']} password={db_config.get('password', '')} database={db_config['database']}"
        if db_config.get('port'):
            conn_str += f" port={db_config['port']}"
        return f"ATTACH '{conn_str}' AS {alias} (TYPE mysql)"
    
    elif db_type in ('postgresql', 'postgres'):
        conn_str = f"host={db_config['host']} dbname={db_config['database']} user={db_config['username']} password={db_config.get('password', '')}"
        if db_config.get('port'):
            conn_str += f" port={db_config['port']}"
        return f"ATTACH '{conn_str}' AS {alias} (TYPE postgres)"
    
    elif db_type == 'sqlite':
        return f"ATTACH '{db_config['database']}' AS {alias} (TYPE sqlite)"
    
    else:
        raise ValueError(f"Unsupported database type: {db_type}")
```

## Data Models

### AttachDatabase Model

```python
class AttachDatabase(BaseModel):
    alias: str = Field(..., description="SQL 中使用的数据库别名")
    connection_id: str = Field(..., description="已保存的数据库连接 ID")
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Extension Loading Consistency
*For any* valid extension name in the duckdb_extensions configuration, after connection initialization, querying duckdb_extensions() should show that extension as loaded.
**Validates: Requirements 1.1**

### Property 2: ATTACH SQL Format for MySQL
*For any* MySQL database configuration with host, username, password, database, and optional port, the build_attach_sql function should produce a valid ATTACH statement with TYPE mysql.
**Validates: Requirements 2.2**

### Property 3: ATTACH SQL Format for PostgreSQL
*For any* PostgreSQL database configuration with host, username, password, database, and optional port, the build_attach_sql function should produce a valid ATTACH statement with TYPE postgres.
**Validates: Requirements 2.3**

### Property 4: ATTACH SQL Format for SQLite
*For any* SQLite database configuration with database path, the build_attach_sql function should produce a valid ATTACH statement with TYPE sqlite.
**Validates: Requirements 2.4**

### Property 5: Configuration Default Extensions
*For any* AppConfig instance created without explicit duckdb_extensions, the default list should contain excel, json, parquet, mysql, and postgres.
**Validates: Requirements 1.4, 5.2**

### Property 6: Environment Variable Override
*For any* DUCKDB_EXTENSIONS environment variable value, the ConfigManager should use that value instead of the default or config file value.
**Validates: Requirements 5.3**

## Error Handling

### Extension Installation Failures

```python
def _install_duckdb_extensions(connection, extensions: List[str]):
    """安装和加载扩展，失败时记录警告但不中断"""
    for ext_name in extensions:
        try:
            connection.execute(f"LOAD {ext_name};")
            logger.info(f"DuckDB扩展 {ext_name} 已加载")
        except Exception as load_error:
            try:
                connection.execute(f"INSTALL {ext_name};")
                connection.execute(f"LOAD {ext_name};")
                logger.info(f"DuckDB扩展 {ext_name} 安装并加载成功")
            except Exception as install_error:
                # 记录警告但继续处理其他扩展
                logger.warning(f"安装或加载DuckDB扩展 {ext_name} 失败: {str(install_error)}")
```

### ATTACH Failures

```python
async def execute_federated_query(request: QueryRequest):
    """执行联邦查询，处理 ATTACH 失败"""
    try:
        with with_duckdb_connection() as conn:
            # ATTACH 外部数据库
            for db_info in request.attach_databases or []:
                db_config = await get_datasource_config(db_info.connection_id)
                if not db_config:
                    raise HTTPException(
                        status_code=404,
                        detail=f"Database connection {db_info.connection_id} not found"
                    )
                
                attach_sql = build_attach_sql(db_info.alias, db_config)
                try:
                    conn.execute(attach_sql)
                except Exception as e:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Failed to attach database {db_info.alias}: {str(e)}"
                    )
            
            # 执行查询
            result = conn.execute(request.sql).fetchdf()
            return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
```

## Testing Strategy

### Unit Testing

使用 pytest 进行单元测试：

1. **Configuration Tests**
   - 测试默认扩展列表
   - 测试环境变量覆盖
   - 测试配置文件加载

2. **ATTACH SQL Builder Tests**
   - 测试 MySQL ATTACH SQL 格式
   - 测试 PostgreSQL ATTACH SQL 格式
   - 测试 SQLite ATTACH SQL 格式
   - 测试无效数据库类型处理

### Property-Based Testing

使用 hypothesis 库进行属性测试：

```python
from hypothesis import given, strategies as st

@given(
    host=st.text(min_size=1, max_size=50),
    username=st.text(min_size=1, max_size=50),
    database=st.text(min_size=1, max_size=50),
    port=st.integers(min_value=1, max_value=65535)
)
def test_mysql_attach_sql_format(host, username, database, port):
    """Property: MySQL ATTACH SQL should always contain TYPE mysql"""
    config = {
        'type': 'mysql',
        'host': host,
        'username': username,
        'password': 'test',
        'database': database,
        'port': port
    }
    sql = build_attach_sql('test_alias', config)
    assert 'TYPE mysql' in sql
    assert f'host={host}' in sql
```

### Integration Testing

1. **Extension Loading Test**
   - 启动应用后验证扩展已加载
   - 测试扩展安装失败的降级处理

2. **Federated Query Test**
   - 测试跨数据库 ATTACH 和查询
   - 测试连接失败处理

## Implementation Notes

### Files to Modify

1. `api/core/config_manager.py` - 更新默认扩展列表
2. `api/routers/duckdb_query.py` - 添加 attach_databases 支持和扩展状态 API
3. `api/core/duckdb_engine.py` - 添加 build_attach_sql 函数
4. `api/Dockerfile` - 添加扩展预安装步骤
5. `quick-start.sh` - 更新默认配置中的扩展列表

### Backward Compatibility

- 现有的 `duckdb_extensions` 配置继续有效
- 不带 `attach_databases` 的查询请求行为不变
- 扩展安装失败不会阻断应用启动
