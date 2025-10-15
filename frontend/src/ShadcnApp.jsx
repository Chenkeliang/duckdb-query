import React, { useEffect, useMemo, useState } from "react";

// 导入Toast上下文
import { ToastProvider, useToast } from "./contexts/ToastContext";

// 导入原有组件 - 确保包含所有必要的组件
import AsyncTaskList from "./components/AsyncTasks/AsyncTaskList";
import DatabaseTableManager from "./components/DatabaseManager/DatabaseTableManager";
import DataUploadSection from "./components/DataSourceManagement/DataUploadSection";
import DatabaseConnector from "./components/DataSourceManager/DatabaseConnector";
import DataPasteBoard from "./components/DataSourceManager/DataPasteBoard";
import DataSourceList from "./components/DataSourceManager/DataSourceList";
import DuckDBManagementPage from "./components/DuckDBManager/DuckDBManagementPage";
import ModernDataDisplay from "./components/Results/ModernDataDisplay";
import UnifiedQueryInterface from "./components/UnifiedQueryInterface/UnifiedQueryInterface";
import WelcomePage from "./components/WelcomePage";
// import ToastDiagnostic from './components/ToastDiagnostic';

// 导入服务
import { globalDebounce } from "./hooks/useDebounce";
import {
  createDatabaseConnection,
  executeDuckDBSQL,
  executeSQL,
  getDuckDBTablesEnhanced,
  getMySQLDataSources,
  listDatabaseConnections,
  testDatabaseConnection
} from "./services/apiClient";
import requestManager from "./utils/requestManager";

// 导入样式
import "./styles/modern.css";

