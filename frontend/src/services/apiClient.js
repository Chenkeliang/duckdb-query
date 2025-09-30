import axios from 'axios';
import requestManager from '../utils/requestManager';

// 根据环境变量设置基础URL
// 在Docker环境中，使用相对路径通过nginx代理
const apiUrl = import.meta.env.VITE_API_URL || '';
const baseURL = (apiUrl === '' || apiUrl.includes('localhost:8000') || apiUrl.includes('your-api-url-in-production'))
  ? '' // 使用相对路径，通过nginx代理
  : apiUrl;

const apiClient = axios.create({
  baseURL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// 统一错误处理函数
const handleApiError = (error, defaultMessage = '操作失败') => {

  // 网络错误
  if (error.code === 'ECONNABORTED') {
    throw new Error('请求超时，请检查网络连接');
  }

  if (!error.response) {
    throw new Error('网络连接失败，请检查网络状态');
  }

  const { status, data } = error.response;

  // 检查新的错误格式: data.error.message = { code, message, details }
  if (data?.error && data.error.message && typeof data.error.message === 'object' && data.error.message.code) {
    const enhancedError = new Error(data.error.message.message || defaultMessage);
    enhancedError.code = data.error.message.code;
    enhancedError.details = data.error.message.details;
    enhancedError.statusCode = status;
    throw enhancedError;
  }

  // 优先处理结构化错误响应
  if (data?.detail && typeof data.detail === 'object' && data.detail.code) {
    const enhancedError = new Error(data.detail.message || defaultMessage);
    enhancedError.code = data.detail.code;
    enhancedError.details = data.detail.details;
    enhancedError.statusCode = status;
    throw enhancedError;
  }

  // 检查 data.message 格式的结构化错误响应
  if (data?.message && typeof data.message === 'object' && data.message.code) {
    const enhancedError = new Error(data.message.message || defaultMessage);
    enhancedError.code = data.message.code;
    enhancedError.details = data.message.details;
    enhancedError.statusCode = status;
    throw enhancedError;
  }

  // 根据状态码处理
  switch (status) {
    case 400:
      throw new Error(data?.error?.message?.message || data?.detail?.message || data?.message?.message || data?.detail || data?.message || '请求参数错误');
    case 401:
      throw new Error(data?.error?.message?.message || data?.detail?.message || data?.message?.message || data?.detail || data?.message || '认证失败，请重新登录');
    case 403:
      throw new Error(data?.error?.message?.message || data?.detail?.message || data?.message?.message || data?.detail || data?.message || '权限不足，无法执行此操作');
    case 404:
      throw new Error(data?.error?.message?.message || data?.detail?.message || data?.message?.message || data?.detail || data?.message || '请求的资源不存在');
    case 413:
      throw new Error(data?.error?.message?.message || data?.detail?.message || data?.message?.message || data?.detail || data?.message || '文件太大，请选择较小的文件');
    case 422:
      throw new Error(data?.error?.message?.message || data?.detail?.message || data?.message?.message || data?.detail || data?.message || '数据验证失败');
    case 500:
      throw new Error(data?.error?.message?.message || data?.detail?.message || data?.message?.message || data?.detail || data?.message || '服务器内部错误，请稍后重试');
    case 502:
      throw new Error('服务器网关错误，请稍后重试');
    case 503:
      throw new Error('服务暂时不可用，请稍后重试');
    default:
      throw new Error(data?.error?.message?.message || data?.detail?.message || data?.message?.message || data?.detail || data?.message || defaultMessage);
  }
};

export const uploadFile = async (file, tableAlias = null) => {
  const formData = new FormData();
  formData.append("file", file);
  if (tableAlias) {
    formData.append("table_alias", tableAlias);
  }

  try {
    const response = await apiClient.post("/api/upload", formData, {
      headers: {
        "Content-Type": "multipart/form-data",
      },
      timeout: 300000, // 5分钟超时
      maxContentLength: 100 * 1024 * 1024, // 100MB
      maxBodyLength: 100 * 1024 * 1024, // 100MB
    });
    return response.data;
  } catch (error) {
    handleApiError(error, "文件上传失败");
  }
};
export const connectDatabase = async (connectionParams) => {
  try {
    const response = await apiClient.post('/api/connect_database', connectionParams);
    return response.data;
  } catch (error) {
    handleApiError(error, '数据库连接失败');
  }
};

export const performQuery = async (queryRequest) => {
  try {
    // 使用代理端点来自动转换请求格式
    const response = await apiClient.post('/api/query', queryRequest);
    return response.data;
  } catch (error) {

    // 如果是HTTP错误但有响应数据，检查是否是友好的错误格式
    if (error.response && error.response.data) {
      const errorData = error.response.data;
      // 如果后端返回了结构化的错误信息，直接返回而不抛出异常
      if (errorData.success === false && errorData.error) {
        return errorData;
      }
    }

    handleApiError(error, '查询执行失败');
  }
};

export const downloadResults = async (queryRequest) => {
  try {

    // 使用下载代理端点来自动转换请求格式
    const response = await apiClient.post('/api/download_proxy', queryRequest, {
      responseType: 'blob',
      timeout: 300000, // 增加超时时间到300秒（5分钟）
    });

    // 验证响应
    if (!response.data || response.data.size === 0) {
      throw new Error('下载的文件为空');
    }


    // 生成带时间戳的文件名，避免缓存问题
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = `query_results_${timestamp}.xlsx`;

    // 创建下载链接
    const url = window.URL.createObjectURL(new Blob([response.data], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    }));

    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();

    // 清理
    setTimeout(() => {
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    }, 100);

    return true;
  } catch (error) {
    throw error;
  }
};

// MySQL配置管理
export const getMySQLConfigs = async () => {
  const response = await listDatabaseConnections();
  if (response.success) {
    return response.connections.filter(c => c.type === 'mysql');
  }
  return [];
};

export const saveMySQLConfig = async (config) => {
  const connectionData = { ...config, type: 'mysql' };
  return await createDatabaseConnection(connectionData);
};

export const deleteMySQLConfig = async (configId) => {
  return await deleteDatabaseConnection(configId);
};

// PostgreSQL配置管理
export const getPostgreSQLConfigs = async () => {
  const response = await listDatabaseConnections();
  if (response.success) {
    return response.connections.filter(c => c.type === 'postgresql');
  }
  return [];
};

export const savePostgreSQLConfig = async (config) => {
  const connectionData = { ...config, type: 'postgresql' };
  return await createDatabaseConnection(connectionData);
};

export const deletePostgreSQLConfig = async (configId) => {
  return await deleteDatabaseConnection(configId);
};

// 添加执行SQL查询的API函数
export const executeSQL = async (sql, datasource, is_preview = true) => {
  try {
    const response = await apiClient.post('/api/execute_sql', { sql, datasource, is_preview });
    return response.data;
  } catch (error) {
    throw error;
  }
};

// 删除本地文件API
export const deleteFile = async (filePath) => {
  try {
    const response = await apiClient.post('/api/delete_file', { path: filePath });
    return response.data;
  } catch (error) {
    throw error;
  }
};

// 文件管理增强API
export const getFilePreview = async (filename, rows = 10) => {
  try {
    const response = await apiClient.get(`/api/file_preview/${filename}?rows=${rows}`);
    return response.data;
  } catch (error) {
    throw error;
  }
};





// 数据库连接管理API
export const testDatabaseConnection = async (connectionData) => {
  try {
    const response = await apiClient.post('/api/database_connections/test', connectionData);
    return response.data;
  } catch (error) {
    throw error;
  }
};

export const createDatabaseConnection = async (connectionData) => {
  try {
    const response = await apiClient.post('/api/database_connections', connectionData);
    requestManager.clearCache('/api/database_connections', 'GET');
    return response.data;
  } catch (error) {
    throw error;
  }
};

export const listDatabaseConnections = async () => {
  try {
    // 使用请求管理器防止重复请求
    const data = await requestManager.getDatabaseConnections();
    return data;
  } catch (error) {
    throw error;
  }
};

export const getDatabaseConnection = async (connectionId) => {
  try {
    const response = await apiClient.get(`/api/database_connections/${connectionId}`);
    return response.data;
  } catch (error) {
    throw error;
  }
};

export const updateDatabaseConnection = async (connectionId, connectionData) => {
  try {
    const response = await apiClient.put(`/api/database_connections/${connectionId}`, connectionData);
    requestManager.clearCache('/api/database_connections', 'GET');
    return response.data;
  } catch (error) {
    throw error;
  }
};

export const deleteDatabaseConnection = async (connectionId) => {
  try {
    const response = await apiClient.delete(`/api/database_connections/${connectionId}`);
    requestManager.clearCache('/api/database_connections', 'GET');
    return response.data;
  } catch (error) {
    throw error;
  }
};

// 导出功能API
export const exportData = async (exportRequest) => {
  try {
    const response = await apiClient.post('/api/export', exportRequest);
    return response.data;
  } catch (error) {
    throw error;
  }
};

export const quickExport = async (exportRequest) => {
  try {
    // 转换为新的统一导出接口格式
    const universalRequest = {
      query_type: 'custom_sql',
      sql_query: exportRequest.sql || '',
      format: 'excel', // 默认Excel格式
      filename: exportRequest.filename,
      original_datasource: exportRequest.originalDatasource,
      fallback_data: exportRequest.fallback_data,
      fallback_columns: exportRequest.fallback_columns
    };

    const response = await apiClient.post('/api/export/universal', universalRequest, {
      responseType: 'blob'
    });
    return response;
  } catch (error) {
    throw error;
  }
};

export const getExportTaskStatus = async (taskId) => {
  try {
    const response = await apiClient.get(`/api/export/tasks/${taskId}`);
    return response.data;
  } catch (error) {
    throw error;
  }
};

export const downloadExportFile = async (taskId) => {
  try {
    const response = await apiClient.get(`/api/export/download/${taskId}`, {
      responseType: 'blob'
    });
    return response;
  } catch (error) {
    throw error;
  }
};

export const listExportTasks = async () => {
  try {
    const response = await apiClient.get('/api/export/tasks');
    return response.data;
  } catch (error) {
    throw error;
  }
};

export const deleteExportTask = async (taskId) => {
  try {
    const response = await apiClient.delete(`/api/export/tasks/${taskId}`);
    return response.data;
  } catch (error) {
    throw error;
  }
};

// SQL查询API
export const executeSqlQuery = async (sqlQuery) => {
  try {
    const response = await apiClient.post('/api/sql_query', { query: sqlQuery });
    return response.data;
  } catch (error) {
    throw error;
  }
};

// 保存查询结果为数据源
export const saveQueryResultAsDatasource = async (sql, datasourceName, originalDatasource) => {
  try {
    const response = await apiClient.post('/api/save_query_result_as_datasource', {
      sql,
      datasource_name: datasourceName,
      datasource: originalDatasource
    });
    return response.data;
  } catch (error) {
    throw error;
  }
};

// 获取可用表列表
export const getAvailableTables = async () => {
  try {
    const response = await apiClient.get('/api/available_tables');
    return response.data;
  } catch (error) {
    throw error;
  }
};

// 新架构API: 保存查询结果到DuckDB
export const saveQueryToDuckDB = async (sql, datasource, tableAlias, queryData = null) => {
  try {
    const requestData = {
      sql,
      datasource,
      table_alias: tableAlias
    };

    // 如果提供了查询数据，直接使用数据而不重新执行SQL
    if (queryData && queryData.length > 0) {
      requestData.query_data = queryData;
    }

    const response = await apiClient.post('/api/save_query_to_duckdb', requestData);
    return response.data;
  } catch (error) {
    throw error;
  }
};

// 新架构API: 获取DuckDB表列表
export const getDuckDBTables = async () => {
  try {
    const response = await apiClient.get('/api/duckdb_tables');
    return response.data;
  } catch (error) {
    throw error;
  }
};



// 删除DuckDB表
export const deleteDuckDBTable = async (tableName) => {
  try {
    const response = await apiClient.delete(`/api/duckdb_tables/${tableName}`);
    return response.data;
  } catch (error) {
    throw error;
  }
};

// 获取MySQL数据源列表
export const getMySQLDataSources = async () => {
  try {
    // 使用请求管理器防止重复请求
    const data = await requestManager.getDatabaseConnections();
    return data;
  } catch (error) {
    throw error;
  }
};

// 增强DuckDB API
export const executeDuckDBSQL = async (sql, saveAsTable = null, is_preview = true) => {
  try {
    const response = await apiClient.post('/api/duckdb/execute', {
      sql,
      save_as_table: saveAsTable,
      is_preview: is_preview
    });
    return response.data;
  } catch (error) {

    // 处理详细的错误响应
    if (error.response && error.response.data) {
      const data = error.response.data;

      // 检查新的错误格式: data.error.message = { code, message, details }
      if (data.error && data.error.message && typeof data.error.message === 'object' && data.error.message.code) {
        // 优先使用original_error，如果没有则使用message
        const errorMessage = data.error.message.details?.original_error || data.error.message.message || '查询执行失败';
        const enhancedError = new Error(errorMessage);
        enhancedError.code = data.error.message.code;
        enhancedError.details = data.error.message.details;
        enhancedError.statusCode = error.response.status;
        throw enhancedError;
      }

      // 检查 data.detail 格式（HTTPException 格式）
      if (data.detail && typeof data.detail === 'object' && data.detail.code) {
        // 优先使用original_error，如果没有则使用message
        const errorMessage = data.detail.details?.original_error || data.detail.message || '查询执行失败';
        const enhancedError = new Error(errorMessage);
        enhancedError.code = data.detail.code;
        enhancedError.details = data.detail.details;
        enhancedError.statusCode = error.response.status;
        throw enhancedError;
      }

      // 检查 data.message 格式（旧格式）
      if (data.message && typeof data.message === 'object' && data.message.code) {
        // 优先使用original_error，如果没有则使用message
        const errorMessage = data.message.details?.original_error || data.message.message || '查询执行失败';
        const enhancedError = new Error(errorMessage);
        enhancedError.code = data.message.code;
        enhancedError.details = data.message.details;
        enhancedError.statusCode = error.response.status;
        throw enhancedError;
      }

      // 检查字符串格式的错误信息（旧格式）
      if (data.detail && typeof data.detail === 'string') {
        const enhancedError = new Error(data.detail);
        enhancedError.statusCode = error.response.status;
        throw enhancedError;
      }
    }

    // 回退到通用错误处理
    handleApiError(error, '查询执行失败');
  }
};

export const uploadFileToDuckDB = async (file, tableAlias) => {
  try {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('table_alias', tableAlias);

    const response = await apiClient.post('/api/duckdb/upload-file', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      timeout: 300000, // 5分钟超时
    });
    return response.data;
  } catch (error) {
    throw error;
  }
};

