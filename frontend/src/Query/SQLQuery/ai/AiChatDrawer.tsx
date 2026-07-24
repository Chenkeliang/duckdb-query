import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Send,
  X,
  Trash2,
  Loader2,
  Sparkles,
  CornerDownLeft,
  MessageSquare,
  User,
  BookOpen,
  Wand2,
  Square,
  Check,
  CircleAlert,
  ChevronRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { showErrorToast } from '@/utils/toastHelpers';
import {
  getDuckDBTables,
  streamAgent,
  type AgentEvent,
  type AgentMessage,
  type DataQaResult,
} from '@/api';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/** 工具栏「对话」开关按钮，样式与 解释/格式化/收藏 统一。 */
export function ChatToggleButton({
  active,
  onClick,
}: {
  active: boolean;
  onClick: () => void;
}) {
  const { t } = useTranslation('common');
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={onClick}
      title={t('query.ai.chat', '数据助手对话')}
      className={
        active ? 'text-primary hover:text-primary' : 'text-muted-foreground hover:text-foreground'
      }
    >
      <MessageSquare className="h-4 w-4 mr-1" />
      <span className="hidden sm:inline">{t('query.ai.chat', '对话')}</span>
    </Button>
  );
}

export interface AiChatDrawerProps {
  open: boolean;
  onClose: () => void;
  /** 选中表名，作为 schema 上下文 */
  selectedTables: string[];
  /** 联邦表所属外部库；后端据此 ATTACH 后才能取到远端表结构 */
  attachDatabases?: { alias: string; connectionId: string }[];
  /** 把 assistant 给出的 SQL 插入编辑器；可视化构建面板(JOIN/集合/透视)无编辑器时可不传 */
  onInsertSQL?: (sql: string) => void;
  /** 当前编辑器/面板生成的 SQL，用于「解释/优化」快捷动作 */
  currentSql?: string;
  locale?: 'zh' | 'en';
}

interface AgentStep {
  id: string;
  tool: string;
  summary: string;
  running: boolean;
  ok?: boolean;
}

/** 抽屉内部消息:在 ChatMessage 之上叠加智能体轨迹(不回传后端)。 */
interface DrawerMsg {
  role: 'user' | 'assistant';
  content: string;
  steps?: AgentStep[];
  sql?: string | null;
  evidence?: string[];
  failed?: boolean;
}

/** assistant 文本按 Markdown 渲染；代码块带「插入编辑器」按钮。 */
function AssistantMarkdown({
  content,
  onInsertSQL,
  insertLabel,
}: {
  content: string;
  onInsertSQL?: (sql: string) => void;
  insertLabel: string;
}) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        h1: ({ node: _n, ...p }) => <h3 className="mb-1 mt-2 text-sm font-semibold" {...p} />,
        h2: ({ node: _n, ...p }) => <h3 className="mb-1 mt-2 text-sm font-semibold" {...p} />,
        h3: ({ node: _n, ...p }) => <h3 className="mb-1 mt-2 text-sm font-semibold" {...p} />,
        p: ({ node: _n, ...p }) => <p className="my-1 leading-relaxed" {...p} />,
        ul: ({ node: _n, ...p }) => <ul className="my-1 list-disc space-y-0.5 pl-5" {...p} />,
        ol: ({ node: _n, ...p }) => <ol className="my-1 list-decimal space-y-0.5 pl-5" {...p} />,
        strong: ({ node: _n, ...p }) => <strong className="font-semibold" {...p} />,
        a: ({ node: _n, ...p }) => (
          <a className="text-primary underline" target="_blank" rel="noreferrer" {...p} />
        ),
        hr: () => <hr className="my-2 border-border" />,
        blockquote: ({ node: _n, ...p }) => (
          <blockquote className="border-l-2 border-border pl-2 text-muted-foreground" {...p} />
        ),
        table: ({ node: _n, ...p }) => (
          <div className="my-1 overflow-auto">
            <table className="w-full border-collapse text-xs" {...p} />
          </div>
        ),
        th: ({ node: _n, ...p }) => (
          <th className="border border-border px-2 py-1 text-left font-medium" {...p} />
        ),
        td: ({ node: _n, ...p }) => <td className="border border-border px-2 py-1" {...p} />,
        pre: ({ children }) => <>{children}</>,
        code: ({ node: _n, className, children, ...rest }) => {
          const isBlock = /language-/.test(className || '');
          const text = String(children).replace(/\n$/, '');
          if (!isBlock) {
            return (
              <code className="rounded bg-background px-1 py-0.5 text-xs" {...rest}>
                {children}
              </code>
            );
          }
          return (
            <div className="my-1 rounded border border-border bg-background">
              <pre className="overflow-auto px-2 py-1.5 text-xs">
                <code>{text}</code>
              </pre>
              {onInsertSQL && (
                <div className="border-t border-border px-2 py-1 text-right">
                  <button
                    type="button"
                    onClick={() => onInsertSQL(text)}
                    className="text-xs text-primary hover:underline"
                  >
                    {insertLabel}
                  </button>
                </div>
              )}
            </div>
          );
        },
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

