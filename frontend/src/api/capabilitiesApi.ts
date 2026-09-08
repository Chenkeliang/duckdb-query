import { apiClient, handleApiError, normalizeResponse } from './client';

export type CapabilityStatus = 'supported' | 'blocked' | 'not-applicable';

export interface CapabilitySurface {
  status: CapabilityStatus;
  reason?: string;
}

export interface DuckDBExtensionIdentity {
  installed: boolean;
  loaded: boolean;
  version: string | null;
}

export interface DuckDBFeatureCapability {
  id: string;
  kind: string;
  engine: CapabilitySurface;
  direct_sql: CapabilitySurface;
  agent: CapabilitySurface;
  mcp: CapabilitySurface;
  extension: string | null;
}

export interface DuckDBCapabilityContract {
  contract_version: number;
  product_version: string;
  engine: {
    python_version: string;
    version: string;
    release_stage: 'preview' | 'stable';
    default_storage_version: string;
    platform: string;
    extensions: Record<string, DuckDBExtensionIdentity>;
  };
  optimizer_policy?: Record<
    string,
    { status: CapabilityStatus; reason_code: string | null; reason: string | null }
  >;
  features: DuckDBFeatureCapability[];
}

export async function getDuckDBCapabilities(): Promise<DuckDBCapabilityContract> {
  try {
    const response = await apiClient.get('/api/capabilities');
    return normalizeResponse<DuckDBCapabilityContract>(response).data;
  } catch (error) {
    throw handleApiError(error as never, 'Failed to load DuckDB capabilities');
  }
}
