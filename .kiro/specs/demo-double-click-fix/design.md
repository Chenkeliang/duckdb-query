# Design Document

## Overview

本设计文档描述了如何修复 DuckQuery Demo 页面中的双击选表功能和恢复缺失的示例卡片内容。主要包括：

1. 修复事件绑定机制，确保双击事件正确触发
2. 在 templates.js 中补充完整的示例卡片HTML内容
3. 确保模板加载后正确初始化图标和事件处理器

## Architecture

### 组件层次结构

```
index.html (主页面)
├── templates.js (模板定义)
│   ├── datasource (数据源面板模板 - 包含双击事件)
│   ├── joinQuery (关联查询模板 - 需要补充示例卡片)
│   ├── setOperations (集合操作模板 - 需要补充示例卡片)
│   └── pivotTable (透视表模板 - 需要补充示例卡片)
├── main.js (事件处理和状态管理)
│   ├── selectTable() (双击处理函数)
│   ├── switchThirdTab() (Tab切换函数)
│   └── TemplateLoader (模板加载器)
└── main.css (样式定义)
```

### 数据流

```
用户双击表名
  ↓
ondblclick="selectTable('table_name', event)"
  ↓
selectTable() 函数执行
  ↓
更新视觉状态 + 更新当前Tab的表名显示
  ↓
重新初始化 Lucide 图标
```

## Components and Interfaces

### 1. Event Binding System

**问题分析:**
- 当前 `datasource` 模板中的 `ondblclick` 事件已正确定义
- 但模板加载后可能需要重新绑定事件或重新初始化

**解决方案:**
- 确保 `TemplateLoader.loadTemplate()` 后调用 `lucide.createIcons()`
- 验证 `selectTable()` 函数的参数传递正确

### 2. Template Content System

**当前状态:**
- `joinQuery` 模板只有空状态提示，缺少示例卡片
- `setOperations` 模板只有空状态提示，缺少示例卡片  
- `pivotTable` 模板只有空状态提示，缺少示例配置卡片

**目标状态:**
- 每个模板都应包含完整的示例内容，展示功能的使用方式

### 3. Icon Initialization System

**问题:**
- 动态加载的内容中的图标可能不会自动初始化

**解决方案:**
- 在每次模板加载后调用 `lucide.createIcons()`
- 在 Tab 切换后延迟调用图标初始化（使用 setTimeout）

## Data Models

### TableSelection State

```javascript
{
  currentTab: 'visual' | 'sql' | 'join' | 'set' | 'pivot',
  selectedTables: {
    visual: ['sales_data'],
    sql: [],
    join: ['sales_data', 'customer_info'],
    set: ['table1', 'table2'],
    pivot: ['sales_data']
  }
}
```

### JoinCard Data Model

```javascript
{
  tableName: string,
  alias: string,
  joinType: 'INNER' | 'LEFT' | 'RIGHT' | 'FULL',
  joinCondition: {
    leftField: string,
    rightField: string,
    operator: '=' | '!=' | '>' | '<'
  },
  fields: string[]
}
```

### SetOperationCard Data Model

```javascript
{
  tableName: string,
  fields: string[],
  fieldMapping: {
    [sourceField: string]: string  // 映射到统一的字段名
  }
}
```

### PivotConfig Data Model

