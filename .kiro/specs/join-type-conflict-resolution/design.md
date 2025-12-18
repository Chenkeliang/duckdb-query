# Design Document

## Overview

本设计文档描述 JOIN 类型冲突检测和解决方案的实现。该功能为新 UI 的 JoinQueryPanel 添加类型兼容性检查，当用户选择类型不兼容的 JOIN 列时，提供可视化的冲突指示和 TRY_CAST 类型转换解决方案。

### 设计目标

1. **类型一致性**: 使用 DuckDB 原生类型，不引入自定义类型分类
2. **非侵入式交互**: 通过内联指示器提示冲突，不打断用户操作流程
3. **智能推荐**: 根据类型组合自动推荐最佳转换类型
4. **实时反馈**: 类型选择后立即预览生成的 SQL

### 方案对比

| 方案 | 优点 | 缺点 | 结论 |
|------|------|------|------|
| **方案 A: 独立 Hook + 对话框** | 逻辑清晰、可复用、易测试 | 需要新增多个文件 | ✅ 推荐 |
| 方案 B: 内联到 JoinConnector | 代码集中 | 组件职责不清、难以测试 | ❌ |
| 方案 C: 后端检测 | 减少前端逻辑 | 增加网络请求、延迟反馈 | ❌ |

**选择方案 A 的理由**：
1. **关注点分离**: 类型检测逻辑独立于 UI 组件
2. **可复用性**: Hook 可用于其他需要类型检测的场景（如 VisualQuery）
3. **可测试性**: 纯函数和 Hook 易于单元测试和属性测试
4. **渐进增强**: 不修改现有 JoinConnector 核心逻辑，只添加冲突指示

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      JoinQueryPanel                              │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                    useJoinTypeConflict                       ││
│  │  - conflicts: TypeConflict[]                                 ││
│  │  - resolveConflict(key, type)                                ││
│  │  - resolveAllWithRecommendations()                           ││
│  │  - applyTryCastToSQL(sql)                                    ││
│  └─────────────────────────────────────────────────────────────┘│
│                              │                                   │
│              ┌───────────────┴───────────────┐                   │
│              ▼                               ▼                   │
│  ┌─────────────────────────┐    ┌───────────────────────────────┐│
│  │ JoinConnector           │    │ TypeConflictDialog            ││
│  │ + ConflictIndicator     │    │ (shadcn/ui Dialog)            ││
│  │   (内联警告/成功徽章)    │    │ - 冲突列表表格                 ││
│  └─────────────────────────┘    │ - 类型选择器                   ││
│                                 │ - SQL 预览                     ││
│                                 │ - 一键应用推荐                  ││
│                                 └───────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                frontend/src/new/utils/duckdbTypes.ts             │
│  - DUCKDB_CAST_TYPES: string[]     // 可用于 TRY_CAST 的类型     │
│  - normalizeTypeName(type): string // 标准化类型名               │
│  - areTypesCompatible(l, r): bool  // 类型兼容性检查             │
│  - getRecommendedCastType(l, r): string // 推荐转换类型          │
└─────────────────────────────────────────────────────────────────┘
```

### 文件结构

```
frontend/src/new/
├── utils/
│   └── duckdbTypes.ts              # DuckDB 类型工具函数（通用）
├── hooks/
│   └── useTypeConflict.ts          # 类型冲突检测 Hook（通用）
└── Query/
    ├── components/
    │   ├── TypeConflictIndicator.tsx   # 类型冲突指示器（通用）
    │   └── TypeConflictDialog.tsx      # 类型冲突解决对话框（通用）
    ├── JoinQuery/
    │   └── JoinQueryPanel.tsx          # JOIN 查询面板（集成 Hook）
    ├── VisualQuery/
    │   └── ...                         # 可视化查询（可复用 Hook）
    └── SetOperations/
        └── ...                         # 集合操作（可复用 Hook）
