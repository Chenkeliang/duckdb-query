# API Core 目录重构 - 任务清单

> **版本**: 2.5 (最终版)  
> **创建时间**: 2026-01-15  
> **状态**: 📋 待开始

---

## ⚠️ 关键实施要点

> [!CAUTION]
> **以下 8 点必须严格遵守，否则会导致运行时错误或 CI 漏检**

### 1. 绝对导入（Google 规范）
- **所有模块统一使用绝对导入**：`from core.common.config_manager import ...`
- 禁止相对导入 `from ..common import ...`
- 确保 `sys.path` 包含 `api/` 目录

### 2. 运行环境 sys.path
- 测试/脚本需保持 `sys.path.insert(0, 'api')` 以确保 `import core` 可用
- CI 命令示例：`cd api && python -m pytest tests/`

### 3. 目录创建顺序
- **先创建目标目录和 `__init__.py`，再移动文件**
- 缺少 `__init__.py` 会导致包导入失败

### 4. crypto_utils 调用方验证
- 确保所有原调用 `decrypt_config_passwords` 的地方都改为 `from core.foundation.crypto_utils import ...`
- 检查 `encryption.py` 精简后无遗留调用

### 5. 动态导入检测
- `rewrite_imports.py` 基于 regex，无法改写动态导入或字符串拼接
- dry-run 后需手动执行 `grep -r "core\." api/` 确认无遗漏
- 预期变更数 110+，明显偏少需排查

### 6. 分层黑名单验证
- 每层迁移后立即跑 `check_layer_constraints.py`
- CI 会阻断违规，避免运行时 ImportError

### 7. 导入全量测试注意事项
- `test_all_imports.py` 会执行每个 `.py`
- 依赖外部资源/环境变量的模块可能导致假阴性
- 对此类模块做条件跳过或 mock

### 8. 迁移顺序（严格按层）
- **foundation → common → database/security/data → services**
- 每层完成后跑验证，降低后期排查成本

---

## 📋 任务总览

| 阶段 | 任务 | 状态 | 预估 | 实际 |
|------|------|------|------|------|
| 0 | 前置准备与基线测量 | ⬜ | 1h | - |
| 1 | Linter 与 CI 配置 | ⬜ | 1h | - |
| 2 | 工具脚本创建 | ⬜ | 1.5h | - |
| 3 | foundation 层创建 | ⬜ | 1.5h | - |
| 4 | common 层迁移 | ⬜ | 1.5h | - |
| 5 | database 层迁移 | ⬜ | 1h | - |
| 6 | security 层迁移 | ⬜ | 0.5h | - |
| 7 | data 层迁移 | ⬜ | 0.5h | - |
| 8 | services 层迁移 | ⬜ | 1h | - |
| 9 | 批量导入改写 | ⬜ | 1h | - |
| 10 | 风格补全（全部文件） | ⬜ | 2h | - |
| 11 | 测试与验收 | ⬜ | 1.5h | - |

**图例**: ⬜ 待开始 | 🔄 进行中 | ✅ 已完成 | ❌ 已阻塞

---

## Phase 0: 前置准备与基线测量

### Task 0.1: Git 分支与环境
**优先级**: P0 | **状态**: ⬜

- [ ] 创建分支 `feature/api-core-refactor`
- [ ] 确保工作目录无未提交变更
- [ ] 确认 Python 虚拟环境激活

### Task 0.2: 运行迁移前测试基线
**优先级**: P0 | **状态**: ⬜

```bash
pytest api/tests/ -v --tb=short 2>&1 | tee docs/refactor-baseline-tests.txt
```

- [ ] 记录测试通过数: ____
- [ ] 记录测试失败数: ____（应为 0）

### Task 0.3: 性能基线测量
**优先级**: P0 | **状态**: ⬜

```bash
cd /Users/keliang/mypy/duckdb-query
time python -c "import sys; sys.path.insert(0, 'api'); import core"
```

- [ ] 记录 `import core` 耗时: ____ms
- [ ] 保存到 `docs/refactor-baseline-perf.md`

---

## Phase 1: Linter 与 CI 配置

### Task 1.1: 创建 Ruff 配置
**文件**: `api/pyproject.toml` 或 `api/ruff.toml`

```toml
[tool.ruff.lint]
select = ["E", "F", "I", "D", "ANN", "LOG", "TID252"]
```