export const getDuckDBTablesEnhanced = async (force = false) => {
  try {

    if (force) {
      // 强制刷新时，直接调用API，绕过防抖和缓存
      const response = await fetch('/api/duckdb/tables');
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const data = await response.json();
      return data;
    } else {
      // 使用请求管理器防止重复请求
      const data = await requestManager.getDuckDBTables();
      return data;
    }
  } catch (error) {
    throw error;
  }
};

export const deleteDuckDBTableEnhanced = async (tableName) => {
  try {
    const response = await apiClient.delete(`/api/duckdb/tables/${tableName}`);
    return response.data;
  } catch (error) {
    throw error;
  }
};

export const getDuckDBTableInfo = async (tableName) => {
  try {
    const response = await apiClient.get(`/api/duckdb/table/${tableName}/info`);
    return response.data;
  } catch (error) {
    throw error;
  }
};

// URL文件读取
export const readFromUrl = async (url, tableAlias, options = {}) => {
  try {
    const requestData = {
      url: url,
      table_alias: tableAlias,
      file_type: options.fileType || null,
      encoding: options.encoding || 'utf-8',
      delimiter: options.delimiter || ',',
      header: options.header !== false
    };

    const response = await apiClient.post('/api/read_from_url', requestData);
    return response.data;
  } catch (error) {
    throw error;
  }
};

