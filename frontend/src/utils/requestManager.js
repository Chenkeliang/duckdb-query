/**
 * 全局请求管理器 - 防止重复请求和频繁调用
 */

class RequestManager {
  constructor() {
    this.pendingRequests = new Map(); // 正在进行的请求
    this.requestCache = new Map(); // 请求缓存
    this.lastRequestTime = new Map(); // 上次请求时间
    this.requestCounts = new Map(); // 请求计数器
  }

  /**
   * 生成请求的唯一键
   */
  generateRequestKey(url, method = 'GET', params = null) {
    let key = `${method}:${url}`;
    if (params) {
      key += `:${JSON.stringify(params)}`;
    }
    return key;
  }

  /**
   * 检查是否应该跳过请求（防抖）
   */
  shouldSkipRequest(key, debounceMs = 1000) {
    const now = Date.now();
    const lastTime = this.lastRequestTime.get(key) || 0;
    const timeSinceLastRequest = now - lastTime;

    if (timeSinceLastRequest < debounceMs) {
      console.log(`RequestManager - 跳过重复请求: ${key}, 距离上次请求 ${timeSinceLastRequest}ms`);
      return true;
    }

    return false;
  }

  /**
   * 执行请求（带去重和防抖）
   */
  async executeRequest(url, options = {}, debounceMs = 1000) {
    const method = options.method || 'GET';
    const key = this.generateRequestKey(url, method, options.body);

    // 检查是否应该跳过（防抖）
    if (this.shouldSkipRequest(key, debounceMs)) {
      // 如果有正在进行的相同请求，返回该请求的Promise
      if (this.pendingRequests.has(key)) {
        console.log(`RequestManager - 返回正在进行的请求: ${key}`);
        return this.pendingRequests.get(key);
      }

      // 如果有缓存且在有效期内，返回缓存
      const cached = this.requestCache.get(key);
      if (cached && (Date.now() - cached.timestamp) < 5000) { // 5秒缓存
        console.log(`RequestManager - 返回缓存结果: ${key}`);
        return Promise.resolve(cached.data);
      }
    }

    // 如果已有相同请求在进行中，返回该请求
    if (this.pendingRequests.has(key)) {
      console.log(`RequestManager - 等待正在进行的请求: ${key}`);
      return this.pendingRequests.get(key);
    }

    // 更新请求时间和计数
    this.lastRequestTime.set(key, Date.now());
    const count = (this.requestCounts.get(key) || 0) + 1;
    this.requestCounts.set(key, count);

    // 创建新请求
    const fullUrl = url.startsWith('http') ? url : `${window.location.origin}${url}`;

    console.log(`🚨 RequestManager - 执行请求: ${key} (第${count}次)`);
    console.log(`🚨 请求URL: ${fullUrl}`);
    console.log(`🚨 当前时间: ${new Date().toISOString()}`);
    const requestPromise = fetch(fullUrl, options)
      .then(async response => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();

        // 缓存成功的响应
        this.requestCache.set(key, {
          data,
          timestamp: Date.now()
        });

        return data;
      })
      .catch(error => {
        console.error(`RequestManager - 请求失败: ${key}`, error);
        throw error;
      })
      .finally(() => {
        // 请求完成后从pending中移除
        this.pendingRequests.delete(key);
      });

    // 将请求添加到pending中
    this.pendingRequests.set(key, requestPromise);

    return requestPromise;
  }

  /**
   * 清除特定请求的缓存
   */
  clearCache(url, method = 'GET') {
    const key = this.generateRequestKey(url, method);
    this.requestCache.delete(key);
    this.lastRequestTime.delete(key);
  }

  /**
   * 清除所有缓存
   */
  clearAllCache() {
    this.requestCache.clear();
    this.lastRequestTime.clear();
    this.requestCounts.clear();
  }

  /**
   * 获取请求统计信息
   */
  getStats() {
    return {
      pendingRequests: this.pendingRequests.size,
      cachedRequests: this.requestCache.size,
      requestCounts: Object.fromEntries(this.requestCounts)
    };
  }

  /**
   * 专门用于数据库连接请求的方法
   */
  async getDatabaseConnections() {
    console.log('RequestManager - getDatabaseConnections called');
    console.log('当前时间:', new Date().toISOString());
    console.log('当前请求统计:', this.getStats());
    const result = await this.executeRequest('/api/database_connections', {}, 2000); // 2秒防抖
    console.log('RequestManager - getDatabaseConnections result:', result);
    return result;
  }



  /**
   * 专门用于DuckDB表请求的方法
   */
  async getDuckDBTables() {
    return this.executeRequest('/api/duckdb/tables', {}, 2000); // 2秒防抖
  }


}

// 创建全局实例
const requestManager = new RequestManager();

// 开发模式下暴露到全局，便于调试
if (process.env.NODE_ENV === 'development') {
  window.requestManager = requestManager;
}

export default requestManager;
