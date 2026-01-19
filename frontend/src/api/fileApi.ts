/**
 * File API Module
 * 
 * Functions for file upload, URL import, and paste data operations.
 * 
 * Updated to use normalizeResponse for standard API response handling.
 */

import { apiClient, uploadClient, handleApiError, normalizeResponse } from './client';
import type { UploadResponse, UploadProgress, NormalizedResponse } from './types';

// ==================== Types ====================

export interface UploadOptions {
    tableAlias?: string;
    target?: 'duckdb' | 'memory';
    onProgress?: (progress: UploadProgress) => void;
}

export interface UrlImportOptions {
    hasHeader?: boolean;
    delimiter?: string;
    encoding?: string;
}

export interface ExcelSheet {
    name: string;
    index: number;
    row_count?: number;
}

export interface ExcelImportPayload {
    file_id: string;
    sheets: Array<{
        name: string;
        target_table: string;
        mode?: 'create' | 'append' | 'replace';
        header_rows?: number;
        header_row_index?: number | null;
        fill_merged?: boolean;
    }>;
}

export interface ServerMount {
    name: string;
    path: string;
    description?: string;
}

export interface ServerFileItem {
    name: string;
    path: string;
    type: 'file' | 'directory';
    size?: number;
    modified?: string;
}

// ==================== File Upload ====================

/**
 * Upload file to DuckDB
 * 
 * Returns normalized UploadResponse
 */
export async function uploadFile(
    file: File,
    tableAlias: string | null = null
): Promise<UploadResponse> {
    const formData = new FormData();
    formData.append('file', file);
    if (tableAlias) {
        formData.append('table_alias', tableAlias);
    }

    try {
        const response = await apiClient.post('/api/upload', formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
            timeout: 300000, // 5 minutes
            maxContentLength: 100 * 1024 * 1024, // 100MB
            maxBodyLength: 100 * 1024 * 1024,
        });
        const normalized = normalizeResponse<UploadResponse>(response);
        return {
            ...normalized.data,
            success: true,
        };
    } catch (error) {
        throw handleApiError(error as never, '文件上传失败');
    }
}

/**
 * Upload file with enhanced options (target parameter)
 * 
 * Returns normalized UploadResponse
 */
export async function uploadFileEnhanced(
    file: File,
    options: UploadOptions = {}
): Promise<UploadResponse> {
    const { tableAlias = null, target = 'duckdb', onProgress } = options;

    const formData = new FormData();
    formData.append('file', file);
    if (tableAlias) {
        formData.append('table_alias', tableAlias);
    }
    if (target) {
        formData.append('target', target);
    }

    try {
        const response = await uploadClient.post('/api/upload', formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
            timeout: 300000,
            maxContentLength: 100 * 1024 * 1024,
            maxBodyLength: 100 * 1024 * 1024,
            onUploadProgress: onProgress ? (event) => {
                if (event.total) {
                    onProgress({
                        loaded: event.loaded,
                        total: event.total,
                        percent: Math.round((event.loaded / event.total) * 100),
                    });
                }
            } : undefined,
        });
        const normalized = normalizeResponse<UploadResponse>(response);
        return {
            ...normalized.data,
            success: true,
        };
    } catch (error) {
        throw handleApiError(error as never, '文件上传失败');
    }
}

/**
 * Upload file directly to DuckDB
 * 
 * Returns normalized UploadResponse
 */
export async function uploadFileToDuckDB(
    file: File,
    tableAlias: string
): Promise<UploadResponse> {
    try {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('table_alias', tableAlias);

        const response = await apiClient.post('/api/duckdb/upload-file', formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
            timeout: 300000,
        });
        const normalized = normalizeResponse<UploadResponse>(response);
        return {
            ...normalized.data,
            success: true,
        };
    } catch (error) {
        throw error;
    }
}

// ==================== URL Import ====================

/**
 * Read data from URL and import to DuckDB
 * 
 * Returns normalized UploadResponse
 */
