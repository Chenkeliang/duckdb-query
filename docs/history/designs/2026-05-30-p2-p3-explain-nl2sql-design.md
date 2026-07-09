# P2 解释 SQL + P3 NL→SQL 设计稿(delta)

- 日期:2026-05-30
- 状态:设计待审
- 分支:`feat_ai_assistant`
- 基线:本稿是 `2026-05-30-ai-assistant-design.md`(主稿,已审)的增量,只钉主稿留空 / 推迟的部分
- 范围:**P2 解释 SQL** + **P3 NL→SQL**,共用现有 `LLMService` 地基
- 不在本稿:向量检索实现(VectorRetriever 留作 Retriever 接口的第二实现,日后另做);流式 SSE(本批用非流式,见 §3);P4 总结

---

## 1. 背景

AI 地基(P0)、设置页供应商管理(P0-b/c)、报错医生(P1 Stage0 确定性 + Stage1 LLM 解释并修复)均已完成并验证。本批新增两个只读、schema-only 的 LLM 功能:把 SQL 翻成人话(P2),把人话翻成 SQL(P3)。两者方向相反、可互补。

成功标准:
- 用户能在编辑器工具栏点 **✨ 解释**,得到当前 SQL 的大白话说明;
- 用户能在编辑器上方的**常驻问数条**用自然语言生成**可编辑**的 SQL,落进 CodeMirror,**绝不自动执行**;
- AI **默认关**、Key 不出后端、只发 schema 不发数据;
- **未配置 AI 时有专门的引导空状态**,不是冷冰冰的 400(见 §5)。

---

## 2. 关键决策:KeywordRetriever 先行,接口留好

P3 的 schema 检索第一版用 **`KeywordRetriever`**(工作台已选中的表 ∪ 关键词/历史匹配),封装在 **`Retriever` 接口**后。

- 理由:零新基建、可立即用、契合「不过重」。VectorRetriever(DuckDB `vss` + embedding + 建索引 + HNSW)更强但显著更重、风险更高,且需先配好 embedding 供应商才能用;表不多时收益有限。
- **可扩展性由接口保证**:VectorRetriever 作为同一 `Retriever` 接口的第二实现日后加上,**上层(`llm_context` / `ai_nl_to_sql` / 路由 / 前端)零改动**。这正解了主稿「日后无法扩展」的担忧——接口才是保险,不是具体实现。

---

## 3. 传输:非流式 JSON POST(本批刻意如此)

主稿曾设想 SSE 流式。本批**第一版用非流式 JSON POST**:

- P1 errorFix 已验证非流式 POST 模式好用;
- 解释 / 生成 SQL 输出都短,流式收益有限;
- 不引 `@microsoft/fetch-event-source` 依赖,契合「不过重」,且契约测试极简;
- **请求形态不变**,日后要加流式可平滑叠加,不推倒。

---

## 4. 后端

### 4.1 新增模块(高内聚、可独立测试)

| 模块 | 职责 | 不负责 |
|------|------|--------|
| `core/services/retriever.py` | `Retriever` 接口 + `KeywordRetriever`:给定问题 + 工作台选中表 + 候选表清单 → 返回相关表清单 | 不调模型、不拼 prompt |
| `core/services/llm_context.py` | 拼 NL→SQL 上下文:相关表 DDL(标注来源/schema)+ DuckDB 方言 cheatsheet + 联邦用法 + SQL 历史 few-shot(Top-3) | 不调模型、不做检索 |
| `core/services/ai_explain.py` | `explain_sql(llm, sql, schema_text, locale) → {explanation}` | — |
| `core/services/ai_nl_to_sql.py` | `nl_to_sql(llm, question, context, locale) → {sql, used_tables[]}`;**SELECT-only 安全闸**(复用报错医生的 `_is_select_only`,基于 DuckDB 解析器,零新依赖) | — |
| `routers/ai.py`(扩展) | `POST /api/ai/explain-sql`、`POST /api/ai/nl-to-sql` | — |
| `api/prompts/`(种子语料) | `duckdb_dialect.md`(静态方言备忘)、`federated_examples.jsonc`(ATTACH/联邦黄金样例)、`sql_examples.jsonc`(手工黄金样例) | — |

