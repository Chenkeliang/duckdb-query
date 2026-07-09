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
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { showErrorToast } from '@/utils/toastHelpers';
import { chat, type ChatMessage } from '@/api';
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
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages, loading]);

  if (!open) return null;

  const send = async (override?: string) => {
    const text = (override ?? input).trim();
    if (!text || loading) return;
    const next: ChatMessage[] = [...messages, { role: 'user', content: text }];
    setMessages(next);
    if (override == null) setInput('');
    setLoading(true);
    try {
      const r = await chat(next, { tables: selectedTables, attachDatabases, locale, currentSql });
      setMessages([...next, { role: 'assistant', content: r.content }]);
    } catch (e) {
      showErrorToast(t, e as Error, t('query.ai.chatFailed', 'AI 对话失败'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed right-0 top-14 bottom-0 z-40 flex w-[min(420px,92vw)] flex-col border-l border-border bg-surface shadow-xl">
      {/* 头 */}
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <span className="flex items-center gap-1.5 text-sm font-medium">
          <Sparkles className="h-4 w-4 text-primary" />
          {t('query.ai.chatTitle', '数据助手')}
        </span>
        <div className="flex items-center gap-1">
          {messages.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setMessages([])}
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
              'query.ai.chatEmpty',
              '问我关于这些表的任何问题，或让我帮你写查询。我知道你选中表的结构。',
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
                className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
                  isUser
                    ? 'rounded-tr-sm bg-primary text-primary-foreground'
                    : 'rounded-tl-sm bg-muted text-foreground'
                }`}
              >
                {isUser ? (
                  <p className="whitespace-pre-wrap">{m.content}</p>
                ) : (
                  <AssistantMarkdown
                    content={m.content}
                    onInsertSQL={onInsertSQL}
                    insertLabel={t('query.ai.insertToEditor', '插入编辑器')}
                  />
                )}
              </div>
            </div>
          );
        })}
        {loading && (
          <div className="flex flex-row gap-2">
            <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
              <Sparkles className="h-3.5 w-3.5" />
            </div>
            <div className="rounded-2xl rounded-tl-sm bg-muted px-3 py-2">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          </div>
        )}
      </div>

      {/* 输入区 */}
      <div className="border-t border-border p-2">
        {currentSql?.trim() && (
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
        <div className="flex items-center gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder={t('query.ai.chatPlaceholder', '问数据助手…（Enter 发送）')}
            disabled={loading}
          />
          <Button size="sm" disabled={loading || !input.trim()} onClick={() => send()}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
        <div className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground">
          <CornerDownLeft className="h-3 w-3" />
          {t('query.ai.chatHint', '生成的 SQL 可一键插入编辑器，绝不自动执行')}
        </div>
      </div>
    </div>
  );
}
