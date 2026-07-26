/**
 * 范围编辑器里的一行数据源:模式切换(全部/全库 ↔ 选表)+ 可展开的逐表勾选。
 *
 * 从 AiChatDrawer 拆出来:抽屉本体已近千行,而这块自带搜索/加载/错误三态,
 * 混进去只会让两边都读不动。
 */
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronRight, Database, Loader2, RefreshCw, Table2 } from 'lucide-react';

import type { ScopeCandidate, ScopeEntry } from './agentScope';

/** 单源表清单渲染上限:超出靠搜索收窄,避免上千张表把 DOM 撑爆 */
const RENDER_CAP = 300;

export interface ScopeSourceRowProps {
  entry: ScopeEntry;
  /** 该来源的可选表;null = 尚未加载 */
  tables: ScopeCandidate[] | null;
  loading: boolean;
  failed: boolean;
  expanded: boolean;
  onToggleExpand: () => void;
  onReload: () => void;
  onSetMode: (mode: 'all' | 'tables') => void;
  onToggleTable: (ref: string) => void;
  onPickAll: (refs: string[]) => void;
  onClear: () => void;
}

export function ScopeSourceRow({
  entry,
  tables,
  loading,
  failed,
  expanded,
  onToggleExpand,
  onReload,
  onSetMode,
  onToggleTable,
  onPickAll,
  onClear,
}: ScopeSourceRowProps) {
  const { t } = useTranslation('common');
  const [q, setQ] = useState('');
  const isLocal = entry.kind === 'local';
  const picked = useMemo(() => new Set(entry.tables), [entry.tables]);

  useEffect(() => {
    if (!expanded) setQ('');
  }, [expanded]);

  const filtered = useMemo(() => {
    const list = tables || [];
    const kw = q.trim().toLowerCase();
    return kw ? list.filter((c) => c.ref.toLowerCase().includes(kw)) : list;
  }, [tables, q]);
  const shown = filtered.slice(0, RENDER_CAP);

  const allLabel = isLocal ? t('query.ai.scopeModeAll', '全部') : t('query.ai.scopeModeWhole', '全库');

  return (
    <div className="border-b border-border last:border-b-0">
      <div className="flex items-center gap-2 px-2 py-1.5">
        <button
          type="button"
          onClick={onToggleExpand}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
          aria-expanded={expanded}
        >
          <ChevronRight
            className={`h-3 w-3 shrink-0 text-muted-foreground transition-transform ${
              expanded ? 'rotate-90' : ''
            }`}
          />
          {isLocal ? (
            <Table2 className="h-3.5 w-3.5 shrink-0 text-primary" />
          ) : (
            <Database className="h-3.5 w-3.5 shrink-0 text-info" />
          )}
          <span className="truncate text-xs font-medium">{entry.label}</span>
          {entry.dbType && (
            <span className="shrink-0 rounded border border-border px-1 text-[9px] uppercase text-muted-foreground">
              {entry.dbType}
            </span>
          )}
        </button>
        {/* 模式开关:所见即所查的关键——一眼看出这个源是整库还是只问选中的表 */}
        <div className="flex shrink-0 overflow-hidden rounded border border-border text-[10px]">
          <button
            type="button"
            onClick={() => onSetMode('all')}
            className={`px-2 py-0.5 ${
              entry.mode === 'all' ? 'bg-primary/15 text-primary' : 'text-muted-foreground'
            }`}
          >
            {allLabel}
          </button>
          <button
            type="button"
            onClick={() => {
              onSetMode('tables');
              if (!expanded) onToggleExpand();
            }}
            className={`px-2 py-0.5 ${
              entry.mode === 'tables' ? 'bg-primary/15 text-primary' : 'text-muted-foreground'
            }`}
          >
            {entry.mode === 'tables' && entry.tables.length
              ? t('query.ai.scopeModePickedN', '选表 {{n}}', { n: entry.tables.length })
              : t('query.ai.scopeModePick', '选表')}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="px-2 pb-2 pl-7">
          {loading && (
            <div className="flex items-center gap-1.5 py-1.5 text-[11px] text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              {t('query.ai.scopeLoading', '正在读取表清单…')}
            </div>
          )}
          {failed && !loading && (
            <button
              type="button"
              onClick={onReload}
              className="flex items-center gap-1.5 py-1.5 text-[11px] text-destructive hover:underline"
            >
              <RefreshCw className="h-3 w-3" />
              {t('query.ai.scopeLoadFailed', '读取表清单失败，点此重试')}
            </button>
          )}
          {!loading && !failed && tables && (
            <>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={t('query.ai.scopeSearch', '搜索表…（共 {{n}} 张）', {
                  n: tables.length,
                })}
                className="mb-1.5 w-full rounded border border-border bg-background px-2 py-1 text-[11px] outline-none focus:border-primary/60"
              />
              <div className="mb-1 flex items-center gap-2.5 text-[10px]">
                <button
                  type="button"
                  className="text-primary hover:underline"
                  onClick={() => onPickAll(filtered.map((c) => c.ref))}
                >
                  {q.trim()
                    ? t('query.ai.scopePickFiltered', '选中筛选结果')
                    : t('query.ai.scopePickAll', '全选')}
                </button>
                <button type="button" className="text-primary hover:underline" onClick={onClear}>
                  {t('query.ai.scopeClear', '清空')}
                </button>
                <span className="text-muted-foreground">
                  {t('query.ai.scopePickedCount', '已选 {{n}} / {{total}}', {
                    n: entry.tables.length,
                    total: tables.length,
                  })}
                </span>
              </div>
              {entry.mode === 'all' && (
                <div className="mb-1 text-[10px] leading-relaxed text-muted-foreground">
                  {t(
                    'query.ai.scopeAllHint',
                    '当前是{{mode}}：整个来源都可问；勾选任意一张表即切换为「只问选中的表」。',
                    { mode: allLabel },
                  )}
                </div>
              )}
              <div className="max-h-40 overflow-auto">
                {shown.map((c) => {
                  const on = picked.has(c.ref);
                  return (
                    <button
                      key={c.ref}
                      type="button"
                      onClick={() => onToggleTable(c.ref)}
                      className="flex w-full items-center gap-2 rounded px-1 py-0.5 text-left hover:bg-accent"
                    >
                      <span
                        className={`grid h-3 w-3 shrink-0 place-items-center rounded-sm border text-[8px] text-primary-foreground ${
                          on ? 'border-primary bg-primary' : 'border-border'
                        }`}
                        aria-hidden
                      >
                        {on ? '✓' : ''}
                      </span>
                      <span className="truncate font-mono text-[11px]">{c.display}</span>
                      {/* 行数为 0/缺失时不显示:MySQL 拿不到统计元数据时会给 0,
                          照直渲染成"约 0 行"会读成"这些表都是空的" */}
                      {!!c.rowCount && (
                        <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
                          {c.kind === 'connection'
                            ? t('query.ai.mentionRowsApprox', '约 {{n}} 行', { n: c.rowCount })
                            : t('query.ai.mentionRows', '{{n}} 行', { n: c.rowCount })}
                        </span>
                      )}
                    </button>
                  );
                })}
                {!shown.length && (
                  <div className="py-1.5 text-[11px] text-muted-foreground">
                    {t('query.ai.scopeNoMatch', '没有匹配的表')}
                  </div>
                )}
                {filtered.length > shown.length && (
                  <div className="py-1 text-[10px] text-muted-foreground">
                    {t('query.ai.scopeMore', '还有 {{n}} 张，继续输入以缩小范围', {
                      n: filtered.length - shown.length,
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
