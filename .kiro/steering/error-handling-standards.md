# 错误处理规范标准（2026-01 更新）

> **创建时间**: 2026-01-23  
> **版本**: 1.0  
> **状态**: ✅ 待实施

## 🎯 核心原则

### 1. 统一错误处理
- **禁止静默错误** - 所有错误必须被处理或记录
- **用户友好提示** - 错误信息要清晰、可操作
- **结构化错误** - 使用标准错误格式
- **错误追踪** - 记录错误上下文便于调试

### 2. 错误分类
- **业务错误** - 用户操作导致的预期错误
- **系统错误** - 代码 bug 或系统故障
- **网络错误** - API 调用失败
- **验证错误** - 数据验证失败

## 📋 前端错误处理规范

### 禁止的做法

```typescript
// ❌ 错误 1: 静默错误
try {
  await deleteTable(tableName);
} catch (error) {
  // 什么都不做 - 用户不知道发生了什么
}

// ❌ 错误 2: 只打印日志
try {
  await uploadFile(file);
} catch (error) {
  console.error(error);  // 用户看不到错误
}

// ❌ 错误 3: 泛化错误信息
try {
  await executeQuery(sql);
} catch (error) {
  toast.error('操作失败');  // 信息不明确
}

// ❌ 错误 4: 不记录错误上下文
try {
  await createConnection(config);
} catch (error) {
  toast.error(error.message);  // 缺少上下文
}
```

### 推荐的做法

```typescript
// ✅ 正确：完整的错误处理
import { logger } from '@/utils/logger';
import { showErrorToast } from '@/utils/toast';
import { useTranslation } from 'react-i18next';

try {
  await deleteTable(tableName);
  showSuccessToast(t, 'TABLE_DELETED', t('table.deleteSuccess'));
} catch (error) {
  // 1. 记录错误（包含上下文）
  logger.error('Failed to delete table', {
    tableName,
    error: error.message,
    stack: error.stack,
    userId: currentUser?.id,
  });
  
  // 2. 显示用户友好的错误提示
  showErrorToast(
    t,
    error as Error,
    t('table.deleteFailed', { tableName })
  );
  
  // 3. 可选：上报错误到监控服务
  if (import.meta.env.PROD) {
    reportErrorToSentry(error, { tableName });
  }
}
```

### 错误处理工具

```typescript
// frontend/src/utils/errorHandler.ts

import { logger } from './logger';

export interface ErrorContext {
  operation: string;
  resource?: string;
  userId?: string;
  [key: string]: unknown;
}

export class AppError extends Error {
  constructor(
    message: string,
    public code: string,
    public context?: ErrorContext
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function handleError(
  error: unknown,
  context: ErrorContext,
  options?: {
    showToast?: boolean;
    logLevel?: 'error' | 'warn';
    rethrow?: boolean;
  }
) {
  const {
    showToast = true,
    logLevel = 'error',
    rethrow = false,
  } = options || {};

  // 1. 标准化错误对象
  const normalizedError = normalizeError(error);
  
  // 2. 记录错误
  logger[logLevel]('Operation failed', {
    ...context,
    error: normalizedError.message,
    code: normalizedError.code,
    stack: normalizedError.stack,
  });
  
  // 3. 显示用户提示
  if (showToast) {
    showErrorToast(
      t,
      normalizedError,
      t('errors.operationFailed', { operation: context.operation })
    );
  }
  
  // 4. 可选：重新抛出
  if (rethrow) {
    throw normalizedError;
  }
}

function normalizeError(error: unknown): AppError {
  if (error instanceof AppError) {
    return error;
  }
  
  if (error instanceof Error) {
    return new AppError(error.message, 'UNKNOWN_ERROR');
  }
  
  return new AppError(
    String(error),
    'UNKNOWN_ERROR'
  );
}
```

### API 错误处理

