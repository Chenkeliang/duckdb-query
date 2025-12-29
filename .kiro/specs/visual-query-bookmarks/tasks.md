# 可视化查询收藏 - 任务清单

> **版本**: 1.0  
> **创建时间**: 2024-12-29  

---

## 📋 任务列表

### Phase 1: JoinQueryPanel 集成

- [ ] **Task 1.1**: 添加导入语句
  - 文件: `JoinQueryPanel.tsx`
  - 添加: `import { Star } from 'lucide-react'`
  - 添加: `import { SaveQueryDialog } from '../Bookmarks/SaveQueryDialog'`

- [ ] **Task 1.2**: 添加状态
  - 文件: `JoinQueryPanel.tsx`
  - 在组件顶部添加: `const [isSaveDialogOpen, setIsSaveDialogOpen] = React.useState(false)`

- [ ] **Task 1.3**: 添加工具栏按钮
  - 文件: `JoinQueryPanel.tsx`
  - 位置: "清空" 按钮之后
  - 样式: `variant="ghost" size="sm"`, 图标 `Star`
  - 禁用条件: `!sql`

- [ ] **Task 1.4**: 渲染 SaveQueryDialog
  - 文件: `JoinQueryPanel.tsx`
  - 位置: 组件 JSX 末尾
  - Props: `open={isSaveDialogOpen}`, `onOpenChange={setIsSaveDialogOpen}`, `sql={sql || ''}`

---

### Phase 2: SetOperationsPanel 集成

- [ ] **Task 2.1**: 添加导入语句
  - 文件: `SetOperationsPanel.tsx`
  - 同 Task 1.1

- [ ] **Task 2.2**: 添加状态
  - 文件: `SetOperationsPanel.tsx`
  - 同 Task 1.2

- [ ] **Task 2.3**: 添加工具栏按钮
  - 文件: `SetOperationsPanel.tsx`
  - 同 Task 1.3

- [ ] **Task 2.4**: 渲染 SaveQueryDialog
  - 文件: `SetOperationsPanel.tsx`
  - 同 Task 1.4

---

### Phase 3: 验证

- [ ] **Task 3.1**: 浏览器测试 - JOIN 查询
  - 打开 JOIN 查询面板
  - 添加两个表，配置 JOIN
  - 点击收藏按钮，验证对话框打开
  - 保存，验证 Toast 和收藏夹

- [ ] **Task 3.2**: 浏览器测试 - 集合操作
  - 打开集合操作面板
  - 添加表，选择 UNION
  - 保存收藏，验证结果

- [ ] **Task 3.3**: 暗色模式验证
  - 切换暗色模式
  - 验证按钮和对话框显示正常

---

## 📊 进度追踪

| Phase | 任务数 | 完成数 | 状态 |
|-------|--------|--------|------|
| Phase 1 | 4 | 0 | 🔲 待开始 |
| Phase 2 | 4 | 0 | 🔲 待开始 |
| Phase 3 | 3 | 0 | 🔲 待开始 |

---

## 🔗 相关文档

- [需求文档](./requirements.md)
- [设计文档](./design.md)
