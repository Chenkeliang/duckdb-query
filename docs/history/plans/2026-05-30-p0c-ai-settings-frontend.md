# P0-c AI Settings — Frontend tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans. Checkbox steps.

**Goal:** A «AI / 模型» settings section where the user toggles the AI master switch, manages providers (add/remove cards with type/base_url/model(s)/api_key/enabled + test-connection), picks a default provider, and saves — calling the P0-b backend (`GET/PUT /api/settings/ai`, `POST /api/ai/providers/{id}/test`). Keys are write-only (server returns masked `****`).

**Architecture:** A typed API client `aiApi.ts` over the existing `apiClient`; a self-contained `AISettings.tsx` section component following the existing `CacheSettings.tsx` pattern (shadcn Card + toast); stacked into `SettingsPage.tsx`.

**Tech Stack:** React, TypeScript, shadcn/ui, vitest. **Surface decision (from design review):** lean — settings tab here; feature entry points (ask-bar, fix button) are in-context with a consistent ✨ identity + ⌘K global entry (separate later plans), NOT a mascot.

**Model tiering:** Task 1 (`aiApi.ts`, clean + vitest) → **sonnet**. Task 2 (`AISettings.tsx` UI + integration) → **opus**.

---

## File Structure
- `frontend/src/api/aiApi.ts` (create) — types + getAiSettings/saveAiSettings/testProvider.
- `frontend/src/api/__tests__/aiApi.test.ts` (create) — vitest.
- `frontend/src/Settings/AISettings.tsx` (create) — the section component.
- `frontend/src/Settings/SettingsPage.tsx` (modify) — stack `<AISettings/>`.
- `frontend/src/i18n/locales/{zh,en}/common.json` (modify) — `settings.ai.*` keys.

---

### Task 1: `aiApi.ts` client (sonnet)

**Files:** Create `frontend/src/api/aiApi.ts`, `frontend/src/api/__tests__/aiApi.test.ts`.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/api/__tests__/aiApi.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../client', () => ({
  apiClient: { get: vi.fn(), put: vi.fn(), post: vi.fn() },
  normalizeResponse: (r: { data: { data: unknown } }) => ({ data: r.data.data }),
  handleApiError: (e: unknown) => { throw e; },
}));

import { apiClient } from '../client';
import { getAiSettings, saveAiSettings, testProvider } from '../aiApi';

describe('aiApi', () => {
  beforeEach(() => vi.clearAllMocks());

  it('getAiSettings GETs /api/settings/ai', async () => {
    (apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { data: { enabled: false, providers: [] } } });
    const out = await getAiSettings();
    expect(apiClient.get).toHaveBeenCalledWith('/api/settings/ai');
    expect(out.enabled).toBe(false);
  });

  it('saveAiSettings PUTs the payload', async () => {
    (apiClient.put as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { data: { saved: true } } });
    await saveAiSettings({ enabled: true, default_provider: 'p1', providers: [], features: {} });
    expect(apiClient.put).toHaveBeenCalledWith('/api/settings/ai', expect.objectContaining({ enabled: true }));
  });

  it('testProvider POSTs the test endpoint', async () => {
    (apiClient.post as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { data: { ok: true } } });
    const out = await testProvider('p1');
    expect(apiClient.post).toHaveBeenCalledWith('/api/ai/providers/p1/test');
    expect(out.ok).toBe(true);
  });
});
```

- [ ] **Step 2: Run → fail** `cd frontend && npx vitest run src/api/__tests__/aiApi.test.ts` (module missing).

- [ ] **Step 3: Implement `frontend/src/api/aiApi.ts`:**

```ts
import { apiClient, normalizeResponse, handleApiError } from './client';

export type AiProviderType = 'openai' | 'anthropic' | 'ollama' | 'openai_compatible';

export interface AiProvider {
  id: string;
  type: AiProviderType;
  base_url?: string | null;
  api_key?: string;          // 写时为明文；读时后端返回掩码 ****
  models: string[];
  enabled: boolean;
}

export interface AiFeatureCfg {
  enabled: boolean;
  provider?: string | null;
  model?: string | null;
}

export interface AiSettings {
  enabled: boolean;
  default_provider?: string | null;
  providers: AiProvider[];
  features: Record<string, AiFeatureCfg>;
  timeout_seconds?: number;
  num_retries?: number;
}

export async function getAiSettings(): Promise<AiSettings> {
  try {
    const res = await apiClient.get('/api/settings/ai');
    return normalizeResponse<AiSettings>(res).data;
  } catch (e) {
    throw handleApiError(e as never, '获取 AI 设置失败');
  }
}