- [ ] 创建 ruff 配置文件
- [ ] 启用 `TID252` 禁止相对导入
- [ ] 启用 `D` Google 风格 docstring
- [ ] 启用 `ANN` 类型注解检查
- [ ] 启用 `LOG` 日志格式检查

### Task 1.2: 创建 Makefile
**文件**: `api/Makefile`

- [ ] 导出 `PYTHONPATH=$(pwd)`
- [ ] 添加 `lint`, `test`, `verify` 目标
- [ ] 测试 `make verify` 可运行

### Task 1.3: 配置 CI 工作流
**文件**: `.github/workflows/lint.yml`

- [ ] 添加 ruff 检查步骤
- [ ] 添加分层约束检测步骤
- [ ] 添加全量导入测试步骤

---

## Phase 2: 工具脚本创建

### Task 2.1: 创建导入映射配置
**文件**: `api/scripts/import_mapping.json`

- [ ] 创建完整的旧→新路径映射表（27 条）
- [ ] 验证 JSON 格式正确

### Task 2.2: 创建 AST 批量改写脚本
**文件**: `api/scripts/rewrite_imports.py`

- [ ] 实现 AST 解析（处理相对导入）
- [ ] 实现 `--dry-run` 预览模式
- [ ] 转换相对导入为绝对导入
- [ ] 测试脚本可运行

### Task 2.3: 创建分层约束检测脚本
**文件**: `api/scripts/check_layer_constraints.py`

- [ ] 实现 AST 导入提取
- [ ] 解析相对导入为绝对路径
- [ ] 实现黑名单规则验证
- [ ] 测试脚本可运行

### Task 2.4: 创建相对导入检测脚本
**文件**: `api/scripts/check_relative_imports.py`

- [ ] 遍历 core/routers/tests 下所有 `.py`
- [ ] 检测 `node.level > 0` 的 ImportFrom
- [ ] 返回违规列表

### Task 2.5: 创建全量导入测试脚本
**文件**: `api/scripts/test_all_imports.py`

- [ ] 遍历所有 `.py` 文件
- [ ] 实现跳过列表（外部依赖模块）
- [ ] 尝试导入验证
- [ ] 返回错误汇总

---

## Phase 3: foundation 层创建

### Task 2.1: 创建目录结构
```bash
mkdir -p api/core/foundation
touch api/core/foundation/__init__.py
```

- [ ] 创建 `api/core/foundation/` 目录
- [ ] 创建空 `__init__.py`

### Task 2.2: 创建 crypto_utils.py
**文件**: `api/core/foundation/crypto_utils.py`

从 `encryption.py` 拆分：
- [ ] 复制 `_get_fernet()` 及相关私有函数
- [ ] 实现 `encrypt_string()`
- [ ] 实现 `decrypt_string()`
- [ ] 实现 `decrypt_config_passwords()`
- [ ] **确保无任何 `from core.*` 导入**

### Task 2.3: 创建 encoding_utils.py
**文件**: `api/core/foundation/encoding_utils.py`

- [ ] 实现 `safe_decode()` 
- [ ] 实现 `safe_encode_string()`
- [ ] 使用 `charset_normalizer`（硬依赖）
- [ ] **确保无任何 `from core.*` 或相对导入**

### Task 2.4: 迁移 timezone_utils.py
- [ ] 移动 `core/timezone_utils.py` → `core/foundation/`
- [ ] 检查并移除任何 `from core.*` 绝对导入
- [ ] 若有依赖 config_manager，改为函数参数传入（保持零依赖）
- [ ] 确保无相对导入到其他层

### Task 2.5: 验证 foundation 层
```bash
python -c "from core.foundation.encoding_utils import safe_decode; print('✅')"
python -c "from core.foundation.crypto_utils import decrypt_string; print('✅')"
python -c "from core.foundation.timezone_utils import get_current_time; print('✅')"
python api/scripts/check_layer_constraints.py
```

- [ ] 所有导入验证通过
- [ ] 分层约束检查通过

---

## Phase 3: common 层迁移

### Task 3.1: 创建目录结构
```bash
mkdir -p api/core/common
touch api/core/common/__init__.py
```

### Task 3.2: 迁移 config_manager.py（关键）
- [ ] 移动到 `core/common/`
- [ ] **更新导入**: `from core.encryption` → `from ..foundation.crypto_utils`
- [ ] 添加新配置字段（`api_pagination_mode` 等）
- [ ] 添加类型断言
- [ ] **验证所有 `decrypt_config_passwords` 调用方已更新**