```

**通用性设计**：
- `duckdbTypes.ts` - 纯工具函数，任何需要类型处理的地方都可以使用
- `useTypeConflict.ts` - 通用 Hook，接受列类型映射，返回冲突检测结果
- `TypeConflictIndicator.tsx` - 通用指示器组件，可用于任何显示类型冲突的场景
- `TypeConflictDialog.tsx` - 通用对话框，可用于 JOIN、VisualQuery、SetOperations 等

## Components and Interfaces

### 1. DuckDB 类型工具模块 (`duckdbTypes.ts`)

```typescript
/**
 * 可用于 TRY_CAST 的 DuckDB 类型
 * 注意：这些是 DuckDB 原生类型，不是自定义分类
 */
export const DUCKDB_CAST_TYPES = [
  'VARCHAR',           // 最通用，任何类型都可以转为字符串
  'BIGINT',            // 64位整数
  'INTEGER',           // 32位整数
  'DOUBLE',            // 双精度浮点
  'DECIMAL(18,4)',     // 高精度小数
  'TIMESTAMP',         // 时间戳
  'DATE',              // 日期
  'BOOLEAN',           // 布尔
] as const;

/**
 * 整数类型家族（可以互相兼容）
 */
const INTEGER_TYPES = new Set([
  'TINYINT', 'SMALLINT', 'INTEGER', 'INT', 'BIGINT', 'HUGEINT',
  'UTINYINT', 'USMALLINT', 'UINTEGER', 'UBIGINT',
]);

/**
 * 浮点类型家族
 */
const FLOAT_TYPES = new Set(['FLOAT', 'REAL', 'DOUBLE']);

/**
 * 字符串类型家族
 */
const STRING_TYPES = new Set(['VARCHAR', 'TEXT', 'CHAR', 'STRING', 'BPCHAR']);

/**
 * 日期时间类型家族
 */
const DATETIME_TYPES = new Set(['DATE', 'TIME', 'TIMESTAMP', 'TIMESTAMPTZ', 'INTERVAL']);

/**
 * 复杂类型（需要精确匹配）
 */
const COMPLEX_TYPES = new Set(['ENUM', 'LIST', 'ARRAY', 'MAP', 'STRUCT', 'UNION', 'JSON']);

/**
 * 标准化类型名（去除精度/长度参数）
 * DECIMAL(18,4) → DECIMAL
 * VARCHAR(255) → VARCHAR
 */
export function normalizeTypeName(type: string | null | undefined): string {
  if (!type) return 'UNKNOWN';
  const upper = type.toUpperCase().trim();
  const match = upper.match(/^([A-Z_]+)/);
  return match ? match[1] : upper;
}

/**
 * 检查两个类型是否兼容（可以直接比较，无需 TRY_CAST）
 */
export function areTypesCompatible(leftType: string, rightType: string): boolean {
  const left = normalizeTypeName(leftType);
  const right = normalizeTypeName(rightType);
  
  // 完全相同
  if (left === right) return true;
  
  // 复杂类型需要精确匹配（已经在上面检查过）
  if (COMPLEX_TYPES.has(left) || COMPLEX_TYPES.has(right)) {
    return false;
  }
  
  // 同一类型家族内兼容
  if (INTEGER_TYPES.has(left) && INTEGER_TYPES.has(right)) return true;
  if (FLOAT_TYPES.has(left) && FLOAT_TYPES.has(right)) return true;
  if (STRING_TYPES.has(left) && STRING_TYPES.has(right)) return true;
  if (DATETIME_TYPES.has(left) && DATETIME_TYPES.has(right)) return true;
  
  // DECIMAL 类型之间兼容（DuckDB 会自动处理精度差异）
  if (left === 'DECIMAL' && right === 'DECIMAL') return true;
  
  // 整数和浮点可以兼容（DuckDB 会自动提升）
  if ((INTEGER_TYPES.has(left) && FLOAT_TYPES.has(right)) ||
      (FLOAT_TYPES.has(left) && INTEGER_TYPES.has(right))) return true;
  
  // 整数/浮点和 DECIMAL 兼容
  if ((INTEGER_TYPES.has(left) || FLOAT_TYPES.has(left)) && right === 'DECIMAL') return true;
  if (left === 'DECIMAL' && (INTEGER_TYPES.has(right) || FLOAT_TYPES.has(right))) return true;
  
  return false;
}

