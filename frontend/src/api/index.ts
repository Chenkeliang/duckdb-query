/**
 * API Module - Public Exports
 * 
 * This module provides typed API utilities as modular replacements for apiClient.js.
 * All API functions are now organized by domain with full TypeScript support.
 * 
 * @example
 * // Import specific functions
 * import { executeDuckDBSQL, listDatabaseConnections } from '@/api';
 * 
 * // Import from specific modules
 * import { uploadFile, readFromUrl } from '@/api/fileApi';
 * import { listAsyncTasks, cancelAsyncTask } from '@/api/asyncTaskApi';
 * 
 * // Import types
 * import type { QueryRequest, DatabaseConnection, AsyncTask } from '@/api';
 */

// ==================== Client & Core ====================
export {
    apiClient,
    uploadClient,
    baseURL,
    setFederatedQueryTimeout,
    getFederatedQueryTimeout,
    extractMessage,
    handleApiError,
    type ApiError,
} from './client';

// ==================== Types ====================
export * from './types';

// ==================== Query API ====================
export {
    executeDuckDBSQL,
    executeFederatedQuery,
    executeExternalSQL,
    executeSQL,
    performQuery,
    saveQueryToDuckDB,
    saveQueryResultAsDatasource,
    parseFederatedQueryError,
    type ExecuteQueryOptions,
    type FederatedQueryOptions,
    type FederatedQueryError,
} from './queryApi';

// ==================== Data Source API ====================
export {
    listDatabaseConnections,
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
} from './dataSourceApi';

// ==================== File API ====================
export {
    uploadFile,
    uploadFileEnhanced,
    uploadFileToDuckDB,
    readFromUrl,
    getUrlInfo,
    inspectExcelSheets,
    importExcelSheets,
    getServerMounts,
    browseServerDirectory,
    importServerFile,
    getFilePreview,
    type UploadOptions,
    type UrlImportOptions,
    type ExcelSheet,
    type ExcelImportPayload,
    type ServerMount,
    type ServerFileItem,
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
    deleteDuckDBTableEnhanced,
    refreshDuckDBTableMetadata,
    getExternalTableDetail,
    getAvailableTables,
    getAllTables,
    getColumnStatistics,
    getDistinctValues,
} from './tableApi';

// ==================== Visual Query & Favorites API ====================
export {
    generateVisualQuery,
    previewVisualQuery,
    validateVisualQueryConfig,
    listSqlFavorites,
    getSqlFavorite,
    createSqlFavorite,
    updateSqlFavorite,
    deleteSqlFavorite,
    incrementFavoriteUsage,
    getAppFeatures,
} from './visualQueryApi';