### Task 3.3: 迁移 validators.py
- [ ] 移动到 `core/common/`
- [ ] 更新导入: 使用相对导入 `from .config_manager`
- [ ] 实现分页双模式校验（默认 enum）

### Task 3.4: 迁移其他 common 文件
- [ ] `exceptions.py` → `common/`
- [ ] `error_codes.py` → `common/`
- [ ] `cache_manager.py` → `common/`
- [ ] `utils.py` → `common/`
- [ ] `enhanced_error_handler.py` → `common/`

### Task 3.5: 更新内部导入为相对路径
- [ ] 检查所有 common 文件的 `from core.*` 导入
- [ ] 更新为 `from .xxx` 或 `from ..foundation.xxx`

### Task 3.6: 验证 common 层
```bash
python -c "from core.common.config_manager import config_manager; print('✅')"
python -c "from core.common.validators import validate_pagination; print('✅')"
python api/scripts/check_layer_constraints.py
```

- [ ] 所有导入验证通过
- [ ] 分层约束检查通过

---

## Phase 4: database 层迁移

### Task 4.1: 创建目录结构
```bash
mkdir -p api/core/database
touch api/core/database/__init__.py
```

### Task 4.2: 迁移 database 文件
- [ ] `duckdb_pool.py` → `database/`
- [ ] `duckdb_engine.py` → `database/`
- [ ] `database_manager.py` → `database/`
- [ ] `connection_registry.py` → `database/`
- [ ] `metadata_manager.py` → `database/`
- [ ] `table_metadata_cache.py` → `database/`

### Task 4.3: 更新内部导入
- [ ] `from core.config_manager` → `from ..common.config_manager`
- [ ] `from core.duckdb_pool` → `from .duckdb_pool`
- [ ] 替换 `safe_encode_string` 为 `..foundation.encoding_utils` 版本

### Task 4.4: 验证 database 层
```bash
python -c "from core.database.duckdb_engine import get_db_connection; print('✅')"
python -c "from core.database.duckdb_pool import get_connection_pool; print('✅')"
python api/scripts/check_layer_constraints.py
```

- [ ] 所有导入验证通过
- [ ] 分层约束检查通过

---

## Phase 5: security 层迁移

### Task 5.1: 创建目录结构
```bash
mkdir -p api/core/security
touch api/core/security/__init__.py
```

### Task 5.2: 迁移 encryption.py（精简版）
- [ ] 移动到 `core/security/`
- [ ] 移除已拆分到 `crypto_utils.py` 的函数
- [ ] 保留 `PasswordEncryptor` 类等高级封装
- [ ] 更新导入: `from ..foundation.crypto_utils import ...`

### Task 5.3: 迁移其他 security 文件
- [ ] `security.py` → `security/`
- [ ] `sql_injection_protection.py` → `security/`
- [ ] `rate_limiter.py` → `security/`

### Task 5.4: 更新内部导入
- [ ] 使用相对路径

### Task 5.5: 验证 security 层
```bash
python -c "from core.security.encryption import password_encryptor; print('✅')"
python -c "from core.security.security import security_validator; print('✅')"
python api/scripts/check_layer_constraints.py
```

- [ ] 所有导入验证通过
- [ ] 分层约束检查通过

---

## Phase 6: data 层迁移

### Task 6.1: 创建目录结构
```bash
mkdir -p api/core/data
touch api/core/data/__init__.py
```

### Task 6.2: 迁移 data 文件
- [ ] `file_datasource_manager.py` → `data/`
- [ ] `excel_import_manager.py` → `data/`
- [ ] `file_utils.py` → `data/`

### Task 6.3: 更新内部导入
- [ ] 替换编码处理逻辑为 `from ..foundation.encoding_utils import safe_decode`
- [ ] 更新其他 `from core.*` 导入

### Task 6.4: 验证 data 层
```bash
python -c "from core.data.file_datasource_manager import file_datasource_manager; print('✅')"
python api/scripts/check_layer_constraints.py
```

- [ ] 所有导入验证通过

---

## Phase 7: services 层迁移

### Task 7.1: 创建目录结构
```bash
mkdir -p api/core/services
touch api/core/services/__init__.py
```

