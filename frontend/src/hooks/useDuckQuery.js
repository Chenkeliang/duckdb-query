import { useEffect, useMemo, useState } from "react";
import { useToast } from "../contexts/ToastContext";
import { globalDebounce } from "./useDebounce";
import {
  createDatabaseConnection,
  executeDuckDBSQL,
  executeSQL,
  fetchDuckDBTableSummaries,
  getMySQLDataSources,
  listDatabaseConnections,
  testDatabaseConnection
} from "../services/apiClient";
import requestManager from "../utils/requestManager";

const THEME_STORAGE_KEY = "duck-query-theme";

const getInitialTheme = () => {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === "dark") return true;
    if (stored === "light") return false;
  } catch {
    return false;
  }

  if (typeof window.matchMedia === "function") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  }

  return false;
};

const shouldShowWelcome = () => {
  if (typeof window === "undefined") {
    return false;
  }

  const welcomeShownKey = "duck-query-welcome-shown";
  const lastShownTime = localStorage.getItem(welcomeShownKey);

  if (!lastShownTime) {
    return true;
  }

  const lastShown = new Date(lastShownTime);
  const now = new Date();
  const daysDiff = (now - lastShown) / (1000 * 60 * 60 * 24);

  return daysDiff >= 7;
};

function normalizeBooleanValue(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
  }
  const normalized = String(value)
    .trim()
    .toLowerCase();
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

function transformMetadataColumns(metadata) {
  if (!metadata || !Array.isArray(metadata.columns)) {
    return [];
  }

  return metadata.columns.map(column => {
    const rawType = column.data_type || column.type || column.rawType;
    const normalizedType = normalizeColumnType(rawType);
    return {
      name: column.column_name || column.name,
      type: rawType,
      dataType: rawType,
      rawType,
      normalizedType,
      nullable:
        column.null_count === undefined ? undefined : column.null_count > 0,
      sampleValues: column.sample_values || [],
      statistics: {
        null_count: column.null_count,
        distinct_count: column.distinct_count,
        min: column.min_value,
        max: column.max_value,
        avg: column.avg_value
      }
    };
  });
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
        column.id
      ];

      candidates.forEach(candidate => registerKey(candidate, info));

      if (column.table) {
        const columnName = column.column || column.field || column.name;
        if (columnName) {
          registerKey(`${column.table}.${columnName}`, info);
        }
      }

      if (
        candidates.every(
          candidate => candidate === undefined || candidate === null
        )
      ) {
        registerKey(`column_${index}`, info);
      }

      return;
    }

    const fallbackInfo = { rawType: null, normalizedType: "string" };
    registerKey(String(column), fallbackInfo);
  });

  return map;
}

function quoteIdentifier(field, sourceType, alias = "original_query") {
  if (!field) return `${alias}.""`;
  if (field.includes(".")) {
    return field;
  }
  const quoteChar = sourceType === "mysql" ? "`" : '"';
  const escaped = field.replace(
    new RegExp(quoteChar, "g"),
    `${quoteChar}${quoteChar}`
  );
  return `${alias}.${quoteChar}${escaped}${quoteChar}`;
}

