import { useCallback, useMemo } from 'react';
import { AggregationFunction, FilterValueType } from '../utils/visualQueryUtils';

const NUMERIC_AGG_FUNCTIONS = new Set([
  AggregationFunction.SUM,
  AggregationFunction.AVG,
  AggregationFunction.STDDEV_SAMP,
  AggregationFunction.VAR_SAMP,
  AggregationFunction.MEDIAN,
  AggregationFunction.PERCENTILE_CONT_25,
  AggregationFunction.PERCENTILE_CONT_75,
  AggregationFunction.PERCENTILE_DISC_25,
  AggregationFunction.PERCENTILE_DISC_75,
]);

const NUMERIC_TYPE_PREFIXES = ['DECIMAL', 'NUMERIC', 'DOUBLE', 'FLOAT', 'REAL'];
const NUMERIC_TYPE_NAMES = new Set([
  'INTEGER',
  'INT',
  'BIGINT',
  'SMALLINT',
  'TINYINT',
  'HUGEINT',
  'UTINYINT',
  'USMALLINT',
  'UINTEGER',
  'UBIGINT',
  'DOUBLE',
  'FLOAT',
  'REAL',
]);

const normalizeType = (type) => {
  if (!type || typeof type !== 'string') {
    return null;
  }
  const upper = type.trim().toUpperCase();
  const idx = upper.indexOf('(');
  return idx >= 0 ? upper.slice(0, idx) : upper;
};

const isNumericType = (type) => {
  const normalized = normalizeType(type);
  if (!normalized) {
    return false;
  }
  if (NUMERIC_TYPE_NAMES.has(normalized)) {
    return true;
  }
  return NUMERIC_TYPE_PREFIXES.some((prefix) => normalized.startsWith(prefix));
};

const recommendedNumericCasts = () => ['DECIMAL(18,4)', 'DOUBLE'];

const recommendedBooleanCasts = () => ['BOOLEAN'];
const recommendedDateCasts = () => ['DATE', 'TIMESTAMP'];
const recommendedStringCasts = () => ['VARCHAR'];

const buildConflict = ({ tableName, column, type, normalizedType, func }) => ({
  operation: 'aggregation',
  message: `${func} 需要数值类型，但列 ${column} 当前为 ${type || '未知类型'}`,
  left: {
    table: tableName,
    column,
    duckdb_type: type,
    normalized_type: normalizedType,
  },
  right: null,
  function: func,
  recommended_casts: recommendedNumericCasts(),
  severity: 'error',
});

const isBooleanType = (type) => {
  const normalized = normalizeType(type);
  if (!normalized) {
    return false;
  }
  return normalized === 'BOOLEAN' || normalized === 'BOOL';
};

const isDateLikeType = (type) => {
  const normalized = normalizeType(type);
  if (!normalized) {
    return false;
  }
  return (
    normalized === 'DATE' ||
    normalized === 'TIMESTAMP' ||
    normalized === 'TIME'
  );
};

const recommendCastsByType = (resultType) => {
  switch (resultType) {
    case 'number':
      return recommendedNumericCasts();
    case 'boolean':
      return recommendedBooleanCasts();
    case 'date':
      return recommendedDateCasts();
    default:
      return recommendedStringCasts();
  }
};

const EXPRESSION_FILTER_PREFIX = '__expr_filter_';
const EXPRESSION_HAVING_PREFIX = '__expr_having_';

const buildExpressionConflict = ({
  key,
  displayLabel,
  message,
  recommendedCasts,
  targetColumn,
  targetType,
  operation,
}) => ({
  operation,
  message,
  left: {
    table: null,
    column: key,
    duckdb_type: null,
    normalized_type: null,
  },
  right: targetColumn
    ? {
        table: null,
        column: targetColumn,
        duckdb_type: targetType,
        normalized_type: normalizeType(targetType),
      }
    : null,
  function: 'EXPRESSION',
  recommended_casts: recommendedCasts,
  severity: 'error',
  display_column: displayLabel,
});

const formatTypeLabel = (category) => {
  switch (category) {
    case 'number':
      return '数值';
    case 'boolean':
      return '布尔';
    case 'date':
      return '日期/时间';
    case 'string':
      return '文本';
    default:
      return '未知';
  }
};

