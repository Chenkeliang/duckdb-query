# 数据源元数据迁移到 DuckDB - 设计文档

## 概述

本文档描述将数据库连接配置和文件数据源元数据从 JSON 文件迁移到 DuckDB 元数据表的技术设计。

## 架构设计

### 当前架构

```
┌─────────────────┐
│   Frontend      │
└────────┬────────┘
         │ API Calls
         ▼
┌─────────────────┐
│   Backend API   │
└────────┬────────┘
         │
    ┌────┴────┐
    │         │
    ▼         ▼
┌────────┐ ┌──────────────┐
│ JSON   │ │   DuckDB     │
│ Files  │ │   (Data)     │
└────────┘ └──────────────┘
```

### 目标架构

```
┌─────────────────┐
│   Frontend      │
└────────┬────────┘
         │ API Calls
         ▼
┌─────────────────┐
│   Backend API   │
└────────┬────────┘
         │
         ▼
┌──────────────────┐
│     DuckDB       │
│  ┌────────────┐  │
│  │  Metadata  │  │
│  └────────────┘  │
│  ┌────────────┐  │
│  │    Data    │  │
│  └────────────┘  │
└──────────────────┘
```

## 数据模型

### 1. 数据库连接元数据表

```sql
CREATE TABLE IF NOT EXISTS system_database_connections (
    id VARCHAR PRIMARY KEY,
    name VARCHAR NOT NULL,
    type VARCHAR NOT NULL,  -- mysql, postgresql, sqlite, etc.
    params JSON NOT NULL,   -- 连接参数（加密存储）
    status VARCHAR NOT NULL DEFAULT 'active',  -- active, inactive, error
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_tested TIMESTAMP,
    metadata JSON  -- 额外的元数据
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_db_conn_type ON system_database_connections(type);
CREATE INDEX IF NOT EXISTS idx_db_conn_status ON system_database_connections(status);
CREATE INDEX IF NOT EXISTS idx_db_conn_updated ON system_database_connections(updated_at);
```

**字段说明**:
- `id`: 连接唯一标识符
- `name`: 连接显示名称
- `type`: 数据库类型（mysql, postgresql, sqlite 等）
- `params`: JSON 格式的连接参数（密码加密存储）
- `status`: 连接状态（active, inactive, error）
- `created_at`: 创建时间
- `updated_at`: 最后更新时间
- `last_tested`: 最后测试时间
- `metadata`: 额外的元数据（JSON 格式）

### 2. 文件数据源元数据表

```sql
CREATE TABLE IF NOT EXISTS system_file_datasources (
    source_id VARCHAR PRIMARY KEY,
    filename VARCHAR NOT NULL,
    file_path VARCHAR,
    file_type VARCHAR NOT NULL,  -- csv, excel, json, parquet, etc.
    row_count INTEGER,
    column_count INTEGER,
    columns JSON,  -- 列名列表
    column_profiles JSON,  -- 列级统计信息
    upload_time TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_accessed TIMESTAMP,
    file_size BIGINT,  -- 文件大小（字节）
    file_hash VARCHAR,  -- 文件哈希值（用于去重）
    metadata JSON  -- 额外的元数据
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_file_ds_type ON system_file_datasources(file_type);
CREATE INDEX IF NOT EXISTS idx_file_ds_upload ON system_file_datasources(upload_time);
CREATE INDEX IF NOT EXISTS idx_file_ds_hash ON system_file_datasources(file_hash);
```

**字段说明**:
- `source_id`: 数据源唯一标识符（通常是表名）
- `filename`: 原始文件名
- `file_path`: 文件存储路径
- `file_type`: 文件类型（csv, excel, json, parquet 等）
- `row_count`: 行数
- `column_count`: 列数
- `columns`: 列名列表（JSON 数组）
- `column_profiles`: 列级统计信息（JSON 对象）
- `upload_time`: 上传时间
- `last_accessed`: 最后访问时间
- `file_size`: 文件大小
- `file_hash`: 文件哈希值
- `metadata`: 额外的元数据

### 3. 迁移状态表

```sql
CREATE TABLE IF NOT EXISTS system_migration_status (
    migration_name VARCHAR PRIMARY KEY,
    status VARCHAR NOT NULL,  -- pending, running, completed, failed
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    error_message TEXT,
    records_migrated INTEGER DEFAULT 0,
    metadata JSON
);
```

## 组件设计

### 1. 元数据管理器 (MetadataManager)

**位置**: `api/core/metadata_manager.py`

