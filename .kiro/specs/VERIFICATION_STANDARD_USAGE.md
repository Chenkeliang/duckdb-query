# 验证标准使用指南

## 📚 文档说明

本指南说明如何使用验证标准来验证新 UI 组件的改造质量。

---

## 📁 验证标准文档结构

```
.kiro/specs/
├── VERIFICATION_STANDARD.md          # 详细验证标准（完整版）
├── VERIFICATION_STANDARD_CHECK.sh    # 自动化验证脚本
├── VERIFICATION_CHECKLIST.md         # 快速验证清单（简化版）
└── VERIFICATION_STANDARD_USAGE.md    # 本文档（使用指南）
```

---

## 🎯 使用场景

### 场景 1: 改造新组件前

**目的**: 了解验证标准，确保改造符合要求

**步骤**:
1. 阅读 [VERIFICATION_STANDARD.md](VERIFICATION_STANDARD.md)
2. 了解验证项和通过标准
3. 参考已通过验证的组件示例

**时间**: 15分钟

---

### 场景 2: 改造完成后

**目的**: 验证组件是否符合标准

**步骤**:
1. 运行自动化验证脚本
2. 填写验证清单
3. 修复发现的问题
4. 重新验证直到通过

**时间**: 15-30分钟

---

### 场景 3: 代码审查时

**目的**: 审查组件质量

**步骤**:
1. 查看验证报告
2. 检查验证清单
3. 确认所有项都通过
4. 批准或要求修改

**时间**: 10分钟

---

## 🚀 快速开始

### 步骤 1: 运行自动化验证（5分钟）

```bash
# 进入项目根目录
cd /path/to/duckdb-query

# 运行验证脚本
.kiro/specs/VERIFICATION_STANDARD_CHECK.sh ComponentName

# 示例
.kiro/specs/VERIFICATION_STANDARD_CHECK.sh DataPasteCard
```

**输出示例**:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔍 新 UI 组件验证标准 - 自动化检查
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

组件名称: DataPasteCard
组件文件: frontend/src/new/DataSource/DataPasteCard.tsx

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 第一部分：代码层面验证
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1.1 文件结构检查
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ 组件文件存在
✅ 使用 .tsx 扩展名

1.2 代码规范检查
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ 无硬编码颜色
✅ 无直接使用 CSS 变量
✅ 使用 i18n 翻译 (45 处)
✅ 使用 shadcn/ui 组件 (5 个)

...

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 验证结果总结
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

总检查项: 20
通过: 18
失败: 0
警告: 2

通过率: 90%

🎉 自动化验证通过！
```

---

### 步骤 2: 填写验证清单（10分钟）

1. 打开 [VERIFICATION_CHECKLIST.md](VERIFICATION_CHECKLIST.md)
2. 复制一份到组件目录
3. 按照清单逐项验证
4. 记录验证结果

**示例**:
```bash
# 复制验证清单
cp .kiro/specs/VERIFICATION_CHECKLIST.md \
   .kiro/specs/excel-sheet-selector-fix/DataPasteCard_VERIFICATION.md

# 编辑验证清单
vim .kiro/specs/excel-sheet-selector-fix/DataPasteCard_VERIFICATION.md
```

---

### 步骤 3: 修复问题（如有）

如果验证发现问题：

1. 查看 [VERIFICATION_STANDARD.md](VERIFICATION_STANDARD.md) 的"常见问题修复指南"
2. 修复问题
3. 重新运行验证
4. 直到所有检查通过

---

## 📖 详细使用说明

### 使用自动化验证脚本

#### 基本用法
```bash
.kiro/specs/VERIFICATION_STANDARD_CHECK.sh ComponentName
```

#### 参数说明
- `ComponentName`: 组件名称（不含扩展名）
- 脚本会自动查找 `frontend/src/new/DataSource/ComponentName.tsx`

#### 返回值
- `0`: 验证通过
- `1`: 验证失败

#### 示例
```bash
# 验证 DataPasteCard
.kiro/specs/VERIFICATION_STANDARD_CHECK.sh DataPasteCard

# 验证 UploadPanel
.kiro/specs/VERIFICATION_STANDARD_CHECK.sh UploadPanel

# 验证 DatabaseForm
.kiro/specs/VERIFICATION_STANDARD_CHECK.sh DatabaseForm
```

---

### 使用验证清单

#### 1. 复制清单模板
```bash
cp .kiro/specs/VERIFICATION_CHECKLIST.md \
   .kiro/specs/your-feature/ComponentName_VERIFICATION.md
