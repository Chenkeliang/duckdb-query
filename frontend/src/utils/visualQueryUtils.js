/**
 * Visual Query Builder Utilities
 * 可视化查询构建器的工具函数
 */

// 导入escapeIdentifier函数
import { escapeIdentifier } from './visualQueryGenerator';

const SQL_IDENTIFIER_REGEX = /"([^"]+)"|([\p{L}\p{N}_][\p{L}\p{N}_\.]*)/gu;
const RESERVED_SQL_IDENTIFIERS = new Set([
  'AND',
  'OR',
  'NOT',
  'CASE',
  'WHEN',
  'THEN',
  'ELSE',
  'END',
  'NULL',
  'TRUE',
  'FALSE',
  'TRY_CAST',
  'CAST',
  'DATE',
  'TIME',
  'TIMESTAMP',
  'COALESCE',
  'IF',
  'IFNULL',
  'IN',
  'EXISTS',
  'BETWEEN',
  'LIKE',
  'ILIKE',
  'SIMILAR',
  'AS',
  'IS',
  'SUM',
  'AVG',
  'COUNT',
  'MIN',
  'MAX',
  'MEDIAN',
  'MODE',
  'ROUND',
  'ABS',
  'UPPER',
  'LOWER',
  'LEFT',
  'RIGHT',
  'SUBSTRING',
  'TRIM',
  'LENGTH',
  'POWER',
  'LOG',
  'EXP',
  'RANK',
  'DENSE_RANK',
  'ROW_NUMBER',
  'OVER',
  'PARTITION',
]);

const resolveCastForIdentifier = (castsMap = {}, identifier = '') => {
  if (!identifier) {
    return null;
  }
  const normalized = identifier.toLowerCase();
  if (castsMap[normalized]) {
    return castsMap[normalized];
  }
  if (normalized.includes('.')) {
    const segments = normalized.split('.');
    const last = segments[segments.length - 1];
    if (last && castsMap[last]) {
      return castsMap[last];
    }
  }
  return null;
};