```python
class MetadataManager:
    """统一的元数据管理器 - 使用泛型接口简化管理"""
    
    def __init__(self, duckdb_path: str):
        self.duckdb_path = duckdb_path
        self._cache = {}
        self._cache_ttl = timedelta(minutes=5)
        self._init_metadata_tables()
    
    def _init_metadata_tables(self):
        """初始化所有元数据表（自动创建，如果不存在）"""
        with with_duckdb_connection() as conn:
            # 创建数据库连接元数据表
            conn.execute("""
                CREATE TABLE IF NOT EXISTS system_database_connections (
                    id VARCHAR PRIMARY KEY,
                    name VARCHAR NOT NULL,
                    type VARCHAR NOT NULL,
                    params JSON NOT NULL,
                    status VARCHAR NOT NULL DEFAULT 'active',
                    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    last_tested TIMESTAMP,
                    metadata JSON
                )
            """)
            
            # 创建文件数据源元数据表
            conn.execute("""
                CREATE TABLE IF NOT EXISTS system_file_datasources (
                    source_id VARCHAR PRIMARY KEY,
                    filename VARCHAR NOT NULL,
                    file_path VARCHAR,
                    file_type VARCHAR NOT NULL,
                    row_count INTEGER,
                    column_count INTEGER,
                    columns JSON,
                    column_profiles JSON,
                    upload_time TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    last_accessed TIMESTAMP,
                    file_size BIGINT,
                    file_hash VARCHAR,
                    metadata JSON
                )
            """)
            
            # 创建迁移状态表
            conn.execute("""
                CREATE TABLE IF NOT EXISTS system_migration_status (
                    migration_name VARCHAR PRIMARY KEY,
                    status VARCHAR NOT NULL,
                    started_at TIMESTAMP,
                    completed_at TIMESTAMP,
                    error_message TEXT,
                    records_migrated INTEGER DEFAULT 0,
                    metadata JSON
                )
            """)
            
            # 创建索引
            conn.execute("CREATE INDEX IF NOT EXISTS idx_db_conn_type ON system_database_connections(type)")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_db_conn_status ON system_database_connections(status)")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_file_ds_type ON system_file_datasources(file_type)")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_file_ds_upload ON system_file_datasources(upload_time)")
    
    # 统一的 CRUD 接口
    def save_metadata(self, table: str, id: str, data: dict) -> bool:
        """保存元数据（数据库连接或文件数据源）"""
        pass
    
    def get_metadata(self, table: str, id: str) -> Optional[dict]:
        """获取元数据"""
        pass
    
    def list_metadata(self, table: str, filters: dict = None) -> List[dict]:
        """列出元数据"""
        pass
    
    def update_metadata(self, table: str, id: str, updates: dict) -> bool:
        """更新元数据"""
        pass
    
    def delete_metadata(self, table: str, id: str) -> bool:
        """删除元数据"""
        pass
    
    # 便捷方法（内部调用统一接口）
    def save_database_connection(self, connection: DatabaseConnection) -> bool:
        """保存数据库连接"""
        return self.save_metadata('system_database_connections', connection.id, connection.dict())
    
    def get_database_connection(self, conn_id: str) -> Optional[DatabaseConnection]:
        """获取数据库连接"""
        data = self.get_metadata('system_database_connections', conn_id)
        return DatabaseConnection(**data) if data else None
    
    def save_file_datasource(self, datasource: FileDataSource) -> bool:
        """保存文件数据源元数据"""
        return self.save_metadata('system_file_datasources', datasource.source_id, datasource.dict())
    
    def get_file_datasource(self, source_id: str) -> Optional[FileDataSource]:
        """获取文件数据源元数据"""
        data = self.get_metadata('system_file_datasources', source_id)
        return FileDataSource(**data) if data else None
```

### 2. 迁移管理器 (MigrationManager)

**位置**: `api/core/migration_manager.py`

```python
class MigrationManager:
    """数据迁移管理器"""
    
    def __init__(self, metadata_manager: MetadataManager):
        self.metadata_manager = metadata_manager
        self.json_files = {
            'database_connections': 'config/datasources.json',
            'file_datasources': 'api/data/file_datasources.json'
        }
    
    def needs_migration(self) -> bool:
        """检查是否需要迁移"""
        pass
    
    def migrate_from_json(self) -> MigrationResult:
        """从 JSON 文件迁移到 DuckDB"""
        pass
    
    def _migrate_database_connections(self) -> int:
        """迁移数据库连接配置"""
        pass
    
    def _migrate_file_datasources(self) -> int:
        """迁移文件数据源元数据"""
        pass
    
    def _validate_migration(self) -> bool:
        """验证迁移数据完整性"""
        pass
    
    def _cleanup_json_files(self):
        """清理 JSON 文件（迁移成功后）"""
        pass
    
    def rollback_migration(self):
        """回滚迁移"""
        pass
```

### 3. 加密工具 (EncryptionUtils)

