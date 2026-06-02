/**
 * 轻量 SQL 片段展示（列表卡片等），避免每条历史都挂载 CodeMirror。
 */
import { cn } from '@/lib/utils';

export interface SQLSnippetProps {
  sql: string;
  className?: string;
  maxHeight?: string;
}

export function SQLSnippet({
  sql,
  className,
  maxHeight = '8rem',
}: SQLSnippetProps) {
  return (
    <div
      className={cn(
        'rounded-md border border-border/50 bg-muted/40 px-2 py-1.5',
        'text-xs font-mono text-muted-foreground whitespace-pre-wrap wrap-break-word overflow-hidden',
        className
      )}
      style={{ maxHeight }}
    >
      {sql}
    </div>
  );
}