### 4.2 安全 / 隐私(不变约束)

- 生成的 SQL **永远可见、可编辑、绝不自动执行**;非 SELECT 不作为「可用 SQL」返回(`safe=false`)。
- 只发 schema/问题,**不发数据行**。
- 复用 P1 的 `_is_select_only`(DuckDB `extract_statements` + `StatementType.SELECT`),**不引 sqlglot**。
- LLM 仍是可选依赖(litellm 未装时这些端点返回 `ai_not_configured`,应用照常启动)。

### 4.3 错误码(让前端能区分空状态,见 §5)

AI 端点失败时,响应体带稳定的 `code`:

| `code` | 触发 | HTTP |
|--------|------|------|
| `ai_disabled` | 总开关关(`enabled=false`) | 400 |
| `ai_not_configured` | 开了但无可解析的启用供应商/模型(含 litellm 未装) | 400 |
| (其它/省略) | 供应商真实调用失败(网络/Key/超时) | 502 |

`AIDisabledError → ai_disabled`,`AIConfigError → ai_not_configured`。

---

## 5. 三态空状态设计(本稿重点补充)

UI 必须区分**三态**,而非两态:

| 态 | 判定 | 表现 |
|----|------|------|
| **① 总开关关** | `enabled=false` | AI 入口**完全隐藏**(问数条 / ✨ 按钮 / ⌘K 项都不出)——沿用现状 |
| **② 开了但未配置** | `enabled=true` 且该 feature 无可解析的启用供应商/模型 | 入口**可见但进入「待配置」态**,给引导,**不报错** |
| **③ 已配置** | `enabled=true` 且 feature 解析到启用的供应商+模型 | 正常 |

**`configured` 判定**:前端从 `getAiSettings()` 已有的 `providers` / `default_provider` / `features` **派生**(`enabled && 该 feature 的 provider(或 default_provider)指向一个 enabled 的供应商`),零新接口;后端 §4.3 的 `code` 作兜底——即便前端推导漏判,后端 400 仍能映射成友好引导。

**② 待配置态的具体表现:**
- **问数条**:不显示输入框,改为一行柔和引导整行可点 → 打开**设置 · AI/模型**标签页:
  `✨ 启用「问数」前,先到 设置 · AI/模型 配置一个供应商 →`
- **✨ 解释按钮**:仍显示,点击**不发请求**,直接路由到设置 AI 标签页;hover tooltip:「需先配置 AI 供应商」。
- **绝不弹红色错误 toast** —— 这是引导,不是错误。

**运行时兜底**:任意 AI 调用返回 `code=ai_not_configured` → 前端弹**内联「去设置」CTA**(非 toast);返回其它失败 → 柔和 toast(沿用现有 `showErrorToast`)。

---

## 6. 入口 / 交互(已确认选型)

落点全部基于现有结构(见 reconnaissance):`SQLQueryPanel.tsx` / `SQLToolbar.tsx` / `SQLEditor.tsx` / `useSQLEditor`(`setSQL`)/ `useQueryWorkspace`(`selectedTables['sql']`)/ `CommandPalette.tsx`。

```
┌─────────────────────────────────────────────────────────┐
│ ✨  用自然语言描述你的查询…                      [生成] │  ← P3 常驻问数条(SQLToolbar 之上)
│     用了哪些表: [订单] [客户]   ← 生成后展示 chips        │
├─────────────────────────────────────────────────────────┤
│ [▶执行][▶异步] | [格式化][保存] … [✨解释] ← P2 按钮     │  ← 现有 SQLToolbar 左侧组
├─────────────────────────────────────────────────────────┤
│  CodeMirror 编辑器(生成的 SQL 落这里,可编辑,不自动跑)  │
└─────────────────────────────────────────────────────────┘
```

