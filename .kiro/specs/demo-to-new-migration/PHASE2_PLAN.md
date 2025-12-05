# Phase 2 计划：SQL 查询编辑器

## 🎯 目标

实现功能完整的 SQL 查询编辑器，支持：
- Monaco Editor 集成
- SQL 语法高亮
- 自动补全（表名、列名、关键字）
- 查询执行
- 查询历史
- 错误处理

## 📋 任务列表

### 1. 依赖安装
- [ ] 1.1 安装 @monaco-editor/react
- [ ] 1.2 安装 monaco-sql-languages（可选，用于增强 SQL 支持）

### 2. SQLEditor 组件
- [ ] 2.1 创建 SQLEditor.tsx 基础组件
- [ ] 2.2 集成 Monaco Editor
- [ ] 2.3 配置 SQL 语法高亮
- [ ] 2.4 配置明暗主题切换
- [ ] 2.5 配置编辑器选项（行号、minimap、折叠等）

### 3. 自动补全
- [ ] 3.1 实现表名补全
  - 从 DataSourcePanel 获取表列表
  - 注册自定义补全提供器
- [ ] 3.2 实现列名补全
  - 获取表结构信息
  - 根据上下文提供列名
- [ ] 3.3 实现 SQL 关键字补全
  - SELECT, FROM, WHERE, JOIN, etc.
- [ ] 3.4 实现函数名补全
  - COUNT, SUM, AVG, MAX, MIN, etc.

### 4. 查询执行
- [ ] 4.1 创建执行按钮组件
  - 主按钮：执行查询
  - 下拉菜单：执行选中、执行到光标
- [ ] 4.2 实现快捷键支持
  - Ctrl+Enter / Cmd+Enter: 执行查询
  - Ctrl+Shift+Enter: 执行选中
- [ ] 4.3 集成 useQueryWorkspace
  - 调用 handleQueryExecute
  - 更新 queryResults
- [ ] 4.4 实现加载状态
  - 显示 Spinner
  - 禁用执行按钮
- [ ] 4.5 实现错误处理
  - 显示错误信息
  - 高亮错误行（如果可能）

### 5. 查询历史
- [ ] 5.1 创建 QueryHistory 组件
  - 历史记录列表
  - 时间戳显示
  - 查询预览
- [ ] 5.2 实现历史记录存储
  - localStorage 持久化
  - 最多保存 50 条
- [ ] 5.3 实现历史记录操作
  - 点击恢复查询
  - 删除单条记录
  - 清空所有记录

### 6. 工具栏
- [ ] 6.1 创建 SQLToolbar 组件
  - 执行按钮
  - 格式化按钮
  - 清空按钮
  - 历史按钮
- [ ] 6.2 实现 SQL 格式化
  - 使用 sql-formatter 库
  - 格式化当前查询

### 7. 集成测试
- [ ] 7.1 测试编辑器基本功能
- [ ] 7.2 测试自动补全
- [ ] 7.3 测试查询执行
- [ ] 7.4 测试查询历史
- [ ] 7.5 测试快捷键
- [ ] 7.6 测试明暗主题切换

## 🎨 设计规范

### 布局
```
┌─────────────────────────────────────────────────────────┐
│ SQLToolbar                                               │
│ [执行 ▼] [格式化] [清空] [历史]                         │
├─────────────────────────────────────────────────────────┤
│                                                          │
│ Monaco Editor                                            │
│ SELECT * FROM table_name                                 │
│ WHERE ...                                                │
│                                                          │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

### 颜色方案
- **编辑器背景**: `bg-surface`
- **工具栏背景**: `bg-surface-elevated`
- **边框**: `border-border`
- **按钮**: 遵循 shadcn/ui Button 组件

### 主题配置
```typescript
// 明亮主题
const lightTheme = {
  base: 'vs',
  inherit: true,
  rules: [],
  colors: {
    'editor.background': 'var(--dq-surface)',
    'editor.foreground': 'var(--dq-foreground)',
    // ...
  }
};

// 深色主题
const darkTheme = {
  base: 'vs-dark',
  inherit: true,
  rules: [],
  colors: {
    'editor.background': 'var(--dq-surface)',
    'editor.foreground': 'var(--dq-foreground)',
    // ...
  }
};
```

## 📦 依赖包

### 必需
- `@monaco-editor/react` - Monaco Editor React 封装
- `sql-formatter` - SQL 格式化

### 可选
- `monaco-sql-languages` - 增强 SQL 语言支持

## 🔧 技术细节

### Monaco Editor 配置
```typescript
const editorOptions = {
  minimap: { enabled: false },
  fontSize: 14,
  lineNumbers: 'on',
  roundedSelection: false,
  scrollBeyondLastLine: false,
  readOnly: false,
  automaticLayout: true,
  tabSize: 2,
  wordWrap: 'on',
  folding: true,
  lineDecorationsWidth: 10,
  lineNumbersMinChars: 3,
};
```

### 自动补全提供器
```typescript
monaco.languages.registerCompletionItemProvider('sql', {
  provideCompletionItems: (model, position) => {
    // 获取当前词
    const word = model.getWordUntilPosition(position);
    const range = {
      startLineNumber: position.lineNumber,
      endLineNumber: position.lineNumber,
      startColumn: word.startColumn,
      endColumn: word.endColumn,
    };

    // 返回补全建议
    return {
      suggestions: [
        {
          label: 'table_name',
          kind: monaco.languages.CompletionItemKind.Table,
          insertText: 'table_name',
          range: range,
        },
        // ...
      ],
    };
  },
});
```

### 查询历史数据结构
```typescript
interface QueryHistoryItem {
  id: string;
  sql: string;
  timestamp: number;
  success: boolean;
  rowCount?: number;
  execTime?: number;
}
```

## 📊 预计工作量

- **依赖安装**: 0.5 小时
- **SQLEditor 组件**: 2 小时
- **自动补全**: 2 小时
- **查询执行**: 1.5 小时
- **查询历史**: 1.5 小时
- **工具栏**: 1 小时
- **集成测试**: 1.5 小时

**总计**: 约 10 小时

## 🎯 成功标准

- ✅ Monaco Editor 正常显示
- ✅ SQL 语法高亮正确
- ✅ 自动补全功能正常
- ✅ 查询执行成功
- ✅ 结果显示在 ResultPanel
- ✅ 查询历史正常工作
- ✅ 快捷键正常工作
- ✅ 明暗主题切换正常
- ✅ 无编译错误
- ✅ 无运行时错误

## 🚀 开始时间

待 Phase 1 审核通过后开始

---

**创建时间**: 2024-12-04  
**预计开始**: 待定  
**预计完成**: 开始后 2-3 天