export async function readFromUrl(
    url: string,
    tableAlias: string,
    options: UrlImportOptions = {}
): Promise<UploadResponse> {
    try {
        const response = await apiClient.post('/api/url-reader/read', {
            url,
            table_alias: tableAlias,
            has_header: options.hasHeader ?? true,
            delimiter: options.delimiter,
            encoding: options.encoding,
        });
        const normalized = normalizeResponse<UploadResponse>(response);
        return {
            ...normalized.data,
            success: true,
        };
    } catch (error) {
        throw handleApiError(error as never, 'URL导入失败');
    }
}

/**
 * Get URL file information (without importing)
 * 
 * Returns normalized response with file info
 */
export async function getUrlInfo(url: string): Promise<{
    success: boolean;
    file_type?: string;
    size?: number;
    content_type?: string;
    messageCode?: string;
    message?: string;
}> {
    try {
        const response = await apiClient.get(`/api/url-reader/info?url=${encodeURIComponent(url)}`);
        const normalized = normalizeResponse<{ file_type?: string; size?: number; content_type?: string }>(response);
        return {
            success: true,
            ...normalized.data,
            messageCode: normalized.messageCode,
            message: normalized.message,
        };
    } catch (error) {
        throw handleApiError(error as never, '获取URL信息失败');
    }
}

// ==================== Excel Operations ====================

/**
 * Inspect Excel file sheets
 * 
 * Returns normalized response with sheets info
 */
export async function inspectExcelSheets(fileId: string): Promise<{
    success: boolean;
    sheets: ExcelSheet[];
    messageCode?: string;
    message?: string;
}> {
    try {
        const response = await apiClient.post('/api/data-sources/excel/inspect', {
            file_id: fileId
        });
        const normalized = normalizeResponse<{ sheets: ExcelSheet[] }>(response);
        return {
            success: true,
            sheets: normalized.data.sheets ?? [],
            messageCode: normalized.messageCode,
            message: normalized.message,
        };
    } catch (error) {
        throw handleApiError(error as never, '获取Excel工作表失败');
    }
}

/**
 * Import Excel sheets as tables
 * 
 * Returns normalized response with imported tables
 */
export async function importExcelSheets(payload: ExcelImportPayload): Promise<{
    success: boolean;
    tables: Array<{ name: string; row_count: number }>;
    messageCode?: string;
    message?: string;
}> {
    try {
        const response = await apiClient.post('/api/data-sources/excel/import', payload);
        const normalized = normalizeResponse<{ tables: Array<{ name: string; row_count: number }> }>(response);
        return {
            success: true,
            tables: normalized.data.tables ?? [],
            messageCode: normalized.messageCode,
            message: normalized.message,
        };
    } catch (error) {
        throw handleApiError(error as never, 'Excel导入失败');
    }
}

// ==================== Server Files ====================

/**
 * Get server mount points
 * 
 * Returns normalized response with mounts
 */
export async function getServerMounts(): Promise<{
    success: boolean;
    mounts: ServerMount[];
    messageCode?: string;
    message?: string;
}> {
    try {
        const response = await apiClient.get('/api/server-files/mounted');
        const normalized = normalizeResponse<{ mounts?: ServerMount[] }>(response);
        return {
            success: true,
            mounts: normalized.data.mounts ?? [],
            messageCode: normalized.messageCode,
            message: normalized.message,
        };
    } catch (error) {
        throw handleApiError(error as never, '获取服务器挂载点失败');
    }
}

/**
 * Browse server directory
 * 
 * Returns normalized response with directory items
 */
export async function browseServerDirectory(path: string): Promise<{
    success: boolean;
    items: ServerFileItem[];
    current_path: string;
    messageCode?: string;
    message?: string;
}> {
    try {
        const response = await apiClient.get(`/api/server-files/browse?path=${encodeURIComponent(path)}`);
        const normalized = normalizeResponse<{ items?: ServerFileItem[]; current_path?: string }>(response);
        return {
            success: true,
            items: normalized.data.items ?? [],
            current_path: normalized.data.current_path ?? path,
            messageCode: normalized.messageCode,
            message: normalized.message,
        };
    } catch (error) {
        throw handleApiError(error as never, '浏览服务器目录失败');
    }
}

/**
 * Import file from server
 * 
 * Returns normalized UploadResponse
 */
