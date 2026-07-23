/**
 * File API Module
 * 
 * Functions for file upload, URL import, and paste data operations.
 * 
 * Updated to use normalizeResponse for standard API response handling.
 */

import { apiClient, uploadClient, handleApiError, normalizeResponse } from './client';
import type { UploadResponse, UploadProgress } from './types';

// ==================== Types ====================

/** 与后端 `import_mode` 一致：auto=先文本再安全定型，literal=全部 VARCHAR */
export type FileImportMode = 'auto' | 'literal' | 'variant';

export interface CsvUploadOptions {
    delimiter?: string;
    hasHeader?: boolean;
    encoding?: string;
}

export interface UploadOptions {
    tableAlias?: string;
    target?: 'duckdb' | 'memory';
    importMode?: FileImportMode;
    onProgress?: (progress: UploadProgress) => void;
    csvOptions?: CsvUploadOptions;
}

function appendImportMode(formData: FormData, importMode?: FileImportMode): void {
    formData.append('import_mode', importMode ?? 'auto');
}

export interface UrlImportOptions {
    hasHeader?: boolean;
    delimiter?: string;
    encoding?: string;
    importMode?: FileImportMode;
    /** false：对 http(s) 跳过 DuckDB/httpfs 直读，走下载后 ingest */
    preferNative?: boolean;
}

export interface ExcelSheet {
    name: string;
    index?: number;
    row_count?: number;
    default_table_name?: string;
}

export interface ExcelImportPayload {
    file_id: string;
    import_mode?: FileImportMode;
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
    /** 后端返回的是 label（来自 server_data_mounts 配置），非 name */
    label: string;
    path: string;
    exists?: boolean;
}

export interface ServerFileItem {
    name: string;
    path: string;
    type: 'file' | 'directory';
    size?: number;
    modified?: string;
    extension?: string;
    /** 后端权威的「可导入」标志（来自 SUPPORTED_FORMATS） */
    supported?: boolean;
    suggested_table_name?: string;
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
    appendImportMode(formData);

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
    const { tableAlias = null, target = 'duckdb', onProgress, importMode, csvOptions } = options;

    const formData = new FormData();
    formData.append('file', file);
    if (tableAlias) {
        formData.append('table_alias', tableAlias);
    }
    if (target) {
        formData.append('target', target);
    }
    appendImportMode(formData, importMode);

    // CSV options — only appended when the user explicitly set them
    if (csvOptions?.delimiter !== undefined) {
        formData.append('csv_delimiter', csvOptions.delimiter);
    }
    if (csvOptions?.hasHeader !== undefined) {
        formData.append('csv_has_header', String(csvOptions.hasHeader));
    }
    if (csvOptions?.encoding !== undefined) {
        formData.append('csv_encoding', csvOptions.encoding);
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

// ==================== Chunked Upload ====================

/** 超过此大小走分块上传（与单次 POST 并存） */
export const CHUNKED_UPLOAD_THRESHOLD_BYTES = 8 * 1024 * 1024;

const DEFAULT_CHUNK_SIZE_BYTES = 2 * 1024 * 1024;

export interface ChunkedUploadInitResult {
    upload_id: string;
    total_chunks: number;
    chunk_size: number;
}

export interface ChunkedUploadFileInfo {
    source_id?: string;
    filename?: string;
    row_count?: number;
    column_count?: number;
    columns?: unknown[];
    pending_excel?: UploadResponse['pending_excel'];
    message?: string;
    success?: boolean;
}

function mapChunkedFileInfoToUploadResponse(
    fileInfo: ChunkedUploadFileInfo
): UploadResponse {
    if (fileInfo.pending_excel) {
        return {
            success: true,
            requires_sheet_selection: true,
            pending_excel: fileInfo.pending_excel,
            message: fileInfo.message,
        };
    }
    const fileId = fileInfo.source_id;
    return {
        success: true,
        file_id: fileId,
        row_count: fileInfo.row_count,
        columns: fileInfo.columns,
        column_count: fileInfo.column_count,
    };
}

export async function initChunkedUpload(
    file: File,
    tableAlias: string | null = null,
    chunkSize = DEFAULT_CHUNK_SIZE_BYTES,
    importMode: FileImportMode = 'auto',
    csvOptions?: CsvUploadOptions
): Promise<ChunkedUploadInitResult> {
    const formData = new FormData();
    formData.append('file_name', file.name);
    formData.append('file_size', String(file.size));
    formData.append('chunk_size', String(chunkSize));
    if (tableAlias) {
        formData.append('table_alias', tableAlias);
    }
    appendImportMode(formData, importMode);
    if (csvOptions?.delimiter !== undefined) {
        formData.append('csv_delimiter', csvOptions.delimiter);
    }
    if (csvOptions?.hasHeader !== undefined) {
        formData.append('csv_has_header', String(csvOptions.hasHeader));
    }
    if (csvOptions?.encoding !== undefined) {
        formData.append('csv_encoding', csvOptions.encoding);
    }
    const response = await uploadClient.post('/api/upload/init', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
    });
    const normalized = normalizeResponse<ChunkedUploadInitResult>(response);
    return normalized.data;
}

export async function uploadChunk(
    uploadId: string,
    chunkNumber: number,
    chunkBlob: Blob
): Promise<{ progress: number }> {
    const formData = new FormData();
    formData.append('upload_id', uploadId);
    formData.append('chunk_number', String(chunkNumber));
    formData.append('chunk', chunkBlob, `chunk_${chunkNumber}`);
    const response = await uploadClient.post('/api/upload/chunk', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
    });
    const normalized = normalizeResponse<{ progress: number }>(response);
    return normalized.data;
}

