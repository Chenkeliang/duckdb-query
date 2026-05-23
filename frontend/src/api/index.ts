/**
 * API Module - Public Exports
 *
 * This module provides typed API utilities as modular replacements for apiClient.js.
 * All API functions are now organized by domain with full TypeScript support.
 *
 * @example
 * import {
 *   executeDuckDBSQL,
 *   listDatabaseConnections,
 *   listConnectionSchemas,
 *   extractMessage,
 *   extractMessageCode,
 *   type ColumnInfo,
 *   type ApiError,
 * } from '@/api';
 */

// ==================== Client & Core ====================
export {
    apiClient,
    uploadClient,
    baseURL,
    setFederatedQueryTimeout,
    getFederatedQueryTimeout,
    extractMessage,
    extractMessageCode,
    getApiErrorCode,
    normalizeResponse,
    handleApiError,
    isStandardSuccess,
    isStandardList,
    isStandardError,
    type ApiError,
} from './client';

// ==================== Types ====================
export * from './types';

// ==================== Query API ====================
export {
    executeDuckDBSQL,
    executeFederatedQuery,
    saveQueryToDuckDB,
    cancelSyncQuery,
    parseFederatedQueryError,
    type ExecuteQueryOptions,
    type FederatedQueryOptions,
    type FederatedQueryError,
} from './queryApi';

// ==================== Join Query API ====================
export {
    performJoinQuery,
    type JoinQueryPerformRequest,
    type JoinQueryPerformResult,
    type JoinQueryDataSource,
    type JoinQueryJoin,
    type JoinQueryCondition,
    type JoinQueryAttachDatabase,
} from './joinQueryApi';

// ==================== Data Source API ====================
export {
    listDatabaseConnections,
    listDatabaseDataSourcesRaw,
    getDatabaseConnection,
    createDatabaseConnection,
    updateDatabaseConnection,
    deleteDatabaseConnection,
    testDatabaseConnection,
    testConnection,
    refreshDatabaseConnection,
    listAllDataSources,
    listDatabaseDataSources,
    listFileDataSources,
    type CreateConnectionRequest,
    type UpdateConnectionRequest,
    type DataSourceFilter,
    type RawDatabaseDataSourceItem,
} from './dataSourceApi';

// ==================== Upload API (subset of file API) ====================
export {
    uploadFile,
    uploadFileEnhanced,
    uploadFileAuto,
    uploadFileChunked,
    initChunkedUpload,
    uploadChunk,
    completeChunkedUpload,
    cancelChunkedUpload,
    CHUNKED_UPLOAD_THRESHOLD_BYTES,
} from './uploadApi';

// ==================== File API ====================
export {
    readFromUrl,
    getUrlInfo,
    inspectExcelSheets,
    importExcelSheets,
    getServerMounts,
    browseServerDirectory,
    importServerFile,
    inspectServerExcelSheets,
    importServerExcelSheets,
    pasteData,
    type FileImportMode,
    type UploadOptions,
    type UrlImportOptions,
    type ExcelSheet,
    type ExcelImportPayload,
    type ServerMount,
    type ServerFileItem,
    type ServerExcelSheet,
    type ServerExcelInspectResponse,
    type ServerExcelSheetConfig,
    type ServerExcelImportResponse,
    type PasteDataRequest,
    type PasteDataResponse,
} from './fileApi';

// ==================== Async Task API ====================
export {
    listAsyncTasks,
    getAsyncTask,
    submitAsyncQuery,
    cancelAsyncTask,
    retryAsyncTask,
    downloadAsyncResult,
    getConnectionPoolStatus,
    resetConnectionPool,
    getErrorStatistics,
    clearOldErrors,
    type ListTasksOptions,
    type ListTasksResponse,
    type DownloadOptions,
} from './asyncTaskApi';

// ==================== Table API ====================
export {
    getDuckDBTables,
    fetchDuckDBTableSummaries,
    getDuckDBTableDetail,
    deleteDuckDBTable,
    refreshDuckDBTableMetadata,
    getExternalTableDetail,
} from './tableApi';

// ==================== Database schemas (external connections) ====================
export {
    listConnectionSchemas,
    listSchemaTablesForConnection,
    listConnectionTablesFlat,
    type ConnectionSchemaItem,
    type ConnectionTableItem,
    type ExternalTableDetailsPayload,
} from './databaseSchemasApi';

// ==================== Settings (shortcuts) ====================
export {
    fetchShortcutsConfig,
    updateShortcutSetting,
    resetShortcutsSetting,
    type ShortcutRecordApi,
    type ShortcutsConfigPayload,
} from './settingsShortcutsApi';

// ==================== Set Operations API ====================
export {
    generateSetOperation,
    previewSetOperation,
    validateSetOperation,
    executeSetOperation,
    simpleUnionSetOperation,
    exportSetOperation,
    type SetOperationTypeApi,
    type SetOperationConfigPayload,
    type SetOperationRequestPayload,
    type SetOperationGenerateResult,
    type SetOperationPreviewResult,
    type SetOperationValidateResult,
    type SetOperationExecuteResult,
    type SimpleUnionSetOperationPayload,
    type SimpleUnionSetOperationResult,
    type SetOperationExportFormat,
    type SetOperationExportPayload,
    type SetOperationExportResult,
} from './setOperationsApi';

// ==================== Pivot API & SQL Favorites ====================
export {
    generatePivotQuery,
    previewPivotQuery,
    listSqlFavorites,
    getSqlFavorite,
    createSqlFavorite,
    updateSqlFavorite,
    deleteSqlFavorite,
    incrementFavoriteUsage,
    getAppConfig,
    type AppConfigResponse,
} from './pivotQueryApi';