/**
 * 获取推荐的 TRY_CAST 目标类型
 */
export function getRecommendedCastType(leftType: string, rightType: string): string {
  const left = normalizeTypeName(leftType);
  const right = normalizeTypeName(rightType);
  
  // 如果其中一个是字符串类型，推荐 VARCHAR
  if (STRING_TYPES.has(left) || STRING_TYPES.has(right)) {
    return 'VARCHAR';
  }
  
  // 如果都是数值类型，推荐 DOUBLE（最大兼容性）
  const leftIsNumeric = INTEGER_TYPES.has(left) || FLOAT_TYPES.has(left) || left === 'DECIMAL';
  const rightIsNumeric = INTEGER_TYPES.has(right) || FLOAT_TYPES.has(right) || right === 'DECIMAL';
  if (leftIsNumeric && rightIsNumeric) {
    return 'DOUBLE';
  }
  
  // 如果涉及日期时间，推荐 TIMESTAMP
  if (DATETIME_TYPES.has(left) || DATETIME_TYPES.has(right)) {
    return 'TIMESTAMP';
  }
  
  // 复杂类型推荐 VARCHAR（作为字符串比较）
  if (COMPLEX_TYPES.has(left) || COMPLEX_TYPES.has(right)) {
    return 'VARCHAR';
  }
  
  // 默认推荐 VARCHAR（最通用）
  return 'VARCHAR';
}

/**
 * 生成冲突的唯一 key（基于内容而非索引）
 * 这样即使 JOIN 配置顺序变化，已解决的冲突仍然有效
 */
export function generateConflictKey(
  leftLabel: string,
  leftColumn: string,
  rightLabel: string,
  rightColumn: string
): string {
  return `${leftLabel}.${leftColumn}::${rightLabel}.${rightColumn}`.toLowerCase();
}
```

### 2. 类型冲突 Hook (`useTypeConflict.ts`)

```typescript
/**
 * 列对（用于比较的两列）
 */
export interface ColumnPair {
  /** 唯一标识 */
  key: string;
  /** 左侧标识（表名或别名） */
  leftLabel: string;
  /** 左列名 */
  leftColumn: string;
  /** 左列类型 */
  leftType: string;
  /** 右侧标识（表名或别名） */
  rightLabel: string;
  /** 右列名 */
  rightColumn: string;
  /** 右列类型 */
  rightType: string;
}

/**
 * 类型冲突对象
 */
export interface TypeConflict extends ColumnPair {
  /** 系统推荐的转换类型 */
  recommendedType: string;
  /** 用户选择的转换类型（undefined 表示未解决） */
  resolvedType?: string;
}

/**
 * Hook 返回值
 */
export interface UseTypeConflictReturn {
  /** 所有检测到的冲突 */
  conflicts: TypeConflict[];
  /** 未解决的冲突数量 */
  unresolvedCount: number;
  /** 是否存在冲突 */
  hasConflicts: boolean;
  /** 是否所有冲突都已解决 */
  allResolved: boolean;
  /** 解决单个冲突 */
  resolveConflict: (key: string, targetType: string) => void;
  /** 一键应用所有推荐类型 */
  resolveAllWithRecommendations: () => void;
  /** 清除所有解决方案 */
  clearResolutions: () => void;
  /** 根据 key 获取冲突 */
  getConflict: (key: string) => TypeConflict | null;
  /** 获取已解决的类型映射 { key: resolvedType } */
  resolvedTypes: Record<string, string>;
}

