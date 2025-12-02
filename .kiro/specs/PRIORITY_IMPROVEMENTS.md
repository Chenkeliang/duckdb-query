# 优先改进计划（不含 ARIA）

**日期**: 2024-12-02  
**目标**: 提升核心用户体验  
**总时间**: 60分钟

---

## 🎯 两个核心改进

### 1. Loading 状态 ⏳ (30分钟)

**目标**: 让用户知道系统正在处理

**需要修改的组件**:
- DatabaseForm.tsx
- SavedConnectionsList.tsx

**改进内容**:
```typescript
// 添加 loading 状态
const [isLoading, setIsLoading] = useState(false);

// 在操作中使用
const handleConnect = async () => {
  setIsLoading(true);
  try {
    await connectDatabase();
    notify(t("success.connected"), "success");
  } catch (err) {
    notify(t("error.failed"), "error");
  } finally {
    setIsLoading(false);
  }
};

// 按钮显示
<Button disabled={isLoading}>
  {isLoading ? (
    <>
      <Loader2 className="w-4 h-4 animate-spin mr-2" />
      {t("actions.connecting")}
    </>
  ) : (
    t("actions.connect")
  )}
</Button>
```

**预期效果**:
- 通过率: 77% → 85% (+8%)
- 用户体验: 显著提升

---

### 2. 确认对话框 ⚠️ (30分钟)

**目标**: 防止误删数据

**需要修改的组件**:
- SavedConnectionsList.tsx

**改进内容**:
```typescript
// 添加确认对话框状态
const [deleteTarget, setDeleteTarget] = useState(null);

// 删除按钮点击
const handleDeleteClick = (connection) => {
  setDeleteTarget(connection);
};

// 确认删除
const handleDeleteConfirm = async () => {
  try {
    await deleteConnection(deleteTarget.id);
    notify(t("success.deleted"), "success");
    onDataSourceSaved?.();
  } catch (err) {
    notify(t("error.deleteFailed"), "error");
  } finally {
    setDeleteTarget(null);
  }
};

// 使用 shadcn/ui AlertDialog
<AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>确认删除</AlertDialogTitle>
      <AlertDialogDescription>
        确定要删除连接 '{deleteTarget?.name}' 吗？此操作无法撤销。
      </AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel>取消</AlertDialogCancel>
      <AlertDialogAction onClick={handleDeleteConfirm}>
        确定删除
      </AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

**预期效果**:
- 数据安全: 显著提升
- 用户体验: 显著提升

---

## 📋 实施步骤

### 步骤 1: 添加 Loading 状态 (30分钟)

1. **DatabaseForm.tsx** (15分钟)
   - 添加 `isLoading` 状态
   - 修改 `handleConnect` 函数
   - 修改按钮显示
   - 添加 `Loader2` 图标导入

2. **SavedConnectionsList.tsx** (15分钟)
   - 添加 `isDeleting` 状态
   - 修改删除函数
   - 修改删除按钮显示

### 步骤 2: 添加确认对话框 (30分钟)

1. **SavedConnectionsList.tsx** (30分钟)
   - 添加 `deleteTarget` 状态
   - 添加 `handleDeleteClick` 函数
   - 添加 `handleDeleteConfirm` 函数
   - 添加 AlertDialog 组件
   - 导入 shadcn/ui AlertDialog 组件

---

## 🎯 预期效果

### 通过率提升
```
DatabaseForm: 77% → 85% (+8%)
SavedConnectionsList: 77% → 85% (+8%)
平均: 89% → 92% (+3%)
```

### 用户体验提升

| 维度 | 改进前 | 改进后 |
|------|--------|--------|
| 操作反馈 | 良好 | 优秀 |
| 误操作保护 | 无 | 完整 |
| 用户焦虑 | 中 | 低 |
| 专业度 | 良好 | 优秀 |

---

## 🚀 开始实施？

**总时间**: 60分钟  
**总效果**: 通过率 89% → 92%，用户体验显著提升

需要我立即开始实施吗？我会按照以下顺序：

1. DatabaseForm - 添加 Loading 状态 (15分钟)
2. SavedConnectionsList - 添加 Loading 状态 (15分钟)
3. SavedConnectionsList - 添加确认对话框 (30分钟)

每完成一个改进，我会让你验证效果。
