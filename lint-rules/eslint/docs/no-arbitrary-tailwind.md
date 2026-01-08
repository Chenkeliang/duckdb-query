# no-arbitrary-tailwind

禁止在新布局中使用 Tailwind CSS arbitrary values。

## 规则详情

此规则禁止在新布局 (`frontend/src/new/`) 中使用 Tailwind CSS 的 arbitrary values（方括号语法），强制使用标准 Tailwind 类或 shadcn/ui 语义类。

### 为什么需要这个规则？

1. **保持一致性**: 使用标准类确保整个项目的样式一致
2. **易于维护**: 语义化类名更容易理解和维护
3. **主题支持**: 语义类自动支持主题切换
4. **避免硬编码**: 防止硬编码颜色、尺寸等值
5. **设计系统**: 强制使用设计系统中定义的值

## 错误示例

```tsx
// ❌ 错误：使用 arbitrary color
<div className="bg-[#ffffff] text-[rgb(0,0,0)]">
  内容
</div>

// ❌ 错误：使用 arbitrary size
<div className="text-[14px] w-[200px] h-[100px]">
  内容
</div>

// ❌ 错误：使用 arbitrary z-index
<div className="z-[999]">
  内容
</div>

// ❌ 错误：使用 arbitrary spacing
<div className="p-[12px] m-[8px]">
  内容
</div>

// ❌ 错误：在 cn() 中使用
<div className={cn("bg-[#fff]", "text-[14px]")}>
  内容
</div>

// ❌ 错误：在模板字符串中使用
<div className={`bg-[#fff] ${isActive ? 'text-[red]' : ''}`}>
  内容
</div>
```

## 正确示例

```tsx
// ✅ 正确：使用语义颜色类
<div className="bg-background text-foreground">
  内容
</div>

// ✅ 正确：使用标准尺寸类
<div className="text-sm w-48 h-24">
  内容
</div>

// ✅ 正确：使用标准 z-index 类
<div className="z-50">
  内容
</div>

// ✅ 正确：使用标准 spacing 类
<div className="p-3 m-2">
  内容
</div>

// ✅ 正确：使用 shadcn/ui 语义类
<Card className="border-border shadow-sm">
  <CardHeader>
    <CardTitle className="text-foreground">标题</CardTitle>
  </CardHeader>
</Card>

// ✅ 正确：动态尺寸（允许的属性）
<div style={{ width: `${percentage}%` }}>
  内容
</div>

// ✅ 正确：使用 CSS 变量（在 tailwind.css 中定义）
<div className="bg-primary text-primary-foreground">
  内容
</div>
```

## 配置选项

```json
{
  "rules": {
    "duckquery/no-arbitrary-tailwind": ["error", {
      "allowedPaths": [
        "**/components/**",
        "**/*.test.*"
      ],
      "allowedProperties": [
        "width",
        "height",
        "top",
        "left"
      ]
    }]
  }
}
```

### `allowedPaths`

允许使用 arbitrary values 的文件路径模式（glob 格式）。

默认值：
```json
[
  "**/components/**",  // 旧布局
  "**/*.test.*",       // 测试文件
  "**/__tests__/**"    // 测试目录
]
```

### `allowedProperties`

允许使用 arbitrary values 的 CSS 属性列表。某些动态计算的值可能需要使用 arbitrary values。

默认值：
```json
[
  "width",   // 动态宽度
  "height",  // 动态高度
  "top",     // 动态定位
  "left",
  "right",
  "bottom"
]
```

## 常见场景和解决方案

### 场景 1: 需要特定颜色

```tsx
// ❌ 错误
<div className="bg-[#3b82f6]">内容</div>

// ✅ 正确：使用 Tailwind 标准颜色
<div className="bg-blue-500">内容</div>

// ✅ 更好：使用语义颜色
<div className="bg-primary">内容</div>
```

### 场景 2: 需要特定尺寸

```tsx
// ❌ 错误
<div className="text-[14px]">内容</div>

// ✅ 正确：使用标准尺寸类
<div className="text-sm">内容</div>

// 标准尺寸对照表：
// text-xs: 12px
// text-sm: 14px
// text-base: 16px
// text-lg: 18px
// text-xl: 20px
```

### 场景 3: 需要特定间距

```tsx
// ❌ 错误
<div className="p-[12px]">内容</div>

// ✅ 正确：使用标准间距类
<div className="p-3">内容</div>

// 标准间距对照表（1 单位 = 0.25rem = 4px）：
// p-1: 4px
// p-2: 8px
// p-3: 12px
// p-4: 16px
// p-6: 24px
```

### 场景 4: 需要动态值

```tsx
// ❌ 错误：使用 arbitrary value
<div className={`w-[${width}px]`}>内容</div>

// ✅ 正确：使用 inline style
<div style={{ width: `${width}px` }}>内容</div>

// ✅ 更好：使用 CSS 变量
<div style={{ '--width': `${width}px` } as React.CSSProperties} 
     className="w-[var(--width)]">
  内容
</div>
```

### 场景 5: 需要自定义 z-index

```tsx
// ❌ 错误
<div className="z-[999]">内容</div>

// ✅ 正确：使用标准 z-index
<div className="z-50">内容</div>

// 标准 z-index：
// z-0: 0
// z-10: 10
// z-20: 20
// z-30: 30
// z-40: 40
// z-50: 50

// ✅ 如果确实需要自定义值，在 tailwind.config.js 中定义
// tailwind.config.js
module.exports = {
  theme: {
    extend: {
      zIndex: {
        'modal': '1000',
        'tooltip': '1100'
      }
    }
  }
}

// 然后使用
<div className="z-modal">内容</div>
```

## 何时不使用此规则

- 在旧布局 (`frontend/src/components/`) 中
- 在测试文件中
- 在需要动态计算值的特殊场景中（但应优先考虑 inline style）

## 相关规则

- `no-hardcoded-colors` - 禁止硬编码颜色值

## 参考资源

- [Tailwind CSS 官方文档](https://tailwindcss.com/)
- [Shadcn/UI 使用标准](.kiro/steering/shadcn-ui-standards.md)
- [前端开发约束](.kiro/steering/frontend-constraints.md)

## 版本

此规则在 v1.0.0 中引入。
