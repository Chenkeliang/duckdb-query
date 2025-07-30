import axios from 'axios';

// 根据环境变量设置基础URL
// 在Docker环境中，如果VITE_API_URL为空或包含占位符，则使用相对路径
const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const baseURL = (apiUrl === '' || apiUrl.includes('your-api-url-in-production'))
  ? '' // 使用相对路径，通过nginx代理
  : apiUrl;

const apiClient = axios.create({
  baseURL,
  headers: {
    'Content-Type': 'application/json',
  },
});

export const uploadFile = async (file) => {
  const formData = new FormData();
  formData.append('file', file);

  try {
    const response = await apiClient.post('/api/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      timeout: 300000, // 5分钟超时
      maxContentLength: 100 * 1024 * 1024, // 100MB
      maxBodyLength: 100 * 1024 * 1024, // 100MB
    });
    return response.data;
  } catch (error) {
    console.error('Error uploading file:', error);

    // 提供更友好的错误信息
    if (error.response?.status === 413) {
      throw new Error('文件太大，请选择小于100MB的文件');
    } else if (error.code === 'ECONNABORTED') {
      throw new Error('上传超时，请检查网络连接或选择较小的文件');
    } else if (error.response?.data?.detail) {
      throw new Error(error.response.data.detail);
    } else {
      throw new Error(error.message || '文件上传失败');
    }
  }
};

export const connectDatabase = async (connectionParams) => {
  try {
    const response = await apiClient.post('/api/connect_database', connectionParams);
    return response.data;
  } catch (error) {
    console.error('Error connecting to database:', error);
    throw error;
  }
};

export const performQuery = async (queryRequest) => {
  try {
    // 使用代理端点来自动转换请求格式
    const response = await apiClient.post('/api/query', queryRequest);
    return response.data;
  } catch (error) {
    console.error('Error performing query:', error);
    throw error;
  }
};

export const downloadResults = async (queryRequest) => {
  try {
    // 使用下载代理端点来自动转换请求格式
    const response = await apiClient.post('/api/download_proxy', queryRequest, {
      responseType: 'blob',
    });

    // 创建下载链接
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'query_results.xlsx');
    document.body.appendChild(link);
    link.click();
    link.parentNode.removeChild(link);

    return true;
  } catch (error) {
    console.error('Error downloading results:', error);
    throw error;
  }
};

// MySQL配置相关API
export const getMySQLConfigs = async () => {
  try {
    const response = await apiClient.get('/api/mysql_configs');
    return response.data;
  } catch (error) {
    console.error('获取MySQL配置失败:', error);
    throw error;
  }
};

export const saveMySQLConfig = async (config) => {
  try {
    const response = await apiClient.post('/api/mysql_configs', config);
    return response.data;
  } catch (error) {
    console.error('保存MySQL配置失败:', error);
    throw error;
  }
};

export const deleteMySQLConfig = async (configId) => {
  try {
    const response = await apiClient.delete(`/api/mysql_configs/${configId}`);
    return response.data;
  } catch (error) {
    console.error('删除MySQL配置失败:', error);
    throw error;
  }
};

// 添加执行SQL查询的API函数
export const executeSQL = async (sql, datasource) => {
  try {
    const response = await apiClient.post('/api/execute_sql', { sql, datasource });
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

export const listFiles = async () => {
  try {
    const response = await apiClient.get('/api/list_files');
    return response.data;
  } catch (error) {
    console.error('获取文件列表失败:', error);
    throw error;
  }
};

export const getFileColumns = async (filename) => {
  try {
    const response = await apiClient.get(`/api/file_columns?filename=${filename}`);
    return response.data;
  } catch (error) {
    console.error('获取文件列信息失败:', error);
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
    return response.data;
  } catch (error) {
    console.error('创建数据库连接失败:', error);
    throw error;
  }
};

export const listDatabaseConnections = async () => {
  try {
    const response = await apiClient.get('/api/database_connections');
    return response.data;
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
    return response.data;
  } catch (error) {
    console.error('更新数据库连接失败:', error);
    throw error;
  }
};

export const deleteDatabaseConnection = async (connectionId) => {
  try {
    const response = await apiClient.delete(`/api/database_connections/${connectionId}`);
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
    const response = await apiClient.get('/api/mysql_datasources');
    return response.data;
  } catch (error) {
    console.error('获取MySQL数据源列表失败:', error);
    throw error;
  }
};

export default apiClient;
