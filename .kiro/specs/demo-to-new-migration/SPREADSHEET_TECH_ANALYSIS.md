# Google Sheets 和飞书表格技术实现分析

## 🎯 分析目的

了解 Google Sheets 和飞书表格的技术实现，为 DuckQuery 的 ResultPanel 选择合适的技术方案。

## 📊 Google Sheets 技术栈

### 核心技术

**1. 渲染引擎**
- **Canvas 渲染**：Google Sheets 使用 HTML5 Canvas 渲染表格，而非传统的 DOM 元素
- **原因**：Canvas 渲染性能远超 DOM，可以处理百万级单元格
- **实现**：
  - 只渲染可见区域（视口）
  - 滚动时动态重绘 Canvas
  - 使用 WebGL 加速（部分场景）

**2. 虚拟化技术**
- **虚拟滚动**：只渲染可见的行和列
- **按需加载**：滚动时动态加载数据
- **缓存策略**：缓存最近访问的单元格数据

**3. 数据结构**
```javascript
// 稀疏矩阵存储
{
  cells: {
    "A1": { value: "Hello", format: {...} },
    "B2": { value: 123, format: {...} },
    // 只存储有数据的单元格
  },
  rows: {
    "1": { height: 21, hidden: false },
    "2": { height: 21, hidden: false },
  },
  columns: {
    "A": { width: 100, hidden: false },
    "B": { width: 100, hidden: false },
  }
}
```

**4. 协同编辑**
- **Operational Transformation (OT)**：Google 自研的协同算法
- **WebSocket**：实时同步编辑操作
- **冲突解决**：服务端仲裁冲突操作

**5. 公式引擎**
- **自研公式引擎**：支持 400+ 函数
- **依赖图**：追踪单元格依赖关系
- **增量计算**：只重新计算受影响的单元格

### 技术优势

✅ **性能极佳**：Canvas 渲染 + 虚拟化，支持百万级单元格  
✅ **协同编辑**：多人实时编辑，冲突自动解决  
✅ **功能完整**：公式、图表、数据透视表、条件格式  
✅ **跨平台**：Web、iOS、Android 统一体验  

### 技术挑战

❌ **开发复杂度高**：Canvas 渲染需要手动处理所有交互  
❌ **可访问性差**：Canvas 对屏幕阅读器不友好  
❌ **SEO 不友好**：Canvas 内容无法被搜索引擎索引  

## 📊 飞书表格技术栈

### 核心技术

**1. 渲染引擎**
- **混合渲染**：
  - 表头和固定列使用 DOM
  - 数据区域使用 Canvas
  - 编辑时切换到 DOM 输入框
- **原因**：平衡性能和可访问性

**2. 虚拟化技术**
- **虚拟滚动**：类似 Google Sheets
- **分块加载**：按区域（chunk）加载数据
- **智能预加载**：预测滚动方向，提前加载

**3. 数据结构**
```typescript
// 分块存储
interface Chunk {
  startRow: number;
  endRow: number;
  startCol: number;
  endCol: number;
  cells: Map<string, Cell>;
}

// 单元格数据
interface Cell {
  value: any;
  formula?: string;
  format?: CellFormat;
  style?: CellStyle;
}
```

**4. 协同编辑**
- **CRDT (Conflict-free Replicated Data Type)**：无冲突的数据结构
- **WebSocket + HTTP/2**：实时同步 + 批量同步
- **乐观更新**：本地先更新，服务端确认后同步

**5. 公式引擎**
- **基于 Web Worker**：公式计算在后台线程
- **增量计算**：只计算变化的单元格
- **公式缓存**：缓存计算结果

### 技术优势

✅ **性能优秀**：混合渲染，兼顾性能和可访问性  
✅ **协同编辑**：CRDT 算法，冲突少  
✅ **移动端优化**：针对移动端优化的交互  
✅ **集成度高**：与飞书文档、日历等深度集成  

### 技术挑战

❌ **技术复杂度高**：混合渲染需要处理 DOM 和 Canvas 的切换  
❌ **内存占用**：CRDT 需要存储更多元数据  

## 🔍 开源替代方案

### 1. Handsontable

