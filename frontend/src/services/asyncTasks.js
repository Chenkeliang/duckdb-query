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
export const submitAsyncQuery = async (payload) => {
  try {
    const requestBody = typeof payload === 'string' ? { sql: payload } : { ...(payload || {}) };

    if (!requestBody.sql || !requestBody.sql.trim()) {
      throw new Error('缺少SQL查询语句');
    }

    const response = await fetch('/api/async_query', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });
    return await response.json();
  } catch (error) {
    throw new Error(`提交异步查询失败: ${error.message}`);
  }
};
