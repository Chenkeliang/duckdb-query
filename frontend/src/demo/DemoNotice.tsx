import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Database, Sparkles, Copy, Check, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

const INSTALL_CMD =
  'git clone https://github.com/Chenkeliang/duckdb-query.git && cd duckdb-query && ./quick-start.sh';

/**
 * Demo 模式下替换「数据源 / AI」标签内容的升级引导面板。
 * 不藏功能,而是说明为何 Demo 里不可用 + 一键自托管,把好奇转成 install。
 */
export function DemoNotice({
  variant,
  onGoQuery,
}: {
  variant: 'datasource' | 'ai';
  onGoQuery?: () => void;
}) {
  const { t } = useTranslation('common');
  const [copied, setCopied] = useState(false);
  const isData = variant === 'datasource';
  const Icon = isData ? Database : Sparkles;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(INSTALL_CMD);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* 忽略剪贴板失败 */
    }
  };

  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="mx-auto max-w-xl rounded-xl border border-border bg-surface p-6 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/15 text-primary">
          <Icon className="h-6 w-6" />
        </div>
        <h2 className="mb-2 text-lg font-semibold text-foreground">
          {isData
            ? t('demo.dataTitle', '连接数据库 / 上传文件需自托管版')
            : t('demo.aiTitle', 'AI 功能需自托管版')}
        </h2>
        <p className="mb-4 text-sm leading-relaxed text-muted-foreground">
          {isData
            ? t(
                'demo.dataDesc',
                'Demo 已预置示例表(orders / users / products),去「查询工作台」即可直接写 SQL、跨表 JOIN、出图。想上传自己的文件或连 MySQL / PostgreSQL?自托管即可解锁。',
              )
            : t(
                'demo.aiDesc',
                '问数对话、报错医生、AI 图表推荐需要后端与你自己的模型 Key。自托管后在「AI 模型」里填入 Key 即可启用(默认关闭、不外传)。',
              )}
        </p>

        {isData && onGoQuery && (
          <Button variant="secondary" size="sm" className="mb-4" onClick={onGoQuery}>
            {t('demo.goQuery', '去查询示例表')}
            <ArrowRight className="ml-1 h-4 w-4" />
          </Button>
        )}

        <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-left">
          <code className="flex-1 overflow-x-auto whitespace-nowrap text-xs text-foreground">
            {INSTALL_CMD}
          </code>
          <button
            type="button"
            onClick={copy}
            className="shrink-0 text-muted-foreground hover:text-foreground"
            aria-label={t('common.copy', '复制')}
          >
            {copied ? <Check className="h-4 w-4 text-primary" /> : <Copy className="h-4 w-4" />}
          </button>
        </div>

        <a
          href="https://github.com/Chenkeliang/duckdb-query"
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-block text-xs font-medium text-primary hover:underline"
        >
          {t('demo.viewGithub', '查看 GitHub →')}
        </a>
      </div>
    </div>
  );
}
