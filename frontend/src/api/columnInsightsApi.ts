import { apiClient, normalizeResponse } from './client';
import type { PushdownInfo } from './types';

export type InsightAggregation = 'COUNT_ROWS' | 'COUNT' | 'COUNT_DISTINCT' | 'SUM' | 'AVG' | 'MIN' | 'MAX';
export type JsonExtractionType = 'VARCHAR' | 'BIGINT' | 'DOUBLE' | 'BOOLEAN' | 'DATE' | 'TIMESTAMP' | 'JSON';
export interface InsightTablePayload {
  table_name: string;
  attach_databases?: { alias: string; connection_id: string }[];
}
export interface InsightColumn {
  name: string;
  type: string;
  aggregations: InsightAggregation[];
  json_candidate: boolean;
}
export interface InsightMetric {
  column?: string;
  aggregation: InsightAggregation;
  alias: string;
}
export interface JsonExtraction {
  column: string;
  pointer: string;
  alias: string;
  target_type: JsonExtractionType;
}
export interface JsonPathsResult {
  paths: { pointer: string; types: string[]; occurrences: number }[];
  sampled_rows: number;
  valid_rows: number;
  skipped_rows: number;
  sample_limit: number;
  truncated: boolean;
}
export interface InsightQueryPayload extends InsightTablePayload {
  metrics?: InsightMetric[];
  extractions?: JsonExtraction[];
  filters?: unknown[];
  keep_original?: boolean;
}
export async function getColumnInsights(payload: InsightTablePayload): Promise<{ columns: InsightColumn[] }> {
  return normalizeResponse<{ columns: InsightColumn[] }>(await apiClient.post('/api/columns/insights', payload)).data;
}
export async function getJsonPaths(payload: InsightTablePayload & { column: string; filters?: unknown[] }): Promise<JsonPathsResult> {
  return normalizeResponse<JsonPathsResult>(await apiClient.post('/api/columns/json-paths', payload)).data;
}
export async function generateColumnInsightQuery(payload: InsightQueryPayload): Promise<{ sql: string; kind: 'metrics' | 'json'; columns: string[]; pushdown?: PushdownInfo | null }> {
  return normalizeResponse<{ sql: string; kind: 'metrics' | 'json'; columns: string[]; pushdown?: PushdownInfo | null }>(await apiClient.post('/api/columns/insight-query', payload)).data;
}
