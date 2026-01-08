# enforce-import-order

强制执行导入顺序规范。

## 规则详情

此规则强制执行统一的导入顺序，提高代码可读性和一致性。

### 为什么需要这个规则？

1. **提高可读性**: 统一的导入顺序让代码更容易阅读
2. **减少冲突**: 避免合并代码时的导入顺序冲突
3. **易于查找**: 快速定位特定的导入
4. **团队一致性**: 确保团队成员使用相同的导入风格

## 标准导入顺序

```typescript
// 1. React 相关
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

// 2. 外部依赖
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { z } from 'zod';

// 3. 内部模块（API）
import { getDuckDBTables, executeDuckDBSQL } from '@/api';

// 4. UI 组件
import { Button } from '@/new/components/ui/button';
import { Card, CardHeader, CardContent } from '@/new/components/ui/card';
import { Dialog } from '@/new/components/ui/dialog';

// 5. 业务组件
import { DataSourcePanel } from '@/new/Query/DataSourcePanel';
import { ResultPanel } from '@/new/Query/ResultPanel';

// 6. Hooks
import { useDuckDBTables } from '@/new/hooks/useDuckDBTables';
import { useDataSources } from '@/new/hooks/useDataSources';

// 7. 工具函数
import { cn } from '@/new/utils/cn';
import { formatDate } from '@/new/utils/dateUtils';

// 8. 类型定义
import type { Table } from '@/types/table';
import type { QueryResult } from '@/types/query';

// 9. 样式
import './styles.css';
```

## 错误示例

```typescript
// ❌ 错误：顺序混乱
import { Button } from '@/new/components/ui/button';
import React from 'react';
import { getDuckDBTables } from '@/api';
import { useQuery } from '@tanstack/react-query';
import { useDuckDBTables } from '@/new/hooks/useDuckDBTables';
import './styles.css';
import { toast } from 'sonner';
```

```typescript
// ❌ 错误：组之间没有空行
import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/new/components/ui/button';
import { useDuckDBTables } from '@/new/hooks/useDuckDBTables';
```

```typescript
// ❌ 错误：组内有多余空行
import React from 'react';
import { useState } from 'react';

import { useEffect } from 'react';
```

## 正确示例

```typescript
// ✅ 正确：标准顺序，组之间有空行
import React, { useState, useEffect } from 'react';

import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';

import { getDuckDBTables } from '@/api';

import { Button } from '@/new/components/ui/button';
import { Card } from '@/new/components/ui/card';

import { useDuckDBTables } from '@/new/hooks/useDuckDBTables';

import { cn } from '@/new/utils/cn';

import type { Table } from '@/types/table';

import './styles.css';
```

```typescript
// ✅ 正确：简单组件
import React from 'react';

import { Button } from '@/new/components/ui/button';

function MyButton() {
  return <Button>点击</Button>;
}
```

## 配置选项

```json
{
  "rules": {
    "duckquery/enforce-import-order": ["error", {
      "groups": [
        "react",
        "external",
        "internal",
        "components",
        "hooks",
        "utils",
        "types",
        "styles"
      ],
      "pathGroups": [
        {
          "pattern": "react",
          "group": "react",
          "position": "before"
        },
        {
          "pattern": "@tanstack/**",
          "group": "external",
          "position": "before"
        }
      ]
    }]
  }
}
```

### `groups`

导入组的顺序数组。

默认值：
```json
[
  "react",       // React 相关
  "external",    // 外部依赖
  "internal",    // 内部模块
  "components",  // 组件
  "hooks",       // Hooks
  "utils",       // 工具函数
  "types",       // 类型定义
  "styles"       // 样式
]
```

### `pathGroups`

自定义路径组配置。

默认配置：
```json
[
  { "pattern": "react", "group": "react", "position": "before" },
  { "pattern": "react-*", "group": "react", "position": "before" },
  { "pattern": "@tanstack/**", "group": "external", "position": "before" },
  { "pattern": "@/new/components/ui/**", "group": "components", "position": "before" },
  { "pattern": "@/new/components/**", "group": "components", "position": "after" },
  { "pattern": "@/new/hooks/**", "group": "hooks", "position": "before" },
  { "pattern": "@/new/utils/**", "group": "utils", "position": "before" },
  { "pattern": "@/api/**", "group": "internal", "position": "before" },
  { "pattern": "@/types/**", "group": "types", "position": "before" },
  { "pattern": "*.css", "group": "styles", "position": "after" }
]
```

## 自动修复

此规则支持 `--fix` 选项自动修复导入顺序和空行问题：

```bash
# 自动修复
npm run lint -- --fix

# 或
eslint --fix src/**/*.tsx
```

## 常见场景

### 场景 1: React 组件

```typescript
// ✅ 标准顺序
import React, { useState, useCallback } from 'react';

import { useQuery } from '@tanstack/react-query';

import { Button } from '@/new/components/ui/button';

import { useDuckDBTables } from '@/new/hooks/useDuckDBTables';

function MyComponent() {
  // ...
}
```

### 场景 2: 工具函数

```typescript
// ✅ 工具函数通常只需要少量导入
import { format } from 'date-fns';

import { cn } from '@/new/utils/cn';

export function formatDate(date: Date) {
  // ...
}
```

### 场景 3: 类型定义文件

```typescript
// ✅ 类型文件可能不需要导入
export interface Table {
  name: string;
  rowCount: number;
}

export type QueryResult = {
  columns: string[];
  rows: any[][];
};
```

### 场景 4: 测试文件

```typescript
// ✅ 测试文件的导入顺序
import React from 'react';

import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';

import { Button } from '@/new/components/ui/button';

import { useDuckDBTables } from '@/new/hooks/useDuckDBTables';

describe('MyComponent', () => {
  // ...
});
```

## 与其他工具集成

### Prettier

此规则与 Prettier 兼容。建议配置：

```json
{
  "prettier": {
    "importOrder": [],
    "importOrderSeparation": true
  }
}
```

### VS Code

在 VS Code 中启用保存时自动修复：

```json
{
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  }
}
```

## 何时不使用此规则

- 如果项目已有其他导入顺序规则（如 `import/order`）
- 如果团队有不同的导入顺序偏好

## 相关规则

- ESLint: `import/order`
- ESLint: `sort-imports`

## 参考资源

- [前端开发约束](.kiro/steering/frontend-constraints.md)
- [TypeScript 最佳实践](https://www.typescriptlang.org/docs/handbook/declaration-files/do-s-and-don-ts.html)

## 版本

此规则在 v1.0.0 中引入。
