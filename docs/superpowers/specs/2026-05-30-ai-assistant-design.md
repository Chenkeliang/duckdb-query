# AI 助手设计稿:LLM 地基 + NL→SQL + 报错医生 + 解释/总结

- 日期:2026-05-30
- 状态:设计待审
- 分支:`feat_ai_assistant`
- 范围:为现有 DuckDB 查询工具引入第一批 AI 能力,共用一套 LLM 地基
- 不在本稿范围:结果图表/可视化(另出一份 spec);AI 自动选图;模型微调

---

## 1. 背景与目标

工具现状:成熟的自托管 SQL/数据查询工具(React + FastAPI + DuckDB,联邦 MySQL/PG,文件上传,可视化 JOIN/集合/透视,虚拟化表格)。**当前零 AI 功能**。工具已掌握每张表的完整 schema/列类型元数据(`table-detail` API、`DESCRIBE`),并有 CodeMirror SQL 编辑器与 SQL 历史。

目标:压缩"问题 → SQL → 结果 → 解读"的距离,**对非专家降低门槛、对专家提效**,同时严守自托管工具的隐私底线。

成功标准:
- 用户能用自然语言生成**可编辑**的 SQL,落进现有编辑器;
- 查询报错时能一键得到**大白话解释 + 修正 SQL**;
- 能对一条 SQL / 一批结果得到简明解释/总结;
- AI **默认关闭**,Key 不出后端,NL→SQL/报错只发 schema 不发数据;
- 多供应商(云一线 + 本地 Ollama + 通用 OpenAI 兼容)可在设置里维护。

非目标(YAGNI):LangChain、LiteLLM proxy 边车、Vercel AI SDK、向量库(v1)、把 WrenAI/DB-GPT 当依赖、自建 PII 管线、图表。

---

## 2. 总体取舍

**自实现薄层**,借手法不背依赖:用 **LiteLLM SDK** 做供应商抽象(OpenAI 兼容为通用语);三个功能各一个薄编排器,共用一套地基。硬约束:

- **SQL 永远可见、可编辑、绝不自动执行**(尤其修复后的 SQL)。
- **默认隐私安全**:opt-in;NL→SQL/报错医生只发 schema;总结默认只发"聚合画像"。
- **可观测/可审计**:用量日志、"将发送给 AI 的内容"可预览。
- **全面但不过重、交互优先**:每个功能都要有真实的交互设计与价值,不为做而做;能用既有基建(DuckDB/shadcn/CodeMirror/SQLHistory)就不引重依赖。
- **从第一版就可扩展**:检索、供应商、功能均以接口/抽象落地,避免日后推倒重来。

---

## 3. 架构与模块边界

高内聚、可独立测试。后端新增:

| 模块 | 职责 | 不负责 |
|------|------|--------|
| `core/services/llm_service.py` | 供应商抽象、调用(流式/非流式)、Key 解密、超时/重试、用量日志 | 不懂 SQL/业务 |
| `core/services/llm_context.py` | 拼 prompt 上下文:schema DDL + few-shot + DuckDB 方言 + 联邦用法 | 不调模型 |
| `core/services/result_profiler.py` | 结果集 → 统计画像(行数、列类型、数值 min/max/均值、Top-K 类别、空值率、日期范围) | 不调模型(总结/未来图表复用) |
| `core/services/ai_nl_to_sql.py` | NL→SQL 编排:取上下文 → 调模型 → 流式返回 | — |
| `core/services/ai_error_doctor.py` | 两段式:确定性候选项解析 + LLM 修复(带安全闸) | — |
| `core/services/ai_explain.py` | 解释 SQL / 总结结果(总结走 profiler) | — |
| `routers/ai.py` | SSE 端点 | — |

前端新增:
- `Settings/AISettings.tsx`——供应商管理 Tab
- `api/aiApi.ts`、`hooks/useAiNlToSql.ts` / `useAiErrorFix.ts` / `useAiExplain.ts`
- NL→SQL 输入条嵌入 `Query/SQLQuery/`;报错医生嵌入现有错误展示区
- SSE 用 `@microsoft/fetch-event-source`(~3KB,支持 POST 带 body)

