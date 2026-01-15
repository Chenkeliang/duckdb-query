# API Core 目录重构需求文档

> **版本**: 2.5 (最终版)  
> **创建时间**: 2026-01-15  
> **状态**: 📝 需求确认

---

## 📋 需求概述

对 `api/core` 目录进行**完整重构**（无兼容层，全量改路），解决以下问题：
1. **目录扁平化**：27 个文件全部平铺，难以维护
2. **硬编码泛滥**：配置项散落在代码中
3. **重复逻辑**：编码处理工具在多处重复实现
4. **隐式依赖**：`config_manager` → `encryption` 存在循环风险

### 重构策略

> [!CAUTION]
> **本次采用"无兼容层、全量改路"策略，遵循 Google Python Style Guide**

| 策略 | 说明 |
|------|------|
| **绝对导入** | 统一使用 `from core.xxx import`（Google 规范） |
| **完整路径更新** | 所有 110+ 处导入全部更新为新路径 |
| **无兼容 shim** | 不使用 `sys.modules` 别名或 Re-export |
| **脚本化改写** | 使用 AST/regex 脚本批量更新导入 |
| **分层约束** | CI 自动检测层级违规 |
| **原子迁移** | 每层迁移后立即验证 |

---

## 📁 完整文件映射表（27 + 2 新增）

| # | 原路径 | 新路径 | 层级 |
|---|--------|--------|------|
| 1 | `core/timezone_utils.py` | `core/foundation/timezone_utils.py` | L0 |
| 2 | _(新增拆分)_ | `core/foundation/crypto_utils.py` | L0 |
| 3 | _(新增)_ | `core/foundation/encoding_utils.py` | L0 |
| 4 | `core/config_manager.py` | `core/common/config_manager.py` | L1 |
| 5 | `core/validators.py` | `core/common/validators.py` | L1 |
| 6 | `core/exceptions.py` | `core/common/exceptions.py` | L1 |
| 7 | `core/error_codes.py` | `core/common/error_codes.py` | L1 |
| 8 | `core/cache_manager.py` | `core/common/cache_manager.py` | L1 |
| 9 | `core/utils.py` | `core/common/utils.py` | L1 |
| 10 | `core/enhanced_error_handler.py` | `core/common/enhanced_error_handler.py` | L1 |
| 11 | `core/duckdb_engine.py` | `core/database/duckdb_engine.py` | L2 |
| 12 | `core/duckdb_pool.py` | `core/database/duckdb_pool.py` | L2 |
| 13 | `core/database_manager.py` | `core/database/database_manager.py` | L2 |
| 14 | `core/connection_registry.py` | `core/database/connection_registry.py` | L2 |
| 15 | `core/metadata_manager.py` | `core/database/metadata_manager.py` | L2 |
| 16 | `core/table_metadata_cache.py` | `core/database/table_metadata_cache.py` | L2 |
| 17 | `core/encryption.py` | `core/security/encryption.py` | L2 |
| 18 | `core/security.py` | `core/security/security.py` | L2 |
| 19 | `core/sql_injection_protection.py` | `core/security/sql_injection_protection.py` | L2 |
| 20 | `core/rate_limiter.py` | `core/security/rate_limiter.py` | L2 |
| 21 | `core/file_datasource_manager.py` | `core/data/file_datasource_manager.py` | L2 |
| 22 | `core/excel_import_manager.py` | `core/data/excel_import_manager.py` | L2 |
| 23 | `core/file_utils.py` | `core/data/file_utils.py` | L2 |
| 24 | `core/task_manager.py` | `core/services/task_manager.py` | L3 |
| 25 | `core/task_utils.py` | `core/services/task_utils.py` | L3 |
| 26 | `core/visual_query_generator.py` | `core/services/visual_query_generator.py` | L3 |
| 27 | `core/cleanup_scheduler.py` | `core/services/cleanup_scheduler.py` | L3 |
| 28 | `core/resource_manager.py` | `core/services/resource_manager.py` | L3 |

---

## 🏗️ 分层约束定义

```
Layer 0 (foundation): 零依赖基础工具
    ├── encoding_utils.py   # 编码处理
    ├── crypto_utils.py     # 基础加解密（从 encryption.py 拆分）
    └── timezone_utils.py   # 时区工具

Layer 1 (common): 仅依赖 foundation
    ├── config_manager.py   # 从 foundation.crypto_utils 导入
    ├── validators.py
    ├── exceptions.py
    └── ...

Layer 2 (database/security/data): 可依赖 L0, L1，但不互相依赖
    ├── database/*
    ├── security/*
    └── data/*

Layer 3 (services): 可依赖所有低层
    └── task_manager.py, visual_query_generator.py, ...
```

