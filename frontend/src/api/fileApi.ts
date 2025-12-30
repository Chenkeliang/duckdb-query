/**
 * File API Module
 * 
 * Functions for file upload, URL import, and paste data operations.
 */

import { apiClient, uploadClient, handleApiError } from './client';
import type { UploadResponse, UploadProgress, ApiResponse } from './types';

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
        sheet_name: string;
        table_name: string;
        has_header?: boolean;
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
        return response.data;
    } catch (error) {
        throw handleApiError(error as never, '文件上传失败');
    }
}

/**
 * Upload file with enhanced options (target parameter)
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
        return response.data;
    } catch (error) {
        throw handleApiError(error as never, '文件上传失败');
    }
}

/**
 * Upload file directly to DuckDB
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
        return response.data;
    } catch (error) {
        throw error;
    }
}

// ==================== URL Import ====================

/**
 * Read data from URL and import to DuckDB
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
        return response.data;
    } catch (error) {
        throw handleApiError(error as never, 'URL导入失败');
    }
}

/**
 * Get URL file information (without importing)
 */
export async function getUrlInfo(url: string): Promise<{
    success: boolean;
    file_type?: string;
    size?: number;
    content_type?: string;
}> {
    try {
        const response = await apiClient.get(`/api/url-reader/info?url=${encodeURIComponent(url)}`);
        return response.data;
    } catch (error) {
        throw handleApiError(error as never, '获取URL信息失败');
    }
}

// ==================== Excel Operations ====================

/**
 * Inspect Excel file sheets
 */
export async function inspectExcelSheets(fileId: string): Promise<{
    success: boolean;
    sheets: ExcelSheet[];
}> {
    try {
        const response = await apiClient.post('/api/data-sources/excel/inspect', {
            file_id: fileId
        });
        return response.data;
    } catch (error) {
        throw handleApiError(error as never, '获取Excel工作表失败');
    }
}

/**
 * Import Excel sheets as tables
 */
export async function importExcelSheets(payload: ExcelImportPayload): Promise<{
    success: boolean;
    tables: Array<{ name: string; row_count: number }>;
}> {
    try {
        const response = await apiClient.post('/api/data-sources/excel/import', payload);
        return response.data;
    } catch (error) {
        throw handleApiError(error as never, 'Excel导入失败');
    }
}

// ==================== Server Files ====================

/**
 * Get server mount points
 */
export async function getServerMounts(): Promise<{
    success: boolean;
    mounts: ServerMount[];
}> {
    try {
        const response = await apiClient.get('/api/server-files/mounted');
        return response.data;
    } catch (error) {
        throw handleApiError(error as never, '获取服务器挂载点失败');
    }
}

/**
 * Browse server directory
 */
export async function browseServerDirectory(path: string): Promise<{
    success: boolean;
    items: ServerFileItem[];
    current_path: string;
}> {
    try {
        const response = await apiClient.get(`/api/server-files/browse?path=${encodeURIComponent(path)}`);
        return response.data;
    } catch (error) {
        throw handleApiError(error as never, '浏览服务器目录失败');
    }
}

/**
 * Import file from server
 */
export async function importServerFile(payload: {
    path: string;
    table_alias?: string;
}): Promise<UploadResponse> {
    try {
        const response = await apiClient.post('/api/server-files/import', payload);
        return response.data;
    } catch (error) {
        throw handleApiError(error as never, '服务器文件导入失败');
    }
}

// ==================== File Preview ====================

/**
 * Get file preview data
 */
export async function getFilePreview(
    filename: string,
    rows = 10
): Promise<{
    success: boolean;
    data: Record<string, unknown>[];
    columns: Array<{ name: string; type: string }>;
}> {
    try {
        const response = await apiClient.get(`/api/file_preview/${filename}?rows=${rows}`);
        return response.data;
    } catch (error) {
        throw error;
    }
}
