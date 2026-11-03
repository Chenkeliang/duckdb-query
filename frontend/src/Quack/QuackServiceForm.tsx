import { useId, useState, type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ChevronRight, Loader2 } from 'lucide-react';
import { testQuackService, testSavedQuackService, type QuackService, type QuackServiceInput } from '@/api';
import { useQuackServiceMutations } from '@/hooks/useQuackServices';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export interface QuackServiceFormProps {
  service?: QuackService;
  onSaved?: (service: QuackService) => void;
  onCancel?: () => void;
}

export function QuackServiceForm({ service, onSaved, onCancel }: QuackServiceFormProps) {
  const { t } = useTranslation('common');
  const prefix = useId();
  const [name, setName] = useState(service?.name ?? '');
  const [uri, setUri] = useState(service?.uri ?? '');
  const [token, setToken] = useState('');
  const [advanced, setAdvanced] = useState(false);
  const [disableSsl, setDisableSsl] = useState<boolean | null>(service?.disable_ssl ?? null);
  const [fingerprint, setFingerprint] = useState(service?.ssl_fingerprint ?? '');
  const [timeout, setTimeout] = useState(String(service?.timeout_seconds ?? 30));
  const [validation, setValidation] = useState('');
  const { create, update } = useQuackServiceMutations();
  const test = useMutation({
    mutationFn: (input: QuackServiceInput) => service && !input.token && savedSettingsUnchanged
      ? testSavedQuackService(service.id)
      : testQuackService(input),
  });
  const busy = create.isPending || update.isPending || test.isPending;
  const savedSettingsUnchanged = !!service && uri.trim() === service.uri && disableSsl === (service.disable_ssl ?? null)
    && fingerprint.trim() === (service.ssl_fingerprint ?? '') && Number(timeout) === (service.timeout_seconds ?? 30);
  const input: QuackServiceInput = {
    name: name.trim(), uri: uri.trim(), ...(token ? { token } : {}),
    disable_ssl: disableSsl, ssl_fingerprint: fingerprint.trim() || null, timeout_seconds: Number(timeout),
  };
  const saveError = create.error ?? update.error;

  const changed = () => {
    setValidation('');
    test.reset();
    create.reset();
    update.reset();
  };

  const validate = () => {
    if (!input.name) { setValidation(t('quack.requiredName')); return false; }
    if (!/^quack:\S+$/i.test(input.uri)) { setValidation(t('quack.invalidUri')); return false; }
    if (!Number.isInteger(input.timeout_seconds) || Number(timeout) < 1 || Number(timeout) > 600) { setValidation(t('quack.invalidTimeout')); return false; }
    setValidation('');
    return true;
  };

  const handleTest = () => {
    if (!validate()) return;
    if (service?.has_token && !token && !savedSettingsUnchanged) {
      setValidation(t('quack.saveBeforeTest'));
      return;
    }
    test.mutate(input);
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (busy || !validate()) return;
    const onSuccess = (saved: QuackService) => onSaved?.(saved);
    if (service) update.mutate({ id: service.id, input }, { onSuccess });
    else create.mutate(input, { onSuccess });
  };

  return <form onSubmit={submit} className="space-y-4">
    <p className="text-sm text-muted-foreground">{t('quack.formDescription')}</p>
    <div className="space-y-1.5">
      <Label htmlFor={`${prefix}-name`}>{t('quack.name')}</Label>
      <Input id={`${prefix}-name`} autoFocus value={name} disabled={busy} onChange={event => { changed(); setName(event.target.value); }} autoComplete="off" />
    </div>
    <div className="space-y-1.5">
      <Label htmlFor={`${prefix}-uri`}>{t('quack.uri')}</Label>
      <Input id={`${prefix}-uri`} value={uri} disabled={busy} onChange={event => { changed(); setUri(event.target.value); }} placeholder="quack:host:9494" autoComplete="off" spellCheck={false} className="font-mono" aria-describedby={`${prefix}-uri-hint`} />
      <p id={`${prefix}-uri-hint`} className="text-xs text-muted-foreground">{t('quack.uriHint')}</p>
    </div>
    <div className="space-y-1.5">
      <Label htmlFor={`${prefix}-token`}>{t('quack.token')}</Label>
      <Input id={`${prefix}-token`} type="password" value={token} disabled={busy} onChange={event => { changed(); setToken(event.target.value); }} autoComplete="new-password" aria-describedby={`${prefix}-token-hint`} />
      <p id={`${prefix}-token-hint`} className="text-xs text-muted-foreground">{t(service?.has_token ? 'quack.tokenSaved' : 'quack.tokenOptional')}</p>
    </div>
    {(validation || saveError || test.error) && <p role="alert" className="text-sm text-error">{validation || saveError?.message || test.error?.message || t('quack.operationFailed')}</p>}
    <div className="space-y-3">
      <Button type="button" variant="ghost" size="sm" aria-expanded={advanced} aria-controls={`${prefix}-advanced`} onClick={() => setAdvanced(!advanced)}><ChevronRight className={`size-3.5 ${advanced ? 'rotate-90' : ''}`} />{t('quack.advanced')}</Button>
      {advanced && <div id={`${prefix}-advanced`} className="space-y-3 border-l border-border pl-3">
        <div className="space-y-1.5"><Label htmlFor={`${prefix}-ssl`}>{t('quack.tls')}</Label><Select value={disableSsl === null ? 'default' : disableSsl ? 'disabled' : 'enabled'} onValueChange={value => { changed(); setDisableSsl(value === 'default' ? null : value === 'disabled'); }} disabled={busy}><SelectTrigger id={`${prefix}-ssl`}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="default">{t('quack.tlsDefault')}</SelectItem><SelectItem value="enabled">{t('quack.tlsEnabled')}</SelectItem><SelectItem value="disabled">{t('quack.tlsDisabled')}</SelectItem></SelectContent></Select></div>
        <div className="space-y-1.5"><Label htmlFor={`${prefix}-fingerprint`}>{t('quack.fingerprint')}</Label><Input id={`${prefix}-fingerprint`} value={fingerprint} disabled={busy} onChange={event => { changed(); setFingerprint(event.target.value); }} className="font-mono" autoComplete="off" spellCheck={false} /></div>
        <div className="space-y-1.5"><Label htmlFor={`${prefix}-timeout`}>{t('quack.timeout')}</Label><Input id={`${prefix}-timeout`} type="number" min={1} max={600} value={timeout} disabled={busy} onChange={event => { changed(); setTimeout(event.target.value); }} /></div>
      </div>}
    </div>
    {test.data && <p role="status" className={test.data.connected ? 'text-sm text-success' : 'text-sm text-error'}>{test.data.connected ? t('quack.testSucceeded') : t('quack.testFailed')}{test.data.message ? ` · ${test.data.message}` : ''}</p>}
    <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border pt-4">
      <Button type="button" variant="subtle" disabled={busy} onClick={handleTest}>{test.isPending && <Loader2 className="size-4 animate-spin" />}{t(test.isPending ? 'quack.testing' : 'quack.testConnection')}</Button>
      {onCancel && <Button type="button" variant="ghost" disabled={busy} onClick={onCancel}>{t('quack.cancel')}</Button>}
      <Button type="submit" disabled={busy}>{(create.isPending || update.isPending) && <Loader2 className="size-4 animate-spin" />}{t(service ? 'quack.saveChanges' : 'quack.saveService')}</Button>
    </div>
  </form>;
}
