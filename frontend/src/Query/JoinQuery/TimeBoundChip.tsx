import React from 'react';
import { useTranslation } from 'react-i18next';
import { Clock, ChevronDown } from 'lucide-react';

export interface TimeBoundChipProps {
  tableName: string;
  recommended: string;
  candidates: string[];
  onAdd: (column: string) => void;
}

/**
 * 联邦大表时间边界推荐芯片（展示组件）。
 * 单候选：点击即加 recommended。多候选：caret 打开候选列表，点列名加该列。
 */
export const TimeBoundChip: React.FC<TimeBoundChipProps> = ({
  tableName,
  recommended,
  candidates,
  onAdd,
}) => {
  const { t } = useTranslation('common');
  const [open, setOpen] = React.useState(false);
  const hasMultiple = candidates.length > 1;

  return (
    <div className="relative inline-flex items-center gap-1 my-1">
      <button
        type="button"
        data-testid={`time-bound-chip-${tableName}`}
        onClick={() => onAdd(recommended)}
        title={t('query.join.timeBound.tooltip', '给该表加近30天范围（落 ON 下推）').replace('{{column}}', recommended)}
        className="inline-flex items-center gap-1 rounded-full border border-warning/50 bg-warning/10 px-2 py-0.5 text-xs text-warning hover:bg-warning/20"
      >
        <Clock className="h-3 w-3" />
        <span>{t('query.join.timeBound.chip', '近30天')}</span>
        <span className="opacity-70">· {recommended}</span>
      </button>

      {hasMultiple && (
        <>
          <button
            type="button"
            data-testid={`time-bound-chip-menu-${tableName}`}
            onClick={() => setOpen((v) => !v)}
            aria-label={t('query.join.timeBound.pickColumn', '选择时间列')}
            className="rounded border border-border px-1 py-0.5 text-xs hover:bg-surface-hover"
          >
            <ChevronDown className="h-3 w-3" />
          </button>
          {open && (
            <div className="absolute top-full left-0 z-10 mt-1 min-w-32 rounded-md border border-border bg-surface shadow-md">
              {candidates.map((col) => (
                <button
                  key={col}
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    onAdd(col);
                  }}
                  className="block w-full px-3 py-1 text-left text-xs hover:bg-surface-hover"
                >
                  {col}
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
};
