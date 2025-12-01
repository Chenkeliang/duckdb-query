# 新旧布局隔离架构

## 🎯 核心原则

**完全隔离新旧布局，避免混淆和冲突**

---

## 📁 目录结构设计

### ✅ 正确的设计（隔离）

```
frontend/src/
├── lib/
│   └── utils.js                    # ✅ 全局共享工具函数
│
├── new/                            # ✅ 新布局（shadcn/ui）
│   ├── components/
│   │   └── ui/                     # ✅ shadcn/ui 组件（仅新布局使用）
│   │       ├── button.jsx
│   │       ├── card.jsx
│   │       ├── input.jsx
│   │       ├── form.jsx
│   │       ├── badge.jsx
│   │       ├── tooltip.jsx
│   │       └── ...
│   │
│   ├── Layout/
│   │   ├── Sidebar.jsx             # 使用 @/new/components/ui/button
│   │   ├── Header.jsx              # 使用 @/new/components/ui/button
│   │   └── PageShell.jsx
│   │
│   └── DataSource/
│       ├── DatabaseForm.jsx        # 使用 @/new/components/ui/*
│       ├── UploadPanel.jsx
│       └── ...
│
└── components/                     # ✅ 旧布局（MUI）
    ├── QueryBuilder/
    │   └── QueryBuilder.jsx        # 使用 @mui/material
    ├── Results/
    │   └── ModernDataDisplay.jsx   # 使用 @mui/material
    └── ...
```

### ❌ 错误的设计（混淆）

```
frontend/src/
├── components/
│   ├── ui/                         # ❌ shadcn/ui 组件在全局
│   │   ├── button.jsx              # ❌ 新旧布局都可能用到
│   │   └── ...
│   │
│   ├── QueryBuilder/               # ❌ 旧布局组件
│   │   └── QueryBuilder.jsx        # 使用 MUI
│   │
│   └── Results/                    # ❌ 旧布局组件
│       └── ModernDataDisplay.jsx   # 使用 MUI
│
└── new/                            # ❌ 新布局组件
    ├── Layout/
    │   └── Sidebar.jsx             # 使用 @/components/ui/button ❌ 混淆
    └── DataSource/
        └── DatabaseForm.jsx        # 使用 @/components/ui/card ❌ 混淆
```

**问题**：
1. ❌ shadcn/ui 组件在全局 `components/ui/`，新旧布局都可能误用
2. ❌ 旧布局组件可能误用 shadcn/ui 组件
3. ❌ 新布局组件可能误用 MUI 组件
4. ❌ 难以区分哪些组件属于哪个布局

---

## 🔒 隔离策略

### 1. 目录隔离

```
new/                    # 新布局专用目录
├── components/ui/      # shadcn/ui 组件（仅新布局使用）
├── Layout/             # 新布局的 Layout 组件
└── DataSource/         # 新布局的 DataSource 组件

components/             # 旧布局专用目录
├── QueryBuilder/       # 旧布局的 QueryBuilder 组件（使用 MUI）
├── Results/            # 旧布局的 Results 组件（使用 MUI）
└── ...
```

### 2. 导入路径隔离

#### 新布局组件导入
```jsx
// ✅ 新布局组件（Sidebar.jsx）
import { Button } from '@/new/components/ui/button';
import { Tooltip } from '@/new/components/ui/tooltip';

function Sidebar() {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon">
          <Home className="h-5 w-5" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>首页</TooltipContent>
    </Tooltip>
  );
}
```

#### 旧布局组件导入
```jsx
// ✅ 旧布局组件（QueryBuilder.jsx）
import { Button, TextField } from '@mui/material';

function QueryBuilder() {
  return (
    <div>
      <TextField label="查询条件" />
      <Button variant="contained">执行</Button>
    </div>
  );
}
```

### 3. 路径别名配置

```javascript
// vite.config.js
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@/new': path.resolve(__dirname, './src/new'),
      '@/components': path.resolve(__dirname, './src/components')
    }
  }
});
```

**使用示例**：
```jsx
// 新布局组件
import { Button } from '@/new/components/ui/button';  // ✅ 明确是新布局

// 旧布局组件
import QueryBuilder from '@/components/QueryBuilder';  // ✅ 明确是旧布局

// 全局工具
import { cn } from '@/lib/utils';  // ✅ 全局共享
```

---

## 📋 组件导入规范

### 新布局组件（`new/` 目录下）

**必须使用**：
```jsx
import { Button } from '@/new/components/ui/button';
import { Card } from '@/new/components/ui/card';
import { Input } from '@/new/components/ui/input';
import { Form } from '@/new/components/ui/form';
import { Badge } from '@/new/components/ui/badge';
import { Tooltip } from '@/new/components/ui/tooltip';
import { Skeleton } from '@/new/components/ui/skeleton';
```

**禁止使用**：
```jsx
import { Button } from '@mui/material';  // ❌ 不要在新布局中使用 MUI
```

### 旧布局组件（`components/` 目录下）

**必须使用**：
```jsx
import { Button, TextField, Card } from '@mui/material';
```

**禁止使用**：
```jsx
import { Button } from '@/new/components/ui/button';  // ❌ 不要在旧布局中使用 shadcn/ui
```

### 全局共享（`lib/` 目录下）

**可以在新旧布局中使用**：
```jsx
import { cn } from '@/lib/utils';  // ✅ 全局工具函数
```