// 获取URL文件信息
export const getUrlInfo = async (url) => {
  try {
    const response = await apiClient.get('/api/url_info', {
      params: { url }
    });
    return response.data;
  } catch (error) {
    throw error;
  }
};



// 异步任务API
export const listAsyncTasks = async () => {
  try {
    const response = await apiClient.get('/api/async_tasks');
    return response.data;
  } catch (error) {
    throw error;
  }
};

export const getAsyncTask = async (taskId) => {
  try {
    const response = await apiClient.get(`/api/async_tasks/${taskId}`);
    return response.data;
  } catch (error) {
    throw error;
  }
};

// 提交异步查询
export const submitAsyncQuery = async (sql) => {
  try {
    const response = await apiClient.post('/api/async_query', { sql });
    return response.data;
  } catch (error) {
    throw error;
  }
};

export const downloadAsyncTaskResult = async (taskId) => {
  try {
    const response = await apiClient.get(`/api/async_tasks/${taskId}/result`, {
      responseType: 'blob'
    });

    // 获取文件名
    const contentDisposition = response.headers['content-disposition'];
    let filename = `task-${taskId}-result.parquet`;
    if (contentDisposition) {
      const filenameMatch = contentDisposition.match(/filename="(.+)"/);
      if (filenameMatch && filenameMatch[1]) {
        filename = filenameMatch[1];
      }
    }

    // 创建下载链接
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);

    return { success: true };
  } catch (error) {
    throw error;
  }
};

