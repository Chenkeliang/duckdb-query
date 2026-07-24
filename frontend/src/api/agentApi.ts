/**
 * 统一 Agent API：一个 Engine + 多个 mode + 两个 transport。
 *
 * - streamAgent → POST /api/ai/agent/stream (SSE)，主要供 data_qa 展示步骤/取消。
 * - runAgent    → POST /api/ai/agent/run (JSON)，供 generate_sql/repair_sql/
 *   explain_sql/suggest_chart 等一次性 mode。
 * 请求统一为 {mode, session_id?, input, context}；组件只调这两个函数,不各自拼协议。
 * 契约见 docs/API_CONTRACT_FE_BE.md §9.3。
 */

import { apiClient, baseURL, normalizeResponse } from './client';

export interface AgentMessage {
  role: 'user' | 'assistant';
  content: string;
}

export type AgentMode =
  | 'data_qa'
  | 'generate_sql'
  | 'repair_sql'
  | 'explain_sql'
  | 'suggest_chart';

export interface AgentContext {
  tables?: string[];
  attach_databases?: { alias: string; connection_id: string }[];
  current_sql?: string;
  locale?: 'zh' | 'en';
}

export interface AgentRequest {
  mode: AgentMode;
  session_id?: string | null;
  input: Record<string, unknown>;
  context?: AgentContext;
}

export interface AgentLimitsInfo {
  steps: number;
  sql_calls: number;
  seconds: number;
  llm_calls: number;
}

/** data_qa 的 result 形状(其它 mode 的 result 结构见各自 output_model)。 */
export interface DataQaResult {
  content: string;
  sql: string | null;
  evidence: string[];
}

export type AgentEvent =
  | { event: 'run_started'; run_id: string; session_id: string | null; limits: AgentLimitsInfo }
  | { event: 'tool_started'; run_id: string; tool_call_id: string; tool: string; args_summary: string }
  | {
      event: 'tool_completed';
      run_id: string;
      tool_call_id: string;
      tool: string;
      ok: boolean;
      ui_summary: string;
      truncated: boolean;
      elapsed_ms: number;
    }
  | { event: 'answer'; run_id: string; result: Record<string, unknown> | null; termination_reason: string }
  | { event: 'error'; run_id: string; termination_reason: string; message: string }
  | {
      event: 'done';
      run_id: string;
      session_id: string | null;
      usage: { steps: number; llm_calls: number; tool_calls: number; sql_calls: number; elapsed_ms: number };
    };

/** 非流式结果:result 为对应 mode 的 output_model,或 null(校验失败/回退)。 */
export interface AgentRunResult<T = Record<string, unknown>> {
  result: T | null;
  termination_reason: string;
  message: string;
  run_id: string;
  session_id: string | null;
}

/** 增量 SSE 解析器:按空行分事件,容忍事件跨 chunk;注释行(心跳)忽略。 */
export class AgentSseParser {
  private buffer = '';

  push(chunk: string): AgentEvent[] {
    this.buffer += chunk;
    const events: AgentEvent[] = [];
    let idx: number;
    while ((idx = this.buffer.indexOf('\n\n')) >= 0) {
      const block = this.buffer.slice(0, idx);
      this.buffer = this.buffer.slice(idx + 2);
      let name = '';
      let data = '';
      for (const line of block.split('\n')) {
        if (line.startsWith('event: ')) name = line.slice(7).trim();
        else if (line.startsWith('data: ')) data += line.slice(6);
        // 以 ":" 开头的注释行(心跳)与空行忽略
      }
      if (!name || !data) continue;
      try {
        events.push({ event: name, ...JSON.parse(data) } as AgentEvent);
      } catch {
        // 单条事件损坏不拖垮整个流
      }
    }
    return events;
  }
}

/**
 * 流式 Agent（SSE）。onEvent 逐事件回调;返回时流已结束。
 * 取消:传入 AbortSignal 并 abort——服务端检测断连后会中断在跑的探查查询。
 */
export async function streamAgent(
  req: AgentRequest,
  { onEvent, signal }: { onEvent: (event: AgentEvent) => void; signal?: AbortSignal },
): Promise<void> {
  const resp = await fetch(`${baseURL}/api/ai/agent/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    body: JSON.stringify(req),
    signal,
  });
  if (!resp.ok || !resp.body) {
    let code = 'OPERATION_FAILED';
    let message = `HTTP ${resp.status}`;
    try {
      const err = await resp.json();
      code = err?.error?.code || code;
      message = err?.error?.message || err?.message || message;
    } catch {
      /* 非 JSON 错误体 */
    }
    const error = new Error(message) as Error & { code?: string };
    error.code = code;
    throw error;
  }
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  const parser = new AgentSseParser();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    for (const event of parser.push(decoder.decode(value, { stream: true }))) {
      onEvent(event);
    }
  }
}

/** 非流式 Agent（JSON）。返回 {result, termination_reason, ...}。 */
export async function runAgent<T = Record<string, unknown>>(
  req: AgentRequest,
): Promise<AgentRunResult<T>> {
  const res = await apiClient.post('/api/ai/agent/run', req);
  return normalizeResponse<AgentRunResult<T>>(res).data;
}