const applyResolvedCastsToExpression = (expression, castsMap = {}) => {
  if (
    !expression ||
    !castsMap ||
    Object.keys(castsMap || {}).length === 0
  ) {
    return expression;
  }

  return expression.replace(
    SQL_IDENTIFIER_REGEX,
    (match, quoted, bare, offset, fullExpression) => {
      const identifier = quoted ?? bare;
      if (!identifier) {
        return match;
      }
      const upper = identifier.toUpperCase();
      if (RESERVED_SQL_IDENTIFIERS.has(upper)) {
        return match;
      }
      const cast =
        resolveCastForIdentifier(castsMap, identifier) ??
        resolveCastForIdentifier(castsMap, identifier.replace(/"/g, ''));
      if (!cast) {
        return match;
      }
      const preceding = fullExpression.slice(0, offset);
      if (/TRY_CAST\s*\([^)]*$/i.test(preceding)) {
        return match;
      }
      const safeIdentifier = quoted ? `"${identifier}"` : identifier;
      return `TRY_CAST(${safeIdentifier} AS ${cast})`;
    },
  );
};

// 创建默认配置
export const createDefaultConfig = (tableName = "") => ({
  tableName: tableName,
  selectedColumns: [],
  aggregations: [],
  filters: [],
  having: [],
  orderBy: [],
  groupBy: [],
  calculatedFields: [],
  conditionalFields: [],
  windowFunctions: [],
  limit: null,
  isDistinct: false,
  jsonTables: [],
});

export const PivotValueAxis = {
  ROWS: 'rows',
  COLUMNS: 'columns',
};

export const createDefaultPivotConfig = () => ({
  rows: [],
  columns: [],
  values: [
    {
      column: '',
      aggregation: AggregationFunction.SUM,
      alias: '',
    },
  ],
  fillValue: '',
  manualColumnValues: [],
  // 默认策略为 auto（优先原生，必要时采用自动采样）
  strategy: 'auto',
  // 列数量上限（Top-N 自动采样），避免列爆炸；可由用户修改或留空
  columnValueLimit: 12,
});

export const transformPivotConfigForApi = (pivotConfig) => {
  if (!pivotConfig) {
    return undefined;
  }

  const values = Array.isArray(pivotConfig.values)
    ? pivotConfig.values
      .filter((item) => item && item.column)
      .map((item) => ({
        column: item.column,
        aggregation: item.aggregation || AggregationFunction.SUM,
        alias: item.alias && item.alias.trim() ? item.alias.trim() : undefined,
        typeConversion: item.typeConversion && item.typeConversion !== 'auto' ? item.typeConversion : undefined,
      }))
    : [];

  const manualColumnValues = Array.isArray(pivotConfig.manualColumnValues)
    ? pivotConfig.manualColumnValues.filter((value) => value && String(value).trim())
    : [];

  return {
    rows: Array.isArray(pivotConfig.rows) ? pivotConfig.rows.filter(Boolean) : [],
    columns: Array.isArray(pivotConfig.columns) ? pivotConfig.columns.filter(Boolean) : [],
    values,
    fill_value: pivotConfig.fillValue !== undefined && pivotConfig.fillValue !== ''
      ? pivotConfig.fillValue
      : null,
    manual_column_values: manualColumnValues.length > 0 ? manualColumnValues : undefined,
    // 强制使用原生PIVOT策略（因为扩展不可用）
    strategy: 'native',
    // 透传列数量上限（正整数才发送）
    column_value_limit: (() => {
      const raw = pivotConfig.columnValueLimit;
      const num = Number(raw);
      return Number.isFinite(num) && num > 0 ? num : undefined;
    })(),
  };
};

const sanitizeAggregation = (aggregation) => {
  if (!aggregation || !aggregation.column || !aggregation.function) {
    return null;
  }

  return {
    column: aggregation.column,
    function: aggregation.function,
    alias: aggregation.alias && aggregation.alias.trim() ? aggregation.alias.trim() : undefined,
  };
};

const numericTypeTokens = ['int', 'integer', 'bigint', 'smallint', 'tinyint', 'decimal', 'numeric', 'double', 'float', 'real'];
const dateTypeTokens = ['date', 'timestamp', 'datetime', 'time'];

const normalizeFilterDataType = (rawType) => {
  if (!rawType) {
    return null;
  }
  const token = rawType.toString().toLowerCase();
  if (numericTypeTokens.some((item) => token.includes(item))) {
    return 'number';
  }
  if (dateTypeTokens.some((item) => token.includes(item))) {
    return 'date';
  }
  if (token.includes('bool')) {
    return 'boolean';
  }
  return 'string';
};

const coerceFilterValue = (rawValue, dataType) => {
  if (rawValue === null || rawValue === undefined) {
    return null;
  }

  if (typeof rawValue === 'string') {
    const trimmed = rawValue.trim();
    if (trimmed === '') {
      return null;
    }
    rawValue = trimmed;
  }

  switch (dataType) {
    case 'number': {
      const num = Number(rawValue);
      return Number.isFinite(num) ? num : rawValue;
    }
    case 'boolean': {
      if (typeof rawValue === 'boolean') {
        return rawValue;
      }
      const lowered = rawValue.toString().toLowerCase();
      if (['true', '1', 'yes', 'y', 't'].includes(lowered)) {
        return true;
      }
      if (['false', '0', 'no', 'n', 'f'].includes(lowered)) {
        return false;
      }
      return rawValue;
    }
    case 'date': {
      // 保留字符串形式，后端会按 DuckDB 解析
      return rawValue.toString();
    }
    default:
      return rawValue;
  }
};

export const sanitizeFilter = (filter) => {
  if (!filter || !filter.operator) {
    return null;
  }

  const valueType = filter.valueType || filter.value_type || FilterValueType.CONSTANT;
  const columnType = normalizeFilterDataType(filter.columnType || filter.column_type);
  const rightColumnType = normalizeFilterDataType(filter.rightColumnType || filter.right_column_type);
  const rawCast =
    filter.cast ||
    filter.tryCast ||
    filter.castTarget ||
    filter.expressionCast ||
    filter.expression_cast ||
    null;

  let columnName = filter.column ?? filter.column_name ?? null;
  if (typeof columnName === 'string') {
    columnName = columnName.trim();
    if (columnName === '') {
      columnName = null;
    }
  }

  const sanitized = {
    column: columnName,
    operator: filter.operator,
    value: filter.value !== undefined ? filter.value : null,
    value2: filter.value2 !== undefined ? filter.value2 : null,
    logic_operator: (filter.logicOperator || filter.logic_operator || LogicOperator.AND).toString().toUpperCase(),
    value_type: valueType,
  };

  if (valueType === FilterValueType.EXPRESSION) {
    const expression = filter.expression;
    if (expression && expression.trim()) {
      sanitized.expression = expression.trim();
    } else {
      return null;
    }
    if (rawCast && typeof rawCast === 'string' && rawCast.trim()) {
      sanitized.cast = rawCast.trim().toUpperCase();
    }
    sanitized.value = null;
    sanitized.value2 = null;
    if (columnType) {
      sanitized.column_type = columnType;
    }
    if (rightColumnType) {
      sanitized.right_column_type = rightColumnType;
    }
    return sanitized;
  }

  if (!columnName) {
    return null;
  }

  if (columnType) {
    sanitized.column_type = columnType;
  }

  if (valueType === FilterValueType.COLUMN) {
    const rawRight = filter.rightColumn || filter.right_column;
    const rightColumn = rawRight && rawRight.trim ? rawRight.trim() : rawRight;
    if (rightColumn) {
      sanitized.right_column = rightColumn;
      if (rightColumnType) {
        sanitized.right_column_type = rightColumnType;
      }
    }
    sanitized.value = null;
    sanitized.value2 = null;
  } else {
    sanitized.value = coerceFilterValue(sanitized.value, columnType);
    sanitized.value2 = coerceFilterValue(sanitized.value2, columnType);
  }

  return sanitized;
};

const sanitizeSort = (sort, index = 0) => {
  if (!sort || !sort.column) {
    return null;
  }

  return {
    column: sort.column,
    direction: sort.direction || SortDirection.ASC,
    priority: typeof sort.priority === 'number' ? sort.priority : index,
  };
};

const sanitizeCalculatedField = (field) => {
  if (!field || !field.name || !field.expression) {
    return null;
  }

  return {
    id: field.id || field.name,
    name: field.name,
    expression: field.expression,
    type: field.type,
    operation: field.operation,
    params: field.params || undefined,
  };
};

const sanitizeConditionalField = (field) => {
  if (!field || !field.name || !field.type) {
    return null;
  }

  const conditions = Array.isArray(field.conditions)
    ? field.conditions
      .map((condition) => {
        if (!condition || !condition.column || !condition.operator || !condition.result) {
          return null;
        }

        return {
          column: condition.column,
          operator: condition.operator,
          value: condition.value !== undefined ? condition.value : null,
          result: condition.result,
        };
      })
      .filter(Boolean)
    : undefined;

  return {
    id: field.id || field.name,
    name: field.name,
    type: field.type,
    conditions,
    default_value: field.defaultValue !== undefined ? field.defaultValue : field.default_value,
    column: field.column || null,
    bins: field.bins !== undefined ? field.bins : null,
    binning_type: field.binningType || field.binning_type || null,
  };
};

const sanitizeJsonTableColumn = (column) => {
  if (!column) {
    return null;
  }

  const rawName = column.name || column.alias || column.outputName;
  if (!rawName || !String(rawName).trim()) {
    return null;
  }

  const ordinal = Boolean(
    column.ordinal || column.isOrdinal || column.forOrdinality,
  );
  const rawType = (column.dataType || column.data_type || 'VARCHAR').toString().trim();
  const resolvedType = rawType ? rawType.toUpperCase() : 'VARCHAR';
  const rawPath = column.path || column.jsonPath || column.path_expression;
  const cleanedPath = rawPath && String(rawPath).trim();
  const defaultValue = column.defaultValue ?? column.default ?? column.fallbackValue;
  const hasDefault = defaultValue !== undefined && defaultValue !== null && `${defaultValue}`.length > 0;

  return {
    name: String(rawName).trim(),
    data_type: resolvedType,
    path: ordinal ? undefined : cleanedPath || '$',
    default: ordinal ? undefined : hasDefault ? defaultValue : undefined,
    ordinal,
  };
};

const sanitizeJsonTableConfig = (table) => {
  if (!table) {
    return null;
  }

  const sourceColumn = table.sourceColumn || table.source_column;
  if (!sourceColumn || !String(sourceColumn).trim()) {
    return null;
  }

  const columns = Array.isArray(table.columns)
    ? table.columns.map(sanitizeJsonTableColumn).filter(Boolean)
    : [];

  if (columns.length === 0) {
    return null;
  }

  const alias = table.alias || table.tableAlias;
  const rootPath = table.rootPath || table.root_path || '$';
  const joinType = (table.joinType || table.join_type || (table.outer_join === false ? 'inner' : 'left'))
    .toString()
    .toLowerCase();

  return {
    source_column: String(sourceColumn).trim(),
    alias: alias && String(alias).trim() ? String(alias).trim() : undefined,
    root_path: rootPath && String(rootPath).trim() ? String(rootPath).trim() : '$',
    outer_join: joinType !== 'inner',
    columns,
  };
};

export const transformVisualConfigForApi = (config, tableName) => {
  if (!config) {
    return null;
  }

  const safeTableName = tableName || config.tableName || config.table_name || '';

  const aggregations = (config.aggregations || [])
    .map(sanitizeAggregation)
    .filter(Boolean);

  const filters = (config.filters || [])
    .map(sanitizeFilter)
    .filter(Boolean);

  const having = (config.having || [])
    .map(sanitizeFilter)
    .filter(Boolean);

  const orderBy = (config.orderBy || config.order_by || [])
    .map(sanitizeSort)
    .filter(Boolean);

  const calculatedFields = (config.calculatedFields || config.calculated_fields || [])
    .map(sanitizeCalculatedField)
    .filter(Boolean);

  const conditionalFields = (config.conditionalFields || config.conditional_fields || [])
    .map(sanitizeConditionalField)
    .filter(Boolean);

  const jsonTables = (config.jsonTables || config.json_tables || [])
    .map(sanitizeJsonTableConfig)
    .filter(Boolean);

  const payload = {
    table_name: safeTableName,
    selected_columns: (config.selectedColumns || config.selected_columns || []).filter(Boolean),
    aggregations,
    calculated_fields: calculatedFields,
    conditional_fields: conditionalFields,
    filters,
    having,
    group_by: (config.groupBy || config.group_by || []).filter(Boolean),
    order_by: orderBy,
    limit: (() => {
      const rawLimit = config.limit;
      if (rawLimit === undefined || rawLimit === null || rawLimit === '') {
        return null;
      }
      const parsed = Number(rawLimit);
      return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
    })(),
    is_distinct: Boolean(config.isDistinct || config.is_distinct),
  };

  if (jsonTables.length > 0) {
    payload.json_tables = jsonTables;
  }

  return payload;
};

// 聚合函数类型
export const AggregationFunction = {
  SUM: "SUM",
  AVG: "AVG",
  COUNT: "COUNT",
  MIN: "MIN",
  MAX: "MAX",
  COUNT_DISTINCT: "COUNT_DISTINCT",
};

// 筛选操作符
export const FilterOperator = {
  EQUAL: "=",
  NOT_EQUAL: "!=",
  GREATER_THAN: ">",
  LESS_THAN: "<",
  GREATER_EQUAL: ">=",
  LESS_EQUAL: "<=",
  LIKE: "LIKE",
  IS_NULL: "IS NULL",
  IS_NOT_NULL: "IS NOT NULL",
  BETWEEN: "BETWEEN",
  IN: "IN",
  NOT_IN: "NOT IN",
};

export const FilterValueType = {
  CONSTANT: "constant",
  COLUMN: "column",
  EXPRESSION: "expression",
};

// 排序方向
export const SortDirection = {
  ASC: "ASC",
  DESC: "DESC",
};

// 逻辑操作符
export const LogicOperator = {
  AND: "AND",
  OR: "OR",
};

// 数据类型检测
export const detectColumnType = (columnName, sampleValues = []) => {
  if (!sampleValues || sampleValues.length === 0) {
    return "text";
  }

  const nonNullValues = sampleValues.filter(
    (v) => v !== null && v !== undefined && v !== "",
  );
  if (nonNullValues.length === 0) return "text";

  // 检查是否为数字
  const isNumeric = nonNullValues.every(
    (v) => !isNaN(parseFloat(v)) && isFinite(v),
  );
  if (isNumeric) {
    const hasDecimals = nonNullValues.some((v) => parseFloat(v) % 1 !== 0);
    return hasDecimals ? "decimal" : "integer";
  }

  // 检查是否为日期
  const isDate = nonNullValues.every((v) => !isNaN(Date.parse(v)));
  if (isDate) return "date";

  // 检查是否为布尔值
  const isBool = nonNullValues.every(
    (v) =>
      v === true ||
      v === false ||
      v === "true" ||
      v === "false" ||
      v === 1 ||
      v === 0 ||
      v === "1" ||
      v === "0",
  );
  if (isBool) return "boolean";

  return "text";
};

const MULTI_VALUE_SPLIT_REGEX = /[\s]*[\uFF0C,;；、\n\r]+[\s]*/;

const NUMERIC_VALUE_REGEX = /^[-+]?\d+(?:\.\d+)?(?:e[-+]?\d+)?$/i;

const BOOLEAN_TRUE_SET = new Set(["true", "t", "1", "yes", "y"]);
const BOOLEAN_FALSE_SET = new Set(["false", "f", "0", "no", "n"]);

export function parseFilterValueList(input) {
  if (!input && input !== 0) {
    return [];
  }

  if (Array.isArray(input)) {
    return Array.from(
      new Set(
        input
          .map((value) =>
            typeof value === "string" ? value.trim() : value
          )
          .filter((value) => value !== null && value !== undefined && value !== "")
      )
    );
  }

  return Array.from(
    new Set(
      String(input)
        .split(MULTI_VALUE_SPLIT_REGEX)
        .map((value) => value.trim())
        .filter((value) => value !== "")
    )
  );
}

export function resolveFilterValues(filter) {
  if (!filter) {
    return [];
  }

  if (typeof filter.valuesInput === "string") {
    const parsed = parseFilterValueList(filter.valuesInput);
    if (parsed.length > 0) {
      return parsed;
    }
  }

  if (Array.isArray(filter.values) && filter.values.length > 0) {
    return filter.values;
  }

  if (Array.isArray(filter.value) && filter.value.length > 0) {
    return filter.value.filter((item) => item !== null && item !== undefined && item !== "");
  }

  if (filter.value !== undefined && filter.value !== null && filter.value !== "") {
    return parseFilterValueList(filter.value);
  }

  return [];
}

function normalizeBooleanToken(value) {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "boolean") {
    return value;
  }

  const normalized = String(value).trim().toLowerCase();

  if (BOOLEAN_TRUE_SET.has(normalized)) {
    return true;
  }

  if (BOOLEAN_FALSE_SET.has(normalized)) {
    return false;
  }

  return null;
}

function escapeSqlLiteral(value) {
  if (value === null || value === undefined) {
    return "NULL";
  }

  const stringValue = String(value);
  return `'${stringValue.replace(/\\/g, "\\\\").replace(/'/g, "''")}'`;
}

function formatJsonTableColumnAlias(name) {
  if (!name || !String(name).trim()) {
    return escapeIdentifier("column");
  }
  return escapeIdentifier(String(name).trim());
}

function buildJsonProjection(column, valueReference, allowRowId = false, rowIdAlias = "") {
  const columnIdentifier = formatJsonTableColumnAlias(column.name);
  if (!columnIdentifier) {
    return "";
  }

  if (column.ordinal) {
    if (allowRowId && rowIdAlias) {
      return `COALESCE(${rowIdAlias}.rowid, 0) + 1 AS ${columnIdentifier}`;
    }
    return `1 AS ${columnIdentifier}`;
  }

  const normalizedType = (column.dataType || "VARCHAR").toUpperCase();
  const pathLiteral = escapeSqlLiteral(column.path || "$");
  const extractor = isTextualJsonType(normalizedType) ? "json_extract_string" : "json_extract";
  const extraction = `${extractor}(${valueReference}, ${pathLiteral})`;
  let projection = `TRY_CAST(${extraction} AS ${normalizedType})`;

  if (column.defaultValue !== undefined) {
    const defaultLiteral = formatJsonDefaultLiteral(column.defaultValue, normalizedType);
    const typedDefault = `TRY_CAST(${defaultLiteral} AS ${normalizedType})`;
    projection = `COALESCE(${projection}, ${typedDefault})`;
  }

  return `${projection} AS ${columnIdentifier}`;
}

function formatJsonDefaultLiteral(value, dataType = "VARCHAR") {
  if (value === null || value === undefined) {
    return "NULL";
  }

  const upperType = dataType.toUpperCase();

  if (upperType.includes("INT") || upperType.includes("NUMERIC") || upperType.includes("DECIMAL") ||
    upperType.includes("FLOAT") || upperType.includes("DOUBLE") || upperType.includes("REAL")) {
    const numValue = Number(value);
    if (Number.isNaN(numValue)) {
      throw new Error(`无效的数值: ${value}`);
    }
    return String(numValue);
  }

  if (upperType.includes("BOOL")) {
    return value ? "TRUE" : "FALSE";
  }

  if (upperType.includes("DATE") || upperType.includes("TIME") || upperType.includes("TIMESTAMP")) {
    return escapeSqlLiteral(value);
  }

  return escapeSqlLiteral(value);
}

function resolveJsonEachSource(sourceExpr, rootPath) {
  const normalizedPath = (rootPath || "$").trim() || "$";
  const hasWildcard = /[\*\?]/.test(normalizedPath);
  if (normalizedPath === "$") {
    return { jsonSource: sourceExpr, pathLiteral: null, needsIteration: false };
  }
  if (hasWildcard) {
    const literal = escapeSqlLiteral(normalizedPath);
    const extracted = `json_extract(${sourceExpr}, ${literal})`;
    return { jsonSource: `json(${extracted})`, pathLiteral: null, needsIteration: true };
  }
  return {
    jsonSource: sourceExpr,
    pathLiteral: escapeSqlLiteral(normalizedPath),
    needsIteration: true,
  };
}

function isTextualJsonType(dataType) {
  if (!dataType) {
    return true;
  }
  const markers = ["CHAR", "TEXT", "STRING", "VARCHAR"];
  return markers.some((marker) => dataType.includes(marker));
}

export function normalizeColumnTypeName(rawType, sampleValues = []) {
  if (rawType && typeof rawType === "string") {
    const type = rawType.toLowerCase();

    if (/int|decimal|numeric|double|float|real|bigint|smallint|tinyint|number/.test(type)) {
      return "number";
    }

    if (/bool|bit/.test(type)) {
      return "boolean";
    }

    if (/date|time|timestamp/.test(type)) {
      return "datetime";
    }

    if (/json|map|array|struct|variant/.test(type)) {
      return "json";
    }

    return "string";
  }

  if (sampleValues && sampleValues.length > 0) {
    const detected = detectColumnType("", sampleValues);

    switch (detected) {
      case "integer":
      case "decimal":
        return "number";
      case "date":
        return "datetime";
      case "boolean":
        return "boolean";
      default:
        return "string";
    }
  }

  return "string";
}

function buildColumnTypeMap(columns = []) {
  const map = new Map();

  columns.forEach((column) => {
    if (column === null || column === undefined) {
      return;
    }

    if (typeof column === "string") {
      const info = { rawType: "text", normalizedType: "string" };
      map.set(column, info);
      map.set(column.toLowerCase(), info);
      return;
    }

    if (typeof column === "object") {
      const columnName =
        column.name ||
        column.column ||
        column.columnName ||
        column.id ||
        column.field;

      if (!columnName) {
        return;
      }

      const rawType =
        column.dataType ||
        column.type ||
        column.columnType ||
        column.sqlType ||
        column.dtype ||
        column.valueType ||
        column.jsType ||
        null;

      const sampleValues = column.sampleValues || column.samples || [];
      const info = {
        rawType,
        normalizedType: normalizeColumnTypeName(rawType, sampleValues)
      };

      const lowerName = columnName.toLowerCase();
      map.set(columnName, info);
      map.set(lowerName, info);

      if (column.table) {
        const qualified = `${column.table}.${columnName}`;
        map.set(qualified, info);
        map.set(qualified.toLowerCase(), info);
      }

      return;
    }
  });

  return map;
}

function resolveColumnInfo(typeMap, columnName) {
  if (!typeMap || !columnName) {
    return null;
  }

  if (typeMap.has(columnName)) {
    return typeMap.get(columnName);
  }

  const lower = columnName.toLowerCase();
  if (typeMap.has(lower)) {
    return typeMap.get(lower);
  }

  if (columnName.includes(".")) {
    const simple = columnName.split(".").pop();
    if (simple) {
      if (typeMap.has(simple)) {
        return typeMap.get(simple);
      }
      const lowerSimple = simple.toLowerCase();
      if (typeMap.has(lowerSimple)) {
        return typeMap.get(lowerSimple);
      }
    }
  }

  return null;
}

function formatValueForColumn(value, columnInfo) {
  if (value === null || value === undefined) {
    return { literal: null, isNull: true };
  }

  if (typeof value === "number" || typeof value === "bigint") {
    return { literal: String(value), isNull: false };
  }

  const stringValue = String(value);
  const trimmed = stringValue.trim();
  const normalizedType = columnInfo?.normalizedType || "unknown";

  if (normalizedType === "number") {
    if (NUMERIC_VALUE_REGEX.test(trimmed)) {
      return { literal: trimmed, isNull: false };
    }

    const numeric = Number(trimmed.replace(/,/g, ""));
    if (!Number.isNaN(numeric)) {
      return { literal: String(numeric), isNull: false };
    }

    return { literal: escapeSqlLiteral(stringValue), isNull: false };
  }

  if (normalizedType === "boolean") {
    const boolValue = normalizeBooleanToken(trimmed);
    if (boolValue !== null) {
      return { literal: boolValue ? "TRUE" : "FALSE", isNull: false };
    }
    return { literal: escapeSqlLiteral(stringValue), isNull: false };
  }

  if (normalizedType === "datetime") {
    return { literal: escapeSqlLiteral(trimmed), isNull: false };
  }

  if (normalizedType === "json") {
    return { literal: escapeSqlLiteral(stringValue), isNull: false };
  }

  if (normalizedType === "string") {
    return { literal: escapeSqlLiteral(stringValue), isNull: false };
  }

  if (normalizedType === "unknown") {
    const boolValue = normalizeBooleanToken(trimmed);
    if (boolValue !== null) {
      return { literal: boolValue ? "TRUE" : "FALSE", isNull: false };
    }

    if (NUMERIC_VALUE_REGEX.test(trimmed)) {
      return { literal: trimmed, isNull: false };
    }

    return { literal: escapeSqlLiteral(stringValue), isNull: false };
  }

  return { literal: escapeSqlLiteral(stringValue), isNull: false };
}

function buildInCondition(column, filter, columnInfo, operator) {
  const effectiveValues = resolveFilterValues(filter);

  if (!effectiveValues || effectiveValues.length === 0) {
    return "";
  }

  const formattedValues = effectiveValues.map((item) =>
    formatValueForColumn(item, columnInfo)
  );

  const nonNullLiterals = formattedValues
    .filter((item) => !item.isNull && item.literal !== null)
    .map((item) => item.literal);
  const hasNull = formattedValues.some((item) => item.isNull);

  const clauses = [];

  if (nonNullLiterals.length > 0) {
    clauses.push(`${column} ${operator} (${nonNullLiterals.join(", ")})`);
  }

  if (hasNull) {
    clauses.push(
      operator === FilterOperator.NOT_IN
        ? `${column} IS NOT NULL`
        : `${column} IS NULL`
    );
  }

  if (clauses.length === 0) {
    return "";
  }

  if (clauses.length === 1) {
    return clauses[0];
  }

  return operator === FilterOperator.NOT_IN
    ? `(${clauses.join(" AND ")})`
    : `(${clauses.join(" OR ")})`;
}

// 生成SQL预览
export const generateSQLPreview = (config, tableName, columns = [], options = {}) => {
  const errors = [];
  const warnings = [];

  if (!tableName || tableName.trim() === "") {
    errors.push("表名不能为空");
    return { success: false, errors, warnings };
  }

  try {
    let sql = "";
    const columnTypeMap = buildColumnTypeMap(columns || []);
    const resolvedCastsMap = Object.entries(options.resolvedCasts || {}).reduce(
      (acc, [column, cast]) => {
        if (column && cast) {
          acc[column.toLowerCase()] = cast;
        }
        return acc;
      },
      {},
    );

    const applyColumnCast = (rawName, formattedExpression) => {
      if (!rawName || !formattedExpression) {
        return formattedExpression;
      }
      const cast = resolveCastForIdentifier(resolvedCastsMap, rawName);
      if (!cast) {
        return formattedExpression;
      }
      return `TRY_CAST(${formattedExpression} AS ${cast})`;
    };

    const applyExpressionCasts = (expr) =>
      applyResolvedCastsToExpression(expr, resolvedCastsMap);

    const normalizeJsonTables = () => {
      if (Array.isArray(config.jsonTables)) {
        return config.jsonTables;
      }
      if (Array.isArray(config.json_tables)) {
        return config.json_tables;
      }
      return [];
    };

    const jsonTableConfigs = normalizeJsonTables();

    const buildJsonSelectReferences = (tables = []) => {
      const refs = [];
      const seen = new Set();

      (Array.isArray(tables) ? tables : []).forEach((tableConfig, index) => {
        if (!tableConfig || tableConfig.disabled) {
          return;
        }
        const alias =
          (tableConfig.alias || tableConfig.tableAlias || `json_table_${index + 1}`).toString().trim();
        if (!alias) {
          return;
        }
        const escapedAlias = escapeIdentifier(alias);
        const columns = Array.isArray(tableConfig.columns) ? tableConfig.columns : [];
        columns.forEach((column) => {
          if (!column || column.disabled) {
            return;
          }
          const columnName = column.alias || column.name || column.outputName;
          if (!columnName || !String(columnName).trim()) {
            return;
          }
          const reference = `${escapedAlias}.${formatJsonTableColumnAlias(columnName)}`;
          if (!seen.has(reference)) {
            seen.add(reference);
            refs.push(reference);
          }
        });
      });

      return refs;
    };

    // SELECT 子句
    const selectItems = [];

    // 添加选中的列
    if (config.selectedColumns && config.selectedColumns.length > 0) {
      config.selectedColumns.forEach((col) => {
        if (typeof col === "string") {
          selectItems.push(escapeIdentifier(col));
        } else if (col.name) {
          selectItems.push(escapeIdentifier(col.name));
        }
      });
    }

    // 添加聚合函数
    if (config.aggregations && config.aggregations.length > 0) {
      config.aggregations.forEach((agg) => {
        if (agg.function && agg.column) {
          try {
            // 获取列的类型信息
            const columnTypeInfo = getColumnTypeInfo(agg.column);

            // 使用类型安全的聚合函数生成
            const resolvedCast = resolvedCastsMap[agg.column.toLowerCase()];
            const aggStr = generateAggregationSQL(
              agg,
              columnTypeInfo.type,
              resolvedCast,
            );
            selectItems.push(aggStr);
          } catch (error) {
            // 如果类型转换失败，使用原始方式但添加警告
            warnings.push(
              `聚合函数 ${agg.function}(${agg.column}): ${error.message}`,
            );
            const aggStr = `${agg.function}(${agg.column})${agg.alias ? ` AS ${agg.alias}` : ""}`;
            selectItems.push(aggStr);
          }
        }
      });
    }

    // 添加计算字段
    if (config.calculatedFields && config.calculatedFields.length > 0) {
      config.calculatedFields.forEach((calc) => {
        const alias = calc.alias || calc.name;
        if (calc.expression && alias) {
          selectItems.push(`${calc.expression} AS ${escapeIdentifier(alias)}`);
        }
      });
    }

    const hasExplicitNonAggregationSelect =
      (config.selectedColumns && config.selectedColumns.length > 0) ||
      (config.calculatedFields && config.calculatedFields.length > 0) ||
      (config.conditionalFields && config.conditionalFields.length > 0);

    if (hasExplicitNonAggregationSelect) {
      const jsonSelectRefs = buildJsonSelectReferences(jsonTableConfigs);
      if (jsonSelectRefs.length > 0) {
        jsonSelectRefs.forEach((ref) => {
          if (!selectItems.includes(ref)) {
            selectItems.push(ref);
          }
        });
      }
    }

    // 如果没有任何选择项，默认选择所有
    if (selectItems.length === 0) {
      selectItems.push("*");
    }

    sql += `SELECT ${config.isDistinct ? "DISTINCT " : ""}${selectItems.join(", ")}`;

    const formatJsonColumnReference = (identifier) => {
      if (!identifier) {
        return '';
      }
      const trimmed = identifier.trim();
      if (!trimmed) {
        return '';
      }
      if (/[\s()+\-*/]/.test(trimmed)) {
        return trimmed;
      }
      if (trimmed.includes('.')) {
        return trimmed
          .split('.')
          .filter(Boolean)
          .map((part) => (part.includes('"') ? part : escapeIdentifier(part)))
          .join('.');
      }
      return trimmed.includes('"') ? trimmed : escapeIdentifier(trimmed);
    };

    const buildJsonTableClause = (tableConfig = {}, index = 0) => {
      const sourceColumn = tableConfig.sourceColumn || tableConfig.source_column;
      if (!sourceColumn || !String(sourceColumn).trim()) {
        return '';
      }

      const rawColumns = Array.isArray(tableConfig.columns) ? tableConfig.columns : [];
      const normalizedColumns = rawColumns
        .map((column) => {
          if (!column) {
            return null;
          }
          const columnName = column.name || column.alias || column.outputName;
          if (!columnName || !String(columnName).trim()) {
            return null;
          }
          const ordinal = Boolean(
            column.ordinal || column.isOrdinal || column.forOrdinality,
          );
          const dataType = (column.dataType || column.data_type || 'VARCHAR')
            .toString()
            .trim()
            .toUpperCase();
          const pathValue = column.path || column.jsonPath || column.path_expression || '$';
          const defaultValue = column.defaultValue ?? column.default ?? column.fallbackValue;
          const hasDefault =
            defaultValue !== undefined && defaultValue !== null && `${defaultValue}`.length > 0;

          return {
            name: String(columnName).trim(),
            ordinal,
            dataType,
            path: ordinal ? undefined : String(pathValue).trim() || '$',
            defaultValue: ordinal ? undefined : hasDefault ? defaultValue : undefined,
          };
        })
        .filter(Boolean);

      if (normalizedColumns.length === 0) {
        return '';
      }

      const alias = tableConfig.alias || tableConfig.tableAlias || `json_table_${index + 1}`;
      const joinType = (tableConfig.joinType || tableConfig.join_type || (tableConfig.outer_join === false ? 'inner' : 'left'))
        .toString()
        .toLowerCase();
      const joinKeyword = joinType === 'inner' ? 'JOIN LATERAL' : 'LEFT JOIN LATERAL';
      const sourceExpr = formatJsonColumnReference(String(sourceColumn).trim());
      const rootPath = tableConfig.rootPath || tableConfig.root_path || '$';
      const iteratorAlias = `json_each_${index + 1}`;
      const { jsonSource, pathLiteral, needsIteration } = resolveJsonEachSource(sourceExpr, rootPath);

      const columnClauses = normalizedColumns
        .map((column) =>
          buildJsonProjection(
            column,
            needsIteration ? `${iteratorAlias}.value` : jsonSource,
            needsIteration,
            iteratorAlias
          )
        )
        .filter(Boolean);

      if (columnClauses.length === 0) {
        return '';
      }

      const columnsSql = columnClauses.join(',\n        ');
      const lateralSubquery = needsIteration
        ? `(\n    SELECT\n        ${columnsSql}\n    FROM ${
            pathLiteral ? `json_each(${jsonSource}, ${pathLiteral})` : `json_each(${jsonSource})`
          } AS ${iteratorAlias}\n  )`
        : `(\n    SELECT\n        ${columnsSql}\n  )`;
      return `\n${joinKeyword} ${lateralSubquery} AS ${escapeIdentifier(alias)} ON TRUE`;
    };

    const buildFromClause = () => {
      let clause = `\nFROM ${escapeIdentifier(tableName)}`;
      jsonTableConfigs.forEach((tableConfig, idx) => {
        const joinSql = buildJsonTableClause(tableConfig, idx);
        if (joinSql) {
          clause += joinSql;
        }
      });
      return clause;
    };

    sql += buildFromClause();

    const formatColumnExpression = (column, { isHaving = false } = {}) => {
      if (!column) {
        return '';
      }
      if (typeof column !== 'string') {
        return column;
      }
      const trimmed = column.trim();
      if (isHaving && (trimmed.includes('(') || trimmed.includes(')'))) {
        return trimmed;
      }
      if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
        return trimmed;
      }
      if (trimmed.includes('.') && trimmed.includes('"')) {
        return trimmed;
      }
      if (trimmed.includes('.')) {
        return trimmed
          .split('.')
          .map((part) => (part.includes('"') ? part : escapeIdentifier(part)))
          .join('.');
      }
      return trimmed.includes('"') ? trimmed : escapeIdentifier(trimmed);
    };

    const buildCondition = (filter, { isHaving = false } = {}) => {
      if (!filter || !filter.operator) {
        return '';
      }

      const valueType =
        (filter.valueType || filter.value_type || FilterValueType.CONSTANT).toLowerCase();

      const columnName =
        typeof filter.column === 'string' ? filter.column.trim() : '';
      const hasColumn = columnName.length > 0;
      let columnExpression = hasColumn
        ? formatColumnExpression(columnName, { isHaving })
        : '';
      if (hasColumn) {
        columnExpression = applyColumnCast(columnName, columnExpression);
      }

      const columnInfo =
        (hasColumn && resolveColumnInfo(columnTypeMap, columnName)) ||
        (() => {
          const fallback = (filter.columnType || filter.column_type || '').toString().toLowerCase();
          switch (fallback) {
            case 'number':
              return { normalizedType: 'number' };
            case 'boolean':
              return { normalizedType: 'boolean' };
            case 'date':
              return { normalizedType: 'datetime' };
            default:
              return { normalizedType: 'string' };
          }
        })();

      const applyCast = (expr) => {
        const cast = filter.cast || filter.expression_cast || null;
        if (!cast || !cast.trim()) {
          return expr;
        }
        return `TRY_CAST(${expr} AS ${cast.trim().toUpperCase()})`;
      };

      if (valueType === FilterValueType.COLUMN) {
        if (!hasColumn) {
          return '';
        }
        const rightColumn = filter.rightColumn || filter.right_column;
        if (rightColumn) {
          const rightExpression = formatColumnExpression(rightColumn, { isHaving });
          const castedRight = applyColumnCast(rightColumn, rightExpression);
          return `${columnExpression} ${filter.operator} ${castedRight}`;
        }
        return '';
      }

      if (valueType === FilterValueType.EXPRESSION) {
        const expression = (filter.expression || filter.expression_value || '').toString().trim();
        if (!expression) {
          return '';
        }
        const expressionWithCasts = applyExpressionCasts(expression);
        const wrapped =
          expressionWithCasts.startsWith('(') ||
          expressionWithCasts.toLowerCase().startsWith('case')
            ? expressionWithCasts
            : `(${expressionWithCasts})`;
        const casted = applyCast(wrapped);

        if (hasColumn) {
          return `${columnExpression} ${filter.operator} ${casted}`;
        }

        // 纯表达式模式：表达式本身即为筛选条件
        return casted;
      }

      if (!hasColumn) {
        return '';
      }

      let condition = '';
      switch (filter.operator) {
        case FilterOperator.IS_NULL:
          condition = `${columnExpression} IS NULL`;
          break;
        case FilterOperator.IS_NOT_NULL:
          condition = `${columnExpression} IS NOT NULL`;
          break;
        case FilterOperator.BETWEEN: {
          const start = formatValueForColumn(filter.value, columnInfo);
          const end = formatValueForColumn(filter.value2, columnInfo);
          if (!start.isNull && !end.isNull && start.literal && end.literal) {
            condition = `${columnExpression} BETWEEN ${start.literal} AND ${end.literal}`;
          }
          break;
        }
        case FilterOperator.IN: {
          const clause = buildInCondition(
            columnExpression,
            filter,
            columnInfo,
            FilterOperator.IN,
          );
          if (clause) {
            condition = clause;
          }
          break;
        }
        case FilterOperator.NOT_IN: {
          const clause = buildInCondition(
            columnExpression,
            filter,
            columnInfo,
            FilterOperator.NOT_IN,
          );
          if (clause) {
            condition = clause;
          }
          break;
        }
        case FilterOperator.LIKE:
        case 'NOT LIKE':
        case 'ILIKE': {
          if (filter.value !== undefined && filter.value !== null) {
            let likeValue = String(filter.value);
            if (!/%|_/.test(likeValue)) {
              likeValue = `%${likeValue}%`;
            }
            condition = `${columnExpression} ${filter.operator} ${escapeSqlLiteral(likeValue)}`;
          }
          break;
        }
        default: {
          const { literal, isNull } = formatValueForColumn(filter.value, columnInfo);
          if (isNull) {
            if (filter.operator === FilterOperator.NOT_EQUAL) {
              condition = `${columnExpression} IS NOT NULL`;
            } else if (filter.operator === FilterOperator.EQUAL) {
              condition = `${columnExpression} IS NULL`;
            }
          } else if (literal !== null) {
            condition = `${columnExpression} ${filter.operator} ${literal}`;
          }
        }
      }

      return condition;
    };

    // WHERE 子句
    if (config.filters && config.filters.length > 0) {
      const whereConditions = config.filters
        .map((filter) => buildCondition(filter, { isHaving: false }))
        .filter(Boolean);

      if (whereConditions.length > 0) {
        sql += `\nWHERE ${whereConditions.join(" AND ")}`;
      }
    }

    // GROUP BY 子句 - 智能处理聚合函数的GROUP BY需求
    const hasAggregations =
      config.aggregations && config.aggregations.length > 0;
    const hasSelectedColumns =
      config.selectedColumns && config.selectedColumns.length > 0;
    let groupByColumns = [];

    if (hasAggregations && hasSelectedColumns) {
      // 只有在有聚合函数且有选中列时才需要GROUP BY
      config.selectedColumns.forEach((col) => {
        const columnName = typeof col === "string" ? col : col.name;
        // 检查这个列是否已经在聚合函数中使用
        const isAggregated = config.aggregations.some(
          (agg) => agg.column === columnName,
        );
        if (!isAggregated) {
          groupByColumns.push(columnName);
        }
      });
    }

    // 添加用户手动指定的GROUP BY列
    if (config.groupBy && config.groupBy.length > 0) {
      const manualGroupColumns = config.groupBy
        .map((col) => (typeof col === "string" ? col : col.name))
        .filter(Boolean);

      // 合并并去重
      manualGroupColumns.forEach((col) => {
        if (!groupByColumns.includes(col)) {
          groupByColumns.push(col);
        }
      });
    }

    if (groupByColumns.length > 0) {
      sql += `\nGROUP BY ${groupByColumns.join(", ")}`;
    }

    // HAVING 子句
    if (config.having && config.having.length > 0) {
      const havingConditions = config.having
        .map((filter) => buildCondition(filter, { isHaving: true }))
        .filter(Boolean);

      if (havingConditions.length > 0) {
        sql += `\nHAVING ${havingConditions.join(" AND ")}`;
      }
    }

    // ORDER BY 子句
    if (config.orderBy && config.orderBy.length > 0) {
      const orderColumns = [];

      config.orderBy.forEach((order) => {
        if (order.column) {
          let orderByColumn = order.column;

          // 根据用户选择的 castType 进行转换
          // The property name is `cast` from the UI component state
          if (order.cast === "numeric") {
            orderByColumn = `TRY_CAST(${order.column} AS DECIMAL)`;
          } else if (order.cast === "datetime") {
            orderByColumn = `TRY_CAST(${order.column} AS DATETIME)`;
          } else if (order.cast === "string") {
            orderByColumn = `TRY_CAST(${order.column} AS VARCHAR)`;
          } else {
            orderByColumn = order.column;
          }

          const direction = order.direction || SortDirection.ASC;
          orderColumns.push(`${orderByColumn} ${direction}`);
        }
      });

      if (orderColumns.length > 0) {
        sql += `\nORDER BY ${orderColumns.join(", ")}`;
      }
    }

    // LIMIT 子句
    if (config.limit && config.limit > 0) {
      sql += `\nLIMIT ${config.limit}`;
    }

    // 添加注释
    sql = `-- 可视化查询生成的SQL
-- 表: ${tableName}
-- 生成时间: ${new Date().toLocaleString()}

${sql}`;

    // 检查潜在问题
    if (config.aggregations && config.aggregations.length > 0) {
      // 检查是否有非聚合列但没有GROUP BY
      if (config.selectedColumns && config.selectedColumns.length > 0) {
        const nonAggregatedColumns = config.selectedColumns.filter((col) => {
          const columnName = typeof col === "string" ? col : col.name;
          return !config.aggregations.some((agg) => agg.column === columnName);
        });

        if (nonAggregatedColumns.length > 0 && groupByColumns.length === 0) {
          warnings.push("使用聚合函数时，非聚合列需要添加到GROUP BY子句中");
        }
      }
    }

    if (config.filters && config.filters.length > 10) {
      warnings.push("过多的筛选条件可能影响查询性能");
    }

    return {
      success: true,
      sql: sql.trim(),
      errors,
      warnings,
    };
  } catch (error) {
    errors.push(`SQL生成失败: ${error.message}`);
    return { success: false, errors, warnings };
  }
};

