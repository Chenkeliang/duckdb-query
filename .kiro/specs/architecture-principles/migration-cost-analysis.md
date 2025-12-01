# 技术选型迁移成本分析

## 一、决策矩阵

### 1.1 迁移成本评估标准

| 成本等级 | 迁移时间 | 影响范围 | 风险 | 说明 |
|---------|---------|---------|------|------|
| 🟢 极低 | < 1 小时 | 局部 | 无 | 随时可换，几乎无成本 |
| 🟡 低 | 1-4 小时 | 局部 | 低 | 可以后期换，成本可控 |
| 🟠 中 | 1-2 天 | 多处 | 中 | 建议早期决定，后期换有成本 |
| 🔴 高 | 3+ 天 | 全局 | 高 | 必须早期决定，后期换成本极高 |

### 1.2 技术选型决策表

| 技术 | 迁移成本 | 建议时机 | 原因 | 后期切换难度 |
|-----|---------|---------|------|------------|
| **react-resizable-panels** | 🔴 高 | ✅ 现在 | 影响整体布局架构 | 需要重写所有布局代码 |
| **react-hook-form** | 🟠 中 | ✅ 现在 | 影响表单设计模式 | 需要重写所有表单 |
| **@tanstack/react-query** | 🟠 中 | ✅ 现在 | 影响数据流架构 | 需要重写所有数据获取逻辑 |
| **sonner** | 🟢 极低 | ⏳ 后期 | 只是 API 调用 | 全局替换即可 |
| **@tanstack/react-virtual** | 🟡 低 | ⏳ 后期 | 局部使用 | 只影响虚拟滚动组件 |
| **date-fns** | 🟢 极低 | ⏳ 后期 | 工具函数 | 全局替换即可 |
| **zustand** | 🟠 中 | ⏳ 后期 | 影响状态架构 | 需要重构状态管理 |
| **cmdk** | 🟢 极低 | ⏳ 后期 | 独立功能 | 可选功能，随时添加 |

## 二、详细分析

### 2.1 🔴 必须现在决定（迁移成本极高）

#### 1. react-resizable-panels

**为什么必须现在决定**：
```jsx
// 影响整个布局架构
<PanelGroup direction="horizontal">
  <Panel>...</Panel>
  <PanelResizeHandle />
  <Panel>...</Panel>
</PanelGroup>

// 如果后期切换，需要：
// 1. 重写整个 QueryWorkbench 布局
// 2. 重写所有面板组件
// 3. 重新实现调整器逻辑
// 4. 重新实现持久化
// 估计成本：3-5 天
```

**后期切换成本**：
- 🔴 需要重写整个布局架构
- 🔴 影响所有使用面板的组件
- 🔴 需要重新测试所有布局交互
- 🔴 可能影响用户已保存的布局配置

**决策建议**：✅ **现在就使用 react-resizable-panels**

---

#### 2. @tanstack/react-query

**为什么建议现在决定**：
```jsx
// 影响整个数据流架构

// 方案 A：手动管理（当前）
const [data, setData] = useState([]);
const [loading, setLoading] = useState(false);
useEffect(() => {
  fetchData().then(setData);
}, []);

// 方案 B：react-query
const { data, isLoading } = useQuery({
  queryKey: ['tables'],
  queryFn: fetchData
});

// 如果后期切换：
// 1. 需要重写所有数据获取逻辑（20+ 处）
// 2. 需要重构缓存策略
// 3. 需要重新实现刷新机制
// 估计成本：2-3 天
```

**后期切换成本**：
- 🟠 需要重写所有数据获取代码
- 🟠 需要重新设计缓存策略
- 🟡 但不影响组件结构
- 🟡 可以逐步迁移

**决策建议**：✅ **现在就使用**（强烈建议）

**如果不确定**：
- 可以先用手动管理
- 但要遵循统一的模式（自定义 Hook）
- 后期迁移成本约 2 天

---

#### 3. react-hook-form

**为什么建议现在决定**：
```jsx
// 影响表单设计模式

// 方案 A：手动管理（当前）
const [name, setName] = useState('');
const [host, setHost] = useState('');
// ... 10+ 个字段

// 方案 B：react-hook-form
const form = useForm({
  defaultValues: { name: '', host: '' }
});

// 如果后期切换：
// 1. 需要重写所有表单（5+ 个）
// 2. 需要重新实现验证逻辑
// 3. 需要重新测试所有表单
// 估计成本：1-2 天
```

**后期切换成本**：
- 🟠 需要重写所有表单组件
- 🟡 但表单数量有限（5-10 个）
- 🟡 可以逐个迁移
- 🟢 不影响其他组件