export async function completeChunkedUpload(
    uploadId: string
): Promise<{ file_info: ChunkedUploadFileInfo }> {
    const formData = new FormData();
    formData.append('upload_id', uploadId);
    const response = await uploadClient.post('/api/upload/complete', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 600000,
    });
    const normalized = normalizeResponse<{ file_info: ChunkedUploadFileInfo }>(response);
    return normalized.data;
}

export async function cancelChunkedUpload(uploadId: string): Promise<void> {
    await uploadClient.delete(`/api/upload/cancel/${encodeURIComponent(uploadId)}`);
}

/**
 * 分块上传完整流程（init → chunk × N → complete）
 */
export async function uploadFileChunked(
    file: File,
    tableAlias: string | null = null,
    options: UploadOptions = {}
): Promise<UploadResponse> {
    const { onProgress } = options;
    let uploadId: string | null = null;
    try {
        const init = await initChunkedUpload(
            file,
            tableAlias,
            DEFAULT_CHUNK_SIZE_BYTES,
            options.importMode ?? 'auto',
            options.csvOptions
        );
        uploadId = init.upload_id;
        const chunkSize = init.chunk_size;

        for (let chunkNumber = 0; chunkNumber < init.total_chunks; chunkNumber++) {
            const start = chunkNumber * chunkSize;
            const end = Math.min(start + chunkSize, file.size);
            const blob = file.slice(start, end);
            const chunkResult = await uploadChunk(uploadId, chunkNumber, blob);
            onProgress?.({
                loaded: end,
                total: file.size,
                percent: Math.round(chunkResult.progress ?? (end / file.size) * 100),
            });
        }

        const complete = await completeChunkedUpload(uploadId);
        uploadId = null;
        return mapChunkedFileInfoToUploadResponse(complete.file_info);
    } catch (error) {
        if (uploadId) {
            try {
                await cancelChunkedUpload(uploadId);
            } catch {
                // ignore cleanup errors
            }
        }
        throw handleApiError(error as never, '分块文件上传失败');
    }
}

/**
 * 按文件大小自动选择单次上传或分块上传
 */
export async function uploadFileAuto(
    file: File,
    tableAlias: string | null = null,
    options: UploadOptions = {}
): Promise<UploadResponse> {
    if (file.size > CHUNKED_UPLOAD_THRESHOLD_BYTES) {
        return uploadFileChunked(file, tableAlias, options);
    }
    return uploadFileEnhanced(file, {
        tableAlias: tableAlias ?? undefined,
        target: options.target,
        importMode: options.importMode,
        onProgress: options.onProgress,
    });
}

