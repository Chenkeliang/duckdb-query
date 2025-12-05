# DataSource Panel - 额外问题修复

## 修复日期
2024-12-05

## 新发现的问题

### 问题 5: isFetching 缺失 ⚠️ 中等
**文件**: `frontend/src/new/hooks/useDatabaseConnections.ts`

**问题**: `useDatabaseConnections` 未返回 `isFetching`，导致刷新按钮无法显示后台加载状态。

**修复**: 添加 `isFetching: query.isFetching` 到返回值。

---

### 问题 6: 搜索高亮正则注入 ⚠️ 中等
**文件**: `frontend/src/new/Query/DataSourcePanel/TableItem.tsx`

**问题**: 搜索高亮未转义正则特殊字符，输入 `(`、`[`、`*` 等会崩溃。

**修复**: 
1. 转义正则特殊字符: `query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')`
2. 添加 try-catch 容错处理

---

## 修复状态
✅ 全部修复完成

## 代码质量
- ✅ 零 TypeScript 错误
- ✅ 零 ESLint 警告
- ✅ 功能测试通过

## 总结
这两个问题都是中等严重程度，影响用户体验和功能稳定性。修复后：
- 刷新按钮交互反馈更好
- 搜索功能更稳定，不会因特殊字符崩溃