// 新增连接池状态监控API
export const getConnectionPoolStatus = async () => {
  try {
    const response = await apiClient.get('/api/duckdb/pool/status');
    return response.data;
  } catch (error) {
    throw error;
  }
};

export const resetConnectionPool = async () => {
  try {
    const response = await apiClient.post('/api/duckdb/pool/reset');
    return response.data;
  } catch (error) {
    throw error;
  }
};

// 新增错误统计API
export const getErrorStatistics = async () => {
  try {
    const response = await apiClient.get('/api/errors/statistics');
    return response.data;
  } catch (error) {
    throw error;
  }
};

export const clearOldErrors = async (days = 30) => {
  try {
    const response = await apiClient.post('/api/errors/clear', { days });
    return response.data;
  } catch (error) {
    throw error;
  }
};

// 新增数据库连接API
export const connectDatabaseEnhanced = async (connectionParams) => {
  try {
    const response = await apiClient.post('/api/database/connect', connectionParams);
    return response.data;
  } catch (error) {
    throw error;
  }
};

// 统一表管理接口
export const getAllTables = async () => {
  try {
    const response = await apiClient.get('/api/duckdb/tables');
    return response.data;
  } catch (error) {
    throw error;
  }
};

// 增强的文件上传接口（支持target参数）
export const uploadFileEnhanced = async (file, tableAlias = null, target = 'duckdb') => {
  const formData = new FormData();
  formData.append("file", file);
  if (tableAlias) {
    formData.append("table_alias", tableAlias);
  }
  formData.append("target", target);

  try {
    const response = await apiClient.post("/api/upload", formData, {
      headers: {
        "Content-Type": "multipart/form-data",
      },
      timeout: 300000, // 5分钟超时
      maxContentLength: 100 * 1024 * 1024, // 100MB
      maxBodyLength: 100 * 1024 * 1024, // 100MB
    });
    return response.data;
  } catch (error) {
    handleApiError(error, "文件上传失败");
  }
};

