import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Send,
  X,
  MessageSquarePlus,
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
  Plus,
  Database,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { showErrorToast } from '@/utils/toastHelpers';
import {
  streamAgent,
  type AgentEvent,
  type AgentMessage,
  type DataQaResult,
} from '@/api';
import { listDatabaseConnections } from '@/api/dataSourceApi';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  addCandidateToScope,
  buildAgentScopeContext,
  connectionEntry,
  localEntry,
  loadScopeCandidates,
  scopeChipLabel,
  sqlSourcesFrom,
  LOCAL_SOURCE_ID,
  type ConnectionLite,
  type ScopeCandidate,
  type ScopeEntry,
} from './agentScope';

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
  /** 本轮实际作用域快照:回答隔天再看也说得清数据来自哪个库 */
  scope?: { label: string; kind: 'local' | 'connection' }[];
}

/** 本轮作用域小卡:把"这次查了哪些库"变成可审计的事实。 */
function ScopeCard({ scope, label }: { scope: DrawerMsg['scope']; label: string }) {
  if (!scope?.length) return null;
  return (
    <div className="mb-1.5 flex flex-wrap items-center gap-1.5 rounded border border-border/60 bg-background/40 px-2 py-1 text-[10px] text-muted-foreground">
      <span>{label}</span>
      {scope.map((s) => (
        <span key={s.label} className="inline-flex items-center gap-1 text-foreground">
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              s.kind === 'local' ? 'bg-primary' : 'bg-info'
            }`}
          />
          {s.label}
        </span>
      ))}
    </div>
  );
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
        // 跨源结果常是 4 列以上,抽屉再宽也可能放不下:表格自身按内容取宽,由外层横向滚动,
        // 否则列会被挤成竖排(实测 420px 抽屉必现)。
        table: ({ node: _n, ...p }) => (
          <div className="my-1 overflow-x-auto rounded border border-border">
            <table className="w-max min-w-full border-collapse text-xs" {...p} />
          </div>
        ),
        th: ({ node: _n, ...p }) => (
          <th
            className="whitespace-nowrap border-b border-border bg-muted/40 px-2 py-1 text-left font-medium"
            {...p}
          />
        ),
        td: ({ node: _n, ...p }) => (
          <td className="whitespace-nowrap border-b border-border/60 px-2 py-1" {...p} />
        ),
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

const DRAWER_WIDTH_KEY = 'dq-ai-drawer-width';
const DRAWER_DEFAULT_W = 480;
const DRAWER_MIN_W = 380;
const DRAWER_MAX_W = 860;
const DRAWER_TOP_KEY = 'dq-ai-drawer-top';
const DRAWER_MIN_H = 240;
/** 顶栏兜底高度:macOS 桌面端还有一条 28px 标题栏拖拽条,所以实际以 DOM 实测为准。 */
const HEADER_FALLBACK = 56;

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
  // 作用域:抽屉自己的一份状态(默认继承编辑器选择),改它不影响左侧表格选择
  const [scope, setScope] = useState<ScopeEntry[] | null>(null);
  const [connections, setConnections] = useState<ConnectionLite[]>([]);
  const [candidates, setCandidates] = useState<ScopeCandidate[] | null>(null);
  const [scopeOpen, setScopeOpen] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const typewriterRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // 抽屉宽度可拖拽:跨源回答常是多列表格,420px 会把表头挤成竖排
  const [width, setWidth] = useState(() => {
    const saved = Number(localStorage.getItem(DRAWER_WIDTH_KEY));
    return saved >= DRAWER_MIN_W && saved <= DRAWER_MAX_W ? saved : DRAWER_DEFAULT_W;
  });
  const dragRef = useRef<{ startX: number; startW: number } | null>(null);
  // 顶边对齐:桌面端顶栏由「标题栏拖拽条 + Header」两段组成,高度按 DOM 实测,
  // 不写死(写死 top-14 会压在 Header 下半截上,就是错位的来源)。
  const [headerBottom, setHeaderBottom] = useState(HEADER_FALLBACK);
  const [topOffset, setTopOffset] = useState(() => {
    const saved = Number(localStorage.getItem(DRAWER_TOP_KEY));
    return Number.isFinite(saved) && saved >= 0 ? saved : 0;
  });
  const topDragRef = useRef<{ startY: number; startOffset: number } | null>(null);

  useEffect(() => {
    if (!open) return undefined;
    const measure = () => {
      const el = document.querySelector('.dq-layout-header-inner');
      setHeaderBottom(el ? Math.round(el.getBoundingClientRect().bottom) : HEADER_FALLBACK);
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [open]);

  const onTopGripDown = (e: React.MouseEvent) => {
    e.preventDefault();
    topDragRef.current = { startY: e.clientY, startOffset: topOffset };
    const onMove = (ev: MouseEvent) => {
      if (!topDragRef.current) return;
      const maxOffset = Math.max(
        0,
        window.innerHeight - headerBottom - DRAWER_MIN_H,
      );
      const next = Math.min(
        maxOffset,
        Math.max(0, topDragRef.current.startOffset + (ev.clientY - topDragRef.current.startY)),
      );
      setTopOffset(next);
    };
    const onUp = () => {
      topDragRef.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      setTopOffset((v) => {
        localStorage.setItem(DRAWER_TOP_KEY, String(v));
        return v;
      });
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const onGripDown = (e: React.MouseEvent) => {
    e.preventDefault();
    dragRef.current = { startX: e.clientX, startW: width };
    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      const next = Math.min(
        DRAWER_MAX_W,
        Math.max(DRAWER_MIN_W, dragRef.current.startW - (ev.clientX - dragRef.current.startX)),
      );
      setWidth(next);
    };
    const onUp = () => {
      dragRef.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      setWidth((w) => {
        localStorage.setItem(DRAWER_WIDTH_KEY, String(w));
        return w;
      });
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

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

  // 作用域跟随编辑器实时选择,直到用户在面板/@ 里手动定制过(此后独立演化,
  // 不回写编辑器)。全局单例抽屉与选表状态各自长活,"只播种一次"会让 scope
  // 永远停在首次打开时的选择上——用户换选了表,回答却还对着旧集合。
  const scopeCustomizedRef = useRef(false);
  const seedKey = JSON.stringify([
    selectedTables || [],
    (attachDatabases || []).map((d) => [d.alias, d.connectionId]),
  ]);
  useEffect(() => {
    if (!open || scopeCustomizedRef.current) return;
    const seeded: ScopeEntry[] = [localEntry(selectedTables || [])];
    for (const d of attachDatabases || []) {
      seeded.push({
        id: d.connectionId, kind: 'connection', label: d.alias, alias: d.alias,
        connectionId: d.connectionId, mode: 'all', tables: [],
      });
    }
    setScope(seeded);
    // seedKey 已涵盖 selectedTables/attachDatabases 的内容变化;直接依赖数组
    // 会因引用每轮变化而空转
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, seedKey]);

  // 连接清单:打开作用域面板或 @ 时才拉(只读结构,不加载数据)
  const needSources = scopeOpen || !!mentionMatch;
  useEffect(() => {
    if (!needSources || connections.length) return;
    listDatabaseConnections()
      .then((res) => setConnections(
        (res?.connections || []).map((c) => ({
          id: c.id, name: c.name, type: String(c.type),
        })),
      ))
      .catch(() => setConnections([]));
  }, [needSources, connections.length]);

  useEffect(() => {
    if (!mentionMatch || candidates !== null) return;
    loadScopeCandidates(connections).then(setCandidates).catch(() => setCandidates([]));
  }, [mentionMatch, candidates, connections]);

  if (!open) return null;

  const scopeEntries = scope ?? [localEntry(selectedTables || [])];
  const agentScope = buildAgentScopeContext(scopeEntries);
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
    const pending: DrawerMsg = {
      role: 'assistant',
      content: '',
      steps: [],
      // 快照发问那一刻的作用域(之后用户改作用域也不影响这条回答的可追溯性)
      scope: scopeEntries.map((e) => ({ label: scopeChipLabel(e), kind: e.kind })),
    };
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
            tables: agentScope.tables,
            attach_databases: agentScope.attachDatabases.map((d) => ({
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

  // 选中候选:加入作用域(远端表会连带授权它所属连接),并清掉输入框里的 @ 片段
  const pickMention = (cand: ScopeCandidate) => {
    scopeCustomizedRef.current = true;
    setScope((prev) => addCandidateToScope(prev ?? scopeEntries, cand, connections));
    setInput((prev) => prev.replace(MENTION_RE, '$1'));
  };

  const pickedRefs = new Set(scopeEntries.flatMap((e) => e.tables));
  const mentionCandidates =
    mentionMatch && candidates
      ? candidates
          .filter((c) => c.ref.toLowerCase().includes(mentionMatch[2].toLowerCase()))
          .filter((c) => !pickedRefs.has(c.ref))
          // 下拉容器可滚动;有界上限防超大工作区渲染过多 DOM,超出可继续输入过滤。
          .slice(0, 50)
      : [];
  // 按来源分组展示:本地表与各数据库的表同列可选
  const mentionGroups: { label: string; kind: 'local' | 'connection'; items: ScopeCandidate[] }[] = [];
  for (const c of mentionCandidates) {
    let g = mentionGroups.find((x) => x.label === c.sourceLabel);
    if (!g) {
      g = { label: c.sourceLabel, kind: c.kind, items: [] };
      mentionGroups.push(g);
    }
    g.items.push(c);
  }

  const toggleSource = (conn: ConnectionLite) => {
    scopeCustomizedRef.current = true;
    setScope((prev) => {
      const cur = prev ?? scopeEntries;
      return cur.some((e) => e.id === conn.id)
        ? cur.filter((e) => e.id !== conn.id)
        : [...cur, connectionEntry(conn, 'all')];
    });
  };

  const removeScopeEntry = (id: string) => {
    scopeCustomizedRef.current = true;
    setScope((prev) => (prev ?? scopeEntries).filter((e) => e.id !== id));
  };

  const knownAliases = scopeEntries.map((e) => e.alias).filter(Boolean) as string[];
  const sqlSources = (sql: string) => sqlSourcesFrom(sql, knownAliases);

  return (
    <div
      className="fixed right-0 bottom-0 z-40 flex max-w-[95vw] flex-col border-l border-t border-border bg-surface shadow-xl"
      style={{ width, top: headerBottom + topOffset }}
    >
      {/* 顶边拖拽把手:上下拖动改变抽屉起始位置(向下拖露出下方内容) */}
      <div
        onMouseDown={onTopGripDown}
        role="separator"
        aria-orientation="horizontal"
        aria-label={t('query.ai.resizeTop', '调整上边距')}
        className="group absolute left-0 right-0 top-0 z-50 h-1.5 -translate-y-1/2 cursor-row-resize"
      >
        <div className="my-auto h-0.5 w-full bg-transparent transition-colors group-hover:bg-primary/60" />
      </div>
      {/* 左缘拖拽把手:向左拖变宽 */}
      <div
        onMouseDown={onGripDown}
        role="separator"
        aria-orientation="vertical"
        aria-label={t('query.ai.resize', '调整宽度')}
        className="group absolute left-0 top-0 bottom-0 z-50 w-1.5 -translate-x-1/2 cursor-col-resize"
      >
        <div className="mx-auto h-full w-0.5 bg-transparent transition-colors group-hover:bg-primary/60" />
      </div>
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
                // 新对话 = 中断进行中的回答 + 清空上下文(多轮追问的信封随消息一起
                // 归零),作用域回到跟随编辑器选择的模式
                abortRef.current?.abort();
                clearTypewriter();
                setMessages([]);
                scopeCustomizedRef.current = false;
                setScope(null);
              }}
              title={t('query.ai.newChat', '新对话')}
              aria-label={t('query.ai.newChat', '新对话')}
            >
              <MessageSquarePlus className="h-4 w-4" />
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

      {/* 作用域常驻条:它是"能问什么"的前置条件,所以放在标题下方第一行 */}
      <div className="relative flex items-center gap-2 border-b border-border bg-surface-elevated px-3 py-1.5">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
          {scopeEntries.map((e) => (
            <span
              key={e.id}
              className="inline-flex items-center gap-1 rounded-full border border-primary/50 bg-primary/10 px-2 py-0.5 text-[11px] text-primary"
              title={e.mode === 'tables' && e.tables.length ? e.tables.join('\n') : undefined}
            >
              {scopeChipLabel(e)}
              {e.id !== LOCAL_SOURCE_ID && (
                <button
                  type="button"
                  onClick={() => removeScopeEntry(e.id)}
                  aria-label={t('query.ai.scopeRemove', '移出作用域')}
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </span>
          ))}
          <button
            type="button"
            onClick={() => setScopeOpen((v) => !v)}
            className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-2 py-0.5 text-[11px] text-muted-foreground hover:border-primary/50 hover:text-primary"
          >
            <Plus className="h-3 w-3" />
            {t('query.ai.scopeAdd', '添加数据源')}
          </button>
        </div>

        {scopeOpen && (
          <div className="absolute left-2 right-2 top-full z-30 mt-1 overflow-hidden rounded-md border border-border bg-surface-elevated shadow-lg">
            <div className="border-b border-border px-3 py-2">
              <div className="text-xs font-medium">{t('query.ai.scopeTitle', '选择问数范围')}</div>
              <div className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                {t(
                  'query.ai.scopePromise',
                  '只读取库结构（表名、字段名），不加载数据；取值一律通过带行数上限的只读查询。',
                )}
              </div>
            </div>
            <div className="max-h-56 overflow-auto p-1.5">
              {connections.length === 0 && (
                <div className="px-2 py-3 text-[11px] text-muted-foreground">
                  {t('query.ai.scopeNoConn', '还没有数据库连接；本地 DuckDB 表始终可问。')}
                </div>
              )}
              {connections.map((c) => {
                const on = scopeEntries.some((e) => e.id === c.id);
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => toggleSource(c)}
                    className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-accent ${
                      on ? 'text-primary' : ''
                    }`}
                  >
                    <Database className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate font-medium">{c.name}</span>
                    <span className="text-[10px] uppercase text-muted-foreground">{c.type}</span>
                    <span className="ml-auto text-[11px] text-muted-foreground">
                      {on ? t('query.ai.scopeInScope', '已加入') : t('query.ai.scopeJoin', '加入')}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="flex items-center gap-2 border-t border-border px-3 py-1.5">
              <span className="flex-1 text-[11px] text-muted-foreground">
                {t('query.ai.scopeFoot', '作用域只影响智能体能查什么，不改变左侧表格选择。')}
              </span>
              <Button size="sm" onClick={() => setScopeOpen(false)}>
                {t('common.done', '完成')}
              </Button>
            </div>
          </div>
        )}
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
                    <ScopeCard scope={m.scope} label={t('query.ai.scopeThisTurn', '本轮范围')} />
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
                        <div className="flex items-center gap-1.5 border-b border-border px-2 py-1 text-[10px] text-muted-foreground">
                          {sqlSources(m.sql).length > 1 && (
                            <span className="inline-flex items-center gap-1 rounded-full border border-primary/45 bg-primary/10 px-1.5 py-0.5 text-primary">
                              {t('query.ai.crossSource', '跨源查询 · {{list}}', {
                                list: sqlSources(m.sql).join(' × '),
                              })}
                            </span>
                          )}
                          <span className="ml-auto">
                            {t('query.ai.sqlExecuted', '本次实际执行的查询')}
                          </span>
                        </div>
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
                        {m.evidence.map((id) => {
                          const remote = id.includes('.');
                          return (
                            <span
                              key={id}
                              className="inline-flex items-center gap-1 rounded bg-background px-1 py-0.5 font-mono"
                            >
                              <span
                                className={`h-1.5 w-1.5 rounded-full ${
                                  remote ? 'bg-info' : 'bg-primary'
                                }`}
                              />
                              {id}
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* 输入区:高度恒定——快捷动作收进「＋」菜单,不再随编辑器有无 SQL 撑开/塌陷 */}
      <div className="relative border-t border-border p-2">
        {actionsOpen && (
          <div className="absolute bottom-[68px] left-2 z-30 min-w-[190px] overflow-hidden rounded-md border border-border bg-surface-elevated shadow-lg">
            <button
              type="button"
              disabled={!currentSql?.trim() || loading}
              onClick={() => {
                setActionsOpen(false);
                send(
                  `${t('query.ai.qaExplainLead', '请解释这段 SQL 在做什么（用中文，分点说明）：')}\n\`\`\`sql\n${(currentSql || '').trim()}\n\`\`\``,
                );
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-accent disabled:opacity-40"
            >
              <BookOpen className="h-3.5 w-3.5" />
              {t('query.ai.qaExplain', '解释当前 SQL')}
            </button>
            <button
              type="button"
              disabled={!currentSql?.trim() || loading}
              onClick={() => {
                setActionsOpen(false);
                send(
                  `${t('query.ai.qaOptimizeLead', '请帮我优化这段 SQL，并说明优化点和原因：')}\n\`\`\`sql\n${(currentSql || '').trim()}\n\`\`\``,
                );
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-accent disabled:opacity-40"
            >
              <Wand2 className="h-3.5 w-3.5" />
              {t('query.ai.qaOptimize', '优化建议')}
            </button>
            {!currentSql?.trim() && (
              <div className="border-t border-border px-3 py-1.5 text-[10px] text-muted-foreground">
                {t('query.ai.qaNeedSql', '编辑器里有 SQL 时可用')}
              </div>
            )}
          </div>
        )}
        <div className="relative">
          {mentionCandidates.length > 0 && (
            <div className="absolute bottom-full left-0 z-10 mb-1 max-h-56 w-full overflow-auto rounded-md border border-border bg-surface shadow-lg">
              {mentionGroups.map((g) => (
                <div key={g.label}>
                  <div className="flex items-center gap-1.5 bg-surface-elevated px-2 py-1 text-[10px] text-muted-foreground">
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        g.kind === 'local' ? 'bg-primary' : 'bg-info'
                      }`}
                    />
                    {g.label}
                  </div>
                  {g.items.map((c) => (
                    <button
                      key={c.ref}
                      type="button"
                      onClick={() => pickMention(c)}
                      className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-xs hover:bg-accent"
                    >
                      <span className="truncate font-mono text-[11px]">{c.display}</span>
                      {c.rowCount != null && (
                        <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
                          {c.kind === 'connection'
                            ? t('query.ai.mentionRowsApprox', '约 {{n}} 行', { n: c.rowCount })
                            : t('query.ai.mentionRows', '{{n}} 行', { n: c.rowCount })}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              ))}
              <div className="border-t border-border px-2 py-1 text-[10px] text-muted-foreground">
                {t('query.ai.mentionFoot', '选中数据库表会自动把该连接加入本轮范围')}
              </div>
            </div>
          )}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setActionsOpen((v) => !v)}
              title={t('query.ai.moreActions', '更多动作')}
              aria-label={t('query.ai.moreActions', '更多动作')}
              className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <Plus className="h-4 w-4" />
            </button>
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