function escapeLikeValue(value) {
  return String(value)
    .replace(/[%_]/g, match => `\\${match}`)
    .replace(/'/g, "''");
}

function escapeLiteralValue(value) {
  const stringValue =
    value instanceof Date ? value.toISOString() : String(value);
  return stringValue.replace(/'/g, "''");
}

function isNumericValue(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === "number") return true;
  if (typeof value === "bigint") return true;
  const trimmed = String(value).trim();
  if (!trimmed) return false;
  return /^-?\d+(\.\d+)?$/.test(trimmed);
}

function buildFilterConditions(filters, sourceType, columnTypes) {
  const retrieveColumnInfo = field => {
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
    .map(filter => {
      const fieldExpr = quoteIdentifier(filter.field, sourceType);
      const operator = filter.operator || "equals";
      const columnInfo = retrieveColumnInfo(filter.field);

      switch (operator) {
        case "isNull":
          return `${fieldExpr} IS NULL`;
        case "isNotNull":
          return `${fieldExpr} IS NOT NULL`;
        case "equals": {
          const { literal, isNull } = formatValueForColumn(
            filter.value,
            columnInfo
          );
          if (isNull) {
            return `${fieldExpr} IS NULL`;
          }
          if (literal === null) {
            return null;
          }
          return `${fieldExpr} = ${literal}`;
        }
        case "notEquals": {
          const { literal, isNull } = formatValueForColumn(
            filter.value,
            columnInfo
          );
          if (isNull) {
            return `${fieldExpr} IS NOT NULL`;
          }
          if (literal === null) {
            return null;
          }
          return `${fieldExpr} <> ${literal}`;
        }
        case "greaterThan": {
          const { literal, isNull } = formatValueForColumn(
            filter.value,
            columnInfo
          );
          if (isNull || literal === null) {
            return null;
          }
          return `${fieldExpr} > ${literal}`;
        }
        case "greaterOrEqual": {
          const { literal, isNull } = formatValueForColumn(
            filter.value,
            columnInfo
          );
          if (isNull || literal === null) {
            return null;
          }
          return `${fieldExpr} >= ${literal}`;
        }
        case "lessThan": {
          const { literal, isNull } = formatValueForColumn(
            filter.value,
            columnInfo
          );
          if (isNull || literal === null) {
            return null;
          }
          return `${fieldExpr} < ${literal}`;
        }
        case "lessOrEqual": {
          const { literal, isNull } = formatValueForColumn(
            filter.value,
            columnInfo
          );
          if (isNull || literal === null) {
            return null;
          }
          return `${fieldExpr} <= ${literal}`;
        }
        case "contains":
          return `${fieldExpr} LIKE '%${escapeLikeValue(
            filter.value
          )}%' ESCAPE '\\'`;
        case "notContains":
          return `${fieldExpr} NOT LIKE '%${escapeLikeValue(
            filter.value
          )}%' ESCAPE '\\'`;
        case "startsWith":
          return `${fieldExpr} LIKE '${escapeLikeValue(
            filter.value
          )}%' ESCAPE '\\'`;
        case "endsWith":
          return `${fieldExpr} LIKE '%${escapeLikeValue(
            filter.value
          )}' ESCAPE '\\'`;
        case "in":
        case "notIn": {
          if (!Array.isArray(filter.value) || filter.value.length === 0) {
            return null;
          }

          const formattedValues = filter.value.map(item =>
            formatValueForColumn(item, columnInfo)
          );
          const nonNullLiterals = formattedValues
            .filter(item => !item.isNull && item.literal !== null)
            .map(item => item.literal);
          const hasNull = formattedValues.some(item => item.isNull);

          const clauses = [];

          if (nonNullLiterals.length > 0) {
            clauses.push(
              `${fieldExpr} ${
                operator === "notIn" ? "NOT IN" : "IN"
              } (${nonNullLiterals.join(", ")})`
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

const extractBaseSql = results => {
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

const useDuckQuery = () => {
  const { showError, showWarning } = useToast();
  const [githubStars, setGithubStars] = useState(null);
  const [showWelcome, setShowWelcome] = useState(shouldShowWelcome);
  const [isDarkMode, setIsDarkMode] = useState(getInitialTheme);
  const [currentTab, setCurrentTab] = useState("datasource");
  const [tableManagementTab, setTableManagementTab] = useState("duckdb");
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
  const [previewQuery, setPreviewQuery] = useState("");

  const columnTypeMap = useMemo(
    () =>
      buildColumnTypeMap(
        queryContext.initialColumns || queryResults.columns || []
      ),
    [queryContext.initialColumns, queryResults.columns]
  );

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    const root = document.documentElement;
    const body = document.body;

    if (isDarkMode) {
      root.classList.add("dark");
      try {
        localStorage.setItem(THEME_STORAGE_KEY, "dark");
      } catch {
        // ignore
      }
    } else {
      root.classList.remove("dark");
      try {
        localStorage.setItem(THEME_STORAGE_KEY, "light");
      } catch {
        // ignore
      }
    }

    if (body) {
      body.classList.add("dq-theme");
      body.classList.remove("dq-theme--dark", "dq-theme--light");
      body.classList.add(isDarkMode ? "dq-theme--dark" : "dq-theme--light");
    }

    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("duckquery-theme-change", {
          detail: { isDark: isDarkMode }
        })
      );
    }

    return () => {
      if (body) {
        body.classList.remove("dq-theme", "dq-theme--dark", "dq-theme--light");
      }
    };
  }, [isDarkMode]);

  const executeLoadInitialData = async (force = false) => {
    const now = Date.now();

    if (isLoading) {
      return;
    }

    setIsLoading(true);
    setLastFetchTime(now);

    try {
      const [
        dataSourcesRes,
        connectionsRes,
        duckdbSummaryRes
      ] = await Promise.all([
        getMySQLDataSources(),
        listDatabaseConnections(),
        fetchDuckDBTableSummaries()
      ]);

      let allDataSources = [];

      if (dataSourcesRes.success) {
        const mysqlSources = dataSourcesRes.connections || [];
        allDataSources = [...allDataSources, ...mysqlSources];
      }

      const duckdbSummaries = Array.isArray(duckdbSummaryRes?.tables)
        ? duckdbSummaryRes.tables
        : [];

      if (duckdbSummaries.length > 0) {
        const duckdbSources = duckdbSummaries.map(summary => {
          const tableName = summary.table_name || summary.name;
          const columns = transformMetadataColumns(null);
          const columnCount = summary.column_count || columns.length;
          const createdAt = summary.created_at || null;
          const rowCount = summary.row_count || 0;

          return {
            id: tableName,
            name: tableName,
            sourceType: "duckdb",
            type: "table",
            columns,
            columnCount,
            row_count: rowCount,
            createdAt
          };
        });

        duckdbSources.sort((a, b) => {
          if (!a.createdAt && !b.createdAt) return 0;
          if (!a.createdAt) return 1;
          if (!b.createdAt) return -1;
          const timeA = new Date(a.createdAt);
          const timeB = new Date(b.createdAt);
          return timeB - timeA;
        });

        allDataSources = [...allDataSources, ...duckdbSources];
      }

      allDataSources.sort((a, b) => {
        if (!a.createdAt && !b.createdAt) return 0;
        if (!a.createdAt) return 1;
        if (!b.createdAt) return -1;
        const timeA = new Date(a.createdAt);
        const timeB = new Date(b.createdAt);
        return timeB - timeA;
      });

      setDataSources(allDataSources);

      const validSelectedSources = selectedSources.filter(selectedSource =>
        allDataSources.some(ds => ds.id === selectedSource.id)
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
    } catch {
      // ignore load errors
    } finally {
      setIsLoading(false);
    }
  };

  const loadInitialData = async (force = false) => {
    if (force) {
      await executeLoadInitialData(force);
      return;
    }

    const debounceKey = `loadInitialData_${force ? "force" : "normal"}`;

    return globalDebounce.debounce(debounceKey, async () => {
      await executeLoadInitialData(force);
    });
  };

  useEffect(() => {
    loadInitialData(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const fetchStars = async () => {
      try {
        const response = await fetch(
          "https://api.github.com/repos/chenkeliang/duckdb-query"
        );
        if (response.ok) {
          const data = await response.json();
          setGithubStars(data.stargazers_count || null);
        }
      } catch {
        // ignore
      }
    };
    fetchStars();
  }, []);

  useEffect(() => {
    if (refreshTrigger > 0) {
      loadInitialData(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshTrigger]);

  const triggerRefresh = () => {
    requestManager.clearAllCache();
    setRefreshTrigger(value => value + 1);
    loadInitialData(true);
  };

  const handleResultsReceived = results => {
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
      setQueryResults(prev => ({
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

      if (
        queryContext.datasource &&
        queryContext.sourceType &&
        queryContext.sourceType !== "duckdb"
      ) {
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
        originalDatasource:
          queryContext.datasource || queryResults.originalDatasource || null
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

  const handleFileUpload = async file => {
    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData
      });

      if (!response.ok) {
        throw new Error(`上传失败: ${response.status}`);
      }

      const result = await response.json();
      triggerRefresh();
      return result;
    } catch (error) {
      throw error;
    }
  };

  const handleDatabaseConnect = async connectionParams => {
    try {
      if (connectionParams.type === "mysql") {
        const connectionData = {
          id: connectionParams.id,
          name: connectionParams.id,
          type: connectionParams.type,
          params: connectionParams.params
        };

        const testResult = await testDatabaseConnection({
          type: connectionParams.type,
          params: connectionParams.params
        });

        if (!testResult.success) {
          throw new Error(testResult.message || "数据库连接测试失败");
        }

        const createResult = await createDatabaseConnection(connectionData);

        if (createResult.success) {
          triggerRefresh();
          return {
            success: true,
            message: "数据库连接创建成功",
            connection: createResult.connection
          };
        }
        throw new Error(createResult.message || "数据库连接创建失败");
      }
      triggerRefresh();
      return { success: true, message: "数据库连接成功" };
    } catch (error) {
      throw error;
    }
  };

  const handleDatabaseSaveConfig = async connectionParams => {
    try {
      if (connectionParams.type === "mysql") {
        const connectionData = {
          id: connectionParams.id,
          name: connectionParams.id,
          type: connectionParams.type,
          params: connectionParams.params
        };

        const createResult = await createDatabaseConnection(connectionData);

        if (createResult.success) {
          triggerRefresh();
          return {
            success: true,
            message: "数据库配置已保存",
            connection: createResult.connection
          };
        }
        throw new Error(createResult.message || "数据库配置保存失败");
      }
      triggerRefresh();
      return { success: true, message: "数据库配置已保存" };
    } catch (error) {
      throw error;
    }
  };

  const handleCloseWelcome = () => {
    const welcomeShownKey = "duck-query-welcome-shown";
    if (typeof window !== "undefined") {
      localStorage.setItem(welcomeShownKey, new Date().toISOString());
    }
    setShowWelcome(false);
  };

  return {
    state: {
      showWelcome,
      isDarkMode,
      currentTab,
      tableManagementTab,
      dataSources,
      databaseConnections,
      selectedSources,
      queryResults,
      activeFilters,
      resultsLoading,
      queryContext,
      refreshTrigger,
      lastFetchTime,
      isLoading,
      previewQuery,
      githubStars,
      columnTypeMap
    },
    actions: {
      setShowWelcome,
      setIsDarkMode,
      setCurrentTab,
      setTableManagementTab,
      setSelectedSources,
      setPreviewQuery,
      triggerRefresh,
      handleResultsReceived,
      handleApplyResultFilters,
      handleDatabaseConnect,
      handleDatabaseSaveConfig,
      handleFileUpload,
      handleCloseWelcome,
      setQueryResults,
      setQueryContext
    }
  };
};

export default useDuckQuery;
export { THEME_STORAGE_KEY };
