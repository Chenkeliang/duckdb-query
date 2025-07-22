# 归档目录说明

## 📁 目录结构

```
archive/
├── README.md                    # 本说明文档
├── old-tests/                   # 旧版测试脚本
│   ├── comprehensive-advanced-test.sh  # 综合高级测试（已废弃）
│   ├── comprehensive-test.sh           # 综合测试（已废弃）
│   ├── final-rigorous-test.sh          # 最终严格测试（已废弃）
│   ├── fix-failed-scenarios.sh         # 失败场景修复（已废弃）
│   └── simple-api-test.sh              # 简单API测试（已废弃）
└── deprecated/                  # 已废弃的功能和代码
```

## 📋 归档说明

### 旧版测试脚本 (old-tests/)
这些是项目早期开发阶段使用的测试脚本，现已被新的聚合测试系统替代：

#### comprehensive-advanced-test.sh
- **用途**: 早期的综合高级功能测试
- **状态**: 已废弃
- **替代**: tests/run-all-tests.sh

#### comprehensive-test.sh  
- **用途**: 早期的综合功能测试
- **状态**: 已废弃
- **替代**: tests/scripts/test-all-functions.sh

#### final-rigorous-test.sh
- **用途**: 最终严格测试脚本
- **状态**: 已废弃
- **替代**: tests/run-all-tests.sh

#### fix-failed-scenarios.sh
- **用途**: 失败场景的修复测试
- **状态**: 已废弃
- **替代**: 各个专项测试脚本

#### simple-api-test.sh
- **用途**: 简单的API功能测试
- **状态**: 已废弃
- **替代**: tests/scripts/test-api-functions.sh

## 🔄 迁移说明

### 从旧测试脚本迁移
如果需要使用旧测试脚本的功能，请参考新的测试系统：

```bash
# 旧方式（已废弃）
./comprehensive-test.sh

# 新方式（推荐）
./run-tests.sh
```

### 功能对应关系
- `comprehensive-*` → `tests/run-all-tests.sh`
- `simple-api-test.sh` → `tests/scripts/test-api-functions.sh`
- `fix-failed-scenarios.sh` → 各专项修复测试脚本

## ⚠️ 重要提醒

### 不建议使用归档文件
- 这些文件仅作历史记录保存
- 可能包含过时的逻辑和配置
- 新开发请使用当前的测试系统

### 清理计划
- 定期评估归档文件的价值
- 删除确认不再需要的文件
- 保留有历史价值的重要文件

## 📚 历史价值

这些归档文件记录了项目的发展历程：
- 测试策略的演进
- 问题解决方案的迭代
- 代码质量改进的过程

## 🗑️ 清理指南

### 安全删除条件
文件可以安全删除当：
- 功能已完全被新系统替代
- 超过6个月未使用
- 确认无历史参考价值

### 保留条件
文件应该保留当：
- 包含独特的解决方案
- 有重要的历史参考价值
- 可能在未来需要参考
