# 新 UI 数据源管理全面验证报告 (Part 4: 数据流、性能与兼容性)

## 8️⃣ 数据流验证

### ✅ 整体数据流架构

**评分**: ⭐⭐⭐⭐⭐ (5/5)

**数据流图**:
```
DuckQueryApp (顶层)
    ↓ props
DataSourcePage (容器)
    ↓ props
┌─────────────┬──────────────┬──────────────┐
│ UploadPanel │ DatabaseForm │ DataPasteCard│
└─────────────┴──────────────┴──────────────┘
    ↓ callback        ↓ callback      ↓ callback
onDataSourceSaved (统一回调)
    ↓
triggerRefresh (刷新数据源列表)
```

**优秀实践**:
1. ✅ **单向数据流**: Props 向下，回调向上
2. ✅ **统一接口**: 所有组件使用相同的回调接口
3. ✅ **职责分离**: 容器负责布局，子组件负责功能

---

### ✅ UploadPanel 数据流

**输入**:
- `onDataSourceSaved`: 成功回调
- `showNotification`: 通知回调

**内部流程**:
```
用户选择文件
    ↓
handleFileChange
    ↓
setSelectedFile(file)
setAlias(filename)
    ↓
用户点击上传
    ↓
handleUpload
    ↓
uploadFile API
    ↓
检查 requires_sheet_selection
    ├─ true → setPendingExcel → 显示 ExcelSheetSelector
    │           ↓
    │       handleExcelImported
    │           ↓
    │       onDataSourceSaved ⭐
    │
    └─ false → onDataSourceSaved ⭐
```

**输出**:
- `onDataSourceSaved({ id, type, name, row_count, columns })`

**优秀实践**:
1. ✅ **清晰的数据转换**: 原始响应 → 标准化数据源对象
2. ✅ **状态驱动**: UI 根据状态自动更新
3. ✅ **回调统一**: 无论哪个路径，最终都调用相同回调

---

### ✅ DatabaseForm 数据流

**输入**:
- `configToLoad`: 要加载的配置
- `onTest`: 测试回调
- `onSave`: 保存回调
- `onSaveConfig`: 保存配置回调

**内部流程**:
```
用户输入表单
    ↓
useState 更新各字段
    ↓
useMemo 计算 normalizedParams
    ↓
用户点击操作
    ↓
validate() 验证
    ↓
onTest/onSave/onSaveConfig(normalizedParams) ⭐
```

**输出**:
- `normalizedParams: { type, id, params }`

**优秀实践**:
1. ✅ **参数标准化**: 使用 `useMemo` 实时计算标准化参数
2. ✅ **验证分离**: 独立的 `validate` 函数
3. ✅ **多操作支持**: 测试、连接、保存配置

---

### ✅ DataPasteCard 数据流

**输入**:
- `onDataSourceSaved`: 成功回调

**内部流程**:
```
用户粘贴数据
    ↓
setPastedData
    ↓
用户点击解析
    ↓
parseData()
    ├─ detectDelimiter (自动检测)
    ├─ detectDataType (类型推断)
    └─ setParsedData
    ↓
用户调整列名/类型
    ↓
用户点击保存
    ↓
saveToDatabase()
    ↓
fetch("/api/paste-data")
    ↓
onDataSourceSaved ⭐
```

**输出**:
- `onDataSourceSaved({ id, name, sourceType, type, columns, columnCount })`

**优秀实践**:
1. ✅ **智能检测**: 自动检测分隔符和数据类型
2. ✅ **用户可调**: 允许用户调整检测结果
3. ✅ **预览功能**: 显示前 5 行预览

---

## 9️⃣ 性能和兼容性

### ✅ 性能优化

**评分**: ⭐⭐⭐⭐⭐ (5/5)

#### 1. useMemo 优化

**DatabaseForm**:
```typescript
const normalizedParams = useMemo(() => {
  // 复杂计算
  return { type, id, params };
}, [type, name, host, port, username, password, database, sqlitePath, schema, isPostgreSQL]);
```

**DataPasteCard**:
```typescript
const dataTypes = useMemo(() => [
  { value: "VARCHAR", label: t("page.datasource.paste.types.text") },
  // ...
], [t]);
```

**优点**:
- ✅ 避免不必要的重新计算
- ✅ 依赖数组明确
- ✅ 适用于复杂计算

---

#### 2. 条件渲染优化

**UploadPanel**:
```typescript
{pendingExcel && (
  <ExcelSheetSelector
    open={true}
    pendingInfo={pendingExcel}
    onClose={handleExcelClose}
    onImported={handleExcelImported}
    showNotification={showNotification}
  />
)}
```

**优点**:
- ✅ 组件只在需要时渲染
- ✅ 减少 DOM 节点
- ✅ 提高初始渲染速度

---

#### 3. 懒加载

**DatabaseForm - 服务器浏览**:
```typescript
useEffect(() => {
  if (isSqlite && serverMounts.length === 0) {
    loadServerMounts(); // 只在 SQLite 标签时加载
  }
}, [isSqlite]);
```

**优点**:
- ✅ 按需加载
- ✅ 减少初始请求
- ✅ 提高响应速度

---

#### 4. 防抖和节流

**建议添加**:
```typescript
// 搜索输入防抖
const debouncedSearch = useMemo(
  () => debounce((value) => {
    // 搜索逻辑
  }, 300),
  []
);

// 滚动节流
const throttledScroll = useMemo(
  () => throttle(() => {
    // 滚动逻辑
  }, 100),
  []
);
```

