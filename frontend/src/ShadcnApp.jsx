import React, { Suspense, useEffect, useMemo, useState } from "react";
import { Moon, Sun } from "lucide-react";

// 导入Toast上下文
import { ToastProvider, useToast } from "./contexts/ToastContext";

// 导入原有组件 - 确保包含所有必要的组件
import DataUploadSection from "./components/DataSourceManagement/DataUploadSection";
import DatabaseConnector from "./components/DataSourceManager/DatabaseConnector";
import DataPasteBoard from "./components/DataSourceManager/DataPasteBoard";
import DataSourceList from "./components/DataSourceManager/DataSourceList";
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

const AsyncTaskList = React.lazy(() => import("./components/AsyncTasks/AsyncTaskList"));
const DatabaseTableManager = React.lazy(() => import("./components/DatabaseManager/DatabaseTableManager"));
const DuckDBManagementPage = React.lazy(() => import("./components/DuckDBManager/DuckDBManagementPage"));
const ModernDataDisplay = React.lazy(() => import("./components/Results/ModernDataDisplay"));
const UnifiedQueryInterface = React.lazy(() => import("./components/UnifiedQueryInterface/UnifiedQueryInterface"));

const LazyFallback = () => (
  <div className="p-6 text-gray-500 text-sm">模块加载中...</div>
);

// 导入样式
import "./styles/modern.css";

const THEME_STORAGE_KEY = "duck-query-theme";

