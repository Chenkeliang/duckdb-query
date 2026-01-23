# 新增规范约束总结（2026-01-23）

> **创建时间**: 2026-01-23  
> **状态**: ✅ 已创建，待实施

## 📊 新增规范概览

| 规范名称 | 优先级 | 状态 | 文件 |
|---------|--------|------|------|
| 日志规范 | 🔴 高 | ✅ 已创建 | `logging-standards.md` |
| 错误处理规范 | 🔴 高 | ✅ 已创建 | `error-handling-standards.md` |
| 国际化强制规范 | 🔴 高 | ✅ 已创建 | `i18n-enforcement-standards.md` |
| 性能优化规范 | 🟡 中 | 📋 建议创建 | `performance-standards.md` |
| 安全规范 | 🟡 中 | 📋 建议创建 | `security-standards.md` |
| 代码注释规范 | 🟢 低 | 📋 建议创建 | `documentation-standards.md` |

## 🎯 已创建的规范

### 1. 日志规范标准 (logging-standards.md) 🔴

**创建原因**：
- 代码中大量使用 `console.log/error/warn`（发现 50+ 处）
- 缺乏统一的日志管理和分级
- 生产环境日志混乱，难以追踪问题

**核心内容**：
- ✅ 禁止直接使用 `console.*`
- ✅ 统一使用 `logger` 工具
- ✅ 日志分级：DEBUG, INFO, WARN, ERROR
- ✅ 结构化日志格式
- ✅ 敏感信息脱敏
- ✅ 生产环境日志上报

**影响范围**：
- 前端：所有 `.ts/.tsx` 文件
- 后端：所有 `.py` 文件
- 需要创建：`frontend/src/utils/logger.ts`
- 需要创建：`api/core/common/logging_config.py`

**实施建议**：
1. 创建日志工具类
2. 添加 ESLint 规则 `no-console`
3. 逐步替换现有 `console.*` 调用
4. 配置生产环境日志上报（Sentry/LogRocket）

### 2. 错误处理规范标准 (error-handling-standards.md) 🔴

**创建原因**：
- 发现多处空的 catch 块或静默错误
- 错误信息不友好，缺少上下文
- 缺乏统一的错误处理机制

**核心内容**：
- ✅ 禁止静默错误（空 catch 块）
- ✅ 统一错误处理流程
- ✅ 用户友好的错误提示
- ✅ 错误上下文记录
- ✅ 自定义异常类
- ✅ React 错误边界

**影响范围**：
- 前端：所有 try-catch 块
- 后端：所有异常处理
- 需要创建：`frontend/src/utils/errorHandler.ts`
- 需要创建：`frontend/src/components/ErrorBoundary.tsx`
- 需要创建：`api/core/common/exceptions.py`

**实施建议**：
1. 创建错误处理工具类
2. 添加 ESLint 规则 `no-empty-catch`
3. 在应用根组件添加 ErrorBoundary
4. 统一 API 错误处理拦截器
5. 添加全局异常处理器

### 3. 国际化强制规范标准 (i18n-enforcement-standards.md) 🔴

**创建原因**：
- 代码中存在大量硬编码中文文本
- 缺乏统一的国际化管理
- 需要支持多语言切换
- 后端消息已替换为英文，前端需要配套规范

**核心内容**：
- ✅ 禁止硬编码中文文本
- ✅ 前端强制使用 i18n (react-i18next)
- ✅ 后端禁止中文 message（使用 MessageCode）
- ✅ 后端日志使用英文
- ✅ 翻译文件结构规范
- ✅ ESLint 规则 `require-i18n`（已实现）

**影响范围**：
- 前端：所有 UI 文本、toast 消息、placeholder、label
- 后端：所有 API 响应、日志、异常消息
- 需要：完善翻译文件（zh/en）

**实施建议**：
1. 启用 ESLint `require-i18n` 规则（已实现）
2. 添加 Pylint `no-chinese-messages` 规则
3. 完善翻译文件
4. 逐步替换硬编码文本
5. 添加语言切换功能测试

## 📋 建议创建的规范

### 3. 性能优化规范 (performance-standards.md) 🟡

**建议原因**：
- 发现多处性能警告日志（如 ColumnFilterMenu 计算耗时）
- 缺乏统一的性能优化指导
- 大数据量场景需要优化策略

**建议内容**：
- React 性能优化（useMemo, useCallback, React.memo）
- 虚拟滚动和分页策略
- 数据库查询优化
- 网络请求优化（防抖、节流、缓存）
- 打包优化（代码分割、懒加载）

### 4. 安全规范 (security-standards.md) 🟡

**建议原因**：
- 代码中已有敏感信息正则检测（`api/core/security/security.py`）
- 需要统一的安全最佳实践
- SQL 注入、XSS 等安全问题需要规范

**建议内容**：
- SQL 注入防护
- XSS 防护
- CSRF 防护
- 敏感信息处理（密码、token）
- 输入验证和清理
- 安全的文件上传

### 5. 代码注释规范 (documentation-standards.md) 🟢

**建议原因**：
- 代码注释质量参差不齐
- 缺乏统一的文档注释格式
- API 文档需要规范化