const ShadcnApp = () => {
  // 获取Toast功能
  const { showSuccess, showError, showWarning, showInfo } = useToast();

  // 检查是否应该显示欢迎页面（7天内不再显示）
  const shouldShowWelcome = () => {
    const welcomeShownKey = 'duck-query-welcome-shown';
    const lastShownTime = localStorage.getItem(welcomeShownKey);

    if (!lastShownTime) {
      return true; // 从未显示过，应该显示
    }

    const lastShown = new Date(lastShownTime);
    const now = new Date();
    const daysDiff = (now - lastShown) / (1000 * 60 * 60 * 24);

    return daysDiff >= 7; // 7天后才再次显示
  };

  // 状态管理
  const [showWelcome, setShowWelcome] = useState(shouldShowWelcome()); // 控制是否显示欢迎页面
  const [currentTab, setCurrentTab] = useState("datasource");
  const [tableManagementTab, setTableManagementTab] = useState("duckdb"); // 二级TAB状态
  const [dataSources, setDataSources] = useState([]);
  const [databaseConnections, setDatabaseConnections] = useState([]);
  const [selectedSources, setSelectedSources] = useState([]);
  const [queryResults, setQueryResults] = useState({ data: [], columns: [] });
  const [activeFilters, setActiveFilters] = useState([]);
  const [resultsLoading, setResultsLoading] = useState(false);
  const [queryContext, setQueryContext] = useState({
    baseSql: "",
    datasource: null,
    sourceType: "duckdb",
    initialData: [],
    initialColumns: []
  });
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [lastFetchTime, setLastFetchTime] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [previewQuery, setPreviewQuery] = useState(""); // 用于预览异步任务结果的查询

  const columnTypeMap = useMemo(
    () => buildColumnTypeMap(queryContext.initialColumns || queryResults.columns || []),
    [queryContext.initialColumns, queryResults.columns]
  );

  // 初始数据加载
  useEffect(() => {
    loadInitialData(true); // 初始加载，强制执行
  }, []);

  // 响应刷新触发（使用防抖）
  useEffect(() => {
    if (refreshTrigger > 0) {
      loadInitialData(false); // 手动刷新，使用防抖
    }
  }, [refreshTrigger]);

  const loadInitialData = async (force = false) => {
    // 如果是强制刷新，跳过防抖
    if (force) {
      await executeLoadInitialData(force);
      return;
    }

    // 使用全局防抖管理器
    const debounceKey = `loadInitialData_${force ? "force" : "normal"}`;

    return globalDebounce.debounce(debounceKey, async () => {
      await executeLoadInitialData(force);
    });
  };

  const executeLoadInitialData = async (force = false) => {
    const now = Date.now();


    // 如果正在加载中，跳过
    if (isLoading) {
      return;
    }

    setIsLoading(true);
    setLastFetchTime(now);

    try {

      const [dataSourcesRes, connectionsRes, duckdbTablesRes] =
        await Promise.all([
          getMySQLDataSources(),
          listDatabaseConnections(),
          getDuckDBTablesEnhanced(force), // 传递force参数
        ]);


      let allDataSources = [];

      if (dataSourcesRes.success) {
        const mysqlSources = dataSourcesRes.connections || [];
        allDataSources = [...allDataSources, ...mysqlSources];
      }

      if (duckdbTablesRes.success) {
        const duckdbTables =
          duckdbTablesRes.tables || duckdbTablesRes.data || [];
        const duckdbSources = duckdbTables.map((table) => {
          const tableName =
            typeof table === "string"
              ? table
              : table.table_name || table.name || String(table);
          const columns = typeof table === "object" ? table.columns || [] : [];
          const columnCount =
            typeof table === "object"
              ? table.column_count || columns.length
              : 0;
          // 添加创建时间字段，如果有的话
          const createdAt =
            typeof table === "object" ? table.created_at || null : null;

          return {
            id: tableName,
            name: tableName,
            sourceType: "duckdb",
            type: "table",
            columns: columns,
            columnCount: columnCount,
            createdAt: createdAt,
          };
        });
        // 按创建时间倒序排序
        duckdbSources.sort((a, b) => {
          // 如果createdAt为null，将其放在最后
          if (!a.createdAt && !b.createdAt) return 0;
          if (!a.createdAt) return 1;
          if (!b.createdAt) return -1;
          const timeA = new Date(a.createdAt);
          const timeB = new Date(b.createdAt);
          return timeB - timeA;
        });
        allDataSources = [...allDataSources, ...duckdbSources];
      }

      // 按创建时间倒序排序所有数据源
      allDataSources.sort((a, b) => {
        // 如果createdAt为null，将其放在最后
        if (!a.createdAt && !b.createdAt) return 0;
        if (!a.createdAt) return 1;
        if (!b.createdAt) return -1;
        const timeA = new Date(a.createdAt);
        const timeB = new Date(b.createdAt);
        return timeB - timeA;
      });

      setDataSources(allDataSources);

      // 检查selectedSources中的数据源是否仍然有效
      const validSelectedSources = selectedSources.filter((selectedSource) =>
        allDataSources.some((ds) => ds.id === selectedSource.id),
      );
      if (validSelectedSources.length !== selectedSources.length) {
        setSelectedSources(validSelectedSources);
      }

      let connections = [];
      if (connectionsRes.success) {
        connections =
          connectionsRes.connections ||
          connectionsRes.databaseConnectionsData ||
          [];
      }
      setDatabaseConnections(connections);
    } catch (error) {
      // 数据加载失败时的处理
    } finally {
      setIsLoading(false);
    }
  };

  const triggerRefresh = () => {
    // 清除请求管理器的缓存，确保获取最新数据
    requestManager.clearAllCache();

    // 强制刷新数据，不使用防抖
    loadInitialData(true);
  };

  const extractBaseSql = (results) => {
    if (!results) return "";
    const candidates = [
      results.originalSql,
      results.original_sql,
      results.sqlQuery,
      results.sql,
      results.generatedSQL,
      results.query
    ];
    for (const candidate of candidates) {
      if (typeof candidate === "string" && candidate.trim()) {
        return candidate.trim();
      }
    }
    return "";
  };

  const quoteIdentifier = (field, sourceType, alias = "original_query") => {
    if (!field) return `${alias}.""`;
    if (field.includes(".")) {
      return field;
    }
    const quoteChar = sourceType === "mysql" ? "`" : '"';
    const escaped = field.replace(new RegExp(quoteChar, "g"), `${quoteChar}${quoteChar}`);
    return `${alias}.${quoteChar}${escaped}${quoteChar}`;
  };

  const escapeLikeValue = (value) => {
    return String(value)
      .replace(/[%_]/g, (match) => `\\${match}`)
      .replace(/'/g, "''");
  };

  const escapeLiteralValue = (value) => {
    const stringValue = value instanceof Date ? value.toISOString() : String(value);
    return stringValue.replace(/'/g, "''");
  };

  const isNumericValue = (value) => {
    if (value === null || value === undefined) return false;
    if (typeof value === "number") return true;
    if (typeof value === "bigint") return true;
    const trimmed = String(value).trim();
    if (!trimmed) return false;
    return /^-?\d+(\.\d+)?$/.test(trimmed);
  };

  const normalizeBooleanValue = (value) => {
    if (value === null || value === undefined) return null;
    if (typeof value === "boolean") return value;
    if (typeof value === "number") {
      if (value === 1) return true;
      if (value === 0) return false;
    }
    const normalized = String(value).trim().toLowerCase();
    if (["true", "t", "1", "yes", "y"].includes(normalized)) return true;
    if (["false", "f", "0", "no", "n"].includes(normalized)) return false;
    return null;
  };

  const normalizeColumnType = (rawType) => {
    if (!rawType && rawType !== 0) {
      return "unknown";
    }
    const typeString = String(rawType).toLowerCase();

    if (
      typeString.includes("int") ||
      typeString.includes("decimal") ||
      typeString.includes("numeric") ||
      typeString.includes("number") ||
      typeString.includes("real") ||
      typeString.includes("double") ||
      typeString.includes("float")
    ) {
      return "number";
    }

    if (typeString.includes("bool")) {
      return "boolean";
    }

    if (typeString.includes("timestamp") || typeString.includes("datetime")) {
      return "datetime";
    }

    if (typeString.includes("date")) {
      return "date";
    }

    if (typeString.includes("time")) {
      return "time";
    }

    if (typeString.includes("json")) {
      return "json";
    }

    if (
      typeString.includes("char") ||
      typeString.includes("string") ||
      typeString.includes("text") ||
      typeString.includes("uuid") ||
      typeString.includes("variant") ||
      typeString.includes("binary") ||
      typeString.includes("blob") ||
      typeString.includes("object")
    ) {
      return "string";
    }

    return "unknown";
  };

  const buildColumnTypeMap = (columns = []) => {
    const map = {};

    const registerKey = (key, info) => {
      if (!key && key !== 0) return;
      const strKey = String(key);
      map[strKey] = info;
      map[strKey.toLowerCase()] = info;
    };

    if (!Array.isArray(columns)) {
      return map;
    }

    columns.forEach((column, index) => {
      if (column === null || column === undefined) {
        return;
      }

      if (typeof column === "string") {
        const info = { rawType: null, normalizedType: "string" };
        registerKey(column, info);
        registerKey(`column_${index}`, info);
        return;
      }

      if (typeof column === "object") {
        const rawType =
          column.type ||
          column.dataType ||
          column.data_type ||
          column.columnType ||
          column.column_type ||
          column.sqlType ||
          column.dtype ||
          column.jsType ||
          column.valueType ||
          null;

        const normalizedType = normalizeColumnType(rawType);
        const info = { rawType, normalizedType };

        const candidates = [
          column.field,
          column.name,
          column.column,
          column.column_name,
          column.columnName,
          column.fieldName,
          column.headerName,
          column.alias,
          column.accessor,
          column.accessorKey,
          column.key,
          column.id,
        ];

        candidates.forEach((candidate) => registerKey(candidate, info));

        if (column.table) {
          const columnName = column.column || column.field || column.name;
          if (columnName) {
            registerKey(`${column.table}.${columnName}`, info);
          }
        }

        if (candidates.every((candidate) => candidate === undefined || candidate === null)) {
          registerKey(`column_${index}`, info);
        }

        return;
      }

      // 未知类型，仍按字符串处理
      const fallbackInfo = { rawType: null, normalizedType: "string" };
      registerKey(String(column), fallbackInfo);
    });

    return map;
  };

  const buildFilterConditions = (filters, sourceType, columnTypes) => {
    const retrieveColumnInfo = (field) => {
      if (!field || !columnTypes) return null;
      const key = String(field);

      if (columnTypes instanceof Map) {
        let info = columnTypes.get(key) || columnTypes.get(key.toLowerCase());
        if (!info && key.includes(".")) {
          const simple = key.split(".").pop();
          info = columnTypes.get(simple) || columnTypes.get(simple.toLowerCase());
        }
        return info || null;
      }

      const infoDirect = columnTypes[key] || columnTypes[key.toLowerCase()];
      if (infoDirect) {
        return infoDirect;
      }

      if (key.includes(".")) {
        const simple = key.split(".").pop();
        return columnTypes[simple] || columnTypes[simple.toLowerCase()] || null;
      }

      return null;
    };

    const formatValueForColumn = (value, columnInfo) => {
      if (value === null || value === undefined) {
        return { literal: null, isNull: true };
      }

      const normalizedType = columnInfo?.normalizedType;

      if (normalizedType === "number") {
        if (typeof value === "number" || typeof value === "bigint") {
          return { literal: String(value), isNull: false };
        }
        const trimmed = String(value).trim();
        if (trimmed && /^-?\d+(\.\d+)?$/.test(trimmed)) {
          return { literal: trimmed, isNull: false };
        }
      }

      if (normalizedType === "boolean") {
        const boolValue = normalizeBooleanValue(value);
        if (boolValue !== null) {
          return { literal: boolValue ? "TRUE" : "FALSE", isNull: false };
        }
      }

      if (
        normalizedType === "datetime" ||
        normalizedType === "date" ||
        normalizedType === "time" ||
        normalizedType === "json"
      ) {
        return { literal: `'${escapeLiteralValue(value)}'`, isNull: false };
      }

      if (!normalizedType || normalizedType === "unknown") {
        const boolValue = normalizeBooleanValue(value);
        if (boolValue !== null) {
          return { literal: boolValue ? "TRUE" : "FALSE", isNull: false };
        }
        if (isNumericValue(value)) {
          return { literal: String(value), isNull: false };
        }
      }

      return { literal: `'${escapeLiteralValue(value)}'`, isNull: false };
    };

    return filters
      .map((filter) => {
        const fieldExpr = quoteIdentifier(filter.field, sourceType);
        const operator = filter.operator || "equals";
        const columnInfo = retrieveColumnInfo(filter.field);

        switch (operator) {
          case "isNull":
            return `${fieldExpr} IS NULL`;
          case "isNotNull":
            return `${fieldExpr} IS NOT NULL`;
          case "equals": {
            const { literal, isNull } = formatValueForColumn(filter.value, columnInfo);
            if (isNull) {
              return `${fieldExpr} IS NULL`;
            }
            if (literal === null) {
              return null;
            }
            return `${fieldExpr} = ${literal}`;
          }
          case "notEquals": {
            const { literal, isNull } = formatValueForColumn(filter.value, columnInfo);
            if (isNull) {
              return `${fieldExpr} IS NOT NULL`;
            }
            if (literal === null) {
              return null;
            }
            return `${fieldExpr} <> ${literal}`;
          }
          case "greaterThan": {
            const { literal, isNull } = formatValueForColumn(filter.value, columnInfo);
            if (isNull || literal === null) {
              return null;
            }
            return `${fieldExpr} > ${literal}`;
          }
          case "greaterOrEqual": {
            const { literal, isNull } = formatValueForColumn(filter.value, columnInfo);
            if (isNull || literal === null) {
              return null;
            }
            return `${fieldExpr} >= ${literal}`;
          }
          case "lessThan": {
            const { literal, isNull } = formatValueForColumn(filter.value, columnInfo);
            if (isNull || literal === null) {
              return null;
            }
            return `${fieldExpr} < ${literal}`;
          }
          case "lessOrEqual": {
            const { literal, isNull } = formatValueForColumn(filter.value, columnInfo);
            if (isNull || literal === null) {
              return null;
            }
            return `${fieldExpr} <= ${literal}`;
          }
          case "contains":
            return `${fieldExpr} LIKE '%${escapeLikeValue(filter.value)}%' ESCAPE '\\'`;
          case "notContains":
            return `${fieldExpr} NOT LIKE '%${escapeLikeValue(filter.value)}%' ESCAPE '\\'`;
          case "startsWith":
            return `${fieldExpr} LIKE '${escapeLikeValue(filter.value)}%' ESCAPE '\\'`;
          case "endsWith":
            return `${fieldExpr} LIKE '%${escapeLikeValue(filter.value)}' ESCAPE '\\'`;
          case "in":
          case "notIn": {
            if (!Array.isArray(filter.value) || filter.value.length === 0) {
              return null;
            }

            const formattedValues = filter.value.map((item) =>
              formatValueForColumn(item, columnInfo)
            );
            const nonNullLiterals = formattedValues
              .filter((item) => !item.isNull && item.literal !== null)
              .map((item) => item.literal);
            const hasNull = formattedValues.some((item) => item.isNull);

            const clauses = [];

            if (nonNullLiterals.length > 0) {
              clauses.push(
                `${fieldExpr} ${operator === "notIn" ? "NOT IN" : "IN"} (${nonNullLiterals.join(
                  ", "
                )})`
              );
            }

            if (hasNull) {
              clauses.push(
                operator === "notIn"
                  ? `${fieldExpr} IS NOT NULL`
                  : `${fieldExpr} IS NULL`
              );
            }

            if (clauses.length === 0) {
              return null;
            }

            if (clauses.length === 1) {
              return clauses[0];
            }

            return operator === "notIn"
              ? `(${clauses.join(" AND ")})`
              : `(${clauses.join(" OR ")})`;
          }
          default:
            return null;
        }
      })
      .filter(Boolean);
  };

  const buildFilteredSql = (baseSql, filters, sourceType, columnTypes) => {
    const sanitizedBase = (baseSql || "").trim().replace(/;$/, "");
    const alias = "original_query";
    const conditions = buildFilterConditions(filters, sourceType, columnTypes);
    let query = `SELECT * FROM (${sanitizedBase}) AS ${alias}`;
    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(" AND ")}`;
    }
    query += " LIMIT 10000";
    return query;
  };

  const handleResultsReceived = (results) => {
    if (!results) {
      setQueryResults({ data: [], columns: [] });
      setQueryContext({
        baseSql: "",
        datasource: null,
        sourceType: "duckdb",
        initialData: [],
        initialColumns: []
      });
      setActiveFilters([]);
      setResultsLoading(false);
      return;
    }

    const baseSql = extractBaseSql(results);
    const datasourceInfo = results.originalDatasource || null;
    const sourceType = datasourceInfo?.type || results.sourceType || "duckdb";

    const normalizedResults = {
      ...results,
      data: results.data || [],
      columns: results.columns || [],
      sqlQuery: baseSql || results.sqlQuery || ""
    };

    setQueryResults(normalizedResults);
    setQueryContext({
      baseSql,
      datasource: datasourceInfo,
      sourceType,
      initialData: normalizedResults.data,
      initialColumns: normalizedResults.columns
    });
    setActiveFilters([]);
    setResultsLoading(false);
  };

  const handleApplyResultFilters = async (filters = []) => {
    if (!queryContext.baseSql) {
      if (filters.length === 0) {
        setActiveFilters([]);
      } else {
        showWarning("当前结果集不支持筛选");
      }
      return;
    }

    if (!filters.length) {
      setActiveFilters([]);
      setQueryResults((prev) => ({
        ...prev,
        data: queryContext.initialData || [],
        columns: queryContext.initialColumns || prev.columns,
        sqlQuery: queryContext.baseSql
      }));
      return;
    }

    setResultsLoading(true);

    try {
      const filteredSql = buildFilteredSql(
        queryContext.baseSql,
        filters,
        queryContext.sourceType,
        columnTypeMap
      );
      let response;

      if (queryContext.datasource && queryContext.sourceType && queryContext.sourceType !== "duckdb") {
        response = await executeSQL(filteredSql, queryContext.datasource, true);
      } else {
        response = await executeDuckDBSQL(filteredSql, null, true);
      }

      if (!response) {
        throw new Error("筛选查询未返回结果");
      }

      const refreshedResults = {
        ...queryResults,
        data: response.data || [],
        columns: response.columns || queryResults.columns || [],
        sqlQuery: filteredSql,
        displaySQL: filteredSql,
        originalDatasource: queryContext.datasource || queryResults.originalDatasource || null
      };

      if (response.can_save_to_duckdb !== undefined) {
        refreshedResults.canSaveToDuckDB = response.can_save_to_duckdb;
      }

      setQueryResults(refreshedResults);
      setActiveFilters(filters);
    } catch (error) {
      const message = error?.message || "筛选失败";
      showError(message);
    } finally {
      setResultsLoading(false);
    }
  };

  // 文件上传处理函数
  const handleFileUpload = async (file) => {
    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`上传失败: ${response.status}`);
      }

      const result = await response.json();

      // 触发数据源列表刷新
      triggerRefresh();
      return result;
    } catch (error) {
      throw error;
    }
  };

  // 数据库连接处理函数
  const handleDatabaseConnect = async (connectionParams) => {
    try {

      // 对于MySQL数据源，使用数据库连接管理API
      if (connectionParams.type === "mysql") {
        // 创建数据库连接对象
        const connectionData = {
          id: connectionParams.id,
          name: connectionParams.id,
          type: connectionParams.type,
          params: connectionParams.params,
        };

        // 先测试连接
        const testResult = await testDatabaseConnection({
          type: connectionParams.type,
          params: connectionParams.params,
        });

        if (!testResult.success) {
          throw new Error(testResult.message || "数据库连接测试失败");
        }

        // 创建连接
        const createResult = await createDatabaseConnection(connectionData);

        if (createResult.success) {
          triggerRefresh(); // 刷新数据源列表
          return {
            success: true,
            message: "数据库连接创建成功",
            connection: createResult.connection,
          };
        } else {
          throw new Error(createResult.message || "数据库连接创建失败");
        }
      } else {
        // 对于其他类型，暂时只是触发刷新
        triggerRefresh();
        return { success: true, message: "数据库连接成功" };
      }
    } catch (error) {
      throw error;
    }
  };

  // 处理关闭欢迎页面
  const handleCloseWelcome = () => {
    const welcomeShownKey = 'duck-query-welcome-shown';
    localStorage.setItem(welcomeShownKey, new Date().toISOString());
    setShowWelcome(false);
  };

  // 如果显示欢迎页面，直接返回欢迎页面组件
  if (showWelcome) {
    return <WelcomePage onStartUsing={handleCloseWelcome} />;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 顶部导航 */}
      <header className="border-b bg-white">
        <div className="w-full px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div
                className="w-8 h-8 bg-gray-900 rounded-lg flex items-center justify-center"
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <span
                  className="text-white font-bold text-sm"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: "100%",
                    height: "100%",
                  }}
                >
                  DQ
                </span>
              </div>
              <h1 className="text-xl font-semibold text-gray-900">
                Duck Query
              </h1>
            </div>
            <div className="flex items-center space-x-3">
              <button
                onClick={() => {
                  setShowWelcome(true);
                  // 用户主动查看时，也记录时间，防止频繁显示
                  const welcomeShownKey = 'duck-query-welcome-shown';
                  localStorage.setItem(welcomeShownKey, new Date().toISOString());
                }}
                className="px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              >
                产品介绍
              </button>
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
              { id: "asynctasks", label: "异步任务" },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setCurrentTab(tab.id)}
                className={`mantine-tab ${currentTab === tab.id ? "active" : ""}`}
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
                    <div>
                      <strong>智能文件上传：</strong>
                      支持CSV、Excel、JSON、Parquet格式，自动检测大文件并启用分块上传和断点续传
                    </div>
                    <div>
                      <strong>数据库连接：</strong>
                      连接MySQL、PostgreSQL等数据库，支持连接测试和配置保存
                    </div>
                    <div>
                      <strong>数据粘贴：</strong>
                      直接粘贴表格数据，自动识别分隔符和数据类型，快速创建数据表
                    </div>
                    <div>
                      <strong>数据源管理：</strong>
                      统一管理所有数据源，支持预览、删除和刷新操作
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* 文件上传和URL导入 */}
                <div className="bg-white rounded-lg border shadow-sm p-6">
                  <DataUploadSection
                    onDataSourceSaved={triggerRefresh}
                    showNotification={(message, severity) => {

                      // 使用系统现有的Toast组件
                      switch (severity) {
                        case "success":
                          showSuccess(message);
                          break;
                        case "error":
                          showError(message);
                          break;
                        case "warning":
                          showWarning(message);
                          break;
                        case "info":
                        default:
                          showInfo(message);
                          break;
                      }
                    }}
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
                    <div>
                      <strong>统一查询界面：</strong>
                      整合图形化查询构建器和SQL编辑器，提供一致的查询体验
                    </div>
                    <div>
                      <strong>图形化查询：</strong>
                      拖拽选择数据源，无需编写SQL即可构建复杂查询
                    </div>
                    <div>
                      <strong>SQL编辑器：</strong>
                      直接编写SQL语句，支持语法高亮和自动补全
                    </div>
                    <div>
                      <strong>多表关联：</strong>支持INNER、LEFT、RIGHT、FULL
                      JOIN等多种连接方式
                    </div>
                    <div>
                      <strong>结果展示：</strong>
                      统一的结果展示界面，支持导出和进一步分析
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-6">
                {/* 统一查询界面 */}
                <UnifiedQueryInterface
                  dataSources={[...dataSources]
                    .filter(
                      (ds) =>
                        ds.type === "duckdb" || ds.sourceType === "duckdb",
                    )
                    .sort((a, b) => {
                      const timeA = a.createdAt
                        ? new Date(a.createdAt)
                        : new Date(0);
                      const timeB = b.createdAt
                        ? new Date(b.createdAt)
                        : new Date(0);
                      // 如果createdAt为null，将其放在最后
                      if (!a.createdAt && !b.createdAt) return 0;
                      if (!a.createdAt) return 1;
                      if (!b.createdAt) return -1;
                      return timeB - timeA;
                    })}
                  databaseConnections={databaseConnections}
                  selectedSources={selectedSources}
                  setSelectedSources={setSelectedSources}
                  onResultsReceived={handleResultsReceived}
                  onDataSourceSaved={(newDataSource) => {
                    triggerRefresh();
                  }}
                  onRefresh={triggerRefresh}
                />

                {/* 查询结果 */}
                {queryResults.data && (
                  <div className="bg-white rounded-lg border shadow-sm p-6">
                    <ModernDataDisplay
                      data={queryResults.data || []}
                      columns={
                        queryResults.columns
                          ? queryResults.columns.map((col, index) => {
                            // 安全地处理列数据，支持字符串和对象格式
                            const fieldValue = typeof col === 'string' ? col : (col.name || col.field || `column_${index}`);
                            const headerValue = typeof col === 'string' ? col : (col.headerName || col.name || col.field || `column_${index}`);

                            return {
                              field: fieldValue,
                              headerName: headerValue,
                              sortable: true,
                              filter: true,
                              resizable: true,
                            };
                          })
                          : []
                      }
                      loading={resultsLoading}
                      title={queryResults.isVisualQuery ? "可视化查询结果" : (queryResults.isSetOperation ? "集合操作结果" : "查询结果")}
                      sqlQuery={queryResults.sqlQuery || queryResults.sql || ""}
                      originalDatasource={queryResults.originalDatasource}
                      onApplyFilters={handleApplyResultFilters}
                      activeFilters={activeFilters}
                      // Visual query specific props
                      isVisualQuery={queryResults.isVisualQuery || false}
                      visualConfig={queryResults.visualConfig || null}
                      generatedSQL={queryResults.generatedSQL || ""}
                      // Set operation specific props
                      isSetOperation={queryResults.isSetOperation || false}
                      setOperationConfig={queryResults.setOperationConfig || null}
                      onRefresh={triggerRefresh}
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
                    <div>
                      <strong>DuckDB管理：</strong>
                      管理内置DuckDB数据库的表结构、数据预览和表操作
                    </div>
                    <div>
                      <strong>外部数据库：</strong>
                      管理MySQL、PostgreSQL等外部数据库的表结构和数据
                    </div>
                    <div>
                      <strong>统一管理：</strong>
                      在一个界面中管理所有数据库的表，支持切换和对比
                    </div>
                    <div>
                      <strong>实时同步：</strong>
                      支持手动刷新表列表，保持数据同步
                    </div>
                    <div>
                      <strong>操作便捷：</strong>
                      支持表删除、数据预览、结构查看等常用操作
                    </div>
                  </div>
                </div>
              </div>

              {/* 二级TAB导航 */}
              <div className="bg-white rounded-lg border shadow-sm mb-6">
                <div className="mantine-tabs secondary">
                  {[
                    { id: "duckdb", label: "DuckDB管理" },
                    { id: "external", label: "外部数据库" },
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setTableManagementTab(tab.id)}
                      className={`mantine-tab secondary ${tableManagementTab === tab.id ? "active" : ""}`}
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
                    <DatabaseTableManager
                      databaseConnections={databaseConnections}
                    />
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
                    <div>
                      <strong>异步任务管理：</strong>
                      提交耗时长的查询任务，避免阻塞界面
                    </div>
                    <div>
                      <strong>实时状态跟踪：</strong>实时查看任务执行状态和进度
                    </div>
                    <div>
                      <strong>结果下载：</strong>任务完成后可下载完整查询结果
                    </div>
                    <div>
                      <strong>结果预览：</strong>
                      将异步查询结果作为数据源进行预览和进一步查询
                    </div>
                  </div>
                </div>
              </div>

              <AsyncTaskList
                onPreviewResult={(taskId) => {
                  // 设置查询语句为 SELECT * FROM "async_result_{taskId}"
                  const query = `SELECT * FROM "async_result_${taskId}" LIMIT 10000`;
                  // 切换到SQL执行器标签页
                  setCurrentTab("sql");
                  // 设置查询语句到SQL执行器
                  setPreviewQuery(query);
                }}
                onTaskCompleted={(completedTask) => {
                  // 异步任务完成时，刷新数据源列表
                  triggerRefresh();
                }}
              />
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

// 包装组件，提供Toast功能
const ShadcnAppWithToast = () => {
  return (
    <ToastProvider>
      <ShadcnApp />
    </ToastProvider>
  );
};

export default ShadcnAppWithToast;