**位置**: `api/utils/encryption_utils.py`

```python
class EncryptionUtils:
    """加密/解密工具"""
    
    @staticmethod
    def encrypt_password(password: str) -> str:
        """加密密码"""
        pass
    
    @staticmethod
    def decrypt_password(encrypted: str) -> str:
        """解密密码"""
        pass
    
    @staticmethod
    def encrypt_json(data: dict) -> str:
        """加密 JSON 数据"""
        pass
    
    @staticmethod
    def decrypt_json(encrypted: str) -> dict:
        """解密 JSON 数据"""
        pass
```

## 迁移流程

### 启动时自动迁移

```python
# api/main.py

@app.on_event("startup")
async def startup_event():
    """应用启动事件"""
    
    # 1. 初始化元数据管理器
    metadata_manager = MetadataManager(config.duckdb_path)
    
    # 2. 检查是否需要迁移
    migration_manager = MigrationManager(metadata_manager)
    
    if migration_manager.needs_migration():
        logger.info("检测到 JSON 文件，开始迁移...")
        
        try:
            # 3. 执行迁移
            result = migration_manager.migrate_from_json()
            
            if result.success:
                logger.info(f"迁移成功: {result.records_migrated} 条记录")
                # 4. 清理 JSON 文件
                migration_manager.cleanup_json_files()
                logger.info("JSON 文件已清理")
            else:
                logger.error(f"迁移失败: {result.error_message}")
                raise Exception(f"迁移失败: {result.error_message}")
        
        except Exception as e:
            logger.error(f"迁移过程发生异常: {e}")
            # 回滚迁移
            migration_manager.rollback_migration()
```

### 迁移步骤

1. **检测阶段**
   - 检查 `config/datasources.json` 是否存在
   - 检查 `api/data/file_datasources.json` 是否存在
   - 检查 `system_migration_status` 表中的迁移记录

### 迁移步骤

1. **检测阶段**
   - 检查 `config/datasources.json` 是否存在
   - 检查 `api/data/file_datasources.json` 是否存在
   - 检查 `_migration_status` 表中的迁移记录

2. **准备阶段**
   - 创建元数据表（如果不存在）
   - 记录迁移开始状态
   - 开始事务

3. **迁移阶段**
   - 读取 JSON 文件
   - 转换数据格式
   - 插入到 DuckDB 元数据表
   - 更新迁移进度

4. **验证阶段**
   - 验证记录数量
   - 验证数据完整性
   - 验证加密数据可解密

5. **完成阶段**
   - 提交事务
   - 删除 JSON 文件
   - 记录迁移完成状态

6. **回滚阶段**（如果失败）
   - 回滚事务
   - 删除部分迁移的数据
   - 保留 JSON 文件
   - 记录错误信息

## API 适配

### 数据库连接 API 适配

```python
# api/routers/datasources.py

# 修改前：从 JSON 文件读取
def get_database_connections():
    with open('config/datasources.json') as f:
        data = json.load(f)
    return data['database_sources']

# 修改后：从 DuckDB 读取
def get_database_connections():
    return metadata_manager.list_database_connections()
```

### 文件数据源 API 适配

```python
# api/core/file_datasource_manager.py

# 修改前：从 JSON 文件读取
def get_file_datasource(source_id: str):
    with open('api/data/file_datasources.json') as f:
        data = json.load(f)
    return data.get(source_id)

# 修改后：从 DuckDB 读取
def get_file_datasource(source_id: str):
    return metadata_manager.get_file_datasource(source_id)
```

## 性能优化

### 1. 内存缓存

```python
from functools import lru_cache
from datetime import datetime, timedelta

class MetadataManager:
    def __init__(self):
        self._cache = {}
        self._cache_ttl = timedelta(minutes=5)
    
    @lru_cache(maxsize=1000)
    def get_database_connection(self, conn_id: str):
        """带缓存的获取连接"""
        # 检查缓存
        if conn_id in self._cache:
            cached_data, cached_time = self._cache[conn_id]
            if datetime.now() - cached_time < self._cache_ttl:
                return cached_data
        
        # 从 DuckDB 读取
        data = self._fetch_from_duckdb(conn_id)
        
        # 更新缓存
        self._cache[conn_id] = (data, datetime.now())
        
        return data
    
    def invalidate_cache(self, conn_id: str = None):
        """清除缓存"""
        if conn_id:
            self._cache.pop(conn_id, None)
        else:
            self._cache.clear()
```

### 2. 批量操作

```python
def save_file_datasources_batch(self, datasources: List[FileDataSource]):
    """批量保存文件数据源"""
    with duckdb.connect(self.duckdb_path) as conn:
        # 使用批量插入
        conn.executemany(
            """
            INSERT INTO system_file_datasources 
            (source_id, filename, file_type, ...)
            VALUES (?, ?, ?, ...)
            """,
            [(ds.source_id, ds.filename, ds.file_type, ...) 
             for ds in datasources]
        )
```

