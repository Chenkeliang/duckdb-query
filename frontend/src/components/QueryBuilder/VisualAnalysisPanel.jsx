import {
  Alert,
  Collapse,
  Fade,
  IconButton,
  Button
} from '@mui/material';
import { ChevronDown, LineChart } from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getAppFeatures, previewVisualQuery, getTableMetadata, validateVisualQueryConfig } from '../../services/apiClient';
import {
  createDefaultConfig,
  createDefaultPivotConfig,
  generateSQLPreview,
  transformPivotConfigForApi,
  transformVisualConfigForApi,
  FilterValueType,
  LogicOperator,
  sanitizeFilter
} from '../../utils/visualQueryUtils';
import { escapeIdentifier } from '../../utils/visualQueryGenerator';
import AggregationControls from './AggregationControls';
import ColumnSelector from './ColumnSelector';
import FilterControls from './VisualAnalysis/FilterControls';
import LimitControls from './LimitControls';
import PivotConfigurator from './PivotConfigurator';
import SortControls from './SortControls';
import SQLPreview from './SQLPreview';
import TypeConflictDialog from './VisualAnalysis/TypeConflictDialog';
import CalculatedFieldsControls from './VisualAnalysis/CalculatedFieldsControls';

const VISUAL_PANEL_EXPANDED_STORAGE_KEY = 'dq-visual-panel-expanded';
const EXPRESSION_FILTER_CAST_PREFIX = '__expr_filter_';
const EXPRESSION_HAVING_CAST_PREFIX = '__expr_having_';
const SECTION_STORAGE_KEYS = {
  columns: 'dq-visual-section-columns',
  aggregations: 'dq-visual-section-aggregations',
  calculated: 'dq-visual-section-calculated',
  filters: 'dq-visual-section-filters',
  having: 'dq-visual-section-having',
  sort: 'dq-visual-section-sort',
  limit: 'dq-visual-section-limit',
  pivot: 'dq-visual-section-pivot',
  regularPanel: 'dq-visual-section-regular-panel',
};
import useTypeConflictCheck from '../../hooks/useTypeConflictCheck';
import { useToast } from '../../contexts/ToastContext';

const extractColumnsFromExpression = (expression) => {
  if (!expression || typeof expression !== 'string') {
    return [];
  }
  const matches = new Set();
  const quoted = expression.matchAll(/"([^"]+)"/g);
  for (const match of quoted) {
    if (match[1]) {
      matches.add(match[1]);
    }
  }
  return Array.from(matches);
};

const CollapsibleSection = ({
  title,
  description,
  children,
  storageKey,
  defaultExpanded = false,
  className = '',
}) => {
  const [isOpen, setIsOpen] = useState(() => {
    if (!storageKey || typeof window === 'undefined') {
      return defaultExpanded;
    }
    try {
      const cached = window.localStorage.getItem(storageKey);
      if (cached === null) {
        return defaultExpanded;
      }
      return cached === 'true';
    } catch {
      return defaultExpanded;
    }
  });

  const toggle = useCallback(() => {
    setIsOpen((prev) => {
      const next = !prev;
      if (storageKey && typeof window !== 'undefined') {
        try {
          window.localStorage.setItem(storageKey, next ? 'true' : 'false');
        } catch (error) {
          console.warn('[CollapsibleSection] 保存折叠状态失败', error);
        }
      }
      return next;
    });
  }, [storageKey]);

  return (
    <div className={`visual-analysis-section-card ${className}`}>
      <div
        className="visual-analysis-section-card__header"
        onClick={toggle}
      >
        <div className="visual-analysis-section-card__header-text">
          <div className="visual-analysis-section-card__title">{title}</div>
          {description && (
            <div className="visual-analysis-section-card__subtitle">{description}</div>
          )}
        </div>
        <IconButton
          size="small"
          aria-label={isOpen ? '收起' : '展开'}
          onClick={(event) => {
            event.stopPropagation();
            toggle();
          }}
          sx={{
            border: '1px solid var(--dq-border-subtle)',
            borderRadius: '50%',
            width: '1.9rem',
            height: '1.9rem',
            color: 'var(--dq-text-secondary)',
            backgroundColor: 'var(--dq-surface-alt)',
            transition: 'background-color 0.2s ease, border-color 0.2s ease, color 0.2s ease',
            '&:hover': {
              backgroundColor: 'var(--dq-surface-hover)',
              borderColor: 'var(--dq-border-card)',
              color: 'var(--dq-accent-100)'
            }
          }}
        >
          <ChevronDown
            size={16}
            strokeWidth={2.5}
            style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s ease' }}
          />
        </IconButton>
      </div>
      <Collapse in={isOpen}>
        <div className="visual-analysis-section-card__body">
          {children}
        </div>
      </Collapse>
    </div>
  );
};

/**
 * VisualAnalysisPanel - Visual query builder interface for single table analysis
 * Only displays when a single table is selected, providing no-code query building capabilities
 */
