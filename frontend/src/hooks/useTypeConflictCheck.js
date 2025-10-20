import { useCallback, useMemo } from 'react';
import { AggregationFunction } from '../utils/visualQueryUtils';

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

    return conflicts;
  }, [analysisConfig, columnProfileMap, resolvedCastMap, tableName]);

  const getColumnProfilesArray = useCallback(() => {
    return Object.values(columnProfileMap).map((profile) => ({
      name: profile.name,
      duckdb_type: profile.duckdb_type || profile.duckdbType || null,
      raw_type: profile.raw_type || null,
      normalized_type: profile.normalized_type || null,
      precision: profile.precision ?? null,
      scale: profile.scale ?? null,
    }));
  }, [columnProfileMap]);

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