- **P2 ✨ 解释**:`SQLToolbar` 左侧组加按钮 → `explainSql(currentSQL)` → 解释在工具栏下方柔和面板/popover 展示。`enabled=false` 时不显示;`②` 态点击路由到设置。
- **P3 问数条**:`SQLQueryPanel` 内、`<SQLToolbar>` 之前。生成的 SQL 经 `setSQL(...)` 落入编辑器(**不自动执行**),并展示「用了哪些表」chips。上下文 = `selectedTables['sql']` 映射成 `tables[]`。`enabled=false` 时整条隐藏;`②` 态显示引导行。
- **⌘K**:`CommandPalette.tsx` 注册「问数」(聚焦问数条)与「解释 SQL」两项,均受 `useAiEnabled` 门控。

### 前端新增 / 改动

- `api/aiApi.ts`:`explainSql(sql, opts)`、`nlToSql(question, opts)`,沿用 `apiClient + normalizeResponse + handleApiError`。
- `hooks/useAiStatus.ts`(或扩展 `useAiEnabled`):返回 `{ enabled, configured }`(派生自 settings)。
- `Query/SQLQuery/` 内:问数条组件 + 工具栏 ✨ 按钮 + 解释展示面板。
- i18n:`query.sql.*` / `query.ai.*` 新键(zh + en),含待配置引导文案。

---

## 7. FE-BE 契约(与 `create_success_response` / `normalizeResponse` 对齐)

```
POST /api/ai/explain-sql
  req:  { sql: string, locale: 'zh'|'en' }
  resp: data { explanation: string }

POST /api/ai/nl-to-sql
  req:  { question: string, tables: string[], locale: 'zh'|'en' }
  resp: data { sql: string, used_tables: string[], safe: boolean }
        // safe=false 表示模型产出非 SELECT,sql 仍回传供查看但前端标注「请人工确认」

失败(任一端点):
  resp: { success:false, error:{ code:'ai_disabled'|'ai_not_configured'|..., message } }
```

`normalizeResponse(res).data` 取 `response.data.data`,与后端信封一致(P1 已验证同款)。

---

## 8. 测试策略(TDD,LLM 全程 mock)

后端(`pytest`):
- `KeywordRetriever`:选中表 ∪ 关键词匹配 → 期望表集合;无选中表时退化到关键词/历史。
- `llm_context`:给定 schema/历史/选中表 → 断言含方言块、few-shot 数量(≤3)、每表标注来源/schema。
- `ai_nl_to_sql` 安全闸:模型产出非 SELECT(如 `DELETE`) → `safe=false`,不作为可用 SQL。
- `ai_explain` / `ai_nl_to_sql`:mock LLM → 断言 prompt 拼装 + 响应解析。
- 路由:`enabled=false` → `code=ai_disabled`;无供应商 → `code=ai_not_configured`;正常 → data 形态。

前端(`vitest` + tsc):
- `aiApi.explainSql` / `aiApi.nlToSql`:契约(请求体字段、解包 `data`)。
- `useAiStatus`:三态派生(off / enabled-not-configured / configured)。
- 问数条:`enabled=false` 隐藏;`②` 态显示引导行且点击触发导航;`③` 态正常输入并把结果写入编辑器。
- ✨ 解释按钮:同样三态。

---

## 9. 分步落地(每步可独立提交)

1. **后端地基**:`retriever.py`(KeywordRetriever)+ `api/prompts/` 种子 + 错误码扩展。
2. **P2 后端**:`ai_explain.explain_sql` + `POST /api/ai/explain-sql`。
3. **P2 前端**:`aiApi.explainSql` + `useAiStatus` + 工具栏 ✨ 按钮 + 解释面板 + 三态。
4. **P3 后端**:`llm_context` + `ai_nl_to_sql`(含安全闸)+ `POST /api/ai/nl-to-sql`。
5. **P3 前端**:`aiApi.nlToSql` + 常驻问数条 + 「用了哪些表」chips + 写入编辑器 + 三态。
6. **⌘K**:注册两项命令,门控。
7. **联通核验**:前后端契约对齐回归 + 三态手测清单。

---

## 10. 开放问题

- `KeywordRetriever` 的关键词匹配粒度(表名 / 列名 / 历史 SQL token)——实现时按召回质量调,接口不受影响。
- 解释面板的展示位置(工具栏下内联 vs 侧栏)——实现时按空间观感定,默认内联。