/**
 * 通用类型冲突检测和管理 Hook
 * 
 * @param columnPairs - 需要检查的列对列表
 * @returns 冲突检测结果和管理方法
 * 
 * @example
 * // 在 JoinQueryPanel 中使用
 * const columnPairs = joinConfigs.flatMap((config, i) => 
 *   config.conditions.map((cond, j) => ({
 *     key: `${i}::${j}`,
 *     leftLabel: leftTableName,
 *     leftColumn: cond.leftColumn,
 *     leftType: getColumnType(leftTableName, cond.leftColumn),
 *     rightLabel: rightTableName,
 *     rightColumn: cond.rightColumn,
 *     rightType: getColumnType(rightTableName, cond.rightColumn),
 *   }))
 * );
 * const { conflicts, resolveConflict } = useTypeConflict(columnPairs);
 */
export function useTypeConflict(columnPairs: ColumnPair[]): UseTypeConflictReturn;
```

**实现要点**：
1. 使用 `useMemo` 计算冲突列表，避免不必要的重计算
2. 使用 `useCallback` 稳定回调函数引用
3. 使用 `useState` 存储解决方案（需要触发重渲染以更新 UI）
4. 当 `columnPairs` 变化时，自动清理失效的解决方案（key 不再存在的）
5. 通用设计：不依赖具体的 JOIN 结构，只关心列对
6. **Key 设计**：使用基于内容的 key（`leftLabel.leftColumn::rightLabel.rightColumn`），而非索引，确保 JOIN 配置顺序变化时已解决的冲突仍然有效
7. **同列检测**：如果左右是同一列（同表同列名），不视为冲突

### 3. 类型冲突指示器组件 (`TypeConflictIndicator.tsx`)

位置：`frontend/src/new/Query/components/TypeConflictIndicator.tsx`

```typescript
interface TypeConflictIndicatorProps {
  /** 冲突对象，null 表示无冲突 */
  conflict: TypeConflict | null;
  /** 点击时的回调（打开对话框） */
  onClick?: () => void;
  /** 尺寸 */
  size?: 'sm' | 'md';
}

/**
 * 通用类型冲突指示器
 * - 无冲突：不显示
 * - 未解决冲突：显示警告图标 + tooltip
 * - 已解决冲突：显示成功图标 + tooltip
 * 
 * 可用于：JoinQueryPanel、VisualQuery、SetOperations 等
 */
export const TypeConflictIndicator: React.FC<TypeConflictIndicatorProps>;
```

**UI 设计**：
```
未解决状态:
┌─────────────────────────────────────┐
│  ⚠️  ← 点击打开对话框               │
│  └─ Tooltip: "类型冲突: VARCHAR ≠ BIGINT" │
└─────────────────────────────────────┘

已解决状态:
┌─────────────────────────────────────┐
│  ✓  ← 点击可重新编辑               │
│  └─ Tooltip: "已转换为 VARCHAR"     │
└─────────────────────────────────────┘
```

### 4. 类型冲突对话框 (`TypeConflictDialog.tsx`)

位置：`frontend/src/new/Query/components/TypeConflictDialog.tsx`

```typescript
interface TypeConflictDialogProps {
  /** 是否打开 */
  open: boolean;
  /** 冲突列表 */
  conflicts: TypeConflict[];
  /** 解决单个冲突 */
  onResolve: (key: string, targetType: string) => void;
  /** 一键应用所有推荐 */
  onResolveAll: () => void;
  /** 关闭对话框 */
  onClose: () => void;
  /** 确认并继续 */
  onConfirm: () => void;
  /** SQL 预览（可选） */
  sqlPreview?: string;
  /** 对话框标题（可选，默认"检测到类型冲突"） */
  title?: string;
  /** 确认按钮文本（可选，默认"应用转换并继续"） */
  confirmText?: string;
}

/**
 * 通用类型冲突解决对话框
 * 
 * 可用于：JoinQueryPanel、VisualQuery、SetOperations 等
 */
