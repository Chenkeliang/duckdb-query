/**
 * AI 设置的接口地址字段可见性:anthropic_compatible 类型必须能填 base_url。
 *
 * 背景:后端 llm_client 的 /v1/messages 分支一直支持自定义 base_url,但设置面板
 * 此前只有 openai 一侧有"官方/兼容"两个类型,Anthropic 协议的第三方网关
 * (如 DeepSeek https://api.deepseek.com/anthropic)无法从界面配置。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

const { mocks } = vi.hoisted(() => ({
  mocks: {
    getAiSettings: vi.fn(),
    saveAiSettings: vi.fn(),
    testProvider: vi.fn(),
  },
}));

vi.mock('@/api', () => ({
  getAiSettings: mocks.getAiSettings,
  saveAiSettings: mocks.saveAiSettings,
  testProvider: mocks.testProvider,
}));
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));
vi.mock('@/utils/toastHelpers', () => ({
  showSuccessToast: vi.fn(),
  showErrorToast: vi.fn(),
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, defaultValue?: unknown) =>
      typeof defaultValue === 'string' ? defaultValue : key,
  }),
}));

import { AISettings } from '../AISettings';

const settingsWith = (type: string) => ({
  enabled: true,
  default_provider: 'p1',
  providers: [
    { id: 'p1', name: 'gw', type, base_url: null, api_key: '****', models: ['m'], enabled: true },
  ],
  features: {},
});

async function renderExpanded(type: string) {
  mocks.getAiSettings.mockResolvedValue(settingsWith(type));
  render(<AISettings />);
  // 头像与名称都渲染 "gw"，取名称那一处（后者）点开编辑体
  const rows = await screen.findAllByText('gw');
  fireEvent.click(rows[rows.length - 1]);
  await waitFor(() => expect(screen.getByText('API Key')).toBeInTheDocument());
}

describe('AISettings 接口地址字段', () => {
  beforeEach(() => vi.clearAllMocks());

  it('anthropic_compatible 类型渲染接口地址输入框与提示', async () => {
    await renderExpanded('anthropic_compatible');
    expect(
      screen.getByPlaceholderText('https://api.deepseek.com/anthropic'),
    ).toBeInTheDocument();
    expect(screen.getByText(/系统会自动补 \/v1\/messages/)).toBeInTheDocument();
  });

  it('anthropic(官方)与 openai 一样不渲染接口地址输入框', async () => {
    await renderExpanded('anthropic');
    expect(screen.queryByText('接口地址')).not.toBeInTheDocument();
  });

  it('openai 类型不渲染接口地址输入框', async () => {
    await renderExpanded('openai');
    expect(screen.queryByText('接口地址')).not.toBeInTheDocument();
  });
});