// ==================== URL Import ====================

/** 与后端 `URLReadRequest`（url_reader.py）一致的请求体 */
interface ReadFromUrlRequestBody {
    url: string;
    table_alias: string;
    header?: boolean;
    delimiter?: string;
    encoding?: string;
    import_mode?: FileImportMode;
    prefer_native?: boolean;
}

/** `POST /api/read_from_url` 成功时 `data` 形状（见 docs/API_CONTRACT_FE_BE.md §5） */
interface ReadFromUrlData {
    table_name: string;
    row_count?: number;
    column_count?: number;
    columns?: unknown[];
    file_type?: string;
    url?: string;
    original_url?: string;
}

/**
 * Read data from URL and import to DuckDB
 *
 * @see docs/API_CONTRACT_FE_BE.md §5
 */
export async function readFromUrl(
    url: string,
    tableAlias: string,
    options: UrlImportOptions = {}
): Promise<UploadResponse & ReadFromUrlData> {
    try {
        const body: ReadFromUrlRequestBody = {
            url,
            table_alias: tableAlias,
            header: options.hasHeader ?? true,
            delimiter: options.delimiter,
            encoding: options.encoding,
            import_mode: options.importMode ?? 'auto',
            prefer_native: options.preferNative ?? true,
        };
        const response = await apiClient.post('/api/read_from_url', body);
        const normalized = normalizeResponse<ReadFromUrlData>(response);
        return {
            ...normalized.data,
            success: true,
        };
    } catch (error) {
        throw handleApiError(error as never, 'URL导入失败');
    }
}

/** `GET /api/url_info` 成功时 `data` 形状 */
interface UrlInfoData {
    file_type?: string;
    content_type?: string;
    content_length?: number | null;
    url?: string;
}

/**
 * Get URL file information (without importing)
 *
 * @see docs/API_CONTRACT_FE_BE.md §5
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
        const response = await apiClient.get(
            `/api/url_info?url=${encodeURIComponent(url)}`
        );
        const normalized = normalizeResponse<UrlInfoData>(response);
        const data = normalized.data;
        return {
            success: true,
            file_type: data.file_type,
            content_type: data.content_type,
            size: data.content_length ?? undefined,
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
    table_alias?: string | null;
    default_table_prefix?: string;
    messageCode?: string;
    message?: string;
}> {
    try {
        const response = await apiClient.post('/api/data-sources/excel/inspect', {
            file_id: fileId
        });
        const normalized = normalizeResponse<{
            sheets?: ExcelSheet[];
            table_alias?: string | null;
            default_table_prefix?: string;
        }>(response);
        return {
            success: true,
            sheets: normalized.data.sheets ?? [],
            table_alias: normalized.data.table_alias,
            default_table_prefix: normalized.data.default_table_prefix,
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
        // 后端返回的是 entries / path（旧字段 items / current_path 作兜底）
        const normalized = normalizeResponse<{
            entries?: ServerFileItem[];
            items?: ServerFileItem[];
            path?: string;
            current_path?: string;
        }>(response);
        return {
            success: true,
            items: normalized.data.entries ?? normalized.data.items ?? [],
            current_path: normalized.data.path ?? normalized.data.current_path ?? path,
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
    import_mode?: FileImportMode;
    csv_delimiter?: string;
    csv_has_header?: boolean;
    csv_encoding?: string;
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
        import_engine: 'duckdb' | 'rows';
    }>;
}

/**
 * Inspect Excel file on server
 * 
 * Returns normalized response with sheets info
 */
export async function inspectServerExcelSheets(
    path: string,
    tableAlias?: string | null
): Promise<ServerExcelInspectResponse> {
    try {
        const body: { path: string; table_alias?: string } = { path };
        if (tableAlias?.trim()) {
            body.table_alias = tableAlias.trim();
        }
        const response = await apiClient.post('/api/server-files/excel/inspect', body);
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
    sheets: ServerExcelSheetConfig[],
    importMode: FileImportMode = 'auto'
): Promise<ServerExcelImportResponse> {
    try {
        const response = await apiClient.post('/api/server-files/excel/import', {
            path,
            sheets,
            import_mode: importMode,
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