> 这些 AI 端点**确实需要 async**(要 await LLM 流),与本仓库刚把同步 DB 处理器改为 `def` 的优化不冲突。

---

## 4. 供应商管理(设置页「AI / 模型」Tab)

需求:几个一线云 + 本地 + 通用 API 多场景,可维护。

UI:
- **供应商卡片列表**:名称、类型(`openai` / `anthropic` / `ollama` / `openai_compatible`)、`base_url`、模型、Key 状态(`****`)、**测试连通**、启用开关
- 增 / 删 / 改;**按功能选模型**(nl_to_sql / error_doctor / explain 各自挑供应商+模型,或继承默认)
- 顶部**总开关,默认 OFF**

后端:
- `GET /api/settings/ai` —— 返回 providers 与 features,Key 一律 `****`
- `PUT /api/settings/ai` —— 写配置;新 Key 用 **Fernet 加密**存(`cryptography`),密钥来自环境变量 `LLM_KEY_SECRET`
- `POST /api/ai/providers/{id}/test` —— 健康检查(发一条最小 completion)

配置形态(`config/app-config` 的 `ai` 段):
```jsonc
{
  "ai": {
    "enabled": false,
    "default_provider": null,            // provider id
    "providers": [
      { "id": "openai-1", "type": "openai", "base_url": null,
        "api_key": "<fernet>", "models": ["gpt-4o", "gpt-4o-mini"], "enabled": true }
      // anthropic / ollama(base_url=http://localhost:11434)/ openai_compatible ...
    ],
    "features": {
      "nl_to_sql":   { "enabled": true,  "provider": null, "model": null },
      "error_doctor":{ "enabled": true,  "provider": null, "model": null },
      "explain":     { "enabled": true,  "provider": null, "model": null }
    },
    "timeout_seconds": 30,
    "num_retries": 2,                    // LiteLLM 传输层重试(网络/限流), 与下方"修复重试"不同
    "log_usage": true,
    "log_full_prompts": false
  }
}
```

---

## 5. 三个功能的流程

### 5.1 NL→SQL(头牌)
```
问题 + 工作台当前选中的表 + locale
  → llm_context: 相关表 DDL + few-shot(§6) + DuckDB 方言提示 + 联邦用法
  → LLM 流式生成 SQL → 落进现有 CodeMirror(可编辑, 不自动跑)
  → 信任 UX: 展示"本次用了哪些表做上下文" → 用户审 → 点运行
```
- **schema 感知**:每张表按其**来源(duckdb / 某个 MySQL/PG 连接)与 schema** 限定;上下文里显式标注来源,联邦多源时尤为关键(避免跨源串味、避免方言混用)。
- **schema-linking**:优先用工作台**已选中的表**作为上下文(工具本就有"选中表"概念);表多时用 `VectorRetriever`(§6,DuckDB VSS)按问题检索相关表;未配置 embedding 时退化为 `KeywordRetriever`。
- 落点:`SQLQueryPanel` 编辑器**上方一个"问数"输入条** + 流式指示 + "用了哪些表"chips。
- **DuckDB 方言提示**:静态 cheatsheet(`PIVOT`/`LIST_`/`STRUCT`/`EXCLUDE`/日期函数),防止 LLM 漂成 ANSI/PG 导致**静默出错**。
- 预期准确率(诚实):种了 few-shot 后常见模式 70–80%;新颖复杂多表 JOIN 30–50%。**故"SQL 可编辑"是硬约束**。

### 5.2 报错医生(两段式)
- **Stage 0 确定性(零 LLM,已验证 DuckDB 1.5.3 输出)**:
  - 解析错误串中的 `Candidate bindings:` / `Did you mean "X"?` → 行内"你是不是想找 `X`"小提示;
  - 联邦表 DuckDB 无候选时,用 `difflib.get_close_matches` 对已知 schema 兜底;
  - 已知方言不兼容(MySQL/PG vs DuckDB)给静态提示。
  - **秒出、零成本、零幻觉**,覆盖最高频的拼错列名/表名。
