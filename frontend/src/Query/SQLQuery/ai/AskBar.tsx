import { useState } from 'react';
import { Sparkles, Loader2, ArrowRight, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export interface AskBarProps {
  /** ready=已配置可问数; guide=已启用未配置,整行点击去设置 */
  mode: 'ready' | 'guide';
  loading?: boolean;
  usedTables?: string[];
  warning?: string;
  onSubmit: (question: string) => void;
  /** 清空：重置输入框 + 父级的 used-tables / 警告 */
  onClear?: () => void;
  onOpenSettings: () => void;
}

export function AskBar({
  mode,
  loading,
  usedTables = [],
  warning,
  onSubmit,
  onClear,
  onOpenSettings,
}: AskBarProps) {
  const { t } = useTranslation('common');
  const [q, setQ] = useState('');
  const hasContent = q.length > 0 || usedTables.length > 0 || Boolean(warning);
  const clear = () => {
    setQ('');
    onClear?.();
  };

  if (mode === 'guide') {
    return (
      <button
        type="button"
        onClick={onOpenSettings}
        className="flex w-full items-center gap-2 border-b px-3 py-2 text-sm text-muted-foreground hover:bg-accent/50"
      >
        <Sparkles className="h-4 w-4 text-primary" />
        <span>
          {t('query.ai.askGuide', '启用「问数」前,先到 设置 · AI/模型 配置一个供应商')}
        </span>
        <ArrowRight className="ml-auto h-4 w-4" />
      </button>
    );
  }

  const submit = () => {
    const v = q.trim();
    if (v && !loading) onSubmit(v);
  };

  return (
    <div className="border-b">
      <div className="flex items-center gap-2 px-3 py-2">
        <Sparkles className="h-4 w-4 shrink-0 text-primary" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
          }}
          placeholder={t('query.ai.askPlaceholder', '用自然语言描述你的查询…')}
          className="h-8 border-0 shadow-none focus-visible:ring-0"
          data-testid="ask-bar-input"
        />
        <Button size="sm" disabled={loading || !q.trim()} onClick={submit}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : t('query.ai.generate', '生成')}
        </Button>
        {hasContent && !loading && (
          <Button
            variant="ghost"
            size="sm"
            onClick={clear}
            aria-label={t('common.clear', '清空')}
            title={t('common.clear', '清空')}
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
      {warning && <div className="px-3 pb-2 text-xs text-warning">{warning}</div>}
      {usedTables.length > 0 && (
        <div className="flex flex-wrap items-center gap-1 px-3 pb-2 text-xs text-muted-foreground">
          <span>{t('query.ai.usedTables', '用了哪些表:')}</span>
          {usedTables.map((name) => (
            <span key={name} className="rounded bg-accent px-1.5 py-0.5">
              {name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
