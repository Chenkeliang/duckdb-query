import axios from 'axios';

// 根据环境变量设置基础URL
const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

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
    });
    return response.data;
  } catch (error) {
    console.error('Error uploading file:', error);
    throw error;
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
    const response = await apiClient.post('/api/query', queryRequest);
    return response.data;
  } catch (error) {
    console.error('Error performing query:', error);
    throw error;
  }
};

export const downloadResults = async (queryRequest) => {
  try {
    const response = await apiClient.post('/api/download', queryRequest, {
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

export default apiClient;
