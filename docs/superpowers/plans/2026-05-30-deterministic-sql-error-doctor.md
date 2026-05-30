# Deterministic SQL Error Doctor (P1 Stage 0) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a DuckDB query fails with a "column/table not found" error, show an inline "did you mean `X`?" suggestion under the error — with zero LLM, zero new dependencies, parsed entirely from the error string the frontend already has.

**Architecture:** A pure TypeScript parser (`sqlErrorHelper.ts`) extracts DuckDB's built-in `Candidate bindings:` / `Did you mean "X"?` hints from the error message. `ResultPanel` renders the parsed suggestion as a subtle chip below the existing error display. No backend, no API, no LLM.

**Tech Stack:** TypeScript, React, vitest, i18next (all already in the project).

**Why this is the first increment:** It's the lowest-risk, highest-frequency win from the AI-assistant spec (`docs/superpowers/specs/2026-05-30-ai-assistant-design.md` §5.2 Stage 0). It needs no provider configuration and proves the error-display integration point that the later LLM "Explain & Fix" (P1 Stage 1) will extend.

**Verified DuckDB 1.5.3 error formats** (captured from the actual engine):
- Column: `Binder Error: Referenced column "order_idd" not found in FROM clause!\nCandidate bindings: "order_id"`
- Table: `Catalog Error: Table with name orderss does not exist!\nDid you mean "orders"?`

---

## File Structure

- `frontend/src/utils/sqlErrorHelper.ts` (currently empty) — the pure parser `parseDuckDbErrorSuggestion`. One responsibility: error string → structured suggestion.
- `frontend/src/utils/__tests__/sqlErrorHelper.test.ts` (create) — vitest unit tests for the parser.
- `frontend/src/Query/ResultPanel/ResultPanel.tsx` (modify, ~line 335-346 error block) — render the suggestion chip.
- `frontend/src/i18n/locales/zh/common.json` and `.../en/common.json` (modify) — add `query.result.didYouMean` key.

---

### Task 1: Pure parser `parseDuckDbErrorSuggestion`

**Files:**
- Modify: `frontend/src/utils/sqlErrorHelper.ts` (empty → parser)
- Test: `frontend/src/utils/__tests__/sqlErrorHelper.test.ts` (create)

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/utils/__tests__/sqlErrorHelper.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parseDuckDbErrorSuggestion } from '../sqlErrorHelper';