- **Stage 1 LLM(点「解释并修复」才触发)**:
  - 入参:失败 SQL + 精确错误串 + 相关表 schema;
  - 出:大白话解释(zh/en 跟随 locale)+ 修正 SQL;
  - **安全闸**:`sqlglot` 解析返回 SQL,**非 SELECT 一律拒绝展示修复**,只给解释;
  - **执行反馈"修复重试"上限 1 次**(Config B,语义层,区别于 §4 的传输层 `num_retries`):用户跑修复后仍报错,自动把新错误回喂一次;再失败则提示"请手动检查";
  - 展示**可编辑 diff**(原 SQL vs 修正,变更 token 高亮)。

### 5.3 解释 / 总结
- **解释这条 SQL**:纯 schema,安全。输出大白话说明这条 SQL 在做什么。
- **总结结果**(隐私敏感,决策见 §7):
  - **默认走"聚合画像"**(`result_profiler` 产出,不外发原始行):LLM 据画像写"约 N 行、覆盖 8 个渠道、A 占 45%、金额 12–9800 均值 340、跨 1–3 月"等;
  - **可选"附带 N 行样本"**开关(显式标注"将发送 N 行给你的供应商");
  - **本地模型(Ollama)时自动放行发样本**(数据不出门)。

---

## 6. few-shot / 上下文语料

`llm_context` 合并五类来源(对应"1+2+3+方言+联邦"),**全部按来源/schema 限定**(每张表标注其连接/schema,见 §5.1 schema 感知):
1. **相关表 DDL**——现有 `table-detail` API;含来源(duckdb / mysql / postgres 连接)与 schema;
2. **SQL 历史**——`SQLHistory` 中成功执行过的真实查询,作 few-shot(零标注、越用越准);
3. **手工黄金样例**——`api/prompts/sql_examples.jsonc` 种子集(覆盖常见形态);
4. **DuckDB 方言 cheatsheet**——`api/prompts/duckdb_dialect.md`(静态,源自 DuckDB 官方语法,人工精选);
5. **联邦/ATTACH 专用样例(一等公民,重点)**——`api/prompts/federated_examples.jsonc`:这是本工具的真实风险点。必须覆盖:
   - 限定名约定:`SELECT ... FROM mysql_db.schema.table`(ATTACH 别名 + schema + 表);
   - **跨方言函数兼容**:DuckDB 侧函数 vs 透传到 MySQL/PG 的差异(日期/字符串/分页等),给"用什么、别用什么"的对照样例,**防止生成的 SQL 在 ATTACH 源上语法不兼容**;
   - 多源 JOIN 的写法(本系统现有 join/联邦构建器的产物作为黄金样例来源)。

**检索抽象(从第一版就可扩展,不留死角)**:定义 `Retriever` 接口,两实现——
- `KeywordRetriever`:近期历史 + 表名/关键词匹配(无 embedding 时的兜底,P0 即有);
- `VectorRetriever`:**基于 DuckDB `vss` 扩展**(embedding 存进 DuckDB 表,HNSW/`array_distance` 检索,**无需另起向量库**);embedding 走配置的供应商 embedding 模型(云或本地 Ollama)。
- **NL→SQL(P3)默认用 `VectorRetriever`**;接口隔离保证日后换实现零改上层。

Prompt 预算:schema 块 ~2k token;few-shot 取 Top-3。

---

## 7. 隐私 / 安全 / 成本

- AI **默认关**(opt-in);
- **NL→SQL / 报错医生:只发 schema/错误,不发数据**;
- **总结结果是唯一例外**——默认只发**聚合画像**(派生统计,非个体记录);想发原始行需显式 opt-in;本地模型自动放行;
- **"将发送给 AI 的内容"可预览**(schema + 问题/错误),可审计;
- Key **Fernet 加密**存后端,UI 永远 `****`,响应不回传明文;
- 用量日志(每次 token 数、feature、model、时间;默认**不记完整 prompt**,记 hash);可选预算上限;超时 30s;重试 1 次;
- **本地 Ollama 路径** = 数据零外发(air-gapped)。