/** 智能体探查过程步骤条:运行中展开显示当前轨迹,答案到达后自动折叠成"使用了 N 个工具"摘要
 * (向 Claude 看齐);点击标题可再展开查看 search/inspect/run_query 明细。 */
function AgentSteps({
  steps,
  streaming,
  runningTitle,
  doneTitle,
}: {
  steps: AgentStep[];
  streaming: boolean;
  runningTitle: string;
  doneTitle: string;
}) {
  // 初始展开与否 = 是否正在流式(历史里已完成的消息一进来就折叠)
  const [open, setOpen] = useState(streaming);
  const prevStreaming = useRef(streaming);
  useEffect(() => {
    if (streaming) setOpen(true);
    else if (prevStreaming.current) setOpen(false); // 流结束的那一刻自动折叠一次
    prevStreaming.current = streaming;
  }, [streaming]);

  if (!steps.length) return null;
  return (
    <div className="mb-1.5 rounded border border-border/60 bg-background/60">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1.5 px-2 py-1 text-[10px] font-medium text-muted-foreground hover:text-foreground"
      >
        {streaming ? (
          <Loader2 className="h-3 w-3 shrink-0 animate-spin text-primary" />
        ) : (
          <ChevronRight
            className={`h-3 w-3 shrink-0 transition-transform ${open ? 'rotate-90' : ''}`}
          />
        )}
        <span className="truncate">{streaming ? runningTitle : doneTitle}</span>
      </button>
      {open && (
        <div className="space-y-0.5 px-2 pb-1.5">
          {steps.map((s) => (
            <div key={s.id} className="flex items-center gap-1.5 text-[11px]">
              {s.running ? (
                <Loader2 className="h-3 w-3 shrink-0 animate-spin text-primary" />
              ) : s.ok ? (
                <Check className="h-3 w-3 shrink-0 text-primary" />
              ) : (
                <CircleAlert className="h-3 w-3 shrink-0 text-destructive" />
              )}
              <span className="font-mono text-muted-foreground">{s.tool}</span>
              <span className="truncate text-muted-foreground/80">{s.summary}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** 输入框 @ 提及的表选择浮层触发正则:末尾 "@前缀"。 */
const MENTION_RE = /(^|\s)@([^\s@]*)$/;

export function AiChatDrawer({
  open,
  onClose,
  selectedTables,
  attachDatabases,
  onInsertSQL,
  currentSql,
  locale = 'zh',
}: AiChatDrawerProps) {
  const { t } = useTranslation('common');
  const [messages, setMessages] = useState<DrawerMsg[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [mentionTables, setMentionTables] = useState<string[]>([]);
  const [allTables, setAllTables] = useState<string[] | null>(null);
  const [scopeOff, setScopeOff] = useState<Record<string, boolean>>({});
  const listRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const typewriterRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearTypewriter = () => {
    if (typewriterRef.current) {
      clearInterval(typewriterRef.current);
      typewriterRef.current = null;
    }
  };

  // 内容渐进流式(B):grounding 已通过、内容已校验后,前端打字机把目标串逐段 append 进渲染态,
  // Markdown 随之增量渲染——观感对齐 Claude,但绝不流式未落地内容(仍在 grounding 后才可得)。
  const startTypewriter = (index: number, full: string) => {
    clearTypewriter();
    if (!full) return;
    const stepLen = Math.max(2, Math.ceil(full.length / 100)); // 大内容也在 ~1.6s 内显示完
    let pos = 0;
    typewriterRef.current = setInterval(() => {
      pos = Math.min(full.length, pos + stepLen);
      const shown = full.slice(0, pos);
      setMessages((prev) => {
        if (index >= prev.length) return prev; // 已被清空/越界:停手
        const next = [...prev];
        next[index] = { ...next[index], content: shown };
        return next;
      });
      if (pos >= full.length) clearTypewriter();
    }, 16);
  };

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages, loading]);

  useEffect(
    () => () => {
      abortRef.current?.abort();
      clearTypewriter();
    },
    [],
  );

  const mentionMatch = MENTION_RE.exec(input);
  useEffect(() => {
    // 首次输入 @ 时才拉表清单(登记表序:最新在前)
    if (mentionMatch && allTables === null) {
      getDuckDBTables()
        .then((tables) => setAllTables(tables.map((x) => x.name)))
        .catch(() => setAllTables([]));
    }
  }, [mentionMatch, allTables]);

  if (!open) return null;

  const activeAliases = (attachDatabases || []).filter((d) => !scopeOff[d.alias]);
  const historyForBackend = (list: DrawerMsg[]): AgentMessage[] =>
    list.map((m) => ({ role: m.role, content: m.content }));

  const termText = (reason: string, message: string) => {
    const map: Record<string, string> = {
      protocol_violation: t('query.ai.termProtocol', '模型未遵守协议，已如实终止'),
      ungrounded_final: t(
        'query.ai.termUngrounded',
        '答案未基于实际查询结果，已如实终止（未采信未落地的结论）',
      ),
      output_invalid: t('query.ai.termOutputInvalid', '模型输出不符合结果规范，已如实终止'),
      budget_llm: t('query.ai.termBudget', '已达步数预算，给出当前结论前终止'),
      budget_time: t('query.ai.termTime', '已达时间预算终止'),
      cancelled: t('query.ai.termCancelled', '已停止'),
      provider_error: t('query.ai.termProvider', '模型服务调用失败'),
      internal_error: t('query.ai.termInternal', '内部错误'),
    };
    // 页面只显示本地化文案:后端 message 与 termination_reason 都是内部英文标识
    // (如 "model failed to follow the action protocol"),不该出现在用户界面;
    // 原始明细进 console 供排查,不丢诊断信息。
    if (message || !map[reason]) {
      console.warn('[agent] termination', reason, message);
    }
    return map[reason] || t('query.ai.termUnknown', '运行未正常结束，请重试');
  };

  const sendAgent = async (text: string) => {
    clearTypewriter(); // 新一轮发送:停掉上一条可能仍在打字的定时器,避免写错消息
    const userMsg: DrawerMsg = { role: 'user', content: text };
    const pending: DrawerMsg = { role: 'assistant', content: '', steps: [] };
    const history = historyForBackend(messages);
    const pendingIndex = messages.length + 1; // userMsg 在 messages.length,pending 紧随其后
    setMessages((prev) => [...prev, userMsg, pending]);
    setLoading(true);
    const controller = new AbortController();
    abortRef.current = controller;

    const patchPending = (fn: (m: DrawerMsg) => DrawerMsg) =>
      setMessages((prev) => {
        const next = [...prev];
        next[next.length - 1] = fn(next[next.length - 1]);
        return next;
      });

    let sawTerminal = false; // 是否收到过终止事件(answer / error)
    const onEvent = (ev: AgentEvent) => {
      if (ev.event === 'answer' || ev.event === 'error') sawTerminal = true;
      if (ev.event === 'tool_started') {
        patchPending((m) => ({
          ...m,
          steps: [
            ...(m.steps || []),
            { id: ev.tool_call_id, tool: ev.tool, summary: ev.args_summary, running: true },
          ],
        }));
      } else if (ev.event === 'tool_completed') {
        patchPending((m) => ({
          ...m,
          steps: (m.steps || []).map((s) =>
            s.id === ev.tool_call_id
              ? { ...s, running: false, ok: ev.ok, summary: ev.ui_summary }
              : s,
          ),
        }));
      } else if (ev.event === 'answer') {
        const r = (ev.result ?? {}) as unknown as DataQaResult;
        // content 先置空,SQL/依据立即呈现;content 交打字机渐进 append(B)
        patchPending((m) => ({
          ...m,
          content: '',
          sql: r.sql ?? null,
          evidence: r.evidence ?? [],
        }));
        startTypewriter(pendingIndex, r.content ?? '');
      } else if (ev.event === 'error') {
        patchPending((m) => ({
          ...m,
          failed: true,
          content: termText(ev.termination_reason, ev.message),
        }));
      }
    };

    try {
      await streamAgent(
        {
          mode: 'data_qa',
          input: { messages: [...history, { role: 'user', content: text }] },
          context: {
            tables: Array.from(new Set([...selectedTables, ...mentionTables])),
            attach_databases: activeAliases.map((d) => ({
              alias: d.alias,
              connection_id: d.connectionId,
            })),
            current_sql: currentSql,
            locale,
          },
        },
        { onEvent, signal: controller.signal },
      );
      if (!sawTerminal) {
        // SSE 流正常结束却没给 answer/error(连接中断 / 后端提前关闭 / 空闲超时)——
        // 绝不留永久 spinner:如实标记为失败并给本地化提示,可重试。
        clearTypewriter();
        patchPending((m) => ({
          ...m,
          failed: true,
          content: m.content || t('query.ai.termIncomplete', '连接中断，未收到完整结果，请重试'),
        }));
      }
    } catch (e) {
      if ((e as Error).name === 'AbortError') {
        patchPending((m) => ({
          ...m,
          failed: true,
          content: m.content || t('query.ai.termCancelled', '已停止'),
        }));
      } else {
        // 网络/HTTP 失败:原始 message 是英文内部信息(如 "Load failed"、后端英文错误体),
        // 气泡里只放本地化文案,明细进 console(与 termText 同口径)。
        console.warn('[agent] request failed', e);
        showErrorToast(t, e as Error, t('query.ai.agentFailed', '智能体运行失败'));
        patchPending((m) => ({
          ...m,
          failed: true,
          content: m.content || t('query.ai.agentFailed', '智能体运行失败'),
        }));
      }
    } finally {
      abortRef.current = null;
      setLoading(false);
    }
  };

  const send = async (override?: string) => {
    const text = (override ?? input).trim();
    if (!text || loading) return;
    if (override == null) setInput('');
    await sendAgent(text);
  };

  const pickMention = (name: string) => {
    setMentionTables((prev) => (prev.includes(name) ? prev : [...prev, name]));
    setInput((prev) => prev.replace(MENTION_RE, '$1'));
  };

  const mentionCandidates =
    mentionMatch && allTables
      ? allTables
          .filter((n) => n.toLowerCase().includes(mentionMatch[2].toLowerCase()))
          .filter((n) => !mentionTables.includes(n))
          // 下拉容器已是 max-h-48 可滚动;此处放宽上限,避免"@表 表不全"(旧值 8 会隐藏
          // 绝大多数表)。仍设有界上限防超大工作区渲染过多 DOM,超出可继续输入过滤。
          .slice(0, 50)
      : [];

  return (
    <div className="fixed right-0 top-14 bottom-0 z-40 flex w-[min(420px,92vw)] flex-col border-l border-border bg-surface shadow-xl">
      {/* 头 */}
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <span className="flex items-center gap-1.5 text-sm font-medium">
          <Sparkles className="h-4 w-4 text-primary" />
          {t('query.ai.agentTitle', '数据智能体')}
        </span>
        <div className="flex items-center gap-1">
          {messages.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                clearTypewriter();
                setMessages([]);
              }}
              title={t('common.clear', '清空')}
              aria-label={t('common.clear', '清空')}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            title={t('common.close', '关闭')}
            aria-label={t('common.close', '关闭')}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* 消息区 */}
      <div ref={listRef} className="flex-1 space-y-3 overflow-auto p-3">
        {messages.length === 0 && (
          <div className="text-xs text-muted-foreground">
            {t(
              'query.ai.agentEmpty',
              '问我关于你数据的任何问题。我会查看表结构、验证真实取值、试跑只读查询后再回答;输入 @ 可指定表。',
            )}
          </div>
        )}
        {messages.map((m, i) => {
          const isUser = m.role === 'user';
          return (
            <div key={i} className={`flex gap-2 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
              {/* 头像 */}
              <div
                className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
                  isUser ? 'bg-primary text-primary-foreground' : 'bg-primary/15 text-primary'
                }`}
              >
                {isUser ? <User className="h-3.5 w-3.5" /> : <Sparkles className="h-3.5 w-3.5" />}
              </div>
              {/* 气泡 */}
              <div
                className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
                  isUser
                    ? 'rounded-tr-sm bg-primary text-primary-foreground'
                    : 'rounded-tl-sm bg-muted text-foreground'
                }`}
              >
                {isUser ? (
                  <p className="whitespace-pre-wrap">{m.content}</p>
                ) : (
                  <>
                    <AgentSteps
                      steps={m.steps || []}
                      streaming={loading && i === messages.length - 1}
                      runningTitle={t('query.ai.agentStepsRunning', '正在探查数据…')}
                      doneTitle={t('query.ai.agentStepsDone', '使用了 {{count}} 个工具', {
                        count: (m.steps || []).length,
                      })}
                    />
                    {m.content ? (
                      m.failed ? (
                        <p className="flex items-start gap-1.5 text-destructive">
                          <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                          <span>{m.content}</span>
                        </p>
                      ) : (
                        <AssistantMarkdown
                          content={m.content}
                          onInsertSQL={onInsertSQL}
                          insertLabel={t('query.ai.insertToEditor', '插入编辑器')}
                        />
                      )
                    ) : (
                      !m.steps?.length && (
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      )
                    )}
                    {m.sql && (
                      <div className="my-1 rounded border border-border bg-background">
                        <pre className="overflow-auto px-2 py-1.5 text-xs">
                          <code>{m.sql}</code>
                        </pre>
                        {onInsertSQL && (
                          <div className="border-t border-border px-2 py-1 text-right">
                            <button
                              type="button"
                              onClick={() => onInsertSQL(m.sql!)}
                              className="text-xs text-primary hover:underline"
                            >
                              {t('query.ai.insertToEditor', '插入编辑器')}
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                    {!!m.evidence?.length && (
                      <div className="mt-1 flex flex-wrap items-center gap-1 text-[10px] text-muted-foreground">
                        {t('query.ai.evidence', '依据')}:
                        {m.evidence.map((id) => (
                          <span
                            key={id}
                            className="rounded bg-background px-1 py-0.5 font-mono"
                          >
                            {id}
                          </span>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* 输入区 */}
      <div className="border-t border-border p-2">
        {currentSql?.trim() && !loading && (
          <div className="mb-1.5 flex flex-wrap gap-1.5">
            <button
              type="button"
              disabled={loading}
              onClick={() =>
                send(
                  `${t('query.ai.qaExplainLead', '请解释这段 SQL 在做什么（用中文，分点说明）：')}\n\`\`\`sql\n${currentSql.trim()}\n\`\`\``,
                )
              }
              className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/50 px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
            >
              <BookOpen className="h-3 w-3" />
              {t('query.ai.qaExplain', '解释当前 SQL')}
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={() =>
                send(
                  `${t('query.ai.qaOptimizeLead', '请帮我优化这段 SQL，并说明优化点和原因：')}\n\`\`\`sql\n${currentSql.trim()}\n\`\`\``,
                )
              }
              className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/50 px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
            >
              <Wand2 className="h-3 w-3" />
              {t('query.ai.qaOptimize', '优化建议')}
            </button>
          </div>
        )}
        {/* 作用域:所见即所查——取消勾选的连接既不进上下文也不可被探查 */}
        {!!attachDatabases?.length && (
          <div className="mb-1.5 flex flex-wrap items-center gap-1.5 text-[10px]">
            <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-muted-foreground">
              {t('query.ai.scopeLocal', '本地 DuckDB')}
            </span>
            {attachDatabases.map((d) => {
              const off = !!scopeOff[d.alias];
              return (
                <button
                  key={d.alias}
                  type="button"
                  onClick={() => setScopeOff((p) => ({ ...p, [d.alias]: !off }))}
                  className={`rounded-full border px-2 py-0.5 transition-colors ${
                    off
                      ? 'border-border text-muted-foreground/50 line-through'
                      : 'border-primary/40 bg-primary/10 text-primary'
                  }`}
                >
                  {d.alias}
                </button>
              );
            })}
          </div>
        )}
        {!!mentionTables.length && (
          <div className="mb-1.5 flex flex-wrap gap-1.5">
            {mentionTables.map((name) => (
              <span
                key={name}
                className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary"
              >
                @{name}
                <button
                  type="button"
                  onClick={() => setMentionTables((p) => p.filter((x) => x !== name))}
                  aria-label={t('common.remove', '移除')}
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="relative">
          {mentionCandidates.length > 0 && (
            <div className="absolute bottom-full left-0 z-10 mb-1 max-h-48 w-full overflow-auto rounded-md border border-border bg-surface shadow-lg">
              {mentionCandidates.map((name) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => pickMention(name)}
                  className="block w-full truncate px-2 py-1.5 text-left text-xs hover:bg-accent"
                >
                  {name}
                </button>
              ))}
            </div>
          )}
          <div className="flex items-center gap-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !mentionCandidates.length) {
                  e.preventDefault();
                  send();
                }
                if (e.key === 'Enter' && mentionCandidates.length) {
                  e.preventDefault();
                  pickMention(mentionCandidates[0]);
                }
              }}
              placeholder={t(
                'query.ai.agentPlaceholder',
                '问数据智能体…输入 @ 可选表（Enter 发送）',
              )}
              disabled={loading}
            />
            {loading ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => abortRef.current?.abort()}
                title={t('query.ai.stop', '停止')}
              >
                <Square className="h-4 w-4" />
              </Button>
            ) : (
              <Button size="sm" disabled={loading || !input.trim()} onClick={() => send()}>
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            )}
          </div>
        </div>
        <div className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground">
          <CornerDownLeft className="h-3 w-3" />
          {t(
            'query.ai.agentHint',
            '智能体会执行只读、限行、可取消的探查查询；最终 SQL 仍只插入编辑器',
          )}
        </div>
      </div>
    </div>
  );
}
