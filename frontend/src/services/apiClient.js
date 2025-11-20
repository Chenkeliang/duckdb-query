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

const extractMessage = (payload) => {
  if (!payload) return '';
  if (typeof payload === 'string') return payload;

  if (typeof payload.detail === 'string') {
    return payload.detail;
  }

  if (payload.detail && typeof payload.detail === 'object') {
    if (typeof payload.detail.message === 'string') {
      return payload.detail.message;
    }
    if (typeof payload.detail.detail === 'string') {
      return payload.detail.detail;
    }
  }

  if (payload.error) {
    if (typeof payload.error === 'string') {
      return payload.error;
    }
    if (typeof payload.error.message === 'string') {
      return payload.error.message;
    }
    if (payload.error.message && typeof payload.error.message.message === 'string') {
      return payload.error.message.message;
    }
  }

  if (typeof payload.message === 'string') {
    return payload.message;
  }

  if (payload.message && typeof payload.message.message === 'string') {
    return payload.message.message;
  }

  return '';
};

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
  const messageFromData = extractMessage(data);
  const codeFromData = data?.detail?.code || data?.error?.code;
  const detailsFromData = data?.detail?.details || data?.error?.details;

  const throwWithMessage = (fallbackMessage) => {
    const err = new Error(messageFromData || fallbackMessage);
    err.statusCode = status;
    if (codeFromData) {
      err.code = codeFromData;
    }
    if (detailsFromData) {
      err.details = detailsFromData;
    }
    throw err;
  };

  // 检查统一错误格式: data.detail = { code, message, details }
  if (data?.detail && typeof data.detail === 'object' && data.detail.code) {
    // 优先使用original_error，如果没有则使用message
    const errorMessage = data.detail.details?.original_error || data.detail.message || defaultMessage;
    const enhancedError = new Error(errorMessage);
    enhancedError.code = data.detail.code;
    enhancedError.details = data.detail.details;
    enhancedError.statusCode = status;
    throw enhancedError;
  }

  // 兼容旧格式: data.error.message = { code, message, details }
  if (data?.error && data.error.message && typeof data.error.message === 'object' && data.error.message.code) {
    const enhancedError = new Error(data.error.message.message || defaultMessage);
    enhancedError.code = data.error.message.code;
    enhancedError.details = data.error.message.details;
    enhancedError.statusCode = status;
    throw enhancedError;
  }



  // 根据状态码处理（简化版本，因为前面已经处理了结构化错误）
  switch (status) {
    case 400:
      throwWithMessage('请求参数错误');
      break;
    case 401:
      throwWithMessage('认证失败，请重新登录');
      break;
    case 403:
      throwWithMessage('权限不足，无法执行此操作');
      break;
    case 404:
      throwWithMessage('请求的资源不存在');
      break;
    case 413:
      throwWithMessage('文件太大，请选择较小的文件');
      break;
    case 422:
      throwWithMessage('数据验证失败');
      break;
    case 500:
      throwWithMessage('服务器内部错误，请稍后重试');
      break;
    case 502:
      throwWithMessage('服务器网关错误，请稍后重试');
      break;
    case 503:
      throwWithMessage('服务暂时不可用，请稍后重试');
      break;
    default:
      throwWithMessage(defaultMessage);
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

export const performQuery = async (queryRequest) => {
  try {
    // 使用代理端点来自动转换请求格式
    const response = await apiClient.post('/api/query', queryRequest);
    return response.data;
  } catch (error) {
    // 如果是HTTP错误但有响应数据，检查是否是友好的错误格式
    if (error.response && error.response.data) {
      const errorData = error.response.data;

      // 兼容旧格式: 如果后端返回了结构化的错误信息，直接返回而不抛出异常
      if (errorData.success === false && errorData.error) {
        return errorData;
      }
    }

    // 使用统一的错误处理函数
    handleApiError(error, '查询执行失败');
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

export const inspectExcelSheets = async (fileId) => {
  try {
    const response = await apiClient.post('/api/data-sources/excel/inspect', {
      file_id: fileId
    });
    return response.data;
  } catch (error) {
    handleApiError(error, '获取Excel工作表失败');
  }
};

export const importExcelSheets = async (payload) => {
  try {
    const response = await apiClient.post('/api/data-sources/excel/import', payload);
    return response.data;
  } catch (error) {
    handleApiError(error, 'Excel导入失败');
  }
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

export const refreshDatabaseConnection = async (connectionId) => {
  try {
    const response = await apiClient.post(`/api/database_connections/${connectionId}/refresh`);
    requestManager.clearCache('/api/database_connections', 'GET');
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
    // 使用统一的错误处理函数
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

export const fetchDuckDBTableSummaries = async () => {
  try {
    const response = await apiClient.get('/api/duckdb/tables');
    return response.data;
  } catch (error) {
    handleApiError(error, '获取表列表失败');
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

export const getDuckDBTableDetail = async (tableName) => {
  try {
    const encodedName = encodeURIComponent(tableName);
    const response = await apiClient.get(`/api/duckdb/tables/detail/${encodedName}`);
    return response.data;
  } catch (error) {
    handleApiError(error, '获取表元数据失败');
  }
};

export const refreshDuckDBTableMetadata = async (tableName) => {
  try {
    const encodedName = encodeURIComponent(tableName);
    const response = await apiClient.post(`/api/duckdb/table/${encodedName}/refresh`);
    return response.data;
  } catch (error) {
    handleApiError(error, '刷新表元数据失败');
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

export const getServerMounts = async () => {
  try {
    const response = await apiClient.get('/api/server_files/mounts');
    return response.data;
  } catch (error) {
    throw error;
  }
};

export const browseServerDirectory = async (path) => {
  try {
    const response = await apiClient.get('/api/server_files', {
      params: { path }
    });
    return response.data;
  } catch (error) {
    throw error;
  }
};

export const importServerFile = async (payload) => {
  try {
    const response = await apiClient.post('/api/server_files/import', payload);
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
export const submitAsyncQuery = async (payload) => {
  try {
    const requestBody = typeof payload === 'string' ? { sql: payload } : { ...(payload || {}) };

    if (!requestBody.sql || !requestBody.sql.trim()) {
      throw new Error('缺少SQL查询语句');
    }

    const response = await apiClient.post('/api/async_query', requestBody);
    return response.data;
  } catch (error) {
    throw error;
  }
};

export const cancelAsyncTask = async (taskId, payload = {}) => {
  try {
    const response = await apiClient.post(`/api/async_tasks/${taskId}/cancel`, payload);
    return response.data;
  } catch (error) {
    throw error;
  }
};

export const retryAsyncTask = async (taskId, payload = {}) => {
  try {
    const response = await apiClient.post(`/api/async_tasks/${taskId}/retry`, payload);
    return response.data;
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
// 应用配置特性
export const getAppFeatures = async () => {
  try {
    const response = await apiClient.get('/api/app-config/features');
    return response.data;
  } catch (error) {
    // 不抛出致命错误，返回合理默认值以保障前端可用
    return {
      enable_pivot_tables: true,
      pivot_table_extension: 'pivot_table',
      max_query_rows: 10000,
    };
  }
};
// Visual Query Builder API functions
const extractVisualQueryPayload = (configOrPayload, options = {}) => {
  if (configOrPayload && typeof configOrPayload === 'object' && configOrPayload.config) {
    const {
      config,
      pivotConfig,
      pivot_config,
      mode,
      includeMetadata,
      preview,
      limit,
    } = configOrPayload;

    const payload = {
      config,
      mode: mode || 'regular',
      include_metadata: includeMetadata !== undefined ? includeMetadata : true,
    };

    if (preview !== undefined) {
      payload.preview = preview;
    }

    if (limit !== undefined) {
      payload.limit = limit;
    }

    const resolvedPivot = pivotConfig || pivot_config;
    if (resolvedPivot) {
      payload.pivot_config = resolvedPivot;
    }

    const resolvedCastsOption = options.resolvedCasts || configOrPayload.resolvedCasts;
    if (resolvedCastsOption) {
      const castsArray = Object.entries(resolvedCastsOption)
        .filter(([column, cast]) => column && cast)
        .map(([column, cast]) => ({ column, cast }));
      if (castsArray.length > 0) {
        payload.resolved_casts = castsArray;
      }
    }

    return payload;
  }

  const payload = {
    config: configOrPayload,
    mode: options.mode || 'regular',
    include_metadata: options.includeMetadata !== undefined ? options.includeMetadata : true,
  };

  if (options.preview !== undefined) {
    payload.preview = options.preview;
  }

  if (options.limit !== undefined) {
    payload.limit = options.limit;
  }

  if (options.pivotConfig) {
    payload.pivot_config = options.pivotConfig;
  }

  if (options.resolvedCasts) {
    const castsArray = Object.entries(options.resolvedCasts)
      .filter(([column, cast]) => column && cast)
      .map(([column, cast]) => ({ column, cast }));
    if (castsArray.length > 0) {
      payload.resolved_casts = castsArray;
    }
  }

  return payload;
};

export const generateVisualQuery = async (configOrPayload, options = {}) => {
  try {
    const requestBody = extractVisualQueryPayload(configOrPayload, options);
    const response = await apiClient.post('/api/visual-query/generate', requestBody);
    return response.data;
  } catch (error) {
    handleApiError(error, '生成可视化查询失败');
  }
};

export const previewVisualQuery = async (configOrPayload, limit = 10, options = {}) => {
  try {
    const requestBody = extractVisualQueryPayload(configOrPayload, { ...options, limit });
    const response = await apiClient.post('/api/visual-query/preview', requestBody);
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

export const validateVisualQueryConfig = async (config) => {
  try {
    if (!config || typeof config !== 'object') {
      throw new Error('缺少验证配置参数');
    }

    const {
      config: visualConfig,
      columnProfiles = [],
      resolvedCasts = {},
    } = config;

    const castsArray = Object.entries(resolvedCasts)
      .filter(([column, cast]) => column && cast)
      .map(([column, cast]) => ({ column, cast }));

    const payload = {
      config: visualConfig,
      column_profiles: columnProfiles,
      resolved_casts: castsArray,
    };

    const response = await apiClient.post('/api/visual-query/validate', payload);
    return response.data;
  } catch (error) {
    handleApiError(error, '验证可视化查询配置失败');
  }
};

// 透视增强：获取列的去重 Top-N（可按频次/指标排序）
export const getDistinctValues = async (payload) => {
  try {
    const response = await apiClient.post('/api/visual-query/distinct-values', payload);
    return response.data;
  } catch (error) {
    handleApiError(error, '获取去重值失败');
  }
};