const SQL_RESERVED_IDENTIFIERS = new Set([
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

const IDENTIFIER_REGEX = /"([^"]+)"|([\p{L}\p{N}_][\p{L}\p{N}_\.]*)/gu;

const getTypeCategory = (type) => {
  if (!type) {
    return null;
  }
  if (isNumericType(type)) {
    return 'number';
  }
  if (isBooleanType(type)) {
    return 'boolean';
  }
  if (isDateLikeType(type)) {
    return 'date';
  }
  return 'string';
};

const inferLiteralCategory = (token) => {
  if (!token) {
    return null;
  }
  const trimmed = token.trim();
  if (!trimmed) {
    return null;
  }
  if (/^(true|false)$/i.test(trimmed)) {
    return 'boolean';
  }
  if (/^(date|timestamp|time)\s+'.+'$/i.test(trimmed)) {
    return 'date';
  }
  if (/^[-+]?\d+(\.\d+)?$/.test(trimmed)) {
    return 'number';
  }
  if (/^'.*'$/.test(trimmed)) {
    return 'string';
  }
  return null;
};

const analyzeExpressionStructure = (expression, columnProfileMap) => {
  if (!expression || typeof expression !== 'string') {
    return {
      resultType: null,
      expectedCategory: null,
      referencedColumns: [],
      incompatibleColumns: [],
    };
  }

  const text = expression;
  const referencedColumns = [];
  const seenKeys = new Set();

  let match;
  while ((match = IDENTIFIER_REGEX.exec(text)) !== null) {
    const identifier = match[1] || match[2];
    if (!identifier) {
      continue;
    }
    const upper = identifier.toUpperCase();
    if (SQL_RESERVED_IDENTIFIERS.has(upper)) {
      continue;
    }
    const candidates = [];
    const lower = identifier.toLowerCase();
    candidates.push(lower);
    if (lower.includes('.')) {
      const segments = lower.split('.');
      const last = segments[segments.length - 1];
      if (last) {
        candidates.push(last);
      }
    }
    let profile = null;
    let resolvedKey = null;
    for (const candidate of candidates) {
      if (columnProfileMap[candidate]) {
        profile = columnProfileMap[candidate];
        resolvedKey = candidate;
        break;
      }
    }
    if (!profile) {
      continue;
    }
    const name = profile.name || identifier;
    const normalizedKey = name.toLowerCase();
    if (seenKeys.has(normalizedKey)) {
      continue;
    }
    seenKeys.add(normalizedKey);
    const normalizedType =
      profile.normalized_type ||
      profile.duckdb_type ||
      profile.raw_type ||
      null;
    referencedColumns.push({
      key: normalizedKey,
      name,
      type: normalizedType,
      category: getTypeCategory(normalizedType),
    });
  }

  const expressionWithoutStrings = text.replace(/'[^']*'/g, '');
  const hasConcat = /\|\|/.test(expressionWithoutStrings);
  const hasArithmetic = /[+\-*/%]/.test(expressionWithoutStrings);
  const hasComparison = /(=|<>|!=|>=|<=|<|>)/.test(expressionWithoutStrings);
  const hasLogical = /\b(AND|OR|NOT)\b/i.test(expressionWithoutStrings);

  const literalTokens =
    text.match(
      /(true|false|DATE\s+'.+?'|TIMESTAMP\s+'.+?'|TIME\s+'.+?'|'.*?'|[-+]?\d+(?:\.\d+)?)/gi,
    ) || [];
  const literalCategories = literalTokens
    .map(inferLiteralCategory)
    .filter(Boolean);

  let expectedCategory = null;
  if (hasConcat) {
    expectedCategory = 'string';
  } else if (hasArithmetic) {
    expectedCategory = 'number';
  }

  const combinedCategories = new Set([
    ...referencedColumns.map((col) => col.category).filter(Boolean),
    ...literalCategories,
  ]);

  let resultType = null;
  if (hasLogical || hasComparison) {
    resultType = 'boolean';
  } else if (hasConcat) {
    resultType = 'string';
  } else if (hasArithmetic) {
    resultType = 'number';
  } else if (combinedCategories.size === 1) {
    [resultType] = combinedCategories;
  } else if (literalCategories.length === 1 && referencedColumns.length === 0) {
    [resultType] = literalCategories;
  } else if (referencedColumns.length === 1) {
    resultType = referencedColumns[0].category;
  }

  const incompatibleColumns =
    expectedCategory === null
      ? []
      : referencedColumns.filter(
          (col) => col.category && col.category !== expectedCategory,
        );

  return {
    resultType,
    expectedCategory,
    referencedColumns,
    incompatibleColumns,
  };
};

