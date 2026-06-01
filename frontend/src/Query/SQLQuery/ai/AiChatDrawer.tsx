import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Send, X, Trash2, Loader2, Sparkles, CornerDownLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { showErrorToast } from '@/utils/toastHelpers';
import { chat, type ChatMessage } from '@/api/aiApi';

export interface AiChatDrawerProps {
  open: boolean;
  onClose: () => void;
  /** 选中表名，作为 schema 上下文 */
  selectedTables: string[];
  /** 把 assistant 给出的 SQL 插入编辑器 */
  onInsertSQL: (sql: string) => void;
  locale?: 'zh' | 'en';
}

type Part = { type: 'text' | 'sql'; value: string };

/** 把 assistant 文本拆成 文本段 / ```sql 代码块 段。 */
function parseAssistant(content: string): Part[] {
  const parts: Part[] = [];
  const re = /```(?:sql)?\s*\n?([\s\S]*?)```/gi;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    if (m.index > last) parts.push({ type: 'text', value: content.slice(last, m.index) });
    parts.push({ type: 'sql', value: m[1].trim() });
    last = m.index + m[0].length;
  }
  if (last < content.length) parts.push({ type: 'text', value: content.slice(last) });
  return parts.filter((p) => p.value.trim().length > 0);
}

export function AiChatDrawer({
  open,
  onClose,
  selectedTables,
  onInsertSQL,
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

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;
    const next: ChatMessage[] = [...messages, { role: 'user', content: text }];
    setMessages(next);
    setInput('');
    setLoading(true);
    try {
      const r = await chat(next, { tables: selectedTables, locale });
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
        {messages.map((m, i) => (
          <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
            <div
              className={
                m.role === 'user'
                  ? 'max-w-[85%] rounded-lg bg-primary/15 px-3 py-2 text-sm text-foreground'
                  : 'max-w-[92%] space-y-2 rounded-lg bg-muted px-3 py-2 text-sm text-foreground'
              }
            >
              {m.role === 'assistant'
                ? parseAssistant(m.content).map((p, j) =>
                    p.type === 'sql' ? (
                      <div key={j} className="rounded border border-border bg-background">
                        <pre className="overflow-auto px-2 py-1.5 text-xs">
                          <code>{p.value}</code>
                        </pre>
                        <div className="border-t border-border px-2 py-1 text-right">
                          <button
                            type="button"
                            onClick={() => onInsertSQL(p.value)}
                            className="text-xs text-primary hover:underline"
                          >
                            {t('query.ai.insertToEditor', '插入编辑器')}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p key={j} className="whitespace-pre-wrap leading-relaxed">
                        {p.value.trim()}
                      </p>
                    ),
                  )
                : <p className="whitespace-pre-wrap">{m.content}</p>}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="rounded-lg bg-muted px-3 py-2">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          </div>
        )}
      </div>

      {/* 输入区 */}
      <div className="border-t border-border p-2">
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
          <Button size="sm" disabled={loading || !input.trim()} onClick={send}>
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