export async function importServerFile(payload: {
    path: string;
    table_alias?: string;
}): Promise<UploadResponse> {
    try {
        const response = await apiClient.post('/api/server-files/import', payload);
        const normalized = normalizeResponse<UploadResponse>(response);
        return {
            ...normalized.data,
            success: true,
        };
    } catch (error) {
        throw handleApiError(error as never, '服务器文件导入失败');
    }
}

// ==================== Server Excel Operations ====================

export interface ServerExcelSheet {
    name: string;
    rows: number;
    columns_count: number;
    has_merged_cells: boolean;
    suggested_header_rows: number;
    suggested_header_row_index: number;
    default_table_name: string;
    columns: Array<{ name: string; type: string }>;
    preview: Array<Record<string, unknown>>;
}

export interface ServerExcelInspectResponse {
    success: boolean;
    file_path: string;
    file_extension: string;
    default_table_prefix: string;
    sheets: ServerExcelSheet[];
}

export interface ServerExcelSheetConfig {
    name: string;
    target_table: string;
    header_rows?: number;
    header_row_index?: number | null;
    fill_merged?: boolean;
    mode?: 'create' | 'append' | 'replace';
}

export interface ServerExcelImportResponse {
    success: boolean;
    message: string;
    imported_tables: Array<{
        table_name: string;
        sheet_name: string;
        row_count: number;
        column_count: number;
        columns: string[];
        import_engine: 'duckdb' | 'pandas';
    }>;
}

/**
 * Inspect Excel file on server
 * 
 * Returns normalized response with sheets info
 */
export async function inspectServerExcelSheets(path: string): Promise<ServerExcelInspectResponse> {
    try {
        const response = await apiClient.post('/api/server-files/excel/inspect', { path });
        const normalized = normalizeResponse<ServerExcelInspectResponse>(response);
        return {
            ...normalized.data,
            success: true,
        };
    } catch (error) {
        throw handleApiError(error as never, '检查Excel工作表失败');
    }
}

/**
 * Import Excel sheets from server file
 * 
 * Returns normalized response with imported tables
 */
export async function importServerExcelSheets(
    path: string,
    sheets: ServerExcelSheetConfig[]
): Promise<ServerExcelImportResponse> {
    try {
        const response = await apiClient.post('/api/server-files/excel/import', {
            path,
            sheets,
        });
        const normalized = normalizeResponse<ServerExcelImportResponse>(response);
        return {
            ...normalized.data,
            success: true,
        };
    } catch (error) {
        throw handleApiError(error as never, '导入Excel工作表失败');
    }
}

// ==================== Paste Data ====================

export interface PasteDataRequest {
    table_name: string;
    column_names: string[];
    column_types: string[];
    data_rows: string[][];
    delimiter?: string;
    has_header?: boolean;
}

export interface PasteDataResponse {
    success: boolean;
    table_name?: string;
    row_count?: number;
    messageCode?: string;
    message?: string;
}

/**
 * Create table from pasted data
 *
 * Returns normalized response with table info
 */
export async function pasteData(request: PasteDataRequest): Promise<PasteDataResponse> {
    try {
        const response = await apiClient.post('/api/paste-data', request);
        const normalized = normalizeResponse<{ table_name?: string; row_count?: number }>(response);
        return {
            success: true,
            table_name: normalized.data.table_name,
            row_count: normalized.data.row_count,
            messageCode: normalized.messageCode,
            message: normalized.message,
        };
    } catch (error) {
        throw handleApiError(error as never, 'Paste data failed');
    }
}

// ==================== File Preview ====================

/**
 * Get file preview data
 * 
 * Returns normalized response with preview data
 */
export async function getFilePreview(
    filename: string,
    rows = 10
): Promise<{
    success: boolean;
    data: Record<string, unknown>[];
    columns: Array<{ name: string; type: string }>;
    messageCode?: string;
    message?: string;
}> {
    try {
        const response = await apiClient.get(`/api/file_preview/${filename}?rows=${rows}`);
        const normalized = normalizeResponse<{ data?: Record<string, unknown>[]; columns?: Array<{ name: string; type: string }> }>(response);
        return {
            success: true,
            data: normalized.data.data ?? [],
            columns: normalized.data.columns ?? [],
            messageCode: normalized.messageCode,
            message: normalized.message,
        };
    } catch (error) {
        throw error;
    }
}
