import React, { useState, useEffect } from 'react';

// 导入Toast上下文
import { ToastProvider } from './contexts/ToastContext';

// 导入原有组件 - 确保包含所有必要的组件
import DataGrid from './components/DataGrid';
import DatabaseConnector from './components/DataSourceManager/DatabaseConnector';
import DataPasteBoard from './components/DataSourceManager/DataPasteBoard';
import DataSourceList from './components/DataSourceManager/DataSourceList';
import DatabaseConnectionManager from './components/DataSourceManager/DatabaseConnectionManager';
import DuckDBQueryBuilder from './components/DuckDBQuery/DuckDBQueryBuilder';
import UnifiedSQLExecutor from './components/UnifiedSQLExecutor/UnifiedSQLExecutor';
import EnhancedFileUploader from './components/DataSourceManager/EnhancedFileUploader';
import ModernDataDisplay from './components/Results/ModernDataDisplay';
import DuckDBManagementPage from './components/DuckDBManager/DuckDBManagementPage';
import DatabaseTableManager from './components/DatabaseManager/DatabaseTableManager';
import AsyncTaskList from './components/AsyncTasks/AsyncTaskList';
import UnifiedQueryInterface from './components/UnifiedQueryInterface/UnifiedQueryInterface';
// import ToastDiagnostic from './components/ToastDiagnostic';

// 导入服务
import {
  getDuckDBTables,
  listDatabaseConnections,
  getMySQLDataSources,
  listFiles,
  getFileColumns,
  getFileDataSources,
  testDatabaseConnection,
  createDatabaseConnection
} from './services/apiClient';
import requestManager from './utils/requestManager';
import { globalDebounce } from './hooks/useDebounce';

// 导入样式
import './styles/modern.css';