---

## 🎨 样式隔离

### 新布局样式

**使用**：
- `frontend/src/styles/tailwind.css` - Tailwind CSS 变量
- `tailwind.config.js` - Tailwind 配置
- shadcn/ui 组件内置样式

**作用域**：
```jsx
// PageShell.jsx
<div className="dq-new-theme">
  {/* 新布局内容 */}
</div>
```

### 旧布局样式

**使用**：
- `frontend/src/styles/modern.css` - 自定义 CSS
- MUI 主题配置

**作用域**：
```jsx
// ShadcnApp.jsx
<ThemeProvider theme={muiTheme}>
  {/* 旧布局内容 */}
</ThemeProvider>
```

---

## 🔍 ESLint 规则（可选）

为了强制隔离，可以添加 ESLint 规则：

```javascript
// .eslintrc.js
module.exports = {
  rules: {
    'no-restricted-imports': [
      'error',
      {
        patterns: [
          {
            group: ['@/new/components/ui/*'],
            message: '旧布局组件不能导入 shadcn/ui 组件',
            // 仅在 components/ 目录下生效
            paths: ['**/components/**']
          },
          {
            group: ['@mui/material'],
            message: '新布局组件不能导入 MUI 组件',
            // 仅在 new/ 目录下生效
            paths: ['**/new/**']
          }
        ]
      }
    ]
  }
};
```

---

## 📊 隔离效果对比

### ❌ 混淆的架构

```
components/
├── ui/                 # shadcn/ui（全局）
│   ├── button.jsx
│   └── card.jsx
├── QueryBuilder.jsx    # 旧布局（MUI）
└── Results.jsx         # 旧布局（MUI）

new/
├── Sidebar.jsx         # 新布局
└── DatabaseForm.jsx    # 新布局
```

**问题**：
- QueryBuilder.jsx 可能误用 `@/components/ui/button`
- Sidebar.jsx 可能误用 `@mui/material`
- 难以区分组件归属

### ✅ 隔离的架构

```
new/
├── components/ui/      # shadcn/ui（仅新布局）
│   ├── button.jsx
│   └── card.jsx
├── Sidebar.jsx         # 新布局
└── DatabaseForm.jsx    # 新布局

components/
├── QueryBuilder.jsx    # 旧布局（MUI）
└── Results.jsx         # 旧布局（MUI）
```

**优势**：
- ✅ 新旧布局完全隔离
- ✅ 导入路径明确（`@/new/components/ui/*` vs `@mui/material`）
- ✅ 不会误用组件
- ✅ 易于维护和理解

---

## 🎯 迁移路径

### 阶段 1：创建隔离结构
```bash
mkdir -p frontend/src/new/components/ui
```

### 阶段 2：创建 shadcn/ui 组件
```bash
# 在 new/components/ui/ 下创建所有 shadcn/ui 组件
frontend/src/new/components/ui/
├── button.jsx
├── card.jsx
├── input.jsx
├── form.jsx
├── badge.jsx
├── tooltip.jsx
└── ...
```

### 阶段 3：迁移新布局组件
```jsx
// 修改 new/Layout/Sidebar.jsx
import { Button } from '@/new/components/ui/button';  // ✅ 使用隔离的组件
```

### 阶段 4：保持旧布局不变
```jsx
// components/QueryBuilder.jsx 保持不变
import { Button } from '@mui/material';  // ✅ 继续使用 MUI
```

---

## 💡 最佳实践

### 1. 明确的导入路径
```jsx
// ✅ 好的做法
import { Button } from '@/new/components/ui/button';  // 明确是新布局
import { Button } from '@mui/material';               // 明确是旧布局

// ❌ 不好的做法
import { Button } from '@/components/ui/button';      // 不明确归属
```

### 2. 组件命名约定
```jsx
// 新布局组件文件名
new/Layout/Sidebar.jsx          // ✅ 在 new/ 目录下
new/DataSource/DatabaseForm.jsx // ✅ 在 new/ 目录下

// 旧布局组件文件名
components/QueryBuilder/QueryBuilder.jsx  // ✅ 在 components/ 目录下
components/Results/ModernDataDisplay.jsx  // ✅ 在 components/ 目录下
```

### 3. 代码审查检查清单
- [ ] 新布局组件是否在 `new/` 目录下？
- [ ] 新布局组件是否只导入 `@/new/components/ui/*`？
- [ ] 旧布局组件是否在 `components/` 目录下？
- [ ] 旧布局组件是否只导入 `@mui/material`？
- [ ] 是否有跨布局的组件导入？

---

## 🎉 总结

### ✅ 隔离架构的优势

1. **清晰的边界** - 新旧布局完全分离
2. **避免混淆** - 导入路径明确归属
3. **易于维护** - 修改一个布局不影响另一个
4. **渐进式迁移** - 可以逐步迁移，不影响旧布局
5. **团队协作** - 不同团队可以独立开发新旧布局

### 📈 迁移收益

- ✅ 新布局使用 shadcn/ui（现代、可访问）
- ✅ 旧布局保持 MUI（稳定、不变）
- ✅ 两者互不影响
- ✅ 可以逐步废弃旧布局

### 🚀 下一步

1. 创建 `new/components/ui/` 目录
2. 创建所有 shadcn/ui 组件
3. 迁移新布局组件
4. 保持旧布局不变
5. 逐步废弃旧布局（可选）
