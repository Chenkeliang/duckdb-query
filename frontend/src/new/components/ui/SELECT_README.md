# Select Component

基于 `@radix-ui/react-select` 实现的 shadcn/ui 风格 Select 组件。

## 特性

- ✅ 基于 Radix UI，完整的可访问性支持
- ✅ 支持键盘导航（方向键、Enter、Esc）
- ✅ 支持分组（SelectGroup）
- ✅ 支持禁用项
- ✅ 支持受控和非受控模式
- ✅ 支持滚动按钮（长列表）
- ✅ 完整的 TypeScript 类型定义
- ✅ 统一的设计系统（使用语义化 Tailwind 类名）
- ✅ 深色模式支持

## 组件列表

- `Select` - 根组件
- `SelectGroup` - 分组容器
- `SelectValue` - 显示选中值
- `SelectTrigger` - 触发器按钮
- `SelectContent` - 下拉内容容器
- `SelectLabel` - 分组标签
- `SelectItem` - 选项
- `SelectSeparator` - 分隔线
- `SelectScrollUpButton` - 向上滚动按钮
- `SelectScrollDownButton` - 向下滚动按钮

## 基本用法

```tsx
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/new/components/ui/select"

function Example() {
  return (
    <Select>
      <SelectTrigger className="w-[180px]">
        <SelectValue placeholder="选择数据库类型" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="mysql">MySQL</SelectItem>
        <SelectItem value="postgresql">PostgreSQL</SelectItem>
        <SelectItem value="sqlite">SQLite</SelectItem>
      </SelectContent>
    </Select>
  )
}
```

## 受控模式

```tsx
function ControlledExample() {
  const [value, setValue] = React.useState<string>("")

  return (
    <Select value={value} onValueChange={setValue}>
      <SelectTrigger className="w-[180px]">
        <SelectValue placeholder="选择分隔符" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="comma">逗号 (,)</SelectItem>
        <SelectItem value="tab">制表符 (Tab)</SelectItem>
        <SelectItem value="semicolon">分号 (;)</SelectItem>
      </SelectContent>
    </Select>
  )
}
```

## 分组用法

```tsx
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/new/components/ui/select"

function GroupedExample() {
  return (
    <Select>
      <SelectTrigger className="w-[280px]">
        <SelectValue placeholder="选择数据源" />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectLabel>关系型数据库</SelectLabel>
          <SelectItem value="mysql">MySQL</SelectItem>
          <SelectItem value="postgresql">PostgreSQL</SelectItem>
          <SelectItem value="sqlite">SQLite</SelectItem>
        </SelectGroup>
        <SelectGroup>
          <SelectLabel>文件数据源</SelectLabel>
          <SelectItem value="csv">CSV 文件</SelectItem>
          <SelectItem value="parquet">Parquet 文件</SelectItem>
          <SelectItem value="excel">Excel 文件</SelectItem>
        </SelectGroup>
      </SelectContent>
    </Select>
  )
}
```

## 禁用项

```tsx
function DisabledExample() {
  return (
    <Select>
      <SelectTrigger className="w-[200px]">
        <SelectValue placeholder="选择连接" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="conn1">生产环境 MySQL</SelectItem>
        <SelectItem value="conn2">测试环境 PostgreSQL</SelectItem>
        <SelectItem value="conn3" disabled>
          开发环境 SQLite (离线)
        </SelectItem>
      </SelectContent>
    </Select>
  )
}
```

## 表单集成

```tsx
function FormExample() {
  const [dbType, setDbType] = React.useState<string>("")

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium">数据库类型</label>
      <Select value={dbType} onValueChange={setDbType}>
        <SelectTrigger>
          <SelectValue placeholder="选择数据库类型" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="mysql">MySQL</SelectItem>
          <SelectItem value="postgresql">PostgreSQL</SelectItem>
          <SelectItem value="sqlite">SQLite</SelectItem>
        </SelectContent>
      </Select>
    </div>
  )
}
```

## 样式定制

所有组件都支持通过 `className` 属性自定义样式：

```tsx
<Select>
  <SelectTrigger className="w-full">
    <SelectValue placeholder="自定义宽度" />
  </SelectTrigger>
  <SelectContent className="max-h-[200px]">
    {/* 自定义最大高度 */}
    <SelectItem value="1">选项 1</SelectItem>
    <SelectItem value="2">选项 2</SelectItem>
  </SelectContent>
</Select>
```

## 键盘导航

- `Space` / `Enter` - 打开/关闭下拉菜单
- `↑` / `↓` - 在选项间导航
- `Home` / `End` - 跳到第一个/最后一个选项
- `Esc` - 关闭下拉菜单
- `A-Z` - 快速跳转到以该字母开头的选项

## 可访问性

- 完整的 ARIA 属性支持
- 键盘导航支持
- 屏幕阅读器友好
- 焦点管理
- 符合 WCAG 2.1 AA 标准

## 设计系统

组件使用统一的设计系统：

- **颜色**: 使用语义化类名（`bg-surface`, `text-foreground`, `border-border`）
- **圆角**: `rounded-md`（触发器）、`rounded-lg`（内容）
- **阴影**: `shadow-lg`（下拉内容）
- **Z-Index**: `z-dropdown` (1000)
- **过渡**: 使用 Tailwind 动画类（`animate-in`, `animate-out`）

## 注意事项

1. **必须使用 SelectValue**: 触发器内必须包含 `<SelectValue>` 组件来显示选中值
2. **Portal 渲染**: 下拉内容通过 Portal 渲染到 body，避免 z-index 问题
3. **受控模式**: 使用 `value` 和 `onValueChange` 实现受控组件
4. **非受控模式**: 使用 `defaultValue` 实现非受控组件

## 与原生 select 的对比

| 特性 | 原生 select | Select 组件 |
|------|------------|------------|
| 样式定制 | ❌ 受限 | ✅ 完全可定制 |
| 键盘导航 | ✅ 基础支持 | ✅ 增强支持 |
| 可访问性 | ✅ 基础支持 | ✅ 完整支持 |
| 分组 | ✅ optgroup | ✅ SelectGroup |
| 搜索 | ❌ 不支持 | 🟡 可扩展 |
| 动画 | ❌ 不支持 | ✅ 支持 |
| TypeScript | ❌ 基础类型 | ✅ 完整类型 |

## 迁移指南

从原生 `<select>` 迁移到 Select 组件：

**迁移前**:
```jsx
<select value={value} onChange={(e) => setValue(e.target.value)}>
  <option value="mysql">MySQL</option>
  <option value="postgresql">PostgreSQL</option>
</select>
```

**迁移后**:
```tsx
<Select value={value} onValueChange={setValue}>
  <SelectTrigger>
    <SelectValue placeholder="选择数据库" />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="mysql">MySQL</SelectItem>
    <SelectItem value="postgresql">PostgreSQL</SelectItem>
  </SelectContent>
</Select>
```

## 相关组件

- `Input` - 输入框组件
- `Label` - 标签组件
- `Form` - 表单组件
- `Popover` - 弹出层组件

## 参考资料

- [Radix UI Select 文档](https://www.radix-ui.com/docs/primitives/components/select)
- [shadcn/ui Select 文档](https://ui.shadcn.com/docs/components/select)
- [ARIA Select Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/combobox/examples/combobox-select-only/)
