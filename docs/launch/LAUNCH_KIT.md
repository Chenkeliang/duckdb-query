# DuckQuery — Launch / Distribution Kit

Ready-to-paste copy for the cold-start. 9 months at ~2 stars means the product is fine but **undistributed** — GitHub organic only compounds *after* an initial spike. Below is the spike.

> **Honest-marketing rules:** no fake numbers, no "revolutionary", no upvote-begging (HN/Reddit ban it and it backfires). Lead with the one true differentiator: **join local files and remote databases in one SQL query, with AI writing the SQL.** Respond to every comment for the first 4–6 hours.

---

## 0. Pre-launch checklist (do FIRST)

- [ ] **Set the social preview image** — repo → Settings → General → *Social preview* → upload `docs/assets/og-cover.png`. (This makes every shared link show a real card instead of bland text.)
- [ ] Verify `./quick-start.sh` works from a clean clone (this is the only real entry point — there is **no hosted demo** that runs queries; the gh-pages page is a UI shell with no backend). Either wire a real backend to it or don't link it as a "demo".
- [ ] Add 2–3 **`good first issue`** labels so visitors have a way to contribute.
- [ ] Pin one issue: "Roadmap / what to build next — vote here".
- [ ] Make sure the first README screen shows the **AI** features (done) + a GIF (done).
- [ ] Have a 20–40s **screen-recording GIF of the AI text-to-SQL + cross-source JOIN** ready (the current GIFs don't show AI — record one).

---

## 1. Show HN (highest leverage)

**When:** Tue–Thu, ~08:00–10:00 US Eastern. One shot — make it count.

**Title** (≤80 chars, no "Show HN:" double-count — HN adds context):
```
Show HN: DuckQuery – Join local CSVs and remote MySQL/Postgres in one SQL query
```
Alternate:
```
Show HN: Query files and databases together, with AI text-to-SQL (DuckDB)
```

**First comment** (post immediately as the author):
```
Hi HN, I built DuckQuery because I was tired of the gap between database GUIs
(DBeaver/TablePlus — great for a DB, can't touch my local CSVs) and BI tools
(Metabase/Superset — need a warehouse + ETL before you can ask a question).

DuckQuery sits in the middle. It runs on DuckDB, so you can:
- drag in a CSV/Excel/Parquet and query it instantly as a table
- ATTACH a remote MySQL/Postgres
- JOIN across them in ONE query (the local file ↔ the remote table), no ETL

It also has an AI layer that's opt-in and local-first:
- text-to-SQL chat that drafts SQL you review before running (never auto-executes)
- an "error doctor" that reads the actual table schema (incl. the attached DBs)
  and suggests a fix when a query errors
- one-click chart suggestions for a result set

Try it (one command, self-hosted — your data never leaves your machine):
  git clone … && ./quick-start.sh   → http://localhost:3000
(README has GIFs if you'd rather watch first.)

Stack: DuckDB + FastAPI + React. MIT. API keys for the AI are encrypted server-side
and the generated SQL is always shown for review, never run automatically.

Honest limitations: it's self-hosted (no hosted SaaS yet); large result sets are
paginated; the AI features are off until you add your own model key.

I'd love feedback on the cross-source JOIN flow and the text-to-SQL guardrails.
What would make this replace your current SQL tool?
```

---

## 2. Reddit

Each sub has self-promo rules — read the sidebar, flair as "open source / OC", and **reply to comments** (lurk-and-drop gets removed).

**r/dataengineering** — title:
```
I built an open-source SQL workbench that JOINs local CSVs with remote MySQL/Postgres in one query (DuckDB, no ETL)
```
Body: 3–4 sentences of the HN first-comment, emphasize the **no-pipeline / DuckDB ATTACH** angle and that it's MIT + self-hostable. End with "what's your current workflow for ad-hoc cross-source joins?"

**r/DuckDB** — title:
```
DuckQuery: a visual workbench on DuckDB — ATTACH MySQL/Postgres + files, with text-to-SQL
```
Body: lead with how it uses DuckDB (`ATTACH` to MySQL/PG, native file scan). This audience already gets the value — focus on the DuckDB-specific implementation.

**Also consider:** r/SQL, r/Database, r/selfhosted (angle: "self-hosted, local-first, your data never leaves your machine").

---

## 3. Chinese channels (you have native zh content — big advantage)

**掘金 / 少数派 / V2EX（分享创造节点）** — 标题:
```
我做了个开源工具：一条 SQL 同时查本地 CSV 和远程 MySQL/PG，还能用大白话问数
```
正文要点（300–600 字 + GIF + demo 链接 + 仓库链接）:
- 痛点：DBeaver 连不了本地文件、Metabase 要先建仓库跑 ETL，临时跨源分析很别扭
- 方案：基于 DuckDB，拖个 CSV 即查、ATTACH 远程库、**一条 SQL 跨源 JOIN**、免 ETL
- AI：问数（自然语言生成 SQL，确认后才执行）、报错医生、图表推荐；本地优先、Key 服务端加密
- 自托管一行命令 `./quick-start.sh`（数据不出本机）+ README 里 40s 演示视频
- 求反馈：你们平时怎么做临时的跨源关联？

**V2EX 注意**：发「分享创造」节点，标题别标题党，正文别催 star。

---

## 4. X / Twitter thread

Tweet 1 (hook + GIF/og image):
```
Most SQL tools make you choose: a DB client that can't read your CSVs, or a BI tool
that needs a warehouse + ETL first.

DuckQuery is the missing middle — JOIN a local CSV with a remote MySQL table in ONE
query, and let AI write the SQL. Open source, runs local. 🧵
```
Tweet 2: the cross-source JOIN GIF + "built on @duckdb — drag a file, ATTACH a DB, query both".
Tweet 3: the AI bit — text-to-SQL you review before running + error doctor + charts.
Tweet 4: "One-command self-host, your data stays local. MIT. ⭐ if useful: <repo link>". Tag @duckdb.

---

## 5. Durable referral traffic (do after launch week)

Open PRs / submissions to lists that send traffic for years:
- **davidgasquez/awesome-duckdb** (the canonical DuckDB list)
- **awesome-db-tools**, **mrkkrp/awesome-database-tools** style lists
- "DBeaver alternatives" / "TablePlus alternatives" roundups (AlternativeTo.net listing)
- DuckDB's community page / Discord #showcase
- Submit to **Product Hunt** (separate launch day; use the og image + the demo video as the gallery — not the non-functional gh-pages link)

---

## 6. Keep the compounding going

- Turn each piece of feedback into a `good first issue`.
- Write 1 short dev.to/掘金 post per real feature you ship ("How I made cross-source JOINs work with DuckDB ATTACH", "Guardrails for text-to-SQL"). These rank in search and trickle stars forever.
- Add a star-history badge once you cross ~100 stars (social proof loop).