describe('parseDuckDbErrorSuggestion', () => {
  it('extracts column candidates from a Binder Error', () => {
    const msg =
      'Binder Error: Referenced column "order_idd" not found in FROM clause!\nCandidate bindings: "order_id"';
    expect(parseDuckDbErrorSuggestion(msg)).toEqual({
      kind: 'column',
      wrongName: 'order_idd',
      candidates: ['order_id'],
    });
  });

  it('extracts multiple column candidates', () => {
    const msg =
      'Binder Error: Referenced column "amt" not found in FROM clause!\nCandidate bindings: "amount", "amount_paid"';
    expect(parseDuckDbErrorSuggestion(msg)).toEqual({
      kind: 'column',
      wrongName: 'amt',
      candidates: ['amount', 'amount_paid'],
    });
  });

  it('extracts a table suggestion from a Catalog Error', () => {
    const msg =
      'Catalog Error: Table with name orderss does not exist!\nDid you mean "orders"?';
    expect(parseDuckDbErrorSuggestion(msg)).toEqual({
      kind: 'table',
      wrongName: 'orderss',
      candidates: ['orders'],
    });
  });

  it('returns null when there is no suggestion', () => {
    expect(parseDuckDbErrorSuggestion('Parser Error: syntax error at or near "FRMO"')).toBeNull();
    expect(parseDuckDbErrorSuggestion('')).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && npx vitest run src/utils/__tests__/sqlErrorHelper.test.ts`
Expected: FAIL — `parseDuckDbErrorSuggestion` is not exported (sqlErrorHelper.ts is empty).

- [ ] **Step 3: Write the parser**

Replace the contents of `frontend/src/utils/sqlErrorHelper.ts` with:

```ts
/**
 * 解析 DuckDB 报错串中内置的「候选项 / 你是不是想找」提示。
 * 纯函数，零依赖、零 LLM —— DuckDB 1.5.3 在列/表找不到时已给出候选。
 */
export interface SqlErrorSuggestion {
  kind: 'column' | 'table';
  /** 报错中写错的名字（可能为空字符串） */
  wrongName: string;
  /** 候选项（至少一个） */
  candidates: string[];
}

export function parseDuckDbErrorSuggestion(
  message: string | null | undefined
): SqlErrorSuggestion | null {
  if (!message) return null;

  // 列：Referenced column "X" not found ... Candidate bindings: "a", "b"
  const colMatch = message.match(/column\s+"([^"]+)"\s+not found/i);
  if (colMatch) {
    const candLine = message.match(/Candidate bindings:\s*(.+)/i);
    const candidates = candLine
      ? Array.from(candLine[1].matchAll(/"([^"]+)"/g)).map((m) => m[1])
      : [];
    if (candidates.length > 0) {
      return { kind: 'column', wrongName: colMatch[1], candidates };
    }
  }

  // 表：Table with name X does not exist! Did you mean "Y"?
  const tblMatch = message.match(/Table with name\s+"?([^"\s]+)"?\s+does not exist/i);
  if (tblMatch) {
    const didMatch = message.match(/Did you mean\s+"([^"]+)"/i);
    if (didMatch) {
      return { kind: 'table', wrongName: tblMatch[1], candidates: [didMatch[1]] };
    }
  }

  return null;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run src/utils/__tests__/sqlErrorHelper.test.ts`
Expected: PASS — 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/utils/sqlErrorHelper.ts frontend/src/utils/__tests__/sqlErrorHelper.test.ts
git commit -m "feat(sql): parse DuckDB did-you-mean / candidate bindings from error string"
```

---

### Task 2: Render the suggestion in the ResultPanel error block

**Files:**
- Modify: `frontend/src/Query/ResultPanel/ResultPanel.tsx` (error block around line 335-346)
- Modify: `frontend/src/i18n/locales/zh/common.json`, `frontend/src/i18n/locales/en/common.json`

- [ ] **Step 1: Add the i18n key**

In `frontend/src/i18n/locales/zh/common.json`, find the `query.result` object (it already contains `"error": "查询失败"`) and add a sibling key:

```json
"didYouMean": "你是不是想找：{{names}}？",
```

In `frontend/src/i18n/locales/en/common.json`, in the matching `query.result` object (contains `"error": "Query failed"` or similar), add:

```json
"didYouMean": "Did you mean: {{names}}?",
```

- [ ] **Step 2: Render the suggestion under the error message**

In `frontend/src/Query/ResultPanel/ResultPanel.tsx`, add the import near the other `@/utils` imports at the top of the file:

```ts
import { parseDuckDbErrorSuggestion } from '@/utils/sqlErrorHelper';
```

Then locate the error block (around line 335-346). It currently looks like:

```tsx
  if (error) {
    return (
      <div className="...">
        <AlertCircle className="h-10 w-10" />
        <span className="font-medium">{t('query.result.error', '查询失败')}</span>
        <span className="text-sm text-muted-foreground">{cleanErrorMessage(error.message)}</span>
      </div>
    );
  }
```

Replace that block with (compute the suggestion, render a chip when present):

```tsx
  if (error) {
    const suggestion = parseDuckDbErrorSuggestion(error.message);
    return (
      <div className="...">  {/* keep the existing className exactly as it was */}
        <AlertCircle className="h-10 w-10" />
        <span className="font-medium">{t('query.result.error', '查询失败')}</span>
        <span className="text-sm text-muted-foreground">{cleanErrorMessage(error.message)}</span>
        {suggestion && (
          <span className="mt-1 text-sm text-warning">
            {t('query.result.didYouMean', '你是不是想找：{{names}}？', {
              names: suggestion.candidates.map((c) => `"${c}"`).join(', '),
            })}
          </span>
        )}
      </div>
    );
  }
```

(Keep the existing outer `<div>` `className` unchanged — only add the trailing `{suggestion && ...}` line and the `const suggestion = ...` line.)

- [ ] **Step 3: Verify typecheck and existing tests still pass**

Run: `cd frontend && npx tsc --noEmit`
Expected: no NEW errors (exit 0; the project already typechecks clean).

Run: `cd frontend && npx vitest run`
Expected: all tests pass (previous count + the 4 new parser tests), no failures.

- [ ] **Step 4: Manual sanity check (note for the executor)**

Run a query referencing a misspelled column (e.g. `SELECT order_idd FROM some_table`) and confirm the result panel shows "你是不是想找：\"order_id\"？" under the red error. No provider/AI config needed.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/Query/ResultPanel/ResultPanel.tsx frontend/src/i18n/locales/zh/common.json frontend/src/i18n/locales/en/common.json
git commit -m "feat(result): show deterministic did-you-mean suggestion under query errors"
```

---

## Self-Review

**Spec coverage:** This plan implements spec §5.2 Stage 0 (deterministic, zero-LLM did-you-mean) and the spec's P1-Stage0 phase. Click-to-apply (replacing the wrong token in the editor) is intentionally deferred — showing the suggestion is the valuable, zero-plumbing core; apply needs a callback to the editor and belongs with the P1 Stage 1 work.

**Placeholder scan:** No TBD/TODO. The one `{/* keep the existing className exactly as it was */}` is an instruction to preserve existing markup, not a code placeholder — the executor copies the current className verbatim.

**Type consistency:** `SqlErrorSuggestion` (`kind`, `wrongName`, `candidates`) is defined in Task 1 and consumed in Task 2 via `suggestion.candidates`. Consistent.

**Note for executor:** In Task 2 Step 2, read the actual current error block first and preserve its exact `className`/structure; only add the two new lines. The line numbers (~335-346) are approximate.

---

## Subsequent plans (roadmap, each its own plan)

This is plan 1 of the AI-assistant spec. After it ships:
- **Plan 2 — P0 LLM foundation:** `llm_service.py` (LiteLLM), `ai` config + Fernet key encryption, provider-management settings tab, SSE skeleton, opt-in master switch.
- **Plan 3 — P1 Stage 1 + P2:** LLM "Explain & Fix" on the error (read-only, `sqlglot` safety gate, 1 repair retry, editable diff) + "Explain this SQL".
- **Plan 4 — P3 NL→SQL:** `Retriever` interface + `VectorRetriever` (DuckDB `vss`), schema-aware `llm_context` with federated/ATTACH examples, the "ask" input bar, "tables used" trust display.
- **Plan 5 — P4 Summarize:** `result_profiler` + aggregate-profile summary (+ optional sample rows, auto-allowed on local models).
