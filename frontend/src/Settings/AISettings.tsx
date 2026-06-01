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
  CardDescription,
  CardHeader,
  CardTitle,
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
import { useQueryClient } from '@tanstack/react-query';
import {
  getAiSettings,
  saveAiSettings,
  testProvider,
  type AiSettings,
  type AiProvider,
  type AiProviderType,
} from '@/api/aiApi';

const PROVIDER_TYPES: { value: AiProviderType; label: string }[] = [
  { value: 'openai', label: 'OpenAI' },
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'ollama', label: 'Ollama (本地)' },
  { value: 'openai_compatible', label: 'OpenAI 兼容' },
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
    <Card id="settings-ai">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <div>
              <CardTitle>{t('settings.ai.title', 'AI / 模型')}</CardTitle>
              <CardDescription>
                {t(
                  'settings.ai.description',
                  '配置 AI 供应商（云端或本地）。密钥仅存于服务端，默认关闭。'
                )}
              </CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-sm text-muted-foreground">
              {t('settings.ai.enable', '启用 AI')}
            </span>
            <Switch
              checked={s.enabled}
              onCheckedChange={(v) => update({ enabled: v })}
              aria-label={t('settings.ai.enable', '启用 AI')}
              className="border border-border data-[state=unchecked]:bg-muted"
            />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {s.providers.length === 0 && (
          <p className="text-sm text-muted-foreground">
            {t('settings.ai.empty', '还没有供应商，点下方「新增供应商」添加。')}
          </p>
        )}

        {s.providers.map((p) => {
          const isOpen = expandedId === p.id;
          const isDefault = s.default_provider === p.id;
          return (
            <div key={p.id} className="rounded-lg border">
              {/* 行头：始终可见的紧凑列表行 */}
              <div className="flex items-center gap-2 p-3">
                <button
                  type="button"
                  onClick={() => setExpandedId(isOpen ? null : p.id)}
                  className="flex items-center gap-2 flex-1 min-w-0 text-left"
                  aria-expanded={isOpen}
                >
                  <ChevronDown
                    className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${
                      isOpen ? '' : '-rotate-90'
                    }`}
                  />
                  <span className="font-medium text-sm truncate">{p.name || p.id}</span>
                  <span className="text-xs text-muted-foreground shrink-0">{p.type}</span>
                  {isDefault && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/15 text-primary shrink-0">
                      {t('settings.ai.default', '默认')}
                    </span>
                  )}
                  {!p.enabled && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground shrink-0">
                      {t('settings.ai.off', '已停用')}
                    </span>
                  )}
                </button>
                <div className="flex items-center gap-2 shrink-0">
                  {!isDefault && (
                    <Button
                      variant="ghost"
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
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    {t('settings.ai.enableShort', '启用')}
                    <Switch
                      checked={p.enabled}
                      onCheckedChange={(v) => updateProvider(p.id, { enabled: v })}
                      aria-label={t('settings.ai.providerEnable', '启用该供应商')}
                      className="border border-border data-[state=unchecked]:bg-muted"
                    />
                  </span>
                  <Button
                    variant="outline"
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
                  <Button variant="ghost" size="sm" onClick={() => removeProvider(p.id)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>

              {/* 编辑体：展开才显示 */}
              {isOpen && (
              <div className="border-t p-3 space-y-3">
              <div className="space-y-1">
                <Label className="text-xs">{t('settings.ai.providerName', '供应商名称')}</Label>
                <Input
                  value={p.name ?? ''}
                  onChange={(e) => updateProvider(p.id, { name: e.target.value })}
                  placeholder={t('settings.ai.providerNamePlaceholder', '供应商名称（自定义名称）')}
                  className="max-w-[280px]"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">{t('settings.ai.type', '类型')}</Label>
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
              <div className="space-y-1">
                <Label className="text-xs">{t('settings.ai.models', '模型（逗号分隔）')}</Label>
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
              {(p.type === 'ollama' || p.type === 'openai_compatible') && (
                <div className="space-y-1">
                  <Label className="text-xs">{t('settings.ai.baseUrl', '接口地址')}</Label>
                  <Input
                    value={p.base_url ?? ''}
                    onChange={(e) => updateProvider(p.id, { base_url: e.target.value || null })}
                    placeholder={
                      p.type === 'ollama' ? 'http://localhost:11434' : 'https://api.example.com/v1'
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
                </div>
              )}
              <div className="space-y-1">
                <Label className="text-xs">{t('settings.ai.apiKey', 'API Key')}</Label>
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
          <Button variant="outline" size="sm" onClick={addProvider}>
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
