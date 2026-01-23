# 日志规范标准（2026-01 更新）

> **创建时间**: 2026-01-23  
> **版本**: 1.0  
> **状态**: ✅ 待实施

## 🎯 核心原则

### 1. 统一日志管理
- **禁止直接使用** `console.log/error/warn/debug`
- **必须使用** 统一的日志工具
- **分级管理** - DEBUG, INFO, WARN, ERROR
- **结构化日志** - 便于搜索和分析

### 2. 日志分类
- **开发日志** - 仅在开发环境输出
- **生产日志** - 错误和关键信息
- **调试日志** - 可通过配置开启
- **审计日志** - 用户操作记录

## 📋 前端日志规范

### 禁止的做法

```typescript
// ❌ 错误：直接使用 console
console.log('User clicked button');
console.error('API call failed:', error);
console.warn('Deprecated feature used');
console.debug('Debug info:', data);
```

### 推荐的做法

```typescript
// ✅ 正确：使用日志工具
import { logger } from '@/utils/logger';

// 开发日志（仅开发环境）
logger.debug('User clicked button', { userId, buttonId });

// 错误日志（生产环境也记录）
logger.error('API call failed', { error, endpoint, params });

// 警告日志
logger.warn('Deprecated feature used', { feature, alternative });

// 信息日志
logger.info('User logged in', { userId, timestamp });
```

### 日志工具实现

```typescript
// frontend/src/utils/logger.ts

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogContext {
  [key: string]: unknown;
}

class Logger {
  private isDevelopment = import.meta.env.DEV;
  private enabledLevels: Set<LogLevel>;

  constructor() {
    // 生产环境只记录 warn 和 error
    this.enabledLevels = this.isDevelopment
      ? new Set(['debug', 'info', 'warn', 'error'])
      : new Set(['warn', 'error']);
  }

  private log(level: LogLevel, message: string, context?: LogContext) {
    if (!this.enabledLevels.has(level)) return;

    const timestamp = new Date().toISOString();
    const logData = {
      timestamp,
      level,
      message,
      ...context,
    };

    // 开发环境：美化输出
    if (this.isDevelopment) {
      const styles = {
        debug: 'color: #888',
        info: 'color: #0066cc',
        warn: 'color: #ff9800',
        error: 'color: #f44336',
      };
      console.log(`%c[${level.toUpperCase()}] ${message}`, styles[level], context || '');
    } else {
      // 生产环境：结构化输出
      console[level === 'debug' ? 'log' : level](JSON.stringify(logData));
    }

    // 生产环境：发送到日志服务
    if (!this.isDevelopment && (level === 'error' || level === 'warn')) {
      this.sendToLogService(logData);
    }
  }

  private sendToLogService(logData: unknown) {
    // TODO: 实现日志上报
    // 可以使用 Sentry, LogRocket, 或自建日志服务
  }

  debug(message: string, context?: LogContext) {
    this.log('debug', message, context);
  }

  info(message: string, context?: LogContext) {
    this.log('info', message, context);
  }

  warn(message: string, context?: LogContext) {
    this.log('warn', message, context);
  }

  error(message: string, context?: LogContext) {
    this.log('error', message, context);
  }
}

export const logger = new Logger();
```

### 使用场景

| 场景 | 日志级别 | 示例 |
|------|---------|------|
| 调试信息 | DEBUG | `logger.debug('Component mounted', { props })` |
| 用户操作 | INFO | `logger.info('User clicked export', { format })` |
| 性能警告 | WARN | `logger.warn('Slow query detected', { duration })` |
| API 错误 | ERROR | `logger.error('API call failed', { error, endpoint })` |
| 异常捕获 | ERROR | `logger.error('Unexpected error', { error, stack })` |

## 🐍 后端日志规范

### 禁止的做法

```python
# ❌ 错误：直接使用 print
print("User logged in")
print(f"Error: {error}")

# ❌ 错误：未配置的 logger
import logging
logging.info("Message")  # 未配置格式和级别
```

### 推荐的做法

```python
# ✅ 正确：使用配置好的 logger
import logging

logger = logging.getLogger(__name__)

# 调试日志
logger.debug("Processing request", extra={"user_id": user_id})

# 信息日志
logger.info("User logged in", extra={"user_id": user_id, "ip": ip_address})

# 警告日志
logger.warning("Deprecated API used", extra={"endpoint": endpoint})

# 错误日志
logger.error("Database query failed", exc_info=True, extra={"query": query})
```

### 日志配置

