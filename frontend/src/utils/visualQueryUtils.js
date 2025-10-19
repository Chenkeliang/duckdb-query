/**
 * Visual Query Builder Utilities
 * 可视化查询构建器的工具函数
 */

// 导入escapeIdentifier函数
import { escapeIdentifier } from './visualQueryGenerator';

// 创建默认配置
export const createDefaultConfig = (tableName = "") => ({
  tableName: tableName,
  selectedColumns: [],
  aggregations: [],
  filters: [],
  orderBy: [],
  groupBy: [],
  calculatedFields: [],
  conditionalFields: [],
  limit: null,
  isDistinct: false,
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
  includeSubtotals: false,
  includeGrandTotals: false,
  valueAxis: PivotValueAxis.COLUMNS,
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
    include_subtotals: Boolean(pivotConfig.includeSubtotals),
    include_grand_totals: Boolean(pivotConfig.includeGrandTotals),
    value_axis: pivotConfig.valueAxis || PivotValueAxis.COLUMNS,
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

const sanitizeFilter = (filter) => {
  if (!filter || !filter.column || !filter.operator) {
    return null;
  }

  return {
    column: filter.column,
    operator: filter.operator,
    value: filter.value !== undefined ? filter.value : null,
    value2: filter.value2 !== undefined ? filter.value2 : null,
    logic_operator: filter.logicOperator || filter.logic_operator || LogicOperator.AND,
  };
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

  const orderBy = (config.orderBy || config.order_by || [])
    .map(sanitizeSort)
    .filter(Boolean);

  const calculatedFields = (config.calculatedFields || config.calculated_fields || [])
    .map(sanitizeCalculatedField)
    .filter(Boolean);

  const conditionalFields = (config.conditionalFields || config.conditional_fields || [])
    .map(sanitizeConditionalField)
    .filter(Boolean);

  return {
    table_name: safeTableName,
    selected_columns: (config.selectedColumns || config.selected_columns || []).filter(Boolean),
    aggregations,
    calculated_fields: calculatedFields,
    conditional_fields: conditionalFields,
    filters,
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

function normalizeColumnTypeName(rawType, sampleValues = []) {
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
export const generateSQLPreview = (config, tableName, columns = []) => {
  const errors = [];
  const warnings = [];

  if (!tableName || tableName.trim() === "") {
    errors.push("表名不能为空");
    return { success: false, errors, warnings };
  }

  try {
    let sql = "";
    const columnTypeMap = buildColumnTypeMap(columns || []);

    // SELECT 子句
    const selectItems = [];

    // 添加选中的列
    if (config.selectedColumns && config.selectedColumns.length > 0) {
      config.selectedColumns.forEach((col) => {
        if (typeof col === "string") {
          selectItems.push(col);
        } else if (col.name) {
          selectItems.push(col.name);
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
            const aggStr = generateAggregationSQL(
              agg,
              columnTypeInfo.type,
              columnTypeInfo.name,
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
        if (calc.expression && calc.alias) {
          selectItems.push(`${calc.expression} AS ${calc.alias}`);
        }
      });
    }

    // 如果没有任何选择项，默认选择所有
    if (selectItems.length === 0) {
      selectItems.push("*");
    }

    sql += `SELECT ${config.isDistinct ? "DISTINCT " : ""}${selectItems.join(", ")}`;

    // FROM 子句 - 使用escapeIdentifier函数来正确处理表名
    sql += `\nFROM ${escapeIdentifier(tableName)}`;

    // WHERE 子句
    if (config.filters && config.filters.length > 0) {
      const whereConditions = [];

      config.filters.forEach((filter) => {
        if (!filter.column || !filter.operator) {
          return;
        }

        const columnInfo = resolveColumnInfo(columnTypeMap, filter.column);
        const columnExpression = filter.column;
        let condition = "";

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
              FilterOperator.IN
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
              FilterOperator.NOT_IN
            );
            if (clause) {
              condition = clause;
            }
            break;
          }
          case FilterOperator.LIKE:
          case "NOT LIKE":
          case "ILIKE": {
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

        if (condition) {
          whereConditions.push(condition);
        }
      });

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
  columnName = "",
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
export const generateAggregationSQL = (aggregation, columnType, columnName) => {
  const { function: func, column, alias } = aggregation;

  // 检查兼容性
  if (!isAggregationCompatible(func, columnType, column)) {
    throw new Error(
      `聚合函数 ${func} 不兼容列 ${column} 的数据类型 ${columnType}`,
    );
  }

  let sqlColumn = column;

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
  if (
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

  const aggStr = `${func}(${sqlColumn})${alias ? ` AS ${alias}` : ""}`;
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
