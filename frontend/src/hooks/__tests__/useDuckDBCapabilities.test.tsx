import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { useDuckDBCapabilities } from '../useDuckDBCapabilities';

const getCapabilities = vi.hoisted(() => vi.fn());
vi.mock('@/api', () => ({ getDuckDBCapabilities: getCapabilities }));

describe('useDuckDBCapabilities', () => {
  it('loads the shared runtime capability contract', async () => {
    const contract = {
      contract_version: 2,
      product_version: '2.0.0',
      engine: { version: 'v2.0.0-alpha39998' },
      optimizer_policy: {},
      features: [],
    };
    getCapabilities.mockResolvedValue(contract);
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => useDuckDBCapabilities(), { wrapper });

    await waitFor(() => expect(result.current.data).toBe(contract));
    expect(getCapabilities).toHaveBeenCalledOnce();
  });
});