```typescript
// frontend/src/api/client.ts

import axios from 'axios';
import { logger } from '@/utils/logger';

export const apiClient = axios.create({
  baseURL: '/api',
  timeout: 30000,
});

// 响应拦截器
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    // 1. 提取错误信息
    const errorData = {
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data,
      url: error.config?.url,
      method: error.config?.method,
    };
    
    // 2. 记录错误
    logger.error('API request failed', errorData);
    
    // 3. 转换为标准错误
    const appError = new AppError(
      error.response?.data?.message || error.message,
      error.response?.data?.messageCode || 'API_ERROR',
      errorData
    );
    
    return Promise.reject(appError);
  }
);
```

### React 错误边界

```typescript
// frontend/src/components/ErrorBoundary.tsx

import React from 'react';
import { logger } from '@/utils/logger';

interface Props {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // 记录错误
    logger.error('React component error', {
      error: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
    });
    
    // 上报到监控服务
    if (import.meta.env.PROD) {
      reportErrorToSentry(error, {
        componentStack: errorInfo.componentStack,
      });
    }
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="error-boundary">
          <h2>Something went wrong</h2>
          <p>{this.state.error?.message}</p>
          <button onClick={() => window.location.reload()}>
            Reload Page
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
```

## 🐍 后端错误处理规范

### 禁止的做法

```python
# ❌ 错误 1: 静默错误
try:
    result = execute_query(sql)
except Exception:
    pass  # 什么都不做

# ❌ 错误 2: 泛化异常捕获
try:
    result = process_data(data)
except Exception as e:
    return {"error": "Failed"}  # 信息不明确

# ❌ 错误 3: 不记录错误
try:
    conn = create_connection(config)
except Exception as e:
    raise HTTPException(status_code=500, detail=str(e))

# ❌ 错误 4: 暴露敏感信息
try:
    result = db.execute(sql)
except Exception as e:
    raise HTTPException(
        status_code=500,
        detail=f"SQL: {sql}, Error: {e}"  # 可能暴露敏感数据
    )
```

### 推荐的做法

```python
# ✅ 正确：完整的错误处理
import logging
from fastapi import HTTPException
from utils.response_helpers import create_error_response, MessageCode

logger = logging.getLogger(__name__)

@router.post("/api/tables")
async def create_table(request: CreateTableRequest):
    try:
        result = await table_service.create(request)
        return create_success_response(
            data={"table": result},
            message_code=MessageCode.TABLE_CREATED
        )
    except ValueError as e:
        # 业务错误 - 用户输入问题
        logger.warning(
            "Invalid table creation request",
            extra={
                "table_name": request.table_name,
                "error": str(e),
                "user_id": current_user.id,
            }
        )
        raise HTTPException(
            status_code=400,
            detail=create_error_response(
                code=MessageCode.VALIDATION_ERROR,
                message=str(e)
            )
        )
    except ConnectionError as e:
        # 系统错误 - 数据库连接问题
        logger.error(
            "Database connection failed",
            exc_info=True,
            extra={
                "table_name": request.table_name,
                "user_id": current_user.id,
            }
        )
        raise HTTPException(
            status_code=503,
            detail=create_error_response(
                code=MessageCode.DATABASE_ERROR,
                message="Database connection failed"
            )
        )
    except Exception as e:
        # 未预期的错误
        logger.critical(
            "Unexpected error in create_table",
            exc_info=True,
            extra={
                "table_name": request.table_name,
                "user_id": current_user.id,
            }
        )
        raise HTTPException(
            status_code=500,
            detail=create_error_response(
                code=MessageCode.INTERNAL_ERROR,
                message="An unexpected error occurred"
            )
        )
```

### 自定义异常类

```python
# api/core/common/exceptions.py

class DuckQueryException(Exception):
    """基础异常类"""
    def __init__(self, message: str, code: str, details: dict = None):
        self.message = message
        self.code = code
        self.details = details or {}
        super().__init__(self.message)

class ValidationError(DuckQueryException):
    """验证错误"""
    def __init__(self, message: str, details: dict = None):
        super().__init__(message, "VALIDATION_ERROR", details)

class DatabaseError(DuckQueryException):
    """数据库错误"""
    def __init__(self, message: str, details: dict = None):
        super().__init__(message, "DATABASE_ERROR", details)

class ConnectionError(DuckQueryException):
    """连接错误"""
    def __init__(self, message: str, details: dict = None):
        super().__init__(message, "CONNECTION_ERROR", details)

class QueryError(DuckQueryException):
    """查询错误"""
    def __init__(self, message: str, details: dict = None):
        super().__init__(message, "QUERY_ERROR", details)
```

