# API 标准化重构需求文档

> **版本**: 1.1  
> **创建时间**: 2024-12-23  
> **更新时间**: 2024-12-23  
> **状态**: 📋 需求收集阶段（已补充边界情况）

---

## 📋 需求概述

基于 API 代码审查结果，本文档定义后端 API 标准化重构需求，涵盖：

1. **安全加固** - 修复 SQL 注入、路径遍历（含符号链接）、敏感信息泄露
2. **响应格式统一** - 全部接口使用 `create_error_response` / `create_success_response`
3. **参数校验增强** - 创建公共验证模块，统一参数命名，错误必须包含 field 字段
4. **功能完善** - 添加分页（带 offset 上限）、超时、系统/Schema 保护等缺失功能

---

## 🔒 全局约束

### 代码规范
- **复用现有模块** - 使用 `utils/response_helpers.py` 的响应函数
- **统一校验逻辑** - 新建 `core/validators.py` 集中管理
- **向后兼容** - 所有改动不能破坏现有前端调用
- **TypeScript 类型同步** - 后端改动需同步更新 `frontend/src/types/api.d.ts`

### 安全规范
- **禁止字符串拼接 SQL** - 全部使用参数化查询或引号包裹
- **路径操作必须白名单校验** - 使用 `os.path.realpath` + 基础路径检查
- **日志禁止敏感信息** - 密码、密钥等不得出现在日志中

---

## 1️⃣ 安全加固（优先级 P0）

### 1.1 SQL 注入修复（全面覆盖）

| 位置 | 问题 | 修复方案 |
|------|------|----------|
| `duckdb_query.py:705` | DETACH 未用引号包裹 | 改为 `DETACH "{alias}"` |
| `duckdb_query.py:360` | save_as_table 未用引号 | **所有表名在 SQL 中必须用引号包裹** |
| `duckdb_query.py:666` | CREATE TABLE 中表名 | 使用 `"{table_name}"` |
| `async_tasks.py` | custom_table_name SQL 拼接 | 使用 `"{custom_table_name}"` |
| `async_tasks.py` alias | ✅ 已修复 | 使用 `SAFE_ALIAS_PATTERN` |

**⚠️ 核心原则：所有表名在 SQL 中必须用双引号包裹**

```python
# ✅ 正确写法 - 所有表名用引号包裹
con.execute(f'CREATE TABLE "{safe_table_name}" AS {sql}')
con.execute(f'DROP TABLE IF EXISTS "{table_name}"')
con.execute(f'DETACH "{alias}"')

# ❌ 错误写法 - 存在注入风险
con.execute(f'CREATE TABLE {table_name} AS {sql}')
```

### 1.2 路径遍历修复（含符号链接攻击）

| 位置 | 问题 | 修复方案 |
|------|------|----------|
| `server_files.py` | 浏览目录无白名单校验 | 添加 `validators.sanitize_path()` |
| `server_files.py` | 导入文件无白名单校验 | 同上 |
| 新增 | 符号链接绕过白名单 | **检测并禁止符号链接** |

**修复代码（含符号链接检测）**：
```python
def sanitize_path(path: str, allowed_bases: List[str]) -> str:
    """校验路径安全性，防止遍历攻击和符号链接绕过"""
    real_path = os.path.realpath(path)
    
    # 检查路径是否在白名单内
    if not any(real_path.startswith(os.path.realpath(base)) for base in allowed_bases):
        raise HTTPException(403, detail={
            "code": "PATH_NOT_ALLOWED",
            "message": "不允许访问该路径",
            "field": "path"
        })
    
    # 禁止符号链接（防止白名单内的符号链接指向外部）
    if os.path.islink(path):
        raise HTTPException(403, detail={
            "code": "SYMLINK_NOT_ALLOWED",
            "message": "不允许访问符号链接",
            "field": "path"
        })
    
    return real_path
```

### 1.3 敏感信息日志修复

| 位置 | 问题 | 修复方案 |
|------|------|---------|
| `duckdb_query.py:622` | 日志泄露密码解密信息 | 删除该行日志 |

**修复代码**：
```python
# 删除这行
logger.info(f"已解密连接 {attach_db.connection_id} 的密码")
```

---

## 2️⃣ 响应格式统一（优先级 P1）

### 2.1 当前状态

| 模块 | 使用 response_helpers | 需要改造 |
|------|----------------------|----------|
| `settings.py` | ✅ 已使用 | - |
| `datasources.py` | ⚠️ 部分使用 | 统一全部 |
| `duckdb_query.py` | ❌ 未使用 | 全部接口 |
| `async_tasks.py` | ❌ 未使用 | 全部接口 |
| `paste_data.py` | ❌ 未使用 | 全部接口 |
| `server_files.py` | ❌ 未使用 | 全部接口 |

### 2.2 统一响应格式

**成功响应**：
```python
from utils.response_helpers import create_success_response, MessageCode

return create_success_response(
    data={"table_name": "xxx", "row_count": 100},
    message_code=MessageCode.OPERATION_SUCCESS,
    message="查询成功"
)
```