const ShadcnApp = () => {
  // 状态管理
  const [currentTab, setCurrentTab] = useState("datasource");
  const [tableManagementTab, setTableManagementTab] = useState("duckdb"); // 二级TAB状态
  const [dataSources, setDataSources] = useState([]);
  const [databaseConnections, setDatabaseConnections] = useState([]);
  const [selectedSources, setSelectedSources] = useState([]);
  const [queryResults, setQueryResults] = useState({ data: [], columns: [] });
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [lastFetchTime, setLastFetchTime] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [previewQuery, setPreviewQuery] = useState(""); // 用于预览异步任务结果的查询

  // 初始数据加载
  useEffect(() => {
    console.log('🚀 ShadcnApp - 组件挂载，开始初始数据加载');
    console.log('🚀 当前时间戳:', Date.now());
    loadInitialData(true); // 初始加载，强制执行
  }, []);

  // 响应刷新触发（使用防抖）
  useEffect(() => {
    if (refreshTrigger > 0) {
      loadInitialData(false); // 手动刷新，使用防抖
    }
  }, [refreshTrigger]);

  const loadInitialData = async (force = false) => {
    // 使用全局防抖管理器
    const debounceKey = `loadInitialData_${force ? 'force' : 'normal'}`;

    return globalDebounce.debounce(debounceKey, async () => {
      const now = Date.now();

      // 如果正在加载中，跳过
      if (isLoading) {
        console.log('ShadcnApp - 跳过数据加载，正在加载中');
        return;
      }

      setIsLoading(true);
      setLastFetchTime(now);

    try {
      console.log('🔄 ShadcnApp - 开始加载数据...');

      const [dataSourcesRes, connectionsRes, duckdbTablesRes, fileDataSourcesRes, legacyFilesRes] = await Promise.all([
        getMySQLDataSources(),
        listDatabaseConnections(),
        getDuckDBTables(),
        getFileDataSources(),
        listFiles()
      ]);

      console.log('🔄 API调用完成，开始处理数据...');

      let allDataSources = [];
      const knownFileNames = new Set();

      if (dataSourcesRes.success) {
        const mysqlSources = dataSourcesRes.connections || [];
        allDataSources = [...allDataSources, ...mysqlSources];
      }

      // 1. 优先处理有完整元数据的文件数据源
      if (fileDataSourcesRes.success && Array.isArray(fileDataSourcesRes.datasources)) {
        const fileSources = fileDataSourcesRes.datasources.map(ds => {
            knownFileNames.add(ds.filename); // 记录已知文件名，用于去重
            return {
                id: ds.source_id,
                name: ds.filename,
                sourceType: 'file',
                type: 'file',
                columns: ds.columns || [],
                columnCount: ds.column_count || 0
            };
        });
        allDataSources = [...allDataSources, ...fileSources];
      }

      // 2. 处理扫描到的但未被追踪的“历史”文件
      if (Array.isArray(legacyFilesRes)) {
        const legacyFilePromises = legacyFilesRes
          .filter(filename => !knownFileNames.has(filename)) // 过滤掉已知文件
          .map(async (filename) => {
            try {
              const columns = await getFileColumns(filename);
              return {
                id: filename,
                name: filename,
                sourceType: 'file',
                type: 'file',
                columns: columns || [],
                columnCount: (columns || []).length
              };
            } catch (error) {
              console.error(`获取历史文件 ${filename} 的列信息失败:`, error);
              return null;
            }
        });

        const legacyFileSources = (await Promise.all(legacyFilePromises)).filter(Boolean);
        allDataSources = [...allDataSources, ...legacyFileSources];
      }

      if (duckdbTablesRes.success) {
        const duckdbTables = duckdbTablesRes.tables || duckdbTablesRes.data || [];
        const duckdbSources = duckdbTables.map(table => {
          const tableName = typeof table === 'string' ? table : (table.table_name || table.name || String(table));
          const columns = typeof table === 'object' ? (table.columns || []) : [];
          const columnCount = typeof table === 'object' ? (table.column_count || columns.length) : 0;

          return {
            id: tableName,
            name: tableName,
            sourceType: 'duckdb',
            type: 'table',
            columns: columns,
            columnCount: columnCount
          };
        });
        allDataSources = [...allDataSources, ...duckdbSources];
      }

      setDataSources(allDataSources);

      let connections = [];
      if (connectionsRes.success) {
        connections = connectionsRes.connections || connectionsRes.databaseConnectionsData || [];
      }
      setDatabaseConnections(connections);
      console.log('ShadcnApp - 数据加载完成');

    } catch (error) {
      console.error('ShadcnApp - 加载初始数据失败:', error);
    } finally {
      setIsLoading(false);
    }
    }, force ? 1000 : 3000);
  };

  const triggerRefresh = () => {
    // 清除请求管理器的缓存，确保获取最新数据
    requestManager.clearAllCache();

    console.log('ShadcnApp - 触发数据刷新');
    setRefreshTrigger(prev => prev + 1);
  };

  // 文件上传处理函数
  const handleFileUpload = async (file) => {
    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`上传失败: ${response.status}`);
      }

      const result = await response.json();
      console.log('文件上传成功:', result);

      // 触发数据源列表刷新
      triggerRefresh();
      return result;
    } catch (error) {
      console.error('文件上传错误:', error);
      throw error;
    }
  };

  // 数据库连接处理函数
  const handleDatabaseConnect = async (connectionParams) => {
    try {
      console.log('数据库连接参数:', connectionParams);

      // 对于MySQL数据源，使用数据库连接管理API
      if (connectionParams.type === 'mysql') {
        // 创建数据库连接对象
        const connectionData = {
          id: connectionParams.id,
          name: connectionParams.id,
          type: connectionParams.type,
          params: connectionParams.params
        };

        // 先测试连接
        const testResult = await testDatabaseConnection({
          type: connectionParams.type,
          params: connectionParams.params
        });

        if (!testResult.success) {
          throw new Error(testResult.message || '数据库连接测试失败');
        }

        // 创建连接
        const createResult = await createDatabaseConnection(connectionData);

        if (createResult.success) {
          triggerRefresh(); // 刷新数据源列表
          return {
            success: true,
            message: '数据库连接创建成功',
            connection: createResult.connection
          };
        } else {
          throw new Error(createResult.message || '数据库连接创建失败');
        }
      } else {
        // 对于其他类型，暂时只是触发刷新
        triggerRefresh();
        return { success: true, message: '数据库连接成功' };
      }
    } catch (error) {
      console.error('数据库连接失败:', error);
      throw error;
    }
  };

  return (
    <ToastProvider>
      <div className="min-h-screen bg-gray-50">
      {/* 顶部导航 */}
      <header className="border-b bg-white">
        <div className="w-full px-6 py-4">
          <div className="flex items-center">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-gray-900 rounded-lg flex items-center justify-center" style={{display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
                <span className="text-white font-bold text-sm" style={{display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%'}}>DQ</span>
              </div>
              <h1 className="text-xl font-semibold text-gray-900">DataQuery Pro</h1>
            </div>
          </div>
        </div>
      </header>

      {/* 主要内容 */}
      <main className="w-full px-6 py-8">
        {/* 标签页导航 - Mantine风格 */}
        <div className="bg-white rounded-lg border shadow-sm mb-6">
          <div className="mantine-tabs">
                      {[
            { id: "datasource", label: "数据源" },
            { id: "unifiedquery", label: "统一查询" },
            { id: "tablemanagement", label: "数据表管理" },
            { id: "asynctasks", label: "异步任务" }
          ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setCurrentTab(tab.id)}
                className={`mantine-tab ${currentTab === tab.id ? 'active' : ''}`}
              >
                <span>{tab.label}</span>
              </button>
            ))}
          </div>

          {/* 数据源页面 */}
          {currentTab === "datasource" && (
            <div className="p-6">
              {/* 页面介绍 */}
              <div className="page-intro">
                <div className="page-intro-content">
                  <div className="page-intro-desc">
                    <div><strong>智能文件上传：</strong>支持CSV、Excel、JSON、Parquet格式，自动检测大文件并启用分块上传和断点续传</div>
                    <div><strong>数据库连接：</strong>连接MySQL、PostgreSQL等数据库，支持连接测试和配置保存</div>
                    <div><strong>数据粘贴：</strong>直接粘贴表格数据，自动识别分隔符和数据类型，快速创建数据表</div>
                    <div><strong>数据源管理：</strong>统一管理所有数据源，支持预览、删除和刷新操作</div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* 文件上传 */}
                <div className="bg-white rounded-lg border shadow-sm p-6">
                  <EnhancedFileUploader
                    onUpload={handleFileUpload}
                    onUploadComplete={(result) => {
                      console.log('文件上传完成:', result);
                      triggerRefresh();
                    }}
                    onDataSourceSaved={triggerRefresh}
                  />
                </div>

                {/* 数据库连接 */}
                <div className="bg-white rounded-lg border shadow-sm p-6">
                  <DatabaseConnector onConnect={handleDatabaseConnect} />
                </div>

                {/* 数据粘贴 */}
                <div className="bg-white rounded-lg border shadow-sm p-6">
                  <DataPasteBoard onDataSourceSaved={triggerRefresh} />
                </div>

                {/* 数据源列表 */}
                <div className="bg-white rounded-lg border shadow-sm p-6">
                  <DataSourceList
                    dataSources={dataSources}
                    databaseConnections={databaseConnections}
                    onRefresh={triggerRefresh}
                  />
                </div>
              </div>
            </div>
          )}

          {/* 统一查询页面 */}
          {currentTab === "unifiedquery" && (
            <div className="p-6">
              {/* 页面介绍 */}
              <div className="page-intro">
                <div className="page-intro-content">
                  <div className="page-intro-desc">
                    <div><strong>统一查询界面：</strong>整合图形化查询构建器和SQL编辑器，提供一致的查询体验</div>
                    <div><strong>图形化查询：</strong>拖拽选择数据源，无需编写SQL即可构建复杂查询</div>
                    <div><strong>SQL编辑器：</strong>直接编写SQL语句，支持语法高亮和自动补全</div>
                    <div><strong>多表关联：</strong>支持INNER、LEFT、RIGHT、FULL JOIN等多种连接方式</div>
                    <div><strong>结果展示：</strong>统一的结果展示界面，支持导出和进一步分析</div>
                  </div>
                </div>
              </div>

              <div className="space-y-6">
                {/* 统一查询界面 */}
                <div className="bg-white rounded-lg border shadow-sm p-6">
                  <UnifiedQueryInterface
                    dataSources={dataSources.filter(ds => ds.type === 'duckdb' || ds.sourceType === 'duckdb')}
                    databaseConnections={databaseConnections}
                    selectedSources={selectedSources}
                    setSelectedSources={setSelectedSources}
                    onResultsReceived={setQueryResults}
                    onDataSourceSaved={(newDataSource) => {
                      triggerRefresh();
                      console.log('新数据源已保存:', newDataSource);
                    }}
                  />
                </div>

                {/* 查询结果 */}
                {queryResults.data && queryResults.data.length > 0 && (
                  <div className="bg-white rounded-lg border shadow-sm p-6">
                    <ModernDataDisplay
                      data={queryResults.data || []}
                      columns={queryResults.columns ? queryResults.columns.map(col => ({
                        field: col,
                        headerName: col,
                        sortable: true,
                        filter: true,
                        resizable: true
                      })) : []}
                      loading={false}
                      title="查询结果"
                      sqlQuery={queryResults.sqlQuery || queryResults.sql || ''}
                      originalDatasource={queryResults.originalDatasource}
                      onRefresh={() => {
                        // 可以添加刷新逻辑
                      }}
                      onDataSourceSaved={triggerRefresh}
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 数据表管理页面 - 包含二级TAB */}
          {currentTab === "tablemanagement" && (
            <div className="p-6">
              {/* 页面介绍 */}
              <div className="page-intro">
                <div className="page-intro-content">
                  <div className="page-intro-desc">
                    <div><strong>DuckDB管理：</strong>管理内置DuckDB数据库的表结构、数据预览和表操作</div>
                    <div><strong>外部数据库：</strong>管理MySQL、PostgreSQL等外部数据库的表结构和数据</div>
                    <div><strong>统一管理：</strong>在一个界面中管理所有数据库的表，支持切换和对比</div>
                    <div><strong>实时同步：</strong>支持手动刷新表列表，保持数据同步</div>
                    <div><strong>操作便捷：</strong>支持表删除、数据预览、结构查看等常用操作</div>
                  </div>
                </div>
              </div>

              {/* 二级TAB导航 */}
              <div className="bg-white rounded-lg border shadow-sm mb-6">
                <div className="mantine-tabs secondary">
                  {[
                    { id: "duckdb", label: "DuckDB管理" },
                    { id: "external", label: "外部数据库" }
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setTableManagementTab(tab.id)}
                      className={`mantine-tab secondary ${tableManagementTab === tab.id ? 'active' : ''}`}
                    >
                      <span>{tab.label}</span>
                    </button>
                  ))}
                </div>

                {/* DuckDB管理内容 */}
                {tableManagementTab === "duckdb" && (
                  <div className="p-6">
                    <DuckDBManagementPage onDataSourceChange={triggerRefresh} />
                  </div>
                )}

                {/* 外部数据库管理内容 */}
                {tableManagementTab === "external" && (
                  <div className="p-6">
                    <DatabaseTableManager databaseConnections={databaseConnections} />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 异步任务页面 */}
          {currentTab === "asynctasks" && (
            <div className="p-6">
              {/* 页面介绍 */}
              <div className="page-intro">
                <div className="page-intro-content">
                  <div className="page-intro-desc">
                    <div><strong>异步任务管理：</strong>提交耗时长的查询任务，避免阻塞界面</div>
                    <div><strong>实时状态跟踪：</strong>实时查看任务执行状态和进度</div>
                    <div><strong>结果下载：</strong>任务完成后可下载完整查询结果</div>
                    <div><strong>结果预览：</strong>将异步查询结果作为数据源进行预览和进一步查询</div>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-lg border shadow-sm p-6">
                <AsyncTaskList 
                  onPreviewResult={(taskId) => {
                    // 设置查询语句为 SELECT * FROM "async_result_{taskId}"
                    const query = `SELECT * FROM "async_result_${taskId}" LIMIT 10000`;
                    // 切换到SQL执行器标签页
                    setCurrentTab("sql");
                    // 设置查询语句到SQL执行器
                    setPreviewQuery(query);
                  }}
                />
              </div>
            </div>
          )}

        </div>
      </main>
      </div>
    </ToastProvider>
  );
};

export default ShadcnApp;
