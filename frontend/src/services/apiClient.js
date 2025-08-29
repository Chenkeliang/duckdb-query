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
  console.error('API Error:', error);

  // 网络错误
  if (error.code === 'ECONNABORTED') {
    throw new Error('请求超时，请检查网络连接');
  }

  if (!error.response) {
    throw new Error('网络连接失败，请检查网络状态');
  }

  const { status, data } = error.response;

  // 根据状态码处理
  switch (status) {
    case 400:
      throw new Error(data?.detail || data?.message || '请求参数错误');
    case 401:
      throw new Error('认证失败，请重新登录');
    case 403:
      throw new Error('权限不足，无法执行此操作');
    case 404:
      throw new Error('请求的资源不存在');
    case 413:
      throw new Error('文件太大，请选择较小的文件');
    case 422:
      throw new Error(data?.detail || '数据验证失败');
    case 500:
      throw new Error(data?.detail || '服务器内部错误，请稍后重试');
    case 502:
      throw new Error('服务器网关错误，请稍后重试');
    case 503:
      throw new Error('服务暂时不可用，请稍后重试');
    default:
      throw new Error(data?.detail || data?.message || defaultMessage);
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
    console.error('Error performing query:', error);

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
    console.log('开始下载查询结果...', queryRequest);

    // 使用下载代理端点来自动转换请求格式
    const response = await apiClient.post('/api/download_proxy', queryRequest, {
      responseType: 'blob',
      timeout: 300000, // 增加超时时间到300秒（5分钟）
    });

    // 验证响应
    if (!response.data || response.data.size === 0) {
      throw new Error('下载的文件为空');
    }

    console.log(`下载完成，文件大小: ${response.data.size} bytes`);

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

    console.log(`文件已下载: ${filename}`);
    return true;
  } catch (error) {
    console.error('Error downloading results:', error);
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
    console.error('执行SQL失败:', error);
    throw error;
  }
};

// 删除本地文件API
export const deleteFile = async (filePath) => {
  try {
    const response = await apiClient.post('/api/delete_file', { path: filePath });
    return response.data;
  } catch (error) {
    console.error('删除文件失败:', error);
    throw error;
  }
};

// 文件管理增强API
export const getFilePreview = async (filename, rows = 10) => {
  try {
    const response = await apiClient.get(`/api/file_preview/${filename}?rows=${rows}`);
    return response.data;
  } catch (error) {
    console.error('获取文件预览失败:', error);
    throw error;
  }
};





// 数据库连接管理API
export const testDatabaseConnection = async (connectionData) => {
  try {
    const response = await apiClient.post('/api/database_connections/test', connectionData);
    return response.data;
  } catch (error) {
    console.error('测试数据库连接失败:', error);
    throw error;
  }
};

export const createDatabaseConnection = async (connectionData) => {
  try {
    const response = await apiClient.post('/api/database_connections', connectionData);
    requestManager.clearCache('/api/database_connections', 'GET');
    return response.data;
  } catch (error) {
    console.error('创建数据库连接失败:', error);
    throw error;
  }
};

export const listDatabaseConnections = async () => {
  try {
    console.log('listDatabaseConnections called - 使用请求管理器');
    // 使用请求管理器防止重复请求
    const data = await requestManager.getDatabaseConnections();
    console.log('listDatabaseConnections result:', data);
    return data;
  } catch (error) {
    console.error('获取数据库连接列表失败:', error);
    throw error;
  }
};

export const getDatabaseConnection = async (connectionId) => {
  try {
    const response = await apiClient.get(`/api/database_connections/${connectionId}`);
    return response.data;
  } catch (error) {
    console.error('获取数据库连接失败:', error);
    throw error;
  }
};

export const updateDatabaseConnection = async (connectionId, connectionData) => {
  try {
    const response = await apiClient.put(`/api/database_connections/${connectionId}`, connectionData);
    requestManager.clearCache('/api/database_connections', 'GET');
    return response.data;
  } catch (error) {
    console.error('更新数据库连接失败:', error);
    throw error;
  }
};

export const deleteDatabaseConnection = async (connectionId) => {
  try {
    const response = await apiClient.delete(`/api/database_connections/${connectionId}`);
    requestManager.clearCache('/api/database_connections', 'GET');
    return response.data;
  } catch (error) {
    console.error('删除数据库连接失败:', error);
    throw error;
  }
};

// 导出功能API
export const exportData = async (exportRequest) => {
  try {
    const response = await apiClient.post('/api/export', exportRequest);
    return response.data;
  } catch (error) {
    console.error('创建导出任务失败:', error);
    throw error;
  }
};

export const quickExport = async (exportRequest) => {
  try {
    const response = await apiClient.post('/api/export/quick', exportRequest, {
      responseType: 'blob'
    });
    return response;
  } catch (error) {
    console.error('快速导出失败:', error);
    throw error;
  }
};

export const getExportTaskStatus = async (taskId) => {
  try {
    const response = await apiClient.get(`/api/export/tasks/${taskId}`);
    return response.data;
  } catch (error) {
    console.error('获取导出任务状态失败:', error);
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
    console.error('下载导出文件失败:', error);
    throw error;
  }
};

export const listExportTasks = async () => {
  try {
    const response = await apiClient.get('/api/export/tasks');
    return response.data;
  } catch (error) {
    console.error('获取导出任务列表失败:', error);
    throw error;
  }
};

