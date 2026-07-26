/**
 * agentChatBus:全局对话总线的开关、各 Tab SQL 发布、插入编辑器回填。
 *
 * 背景:抽屉从 4 个查询面板各自挂载改为 QueryTabs 单例挂载,对话上下文
 * 全局共用;面板与抽屉之间的通道全部走这里,总线行为就是承重墙。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { agentChatBus } from '../agentChatBus';

describe('agentChatBus', () => {
  beforeEach(() => {
    agentChatBus.__reset();
  });

  it('toggle/setOpen 更新 open 并通知订阅者', () => {
    const seen: boolean[] = [];
    const unsub = agentChatBus.subscribe(() => seen.push(agentChatBus.getState().open));
    agentChatBus.toggle();
    agentChatBus.setOpen(true); // 幂等:同值不通知
    agentChatBus.setOpen(false);
    unsub();
    expect(seen).toEqual([true, false]);
  });

  it('setSql 按 Tab 记录,状态不可变更新且同值不通知', () => {
    const listener = vi.fn();
    agentChatBus.subscribe(listener);
    const before = agentChatBus.getState();
    agentChatBus.setSql('pivot', 'SELECT 1');
    agentChatBus.setSql('sql', 'SELECT 2');
    agentChatBus.setSql('pivot', 'SELECT 1'); // 同值
    const after = agentChatBus.getState();
    expect(after.sqlByTab).toEqual({ pivot: 'SELECT 1', sql: 'SELECT 2' });
    expect(after).not.toBe(before); // useSyncExternalStore 需要新引用
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('insertSql 调用已注册的回填函数;注销后不再调用', () => {
    const inserter = vi.fn();
    agentChatBus.registerInserter(inserter);
    agentChatBus.insertSql('SELECT 3');
    expect(inserter).toHaveBeenCalledWith('SELECT 3');
    agentChatBus.registerInserter(null);
    agentChatBus.insertSql('SELECT 4'); // 无注册者:静默,不抛错
    expect(inserter).toHaveBeenCalledTimes(1);
  });
});