```python
# api/core/common/logging_config.py

import logging
import sys
from pathlib import Path

def setup_logging(log_level: str = "INFO", log_file: str = None):
    """配置应用日志"""
    
    # 日志格式
    log_format = (
        "%(asctime)s - %(name)s - %(levelname)s - "
        "%(filename)s:%(lineno)d - %(message)s"
    )
    
    # 基础配置
    logging.basicConfig(
        level=getattr(logging, log_level.upper()),
        format=log_format,
        handlers=[
            logging.StreamHandler(sys.stdout),
        ]
    )
    
    # 文件日志（可选）
    if log_file:
        log_path = Path(log_file)
        log_path.parent.mkdir(parents=True, exist_ok=True)
        file_handler = logging.FileHandler(log_file)
        file_handler.setFormatter(logging.Formatter(log_format))
        logging.getLogger().addHandler(file_handler)
    
    # 第三方库日志级别
    logging.getLogger("uvicorn").setLevel(logging.WARNING)
    logging.getLogger("fastapi").setLevel(logging.WARNING)
```

### 使用场景

| 场景 | 日志级别 | 示例 |
|------|---------|------|
| 调试信息 | DEBUG | `logger.debug("SQL query", extra={"sql": sql})` |
| 请求日志 | INFO | `logger.info("API request", extra={"endpoint": path})` |
| 性能警告 | WARNING | `logger.warning("Slow query", extra={"duration": ms})` |
| 业务错误 | ERROR | `logger.error("Query failed", exc_info=True)` |
| 系统错误 | CRITICAL | `logger.critical("DB connection lost")` |

## 🚫 严格禁止

### 前端
- ❌ 禁止在生产代码中使用 `console.log`
- ❌ 禁止在生产代码中使用 `console.debug`
- ❌ 禁止在 catch 块中静默错误（必须记录）
- ❌ 禁止记录敏感信息（密码、token、个人信息）

### 后端
- ❌ 禁止使用 `print()` 输出日志
- ❌ 禁止在生产环境使用 DEBUG 级别
- ❌ 禁止记录完整的 SQL 查询（可能包含敏感数据）
- ❌ 禁止记录用户密码、token 等敏感信息

## ✅ 必须遵循

### 日志内容规范

1. **结构化信息**
   ```typescript
   // ✅ 好
   logger.error('API call failed', { 
     endpoint: '/api/tables',
     method: 'GET',
     statusCode: 500,
     error: error.message
   });
   
   // ❌ 差
   logger.error(`API call to /api/tables failed with 500: ${error}`);
   ```

2. **敏感信息脱敏**
   ```typescript
   // ✅ 好
   logger.info('User login', { 
     userId: user.id,
     email: maskEmail(user.email)  // user@example.com -> u***@example.com
   });
   
   // ❌ 差
   logger.info('User login', { 
     userId: user.id,
     email: user.email,
     password: user.password  // 绝对禁止！
   });
   ```

3. **错误上下文**
   ```typescript
   // ✅ 好
   try {
     await executeQuery(sql);
   } catch (error) {
     logger.error('Query execution failed', {
       sql: sql.substring(0, 100),  // 只记录前100字符
       error: error.message,
       stack: error.stack,
       userId: currentUser.id
     });
     throw error;
   }
   
   // ❌ 差
   try {
     await executeQuery(sql);
   } catch (error) {
     console.error(error);  // 信息不足
     throw error;
   }
   ```

## 📊 日志级别使用指南

| 级别 | 使用场景 | 生产环境 | 示例 |
|------|---------|---------|------|
| DEBUG | 详细调试信息 | ❌ 不输出 | 函数参数、中间变量 |
| INFO | 一般信息 | ✅ 输出 | 用户操作、API 调用 |
| WARN | 警告信息 | ✅ 输出 | 性能问题、废弃功能 |
| ERROR | 错误信息 | ✅ 输出 | 异常、失败操作 |
| CRITICAL | 严重错误 | ✅ 输出 | 系统崩溃、数据丢失 |

## 🔧 ESLint 规则建议

```javascript
// lint-rules/eslint/rules/no-console.js
module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description: '禁止使用 console，应使用 logger',
      category: 'Best Practices',
      recommended: true,
    },
    messages: {
      noConsole: '禁止使用 console.{{method}}，请使用 logger.{{method}}',
    },
  },
  create(context) {
    return {
      MemberExpression(node) {
        if (
          node.object.name === 'console' &&
          ['log', 'error', 'warn', 'debug', 'info'].includes(node.property.name)
        ) {
          context.report({
            node,
            messageId: 'noConsole',
            data: {
              method: node.property.name === 'log' ? 'debug' : node.property.name,
            },
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
| `frontend/src/utils/logger.ts` | 前端日志工具 |
| `api/core/common/logging_config.py` | 后端日志配置 |
| `lint-rules/eslint/rules/no-console.js` | ESLint 规则 |

## 🔗 参考资源

- [Winston (Node.js logging)](https://github.com/winstonjs/winston)
- [Python logging best practices](https://docs.python.org/3/howto/logging.html)
- [Structured logging](https://www.structlog.org/)

---

**维护者**: 项目团队  
**审核周期**: 每季度更新
