import React, { useState, useEffect } from 'react';

// 导入Toast上下文
import { ToastProvider } from './contexts/ToastContext';

// 导入原有组件 - 确保包含所有必要的组件
import QueryBuilder from './components/QueryBuilder/QueryBuilder';
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
import ToastTest from './components/ToastTest';
// import ToastDiagnostic from './components/ToastDiagnostic';

// 导入服务
import {
  getDuckDBTables,
  listDatabaseConnections,
  getMySQLDataSources,
  listFiles,
  getFileColumns
} from './services/apiClient';

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

  // 数据加载
  useEffect(() => {
    loadInitialData();
  }, [refreshTrigger]);

  const loadInitialData = async () => {
    try {
      const [dataSourcesRes, connectionsRes, duckdbTablesRes, filesRes] = await Promise.all([
        getMySQLDataSources(),
        listDatabaseConnections(),
        getDuckDBTables(),
        listFiles()
      ]);

      let allDataSources = [];

      if (dataSourcesRes.success) {
        // 使用正确的数据字段
        const mysqlSources = dataSourcesRes.datasources || dataSourcesRes.data || [];
        allDataSources = [...allDataSources, ...mysqlSources];
      }

      // 加载上传的文件数据源
      if (Array.isArray(filesRes)) {
        const filePromises = filesRes.map(async (filename) => {
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
            console.error(`获取文件 ${filename} 列信息失败:`, error);
            return {
              id: filename,
              name: filename,
              sourceType: 'file',
              type: 'file',
              columns: [],
              columnCount: 0
            };
          }
        });

        const fileSources = await Promise.all(filePromises);
        allDataSources = [...allDataSources, ...fileSources];
      }

      if (duckdbTablesRes.success) {
        // 使用正确的数据字段
        const duckdbTables = duckdbTablesRes.tables || duckdbTablesRes.data || [];
        const duckdbSources = duckdbTables.map(table => {
          // 处理表名，可能是字符串或对象
          const tableName = typeof table === 'string' ? table : (table.table_name || table.name || String(table));
          const columns = typeof table === 'object' ? (table.columns || []) : [];
          const columnCount = typeof table === 'object' ? (table.column_count || columns.length) : 0;

          return {
            id: tableName, // 直接使用表名作为ID，不添加前缀
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

      if (connectionsRes.success) {
        setDatabaseConnections(connectionsRes.data || []);
      }
    } catch (error) {
      console.error('ShadcnApp - 加载初始数据失败:', error);
    }
  };

  const triggerRefresh = () => {
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

  return (
    <ToastProvider>
      <div className="min-h-screen bg-gray-50">
      {/* 顶部导航 */}
      <header className="border-b bg-white">
        <div className="w-full px-6 py-4">
          <div className="flex items-center">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-gray-900 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-sm">DQ</span>
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
              { id: "query", label: "查询" },
              { id: "sql", label: "SQL执行器" },
              { id: "tablemanagement", label: "数据表管理" },
              { id: "toasttest", label: "Toast测试" }
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
                  <DatabaseConnector onConnectionSaved={triggerRefresh} />
                </div>

                {/* 数据粘贴 */}
                <div className="bg-white rounded-lg border shadow-sm p-6">
                  <DataPasteBoard onDataSourceSaved={triggerRefresh} />
                </div>

                {/* 数据源列表 */}
                <div className="bg-white rounded-lg border shadow-sm p-6">
                  <DataSourceList
                    dataSources={dataSources}
                    onRefresh={triggerRefresh}
                  />
                </div>
              </div>
            </div>
          )}

          {/* 查询页面 */}
          {currentTab === "query" && (
            <div className="p-6">
              {/* 页面介绍 */}
              <div className="page-intro">
                <div className="page-intro-content">
                  <div className="page-intro-desc">
                    <div><strong>可视化查询构建：</strong>拖拽选择数据源，无需编写SQL即可构建复杂查询</div>
                    <div><strong>多表关联：</strong>支持INNER、LEFT、RIGHT、FULL JOIN等多种连接方式</div>
                    <div><strong>条件筛选：</strong>可视化设置WHERE条件，支持多种比较运算符</div>
                    <div><strong>排序分组：</strong>灵活设置ORDER BY和GROUP BY条件</div>
                    <div><strong>实时预览：</strong>查看生成的SQL语句，支持一键执行和结果导出</div>
                  </div>
                </div>
              </div>

              <div className="space-y-6">
                {/* 查询构建器 */}
                <div className="bg-white rounded-lg border shadow-sm p-6">
                  <QueryBuilder
                    dataSources={dataSources.filter(ds => ds.sourceType === 'duckdb')}
                    selectedSources={selectedSources}
                    setSelectedSources={setSelectedSources}
                    onResultsReceived={setQueryResults}
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
                      onRefresh={() => {
                        // 可以添加刷新逻辑
                      }}
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* SQL执行器页面 */}
          {currentTab === "sql" && (
            <div className="p-6">
              {/* 页面介绍 */}
              <div className="page-intro">
                <div className="page-intro-content">
                  <div className="page-intro-desc">
                    <div><strong>数据库SQL执行：</strong>连接MySQL、PostgreSQL等数据库执行SQL查询，支持结果保存到DuckDB</div>
                    <div><strong>DuckDB增强执行器：</strong>在DuckDB中执行高级SQL，支持文件上传、远程URL读取</div>
                    <div><strong>表管理功能：</strong>查看、删除DuckDB表，支持表结构和数据预览</div>
                    <div><strong>结果保存：</strong>查询结果可保存为新表，支持数据持久化</div>
                    <div><strong>语法高亮：</strong>SQL编辑器支持语法高亮和自动补全</div>
                  </div>
                </div>
              </div>

              <div className="space-y-6">
                <UnifiedSQLExecutor
                  databaseConnections={databaseConnections}
                  onDataSourceSaved={(newDataSource) => {
                    triggerRefresh();
                    console.log('新数据源已保存:', newDataSource);
                  }}
                  onResultsReceived={setQueryResults}
                />

                {/* 执行结果 */}
                {queryResults && queryResults.data && queryResults.data.length > 0 && (
                  <div className="bg-white rounded-lg border shadow-sm p-6">
                    <ModernDataDisplay
                      data={queryResults.data}
                      columns={queryResults.columns}
                      title="查询结果"
                      sqlQuery={queryResults.sqlQuery}
                      onRefresh={() => console.log('刷新查询结果')}
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
                    <DuckDBManagementPage />
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

          {/* Toast测试页面 */}
          {currentTab === "toasttest" && (
            <div className="bg-white rounded-lg border shadow-sm p-6">
              <h2 className="text-xl font-semibold mb-4">Toast通知测试</h2>
              <p className="text-gray-600 mb-4">点击下面的按钮测试Toast通知是否正常工作：</p>
              <ToastTest />
            </div>
          )}
        </div>
      </main>
      </div>
    </ToastProvider>
  );
};

export default ShadcnApp;
