import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlaskConical, X } from 'lucide-react';
import { IS_DEMO } from './isDemo';

/** 顶部 Demo 提示条:说明这是浏览器内试用,数据库与 AI 需自托管。正常构建不渲染。 */
export function DemoBanner() {
  const { t } = useTranslation('common');
  const [open, setOpen] = useState(true);
  if (!IS_DEMO || !open) return null;
  return (
    <div className="flex items-center gap-2 border-b border-primary/20 bg-primary/10 px-4 py-1.5 text-xs text-foreground">
      <FlaskConical className="h-3.5 w-3.5 shrink-0 text-primary" />
      <span className="truncate">
        {t(
          'demo.banner',
          '浏览器内 Demo(DuckDB-Wasm)· 已预置示例表,可直接写 SQL / JOIN / 出图。连数据库与 AI 需自托管版。',
        )}
      </span>
      <a
        href="https://github.com/Chenkeliang/duckdb-query"
        target="_blank"
        rel="noreferrer"
        className="ml-1 shrink-0 font-medium text-primary hover:underline"
      >
        {t('demo.viewGithub', '查看 GitHub →')}
      </a>
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="ml-auto shrink-0 text-muted-foreground hover:text-foreground"
        aria-label={t('common.close', '关闭')}
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
