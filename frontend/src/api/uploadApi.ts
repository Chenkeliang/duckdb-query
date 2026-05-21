/**
 * 本地上传与分块上传 API（从 fileApi 拆分，经 index 统一导出）。
 */

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
    type FileImportMode,
    type UploadOptions,
} from './fileApi';