```

#### 2. 填写基本信息
```markdown
**组件名称**: DataPasteCard
**验证日期**: 2024-12-02
**验证人**: Your Name
```

#### 3. 逐项验证
按照清单逐项检查，勾选通过的项：
```markdown
- [x] 操作成功显示绿色 Toast
- [x] Toast 消息清晰易懂
- [ ] Toast 在屏幕右上角  # 未通过
```

#### 4. 记录问题
```markdown
### 发现的问题

1. **问题描述**: Toast 位置不正确
   - **严重程度**: [x] 高 [ ] 中 [ ] 低
   - **修复状态**: [ ] 已修复 [x] 待修复
```

#### 5. 填写总体评价
```markdown
### 总体评价
- **结论**: [ ] 通过验证 [x] 需要修复
- **可以发布**: [ ] 是 [x] 否
```

---

### 使用详细标准文档

[VERIFICATION_STANDARD.md](VERIFICATION_STANDARD.md) 包含：

1. **验证标准概览** - 了解验证层级
2. **验证清单** - 详细的检查项
3. **快速验证流程** - 自动化 + 手动验证
4. **验证报告模板** - 记录验证结果
5. **常见问题修复指南** - 解决常见问题
6. **参考文档** - 相关文档链接

**使用建议**:
- 改造前：阅读"验证标准概览"和"验证清单"
- 改造中：参考"代码模式"和"参考文档"
- 改造后：使用"快速验证流程"和"验证报告模板"
- 遇到问题：查看"常见问题修复指南"

---

## 🎯 验证流程图

```
开始改造新组件
    ↓
阅读验证标准
    ↓
实现组件功能
    ↓
运行自动化验证 ←─────┐
    ↓                  │
自动化验证通过？        │
    ├─ 否 → 修复问题 ──┘
    ↓ 是
填写验证清单
    ↓
手动验证 ←─────────┐
    ↓                │
手动验证通过？        │
    ├─ 否 → 修复问题 ┘
    ↓ 是
提交验证报告
    ↓
代码审查
    ↓
发布组件
```

---

## 📊 验证标准版本

### 当前版本: v1.0.0

**包含内容**:
- 代码层面验证（4项）
- 功能层面验证（4项）
- 用户体验验证（4项）
- 自动化验证脚本
- 验证清单模板
- 使用指南

**适用范围**:
- 所有 `frontend/src/new/` 目录下的组件
- 基于 shadcn/ui 的新 UI 组件
- 使用 Tailwind CSS 的组件

---

## 🔄 持续改进

### 反馈机制

如果发现验证标准有问题或需要改进：

1. 记录问题和改进建议
2. 更新验证标准文档
3. 更新版本号
4. 通知团队成员

### 版本更新

当验证标准更新时：

1. 更新 `VERIFICATION_STANDARD.md`
2. 更新 `VERIFICATION_STANDARD_CHECK.sh`
3. 更新 `VERIFICATION_CHECKLIST.md`
4. 更新本文档
5. 通知所有开发人员

---

## 📞 获取帮助

### 遇到问题？

1. **查看文档**
   - [VERIFICATION_STANDARD.md](VERIFICATION_STANDARD.md) - 详细标准
   - [VERIFICATION_CHECKLIST.md](VERIFICATION_CHECKLIST.md) - 快速清单

2. **查看示例**
   - [DataPasteCard.tsx](file:frontend/src/new/DataSource/DataPasteCard.tsx)
   - [UploadPanel.tsx](file:frontend/src/new/DataSource/UploadPanel.tsx)
   - [DatabaseForm.tsx](file:frontend/src/new/DataSource/DatabaseForm.tsx)

3. **查看测试文档**
   - [QUICK_TEST_CHECKLIST.md](excel-sheet-selector-fix/QUICK_TEST_CHECKLIST.md)
   - [AUTOMATED_VERIFICATION.md](excel-sheet-selector-fix/AUTOMATED_VERIFICATION.md)

4. **联系团队**
   - 提出问题
   - 寻求帮助
   - 分享经验

---

## 🎉 总结

### 验证标准的价值

1. **统一质量标准** - 所有组件质量一致
2. **提高开发效率** - 减少返工和修复
3. **降低维护成本** - 代码质量高，bug 少
4. **改善用户体验** - 交互一致，体验好

### 使用建议

1. **改造前先阅读** - 了解标准和要求
2. **改造中参考示例** - 学习最佳实践
3. **改造后认真验证** - 确保质量达标
4. **持续改进标准** - 根据实践优化

---

**记住**: 验证标准是为了帮助你写出更好的代码，而不是限制你的创造力。如果有更好的方案，欢迎提出改进建议！🚀