---

### ✅ 兼容性

**评分**: ⭐⭐⭐⭐⭐ (5/5)

#### 1. 浏览器兼容性

**使用的现代特性**:
- ✅ `async/await` - 所有现代浏览器支持
- ✅ `?.` 可选链 - ES2020，现代浏览器支持
- ✅ `??` 空值合并 - ES2020，现代浏览器支持
- ✅ `Array.from` - ES6，广泛支持

**Polyfill 建议**:
```javascript
// vite.config.js 或 webpack.config.js
{
  build: {
    target: 'es2015', // 支持更多浏览器
  }
}
```

---

#### 2. TypeScript 兼容性

**当前配置**:
```json
// tsconfig.json
{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx"
  }
}
```

**优点**:
- ✅ 现代 JavaScript 特性
- ✅ React 17+ JSX 转换
- ✅ DOM 类型支持

---

#### 3. React 版本兼容性

**使用的 React 特性**:
- ✅ Hooks (React 16.8+)
- ✅ Fragment `<>` (React 16.2+)
- ✅ Suspense (React 16.6+)

**兼容性**: React 16.8+ ✅

---

#### 4. shadcn/ui 兼容性

**依赖**:
- ✅ Radix UI - 现代浏览器
- ✅ Tailwind CSS - 所有浏览器（通过 PostCSS）
- ✅ class-variance-authority - 纯 JavaScript

**优点**:
- ✅ 无运行时依赖
- ✅ 编译时处理
- ✅ 广泛兼容

---

## 🔟 shadcn/ui + Tailwind CSS + TSX + React 最佳实践

### ✅ shadcn/ui 使用

**评分**: ⭐⭐⭐⭐⭐ (5/5)

**正确使用示例**:
```typescript
import { Card, CardContent } from "@/new/components/ui/card";
import { Button } from "@/new/components/ui/button";
import { Input } from "@/new/components/ui/input";
import { Label } from "@/new/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/new/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/new/components/ui/select";

// 使用
<Card className="shadow-sm">
  <CardContent className="p-6 space-y-4">
    <Label htmlFor="input-id">Label</Label>
    <Input id="input-id" value={value} onChange={handleChange} />
    <Button onClick={handleClick}>Submit</Button>
  </CardContent>
</Card>
```

**优秀实践**:
1. ✅ **组件导入**: 从 `@/new/components/ui/` 导入
2. ✅ **组合使用**: Card + CardContent 组合
3. ✅ **可访问性**: Label 关联 Input (htmlFor)
4. ✅ **自定义样式**: 通过 className 扩展

---

### ✅ Tailwind CSS 使用

**评分**: ⭐⭐⭐⭐⭐ (5/5)

**语义化类名**:
```typescript
// ✅ 使用语义化 Tailwind 类
className="bg-surface text-foreground border-border"
className="text-sm text-muted-foreground"
className="rounded-xl shadow-sm"

// ✅ 响应式设计
className="grid grid-cols-1 xl:grid-cols-2 gap-6"
className="space-y-2 md:col-span-2"

// ✅ 状态变体
className={`cursor-pointer ${dragOver ? "border-primary bg-surface-hover" : "border-border"}`}
```

**优秀实践**:
1. ✅ **语义化**: 使用 `bg-surface` 而非 `bg-white`
2. ✅ **响应式**: 使用 `md:`, `xl:` 前缀
3. ✅ **间距系统**: 使用 `space-y-4`, `gap-6`
4. ✅ **条件类名**: 动态切换类名

---

### ✅ TypeScript 使用

**评分**: ⭐⭐⭐⭐ (4/5)

**优点**:
```typescript
// ✅ 接口定义
interface PendingExcel {
  file_id: string;
  original_filename: string;
}

// ✅ 泛型状态
const [pendingExcel, setPendingExcel] = useState<PendingExcel | null>(null);

// ✅ 类型推断
const normalizedParams = useMemo(() => {
  // TypeScript 自动推断返回类型
  return { type, id, params };
}, [dependencies]);
```

**需要改进**:
```typescript
// ❌ 缺少 Props 类型
const UploadPanel = ({ onDataSourceSaved, showNotification }) => {

// ✅ 应该添加
interface UploadPanelProps {
  onDataSourceSaved?: (dataSource: DataSource) => void;
  showNotification?: (message: string, severity: string) => void;
}
const UploadPanel: React.FC<UploadPanelProps> = ({ onDataSourceSaved, showNotification }) => {
```

---

### ✅ React 最佳实践

**评分**: ⭐⭐⭐⭐⭐ (5/5)

**优秀实践**:

1. **Hooks 使用**:
```typescript
// ✅ 正确的依赖数组
useEffect(() => {
  if (configToLoad) {
    // 加载配置
  }
}, [configToLoad]);

// ✅ useMemo 优化
const normalizedParams = useMemo(() => {
  // 计算逻辑
}, [dependencies]);
```

2. **事件处理**:
```typescript
// ✅ 内联简单处理
onClick={() => setSelectedFile(null)}

// ✅ 复杂逻辑提取函数
const handleUpload = async () => {
  // 复杂逻辑
};
```

3. **条件渲染**:
```typescript
// ✅ 使用 && 和三元运算符
{error && <div className="text-error">{error}</div>}
{loading ? <Spinner /> : <Content />}
```

---

**继续阅读**: Part 5 - 总结与建议
