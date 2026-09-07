import { apiClient, handleApiError, normalizeResponse } from './client';

export interface BackupInspection {
  available: boolean;
  directory: string | null;
  files: Array<{name: string; present: boolean; readable: boolean; size_bytes: number; wal_present: boolean}>;
  error?: string | null;
}

export interface ResourceBudget {
  memory_limit_bytes: number;
  memory_capacity_bytes: number;
  temp_limit_bytes: number;
  max_connections: number;
  min_free_disk_bytes: number;
}

export async function inspectStorageBackup(): Promise<BackupInspection> {
  return normalizeResponse<BackupInspection>(await apiClient.get('/api/storage-upgrade/backup')).data;
}

export async function openStorageBackup(): Promise<void> {
  await apiClient.post('/api/storage-upgrade/open-backup');
}

export async function getResourceBudget(): Promise<ResourceBudget> {
  return normalizeResponse<ResourceBudget>(await apiClient.get('/api/resource-budget')).data;
}

export interface StorageDatabaseStatus {
  version: string;
  size_bytes: number;
  wal_size_bytes: number;
}

export interface StorageUpgradeReport {
  status: 'success' | 'failed';
  target_storage: string;
  started_at: string;
  completed_at: string;
  backup_directory?: string | null;
  error?: string;
  databases?: Record<string, { success: boolean }>;
}

export interface StorageUpgradeStatus {
  target_storage: string;
  required: boolean;
  pending_restart: boolean;
  main: StorageDatabaseStatus;
  system: StorageDatabaseStatus;
  required_bytes: number;
  free_bytes: number;
  active_queries: number;
  backup_directory?: string | null;
  last_report?: StorageUpgradeReport | null;
}

export async function getStorageUpgradeStatus(): Promise<StorageUpgradeStatus> {
  try {
    const response = await apiClient.get('/api/storage-upgrade');
    return normalizeResponse<StorageUpgradeStatus>(response).data;
  } catch (error) {
    throw handleApiError(error as never, 'Failed to load storage upgrade status');
  }
}

export async function scheduleStorageUpgrade(): Promise<StorageUpgradeStatus> {
  try {
    const response = await apiClient.post('/api/storage-upgrade/schedule', {
      confirm_backup: true,
      confirm_no_downgrade: true,
    });
    return normalizeResponse<StorageUpgradeStatus>(response).data;
  } catch (error) {
    throw handleApiError(error as never, 'Failed to schedule storage upgrade');
  }
}