export async function saveAiSettings(settings: AiSettings): Promise<void> {
  try {
    await apiClient.put('/api/settings/ai', settings);
  } catch (e) {
    throw handleApiError(e as never, '保存 AI 设置失败');
  }
}

export async function testProvider(providerId: string): Promise<{ ok: boolean; sample?: string }> {
  try {
    const res = await apiClient.post(`/api/ai/providers/${providerId}/test`);
    return normalizeResponse<{ ok: boolean; sample?: string }>(res).data;
  } catch (e) {
    throw handleApiError(e as never, '测试供应商失败');
  }
}
```

- [ ] **Step 4: Run → pass.** `cd frontend && npx vitest run src/api/__tests__/aiApi.test.ts`
- [ ] **Step 5: Verify the `client.ts` exports used here exist** (`apiClient`, `normalizeResponse`, `handleApiError`) — grep `frontend/src/api/client.ts`. If `normalizeResponse`/`handleApiError` have different names, adapt the import + test mock to the real names.
- [ ] **Step 6: Commit** `git add frontend/src/api/aiApi.ts frontend/src/api/__tests__/aiApi.test.ts && git commit -m "feat(ai): aiApi client (settings get/put + provider test)"`

---

### Task 2: `AISettings.tsx` + integration (opus)

**Files:** Create `frontend/src/Settings/AISettings.tsx`; modify `frontend/src/Settings/SettingsPage.tsx`, the two locale files.

This task is UI; verification is `tsc --noEmit` clean + full vitest green + a manual run. Build a self-contained section following `CacheSettings.tsx` conventions:
- Load settings via `getAiSettings()` on mount (useEffect / a small hook); keep local editable state.
- A master `Switch` for `enabled`.
- A `default_provider` `Select` populated from providers.
- A list of provider cards; each: name/id (read-only id, generated), `type` Select, `base_url` Input (shown for ollama/openai_compatible), `models` Input (comma-separated), `api_key` Input (type=password, placeholder shows masked value; only send when changed), `enabled` Switch, «测试» Button (calls `testProvider`, toast result), «删除» Button.
- «新增供应商» Button appends a card with a generated id (e.g. `prov-${Date.now()}` — but Date.now is fine in app runtime; only workflow scripts forbid it).
- «保存» Button calls `saveAiSettings(state)` and toasts success/error.
- Use `showSuccessToast`/`showErrorToast` from `@/utils/toastHelpers`, shadcn `Card/Button/Input/Label/Switch/Select/Separator`.
- i18n: add a `settings.ai` block (title, description, enable, addProvider, test, save, etc.) to both locales; use `t('settings.ai.xxx', '中文 fallback')`.

Integration: in `SettingsPage.tsx`, import and render `<AISettings />` alongside the other section components (`<QueryResultSettings/>`, `<CacheSettings/>`).

- [ ] Build `AISettings.tsx` per the above.
- [ ] Add `settings.ai.*` i18n keys (zh + en).
- [ ] Stack `<AISettings/>` into `SettingsPage.tsx`.
- [ ] `cd frontend && npx tsc --noEmit` → clean.
- [ ] `cd frontend && npx vitest run` → all green.
- [ ] Manual: open Settings, see «AI / 模型», add an Ollama provider (base_url http://localhost:11434), toggle master on, Save; reload → persists; «测试» reports ok/fail.
- [ ] Commit `git add frontend/src/Settings/AISettings.tsx frontend/src/Settings/SettingsPage.tsx frontend/src/i18n/locales/zh/common.json frontend/src/i18n/locales/en/common.json && git commit -m "feat(ai): AI/model settings tab (provider management)"`

---

## Self-Review
**Spec coverage:** §4 frontend (provider CRUD + test + master switch + default provider). Per-feature model assignment is deliberately deferred to a v2 (default_provider covers the common case) to keep v1 lean. **Surface:** matches the chosen lean model (settings tab only here).
**Placeholder scan:** Task 2 is described, not code-complete, because it is iterative UI — acceptable per writing-plans note on existing-codebase UI. The executor follows `CacheSettings.tsx` as the concrete pattern.
**Type consistency:** `AiSettings`/`AiProvider` (Task 1) consumed by `AISettings.tsx` (Task 2). API paths match P0-b router.

## Next plans
P1-Stage1 + P2 (LLM «Explain & Fix» on errors + «Explain SQL»), then P3 NL→SQL (ask-bar + ⌘K entry + ✨ identity), P4 summarize.