const buildExpressionColumnConflict = ({
  tableName,
  column,
  columnType,
  requiredCategory,
  expressionLabel,
}) => {
  if (!requiredCategory) {
    return null;
  }
  const readableRequired = formatTypeLabel(requiredCategory);
  return {
    operation: 'expression_column',
    message: `${expressionLabel} 需要 ${readableRequired} 类型输入，但列 ${column} 当前为 ${columnType || '未知类型'}`,
    left: {
      table: tableName,
      column,
      duckdb_type: columnType,
      normalized_type: normalizeType(columnType),
    },
    right: null,
    function: readableRequired.toUpperCase(),
    recommended_casts: recommendCastsByType(requiredCategory),
    severity: 'error',
    display_column: column,
  };
};

const buildColumnComparisonConflict = ({
  tableName,
  column,
  columnType,
  referenceColumn,
  referenceType,
  referenceCategory,
}) => ({
  operation: 'column_comparison',
  message: `列 ${column} (${columnType || '未知类型'}) 与列 ${referenceColumn} (${referenceType || '未知类型'}) 类型不一致，请为 ${column} 添加 TRY_CAST`,
  left: {
    table: tableName,
    column,
    duckdb_type: columnType,
    normalized_type: normalizeType(columnType),
  },
  right: {
    table: tableName,
    column: referenceColumn,
    duckdb_type: referenceType,
    normalized_type: normalizeType(referenceType),
  },
  function: 'COLUMN_COMPARISON',
  recommended_casts: recommendCastsByType(referenceCategory || 'string'),
  severity: 'error',
  display_column: column,
});


/**
 * Hook: 提供本地类型冲突检查逻辑以及辅助数据组装
 */