export const deleteExportTask = async (taskId) => {
  try {
    const response = await apiClient.delete(`/api/export/tasks/${taskId}`);
    return response.data;
  } catch (error) {
    console.error('删除导出任务失败:', error);
    throw error;
  }
};

// SQL查询API
export const executeSqlQuery = async (sqlQuery) => {
  try {
    const response = await apiClient.post('/api/sql_query', { query: sqlQuery });
    return response.data;
  } catch (error) {
    console.error('执行SQL查询失败:', error);
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
    console.error('保存查询结果为数据源失败:', error);
    throw error;
  }
};

// 获取可用表列表
export const getAvailableTables = async () => {
  try {
    const response = await apiClient.get('/api/available_tables');
    return response.data;
  } catch (error) {
    console.error('获取可用表列表失败:', error);
    throw error;
  }
};

// 新架构API: 保存查询结果到DuckDB
export const saveQueryToDuckDB = async (sql, datasource, tableAlias) => {
  try {
    const response = await apiClient.post('/api/save_query_to_duckdb', {
      sql,
      datasource,
      table_alias: tableAlias
    });
    return response.data;
  } catch (error) {
    console.error('保存查询结果到DuckDB失败:', error);
    throw error;
  }
};

// 新架构API: 获取DuckDB表列表
export const getDuckDBTables = async () => {
  try {
    const response = await apiClient.get('/api/duckdb_tables');
    return response.data;
  } catch (error) {
    console.error('获取DuckDB表列表失败:', error);
    throw error;
  }
};



// 删除DuckDB表
export const deleteDuckDBTable = async (tableName) => {
  try {
    const response = await apiClient.delete(`/api/duckdb_tables/${tableName}`);
    return response.data;
  } catch (error) {
    console.error('删除DuckDB表失败:', error);
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
    console.error('获取MySQL数据源列表失败:', error);
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
    console.error('执行DuckDB SQL失败:', error);
    throw error;
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
    console.error('上传文件到DuckDB失败:', error);
    throw error;
  }
};

export const getDuckDBTablesEnhanced = async () => {
  try {
    // 使用请求管理器防止重复请求
    const data = await requestManager.getDuckDBTables();
    return data;
  } catch (error) {
    console.error('获取DuckDB表列表失败:', error);
    throw error;
  }
};

export const deleteDuckDBTableEnhanced = async (tableName) => {
  try {
    const response = await apiClient.delete(`/api/duckdb/tables/${tableName}`);
    return response.data;
  } catch (error) {
    console.error('删除DuckDB表失败:', error);
    throw error;
  }
};

export const getDuckDBTableInfo = async (tableName) => {
  try {
    const response = await apiClient.get(`/api/duckdb/table/${tableName}/info`);
    return response.data;
  } catch (error) {
    console.error('获取DuckDB表信息失败:', error);
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
    console.error('从URL读取文件失败:', error);
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
    console.error('获取URL信息失败:', error);
    throw error;
  }
};



// 异步任务API
export const listAsyncTasks = async () => {
  try {
    const response = await apiClient.get('/api/async_tasks');
    return response.data;
  } catch (error) {
    console.error('获取异步任务列表失败:', error);
    throw error;
  }
};

export const getAsyncTask = async (taskId) => {
  try {
    const response = await apiClient.get(`/api/async_tasks/${taskId}`);
    return response.data;
  } catch (error) {
    console.error('获取异步任务详情失败:', error);
    throw error;
  }
};

// 提交异步查询
export const submitAsyncQuery = async (sql, format = 'parquet') => {
  try {
    const response = await apiClient.post('/api/async_query', { sql, format });
    return response.data;
  } catch (error) {
    console.error('提交异步查询失败:', error);
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
    console.error('下载异步任务结果失败:', error);
    throw error;
  }
};

// 新增连接池状态监控API
export const getConnectionPoolStatus = async () => {
  try {
    const response = await apiClient.get('/api/duckdb/pool/status');
    return response.data;
  } catch (error) {
    console.error('获取连接池状态失败:', error);
    throw error;
  }
};

export const resetConnectionPool = async () => {
  try {
    const response = await apiClient.post('/api/duckdb/pool/reset');
    return response.data;
  } catch (error) {
    console.error('重置连接池失败:', error);
    throw error;
  }
};

// 新增错误统计API
export const getErrorStatistics = async () => {
  try {
    const response = await apiClient.get('/api/errors/statistics');
    return response.data;
  } catch (error) {
    console.error('获取错误统计失败:', error);
    throw error;
  }
};

export const clearOldErrors = async (days = 30) => {
  try {
    const response = await apiClient.post('/api/errors/clear', { days });
    return response.data;
  } catch (error) {
    console.error('清理错误记录失败:', error);
    throw error;
  }
};

// 新增数据库连接API
export const connectDatabaseEnhanced = async (connectionParams) => {
  try {
    const response = await apiClient.post('/api/database/connect', connectionParams);
    return response.data;
  } catch (error) {
    console.error('数据库连接失败:', error);
    throw error;
  }
};

// 统一表管理接口
export const getAllTables = async () => {
  try {
    const response = await apiClient.get('/api/duckdb/tables');
    return response.data;
  } catch (error) {
    console.error('获取所有表失败:', error);
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