**技术栈**：
- **DOM 渲染** + **虚拟滚动**
- **React/Vue/Angular 适配器**
- **商业授权**（非商业免费）

**特点**：
- ✅ Excel 风格的交互
- ✅ 支持公式、数据验证、条件格式
- ✅ 插件丰富
- ❌ 大数据集性能一般（DOM 渲染）

**适用场景**：中小型数据集（< 10 万行）

### 2. AG-Grid

**技术栈**：
- **DOM 渲染** + **虚拟滚动**
- **React/Vue/Angular 原生支持**
- **社区版免费，企业版收费**

**特点**：
- ✅ 性能优秀（虚拟滚动优化）
- ✅ 功能强大（分组、聚合、透视）
- ✅ 主题定制
- ❌ 学习曲线陡峭

**适用场景**：企业级数据表格（< 100 万行）

### 3. @tanstack/react-table

**技术栈**：
- **Headless UI**（无样式）
- **React Hooks**
- **完全免费开源**

**特点**：
- ✅ 轻量级（核心 14KB）
- ✅ 灵活性高（自定义渲染）
- ✅ TypeScript 支持
- ❌ 需要自己实现 UI

**适用场景**：需要高度定制的表格

### 4. Luckysheet

**技术栈**：
- **Canvas 渲染**
- **纯 JavaScript**
- **完全免费开源**

**特点**：
- ✅ 类似 Excel 的体验
- ✅ 支持公式、图表、条件格式
- ✅ 协同编辑（需要后端支持）
- ❌ 文档不完善
- ❌ 社区活跃度一般

**适用场景**：需要 Excel 风格的在线表格

### 5. x-spreadsheet

**技术栈**：
- **Canvas 渲染**
- **纯 JavaScript**
- **完全免费开源**

**特点**：
- ✅ 轻量级（< 100KB）
- ✅ 类似 Excel 的交互
- ✅ 支持公式、样式
- ❌ 功能相对简单
- ❌ 不支持协同编辑

**适用场景**：轻量级的在线表格

## 🎯 DuckQuery 的技术选型建议

### 当前需求分析

**DuckQuery 的使用场景**：
1. **数据查询结果展示**（主要场景）
2. **数据筛选和排序**
3. **数据复制和导出**
4. **简单的数据分析**（统计、图表）

**数据规模**：
- 典型：1,000 - 10,000 行
- 大型：10,000 - 100,000 行
- 极限：100,000 - 1,000,000 行

**不需要的功能**：
- ❌ 单元格编辑（只读表格）
- ❌ 公式计算
- ❌ 协同编辑
- ❌ 复杂的格式化

### 推荐方案

#### 方案 1：AG-Grid（推荐）⭐⭐⭐⭐⭐

**理由**：
- ✅ **性能优秀**：虚拟滚动，支持百万行数据
- ✅ **功能完整**：排序、筛选、分组、导出
- ✅ **社区版免费**：满足 DuckQuery 的需求
- ✅ **React 支持好**：官方 React 适配器
- ✅ **主题定制**：可以完美适配项目设计系统

**实现方式**：
```typescript
import { AgGridReact } from 'ag-grid-react';
import 'ag-grid-community/styles/ag-grid.css';

const ResultPanel = ({ data, columns }) => {
  return (
    <div className="ag-theme-duckquery h-full">
      <AgGridReact
        rowData={data}
        columnDefs={columns}
        defaultColDef={{
          sortable: true,
          filter: true,
          resizable: true,
        }}
        enableRangeSelection={true}
        enableCellTextSelection={true}
        // Excel 风格的列筛选
        floatingFilter={true}
        // 虚拟滚动
        rowModelType="clientSide"
        // 性能优化
        suppressColumnVirtualisation={false}
        suppressRowVirtualisation={false}
      />
    </div>
  );
};
```

**优化建议**：
1. 使用自定义主题（`.ag-theme-duckquery`）
2. 实现自定义列筛选菜单（Excel 风格）
3. 添加右键菜单（复制、导出）
4. 添加浮动工具栏（选中数据统计）

#### 方案 2：@tanstack/react-table + 虚拟滚动（备选）⭐⭐⭐⭐

