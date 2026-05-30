import { Sparkles, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

export interface ExplainButtonProps {
  /** ready=已配置可解释; guide=已启用未配置,点击去设置 */
  mode: 'ready' | 'guide';
  loading?: boolean;
  onExplain: () => void;
  onOpenSettings: () => void;
}

export function ExplainButton({ mode, loading, onExplain, onOpenSettings }: ExplainButtonProps) {
  const { t } = useTranslation('common');
  const tip =
    mode === 'guide'
      ? t('query.ai.explainNeedConfig', '需先配置 AI 供应商')
      : t('query.ai.explainTooltip', '用大白话解释当前 SQL');
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            disabled={loading}
            onClick={mode === 'guide' ? onOpenSettings : onExplain}
            className="text-muted-foreground hover:text-foreground"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4 mr-1" />
            )}
            <span className="hidden sm:inline">{t('query.ai.explain', '解释')}</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>{tip}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