### 分层黑名单规则（CI 强制）

| 层级 | 禁止依赖 |
|------|---------|
| `foundation/*` | 任何 `core.*` |
| `common/*` | `database/*`, `security/*`, `data/*`, `services/*` |
| `database/*` | `security/*`, `data/*`, `services/*` |
| `security/*` | `database/*`, `data/*`, `services/*` |
| `data/*` | `database/*`, `security/*`, `services/*` |

---

## 🔧 关键解耦设计

### config_manager → encryption 循环打破

**问题**：`config_manager.py:28` 直接导入 `core.encryption.decrypt_config_passwords`

**解决方案**：
1. 将 `decrypt_config_passwords` 及底层加解密原语拆分到 `foundation/crypto_utils.py`
2. `config_manager` 从 `foundation.crypto_utils` 导入（符合 L1 → L0）
3. `security/encryption.py` 保留高级封装，从 `foundation.crypto_utils` 导入原语

---

## 🎛️ 分页校验双模式

### 配置项

```json
{
  "api_pagination_mode": "enum",  // 默认枚举模式，兼容旧行为
  "api_pagination_limits": [20, 50, 100],
  "api_max_page_size": 2000
}
```

### 模式说明

| 模式 | 行为 | 默认 |
|------|------|------|
| `enum` | `limit` 必须在 `api_pagination_limits` 列表中 | ✅ 默认（兼容旧行为） |
| `range` | `1 <= limit <= api_max_page_size` | 需显式配置 |

### 环境变量覆盖

```bash
API_PAGINATION_MODE=range
API_PAGINATION_LIMITS='[20, 50, 100, 200]'  # JSON 数组格式
API_MAX_PAGE_SIZE=5000
```

### 错误格式回退

环境变量格式错误时：记录 WARNING 日志，使用配置文件值或默认值。

---

## 📦 硬依赖声明

### charset-normalizer

- **状态**：硬依赖（已在 `requirements.txt`：`charset-normalizer==3.4.4`）
- **无降级逻辑**：编码检测直接使用 charset-normalizer
- **解码失败策略**：使用 `errors='replace'`，记录 DEBUG 日志

---

## 📊 性能验收

### 基线测量方法

```bash
# 环境：开发机 macOS / CI Ubuntu
# Python: 3.11+
# 测量命令：
cd /Users/keliang/mypy/duckdb-query
time python -c "import sys; sys.path.insert(0, 'api'); import core"
```

### 验收标准

| 指标 | 标准 |
|------|------|
| 模块加载时间 | 与主分支基线对比，增幅 < 10% |
| `config_manager.get_app_config()` | < 1ms |

---

## 🧪 测试计划

### 迁移前基线
- [ ] 运行 `pytest api/tests/` 记录通过/失败数
- [ ] 保存测量结果到 `docs/refactor-baseline.md`

### 自动化测试
- [ ] **导入测试**：遍历所有 `.py` 做 `importlib.import_module`（CI 门槛）
- [ ] **分层黑名单检测**：AST 扫描 + import 验证脚本
- [ ] **编码工具测试**：空字节、超大数据、混合编码
- [ ] **配置测试**：缺失字段、错误格式、类型错误
- [ ] **并发测试**：`ConfigManager` 多线程写入锁有效性

---

## 🔙 回滚与灰度策略

### 灰度验证

1. 在 staging 环境部署重构版本
2. 运行完整 E2E 测试套件
3. 观察 24h 无异常后合入 main

### 快速回滚

```bash
# 回滚到主分支状态
git checkout main -- api/core/
git checkout main -- api/routers/
git checkout main -- api/tests/
git checkout main -- api/scripts/
```

### 保护措施

- 重构分支与 main 分支并行保留 7 天
- 合并前需 2 人 Code Review

---

## ✅ 验收标准

### 功能验收
- [ ] 27 个文件已按层级分类到子目录
- [ ] 2 个新增文件已创建（`crypto_utils.py`, `encoding_utils.py`）
- [ ] 所有 110+ 处导入已更新为新路径
- [ ] `config_manager` 不再依赖 `security/encryption.py`
- [ ] 分页校验默认为枚举模式

### 质量验收
- [ ] 所有测试通过（0 回归）
- [ ] 分层黑名单检测通过
- [ ] 循环依赖检测通过
- [ ] 导入测试覆盖所有公共符号

### 性能验收
- [ ] 模块加载时间增幅 < 10%