**错误响应**：
```python
from utils.response_helpers import create_error_response

raise HTTPException(
    status_code=400,
    detail=create_error_response(
        code="VALIDATION_ERROR",
        message="表名格式无效",
        details={"field": "table_name", "value": name}
    )
)
```

### 2.3 新增 MessageCode

在 `response_helpers.py` 添加：

```python
class MessageCode(str, Enum):
    # 新增
    QUERY_SUCCESS = "QUERY_SUCCESS"
    TABLE_CREATED = "TABLE_CREATED"
    TABLE_DELETED = "TABLE_DELETED"
    TASK_SUBMITTED = "TASK_SUBMITTED"
    TASK_CANCELLED = "TASK_CANCELLED"
    FILE_UPLOADED = "FILE_UPLOADED"
    EXPORT_SUCCESS = "EXPORT_SUCCESS"
```

---

## 3️⃣ 公共校验模块（优先级 P1）

### 3.1 新建 `api/core/validators.py`

```python
"""
公共参数校验模块

所有错误响应必须包含 field 字段，便于前端定位问题
"""
import re
import os
from typing import List
from fastapi import HTTPException

# 复用 async_tasks.py 的正则
SAFE_TABLE_NAME_PATTERN = re.compile(r'^[a-zA-Z_][a-zA-Z0-9_]{0,63}$')
SAFE_ALIAS_PATTERN = re.compile(r'^[a-zA-Z_][a-zA-Z0-9_]*$')
SAFE_SHORTCUT_PATTERN = re.compile(r'^(Cmd|Ctrl|Alt|Shift)(\+(Cmd|Ctrl|Alt|Shift|[A-Z0-9]))+$')

# 保护的 Schema 和表前缀
PROTECTED_SCHEMAS = ["information_schema", "pg_catalog", "duckdb_"]
PROTECTED_PREFIX = "system_"

# 分页上限（防止大 offset 导致性能问题）



def validate_table_name(name: str, field: str = "table_name") -> None:
    """校验表名格式（含系统表和 Schema 保护）"""
    if not name:
        return  # 允许空值（可选参数）
    
    # 检查是否为保护的 schema
    if "." in name:
        schema = name.split(".")[0].lower()
        for protected in PROTECTED_SCHEMAS:
            if schema == protected or schema.startswith(protected):
                raise HTTPException(403, detail={
                    "code": "PROTECTED_SCHEMA",
                    "message": f"不允许操作系统 Schema: {schema}",
                    "field": field
                })
    
    # 检查保留前缀
    if name.lower().startswith(PROTECTED_PREFIX):
        raise HTTPException(403, detail={
            "code": "RESERVED_NAME",
            "message": f"不能使用 {PROTECTED_PREFIX} 前缀的保留表名",
            "field": field
        })
    
    # 检查格式
    if not SAFE_TABLE_NAME_PATTERN.match(name):
        raise HTTPException(400, detail={
            "code": "INVALID_TABLE_NAME",
            "message": f"表名格式无效: {name}，只能包含字母、数字、下划线，长度不超过64",
            "field": field,
            "details": {"pattern": "^[a-zA-Z_][a-zA-Z0-9_]{0,63}$"}
        })


def validate_alias(alias: str, field: str = "alias") -> None:
    """校验数据库别名格式"""
    if not SAFE_ALIAS_PATTERN.match(alias):
        raise HTTPException(400, detail={
            "code": "INVALID_ALIAS",
            "message": f"别名格式无效: {alias}",
            "field": field
        })


def validate_shortcut(shortcut: str) -> None:
    """校验快捷键格式"""
    if not SAFE_SHORTCUT_PATTERN.match(shortcut):
        raise HTTPException(400, detail={
            "code": "INVALID_SHORTCUT",
            "message": f"快捷键格式无效: {shortcut}，必须为 Cmd+X 格式",
            "field": "shortcut"
        })


def sanitize_path(path: str, allowed_bases: List[str]) -> str:
    """校验并规范化路径，防止遍历攻击和符号链接绕过"""
    real_path = os.path.realpath(path)
    
    # 检查路径是否在白名单内
    if not any(real_path.startswith(os.path.realpath(base)) for base in allowed_bases):
        raise HTTPException(403, detail={
            "code": "PATH_NOT_ALLOWED",
            "message": "不允许访问该路径",
            "field": "path"
        })
    
    # 禁止符号链接（防止白名单内的符号链接指向外部）
    if os.path.islink(path):
        raise HTTPException(403, detail={
            "code": "SYMLINK_NOT_ALLOWED",
            "message": "不允许访问符号链接",
            "field": "path"
        })
    
    return real_path


def validate_pagination(limit: int, offset: int) -> None:
    """校验分页参数"""
    allowed_limits = [20, 50, 100]
    if limit not in allowed_limits:
        raise HTTPException(400, detail={
            "code": "INVALID_LIMIT",
            "message": f"limit 必须为 {allowed_limits} 之一",
            "field": "limit",
            "details": {"allowed": allowed_limits}
        })
    if offset < 0:
        raise HTTPException(400, detail={
            "code": "INVALID_OFFSET",
            "message": "offset 不能为负数",
            "field": "offset"
        })
```