const getInitialTheme = () => {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === "dark") {
      return true;
    }
    if (stored === "light") {
      return false;
    }
  } catch (error) {
    return false;
  }

  if (typeof window.matchMedia === "function") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  }

  return false;
};

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
  const [isDarkMode, setIsDarkMode] = useState(getInitialTheme);
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

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    const root = document.documentElement;

    if (isDarkMode) {
      root.classList.add("dark");
      try {
        localStorage.setItem(THEME_STORAGE_KEY, "dark");
      } catch (error) {
        // 忽略本地存储错误
      }
    } else {
      root.classList.remove("dark");
      try {
        localStorage.setItem(THEME_STORAGE_KEY, "light");
      } catch (error) {
        // 忽略本地存储错误
      }
    }

    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("duckquery-theme-change", {
          detail: { isDark: isDarkMode }
        })
      );
    }
  }, [isDarkMode]);

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
          const columnProfiles = Array.isArray(table.column_profiles)
            ? table.column_profiles
            : [];
          const mappedProfileColumns = columnProfiles.map((profile) => ({
            name: profile.name || profile.column,
            type: profile.duckdb_type || profile.type,
            dataType: profile.duckdb_type || profile.type,
            rawType: profile.rawType || profile.raw_type,
            normalizedType: profile.normalizedType || profile.normalized_type,
            nullable: profile.nullable,
            precision: profile.precision,
            scale: profile.scale,
            sampleValues: profile.sampleValues || profile.sample_values || [],
            statistics: profile.statistics,
          }));
          const columns = mappedProfileColumns.length > 0
            ? mappedProfileColumns
            : (typeof table === "object" ? table.columns || [] : []);
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

  function normalizeBooleanValue(value) {
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
  }

  function normalizeColumnType(rawType) {
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
  }

  function buildColumnTypeMap(columns = []) {
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
  }

  function buildFilterConditions(filters, sourceType, columnTypes) {
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
  }

  function buildFilteredSql(baseSql, filters, sourceType, columnTypes) {
    const sanitizedBase = (baseSql || "").trim().replace(/;$/, "");
    const alias = "original_query";
    const conditions = buildFilterConditions(filters, sourceType, columnTypes);
    let query = `SELECT * FROM (${sanitizedBase}) AS ${alias}`;
    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(" AND ")}`;
    }
    query += " LIMIT 10000";
    return query;
  }

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
                className={`w-10 h-10 rounded-xl flex items-center justify-center transition ${isDarkMode ? 'bg-[rgba(21,24,31,0.88)] border border-[rgba(148,163,184,0.25)] shadow-[0_18px_38px_-28px_rgba(240,115,53,0.55)]' : 'bg-gray-900'}`}
              >
                <span
                  className={`font-semibold text-sm tracking-[0.18em] ${isDarkMode ? 'text-[rgba(240,115,53,0.85)] drop-shadow-[0_0_8px_rgba(240,115,53,0.45)]' : 'text-white'}`}
                >
                  DQ
                </span>
              </div>
              <h1 className={`text-xl font-semibold ${isDarkMode ? 'text-[rgba(230,234,243,0.96)]' : 'text-gray-900'}`}>Duck Query</h1>
            </div>
            <div className="flex items-center space-x-3">
              <button
                type="button"
                onClick={() => setIsDarkMode((prev) => !prev)}
                className={`inline-flex h-10 w-10 items-center justify-center rounded-lg border transition focus:outline-none focus:ring-2 focus:ring-offset-2 ${isDarkMode ? 'border-[rgba(148,163,184,0.25)] bg-[rgba(21,24,31,0.88)] text-[rgba(230,234,243,0.9)] hover:bg-[rgba(21,24,31,0.96)] focus:ring-[rgba(240,115,53,0.45)] focus:ring-offset-[rgba(6,8,12,0.2)] shadow-[0_16px_36px_-28px_rgba(240,115,53,0.55)]' : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50 focus:ring-blue-500 focus:ring-offset-white'}`}
                aria-label={isDarkMode ? "切换为浅色模式" : "切换为暗色模式"}
                title={isDarkMode ? "切换为浅色模式" : "切换为暗色模式"}
              >
                {isDarkMode ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
              </button>
              <button
                onClick={() => {
                  setShowWelcome(true);
                  const welcomeShownKey = 'duck-query-welcome-shown';
                  localStorage.setItem(welcomeShownKey, new Date().toISOString());
                }}
                className={`inline-flex items-center justify-center h-10 px-4 text-sm font-medium rounded-lg transition focus:outline-none focus:ring-2 focus:ring-offset-2 ${isDarkMode ? 'bg-[rgba(21,24,31,0.88)] text-[rgba(230,234,243,0.92)] border-[rgba(148,163,184,0.25)] hover:bg-[rgba(21,24,31,0.96)] focus:ring-[rgba(240,115,53,0.45)] focus:ring-offset-[rgba(6,8,12,0.2)] shadow-[0_16px_36px_-28px_rgba(240,115,53,0.55)]' : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50 focus:ring-blue-500 focus:ring-offset-white'}`}
              >
                产品介绍
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* 主要内容 */}
      <main className="w-full px-6 py-8">
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

          {currentTab === "datasource" && (
            <div className="p-6">
              <div className="page-intro">
                <div className="page-intro-content">
                  <div className="page-intro-desc">
                    <div>
                      <strong>上传文件：</strong>
                      支持<b>剪切板/CSV/Excel/JSON/Parquet/远程文件</b>等多类型上传，自动建表用于数据分析查询，默认最大50GB，支持自定义配置
                    </div>
                    <div>
                      <strong>支持连接远程数据库：</strong>
                      支持<b>MySQL / PostgreSQL</b>配置之后可在查询页面查询数据加载到本地表中
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white rounded-lg border shadow-sm p-6">
                  <DataUploadSection
                    onDataSourceSaved={triggerRefresh}
                    showNotification={(message, severity) => {
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

                <div className="bg-white rounded-lg border shadow-sm p-6">
                  <DatabaseConnector onConnect={handleDatabaseConnect} />
                </div>

                <div className="bg-white rounded-lg border shadow-sm p-6">
                  <DataPasteBoard onDataSourceSaved={triggerRefresh} />
                </div>

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

          {currentTab === "unifiedquery" && (
            <div className="p-6">
              <div className="page-intro">
                <div className="page-intro-content">
                  <div className="page-intro-desc">
                    <div>
                      <strong>图形化查询：</strong>
                      像用Excel筛选+排序一样，一键选字段、加条件、排结果（无需写SQL），生成数据分析结果
                    </div>
                    <div>
                      <strong>SQL编辑器：</strong>
                      可通过内部数据进行查询已上传数据表以及外部数据库加载至内部数据中，支持DUCKDB完整SQL语法
                    </div>
                    <div>
                      <strong>跨数据融合：</strong>
                      像ExcelVLOOKUP一样，一键把上传的多种类型数据，通过共同字段（如订单号、用户ID）横向合并宽表
                    </div>
                    <div>
                      <strong>跨数据汇总：</strong>
                      像Excel复制粘贴多张报表一样，一键把多份相似表格(1月、2月销售数据)垂直堆叠一份信息，支持字段不同的合并
                    </div>
                    <div>
                      <strong>数据预览导出：</strong>
                      页面最大支持1万条数据预览，支持异步任务产出新表再分析，导出支持CSV/Parquet格式
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-6">
                <Suspense fallback={<LazyFallback />}>
                  <UnifiedQueryInterface
                    dataSources={[...dataSources]
                      .filter((ds) => ds.type === "duckdb" || ds.sourceType === "duckdb")
                      .sort((a, b) => {
                        const timeA = a.createdAt ? new Date(a.createdAt) : new Date(0);
                        const timeB = b.createdAt ? new Date(b.createdAt) : new Date(0);
                        if (!a.createdAt && !b.createdAt) return 0;
                        if (!a.createdAt) return 1;
                        if (!b.createdAt) return -1;
                        return timeB - timeA;
                      })}
                    databaseConnections={databaseConnections}
                    selectedSources={selectedSources}
                    setSelectedSources={setSelectedSources}
                    onResultsReceived={handleResultsReceived}
                    onDataSourceSaved={() => {
                      triggerRefresh();
                    }}
                    onRefresh={triggerRefresh}
                  />
                </Suspense>

                {queryResults.data && (
                  <div className="bg-white rounded-lg border shadow-sm p-6">
                    <Suspense fallback={<LazyFallback />}>
                      <ModernDataDisplay
                        data={queryResults.data || []}
                        columns={
                          queryResults.columns
                            ? queryResults.columns.map((col, index) => {
                              const fieldValue = typeof col === "string" ? col : (col.name || col.field || `column_${index}`);
                              const headerValue = typeof col === "string" ? col : (col.headerName || col.name || col.field || `column_${index}`);
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
                        title={queryResults.isVisualQuery ? "可视化查询结果" : queryResults.isSetOperation ? "集合操作结果" : "查询结果"}
                        sqlQuery={queryResults.sqlQuery || queryResults.sql || ""}
                        originalDatasource={queryResults.originalDatasource}
                        onApplyFilters={handleApplyResultFilters}
                        activeFilters={activeFilters}
                        isVisualQuery={queryResults.isVisualQuery || false}
                        visualConfig={queryResults.visualConfig || null}
                        generatedSQL={queryResults.generatedSQL || ""}
                        isSetOperation={queryResults.isSetOperation || false}
                        setOperationConfig={queryResults.setOperationConfig || null}
                        onRefresh={triggerRefresh}
                        onDataSourceSaved={triggerRefresh}
                      />
                    </Suspense>
                  </div>
                )}
              </div>
            </div>
          )}

          {currentTab === "tablemanagement" && (
            <div className="p-6">
              <div className="page-intro">
                <div className="page-intro-content">
                  <div className="page-intro-desc">
                    <div>
                      <strong>数据管理：</strong>
                      管理DuckDB内部表、外部数据库表
                    </div>
                    <div>
                      <strong>表管理：</strong>
                      查看表结构，一键复制表名，删除不需要的表
                    </div>
                    <div>
                      <strong>分组展示：</strong>
                      异步结果表、普通表、临时表分组清晰展示
                    </div>
                  </div>
                </div>
              </div>

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

                {tableManagementTab === "duckdb" && (
                  <div className="p-6">
                    <Suspense fallback={<LazyFallback />}>
                      <DuckDBManagementPage onDataSourceChange={triggerRefresh} />
                    </Suspense>
                  </div>
                )}

                {tableManagementTab === "external" && (
                  <div className="p-6">
                    <Suspense fallback={<LazyFallback />}>
                      <DatabaseTableManager databaseConnections={databaseConnections} />
                    </Suspense>
                  </div>
                )}
              </div>
            </div>
          )}

          {currentTab === "asynctasks" && (
            <div className="p-6">
              <div className="page-intro">
                <div className="page-intro-content">
                  <div className="page-intro-desc">
                    <div>
                      <strong>后台运行：</strong>
                      异步任务长耗时查询在后台运行
                    </div>
                    <div>
                      <strong>结果处理：</strong>
                      自动更新进度；完成后可下载（CSV/Parquet）或保存为新表
                    </div>
                  </div>
                </div>
              </div>

              <Suspense fallback={<LazyFallback />}>
                <AsyncTaskList
                  onPreviewResult={(taskId) => {
                    const query = `SELECT * FROM "async_result_${taskId}" LIMIT 10000`;
                    setCurrentTab("sql");
                    setPreviewQuery(query);
                  }}
                  onTaskCompleted={() => {
                    triggerRefresh();
                  }}
                />
              </Suspense>
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
