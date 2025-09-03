# Duck Query API 错误代码参考

## 错误响应格式

所有API错误响应都采用统一的格式：

```json
{
  "code": "ERROR_CODE",
  "message": "中文错误消息",
  "details": {
    "error_type": "异常类型",
    "timestamp": 1640995200.123,
    "original_error": "原始英文错误信息",
    "sql": "SQL语句（如果适用）"
  }
}
```

## 错误代码列表

### 通用错误

| 错误代码 | HTTP状态码 | 中文消息 | 说明 |
|---------|-----------|---------|------|
| UNKNOWN_ERROR | 500 | 未知错误 | 无法识别的错误类型 |
| INTERNAL_ERROR | 500 | 服务器内部错误 | 服务器内部异常 |
| VALIDATION_ERROR | 400 | 数据验证失败 | 请求参数验证失败 |

### SQL/数据库相关错误

| 错误代码 | HTTP状态码 | 中文消息 | 说明 |
|---------|-----------|---------|------|
| TABLE_NOT_FOUND | 404 | 表不存在 | 查询的表在数据库中不存在 |
| COLUMN_NOT_FOUND | 404 | 列不存在 | 查询的列在表中不存在 |
| SQL_SYNTAX_ERROR | 400 | SQL语法错误 | SQL语句语法不正确 |
| TYPE_CONVERSION_ERROR | 400 | 数据类型转换错误 | 数据类型转换失败 |
| QUERY_TIMEOUT | 408 | 查询超时 | 查询执行时间超过限制 |
| DUPLICATE_KEY_ERROR | 409 | 主键或唯一约束冲突 | 违反主键或唯一约束 |
| CONSTRAINT_VIOLATION | 400 | 数据约束违反 | 违反数据库约束条件 |

### 连接和网络错误

| 错误代码 | HTTP状态码 | 中文消息 | 说明 |
|---------|-----------|---------|------|
| CONNECTION_ERROR | 503 | 连接失败 | 网络连接或服务连接失败 |
| DATABASE_CONNECTION_ERROR | 503 | 数据库连接失败 | 无法连接到数据库 |
| NETWORK_ERROR | 503 | 网络错误 | 网络通信异常 |
| TIMEOUT_ERROR | 408 | 请求超时 | 请求处理超时 |

### 权限和认证错误

| 错误代码 | HTTP状态码 | 中文消息 | 说明 |
|---------|-----------|---------|------|
| PERMISSION_DENIED | 403 | 权限不足 | 没有执行操作的权限 |
| AUTHENTICATION_FAILED | 401 | 身份验证失败 | 用户身份验证失败 |
| AUTHORIZATION_FAILED | 403 | 授权失败 | 用户授权检查失败 |
| TOKEN_EXPIRED | 401 | 访问令牌已过期 | 访问令牌已过期，需要重新获取 |

### 资源相关错误

| 错误代码 | HTTP状态码 | 中文消息 | 说明 |
|---------|-----------|---------|------|
| RESOURCE_NOT_FOUND | 404 | 资源不存在 | 请求的资源不存在 |
| RESOURCE_ALREADY_EXISTS | 409 | 资源已存在 | 尝试创建已存在的资源 |
| INSUFFICIENT_MEMORY | 507 | 内存不足 | 服务器内存不足 |
| DISK_SPACE_INSUFFICIENT | 507 | 磁盘空间不足 | 服务器磁盘空间不足 |
| FILE_NOT_FOUND | 404 | 文件不存在 | 请求的文件不存在 |
| FILE_TOO_LARGE | 413 | 文件过大 | 上传的文件超过大小限制 |

### 业务逻辑错误

| 错误代码 | HTTP状态码 | 中文消息 | 说明 |
|---------|-----------|---------|------|
| INVALID_OPERATION | 400 | 无效操作 | 请求的操作无效 |
| OPERATION_NOT_ALLOWED | 405 | 操作不被允许 | 当前状态下不允许此操作 |
| CONCURRENT_MODIFICATION | 409 | 并发修改冲突 | 多个用户同时修改同一资源 |
| DATA_INTEGRITY_ERROR | 400 | 数据完整性错误 | 数据完整性检查失败 |

## 错误处理示例

### 前端处理示例

```javascript
try {
  const response = await executeDuckDBSQL(sql);
  // 处理成功响应
} catch (error) {
  if (error.code) {
    switch (error.code) {
      case 'TABLE_NOT_FOUND':
        showError('❌ 表不存在: ' + error.message);
        break;
      case 'SQL_SYNTAX_ERROR':
        showError('⚠️ SQL语法错误: ' + error.message);
        break;
      case 'COLUMN_NOT_FOUND':
        showError('❌ 列不存在: ' + error.message);
        break;
      // ... 其他错误类型
      default:
        showError('❌ 操作失败: ' + error.message);
    }
  }
}
```

### 错误分析规则

系统会根据原始错误消息自动分析错误类型：

- **表不存在**: 错误消息包含 "does not exist" 和 "table"
- **列不存在**: 错误消息包含 "column" 和 "does not exist"
- **语法错误**: 错误消息包含 "syntax error" 或 "parser error"
- **类型转换错误**: 错误消息包含 "conversion error" 或 "cast"
- **权限错误**: 错误消息包含 "permission" 或 "access"
- **内存不足**: 错误消息包含 "memory" 或 "out of memory"
- **连接错误**: 错误消息包含 "connection" 或 "network"
- **超时错误**: 错误消息包含 "timeout"

## 更新日志

- **v1.0.0**: 初始版本，定义基础错误代码
- **v1.1.0**: 添加SQL相关错误代码，支持中文错误消息
- **v1.2.0**: 完善资源和业务逻辑错误代码