const useTypeConflictCheck = ({
  analysisConfig,
  columnProfiles,
  tableName,
  resolvedCasts,
  pivotConfig,
}) => {
  const columnProfileMap = useMemo(() => {
    if (!columnProfiles) {
      return {};
    }

    if (Array.isArray(columnProfiles)) {
      return columnProfiles.reduce((acc, profile) => {
        if (profile && profile.name) {
          acc[profile.name.toLowerCase()] = profile;
        }
        return acc;
      }, {});
    }

    // Assume already map keyed by lower-case column name
    return columnProfiles;
  }, [columnProfiles]);

  const resolvedCastMap = useMemo(() => {
    if (!resolvedCasts) {
      return {};
    }
    return Object.entries(resolvedCasts).reduce((acc, [column, cast]) => {
      if (column && cast) {
        acc[column.toLowerCase()] = cast;
      }
      return acc;
    }, {});
  }, [resolvedCasts]);

  const computeLocalConflicts = useCallback((overrideCasts) => {
    const effectiveResolved = overrideCasts
      ? Object.entries(overrideCasts).reduce((acc, [column, cast]) => {
          if (column && cast) {
            acc[column.toLowerCase()] = cast;
          }
          return acc;
        }, {})
      : resolvedCastMap;
    const conflicts = [];
    const aggregations = analysisConfig?.aggregations || [];

    aggregations.forEach((agg) => {
      if (!agg || !agg.column || !agg.function) {
        return;
      }

      const func = agg.function;
      if (!NUMERIC_AGG_FUNCTIONS.has(func)) {
        return;
      }

      const columnKey = agg.column.toLowerCase();
      if (effectiveResolved[columnKey]) {
        // 用户已经为该列指定 TRY_CAST，视为已处理
        return;
      }

      const profile = columnProfileMap[columnKey];
      const duckdbType =
        profile?.duckdb_type ||
        profile?.duckdbType ||
        profile?.dataType ||
        profile?.raw_type ||
        null;
      const normalizedType =
        normalizeType(profile?.normalized_type || duckdbType) || null;

      if (isNumericType(normalizedType)) {
        return;
      }

      conflicts.push(
        buildConflict({
          tableName,
          column: agg.column,
          type: duckdbType,
          normalizedType,
          func,
        }),
      );
    });

    const ensureColumnComparisonCompatibility = (
      filter,
      orderIndex,
      scopeLabel,
    ) => {
      if (!filter) {
        return;
      }
      const valueType =
        (filter.valueType || filter.value_type || '').toLowerCase();
      if (valueType !== FilterValueType.COLUMN) {
        return;
      }
      const leftColumn =
        typeof filter.column === 'string' ? filter.column.trim() : '';
      const rightColumn =
        typeof (filter.rightColumn || filter.right_column) === 'string'
          ? (filter.rightColumn || filter.right_column).trim()
          : '';
      if (!leftColumn || !rightColumn) {
        return;
      }
      const leftKey = leftColumn.toLowerCase();
      const rightKey = rightColumn.toLowerCase();

      const leftProfile = columnProfileMap[leftKey];
      const rightProfile = columnProfileMap[rightKey];

      const leftType =
        leftProfile?.duckdb_type ||
        leftProfile?.raw_type ||
        filter.columnType ||
        filter.column_type ||
        null;
      const rightType =
        rightProfile?.duckdb_type ||
        rightProfile?.raw_type ||
        filter.rightColumnType ||
        filter.right_column_type ||
        null;

      const leftCategory = getTypeCategory(leftType);
      const rightCategory = getTypeCategory(rightType);

      if (!leftCategory || !rightCategory || leftCategory === rightCategory) {
        return;
      }

      const label = scopeLabel || `列对列 #${orderIndex + 1}`;

      if (!effectiveResolved[leftKey]) {
        conflicts.push(
          buildColumnComparisonConflict({
            tableName,
            column: leftColumn,
            columnType: leftType,
            referenceColumn: rightColumn,
            referenceType: rightType,
            referenceCategory: rightCategory,
          }),
        );
      }

      if (!effectiveResolved[rightKey]) {
        conflicts.push(
          buildColumnComparisonConflict({
            tableName,
            column: rightColumn,
            columnType: rightType,
            referenceColumn: leftColumn,
            referenceType: leftType,
            referenceCategory: leftCategory,
          }),
        );
      }
    };

    const ensureCastCompatibility = (
      filter,
      scopePrefix,
      displayPrefix,
      targetLabel,
      operation,
      orderIndex,
    ) => {
      if (!filter) {
        return;
      }
      const valueType =
        (filter.valueType || filter.value_type || '').toLowerCase();
      if (valueType !== FilterValueType.EXPRESSION) {
        return;
      }
    if (!filter.expression || !String(filter.expression).trim()) {
      return;
    }
    if (filter.cast) {
      return;
    }
    const expressionAnalysis = analyzeExpressionStructure(
      filter.expression,
      columnProfileMap,
    );
    const legacyResultType =
      (filter.expression_result_type || filter.resultType || '')
        .toLowerCase()
        .trim() || null;
    const resultTypeRaw = expressionAnalysis.resultType || legacyResultType;
    const expressionLabel = (displayPrefix || '表达式').trim();
    if (
      expressionAnalysis.expectedCategory &&
      expressionAnalysis.incompatibleColumns.length > 0
    ) {
      expressionAnalysis.incompatibleColumns.forEach((col) => {
        if (effectiveResolved[col.key]) {
          return;
        }
        const conflict = buildExpressionColumnConflict({
          tableName,
          column: col.name,
          columnType: col.type,
          requiredCategory: expressionAnalysis.expectedCategory,
          expressionLabel,
        });
        if (conflict) {
          conflicts.push(conflict);
        }
      });
    }

    const columnName =
      typeof filter.column === 'string' ? filter.column.trim() : '';
    if (!columnName || !resultTypeRaw) {
      return;
    }
    const columnKey = columnName.toLowerCase();
    if (effectiveResolved[columnKey]) {
      return;
      }
      const profile = columnProfileMap[columnKey];
      const columnType =
        profile?.duckdb_type ||
        profile?.duckdbType ||
        profile?.raw_type ||
        filter.columnType ||
        filter.column_type ||
        null;
      if (!columnType) {
        return;
      }
      const normalizedTarget = normalizeType(columnType);
      const targetCategory = getTypeCategory(normalizedTarget);
      if (!targetCategory) {
        return;
      }
      const compatible = resultTypeRaw === targetCategory;

      if (compatible) {
        return;
      }

      const identifier =
        filter.id !== undefined && filter.id !== null
          ? String(filter.id)
          : `idx_${orderIndex}`;
      const conflictKey = `${scopePrefix}${identifier}`;
      const labelForDisplay =
        columnName && columnName.length > 0
          ? `${displayPrefix}${columnName}`
          : `${displayPrefix}${targetLabel}`;

      conflicts.push(
        buildExpressionConflict({
          key: conflictKey,
          displayLabel: labelForDisplay.trim(),
          message: `${expressionLabel} 输出 ${formatTypeLabel(
            resultTypeRaw,
          )} 类型，但列 ${columnName} (${columnType || '未知类型'}) 不兼容，请选择 TRY_CAST`,
          recommendedCasts: recommendCastsByType(targetCategory),
          targetColumn: columnName,
          targetType: columnType,
          operation,
        }),
      );
    };

    (analysisConfig?.filters || []).forEach((filter, index) => {
      ensureColumnComparisonCompatibility(
        filter,
        index,
        `列对列筛选 #${index + 1}`,
      );
      ensureCastCompatibility(
        filter,
        EXPRESSION_FILTER_PREFIX,
        `表达式筛选 #${index + 1} `,
        '对应列',
        'filter',
        index,
      );
    });

    (analysisConfig?.having || []).forEach((filter, index) => {
      ensureColumnComparisonCompatibility(
        filter,
        index,
        `HAVING 列对列 #${index + 1}`,
      );
      ensureCastCompatibility(
        filter,
        EXPRESSION_HAVING_PREFIX,
        `HAVING 表达式 #${index + 1} `,
        'HAVING 列',
        'having',
        index,
      );
    });

    return conflicts;
  }, [analysisConfig, columnProfileMap, resolvedCastMap, tableName]);

  const getColumnProfilesArray = useCallback(
    (columns) => {
      const normalizedSet =
        Array.isArray(columns) && columns.length > 0
          ? new Set(
              columns
                .filter(Boolean)
                .map((name) => String(name).toLowerCase()),
            )
          : null;

      return Object.values(columnProfileMap)
        .filter((profile) => {
          if (!normalizedSet) {
            return true;
          }
          const key = profile.name ? profile.name.toLowerCase() : '';
          return normalizedSet.has(key);
        })
        .map((profile) => ({
          name: profile.name,
          duckdb_type: profile.duckdb_type || profile.duckdbType || null,
          raw_type: profile.raw_type || null,
          normalized_type: profile.normalized_type || null,
          precision: profile.precision ?? null,
          scale: profile.scale ?? null,
        }));
    },
    [columnProfileMap],
  );

  const computePivotConflicts = useCallback(
    (overrideCasts) => {
      const effectiveResolved = overrideCasts
        ? Object.entries(overrideCasts).reduce((acc, [column, cast]) => {
            if (column && cast) {
              acc[column.toLowerCase()] = cast;
            }
            return acc;
          }, {})
        : resolvedCastMap;

      const conflicts = [];
      const values = pivotConfig?.values || [];

      values.forEach((value) => {
        if (!value || !value.column || !value.aggregation) {
          return;
        }

        const func =
          (typeof value.aggregation === 'string'
            ? value.aggregation
            : value.aggregation.value) || '';
        const upperFunc = func.toUpperCase();

        if (!NUMERIC_AGG_FUNCTIONS.has(upperFunc)) {
          return;
        }

        const columnKey = value.column.toLowerCase();
        if (effectiveResolved[columnKey]) {
          return;
        }

        const profile = columnProfileMap[columnKey];
        const duckdbType =
          profile?.duckdb_type ||
          profile?.duckdbType ||
          profile?.raw_type ||
          null;
        const normalizedType =
          normalizeType(profile?.normalized_type || duckdbType) || null;

        if (isNumericType(normalizedType)) {
          return;
        }

        conflicts.push(
          buildConflict({
            tableName,
            column: value.column,
            type: duckdbType,
            normalizedType,
            func: upperFunc,
          }),
        );
      });

      return conflicts;
    },
    [pivotConfig, resolvedCastMap, columnProfileMap, tableName],
  );

  return {
    computeLocalConflicts,
    computePivotConflicts,
    getColumnProfilesArray,
    columnProfileMap,
  };
};

export default useTypeConflictCheck;