const VisualAnalysisPanel = ({
  selectedSources = [],
  onVisualQueryGenerated,
  onVisualQueryInvalid = () => {},
  isVisible = true
}) => {
  // Determine if panel should be shown (only for single table selection)
  const shouldShowPanel = selectedSources.length === 1 && isVisible;
  const selectedTable = shouldShowPanel ? selectedSources[0] : null;

  // 调试日志：监控表数据变化
  useEffect(() => {
    if (selectedTable) {
      console.log('[VisualAnalysisPanel] 表数据变化:', {
        tableId: selectedTable.id,
        tableName: selectedTable.name,
        columnsCount: selectedTable.columns?.length || 0,
        columnsPreview: selectedTable.columns?.slice(0, 3).map(col =>
          typeof col === 'string' ? col : col.name
        )
      });
    }
  }, [selectedTable?.id, selectedTable?.columns?.length]);

  // Basic state management for analysis configuration
  const [analysisConfig, setAnalysisConfig] = useState(() =>
    createDefaultConfig(selectedTable?.name || selectedTable?.id || '')
  );
  const [activeMode, setActiveMode] = useState('regular');
  const [pivotConfig, setPivotConfig] = useState(() => createDefaultPivotConfig());

  const [generatedSQL, setGeneratedSQL] = useState('');
  const [baseSQL, setBaseSQL] = useState('');
  const [pivotSQL, setPivotSQL] = useState('');
  const [warnings, setWarnings] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [isExpanded, setIsExpanded] = useState(() => {
    if (typeof window === 'undefined') {
      return false;
    }
    try {
      const cached = window.localStorage.getItem(VISUAL_PANEL_EXPANDED_STORAGE_KEY);
      return cached === 'true';
    } catch (error) {
      console.warn('[VisualAnalysisPanel] 读取展开偏好失败', error);
      return false;
    }
  }); // 默认折叠状态
  const latestRequestRef = useRef(0);
  const [features, setFeatures] = useState({ enable_pivot_tables: true });
  const [columnProfiles, setColumnProfiles] = useState({});
  const [resolvedCasts, setResolvedCasts] = useState({});
  const [conflicts, setConflicts] = useState([]);
  const [suggestedCasts, setSuggestedCasts] = useState({});
  const [isConflictDialogOpen, setIsConflictDialogOpen] = useState(false);
  const [isValidatingTypes, setIsValidatingTypes] = useState(false);
  const pendingActionRef = useRef(null);
  const currentConflictKeyRef = useRef(null);
  const [dismissedConflictKeys, setDismissedConflictKeys] = useState(new Set());
  const [isMetadataReady, setIsMetadataReady] = useState(false);
  const { showWarning, showError } = useToast();
  const [pivotNotice, setPivotNotice] = useState(null);
  const pivotWarningShownRef = useRef(false);

  const tableName = selectedTable?.name || selectedTable?.id || '';

  const tableColumns = useMemo(() => {
    const rawColumns = selectedTable?.columns || [];
    return rawColumns
      .map((column) => {
        if (!column) {
          return null;
        }
        if (typeof column === 'string') {
          return {
            name: column,
            label: column,
            dataType: 'TEXT'
          };
        }
        const name = column.name || column.column_name || '';
        if (!name) {
          return null;
        }
        const dataType = (column.dataType || column.type || 'TEXT').toString().toUpperCase();
        return {
          name,
          label: column.displayName || column.label || column.column_label || name,
          dataType
        };
      })
      .filter(Boolean);
  }, [selectedTable?.columns]);

  const hasVisualConfig = useMemo(() => {
    const config = analysisConfig || {};
    const hasRegularConfig = Boolean(
      (config.filters && config.filters.length) ||
        (config.having && config.having.length) ||
        (config.aggregations && config.aggregations.length) ||
        (config.calculatedFields && config.calculatedFields.length) ||
        (config.selectedColumns && config.selectedColumns.length) ||
        (config.groupBy && config.groupBy.length) ||
        (config.orderBy && config.orderBy.length) ||
        (typeof config.limit === 'number' && !Number.isNaN(config.limit)),
    );
    const hasPivotConfig =
      activeMode === 'pivot' &&
      Boolean(
        (pivotConfig?.rows && pivotConfig.rows.length) ||
          (pivotConfig?.columns && pivotConfig.columns.length) ||
          (Array.isArray(pivotConfig?.values) &&
            pivotConfig.values.some((value) => value && value.column)),
      );
    return hasRegularConfig || hasPivotConfig;
  }, [analysisConfig, pivotConfig, activeMode]);

  const regularConfigSummary = useMemo(() => {
    const config = analysisConfig || {};
    const summaryParts = [];
    if (config.selectedColumns?.length) {
      summaryParts.push(`列 ${config.selectedColumns.length}`);
    }
    if (config.aggregations?.length) {
      summaryParts.push(`聚合 ${config.aggregations.length}`);
    }
    if (config.calculatedFields?.length) {
      summaryParts.push(`计算 ${config.calculatedFields.length}`);
    }
    if (config.filters?.length) {
      summaryParts.push(`筛选 ${config.filters.length}`);
    }
    if (config.having?.length) {
      summaryParts.push(`HAVING ${config.having.length}`);
    }
    const sortCount = (config.orderBy?.length || 0) + (config.groupBy?.length || 0);
    if (sortCount) {
      summaryParts.push(`排序/分组 ${sortCount}`);
    }
    if (typeof config.limit === 'number' && !Number.isNaN(config.limit)) {
      summaryParts.push(`LIMIT ${config.limit}`);
    }
    return summaryParts.length ? summaryParts.join(' · ') : '未配置查询条件';
  }, [analysisConfig]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    try {
      window.localStorage.setItem(
        VISUAL_PANEL_EXPANDED_STORAGE_KEY,
        isExpanded ? 'true' : 'false'
      );
    } catch (error) {
      console.warn('[VisualAnalysisPanel] 保存展开偏好失败', error);
    }
  }, [isExpanded]);

  const havingColumns = useMemo(() => {
    const metricMap = new Map();
    const buildAggregateExpression = (func, columnName) => {
      if (!columnName) {
        return '';
      }
      const target =
        typeof columnName === 'string' && !columnName.includes('"') && !columnName.includes('(')
          ? escapeIdentifier(columnName)
          : columnName;
      return func ? `${func}(${target})` : target;
    };

    (analysisConfig.aggregations || []).forEach((aggregation) => {
      if (!aggregation) return;
      const sourceColumn = aggregation.column || '';
      const func = aggregation.function || aggregation.func || '';
      const alias = aggregation.alias && aggregation.alias.trim() ? aggregation.alias.trim() : '';
      if (!sourceColumn && !alias) {
        return;
      }

      const expression = buildAggregateExpression(func, sourceColumn);
      const name = alias || expression;
      const label = alias || expression;
      if (!name) {
        return;
      }
      metricMap.set(name, {
        name,
        label,
        dataType: 'number'
      });
    });

    (analysisConfig.calculatedFields || []).forEach((field) => {
      if (!field || !field.name) {
        return;
      }
      const dataType = (() => {
        const fieldType = (field.type || '').toLowerCase();
        if (fieldType === 'date') return 'date';
        if (fieldType === 'string') return 'string';
        return 'number';
      })();
      metricMap.set(field.name, {
        name: field.name,
        label: field.name,
        dataType
      });
    });

    return Array.from(metricMap.values());
  }, [analysisConfig.aggregations, analysisConfig.calculatedFields]);

  const sortColumns = useMemo(() => {
    const columnMap = new Map((tableColumns || []).map((column) => [column.name, column]));

    (analysisConfig.calculatedFields || []).forEach((field) => {
      if (!field || !field.name) {
        return;
      }
      const fieldType = (field.type || '').toLowerCase();
      const dataType = fieldType === 'date'
        ? 'DATE'
        : fieldType === 'string'
          ? 'TEXT'
          : 'NUMERIC';
      columnMap.set(field.name, {
        name: field.name,
        label: field.name,
        dataType
      });
    });

    (analysisConfig.aggregations || []).forEach((aggregation) => {
      if (!aggregation) {
        return;
      }
      const sourceColumn = aggregation.column || '';
      const func = aggregation.function || aggregation.func || '';
      const alias = aggregation.alias && aggregation.alias.trim() ? aggregation.alias.trim() : '';
      const name = alias || (func ? `${func}(${sourceColumn})` : sourceColumn);
      if (!name) {
        return;
      }
      columnMap.set(name, {
        name,
        label: name,
        dataType: 'NUMERIC'
      });
    });

    return Array.from(columnMap.values());
  }, [analysisConfig.aggregations, analysisConfig.calculatedFields, tableColumns]);
  const { computeLocalConflicts, computePivotConflicts, getColumnProfilesArray, columnProfileMap } = useTypeConflictCheck({
    analysisConfig,
    columnProfiles,
    tableName,
    resolvedCasts,
    pivotConfig,
  });

  const mergeConflictSuggestions = useCallback((conflictList = [], suggestionMap = {}) => {
    const merged = { ...(suggestionMap || {}) };
    conflictList.forEach((conflict) => {
      const column = conflict?.left?.column;
      if (!column) {
        return;
      }
      const existing = merged[column] || [];
      const recommended = conflict?.recommended_casts || [];
      if (recommended.length > 0) {
        merged[column] = Array.from(new Set([...existing, ...recommended]));
      } else if (!merged[column]) {
        merged[column] = [];
      }
    });
    return merged;
  }, []);

  const conflictKeyFromList = useCallback((conflictList, actionType) => {
    const columns = (conflictList || [])
      .map((conflict) => conflict?.left?.column || '')
      .filter(Boolean);
    if (columns.length === 0) {
      return null;
    }
    const sorted = [...columns].sort((a, b) => a.localeCompare(b));
    return `${actionType || 'default'}::${sorted.join('|')}`;
  }, []);

  const openConflictDialog = useCallback(
    (conflictList, suggestionMap, actionType) => {
      if (!conflictList || conflictList.length === 0) {
        return false;
      }

      const conflictKey = conflictKeyFromList(conflictList, actionType);
      if (conflictKey && dismissedConflictKeys.has(conflictKey)) {
        return false;
      }

      const mergedSuggestions = mergeConflictSuggestions(conflictList, suggestionMap);
      setConflicts(conflictList);
      setSuggestedCasts(mergedSuggestions);
      setIsConflictDialogOpen(true);
      pendingActionRef.current = actionType ? { type: actionType } : null;
      setIsValidatingTypes(false);
      currentConflictKeyRef.current = conflictKey;
      return true;
    },
    [mergeConflictSuggestions, conflictKeyFromList, dismissedConflictKeys],
  );

  const clearConflictDialog = useCallback(() => {
    setConflicts([]);
    setSuggestedCasts({});
    setIsConflictDialogOpen(false);
    pendingActionRef.current = null;
    currentConflictKeyRef.current = null;
  }, []);

  const runTypeValidation = useCallback(
    async (configPayload, actionType, columnNames = []) => {
      setIsValidatingTypes(true);
      try {
        const payload = {
          config: configPayload,
          columnProfiles: getColumnProfilesArray(columnNames),
          resolvedCasts,
        };

        const response = await validateVisualQueryConfig(payload);
        if (!response) {
          return null;
        }

        if (!response.success) {
          if (Array.isArray(response.errors) && response.errors.length > 0) {
            setError(response.errors.join('; '));
          }
          return null;
        }

        const backendConflicts = response.conflicts || [];
        if (backendConflicts.length > 0) {
          const opened = openConflictDialog(backendConflicts, response.suggested_casts || {}, actionType);
          if (opened) {
            return null;
          }
        }

        if (response.suggested_casts) {
          setSuggestedCasts(mergeConflictSuggestions([], response.suggested_casts));
        }

        return response;
      } catch (err) {
        console.error('类型校验失败', err);
        setError(`类型校验失败: ${err.message || err}`);
        return null;
      } finally {
        setIsValidatingTypes(false);
      }
    },
    [getColumnProfilesArray, resolvedCasts, openConflictDialog, mergeConflictSuggestions],
  );

  // 加载后端特性开关（控制透视入口显隐）
  useEffect(() => {
    let mounted = true;
    getAppFeatures()
      .then((f) => {
        if (mounted) setFeatures(f || { enable_pivot_tables: true });
      })
      .catch(() => {
        if (mounted) setFeatures({ enable_pivot_tables: true });
      });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!shouldShowPanel || !tableName) {
      onVisualQueryInvalid({
        reason: 'panel_hidden',
        mode: activeMode,
        hasVisualConfig,
      });
      setColumnProfiles({});
      setResolvedCasts({});
      setIsMetadataReady(false);
      return;
    }

    const buildFallbackProfiles = () => {
      if (!selectedTable || !Array.isArray(selectedTable.columns)) {
        return {};
      }
      return (selectedTable.columns || []).reduce((acc, col) => {
        const name = typeof col === 'string' ? col : col?.name;
        if (!name || typeof name !== 'string') {
          return acc;
        }
        const key = name.toLowerCase();
        const source = typeof col === 'string' ? {} : col;
        const duckdbType = source?.dataType || source?.type || source?.normalizedType || null;
        const normalizedType = (source?.normalizedType || duckdbType || '')
          .toString()
          .toUpperCase() || null;

        acc[key] = {
          name,
          duckdb_type: duckdbType,
          raw_type: source?.rawType || source?.raw_type || duckdbType,
          normalized_type: normalizedType,
          precision: source?.precision ?? source?.numericPrecision ?? null,
          scale: source?.scale ?? source?.numericScale ?? null,
          null_count: source?.null_count ?? source?.nullCount ?? null,
          distinct_count: source?.distinct_count ?? source?.distinctCount ?? null,
          sample_values: Array.isArray(source?.sample_values)
            ? source.sample_values
            : Array.isArray(source?.sampleValues)
              ? source.sampleValues
              : [],
        };
        return acc;
      }, {});
    };

    let cancelled = false;

    setResolvedCasts({});
    setSuggestedCasts({});
    setIsMetadataReady(false);

    getTableMetadata(tableName)
      .then((resp) => {
        if (cancelled) return;
        const metadata = resp?.metadata;
        if (!metadata || !Array.isArray(metadata.columns)) {
          setColumnProfiles(buildFallbackProfiles());
          setIsMetadataReady(true);
          return;
        }

        const nextProfiles = metadata.columns.reduce((acc, col) => {
          const name = col.column_name || col.columnName || col.name;
          if (!name) {
            return acc;
          }
          const key = name.toLowerCase();
          const duckdbType = col.data_type || col.dataType || col.type || null;
          const normalizedType = (col.normalized_type || duckdbType || '')
            .toString()
            .toUpperCase();
          acc[key] = {
            name,
            duckdb_type: duckdbType,
            raw_type: col.raw_type || duckdbType,
            normalized_type: normalizedType,
            precision: col.precision ?? col.numeric_precision ?? null,
            scale: col.scale ?? col.numeric_scale ?? null,
            null_count: col.null_count ?? col.nullCount ?? null,
            distinct_count: col.distinct_count ?? col.distinctCount ?? null,
            sample_values: col.sample_values || col.sampleValues || [],
          };
          return acc;
        }, {});

        setColumnProfiles(nextProfiles);
        setIsMetadataReady(true);
      })
      .catch(() => {
        if (cancelled) return;
        setColumnProfiles(buildFallbackProfiles());
        setIsMetadataReady(true);
      });

    return () => {
      cancelled = true;
    };
  }, [shouldShowPanel, tableName, selectedTable, onVisualQueryInvalid, activeMode, hasVisualConfig]);

  useEffect(() => {
    if (!hasVisualConfig) {
      onVisualQueryInvalid({
        reason: 'config_cleared',
        mode: activeMode,
        hasVisualConfig: false,
      });
    }
  }, [hasVisualConfig, activeMode, onVisualQueryInvalid]);

  useEffect(() => {
    setDismissedConflictKeys(new Set());
  }, [analysisConfig, resolvedCasts, activeMode, tableName]);

  useEffect(() => {
    if (activeMode !== 'pivot' || !shouldShowPanel) {
      setPivotNotice(null);
      pivotWarningShownRef.current = false;
    }
  }, [activeMode, shouldShowPanel]);

  // Reset analysis config when table selection changes
  useEffect(() => {
    if (!shouldShowPanel) {
      setAnalysisConfig(createDefaultConfig(''));
      setGeneratedSQL('');
      setError('');
    } else if (selectedTable) {
      setAnalysisConfig(createDefaultConfig(selectedTable.name || selectedTable.id));
    }
  }, [shouldShowPanel, selectedTable?.id]);

  const handleConflictDialogClose = useCallback(() => {
    if (currentConflictKeyRef.current) {
      setDismissedConflictKeys((prev) => {
        const next = new Set(prev);
        next.add(currentConflictKeyRef.current);
        return next;
      });
    }
    clearConflictDialog();
  }, [clearConflictDialog]);

  const generateSQLRegular = useCallback(async () => {
    if (!selectedTable || !tableName || !isMetadataReady) return;
    if (hasVisualConfig) {
      onVisualQueryInvalid({
        reason: 'generating',
        mode: 'regular',
        hasVisualConfig: true,
      });
    }

    const configPayload = transformVisualConfigForApi(analysisConfig, tableName);
    const localConflicts = computeLocalConflicts();
    if (localConflicts.length > 0) {
      const opened = openConflictDialog(localConflicts, {}, 'regular');
      if (opened) {
        return;
      }
    }

    try {
      const availableColumnNames = tableColumns.map((col) => col.name);
      const columnMetaMap = new Map(tableColumns.map((col) => [col.name, col]));

      const detectColumnType = (columnName, fallbackType) => {
        if (fallbackType) {
          return fallbackType;
        }
        const meta = columnMetaMap.get(columnName);
        if (!meta) {
          return 'string';
        }
        const raw = (meta.dataType || meta.type || meta.normalized_type || 'string').toString().toLowerCase();
        if (/int|decimal|numeric|double|float|real/.test(raw)) {
          return 'number';
        }
        if (/date|time/.test(raw)) {
          return 'date';
        }
        if (/bool/.test(raw)) {
          return 'boolean';
        }
        return 'string';
      };

      const normalizeFilterForPayload = (filter = {}, sourceFilter = {}) => {
        if (!filter || !filter.operator) {
          return null;
        }

        const valueType = (filter.valueType || filter.value_type || FilterValueType.CONSTANT).toLowerCase();
        const normalized = {
          column: filter.column ?? '',
          operator: filter.operator,
          value: filter.value ?? null,
          value2: filter.value2 ?? null,
          valueType,
          logicOperator: filter.logicOperator || filter.logic_operator || LogicOperator.AND,
          rightColumn: filter.rightColumn || filter.right_column || '',
          expression: filter.expression || '',
          columnType: filter.columnType || filter.column_type || null,
          rightColumnType: filter.rightColumnType || filter.right_column_type || null,
          cast: filter.cast || filter.expression_cast || null,
        };

        const candidates = availableColumnNames.filter((name) => name && name !== normalized.column);
        const source = sourceFilter || {};
        const hasExplicitRightColumn =
          Object.prototype.hasOwnProperty.call(source, 'rightColumn') ||
          Object.prototype.hasOwnProperty.call(source, 'right_column');

        if (normalized.valueType === FilterValueType.COLUMN) {
          if (!hasExplicitRightColumn && candidates.length > 0 && !normalized.rightColumn) {
            normalized.rightColumn = candidates[0];
          }
          if (normalized.rightColumn) {
            normalized.rightColumnType = detectColumnType(normalized.rightColumn, normalized.rightColumnType);
          } else {
            normalized.rightColumnType = null;
          }
          normalized.value = null;
          normalized.value2 = null;
        } else if (normalized.valueType === FilterValueType.EXPRESSION) {
          const expr = (normalized.expression || '').trim() ||
            (typeof normalized.value === 'string' ? normalized.value.trim() : '');
          normalized.expression = expr;
          normalized.value = null;
          normalized.value2 = null;
          if (!normalized.column) {
            normalized.column = '';
            normalized.columnType = null;
          }
        } else {
          if (typeof normalized.value === 'string' && normalized.value.trim() === '') {
            normalized.value = null;
          }
          if (typeof normalized.value2 === 'string' && normalized.value2.trim() === '') {
            normalized.value2 = null;
          }
        }

        if (normalized.column) {
          normalized.columnType = detectColumnType(normalized.column, normalized.columnType);
        } else {
          normalized.columnType = null;
        }

        return normalized;
      };

      const buildNormalizedFilters = (rawFilters = []) => {
        const list = Array.isArray(rawFilters) ? rawFilters : [];
        return list
          .map((rawFilter) => {
            const sanitized = sanitizeFilter(rawFilter);
            if (!sanitized) {
              return null;
            }
            return normalizeFilterForPayload(sanitized, rawFilter);
          })
          .filter(Boolean);
      };

      const normalizedFilters = buildNormalizedFilters(analysisConfig.filters);
      const normalizedHaving = buildNormalizedFilters(analysisConfig.having);

      const missingColumnFilters = normalizedFilters
        .map((filter, idx) => ({
          index: idx,
          filter,
        }))
        .filter(
          ({ filter }) =>
            filter.valueType === FilterValueType.COLUMN &&
            (!filter.rightColumn || !filter.rightColumn.trim()),
        );
      const missingColumnHaving = normalizedHaving
        .map((filter, idx) => ({
          index: idx,
          filter,
        }))
        .filter(
          ({ filter }) =>
            filter.valueType === FilterValueType.COLUMN &&
            (!filter.rightColumn || !filter.rightColumn.trim()),
        );

      if (missingColumnFilters.length > 0 || missingColumnHaving.length > 0) {
        const names = [];
        missingColumnFilters.forEach(({ index }) =>
          names.push(`WHERE 条件 #${index + 1}`),
        );
        missingColumnHaving.forEach(({ index }) =>
          names.push(`HAVING 条件 #${index + 1}`),
        );
        const message = `列对列筛选需要选择比较列：${names.join('、')}`;
        setError(message);
        setGeneratedSQL('');
        setWarnings([]);
        setBaseSQL('');
        setPivotSQL('');
        return;
      }

      const usedColumnNames = new Set();
      const addColumn = (name) => {
        if (!name) return;
        const trimmed = typeof name === 'string' ? name.trim() : name;
        if (trimmed) {
          usedColumnNames.add(trimmed);
        }
      };

      normalizedFilters.forEach((filter) => {
        addColumn(filter.column);
        if (filter.valueType === FilterValueType.COLUMN && filter.rightColumn) {
          addColumn(filter.rightColumn);
        }
        if (filter.valueType === FilterValueType.EXPRESSION && filter.expression) {
          extractColumnsFromExpression(filter.expression).forEach(addColumn);
        }
      });

      normalizedHaving.forEach((filter) => {
        addColumn(filter.column);
        if (filter.valueType === FilterValueType.COLUMN && filter.rightColumn) {
          addColumn(filter.rightColumn);
        }
        if (filter.valueType === FilterValueType.EXPRESSION && filter.expression) {
          extractColumnsFromExpression(filter.expression).forEach(addColumn);
        }
      });

      (analysisConfig.selectedColumns || []).forEach(addColumn);
      (analysisConfig.groupBy || []).forEach(addColumn);
      (analysisConfig.orderBy || []).forEach((order) => addColumn(order.column));
      (analysisConfig.aggregations || []).forEach((agg) => addColumn(agg.column));

      (analysisConfig.calculatedFields || []).forEach((field) => {
        if (field?.expression) {
          extractColumnsFromExpression(field.expression).forEach(addColumn);
        }
      });

      (analysisConfig.conditionalFields || []).forEach((field) => {
        if (field?.conditions) {
          field.conditions.forEach((condition) => addColumn(condition?.column));
        }
        if (field?.column) {
          addColumn(field.column);
        }
      });

      const columnsForValidation = Array.from(usedColumnNames);

      const enrichPayloadForValidation = (basePayload) => ({
        ...basePayload,
        filters: normalizedFilters.map((filter) => ({
          column: filter.column || null,
          operator: filter.operator,
          value:
            filter.valueType === FilterValueType.COLUMN
              ? filter.rightColumn || null
              : filter.valueType === FilterValueType.EXPRESSION
                ? filter.expression || '0'
                : filter.value,
          value2: filter.value2,
          value_type: filter.valueType,
          logic_operator: filter.logicOperator,
          right_column: filter.rightColumn || undefined,
          expression: filter.expression || undefined,
          column_type: filter.columnType || undefined,
          right_column_type: filter.rightColumnType || undefined,
          cast: filter.cast || undefined,
        })),
        having: normalizedHaving.map((filter) => ({
          column: filter.column || null,
          operator: filter.operator,
          value:
            filter.valueType === FilterValueType.COLUMN
              ? filter.rightColumn || null
              : filter.valueType === FilterValueType.EXPRESSION
                ? filter.expression || '0'
                : filter.value,
          value2: filter.value2,
          value_type: filter.valueType,
          logic_operator: filter.logicOperator,
          right_column: filter.rightColumn || undefined,
          expression: filter.expression || undefined,
          column_type: filter.columnType || undefined,
          right_column_type: filter.rightColumnType || undefined,
          cast: filter.cast || undefined,
        })),
      });

      const validationResult = await runTypeValidation(
        enrichPayloadForValidation(configPayload),
        'regular',
        columnsForValidation,
      );
      if (!validationResult) {
        return;
      }

      const previewConfig = {
        ...analysisConfig,
        filters: normalizedFilters,
        having: normalizedHaving,
      };

      const result = generateSQLPreview(
        previewConfig,
        tableName,
        selectedTable?.columns || [],
        { resolvedCasts },
      );

      if (!result.success) {
        setError((result.errors || []).join('; '));
        setGeneratedSQL('');
        setWarnings(result.warnings || []);
        setBaseSQL('');
        setPivotSQL('');
        return;
      }

      setGeneratedSQL(result.sql);
      setBaseSQL('');
      setPivotSQL('');
      setWarnings([...(result.warnings || []), ...(validationResult.warnings || [])]);
      setError('');

      if (onVisualQueryGenerated) {
        const cleanSQL = result.sql.replace(/^--.*$/gm, '').trim();
        onVisualQueryGenerated(cleanSQL, {
          mode: 'regular',
          config: analysisConfig,
          tableName,
          resolvedCasts,
          hasVisualConfig,
        });
      }
  } catch (err) {
    const errorMsg = `SQL生成失败: ${err.message}`;
      setError(errorMsg);
    }
  }, [selectedTable, tableName, analysisConfig, computeLocalConflicts, openConflictDialog, runTypeValidation, resolvedCasts, onVisualQueryGenerated, onVisualQueryInvalid, isMetadataReady, hasVisualConfig]);

  const generateSQLPivot = useCallback(async () => {
    if (!selectedTable || !tableName || !isMetadataReady) return;
    if (hasVisualConfig) {
      onVisualQueryInvalid({
        reason: 'generating',
        mode: 'pivot',
        hasVisualConfig: true,
      });
    }
    if (!features?.enable_pivot_tables) {
      const message = '管理员已关闭透视表功能';
      setError(message);
      setPivotNotice({ severity: 'error', message });
      showError(message);
      onVisualQueryInvalid({
        reason: 'pivot_feature_disabled',
        mode: 'pivot',
        hasVisualConfig,
      });
      return;
    }

    // 前置拦截：未配置透视条件时，不请求后端，展示基础SQL并提示
    const hasDim = (arr) => Array.isArray(arr) && arr.length > 0;
    const hasValues = Array.isArray(pivotConfig?.values) && pivotConfig.values.some((v) => v && v.column);
    if (!(hasDim(pivotConfig?.rows) || hasDim(pivotConfig?.columns)) || !hasValues) {
      try {
        const result = generateSQLPreview(
          analysisConfig,
          tableName,
          selectedTable?.columns || [],
          { resolvedCasts },
        );
        const fallbackSql = result?.sql || '';
        setBaseSQL(fallbackSql);
        setPivotSQL('');
        setGeneratedSQL(fallbackSql);
        setWarnings(result?.warnings || []);
        setError('');

        const warningMessage = '请先在透视面板选择“行/列字段”和至少一个“指标”，当前回落到常规查询';
        setPivotNotice({ severity: 'warning', message: warningMessage });
        if (!pivotWarningShownRef.current) {
          showWarning(warningMessage);
          pivotWarningShownRef.current = true;
        }

        if (onVisualQueryGenerated) {
          const cleanSQL = fallbackSql.replace(/^--.*$/gm, '').trim();
          onVisualQueryGenerated(cleanSQL, {
            mode: 'regular',
            config: analysisConfig,
            tableName,
            resolvedCasts,
            hasVisualConfig,
          });
        }
      } catch (e) {
        const message = `透视前置校验失败：${e.message}`;
        setError(message);
        setPivotNotice({ severity: 'error', message });
        showError(message);
      }
      // 保留常规模式配置，让执行按钮走 execute
      return;
    }

    setPivotNotice(null);
    pivotWarningShownRef.current = false;

    const configPayload = transformVisualConfigForApi(analysisConfig, tableName);
    const pivotPayload = transformPivotConfigForApi(pivotConfig);

    // 前置校验：原生透视仅支持 1 个列字段
    if (!Array.isArray(pivotPayload.columns) || pivotPayload.columns.length !== 1) {
      const message = '原生透视仅支持 1 个列字段';
      setError('');
      setPivotNotice({ severity: 'error', message });
      showError(message);
      onVisualQueryInvalid({
        reason: 'pivot_column_limit',
        mode: 'pivot',
        hasVisualConfig,
      });
      return;
    }
    // 前置校验：需要手工列值顺序或列数量上限其一
    const hasManual =
      Array.isArray(pivotPayload.manual_column_values) && pivotPayload.manual_column_values.length > 0;
    const hasLimit = typeof pivotPayload.column_value_limit === 'number' && pivotPayload.column_value_limit > 0;
    if (!hasManual && !hasLimit) {
      const message = '请填写“列值顺序”或设置“列数量上限”（建议 10~12）';
      setError('');
      setPivotNotice({ severity: 'error', message });
      showError(message);
      onVisualQueryInvalid({
        reason: 'pivot_limit_required',
        mode: 'pivot',
        hasVisualConfig,
      });
      return;
    }

    const localConflicts = computeLocalConflicts();
    if (localConflicts.length > 0) {
      openConflictDialog(localConflicts, {}, 'pivot');
      return;
    }

    const pivotConflicts = computePivotConflicts();
    if (pivotConflicts.length > 0) {
      const opened = openConflictDialog(pivotConflicts, {}, 'pivot');
      if (opened) {
        return;
      }
    }

    const allColumnNames = tableColumns.map((col) => col.name).filter(Boolean);

    const validationResult = await runTypeValidation(configPayload, 'pivot', allColumnNames);
    if (!validationResult) {
      return;
    }

    try {
      setIsLoading(true);
      const configuredMaxRows = Number(features?.max_query_rows);
      const previewRowLimit = Number.isFinite(configuredMaxRows) && configuredMaxRows > 0
        ? configuredMaxRows
        : 10000;

      const resp = await previewVisualQuery(
        {
          config: configPayload,
          mode: 'pivot',
          pivotConfig: pivotPayload,
          includeMetadata: true,
        },
        previewRowLimit,
        { resolvedCasts },
      );

      if (!resp?.success) {
        const message = (resp?.errors && resp.errors.join('; ')) || '透视 SQL 生成失败';
        setError(message);
        setPivotNotice({ severity: 'error', message });
        showError(message);
        setGeneratedSQL('');
        setBaseSQL('');
        setPivotSQL('');
        return;
      }

      setGeneratedSQL(resp.sql || '');
      setBaseSQL(resp.base_sql || '');
      setPivotSQL(resp.pivot_sql || '');
      setWarnings([...(resp.warnings || []), ...(validationResult.warnings || [])]);
      setError('');
      setPivotNotice(null);

      if (onVisualQueryGenerated) {
        const cleanSQL = (resp.sql || '').trim();
        onVisualQueryGenerated(cleanSQL, {
          mode: 'pivot',
          regular: analysisConfig,
          pivot: pivotConfig,
          tableName,
          resolvedCasts,
          previewLimit: previewRowLimit,
          hasVisualConfig,
        });
      }
    } catch (err) {
      const message = `透视 SQL 生成失败: ${err.message}`;
      setError(message);
      setPivotNotice({ severity: 'error', message });
      showError(message);
    } finally {
      setIsLoading(false);
    }
  }, [
    selectedTable,
    tableName,
    features,
    analysisConfig,
    pivotConfig,
    resolvedCasts,
    computeLocalConflicts,
    computePivotConflicts,
    openConflictDialog,
    runTypeValidation,
    onVisualQueryGenerated,
    onVisualQueryInvalid,
    isMetadataReady,
    showWarning,
    showError,
    hasVisualConfig,
  ]);

  const handleConflictResolution = useCallback(
    (castsMap) => {
      if (castsMap && Object.keys(castsMap).length > 0) {
        const normalizedEntries = {};
        const expressionUpdates = [];

        Object.entries(castsMap).forEach(([column, cast]) => {
          if (!column || !cast) {
            return;
          }
          const upperCast = cast.toUpperCase();
          if (column.startsWith(EXPRESSION_FILTER_CAST_PREFIX)) {
            expressionUpdates.push({
              scope: 'filter',
              identifier: column.slice(EXPRESSION_FILTER_CAST_PREFIX.length),
              cast: upperCast,
            });
          } else if (column.startsWith(EXPRESSION_HAVING_CAST_PREFIX)) {
            expressionUpdates.push({
              scope: 'having',
              identifier: column.slice(EXPRESSION_HAVING_CAST_PREFIX.length),
              cast: upperCast,
            });
          } else {
            normalizedEntries[column.toLowerCase()] = upperCast;
          }
        });

        if (expressionUpdates.length > 0) {
          setAnalysisConfig((prev) => {
            const updateList = (list = [], scope) =>
              list.map((item, idx) => {
                const key =
                  item?.id !== undefined && item?.id !== null
                    ? String(item.id)
                    : `idx_${idx}`;
                const match = expressionUpdates.find(
                  (update) =>
                    update.scope === scope && update.identifier === key,
                );
                if (!match) {
                  return item;
                }
                return {
                  ...item,
                  cast: match.cast,
                };
              });

            return {
              ...prev,
              filters: updateList(prev.filters, 'filter'),
              having: updateList(prev.having, 'having'),
            };
          });
        }

        if (Object.keys(normalizedEntries).length > 0) {
          setResolvedCasts((prev) => ({ ...prev, ...normalizedEntries }));
        }
      }

      if (currentConflictKeyRef.current) {
        setDismissedConflictKeys((prev) => {
          const next = new Set(prev);
          next.delete(currentConflictKeyRef.current);
          return next;
        });
      }

      clearConflictDialog();
      const pending = pendingActionRef.current;
      pendingActionRef.current = null;

      if (pending?.type === 'regular') {
        generateSQLRegular();
      } else if (pending?.type === 'pivot') {
        generateSQLPivot();
      }
    },
    [clearConflictDialog, generateSQLRegular, generateSQLPivot, setAnalysisConfig],
  );

  // 根据模式生成/预览 SQL
  useEffect(() => {
    if (!isMetadataReady || !shouldShowPanel || !selectedTable || isConflictDialogOpen) return;
    if (activeMode === 'regular') {
      generateSQLRegular();
    } else {
      generateSQLPivot();
    }
  }, [
    analysisConfig,
    pivotConfig,
    activeMode,
    shouldShowPanel,
    selectedTable,
    isConflictDialogOpen,
    generateSQLRegular,
    generateSQLPivot,
    isMetadataReady,
  ]);

  // Update analysis configuration
  const collectActiveColumns = useCallback((config) => {
    const acc = new Set();
    const push = (value) => {
      if (!value) return;
      if (Array.isArray(value)) {
        value.forEach(push);
        return;
      }
      const column = typeof value === 'string' ? value : value?.column;
      if (column && typeof column === 'string') {
        acc.add(column.toLowerCase());
      }
    };

    push(config.selectedColumns);
    push((config.aggregations || []).map((agg) => agg.column));
    push((config.filters || []).map((filter) => filter.column));
    push((config.having || []).map((filter) => filter.column));
    push(config.groupBy);
    push(config.orderBy?.map((item) => item.column));

    (config.filters || []).forEach((filter) => {
      const valueType = filter.valueType || filter.value_type;
      if (valueType === 'column') {
        const rightColumn = filter.rightColumn || filter.right_column;
        if (rightColumn && typeof rightColumn === 'string') {
          acc.add(rightColumn.toLowerCase());
        }
      }
    });

    (config.having || []).forEach((filter) => {
      const valueType = filter.valueType || filter.value_type;
      if (valueType === 'column') {
        const rightColumn = filter.rightColumn || filter.right_column;
        if (rightColumn && typeof rightColumn === 'string') {
          acc.add(rightColumn.toLowerCase());
        }
      }
    });

    return Array.from(acc);
  }, []);

  const pruneResolvedCasts = useCallback((activeColumns) => {
    const normalized = new Set((activeColumns || []).map((col) => col.toLowerCase()));
    setResolvedCasts((prev) => {
      const entries = Object.entries(prev);
      const filtered = entries.filter(([column]) => normalized.has(column));
      if (filtered.length === entries.length) {
        return prev;
      }
      return filtered.reduce((acc, [column, cast]) => {
        acc[column] = cast;
        return acc;
      }, {});
    });
  }, []);

  const updateAnalysisConfig = (updates) => {
    setAnalysisConfig(prev => {
      const next = {
        ...prev,
        ...updates
      };
      const activeColumns = collectActiveColumns(next);
      pruneResolvedCasts(activeColumns);
      return next;
    });
  };

  // Handle column selection changes
  const handleColumnSelectionChange = (selectedColumns) => {
    updateAnalysisConfig({ selectedColumns });
  };

  // Handle aggregation changes
  const handleAggregationsChange = (aggregations) => {
    updateAnalysisConfig({ aggregations });
  };

  // Handle filter changes
  const handleFiltersChange = (filters) => {
    updateAnalysisConfig({ filters });
  };

  const handleHavingChange = (having) => {
    updateAnalysisConfig({ having });
  };

  // Handle order by changes
  const handleOrderByChange = (orderBy) => {
    updateAnalysisConfig({ orderBy });
  };

  const handleGroupByChange = (groupBy) => {
    updateAnalysisConfig({ groupBy });
  };

  // Handle limit changes
  const handleLimitChange = (limit) => {
    updateAnalysisConfig({ limit });
  };

  // Get configuration summary for collapsed state
  const getConfigSummary = (config) => {
    const parts = [];

    if (config.selectedColumns && config.selectedColumns.length > 0) {
      parts.push(`${config.selectedColumns.length}列`);
    }

    if (config.aggregations && config.aggregations.length > 0) {
      parts.push(`${config.aggregations.length}个聚合`);
    }

    if (config.calculatedFields && config.calculatedFields.length > 0) {
      parts.push(`${config.calculatedFields.length}个计算字段`);
    }

    if (config.filters && config.filters.length > 0) {
      parts.push(`${config.filters.length}个筛选`);
    }

    if (config.having && config.having.length > 0) {
      parts.push(`${config.having.length}个聚合筛选`);
    }

    if (config.orderBy && config.orderBy.length > 0) {
      parts.push(`${config.orderBy.length}个排序`);
    }

    if (config.limit) {
      parts.push(`限制${config.limit}条`);
    }

    return parts.length > 0 ? parts.join(' | ') : '未配置分析条件';
  };

  // Don't render if conditions aren't met
  if (!shouldShowPanel) {
    return null;
  }

  return (
    <>
      <Fade in={shouldShowPanel}>
        <div className="mb-6">
          {/* Main Panel Container - 柔和圆润风格 */}
          <div className="visual-analysis-panel">
          {/* Panel Header */}
          <div
            className="visual-analysis-panel__header cursor-pointer"
            onClick={() => setIsExpanded(!isExpanded)}
          >
            <div className="flex items-center gap-3">
              <div className="visual-analysis-panel__icon flex-shrink-0">
                <LineChart size={16} strokeWidth={2} />
              </div>
              <div className="leading-tight">
                <div className="flex items-center gap-2">
                  <h3
                    className="text-base font-bold leading-none visual-analysis-panel__title"
                  >
                    可视化分析
                  </h3>
                  <span
                    className="text-sm font-semibold visual-analysis-panel__pill"
                  >
                    单表分析
                  </span>
                </div>
                <p
                  className="text-sm visual-analysis-panel__summary"
                >
                  {isExpanded
                    ? `为 "${selectedTable?.name || selectedTable?.id}" 配置分析条件`
                    : `${getConfigSummary(analysisConfig)} | 点击展开配置`
                  }
                </p>
              </div>
            </div>
            <IconButton
              className="flex-shrink-0"
              size="small"
              disableRipple
              onClick={(event) => {
                event.stopPropagation();
                setIsExpanded(prev => !prev);
              }}
              aria-label={isExpanded ? '收起分析面板' : '展开分析面板'}
              sx={{
                width: '1.9rem',
                height: '1.9rem',
                borderRadius: '999px',
                border: '1px solid var(--dq-border-subtle)',
                backgroundColor: 'var(--dq-surface-alt)',
                color: 'var(--dq-text-secondary)',
                transition: 'background-color 0.2s ease, border-color 0.2s ease, color 0.2s ease',
                '&:hover': {
                  backgroundColor: 'var(--dq-surface-hover)',
                  borderColor: 'var(--dq-border-card)',
                  color: 'var(--dq-accent-100)'
                }
              }}
            >
              <ChevronDown
                size={16}
                strokeWidth={2.5}
                style={{ transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s ease' }}
              />
            </IconButton>
          </div>

          {/* Panel Content */}
          <Collapse in={isExpanded}>
            <div
              className="visual-analysis-panel__content rounded-b-3xl p-6"
            >
              {error && (
                <Alert
                  severity="error"
                  sx={{
                    mb: 3,
                    borderRadius: 2,
                    border: '1px solid color-mix(in oklab, var(--dq-status-error-fg) 25%, transparent)'
                  }}
                  onClose={() => setError('')}
                >
                  {error}
                </Alert>
              )}

              {/* 模式切换 */}
              <div className="flex items-center gap-2 mb-4">
                <div className="text-sm text-[color:var(--dq-text-secondary)] visual-analysis-panel__mode-label">分析模式</div>
                <div className="dq-tab-group">
                  <Button
                    disableRipple
                    variant="text"
                    className={`dq-tab ${activeMode === 'regular' ? 'dq-tab--active' : ''}`}
                    onClick={() => !isLoading && setActiveMode('regular')}
                    sx={{ minWidth: 'auto', padding: 'var(--dq-tab-padding-y) var(--dq-tab-padding-x)' }}
                    disabled={isLoading}
                  >
                    常规
                  </Button>
                  {features?.enable_pivot_tables && (
                    <Button
                      disableRipple
                      variant="text"
                      className={`dq-tab ${activeMode === 'pivot' ? 'dq-tab--active' : ''}`}
                      onClick={() => !isLoading && setActiveMode('pivot')}
                      sx={{ minWidth: 'auto', padding: 'var(--dq-tab-padding-y) var(--dq-tab-padding-x)' }}
                      disabled={isLoading}
                    >
                      透视
                    </Button>
                  )}
                </div>
                {!features?.enable_pivot_tables && (
                  <span className="text-sm text-[color:var(--dq-text-tertiary)]">透视功能已在系统中关闭</span>
                )}
              </div>

              {/* Analysis Controls packaged into a single collapsible shell */}
              <CollapsibleSection
                title="常规配置"
                description={regularConfigSummary}
                storageKey={SECTION_STORAGE_KEYS.regularPanel}
                className="visual-analysis-section-card--pivot mb-6"
              >
                <div className="visual-analysis-panel__grid">

                  {/* Column Selection */}
                  <CollapsibleSection
                    title="选择列 (SELECT)"
                    description={`已选 ${analysisConfig.selectedColumns?.length || 0}/${tableColumns.length || 0} 列`}
                    storageKey={SECTION_STORAGE_KEYS.columns}
                  >
                    <ColumnSelector
                      selectedTable={selectedTable}
                      selectedColumns={analysisConfig.selectedColumns}
                      onColumnSelectionChange={handleColumnSelectionChange}
                      maxHeight={200}
                      showMetadata={true}
                      resolvedCasts={resolvedCasts}
                      disabled={isLoading}
                      showHeader={false}
                    />
                  </CollapsibleSection>

                  {/* Aggregation Controls */}
                  <CollapsibleSection
                    title="聚合函数"
                    description={`已配置 ${analysisConfig.aggregations?.length || 0} 项`}
                    storageKey={SECTION_STORAGE_KEYS.aggregations}
                  >
                    <AggregationControls
                      selectedTable={selectedTable}
                      aggregations={analysisConfig.aggregations}
                      onAggregationsChange={handleAggregationsChange}
                      disabled={isLoading}
                      maxHeight={200}
                      resolvedCasts={resolvedCasts}
                      showHeader={false}
                    />
                  </CollapsibleSection>

                  {/* Calculated Fields */}
                  <CollapsibleSection
                    title="计算字段"
                    description={`已创建 ${analysisConfig.calculatedFields?.length || 0} 个`}
                    storageKey={SECTION_STORAGE_KEYS.calculated}
                  >
                    <CalculatedFieldsControls
                      columns={selectedTable?.columns || []}
                      calculatedFields={analysisConfig.calculatedFields || []}
                      onCalculatedFieldsChange={(calculatedFields) => updateAnalysisConfig({ calculatedFields })}
                      disabled={isLoading}
                      showHeader={false}
                    />
                  </CollapsibleSection>

                  {/* WHERE Filters */}
                  <CollapsibleSection
                    title="筛选条件 (WHERE)"
                    description={`已配置 ${analysisConfig.filters?.length || 0} 条`}
                    storageKey={SECTION_STORAGE_KEYS.filters}
                  >
                    <FilterControls
                      columns={tableColumns}
                      filters={analysisConfig.filters || []}
                      onFiltersChange={handleFiltersChange}
                      disabled={isLoading}
                      showHeader={false}
                    />
                  </CollapsibleSection>

                  {/* HAVING Filters */}
                  <CollapsibleSection
                    title="聚合筛选 (HAVING)"
                    description={`已配置 ${analysisConfig.having?.length || 0} 条`}
                    storageKey={SECTION_STORAGE_KEYS.having}
                  >
                    <FilterControls
                      columns={havingColumns}
                      filters={analysisConfig.having || []}
                      onFiltersChange={handleHavingChange}
                      disabled={isLoading}
                      mode="having"
                      noColumnsMessage="请先配置聚合或计算字段，再设置 HAVING 条件"
                      showHeader={false}
                    />
                  </CollapsibleSection>

                  {/* Sort Controls */}
                  <CollapsibleSection
                    title="排序与分组"
                    description={`排序 ${analysisConfig.orderBy?.length || 0} 项 · 分组 ${analysisConfig.groupBy?.length || 0} 项`}
                    storageKey={SECTION_STORAGE_KEYS.sort}
                  >
                    <SortControls
                      columns={sortColumns}
                      orderBy={analysisConfig.orderBy || []}
                      onOrderByChange={handleOrderByChange}
                      groupBy={analysisConfig.groupBy || []}
                      onGroupByChange={handleGroupByChange}
                      disabled={isLoading}
                      showHeader={false}
                    />
                  </CollapsibleSection>

                  {/* Limit Controls */}
                  <CollapsibleSection
                    title="限制行数 (LIMIT)"
                    description={analysisConfig.limit ? `当前限制 ${analysisConfig.limit} 行` : '未启用限制'}
                    storageKey={SECTION_STORAGE_KEYS.limit}
                    className="visual-analysis-section-card--full"
                  >
                    <LimitControls
                      limit={analysisConfig.limit}
                      onLimitChange={handleLimitChange}
                      disabled={isLoading}
                      showHeader={false}
                    />
                  </CollapsibleSection>

                </div>
              </CollapsibleSection>

              {/* 透视配置，仅在 pivot 模式显示 */}
              {activeMode === 'pivot' && features?.enable_pivot_tables && (
                <CollapsibleSection
                  title="透视配置"
                  description="选择行列字段与指标，生成透视视图"
                  storageKey={SECTION_STORAGE_KEYS.pivot}
                  className="visual-analysis-section-card--pivot mb-6"
                >
                  <div className="mb-2 text-sm text-[color:var(--dq-text-secondary)] visual-analysis-panel__pivot-tip">
                    小提示：勾选行/列字段并选择指标，即可生成透视表，无需拖拽。
                  </div>
                  {pivotNotice && (
                    <Alert
                      severity={pivotNotice.severity || 'info'}
                      sx={{ mb: 2 }}
                    >
                      {pivotNotice.message}
                    </Alert>
                  )}
                  <PivotConfigurator
                    columns={selectedTable?.columns || []}
                    pivotConfig={pivotConfig}
                    onChange={setPivotConfig}
                    disabled={isLoading}
                    selectedTable={selectedTable}
                    analysisConfig={analysisConfig}
                  />
                </CollapsibleSection>
              )}

              {/* SQL Preview Section */}
              <div className="space-y-2">
                <SQLPreview
                  sql={generatedSQL}
                  title="生成的SQL查询"
                  height={120}
                />
                {activeMode === 'pivot' && (
                  <>
                    {baseSQL ? (
                      <SQLPreview sql={baseSQL} title="基础SQL (base)" height={100} />
                    ) : null}
                    {pivotSQL ? (
                      <SQLPreview sql={pivotSQL} title="透视片段 (pivot)" height={100} />
                    ) : null}
                  </>
                )}
              </div>


            </div>
          </Collapse>
          </div>
        </div>
      </Fade>
      <TypeConflictDialog
        open={isConflictDialogOpen}
        conflicts={conflicts}
        suggestedCasts={suggestedCasts}
        onClose={handleConflictDialogClose}
        onSubmit={handleConflictResolution}
        isSubmitting={isValidatingTypes}
        resolvedCasts={resolvedCasts}
      />
    </>
  );
};

export default VisualAnalysisPanel;
