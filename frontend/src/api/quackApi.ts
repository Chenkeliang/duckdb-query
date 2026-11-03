import { apiClient, getFederatedQueryTimeout, normalizeResponse } from './client';
import type { QueryResponse } from './types';

export interface QuackService {
  id: string;
  name: string;
  uri: string;
  has_token: boolean;
  disable_ssl?: boolean | null;
  ssl_fingerprint?: string | null;
  timeout_seconds?: number;
  created_at?: string;
  updated_at?: string;
}

export interface QuackServiceInput {
  name: string;
  uri: string;
  /** Omit on update to retain the saved token. */
  token?: string;
  disable_ssl?: boolean | null;
  ssl_fingerprint?: string | null;
  timeout_seconds?: number;
}

export interface QuackTestResult {
  connected: boolean;
  message?: string;
  server_version?: string;
  application_read_only?: boolean;
  server_read_only_verified?: boolean;
}

export interface QuackCatalog {
  name: string;
  /** Actual remote catalog type, never inferred from its name. */
  type?: string;
}

export interface QuackSchema {
  name: string;
}

export interface QuackTable {
  name: string;
  type: string;
}

export interface QuackColumn {
  name: string;
  type: string;
  nullable?: boolean;
}

export interface QuackExecuteOptions {
  isPreview?: boolean;
  requestId?: string;
  signal?: AbortSignal;
}

const root = '/api/quack/services';
const servicePath = (id: string) => `${root}/${encodeURIComponent(id)}`;

export async function listQuackServices(): Promise<QuackService[]> {
  return normalizeResponse<{ items: QuackService[] }>(await apiClient.get(root)).data.items;
}

export async function createQuackService(input: QuackServiceInput): Promise<QuackService> {
  return normalizeResponse<QuackService>(await apiClient.post(root, input)).data;
}

export async function updateQuackService(id: string, input: QuackServiceInput): Promise<QuackService> {
  return normalizeResponse<QuackService>(await apiClient.put(servicePath(id), input)).data;
}

export async function deleteQuackService(id: string): Promise<void> {
  normalizeResponse(await apiClient.delete(servicePath(id)));
}

export async function testQuackService(input: QuackServiceInput): Promise<QuackTestResult> {
  return normalizeResponse<QuackTestResult>(await apiClient.post(`${root}/test`, input)).data;
}

export async function testSavedQuackService(id: string): Promise<QuackTestResult> {
  return normalizeResponse<QuackTestResult>(await apiClient.post(`${servicePath(id)}/test`)).data;
}

export async function getQuackCatalogs(id: string): Promise<QuackCatalog[]> {
  return normalizeResponse<{ items: QuackCatalog[] }>(await apiClient.get(`${servicePath(id)}/catalogs`)).data.items;
}

export async function getQuackSchemas(id: string, catalog: string): Promise<QuackSchema[]> {
  return normalizeResponse<{ items: QuackSchema[] }>(await apiClient.get(`${servicePath(id)}/schemas`, { params: { catalog } })).data.items;
}

export async function getQuackTables(id: string, catalog: string, schema: string): Promise<QuackTable[]> {
  return normalizeResponse<{ items: QuackTable[] }>(await apiClient.get(`${servicePath(id)}/tables`, { params: { catalog, schema } })).data.items;
}

export async function getQuackColumns(id: string, catalog: string, schema: string, table: string): Promise<QuackColumn[]> {
  return normalizeResponse<{ items: QuackColumn[] }>(await apiClient.get(`${servicePath(id)}/columns`, { params: { catalog, schema, table } })).data.items;
}

export async function executeQuackQuery(id: string, sql: string, options: QuackExecuteOptions = {}): Promise<QueryResponse> {
  const { signal, isPreview = true, requestId } = options;
  const response = await apiClient.post(`${servicePath(id)}/execute`, { sql, is_preview: isPreview, ...(requestId ? { request_id: requestId } : {}) }, {
    signal,
    timeout: getFederatedQueryTimeout(),
    ...(requestId ? { headers: { 'X-Request-ID': requestId } } : {}),
  });
  return { ...normalizeResponse<QueryResponse>(response).data, success: true };
}