**决策建议**：✅ **现在就使用**（建议）

**如果不确定**：
- 可以先用手动管理
- 但要遵循统一的模式
- 后期迁移成本约 1-2 天

---

### 2.2 🟡 可以后期切换（迁移成本低）

#### 4. @tanstack/react-virtual

**为什么可以后期切换**：
```jsx
// 只影响局部组件

// 方案 A：react-window（当前已安装）
<FixedSizeList
  height={600}
  itemCount={items.length}
  itemSize={35}
>
  {Row}
</FixedSizeList>

// 方案 B：@tanstack/react-virtual
const virtualizer = useVirtualizer({
  count: items.length,
  getScrollElement: () => parentRef.current,
  estimateSize: () => 35
});

// 如果后期切换：
// 1. 只需要修改虚拟滚动组件（2-3 个）
// 2. 不影响其他组件
// 估计成本：2-4 小时
```

**后期切换成本**：
- 🟢 只影响虚拟滚动组件（2-3 个）
- 🟢 不影响其他组件
- 🟢 可以逐个迁移

**决策建议**：⏳ **可以后期再换**

**当前方案**：
- 继续使用 react-window（已安装）
- 如果遇到动态高度需求，再切换

---

#### 5. sonner

**为什么可以后期切换**：
```jsx
// 只是 API 调用，全局替换即可

// 方案 A：自定义 ToastContext（当前）
const { showSuccess, showError } = useToast();
showSuccess('保存成功');

// 方案 B：sonner
import { toast } from 'sonner';
toast.success('保存成功');

// 如果后期切换：
// 1. 全局搜索替换 showSuccess → toast.success
// 2. 删除 ToastContext
// 3. 添加 <Toaster /> 组件
// 估计成本：30 分钟
```

**后期切换成本**：
- 🟢 全局搜索替换即可
- 🟢 不影响组件结构
- 🟢 风险极低

**决策建议**：⏳ **可以后期再换**

**当前方案**：
- 继续使用自定义 ToastContext
- 功能够用就不换

---

#### 6. date-fns

**为什么可以后期切换**：
```jsx
// 只是工具函数，全局替换即可

// 方案 A：原生 Date（当前）
new Date().toLocaleString();

// 方案 B：date-fns
import { format } from 'date-fns';
format(new Date(), 'yyyy-MM-dd HH:mm:ss');

// 如果后期切换：
// 1. 全局搜索替换日期格式化代码
// 2. 不影响组件结构
// 估计成本：1 小时
```

**后期切换成本**：
- 🟢 全局搜索替换即可
- 🟢 不影响组件结构
- 🟢 风险极低

**决策建议**：⏳ **可以后期再换**

**当前方案**：
- 先用原生 Date API
- 如果需要复杂日期处理，再引入

---

#### 7. cmdk

**为什么可以后期切换**：
```jsx
// 独立功能，随时可以添加

// 当前：无命令面板
// 后期：添加命令面板

// 如果后期添加：
// 1. 创建 CommandPalette 组件
// 2. 添加到 App 根组件
// 3. 不影响现有功能
// 估计成本：2-4 小时
```

**后期切换成本**：
- 🟢 独立功能，不影响现有代码
- 🟢 可选功能，随时添加
- 🟢 风险极低

**决策建议**：⏳ **后期再添加**

**当前方案**：
- 不实现命令面板
- 等核心功能完成后再考虑

---

### 2.3 🟠 建议现在考虑（但可以延后）

#### 8. zustand

**为什么可以延后**：
```jsx
// 状态管理可以逐步演进

// 阶段 1：自定义 Hooks（当前）
const useDuckQuery = () => {
  const [state, setState] = useState({});
  return { state, actions };
};

// 阶段 2：如果状态变复杂，切换到 Zustand
const useAppStore = create((set) => ({
  state: {},
  actions: {}
}));

// 如果后期切换：
// 1. 创建 Zustand store
// 2. 逐步迁移状态
// 3. 可以与 Hooks 共存
// 估计成本：1-2 天
```

**后期切换成本**：
- 🟠 需要重构状态管理
- 🟡 但可以逐步迁移
- 🟡 可以与现有 Hooks 共存

**决策建议**：⏳ **先用 Hooks，不够用再换**

**触发条件**：
- 状态需要跨 5+ 层组件
- 状态管理代码 > 500 行
- 需要持久化复杂状态

---

## 三、最终决策建议

### 3.1 ✅ 现在就做（Phase 1）