### 3.2 错误响应必须包含 field 字段

**规范**：所有 400 错误响应必须包含 `field` 字段，便于前端定位问题

```json
{
  "code": "INVALID_TABLE_NAME",
  "message": "表名格式无效",
  "field": "table_name",
  "details": {"pattern": "^[a-zA-Z_][a-zA-Z0-9_]{0,63}$"}
}
```

---

## 4️⃣ 功能完善（优先级 P2）

### 4.1 异步任务分页

**当前问题**：`/api/async_tasks` 无分页，大量任务时性能差

**修复方案**：

```python
# async_tasks.py
@router.get("/api/async_tasks", response_model=TaskListResponse)
async def list_async_tasks(
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    order_by: str = Query(default="created_at_desc")
):
    tasks = task_manager.list_tasks(limit=limit, offset=offset, order_by=order_by)
    total = task_manager.count_tasks()
    return {
        "success": True,
        "tasks": tasks,
        "count": len(tasks),
        "total": total,
        "limit": limit,
        "offset": offset
    }
```

### 4.2 连接测试超时

**当前问题**：`/api/datasources/databases/test` 无超时

**修复方案**：

```python
# datasources.py
from pydantic import Field

class TestConnectionRequest(BaseModel):
    type: str
    params: dict
    timeout: int = Field(default=10, ge=1, le=60, description="连接超时秒数")
```

### 4.3 系统表保护

**当前问题**：`DELETE /api/duckdb/tables/{name}` 可删除系统表

**修复方案**：

```python
# duckdb_query.py
from core.validators import validate_table_name

@router.delete("/api/duckdb/tables/{table_name}")
async def delete_duckdb_table(table_name: str):
    validate_table_name(table_name)  # 包含 system_ 前缀检查
    # ... 继续处理
```

### 4.4 参数命名统一（含冲突检测）

**当前问题**：save_as_table / table_alias / custom_table_name 命名不一致

**修复方案**：使用 Pydantic Field alias 兼容多种写法，并检测冲突

```python
from pydantic import Field, validator, root_validator

class SaveQueryRequest(BaseModel):
    sql: str
    table_name: Optional[str] = Field(default=None, alias="table_alias")
    
    class Config:
        populate_by_name = True  # 允许同时使用 table_name 和 table_alias
    
    @root_validator(pre=True)
    def check_alias_conflict(cls, values):
        """table_name 和 table_alias 不能同时传且值不同"""
        table_name = values.get('table_name')
        table_alias = values.get('table_alias')
        
        if table_name and table_alias and table_name != table_alias:
            raise ValueError(
                f"参数冲突: table_name='{table_name}' 与 table_alias='{table_alias}' 不一致"
            )
        
        return values
```

### 4.5 路由命名统一

**当前问题**：`async-tasks` vs `async_tasks` 不一致

**修复方案**：添加别名路由

```python
# async_tasks.py
@router.post("/api/async_tasks/{task_id}/download")
@router.post("/api/async-tasks/{task_id}/download")  # 兼容路由
async def download_result(task_id: str, ...):
    ...
```

---

## 5️⃣ 返回字段修复（优先级 P3）

| 位置 | 问题 | 修复方案 |
|------|------|---------|
| `paste_data.py:221` | 同时返回 `created_at` 和 `createdAt` | 删除 `createdAt` |
| `database_tables.py` | 缺少 `estimated_row_count` | 添加该字段 |
| `datasources.py` | ID 格式文档不清 | docstring 说明 db_{id} 格式 |

---

## 📊 优先级排序

| 任务 | 优先级 | 工作量 | 风险 |
|------|--------|--------|------|
| DETACH SQL 注入修复 | P0 | 小 | 低 |
| 路径遍历修复 | P0 | 小 | 低 |
| 敏感日志删除 | P0 | 小 | 低 |
| 创建 validators.py | P1 | 中 | 低 |
| 响应格式统一 | P1 | 大 | 中 |
| 异步任务分页 | P2 | 中 | 低 |
| 系统表保护 | P2 | 小 | 低 |
| 参数命名统一 | P3 | 中 | 低 |
| 返回字段修复 | P3 | 小 | 低 |

---

## 🔗 相关文件

### 需要修改
- `api/routers/duckdb_query.py` - 主查询接口
- `api/routers/async_tasks.py` - 异步任务接口
- `api/routers/datasources.py` - 数据源管理接口
- `api/routers/server_files.py` - 服务器文件接口
- `api/routers/paste_data.py` - 粘贴数据接口
- `api/routers/settings.py` - 设置接口（已较好）
- `api/utils/response_helpers.py` - 响应工具（需扩展）

### 需要新建
- `api/core/validators.py` - 公共校验模块

### 需要更新
- `frontend/src/types/api.d.ts` - TypeScript 类型定义
- `docs/NEW_UI_API_REFERENCE.md` - API 文档