### 全局异常处理器

```python
# api/main.py

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from core.common.exceptions import DuckQueryException
import logging

logger = logging.getLogger(__name__)

app = FastAPI()

@app.exception_handler(DuckQueryException)
async def duckquery_exception_handler(
    request: Request,
    exc: DuckQueryException
):
    """处理自定义异常"""
    logger.error(
        f"DuckQuery exception: {exc.code}",
        extra={
            "code": exc.code,
            "message": exc.message,
            "details": exc.details,
            "path": request.url.path,
            "method": request.method,
        }
    )
    
    return JSONResponse(
        status_code=400,
        content=create_error_response(
            code=exc.code,
            message=exc.message,
            details=exc.details
        )
    )

@app.exception_handler(Exception)
async def global_exception_handler(
    request: Request,
    exc: Exception
):
    """处理未捕获的异常"""
    logger.critical(
        "Unhandled exception",
        exc_info=True,
        extra={
            "path": request.url.path,
            "method": request.method,
        }
    )
    
    return JSONResponse(
        status_code=500,
        content=create_error_response(
            code="INTERNAL_ERROR",
            message="An unexpected error occurred"
        )
    )
```

## 🚫 严格禁止

### 前端
- ❌ 禁止空的 catch 块
- ❌ 禁止只用 console.error 处理错误
- ❌ 禁止向用户显示技术错误信息
- ❌ 禁止在错误信息中暴露敏感数据

### 后端
- ❌ 禁止使用 `except Exception: pass`
- ❌ 禁止在错误响应中包含完整的 SQL 查询
- ❌ 禁止在错误响应中包含堆栈跟踪（生产环境）
- ❌ 禁止不记录错误就重新抛出

## ✅ 必须遵循

### 错误处理检查清单

- [ ] 所有 try-catch 块都有实际的错误处理
- [ ] 错误被记录到日志系统
- [ ] 用户收到友好的错误提示
- [ ] 错误包含足够的上下文信息
- [ ] 敏感信息已被脱敏
- [ ] 生产环境不暴露技术细节

### 错误信息规范

```typescript
// ✅ 好的错误信息
"Failed to delete table 'users'. The table is being used by another query."
"Connection to database 'mydb' timed out. Please check your network."
"Invalid SQL syntax near 'SELCT'. Did you mean 'SELECT'?"

// ❌ 差的错误信息
"Error"
"Something went wrong"
"Exception occurred"
"null pointer exception at line 123"
```

## 📊 错误处理最佳实践

| 场景 | 处理方式 | 示例 |
|------|---------|------|
| 用户输入错误 | 验证 + 提示 | "Table name cannot be empty" |
| 网络错误 | 重试 + 提示 | "Network error, retrying..." |
| 权限错误 | 提示 + 引导 | "You don't have permission. Contact admin." |
| 系统错误 | 记录 + 通用提示 | "An error occurred. Please try again." |

## 🔧 ESLint 规则建议

```javascript
// lint-rules/eslint/rules/no-empty-catch.js
module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description: '禁止空的 catch 块',
      category: 'Best Practices',
      recommended: true,
    },
    messages: {
      emptyCatch: 'Empty catch block. Handle the error or at least log it.',
    },
  },
  create(context) {
    return {
      CatchClause(node) {
        if (node.body.body.length === 0) {
          context.report({
            node,
            messageId: 'emptyCatch',
          });
        }
      },
    };
  },
};
```

## 📁 相关文件

| 文件 | 用途 |
|------|------|
| `frontend/src/utils/errorHandler.ts` | 前端错误处理工具 |
| `frontend/src/components/ErrorBoundary.tsx` | React 错误边界 |
| `api/core/common/exceptions.py` | 自定义异常类 |
| `api/main.py` | 全局异常处理器 |

---

**维护者**: 项目团队  
**审核周期**: 每季度更新
