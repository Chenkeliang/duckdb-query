/**
 * 全局数据智能体对话总线。
 *
 * 抽屉从 4 个查询面板各自挂载改为 QueryTabs 单例挂载(对话全局共用)后,
 * 面板与抽屉之间不再有 props 通道:开关状态、各面板的当前 SQL、
 * "插入编辑器"回填函数都经这里流转。极简 useSyncExternalStore 外部
 * store,不引状态库。
 */
import { useSyncExternalStore } from 'react';

export type WorkbenchTabId = 'sql' | 'join' | 'set' | 'pivot';

interface AgentChatBusState {
  open: boolean;
  /** 各面板最近的 SQL(编辑器内容/构建器生成),供「解释/优化当前 SQL」快捷动作用 */
  sqlByTab: Partial<Record<WorkbenchTabId, string>>;
}

let state: AgentChatBusState = { open: false, sqlByTab: {} };
const listeners = new Set<() => void>();
let inserter: ((sql: string) => void) | null = null;

function emit() {
  listeners.forEach((l) => l());
}

export const agentChatBus = {
  subscribe(l: () => void): () => void {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  getState(): AgentChatBusState {
    return state;
  },
  setOpen(open: boolean) {
    if (state.open === open) return;
    state = { ...state, open };
    emit();
  },
  toggle() {
    state = { ...state, open: !state.open };
    emit();
  },
  setSql(tab: WorkbenchTabId, sql: string) {
    if (state.sqlByTab[tab] === sql) return;
    state = { ...state, sqlByTab: { ...state.sqlByTab, [tab]: sql } };
    emit();
  },
  /** SQL 编辑器面板挂载时注册回填函数,卸载时传 null */
  registerInserter(fn: ((sql: string) => void) | null) {
    inserter = fn;
  },
  insertSql(sql: string) {
    inserter?.(sql);
  },
  /** 测试用:恢复初始状态 */
  __reset() {
    state = { open: false, sqlByTab: {} };
    inserter = null;
    emit();
  },
};

export function useAgentChatBus(): AgentChatBusState {
  return useSyncExternalStore(agentChatBus.subscribe, agentChatBus.getState);
}