export const TypeConflictDialog: React.FC<TypeConflictDialogProps>;
```

**对话框布局**：
```
┌─────────────────────────────────────────────────────────────┐
│ ⚠️ 检测到 2 个类型冲突                          [×]        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ 比较条件         │ 左侧类型  │ 右侧类型  │ 转换为      │ │
│ ├─────────────────────────────────────────────────────────┤ │
│ │ orders.id =      │ BIGINT    │ VARCHAR   │ [VARCHAR ▼] │ │
│ │ users.order_id   │           │           │ (推荐)      │ │
│ ├─────────────────────────────────────────────────────────┤ │
│ │ orders.date =    │ DATE      │ TIMESTAMP │ [TIMESTAMP▼]│ │
│ │ logs.created_at  │           │           │ (推荐)      │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ [应用所有推荐]                                              │
│                                                             │
│ ┌─ SQL 预览 ──────────────────────────────────────────────┐ │
│ │ SELECT * FROM orders                                    │ │
│ │ JOIN users ON TRY_CAST(orders.id AS VARCHAR) =          │ │
│ │              TRY_CAST(users.order_id AS VARCHAR)        │ │
│ │ JOIN logs ON TRY_CAST(orders.date AS TIMESTAMP) =       │ │
│ │             TRY_CAST(logs.created_at AS TIMESTAMP)      │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                              [取消]  [应用转换并继续]       │
└─────────────────────────────────────────────────────────────┘
```

**使用 shadcn/ui 组件**：
- `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogFooter`
- `Table`, `TableHeader`, `TableBody`, `TableRow`, `TableCell`
- `Select`, `SelectTrigger`, `SelectContent`, `SelectItem`
- `Button`
- `Badge` (显示推荐标签)
- `Tooltip` (类型说明)
- `Alert` (TRY_CAST NULL 值警告)

**快捷键支持**：
- `Enter` - 确认并应用
- `Escape` - 取消
- `Ctrl/Cmd + A` - 应用所有推荐（当焦点在对话框内时）

## Data Models

### TypeConflict

```typescript
interface TypeConflict {
  key: string;                    // 唯一标识符（基于内容：leftLabel.leftColumn::rightLabel.rightColumn）
  leftLabel: string;              // 左侧标识（表名或别名）
  leftColumn: string;             // 左列名
  leftType: string;               // 左列 DuckDB 类型（原始类型，如 DECIMAL(18,4)）
  rightLabel: string;             // 右侧标识（表名或别名）
  rightColumn: string;            // 右列名
  rightType: string;              // 右列 DuckDB 类型（原始类型）
  recommendedType: string;        // 系统推荐的转换类型
  resolvedType?: string;          // 用户选择的转换类型（undefined 表示未解决）
}
```

**注意**：使用 `leftLabel`/`rightLabel` 而非 `leftTable`/`rightTable`，以支持表别名场景。

### JoinConfig (扩展)

```typescript
interface JoinCondition {
  leftColumn: string;
  rightColumn: string;
  operator: '=' | '!=' | '<' | '>' | '<=' | '>=';
  castType?: string;              // 新增：TRY_CAST 目标类型
}

interface JoinConfig {
  joinType: JoinType;
  conditions: JoinCondition[];
}
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Type normalization strips precision/length parameters
*For any* DuckDB type string with precision or length parameters (e.g., DECIMAL(18,4), VARCHAR(255)), normalizing the type SHALL return the base type name without parameters (e.g., DECIMAL, VARCHAR).
**Validates: Requirements 1.4**

### Property 2: Compatible types do not trigger conflicts
*For any* pair of columns with compatible types (same normalized type or within same type family), the conflict detection SHALL return no conflict for that pair.
**Validates: Requirements 1.1, 1.3**

### Property 3: Incompatible types trigger conflicts with correct type names
*For any* pair of columns with incompatible types, the conflict detection SHALL return a conflict object containing the original DuckDB type names for both columns.
**Validates: Requirements 1.1, 1.2**