| 技术 | 优先级 | 原因 | 迁移成本 |
|-----|-------|------|---------|
| **react-resizable-panels** | 🔴 必须 | 影响布局架构 | 极高（3-5 天） |
| **react-hook-form + zod** | 🟠 强烈建议 | 影响表单模式 | 中（1-2 天） |
| **@tanstack/react-query** | 🟠 强烈建议 | 影响数据流 | 中（2-3 天） |

**总投入时间**：1-2 天学习 + 集成
**节省时间**：5-10 天开发时间
**ROI**：⭐⭐⭐⭐⭐

---

### 3.2 ⏳ 后期再做（Phase 2）

| 技术 | 优先级 | 何时添加 | 迁移成本 |
|-----|-------|---------|---------|
| **sonner** | 🟢 可选 | 当前 Toast 不够用时 | 极低（30 分钟） |
| **@tanstack/react-virtual** | 🟢 可选 | 需要动态高度时 | 低（2-4 小时） |
| **date-fns** | 🟢 可选 | 需要复杂日期处理时 | 极低（1 小时） |
| **zustand** | 🟡 可选 | 状态管理变复杂时 | 中（1-2 天） |
| **cmdk** | 🟢 可选 | 核心功能完成后 | 极低（2-4 小时） |

**总投入时间**：按需添加
**迁移成本**：低
**风险**：极低

---

## 四、实施建议

### 4.1 Phase 1：核心技术栈（现在）

```bash
# 必须安装
npm install react-resizable-panels

# 强烈建议安装
npm install react-hook-form @hookform/resolvers zod
npm install @tanstack/react-query

# 已安装（保持）
# - shadcn/ui + Radix UI
# - @dnd-kit
# - CodeMirror 6
# - AG Grid
# - react-window（暂时保留）
```

**理由**：
1. **react-resizable-panels** - 后期换成本极高，必须现在决定
2. **react-hook-form** - 表单很多，现在统一模式，避免后期重写
3. **react-query** - 数据获取贯穿整个应用，现在统一架构

---

### 4.2 Phase 2：增强功能（后期）

```bash
# 按需添加（后期）
npm install sonner                    # 当 Toast 不够用时
npm install @tanstack/react-virtual   # 当需要动态高度时
npm install date-fns                  # 当需要复杂日期处理时
npm install zustand                   # 当状态管理变复杂时
npm install cmdk                      # 当想提升用户体验时
```

**理由**：
- 迁移成本低（< 1 天）
- 不影响核心架构
- 可以按需添加

---

### 4.3 决策流程图

```
开始新功能
    ↓
需要表单？
    ├─ 是 → 使用 react-hook-form ✅
    └─ 否 → 继续
    ↓
需要数据获取？
    ├─ 是 → 使用 react-query ✅
    └─ 否 → 继续
    ↓
需要可调整布局？
    ├─ 是 → 使用 react-resizable-panels ✅
    └─ 否 → 继续
    ↓
需要虚拟滚动？
    ├─ 是 → 先用 react-window，需要动态高度再换 ⏳
    └─ 否 → 继续
    ↓
需要通知？
    ├─ 是 → 先用 ToastContext，不够用再换 sonner ⏳
    └─ 否 → 继续
```

---

## 五、总结

### 5.1 核心原则

**"早期决定架构性技术，延后决定工具性技术"**

- ✅ **架构性技术**（影响整体设计）→ 现在决定
  - 布局系统（react-resizable-panels）
  - 表单模式（react-hook-form）
  - 数据流（react-query）

- ⏳ **工具性技术**（局部使用）→ 后期添加
  - 通知（sonner）
  - 日期（date-fns）
  - 命令面板（cmdk）

### 5.2 最小可行技术栈（MVP）

**Phase 1（现在）**：
```json
{
  "必须": [
    "react-resizable-panels"
  ],
  "强烈建议": [
    "react-hook-form + zod",
    "@tanstack/react-query"
  ]
}
```

**Phase 2（后期）**：
```json
{
  "按需添加": [
    "sonner",
    "@tanstack/react-virtual",
    "date-fns",
    "zustand",
    "cmdk"
  ]
}
```

### 5.3 投资回报

**Phase 1 投入**：
- 学习时间：1-2 天
- 集成时间：包含在开发中
- 总投入：1-2 天

**Phase 1 回报**：
- 节省开发时间：5-10 天
- 降低维护成本：长期
- 避免后期重构：3-5 天
- **ROI：300-500%**

---

**建议**：现在就安装 Phase 1 的技术栈，Phase 2 的按需添加。
