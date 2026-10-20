import { SettingsSectionHeader } from "./SettingsSectionHeader";
/**
 * AI / 模型 设置
 *
 * 维护多供应商（云端 / 本地 Ollama / 通用 OpenAI 兼容），密钥仅存服务端、写时上传、读时掩码。
 * 总开关默认关闭。
 */

import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Sparkles, Plus, Trash2, Plug, Loader2, ChevronDown } from 'lucide-react';

import {
  Card,
  CardContent,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { showSuccessToast, showErrorToast } from '@/utils/toastHelpers';
import { EmptyState } from '@/components/EmptyState';
import { cn } from '@/lib/utils';
import { useQueryClient } from '@tanstack/react-query';
import {
  getAiSettings,
  saveAiSettings,
  testProvider,
  type AiSettings,
  type AiProvider,
  type AiProviderType,
} from '@/api';

const PROVIDER_TYPES: { value: AiProviderType; label: string }[] = [
  { value: 'openai', label: 'OpenAI' },
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'ollama', label: 'Ollama (本地)' },
  { value: 'openai_compatible', label: 'OpenAI 兼容' },
  { value: 'anthropic_compatible', label: 'Anthropic 兼容' },
];

export function AISettings() {
  const { t } = useTranslation();
  const [settings, setSettings] = React.useState<AiSettings | null>(null);
  const [maskedKeys, setMaskedKeys] = React.useState<Record<string, string>>({});
  const [saving, setSaving] = React.useState(false);
  const [testingId, setTestingId] = React.useState<string | null>(null);
  const [expandedId, setExpandedId] = React.useState<string | null>(null);
  const queryClient = useQueryClient();

  // 读取后：把可编辑 api_key 清空（留空=不变），掩码值另存用于占位提示
  const applyLoaded = React.useCallback((fresh: AiSettings) => {
    setMaskedKeys(Object.fromEntries(fresh.providers.map((p) => [p.id, p.api_key || ''])));
    setSettings({ ...fresh, providers: fresh.providers.map((p) => ({ ...p, api_key: '' })) });
  }, []);

  React.useEffect(() => {
    getAiSettings()
      .then(applyLoaded)
      .catch((e) => showErrorToast(t, e as Error, t('settings.ai.loadFailed', '获取 AI 设置失败')));
    // 仅挂载时加载一次。带上 t/applyLoaded 会因其 identity 变化重新拉取，
    // 把用户未保存的开关改动覆盖回服务端旧值（表现为"开了又自动关"）。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!settings) return null;
  const s = settings;

  const update = (patch: Partial<AiSettings>) =>
    setSettings((prev) => (prev ? { ...prev, ...patch } : prev));
  const updateProvider = (id: string, patch: Partial<AiProvider>) =>
    update({ providers: s.providers.map((p) => (p.id === id ? { ...p, ...patch } : p)) });

  const addProvider = () => {
    const id = `prov-${Date.now()}`;
    update({
      providers: [
        ...s.providers,
        { id, name: '', type: 'openai', base_url: null, api_key: '', models: [], enabled: true },
      ],
    });
    setExpandedId(id); // 新增后自动展开编辑
  };

  const removeProvider = (id: string) =>
    update({
      providers: s.providers.filter((p) => p.id !== id),
      default_provider: s.default_provider === id ? null : s.default_provider,
    });

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveAiSettings(s);
      showSuccessToast(t, undefined, t('settings.ai.saved', 'AI 设置已保存'));
      applyLoaded(await getAiSettings());
      // 让查询工作台的 useAiStatus / useAiEnabled 缓存失效，保存后立即生效（否则 staleTime 5min 内不刷新）
      queryClient.invalidateQueries({ queryKey: ['ai-settings'] });
    } catch (e) {
      showErrorToast(t, e as Error, t('settings.ai.saveFailed', '保存失败'));
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async (id: string) => {
    setTestingId(id);
    try {
      // 测试针对「已保存」配置，所以先静默保存当前表单（空 key 后端会保留原密钥），
      // 确保新加的供应商已落库，避免「资源不存在」。
      await saveAiSettings(s);
      const r = await testProvider(id);
      if (r.ok) {
        showSuccessToast(t, undefined, t('settings.ai.testOk', '连接成功'));
      } else {
        showErrorToast(t, undefined, t('settings.ai.testFail', '连接失败'));
      }
    } catch (e) {
      showErrorToast(t, e as Error, t('settings.ai.testFail', '连接失败'));
    } finally {
      setTestingId(null);
    }
  };

  return (
    <Card id="settings-ai" className="rounded-none border-0 bg-transparent shadow-none">
      <SettingsSectionHeader
        icon={Sparkles}
        title={<> {t('settings.ai.title', 'AI / 模型')} </>}
        description={<> {t(
                  'settings.ai.description',
                  '配置 AI 供应商（云端或本地）。密钥仅存于服务端，默认关闭。'
                )} </>}
        actions={<div className="flex items-center gap-2 shrink-0">
            <span className="text-sm text-muted-foreground">
              {t('settings.ai.enable', '启用 AI')}
            </span>
            <Switch
              checked={s.enabled}
              onCheckedChange={(v) => update({ enabled: v })}
              aria-label={t('settings.ai.enable', '启用 AI')}
              className="border border-border data-[state=unchecked]:bg-muted"
            />
          </div>}
      />
      <CardContent className="space-y-4 px-0 pb-0">
        {s.providers.length === 0 && (
          <EmptyState
            compact
            icon={Sparkles}
            title={t('settings.ai.empty', '还没有供应商，点下方「新增供应商」添加。')}
          />
        )}

        {s.providers.map((p) => {
          const isOpen = expandedId === p.id;
          const isDefault = s.default_provider === p.id;
          return (
            <div
              key={p.id}
              className={cn(
                '@container rounded-lg border border-border bg-background transition-colors',
                !p.enabled && !isDefault && 'opacity-60'
              )}
            >
              {/* 行头：始终可见的紧凑列表行 */}
              <div className="flex flex-wrap items-center gap-3 p-3">
                <button
                  type="button"
                  onClick={() => setExpandedId(isOpen ? null : p.id)}
                  className="flex min-h-8 min-w-0 basis-full flex-wrap items-center gap-2 text-left @2xl:basis-0 @2xl:flex-1"
                  aria-expanded={isOpen}
                >
                  <ChevronDown
                    className={cn(
                      'h-4 w-4 shrink-0 text-muted-foreground transition-transform',
                      isOpen ? '' : '-rotate-90'
                    )}
                  />
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-elevated font-mono text-xs font-semibold text-muted-foreground">
                    {(p.name || p.type || '?').slice(0, 2).toLowerCase()}
                  </span>
                  <span className="truncate text-sm font-semibold">{p.name || p.id}</span>
                  <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                    {p.type}
                  </span>
                  {isDefault && (
                    <span className="shrink-0 rounded border border-primary/30 bg-primary/15 px-1.5 py-0.5 text-[11px] font-medium text-primary">
                      {t('settings.ai.default', '默认')}
                    </span>
                  )}
                </button>
                <div className="flex w-full flex-wrap items-center justify-end gap-2 @2xl:w-auto @2xl:shrink-0">
                  {!isDefault && (
                    <Button
                      variant="subtle"
                      size="sm"
                      onClick={() =>
                        update({
                          enabled: true, // 顺手打开总开关，一键即用
                          default_provider: p.id,
                          providers: s.providers.map((q) =>
                            q.id === p.id ? { ...q, enabled: true } : q,
                          ),
                        })
                      }
                    >
                      {t('settings.ai.setDefault', '设为默认')}
                    </Button>
                  )}
                  <span
                    className={cn(
                      'inline-flex items-center gap-1.5 text-xs',
                      p.enabled ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'
                    )}
                  >
                    <span
                      className={cn(
                        'h-1.5 w-1.5 rounded-full',
                        p.enabled ? 'bg-emerald-500' : 'bg-muted-foreground/50'
                      )}
                    />
                    {p.enabled ? t('settings.ai.on', '已启用') : t('settings.ai.off', '已停用')}
                  </span>
                  <Switch
                    checked={p.enabled}
                    onCheckedChange={(v) => updateProvider(p.id, { enabled: v })}
                    aria-label={t('settings.ai.providerEnable', '启用该供应商')}
                    className="border border-border data-[state=unchecked]:bg-muted"
                  />
                  <Button
                    variant="subtle"
                    size="sm"
                    disabled={testingId === p.id}
                    onClick={() => handleTest(p.id)}
                  >
                    {testingId === p.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Plug className="h-4 w-4" />
                    )}
                    <span className="ml-1">{t('settings.ai.test', '测试')}</span>
                  </Button>
                  <Button variant="quiet" size="sm" aria-label={t('actions.delete')} onClick={() => removeProvider(p.id)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>

              {/* 编辑体：展开才显示 */}
              {isOpen && (
              <div className="border-t p-3 space-y-3">
              <div className="flex min-w-0 flex-col gap-1">
                <Label className="min-h-4 text-xs leading-4">{t('settings.ai.providerName', '供应商名称')}</Label>
                <Input
                  value={p.name ?? ''}
                  onChange={(e) => updateProvider(p.id, { name: e.target.value })}
                  placeholder={t('settings.ai.providerNamePlaceholder', '供应商名称（自定义名称）')}
                  className="max-w-[280px]"
                />
              </div>
              <div className="grid grid-cols-1 items-start gap-3 sm:grid-cols-2">
              <div className="flex min-w-0 flex-col gap-1">
                <Label className="min-h-4 text-xs leading-4">{t('settings.ai.type', '类型')}</Label>
                <Select
                  value={p.type}
                  onValueChange={(v) => updateProvider(p.id, { type: v as AiProviderType })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PROVIDER_TYPES.map((tp) => (
                      <SelectItem key={tp.value} value={tp.value}>
                        {tp.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex min-w-0 flex-col gap-1">
                <Label className="min-h-4 text-xs leading-4">{t('settings.ai.models', '模型（逗号分隔）')}</Label>
                <Input
                  value={p.models.join(', ')}
                  onChange={(e) =>
                    updateProvider(p.id, {
                      models: e.target.value.split(',').map((x) => x.trim()).filter(Boolean),
                    })
                  }
                  placeholder="gpt-4o-mini, gpt-4o"
                />
              </div>
              {(p.type === 'ollama' ||
                p.type === 'openai_compatible' ||
                p.type === 'anthropic_compatible') && (
                <div className="flex min-w-0 flex-col gap-1">
                  <Label className="min-h-4 text-xs leading-4">{t('settings.ai.baseUrl', '接口地址')}</Label>
                  <Input
                    value={p.base_url ?? ''}
                    onChange={(e) => updateProvider(p.id, { base_url: e.target.value || null })}
                    placeholder={
                      p.type === 'ollama'
                        ? 'http://localhost:11434'
                        : p.type === 'anthropic_compatible'
                          ? 'https://api.deepseek.com/anthropic'
                          : 'https://api.example.com/v1'
                    }
                  />
                  {p.type === 'openai_compatible' && (
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {t(
                        'settings.ai.baseUrlHint',
                        '只填到 /v1 为止，例如 https://api.xxx.com/v1。系统会自动追加 /chat/completions，请勿自行填写该后缀，也不要出现多余的 //。',
                      )}
                    </p>
                  )}
                  {p.type === 'anthropic_compatible' && (
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {t(
                        'settings.ai.baseUrlHintAnthropic',
                        '填写网关地址即可，末尾带不带 /v1 都行，系统会自动补 /v1/messages。例如 DeepSeek 填 https://api.deepseek.com/anthropic；留空则回退到官方 https://api.anthropic.com。',
                      )}
                    </p>
                  )}
                </div>
              )}
              <div className="flex min-w-0 flex-col gap-1">
                <Label className="min-h-4 text-xs leading-4">{t('settings.ai.apiKey', 'API Key')}</Label>
                <Input
                  type="password"
                  value={p.api_key ?? ''}
                  onChange={(e) => updateProvider(p.id, { api_key: e.target.value })}
                  placeholder={
                    maskedKeys[p.id]
                      ? t('settings.ai.keyKeep', '已配置 {{mask}}，留空则不变', {
                          mask: maskedKeys[p.id],
                        })
                      : t('settings.ai.keyEnter', '输入密钥')
                  }
                />
              </div>
              </div>
              </div>
              )}
            </div>
          );
        })}

        <div className="flex items-center justify-between">
          <Button variant="subtle" size="sm" onClick={addProvider}>
            <Plus className="h-4 w-4 mr-1" />
            {t('settings.ai.addProvider', '新增供应商')}
          </Button>
          <Button size="sm" disabled={saving} onClick={handleSave}>
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
            {t('settings.ai.save', '保存')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