### Task 7.2: 迁移 services 文件
- [ ] `task_manager.py` → `services/`
- [ ] `task_utils.py` → `services/`
- [ ] `visual_query_generator.py` → `services/`
- [ ] `cleanup_scheduler.py` → `services/`
- [ ] `resource_manager.py` → `services/`

### Task 7.3: 更新内部导入
- [ ] 使用相对路径 `from ..database.duckdb_pool import ...`
- [ ] 使用相对路径 `from ..common.config_manager import ...`

### Task 7.4: 验证 services 层
```bash
python -c "from core.services.task_manager import task_manager; print('✅')"
python -c "from core.services.visual_query_generator import get_table_metadata; print('✅')"
python api/scripts/check_layer_constraints.py
```

- [ ] 所有导入验证通过
- [ ] 分层约束检查通过

---

## Phase 8: 批量导入改写

### Task 8.1: 预览外部导入变更
```bash
python api/scripts/rewrite_imports.py --dry-run
```

- [ ] 确认变更数量合理（预期 110+ 处）
- [ ] 检查无误报

### Task 8.2: 执行批量改写
```bash
python api/scripts/rewrite_imports.py
```

- [ ] 执行导入改写
- [ ] 记录变更数量: ____ (预期 110+，偏少需排查)

### Task 8.3: 手动检测动态导入和字符串拼接
```bash
# 检测残留的绝对导入
grep -rn "from core\." api/ --include="*.py" | grep -v "__pycache__"
grep -rn "import core\." api/ --include="*.py" | grep -v "__pycache__"
```

- [ ] 检查动态导入（如 `importlib.import_module("core.xxx")`）
- [ ] 检查字符串拼接的模块路径
- [ ] 手动修复无法被 regex 改写的情况

### Task 8.4: 手动修复遗漏
- [ ] 搜索 `from core\.[a-z_]+` 检查是否有遗漏
- [ ] 手动修复特殊情况（如动态导入）

### Task 8.4: 验证所有文件可导入
```bash
python api/scripts/test_all_imports.py
```

- [ ] 无导入错误

---

## Phase 9: 测试与验收

### Task 9.1: 运行完整测试套件
```bash
pytest api/tests/ -v --tb=short
```

- [ ] 对比 Phase 0 基线
- [ ] 通过数: ____（应 >= 基线）
- [ ] 失败数: ____（应为 0）

### Task 9.2: 运行分层约束检测
```bash
python api/scripts/check_layer_constraints.py
```

- [ ] 无违规告警

### Task 9.3: 运行导入测试
```bash
pytest api/tests/test_import_paths.py -v
```

- [ ] 所有公共符号可访问

### Task 9.4: 性能对比测量
```bash
time python -c "import sys; sys.path.insert(0, 'api'); from core.database import duckdb_engine"
```

- [ ] 耗时在基线 +10% 以内

### Task 9.5: 手动验收
- [ ] 启动服务 `uvicorn main:app`
- [ ] 访问 API 确认正常响应
- [ ] 检查日志无导入警告

### Task 9.6: 灰度验证（可选）
- [ ] 部署到 staging 环境
- [ ] 运行 E2E 测试
- [ ] 观察 24h 无异常

---

## 🎯 验收标准

### 核心功能
- [ ] 27 个文件已按层级分类到子目录
- [ ] 2 个新增文件已创建
- [ ] 所有 110+ 处导入已更新为新路径
- [ ] `config_manager` 不再依赖 `security/encryption.py`
- [ ] 分页校验默认为枚举模式

### 质量指标
- [ ] 所有测试通过（0 回归）
- [ ] 分层黑名单检测通过
- [ ] 全量导入测试通过
- [ ] 性能增幅 < 10%

---

## 🔙 回滚计划

### 快速回滚命令

```bash
git checkout main -- api/core/
git checkout main -- api/routers/
git checkout main -- api/tests/
git checkout main -- api/scripts/
```

### 保护措施

- [ ] 重构分支保留 7 天
- [ ] 合并前需 2 人 Code Review
- [ ] CI 必须全绿才能合并

---

## 📝 完成后清理

### Task Final: 清理旧文件
- [ ] 删除 `api/core/*.py` 中已迁移的文件
- [ ] 保留 `api/core/__init__.py`（仅版本信息）
- [ ] 更新 `README.md` 说明新目录结构
