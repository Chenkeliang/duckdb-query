# DuckDB Query + Vanna AI 深度集成技术规格书 (Technical Specification)

> **版本**: 2.0.0 (Engineering Ready)
> **日期**: 2026-01-16
> **状态**: 待开发
> **文档目标**: 为开发人员提供精确的实施蓝图，涵盖目录结构、代码规范、边界处理及交互细节。

---

## 1. 系统架构与目录设计 (System Architecture)

### 1.1 后端结构 (Backend)
遵循 FastAPI "Service-Router" 分层架构。

```text
api/
├── routers/
│   └── chat.py              # [NEW] AI 对话相关 API (Ask, Config, History)
├── services/
│   └── chat_service.py      # [NEW] 核心服务类 (单例)
│       └── class ChatService:
│           ├── __init__: 初始化 Vanna, VectorStore
│           ├── ask(question, context): 处理提问
│           ├── run_sql_hook(sql): 覆盖 Vanna 执行逻辑
│           └── train_ddl(tables): 动态训练 DDL
├── core/
│   └── ai_config.py         # [NEW] AI 配置模型 (Pydantic Settings)
└── utils/
    └── prompt_templates.py  # [NEW] 中文 Prompt 模板库
```

### 1.2 前端结构 (Frontend)
采用 "Feature-based" 模块化设计，将 AI 功能聚合由 `src/features/AI` 管理，减少对全局目录的污染。

```text
frontend/src/
├── features/
│   └── AI/                  # [NEW] AI 功能独立模块
│       ├── components/
│       │   ├── ChatSidebar.tsx      # 主容器 (Glassmorphism)
│       │   ├── ContextSelector.tsx  # 上下文选择器 (Sidebar Top)
│       │   ├── ChatBubble.tsx       # 消息气泡 (User/AI)
│       │   ├── PlotlyRenderer.tsx   # 图表渲染器 (Lazy Load)
│       │   ├── InsightCard.tsx      # 结果洞察卡片
│       │   └── SettingsModal.tsx    # Key/Prompt 配置
│       ├── hooks/
│       │   ├── useChat.ts           # 对话逻辑 (Stream处理)
│       │   └── useAIConfig.ts       # 配置管理
│       ├── stores/
│       │   └── useAIStore.ts        # Zustand 全局状态 (Context, History)
│       └── types.ts                 # TS 类型定义
├── components/
│   └── Layout/AppLayout.tsx # [MOD] 注入 <ChatSidebar />
└── styles/
    └── ai-theme.css         # [NEW] 专用的 Glassmorphism 样式变量
```

---

## 2. 详细功能规范 (Functional Specifications)

### 2.1 后端核心逻辑 (Backend Core)

#### 2.1.1 `ChatService.run_sql` Hook
**痛点**: Vanna 默认会建立新连接，可能导致 DuckDB `.wal` 锁死。
**方案**: 依赖注入现有的 `DuckDBConnectionPool`。
```python
def run_sql(self, sql: str, **kwargs):
    # 使用全局连接池，而不是让 Vanna 自己去连
    with get_db_connection() as conn:
        df = conn.execute(sql).df()
    return df
```

#### 2.1.2 动态上下文 (Dynamic Context)
**逻辑**: 不全量 Training。根据前端传入的 `context_tables: ["main.orders"]`，实时提取这些表的 DDL 注入到 Prompt 中。
**Prompt 模板**:
```text
System: 你是一个中文数据分析师。
Context: 下面是相关表的 DDL: {ddl_string}
Goal: {user_question}
Constraint: 只返回 SQL，不要解释。如果需要绘图，请返回 Plotly JSON。
```

### 2.2 前端状态管理 (State Management)

**Store: `useAIStore`**
```typescript
interface AIState {
  isOpen: boolean;            // 侧边栏开关
viewMode: 'sidebar' | 'popout' | 'float';
  width: number;              // Resizable width
  
  activeContext: string[];    // ['main.orders', 'postgres.users']
  messages: ChatMessage[];    // 历史消息
  
  apiKey: string;             // 本地存储 (Persist Middleware)
  modelProvider: 'openai' | 'deepseek' | 'ollama';
  
  // Actions
  toggleSidebar: () => void;
  setContext: (tables: string[]) => void;
  sendMessage: (text: string) => Promise<void>;
}
```

---

## 3. 边界条件与异常处理 (Edge Cases)

### 3.1 网络与超时
*   **Case**: LLM 响应超时 (> 30s)。
*   **Handling**: 前端显示 "思考超时，请重试"。后端 `ChatService` 设置 `timeout` 参数。
*   **UI**: Thinking 动画变红，出现 "Retry" 按钮。

### 3.2 密钥安全 (Security)
*   **Case**: 用户刷新页面。
*   **Handling**: Key 存储在 `localStorage` (加密/或者明文，视安全级别，MVP用明文)。**后端绝不持久化用户的 API Key**，每次请求由前端 Header `X-AI-Key` 带入。

### 3.3 错误 SQL (SQL Fallback)
*   **Case**: Vanna 生成了错误的 SQL (列名不存在)。
*   **Handling**:
    1. 捕获 DuckDB Execution Error。
    2. 将 Error Message 喂回给 LLM: *"执行报错: column 'x' not found, 请修正"*。
    3. 自动重试 1 次 (Auto-heal)。
    4. 仍失败则透出错误给用户。

### 3.4 交互细节 (Interaction Polish)
*   **Focus**: 打开 Sidebar 时，Input 自动聚焦 (`autoFocus`).
*   **Stream**: 模拟打字机效果 (虽然 Vanna 主要是一次性返回，前端可做伪流式渲染优化体验).
*   **Keyboard**: `Cmd + L` 快速唤起/隐藏由 Copilot。

---

## 4. 视觉样式规范 (Visual Implementation)

### 4.1 Glassmorphism Token (Tailwind)
```css
.ai-glass {
  @apply bg-slate-900/80 backdrop-blur-xl border-l border-white/10 shadow-2xl;
}
.ai-bubble-user {
  @apply bg-blue-600/90 text-white rounded-2xl rounded-tr-sm;
}
.ai-bubble-bot {
  @apply bg-slate-800/80 border border-white/5 rounded-2xl rounded-tl-sm;
}
```

### 4.2 动效 (Animation)
*   **Sidebar Slide**: `transition-transform duration-300 ease-in-out`.
*   **Reasoning Fold**: 思考过程默认折叠，展开时用 `height: auto` 动画。

---

## 5. 实施步骤 (Detailed Tasks)

1.  **Backend Setup**:
    *   创建 `api/services/chat_service.py`。
    *   定义 Pydantic Models (`api/schemas/chat.py`).
2.  **Frontend Feature scaffolding**:
    *   创建 `src/features/AI` 目录结构。
    *   配置 Zustand Store。
3.  **Core Interaction**:
    *   实现 `ChatSidebar` 布局与 Resize 逻辑。
    *   对接 `POST /ask` 接口。
4.  **Integration**:
    *   在 `AppLayout.tsx` 挂载 Sidebar。
    *   在 `QueryWorkbench` 挂载 `InsightCard` (Portal 渲染)。

---
*Created by Antigravity AI Assistant*