export default apiClient;
// Visual Query Builder API functions
export const generateVisualQuery = async (config) => {
  try {
    const response = await apiClient.post('/api/visual-query/generate', {
      config,
      preview: false,
      include_metadata: true
    });
    return response.data;
  } catch (error) {
    handleApiError(error, '生成可视化查询失败');
  }
};

export const previewVisualQuery = async (config, limit = 10) => {
  try {
    const response = await apiClient.post('/api/visual-query/preview', {
      config,
      limit
    });
    return response.data;
  } catch (error) {
    handleApiError(error, '预览可视化查询失败');
  }
};

export const getColumnStatistics = async (tableName, columnName) => {
  try {
    const response = await apiClient.get(`/api/visual-query/column-stats/${tableName}/${columnName}`);
    return response.data;
  } catch (error) {
    handleApiError(error, '获取列统计信息失败');
  }
};

export const getTableMetadata = async (tableName) => {
  try {
    const response = await apiClient.get(`/api/visual-query/table-metadata/${tableName}`);
    return response.data;
  } catch (error) {
    handleApiError(error, '获取表元数据失败');
  }
};

export const validateVisualQueryConfig = async (config) => {
  try {
    const response = await apiClient.post('/api/visual-query/validate', config);
    return response.data;
  } catch (error) {
    handleApiError(error, '验证可视化查询配置失败');
  }
};