// 验证查询配置
export const validateConfig = (config) => {
  const errors = [];
  const warnings = [];

  if (!config.tableName || config.tableName.trim() === "") {
    errors.push("表名不能为空");
  }

  // 验证聚合配置
  if (config.aggregations) {
    config.aggregations.forEach((agg, index) => {
      if (!agg.function) {
        errors.push(`聚合 ${index + 1}: 缺少聚合函数`);
      }
      if (!agg.column) {
        errors.push(`聚合 ${index + 1}: 缺少列名`);
      }
    });
  }

  // 验证筛选配置
  if (config.filters) {
    config.filters.forEach((filter, index) => {
      if (!filter.column) {
        errors.push(`筛选 ${index + 1}: 缺少列名`);
      }
      if (!filter.operator) {
        errors.push(`筛选 ${index + 1}: 缺少操作符`);
      }
      if (
        filter.operator !== FilterOperator.IS_NULL &&
        filter.operator !== FilterOperator.IS_NOT_NULL &&
        (filter.value === undefined || filter.value === null)
      ) {
        warnings.push(`筛选 ${index + 1}: 缺少筛选值`);
      }
    });
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
};

// 格式化SQL
export const formatSQL = (sql) => {
  if (!sql) return "";

  return sql
    .replace(/\s+/g, " ")
    .replace(/\s*,\s*/g, ", ")
    .replace(/\s*\(\s*/g, "(")
    .replace(/\s*\)\s*/g, ")")
    .trim();
};

// 获取列的建议聚合函数
export const getSuggestedAggregations = (columnType) => {
  const normalized = columnType ? columnType.toLowerCase() : "";

  const numericAggregations = [
    AggregationFunction.SUM,
    AggregationFunction.AVG,
    AggregationFunction.MIN,
    AggregationFunction.MAX,
    AggregationFunction.COUNT,
    AggregationFunction.COUNT_DISTINCT,
  ];

  const dateAggregations = [
    AggregationFunction.MIN,
    AggregationFunction.MAX,
    AggregationFunction.COUNT,
    AggregationFunction.COUNT_DISTINCT,
  ];

  if (
    ["integer", "decimal", "bigint", "double", "float", "numeric"].includes(
      normalized,
    )
  ) {
    return numericAggregations;
  }

  if (["date", "time", "timestamp", "datetime"].includes(normalized)) {
    return dateAggregations;
  }

  // 默认返回所有聚合函数
  return Object.values(AggregationFunction);
};

// 获取列的建议筛选操作符
export const getSuggestedOperators = (columnType) => {
  switch (columnType) {
    case "integer":
    case "decimal":
      return [
        FilterOperator.EQUAL,
        FilterOperator.NOT_EQUAL,
        FilterOperator.GREATER_THAN,
        FilterOperator.LESS_THAN,
        FilterOperator.GREATER_EQUAL,
        FilterOperator.LESS_EQUAL,
        FilterOperator.BETWEEN,
        FilterOperator.IS_NULL,
        FilterOperator.IS_NOT_NULL,
      ];
    case "date":
      return [
        FilterOperator.EQUAL,
        FilterOperator.NOT_EQUAL,
        FilterOperator.GREATER_THAN,
        FilterOperator.LESS_THAN,
        FilterOperator.GREATER_EQUAL,
        FilterOperator.LESS_EQUAL,
        FilterOperator.BETWEEN,
        FilterOperator.IS_NULL,
        FilterOperator.IS_NOT_NULL,
      ];
    case "text":
    default:
      return [
        FilterOperator.EQUAL,
        FilterOperator.NOT_EQUAL,
        FilterOperator.LIKE,
        FilterOperator.IN,
        FilterOperator.NOT_IN,
        FilterOperator.IS_NULL,
        FilterOperator.IS_NOT_NULL,
      ];
  }
};
// 检查聚合函数与列类型的兼容性
export const isAggregationCompatible = (
  aggregationFunction,
  columnType,
) => {
  // 数据类型检查
  const isNumericType = [
    "integer",
    "decimal",
    "bigint",
    "double",
    "float",
    "numeric",
  ].includes(columnType?.toLowerCase());
  const isTextType = ["varchar", "text", "string", "char"].some((type) =>
    columnType?.toLowerCase().includes(type),
  );

  switch (aggregationFunction) {
    case AggregationFunction.SUM:
    case AggregationFunction.AVG:
      // SUM和AVG：数值类型直接兼容，文本类型也兼容（会自动转换）
      return isNumericType || isTextType;

    case AggregationFunction.MIN:
    case AggregationFunction.MAX:
      // MIN和MAX可以用于大多数类型
      return true;

    case AggregationFunction.COUNT:
    case AggregationFunction.COUNT_DISTINCT:
      // COUNT可以用于任何类型
      return true;

    default:
      return true;
  }
};

// 生成带类型转换的聚合函数SQL
export const generateAggregationSQL = (aggregation, columnType, resolvedCast) => {
  const { function: func, column, alias } = aggregation;
  const funcKey = typeof func === "string" ? func.toUpperCase() : func;

  // 检查兼容性
  if (!resolvedCast && !isAggregationCompatible(func, columnType)) {
    throw new Error(
      `聚合函数 ${func} 不兼容列 ${column} 的数据类型 ${columnType}`,
    );
  }

  const quotedColumn = escapeIdentifier(column);
  let sqlColumn = quotedColumn;
  const resolvedCastValue = resolvedCast
    ? resolvedCast.trim().toUpperCase()
    : null;

  // 检查数据类型
  const isNumericType = [
    "integer",
    "decimal",
    "bigint",
    "double",
    "float",
    "numeric",
  ].includes(columnType?.toLowerCase());
  const isTextType = ["varchar", "text", "string", "char"].some((type) =>
    columnType?.toLowerCase().includes(type),
  );

  // 当使用数值聚合函数（SUM、AVG、MIN、MAX）且字段类型是文本类型时，自动进行类型转换
  if (resolvedCastValue) {
    sqlColumn = `TRY_CAST(${quotedColumn} AS ${resolvedCastValue})`;
  } else if (
    (func === AggregationFunction.SUM ||
      func === AggregationFunction.AVG ||
      func === AggregationFunction.MIN ||
      func === AggregationFunction.MAX) &&
    !isNumericType &&
    isTextType
  ) {
    // 尝试将文本类型转换为DECIMAL，使用TRY_CAST避免转换失败
    sqlColumn = `TRY_CAST(${column} AS DECIMAL)`;
  }

  if (funcKey === AggregationFunction.COUNT_DISTINCT || funcKey === "COUNT_DISTINCT") {
    return `COUNT(DISTINCT ${sqlColumn})${alias ? ` AS ${escapeIdentifier(alias)}` : ""}`;
  }

  const aggStr = `${func}(${sqlColumn})${alias ? ` AS ${escapeIdentifier(alias)}` : ""}`;
  return aggStr;
};

// 获取列的数据类型信息
export const getColumnTypeInfo = (column) => {
  const columnName = typeof column === "string" ? column : column.name;
  const columnType =
    typeof column === "string"
      ? "text"
      : column.dataType || column.type || "text";

  return {
    name: columnName,
    type: columnType.toLowerCase(),
    isNumeric: [
      "integer",
      "decimal",
      "bigint",
      "double",
      "float",
      "numeric",
    ].includes(columnType.toLowerCase()),
    isNumericByName:
      /^(amount|price|fee|cost|total|sum|count|qty|quantity|num|number|rate|percent|score|value)(_|$)/i.test(
        columnName,
      ),
  };
};