**建议内容**：
- JSDoc/TSDoc 注释规范
- Python docstring 规范
- 函数/类/模块注释要求
- 复杂逻辑注释要求
- API 文档生成规范

## 🔧 配套 Lint 规则建议

### 已建议的规则

| 规则名称 | 类型 | 检查内容 | 文件 |
|---------|------|---------|------|
| `no-console` | ESLint | 禁止使用 console.* | `logging-standards.md` |
| `no-empty-catch` | ESLint | 禁止空 catch 块 | `error-handling-standards.md` |
| `require-i18n` | ESLint | 检测中文字符串，要求使用 i18n | `i18n-enforcement-standards.md` ✅ 已实现 |

### 建议新增的规则

| 规则名称 | 类型 | 检查内容 | 优先级 |
|---------|------|---------|--------|
| `require-error-logging` | ESLint | catch 块必须记录错误 | 🔴 高 |
| `no-sensitive-data-in-logs` | ESLint/Pylint | 禁止记录敏感信息 | 🔴 高 |
| `no-chinese-messages` | Pylint | 禁止中文消息（日志、异常） | 🔴 高 |
| `require-jsdoc` | ESLint | 公共函数必须有注释 | 🟡 中 |
| `no-large-inline-data` | ESLint | 禁止大量内联数据 | 🟢 低 |

## 📈 实施计划

### 阶段 1: 基础设施（1-2 周）

- [ ] 创建日志工具类（前端 + 后端）
- [ ] 创建错误处理工具类（前端 + 后端）
- [ ] 添加 ErrorBoundary 组件
- [ ] 配置全局异常处理器

### 阶段 2: Lint 规则（1 周）

- [ ] 实现 `no-console` ESLint 规则
- [ ] 实现 `no-empty-catch` ESLint 规则
- [ ] 实现 `require-error-logging` ESLint 规则
- [ ] 更新 `.eslintrc` 和 `.pylintrc` 配置

### 阶段 3: 代码迁移（2-3 周）

- [ ] 替换所有 `console.*` 为 `logger.*`
- [ ] 修复所有空 catch 块
- [ ] 添加错误上下文记录
- [ ] 统一错误提示信息

### 阶段 4: 文档和培训（1 周）

- [ ] 更新 AGENTS.md
- [ ] 编写迁移指南
- [ ] 团队培训
- [ ] 代码审查检查清单

## 🎓 开发者指南

### 快速参考

#### 日志使用

```typescript
// ❌ 错误
console.log('User clicked button');
console.error('API failed:', error);

// ✅ 正确
import { logger } from '@/utils/logger';
logger.debug('User clicked button', { userId, buttonId });
logger.error('API failed', { error, endpoint });
```

#### 错误处理

```typescript
// ❌ 错误
try {
  await deleteTable(name);
} catch (error) {
  // 空 catch 块
}

// ✅ 正确
try {
  await deleteTable(name);
} catch (error) {
  logger.error('Delete failed', { name, error });
  showErrorToast(t, error, t('table.deleteFailed'));
}
```

### 检查清单

提交代码前检查：

- [ ] 没有使用 `console.log/error/warn/debug`
- [ ] 所有 catch 块都有错误处理
- [ ] 错误都被记录到日志
- [ ] 用户收到友好的错误提示
- [ ] 敏感信息已脱敏
- [ ] 通过 ESLint/Pylint 检查

## 📊 预期收益

### 量化指标

| 指标 | 当前 | 目标 | 改进 |
|------|------|------|------|
| 生产环境错误追踪 | 困难 | 容易 | +80% |
| 错误定位时间 | 30 分钟 | 5 分钟 | -83% |
| 用户错误反馈 | 模糊 | 清晰 | +90% |
| 代码可维护性 | 中 | 高 | +50% |

### 质量提升

- ✅ 统一的日志格式，便于搜索和分析
- ✅ 完善的错误追踪，快速定位问题
- ✅ 用户友好的错误提示，提升体验
- ✅ 规范的代码风格，降低维护成本

## 🔗 相关文档

### 新增规范

- [日志规范标准](./logging-standards.md)
- [错误处理规范标准](./error-handling-standards.md)
- [国际化强制规范标准](./i18n-enforcement-standards.md)

### 现有规范

- [AGENTS.md](../../AGENTS.md)
- [前端开发约束](./frontend-constraints.md)
- [后端开发约束](./backend-constraints.md)
- [API 响应格式标准](./api-response-format-standard.md)

### Lint 规则

- [Lint 规则总览](../../lint-rules/README.md)
- [Lint 规则实施总结](../../lint-rules/IMPLEMENTATION_SUMMARY.md)
- [Lint 规则测试报告](../../lint-rules/TEST_REPORT.md)

## 🤝 反馈与改进

如有任何问题或建议，请：

1. 提交 Issue 到项目仓库
2. 在团队会议中讨论
3. 联系规范维护者

---

**创建者**: AI Assistant  
**审核者**: 待指定  
**下次审核**: 2026-02-23  
**状态**: ✅ 已创建，待团队评审和实施
