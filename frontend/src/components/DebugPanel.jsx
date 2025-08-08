import React, { useState } from 'react';
import requestManager from '../utils/requestManager';
import { listDatabaseConnections } from '../services/apiClient';

const DebugPanel = () => {
  const [logs, setLogs] = useState([]);
  const [stats, setStats] = useState({});

  const addLog = (message) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [...prev, `[${timestamp}] ${message}`]);
  };

  const updateStats = () => {
    setStats(requestManager.getStats());
  };

  const testSingleRequest = async () => {
    addLog('测试单个请求...');
    try {
      const result = await listDatabaseConnections();
      addLog(`单个请求成功: ${JSON.stringify(result).substring(0, 100)}...`);
    } catch (error) {
      addLog(`单个请求失败: ${error.message}`);
    }
    updateStats();
  };

  const testConcurrentRequests = async () => {
    addLog('测试并发请求...');
    try {
      const promises = Array(5).fill().map((_, i) => {
        addLog(`发起请求 ${i + 1}`);
        return listDatabaseConnections();
      });
      
      const results = await Promise.all(promises);
      addLog(`并发请求完成，收到 ${results.length} 个响应`);
    } catch (error) {
      addLog(`并发请求失败: ${error.message}`);
    }
    updateStats();
  };

  const clearLogs = () => {
    setLogs([]);
  };

  const clearCache = () => {
    requestManager.clearAllCache();
    addLog('缓存已清除');
    updateStats();
  };

  return (
    <div style={{ 
      position: 'fixed', 
      top: '10px', 
      left: '10px', 
      width: '400px', 
      height: '500px',
      background: 'white', 
      border: '1px solid #ccc', 
      padding: '10px',
      zIndex: 10000,
      fontSize: '12px',
      overflow: 'auto'
    }}>
      <h3>请求管理器调试面板</h3>
      
      <div style={{ marginBottom: '10px' }}>
        <button onClick={testSingleRequest} style={{ marginRight: '5px' }}>
          测试单个请求
        </button>
        <button onClick={testConcurrentRequests} style={{ marginRight: '5px' }}>
          测试并发请求
        </button>
        <button onClick={clearCache} style={{ marginRight: '5px' }}>
          清除缓存
        </button>
        <button onClick={clearLogs}>
          清除日志
        </button>
      </div>

      <div style={{ marginBottom: '10px' }}>
        <strong>统计信息:</strong>
        <pre style={{ fontSize: '10px', background: '#f5f5f5', padding: '5px' }}>
          {JSON.stringify(stats, null, 2)}
        </pre>
      </div>

      <div>
        <strong>日志:</strong>
        <div style={{ 
          height: '200px', 
          overflow: 'auto', 
          background: '#f5f5f5', 
          padding: '5px',
          fontSize: '10px'
        }}>
          {logs.map((log, index) => (
            <div key={index}>{log}</div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default DebugPanel;
