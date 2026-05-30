/**
 * AI / 模型 设置
 *
 * 维护多供应商（云端 / 本地 Ollama / 通用 OpenAI 兼容），密钥仅存服务端、写时上传、读时掩码。
 * 总开关默认关闭。
 */

import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Sparkles, Plus, Trash2, Plug, Loader2 } from 'lucide-react';

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
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { showSuccessToast, showErrorToast } from '@/utils/toastHelpers';
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

  // 读取后：把可编辑 api_key 清空（留空=不变），掩码值另存用于占位提示
  const applyLoaded = React.useCallback((fresh: AiSettings) => {
    setMaskedKeys(Object.fromEntries(fresh.providers.map((p) => [p.id, p.api_key || ''])));
    setSettings({ ...fresh, providers: fresh.providers.map((p) => ({ ...p, api_key: '' })) });
  }, []);

  React.useEffect(() => {
    getAiSettings()
      .then(applyLoaded)
      .catch((e) => showErrorToast(t, e as Error, t('settings.ai.loadFailed', '获取 AI 设置失败')));
  }, [t, applyLoaded]);

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
        { id, type: 'openai', base_url: null, api_key: '', models: [], enabled: true },
      ],
    });
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
    } catch (e) {
      showErrorToast(t, e as Error, t('settings.ai.saveFailed', '保存失败'));
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async (id: string) => {
    setTestingId(id);
    try {
      const r = await testProvider(id);
      if (r.ok) {
        showSuccessToast(t, undefined, t('settings.ai.testOk', '连接成功'));
      } else {
        showErrorToast(t, undefined, t('settings.ai.testFail', '连接失败'));
      }
    } catch (e) {
      showErrorToast(t, e as Error, t('settings.ai.testFailSave', '连接失败，请先保存设置后再测试'));
    } finally {
      setTestingId(null);
    }
  };

  return (
    <Card>
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
          <Switch
            checked={s.enabled}
            onCheckedChange={(v) => update({ enabled: v })}
            aria-label={t('settings.ai.enable', '启用 AI')}
          />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {s.providers.length > 0 && (
          <div className="flex items-center gap-3">
            <Label className="w-24 shrink-0">{t('settings.ai.defaultProvider', '默认供应商')}</Label>
            <Select
              value={s.default_provider ?? undefined}
              onValueChange={(v) => update({ default_provider: v || null })}
            >
              <SelectTrigger className="max-w-xs">
                <SelectValue placeholder={t('settings.ai.pick', '选择')} />
              </SelectTrigger>
              <SelectContent>
                {s.providers.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.id}（{p.type}）
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <Separator />

        {s.providers.map((p) => (
          <div key={p.id} className="rounded-lg border p-3 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm">{p.id}</span>
                <Switch
                  checked={p.enabled}
                  onCheckedChange={(v) => updateProvider(p.id, { enabled: v })}
                />
              </div>
              <div className="flex items-center gap-2">
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
                    placeholder="http://localhost:11434"
                  />
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
        ))}

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
