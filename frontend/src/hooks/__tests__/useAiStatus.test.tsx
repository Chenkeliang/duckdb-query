import { describe, it, expect } from 'vitest';
import { isFeatureConfigured } from '../useAiStatus';
import type { AiSettings } from '@/api/aiApi';

const base: AiSettings = {
  enabled: true,
  default_provider: 'p1',
  providers: [{ id: 'p1', type: 'openai', api_key: '****', models: ['gpt-4o-mini'], enabled: true }],
  features: {},
};

describe('isFeatureConfigured', () => {
  it('true when enabled + default provider resolves with a model', () => {
    expect(isFeatureConfigured(base, 'explain')).toBe(true);
  });

  it('false when master disabled', () => {
    expect(isFeatureConfigured({ ...base, enabled: false }, 'explain')).toBe(false);
  });

  it('false when provider disabled', () => {
    expect(isFeatureConfigured(
      { ...base, providers: [{ ...base.providers[0], enabled: false }] }, 'explain')).toBe(false);
  });

  it('false when provider has no models', () => {
    expect(isFeatureConfigured(
      { ...base, providers: [{ ...base.providers[0], models: [] }] }, 'explain')).toBe(false);
  });

  it('uses per-feature provider override when set', () => {
    const s: AiSettings = {
      ...base,
      default_provider: 'missing',
      features: { explain: { provider: 'p1', model: null } },
    };
    expect(isFeatureConfigured(s, 'explain')).toBe(true);
  });

  it('false for undefined settings', () => {
    expect(isFeatureConfigured(undefined, 'explain')).toBe(false);
  });
});