### 3. 索引优化

```sql
-- 为常用查询字段创建索引
CREATE INDEX IF NOT EXISTS idx_db_conn_type ON system_database_connections(type);
CREATE INDEX IF NOT EXISTS idx_db_conn_status ON system_database_connections(status);
CREATE INDEX IF NOT EXISTS idx_file_ds_type ON system_file_datasources(file_type);
CREATE INDEX IF NOT EXISTS idx_file_ds_upload ON system_file_datasources(upload_time);
```

## 错误处理

### 1. 迁移失败处理

```python
class MigrationError(Exception):
    """迁移错误"""
    pass

def migrate_from_json(self):
    try:
        # 开始事务
        with duckdb.connect(self.duckdb_path) as conn:
            conn.begin()
            
            try:
                # 迁移数据库连接
                db_count = self._migrate_database_connections(conn)
                
                # 迁移文件数据源
                file_count = self._migrate_file_datasources(conn)
                
                # 验证迁移
                if not self._validate_migration(conn):
                    raise MigrationError("迁移验证失败")
                
                # 提交事务
                conn.commit()
                
                return MigrationResult(
                    success=True,
                    records_migrated=db_count + file_count
                )
            
            except Exception as e:
                # 回滚事务
                conn.rollback()
                raise MigrationError(f"迁移失败: {e}")
    
    except Exception as e:
        logger.error(f"迁移过程发生错误: {e}")
        return MigrationResult(
            success=False,
            error_message=str(e)
        )
```

### 2. 数据读取失败处理

```python
def get_database_connection(self, conn_id: str):
    try:
        with duckdb.connect(self.duckdb_path) as conn:
            result = conn.execute(
                "SELECT * FROM system_database_connections WHERE id = ?",
                [conn_id]
            ).fetchone()
            
            if not result:
                return None
            
            return self._parse_connection_row(result)
    
    except Exception as e:
        logger.error(f"读取数据库连接失败: {e}")
        raise DatabaseError(f"无法读取数据库连接: {e}")
```

## 测试策略

### 单元测试

```python
# tests/test_metadata_manager.py

def test_save_database_connection():
    """测试保存数据库连接"""
    manager = MetadataManager(":memory:")
    
    conn = DatabaseConnection(
        id="test_conn",
        name="Test Connection",
        type="mysql",
        params={"host": "localhost"}
    )
    
    assert manager.save_database_connection(conn)
    
    retrieved = manager.get_database_connection("test_conn")
    assert retrieved.id == "test_conn"
    assert retrieved.name == "Test Connection"

def test_migration_from_json():
    """测试从 JSON 迁移"""
    # 准备测试数据
    create_test_json_files()
    
    manager = MigrationManager(metadata_manager)
    result = manager.migrate_from_json()
    
    assert result.success
    assert result.records_migrated > 0
    
    # 验证数据
    connections = metadata_manager.list_database_connections()
    assert len(connections) > 0
```

### 集成测试

```python
# tests/integration/test_datasource_api.py

def test_datasource_api_after_migration():
    """测试迁移后 API 兼容性"""
    # 执行迁移
    migrate_from_json()
    
    # 测试 API
    response = client.get("/api/datasources")
    assert response.status_code == 200
    
    data = response.json()
    assert "database_sources" in data or "items" in data
```

## 部署计划

### 1. 准备阶段
- 备份现有 JSON 文件
- 备份 DuckDB 数据库文件
- 准备回滚脚本

### 2. 部署阶段
- 部署新版本代码
- 系统启动时自动执行迁移
- 监控迁移日志

### 3. 验证阶段
- 验证数据完整性
- 验证 API 功能正常
- 验证性能指标

### 4. 清理阶段
- 确认迁移成功后删除 JSON 文件
- 更新文档
- 通知用户

## 回滚计划

如果迁移失败或出现问题：

1. 停止应用
2. 恢复备份的 JSON 文件
3. 恢复备份的 DuckDB 文件
4. 回滚到旧版本代码
5. 重启应用
6. 分析失败原因

## 文档更新

需要更新的文档：
- README.md - 更新数据存储说明
- API 文档 - 更新数据源管理 API
- 部署文档 - 添加迁移说明
- 开发文档 - 更新元数据管理说明

## 监控和日志

### 关键指标
- 迁移成功率
- 迁移耗时
- 元数据查询响应时间
- 缓存命中率

### 日志记录
- 迁移开始/完成时间
- 迁移记录数
- 迁移错误信息
- 元数据操作日志