**理由**：
- ✅ **完全控制**：可以实现任何自定义交互
- ✅ **轻量级**：核心库很小
- ✅ **TypeScript 支持**：类型安全
- ❌ **开发成本高**：需要自己实现 UI 和交互

**实现方式**：
```typescript
import { useReactTable, getCoreRowModel } from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';

const ResultPanel = ({ data, columns }) => {
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });
  
  const parentRef = useRef<HTMLDivElement>(null);
  
  const rowVirtualizer = useVirtualizer({
    count: table.getRowModel().rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 35,
    overscan: 10,
  });
  
  return (
    <div ref={parentRef} className="h-full overflow-auto">
      <div style={{ height: `${rowVirtualizer.getTotalSize()}px` }}>
        {rowVirtualizer.getVirtualItems().map((virtualRow) => {
          const row = table.getRowModel().rows[virtualRow.index];
          return (
            <div
              key={row.id}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: `${virtualRow.size}px`,
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              {row.getVisibleCells().map((cell) => (
                <div key={cell.id}>
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
};
```

**优化建议**：
1. 使用 `@tanstack/react-virtual` 实现虚拟滚动
2. 自己实现 Excel 风格的列筛选
3. 自己实现右键菜单和快捷键
4. 自己实现单元格选择和复制

#### 方案 3：Luckysheet（不推荐）⭐⭐

**理由**：
- ✅ **功能完整**：类似 Excel 的体验
- ❌ **过度设计**：DuckQuery 不需要编辑功能
- ❌ **集成困难**：不是 React 组件
- ❌ **文档不完善**：学习成本高

### 最终推荐

**使用 AG-Grid + 自定义增强**

**实施步骤**：

1. **Phase 1：基础集成**
   - 集成 AG-Grid
   - 自定义主题（`.ag-theme-duckquery`）
   - 基础功能（排序、筛选、调整列宽）

2. **Phase 2：Excel 风格增强**
   - 自定义列筛选菜单（distinct values）
   - 右键菜单（复制、导出）
   - 键盘导航（方向键、Ctrl+C）

3. **Phase 3：交互优化**
   - 单元格和行选择
   - 浮动工具栏
   - 选中数据统计
   - 全局搜索（Ctrl+F）

## 📊 性能对比

| 方案 | 10K 行 | 100K 行 | 1M 行 | 内存占用 | 开发成本 |
|-----|--------|---------|-------|---------|---------|
| Google Sheets (Canvas) | ⚡⚡⚡ | ⚡⚡⚡ | ⚡⚡⚡ | 低 | 极高 |
| 飞书表格 (混合) | ⚡⚡⚡ | ⚡⚡⚡ | ⚡⚡ | 中 | 极高 |
| AG-Grid | ⚡⚡⚡ | ⚡⚡⚡ | ⚡⚡ | 中 | 低 |
| @tanstack/react-table | ⚡⚡⚡ | ⚡⚡ | ⚡ | 低 | 高 |
| Handsontable | ⚡⚡ | ⚡ | ❌ | 高 | 中 |
| Luckysheet | ⚡⚡⚡ | ⚡⚡ | ⚡ | 中 | 高 |

## ✅ 结论

**对于 DuckQuery 项目，推荐使用 AG-Grid**：

1. **性能满足需求**：虚拟滚动支持百万行数据
2. **功能完整**：排序、筛选、分组、导出
3. **开发成本低**：社区版免费，文档完善
4. **可定制性强**：可以实现 Excel 风格的增强
5. **维护成本低**：社区活跃，长期维护

**不推荐 Canvas 方案**（Google Sheets/Luckysheet）：
- DuckQuery 是只读表格，不需要复杂的编辑功能
- Canvas 渲染的开发成本和维护成本太高
- 可访问性差

**不推荐完全自研**（@tanstack/react-table）：
- 开发成本高，需要实现大量交互逻辑
- 性能优化需要大量时间
- 不如使用成熟的 AG-Grid

---

**文档创建时间**: 2024-12-04  
**参考资料**: Google Sheets 技术博客、飞书技术博客、开源项目文档  
**状态**: 📝 技术选型参考