---

## 8. 组件选型

| 处 | 选型 | 理由 |
|----|------|------|
| 供应商抽象(后端) | **LiteLLM SDK** | 一个调用打 100+ 家,OpenAI 兼容,无边车 |
| 前端流式 | `@microsoft/fetch-event-source` | 3KB,支持 POST-SSE,不背 Vercel SDK |
| SQL 安全解析 | `sqlglot` | 判定语句类型、拒写操作 |
| Key 加密 | `cryptography`(Fernet) | 单依赖 |
| 设置 UI | 现有 shadcn 组件 | 一致 |

---

## 9. 测试策略

可 TDD 的(无需真实 LLM):
- **确定性报错医生**:给定 DuckDB 错误串 → 期望提取的候选项;`difflib` 兜底;
- **安全闸**:`sqlglot` 对各类返回 SQL → 拒绝非 SELECT;
- **`llm_context` 拼装**:给定 schema/历史/选中表 → 期望 prompt 结构(含方言块、few-shot 数量);
- **`result_profiler`**:给定 DataFrame → 期望画像(行数、类型、Top-K、空值率);
- **provider 配置**:Key 加解密、`****` 掩码、按 feature 解析 provider/model。

evals:`api/tests/evals/` 一组黄金 `问题→SQL` 离线跑回归(LLM 可 mock 或可选真实跑)。
LLM 调用本身在单测中 mock。

---

## 10. 分期落地(风险单调递增)

- **P0 地基**:`llm_service`(LiteLLM + Fernet + 配置)、`routers/ai.py` 骨架、设置页供应商 Tab、SSE 管线、总开关。
- **P1 报错医生 Stage 0**:纯确定性候选项提示(零 LLM,可先于地基独立上)。
- **P2 报错医生 Stage 1 + 解释 SQL**:最低风险 LLM 功能(只读、schema-only、安全闸、1 重试)。
- **P3 NL→SQL**:`Retriever` 接口 + `VectorRetriever`(DuckDB VSS)+ `llm_context`(schema 感知 + 联邦专用样例)+ 输入条 UX + "用了哪些表"信任展示。
- **P4 总结结果**:`result_profiler` + 聚合画像总结 + 可选样本行。

---

## 11. 风险与缓解

1. **DuckDB 方言漂移(静默出错)**——LLM 生成 ANSI/PG 语法在 DuckDB 上给错结果而非报错。缓解:方言 cheatsheet + DuckDB few-shot +(可选)本地 duckdb-nsql 模型。
2. **联邦源混淆**——MySQL/PG ATTACH 后表名/类型差异。缓解:上下文显式标注每表来源与限定名约定。
3. **schema 过大**——表多时撑爆上下文、降准确率。缓解:v1 用"选中表";后续 schema-linking 检索。
4. **冷启动质量**——无样例时令人失望。缓解:SQL 历史天然兜底 + 种子黄金样例。
5. **用户过度信任**——拿到 SQL 不看就跑。缓解:强制"SQL 可见可编辑",不自动执行。
6. **成本放大**——重试链路 token 翻倍。缓解:重试上限 1 + 用量日志 + 可选预算。

---

## 12. 已定 / 开放问题

已定(本次评审拍板):
- **向量检索从第一版就做**,基于 DuckDB `vss` 扩展(无新基建),以 `Retriever` 接口落地,P3 默认启用——避免日后无法扩展。
- **联邦/ATTACH 专用样例为必做项**(§6.5),防止 ATTACH 源与 DuckDB SQL 方言不兼容。
- **schema/来源感知**纳入上下文构建。
- 内置一组 DuckDB + 联邦 few-shot 样例随仓库分发(`api/prompts/`),便于冷启动。

仍开放:
- `VectorRetriever` 的 embedding 模型默认选谁(云端 `text-embedding-3-small` vs 本地 Ollama embedding)——P3 实测再定,接口不受影响。
- 总结结果"聚合画像"的字段集是否够用、是否需可配——P4 实测再定。
