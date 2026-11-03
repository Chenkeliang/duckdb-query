import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { QuackService } from '@/api/quackApi';
import { QuackServiceForm } from '../QuackServiceForm';

const api = vi.hoisted(() => ({ createQuackService: vi.fn(), updateQuackService: vi.fn(), deleteQuackService: vi.fn(), testQuackService: vi.fn(), testSavedQuackService: vi.fn(), listQuackServices: vi.fn(), getQuackCatalogs: vi.fn(), getQuackSchemas: vi.fn(), getQuackTables: vi.fn(), getQuackColumns: vi.fn() }));
vi.mock('@/api', () => api);
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
const service: QuackService = { id: 'q1', name: 'Team', uri: 'quack:host:9494', has_token: true, disable_ssl: true, ssl_fingerprint: null, timeout_seconds: 45 };

function view(saved?: QuackService) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const onSaved = vi.fn();
  render(<QueryClientProvider client={client}><QuackServiceForm service={saved} onSaved={onSaved} /></QueryClientProvider>);
  return { client, onSaved };
}

beforeEach(() => {
  vi.clearAllMocks();
  api.createQuackService.mockResolvedValue(service);
  api.updateQuackService.mockResolvedValue(service);
  api.testQuackService.mockResolvedValue({ connected: true });
  api.testSavedQuackService.mockResolvedValue({ connected: true });
});

describe('Quack credential and form regressions (2026-11-03)', () => {
  it('masks a new token and makes no connection until explicitly tested', async () => {
    view();
    const token = screen.getByLabelText('quack.token');
    expect(token).toHaveAttribute('type', 'password');
    expect(screen.queryByLabelText('quack.timeout')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('quack.name'), { target: { value: 'Team' } });
    fireEvent.change(screen.getByLabelText('quack.uri'), { target: { value: 'quack:host:9494' } });
    fireEvent.change(token, { target: { value: 'synthetic-secret' } });
    expect(api.testQuackService).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'quack.testConnection' }));
    await screen.findByText('quack.testSucceeded');
    expect(api.testQuackService).toHaveBeenCalledWith(expect.objectContaining({ token: 'synthetic-secret', uri: 'quack:host:9494' }));
    expect(api.createQuackService).not.toHaveBeenCalled();
  });

  it('keeps a saved token out of the DOM and omits blank token from updates', async () => {
    const { onSaved, client } = view(service);
    client.setQueryData(['quack-metadata', 'q1', 'catalogs'], [{ name: 'old' }]);
    expect(screen.getByLabelText('quack.token')).toHaveValue('');
    expect(screen.getByText('quack.tokenSaved')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('quack.name'), { target: { value: 'Renamed' } });
    fireEvent.click(screen.getByRole('button', { name: 'quack.saveChanges' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(service));
    const input = api.updateQuackService.mock.calls[0][1];
    expect(input).not.toHaveProperty('token');
    expect(input).toMatchObject({ name: 'Renamed', disable_ssl: true, timeout_seconds: 45 });
    expect(client.getQueryData(['quack-metadata', 'q1', 'catalogs'])).toBeUndefined();
  });

  it('tests unchanged saved credentials via the saved-service endpoint and clears stale success', async () => {
    view(service);
    fireEvent.click(screen.getByRole('button', { name: 'quack.testConnection' }));
    await screen.findByText('quack.testSucceeded');
    expect(api.testSavedQuackService).toHaveBeenCalledWith('q1');
    expect(api.testQuackService).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('quack.uri'), { target: { value: 'quack:new-host' } });
    expect(screen.queryByText('quack.testSucceeded')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'quack.testConnection' }));
    expect(screen.getByRole('alert')).toHaveTextContent('quack.saveBeforeTest');
    expect(api.testSavedQuackService).toHaveBeenCalledTimes(1);
  });

  it('rejects blank name and invalid scheme without sending any request', () => {
    view();
    fireEvent.click(screen.getByRole('button', { name: 'quack.saveService' }));
    expect(screen.getByRole('alert')).toHaveTextContent('quack.requiredName');
    fireEvent.change(screen.getByLabelText('quack.name'), { target: { value: 'Team' } });
    fireEvent.change(screen.getByLabelText('quack.uri'), { target: { value: 'mysql://host' } });
    fireEvent.click(screen.getByRole('button', { name: 'quack.testConnection' }));
    expect(screen.getByRole('alert')).toHaveTextContent('quack.invalidUri');
    expect(api.testQuackService).not.toHaveBeenCalled();
    expect(api.createQuackService).not.toHaveBeenCalled();
  });

  it('preserves advanced settings and requires retesting after changing a value', async () => {
    view(service);
    fireEvent.click(screen.getByRole('button', { name: 'quack.advanced' }));
    expect(screen.getByLabelText('quack.timeout')).toHaveValue(45);
    fireEvent.change(screen.getByLabelText('quack.token'), { target: { value: 'replacement' } });
    fireEvent.change(screen.getByLabelText('quack.timeout'), { target: { value: '60' } });
    fireEvent.click(screen.getByRole('button', { name: 'quack.testConnection' }));
    await screen.findByText('quack.testSucceeded');
    expect(api.testQuackService).toHaveBeenCalledWith(expect.objectContaining({ timeout_seconds: 60, token: 'replacement', disable_ssl: true }));
  });
});
