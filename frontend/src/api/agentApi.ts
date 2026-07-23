/**
 * 数据智能体(agent-chat)的 SSE 客户端。
 *
 * EventSource 只支持 GET,本端点是 POST——用 fetch + ReadableStream 手读。
 * 解析器独立导出便于单测(事件可能跨 chunk 断开)。
 * 契约见 docs/API_CONTRACT_FE_BE.md §9.3。
 */

import { baseURL } from './client';

export interface AgentLimitsInfo {
  llm_calls: number;
  sql_calls: number;
  seconds: number;
}

export type AgentEvent =
  | { event: 'run_started'; run_id: string; limits: AgentLimitsInfo }
  | {
      event: 'tool_started';
      run_id: string;
      tool_call_id: string;
      tool: string;
      args_summary: string;
    }
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
  | {
      event: 'answer';
      run_id: string;
      answer: string;
      sql: string | null;
      evidence: string[];
      termination_reason: 'completed';
    }
  | { event: 'error'; run_id: string; termination_reason: string; message: string }
  | {
      event: 'done';
      run_id: string;
      usage: { llm_calls: number; tool_calls: number; sql_calls: number; elapsed_ms: number };
    };

export interface AgentChatRequest {
  messages: { role: 'user' | 'assistant'; content: string }[];
  tables?: string[];
  attach_databases?: { alias: string; connection_id: string }[];
  current_sql?: string;
  locale?: 'zh' | 'en';
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
 * 发起智能体对话,onEvent 逐事件回调;返回时流已结束。
 * 取消:传入 AbortSignal 并 abort——服务端检测断连后会中断在跑的探查查询。
 */
export async function agentChatStream(
  body: AgentChatRequest,
  {
    onEvent,
    signal,
  }: { onEvent: (event: AgentEvent) => void; signal?: AbortSignal },
): Promise<void> {
  const resp = await fetch(`${baseURL}/api/ai/agent-chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    body: JSON.stringify(body),
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