### Property 4: Resolved conflicts generate TRY_CAST in SQL
*For any* resolved type conflict with a target type, the generated SQL SHALL contain TRY_CAST expressions for both columns with the exact target type name.
**Validates: Requirements 3.1, 3.2, 3.4**

### Property 5: Unresolved conflicts block execution
*For any* query with at least one unresolved type conflict, attempting to execute SHALL be blocked and return a flag indicating conflicts exist.
**Validates: Requirements 4.1, 4.2**

### Property 6: Resolution state persists until condition changes
*For any* resolved conflict, the resolution SHALL persist across re-renders until the JOIN condition columns are modified.
**Validates: Requirements 5.1, 5.2**

### Property 7: Recommended type follows type combination rules
*For any* type conflict, the recommended type SHALL follow the defined rules: numeric+string→VARCHAR, different numerics→larger type, date/time→TIMESTAMP.
**Validates: Requirements 8.1, 8.2, 8.3**

### Property 8: Apply all recommendations sets all conflicts to recommended types
*For any* set of conflicts, applying all recommendations SHALL set each conflict's resolved type to its recommended type.
**Validates: Requirements 9.2**

### Property 9: Conflict badge state reflects resolution status
*For any* conflict, the badge SHALL show warning state when unresolved and success state when resolved.
**Validates: Requirements 7.4, 7.5, 11.1, 11.2**

### Property 10: Dialog header shows correct conflict count
*For any* set of conflicts, the dialog header SHALL display the count of unresolved conflicts, or a success message when all are resolved.
**Validates: Requirements 11.3, 11.4**

## Error Handling

### 类型解析错误
- 如果列类型为 null 或 undefined，视为 'UNKNOWN' 类型
- UNKNOWN 类型与任何类型都不兼容，需要用户手动选择转换类型

### SQL 生成错误
- 如果 TRY_CAST 目标类型无效，回退到 VARCHAR
- 生成的 SQL 应始终是语法正确的

### 状态同步错误
- 如果 JOIN 配置变化导致冲突 key 失效，自动清理过期的解决方案
- 组件卸载时清理所有状态

### TRY_CAST NULL 值处理
- TRY_CAST 在转换失败时返回 NULL
- JOIN 条件中 NULL = NULL 返回 false（而非 true）
- **UI 提示**：在对话框中显示警告："TRY_CAST 转换失败的行将被排除在 JOIN 结果之外"

### 边界场景处理
| 场景 | 处理方式 |
|------|----------|
| 同一列与自己 JOIN | 不显示冲突（同表同列名） |
| JOIN 条件使用表达式 | 暂不支持类型检测，跳过 |
| 跨数据库类型差异 | 使用 DuckDB 映射后的类型进行比较 |
| 复杂类型（STRUCT/MAP/LIST） | 需要精确匹配，否则推荐 VARCHAR |

## Testing Strategy

### 单元测试

1. **duckdbTypes.ts**
   - `normalizeTypeName()` 各种类型格式的标准化
   - `areTypesCompatible()` 类型兼容性判断
   - `getRecommendedCastType()` 推荐类型逻辑

2. **useJoinTypeConflict.ts**
   - 冲突检测逻辑
   - 解决方案状态管理
   - SQL 生成逻辑

### 属性测试

使用 fast-check 进行属性测试：

1. **Property 1**: 类型标准化测试
2. **Property 2-3**: 类型兼容性测试
3. **Property 4**: SQL 生成测试
4. **Property 7**: 推荐类型测试
5. **Property 8**: 批量应用测试

### 组件测试

1. **ConflictBadge**
   - 警告/成功状态渲染
   - 点击交互

2. **TypeConflictDialog**
   - 冲突列表渲染
   - 类型选择交互
   - SQL 预览更新
   - 确认/取消流程

### 集成测试

1. JoinQueryPanel 完整流程测试
   - 选择不兼容列 → 显示警告 → 打开对话框 → 解决冲突 → 执行查询