```javascript
{
  tableName: string,
  rowDimensions: string[],      // ['category', 'region']
  columnDimensions: string[],   // ['year']
  aggregations: [{
    function: 'SUM' | 'AVG' | 'COUNT' | 'MIN' | 'MAX',
    field: string,
    alias: string
  }]
}
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Double-click event propagation

*For any* table item in the data source panel, when a user double-clicks on it, the `selectTable` function should be called with the correct table name and event object
**Validates: Requirements 1.1**

### Property 2: Visual state consistency

*For any* selected table, the visual state (highlighting, icon color) should match the selection state in `AppState.selectedTables`
**Validates: Requirements 1.2**

### Property 3: Template content completeness

*For any* tab template (joinQuery, setOperations, pivotTable), when loaded, it should contain non-empty example card content (not just empty state)
**Validates: Requirements 2.1, 3.1, 4.1**

### Property 4: Icon initialization after template load

*For any* template load operation, all Lucide icons in the newly loaded content should be properly initialized and visible
**Validates: Requirements 5.1, 5.3**

### Property 5: Event handler preservation

*For any* template reload operation, all event handlers (onclick, ondblclick) should remain functional after the reload
**Validates: Requirements 5.2**

## Error Handling

### Event Binding Errors

- **Error**: `selectTable is not defined`
  - **Cause**: 函数未在全局作用域定义
  - **Solution**: 确保 `selectTable` 在 `main.js` 中定义为全局函数

- **Error**: `event is undefined`
  - **Cause**: 事件对象未正确传递
  - **Solution**: 确保 `ondblclick` 属性包含 `event` 参数

### Template Loading Errors

- **Error**: 模板内容为空
  - **Cause**: 模板键名不匹配或模板未定义
  - **Solution**: 在 `TemplateLoader.loadTemplate()` 中添加错误日志

- **Error**: 图标不显示
  - **Cause**: Lucide 未初始化或初始化时机过早
  - **Solution**: 使用 `setTimeout` 延迟初始化

## Testing Strategy

### Unit Testing

由于这是一个纯前端演示页面，我们将使用手动测试和浏览器控制台验证：

1. **双击功能测试**
   - 在每个 Tab 页双击不同的表名
   - 验证控制台输出 `Selected table: xxx`
   - 验证视觉状态更新（高亮、图标颜色）

2. **模板内容测试**
   - 切换到关联查询 Tab，验证是否显示示例卡片
   - 切换到集合操作 Tab，验证是否显示示例卡片
   - 切换到透视表 Tab，验证是否显示配置卡片

3. **图标初始化测试**
   - 切换 Tab 后检查所有图标是否正确显示
   - 打开浏览器控制台查看是否有 Lucide 相关错误

### Property-Based Testing

虽然这是一个演示页面，但我们可以定义一些可验证的属性：

**Property Test 1: Event binding consistency**
- 生成随机表名列表
- 验证每个表名的双击事件都能正确触发
- 验证事件参数传递正确

**Property Test 2: Template completeness**
- 遍历所有 Tab 模板
- 验证每个模板的 HTML 长度 > 最小阈值
- 验证每个模板包含必要的 CSS 类名

**Property Test 3: Icon initialization**
- 加载模板后查询所有 `[data-lucide]` 元素
- 验证每个元素都有对应的 SVG 子元素
- 验证 SVG 的 viewBox 属性存在

### Testing Tools

- **Browser DevTools Console**: 验证函数调用和错误信息
- **Browser DevTools Elements**: 检查 DOM 结构和事件监听器
- **Manual Testing Checklist**: 系统化的手动测试步骤

## Implementation Notes

### 关键修复点

1. **双击功能修复**
   - 检查 `main.js` 中 `selectTable` 函数的定义
   - 确保函数在全局作用域可访问
   - 验证事件参数传递

2. **示例卡片补充**
   - 从 `testquery.html` 中提取完整的卡片 HTML
   - 将卡片内容添加到 `templates.js` 对应模板中
   - 替换空状态提示为实际示例内容

3. **图标初始化优化**
   - 在 `switchThirdTab` 函数中添加延迟初始化
   - 在 `TemplateLoader.loadTemplate` 后立即初始化
   - 确保异步加载不影响图标显示

### 代码修改策略

1. **最小化修改**: 只修改必要的部分，不重构整体架构
2. **保持一致性**: 新增内容的样式和结构与现有代码保持一致
3. **向后兼容**: 确保修改不影响其他已有功能
4. **可测试性**: 添加 console.log 以便调试和验证

### 参考源文件

- `docs/demo/testquery.html` - 包含完整的示例卡片内容
- `docs/demo/components/templates.js` - 需要补充内容的模板文件
- `docs/demo/scripts/main.js` - 事件处理函数定义
