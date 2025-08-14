/**
 * 异步任务相关API
 */

// 获取异步任务列表
export const listAsyncTasks = async () => {
  try {
    const response = await fetch('/api/async_tasks');
    return await response.json();
  } catch (error) {
    throw new Error(`获取异步任务列表失败: ${error.message}`);
  }
};

// 获取单个异步任务详情
export const getAsyncTask = async (taskId) => {
  try {
    const response = await fetch(`/api/async_tasks/${taskId}`);
    return await response.json();
  } catch (error) {
    throw new Error(`获取异步任务详情失败: ${error.message}`);
  }
};

// 提交异步查询
export const submitAsyncQuery = async (sql) => {
  try {
    const response = await fetch('/api/async_query', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sql }),
    });
    return await response.json();
  } catch (error) {
    throw new Error(`提交异步查询失败: ${error.message}`);
  }
};

// 下载异步任务结果
export const downloadAsyncTaskResult = async (taskId) => {
  try {
    const response = await fetch(`/api/async_tasks/${taskId}/result`);
    
    if (!response.ok) {
      throw new Error(`下载失败: ${response.status}`);
    }
    
    // 获取文件名
    const contentDisposition = response.headers.get('Content-Disposition');
    let filename = `task-${taskId}-result.parquet`;
    if (contentDisposition) {
      const filenameMatch = contentDisposition.match(/filename="(.+)"/);
      if (filenameMatch && filenameMatch[1]) {
        filename = filenameMatch[1];
      }
    }
    
    // 创建下载链接
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
    
    return { success: true };
  } catch (error) {
    throw new Error(`下载异步任务结果失败: ${error.message}`);
  }
};