import {
  Alert,
  Collapse,
  Fade
} from '@mui/material';
import { ChevronDown, LineChart } from 'lucide-react';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { getAppFeatures, previewVisualQuery, getTableMetadata, validateVisualQueryConfig } from '../../services/apiClient';
import {
  createDefaultConfig,
  createDefaultPivotConfig,
  generateSQLPreview,
  transformPivotConfigForApi,
  transformVisualConfigForApi
} from '../../utils/visualQueryUtils';
import AggregationControls from './AggregationControls';
import ColumnSelector from './ColumnSelector';
import FilterControls from './FilterControls';
import LimitControls from './LimitControls';
import PivotConfigurator from './PivotConfigurator';
import SortControls from './SortControls';
import SQLPreview from './SQLPreview';
import TypeConflictDialog from './VisualAnalysis/TypeConflictDialog';
import useTypeConflictCheck from '../../hooks/useTypeConflictCheck';
import { useToast } from '../../contexts/ToastContext';

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
  const [isExpanded, setIsExpanded] = useState(false); // 默认折叠状态
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
    async (configPayload, actionType) => {
      setIsValidatingTypes(true);
      try {
        const payload = {
          config: configPayload,
          columnProfiles: getColumnProfilesArray(),
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
  }, [shouldShowPanel, tableName, selectedTable, onVisualQueryInvalid, activeMode]);

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

    const configPayload = transformVisualConfigForApi(analysisConfig, tableName);
    const localConflicts = computeLocalConflicts();
    if (localConflicts.length > 0) {
      const opened = openConflictDialog(localConflicts, {}, 'regular');
      if (opened) {
        return;
      }
    }

    const validationResult = await runTypeValidation(configPayload, 'regular');
    if (!validationResult) {
      return;
    }

    try {
      const result = generateSQLPreview(
        analysisConfig,
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
        });
      }
    } catch (err) {
      const errorMsg = `SQL生成失败: ${err.message}`;
      setError(errorMsg);
    }
  }, [selectedTable, tableName, analysisConfig, computeLocalConflicts, openConflictDialog, runTypeValidation, resolvedCasts, onVisualQueryGenerated, isMetadataReady]);

  const generateSQLPivot = useCallback(async () => {
    if (!selectedTable || !tableName || !isMetadataReady) return;
    if (!features?.enable_pivot_tables) {
      const message = '管理员已关闭透视表功能';
      setError(message);
      setPivotNotice({ severity: 'error', message });
      showError(message);
      onVisualQueryInvalid({
        reason: 'pivot_feature_disabled',
        mode: 'pivot',
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

    const validationResult = await runTypeValidation(configPayload, 'pivot');
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
    isMetadataReady,
    showWarning,
    showError,
  ]);

  const handleConflictResolution = useCallback(
    (castsMap) => {
      if (castsMap && Object.keys(castsMap).length > 0) {
        const normalized = Object.entries(castsMap).reduce((acc, [column, cast]) => {
          if (column && cast) {
            acc[column.toLowerCase()] = cast.toUpperCase();
          }
          return acc;
        }, {});
        setResolvedCasts((prev) => ({ ...prev, ...normalized }));
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
    [clearConflictDialog, generateSQLRegular, generateSQLPivot],
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
    push(config.groupBy);
    push(config.orderBy?.map((item) => item.column));

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

  // Handle order by changes
  const handleOrderByChange = (orderBy) => {
    updateAnalysisConfig({ orderBy });
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

    if (config.filters && config.filters.length > 0) {
      parts.push(`${config.filters.length}个筛选`);
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
            <button
              type="button"
              className="toggle-chip visual-analysis-panel__toggle flex items-center justify-center flex-shrink-0"
              onClick={(event) => {
                event.stopPropagation();
                setIsExpanded(prev => !prev);
              }}
              aria-label={isExpanded ? '收起分析面板' : '展开分析面板'}
            >
              <ChevronDown
                size={16}
                strokeWidth={2.5}
                style={{ transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s ease' }}
              />
            </button>
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
                    border: '1px solid rgba(211, 47, 47, 0.1)'
                  }}
                  onClose={() => setError('')}
                >
                  {error}
                </Alert>
              )}

              {/* 模式切换 */}
              <div className="flex items-center gap-2 mb-4">
                <div className="text-sm text-gray-600 visual-analysis-panel__mode-label">分析模式</div>
                <div
                  className="inline-flex rounded-full overflow-hidden visual-analysis-panel__mode-switch"
                >
                  <button
                    type="button"
                    className={`px-3 py-1 text-sm visual-analysis-panel__mode-button ${activeMode === 'regular' ? 'is-active' : ''}`}
                    onClick={() => setActiveMode('regular')}
                    disabled={isLoading}
                  >
                    常规
                  </button>
                  {features?.enable_pivot_tables && (
                    <button
                      type="button"
                      className={`px-3 py-1 text-sm visual-analysis-panel__mode-button ${activeMode === 'pivot' ? 'is-active' : ''}`}
                      onClick={() => setActiveMode('pivot')}
                      disabled={isLoading}
                    >
                      透视
                    </button>
                  )}
                </div>
                {!features?.enable_pivot_tables && (
                  <span className="text-sm text-gray-500">透视功能已在系统中关闭</span>
                )}
              </div>

              {/* Analysis Controls Grid - 3行布局按SQL顺序 */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6 visual-analysis-panel__grid">

                {/* 第一行：SELECT相关 */}
                {/* Column Selection - SELECT */}
                <div className="visual-analysis-section-card">
                  <ColumnSelector
                    selectedTable={selectedTable}
                    selectedColumns={analysisConfig.selectedColumns}
                    onColumnSelectionChange={handleColumnSelectionChange}
                    maxHeight={200}
                    showMetadata={true}
                    resolvedCasts={resolvedCasts}
                    disabled={isLoading}
                  />
                </div>

                {/* Aggregation Controls - SELECT聚合函数 */}
                <div className="visual-analysis-section-card">
                  <AggregationControls
                    selectedTable={selectedTable}
                    aggregations={analysisConfig.aggregations}
                    onAggregationsChange={handleAggregationsChange}
                    disabled={isLoading}
                    maxHeight={200}
                    resolvedCasts={resolvedCasts}
                  />
                </div>

                {/* 第二行：WHERE相关 */}
                {/* Filter Controls - WHERE */}
                <div className="visual-analysis-section-card">
                  <FilterControls
                    columns={selectedTable?.columns || []}
                    filters={analysisConfig.filters || []}
                    onFiltersChange={handleFiltersChange}
                    disabled={isLoading}
                  />
                </div>

                {/* Sort Controls - ORDER BY */}
                <div className="visual-analysis-section-card">
                  <SortControls
                    columns={selectedTable?.columns || []}
                    orderBy={analysisConfig.orderBy || []}
                    onOrderByChange={handleOrderByChange}
                    disabled={isLoading}
                  />
                </div>

                {/* 第三行：LIMIT相关 */}
                {/* Limit Controls - LIMIT */}
                <div className="lg:col-span-2 visual-analysis-section-card">
                  <LimitControls
                    limit={analysisConfig.limit}
                    onLimitChange={handleLimitChange}
                    disabled={isLoading}
                  />
                </div>

              </div>

              {/* 透视配置，仅在 pivot 模式显示 */}
              {activeMode === 'pivot' && features?.enable_pivot_tables && (
                <div className="mb-6 visual-analysis-section-card visual-analysis-section-card--pivot">
                  <div className="mb-2 text-sm text-gray-600 visual-analysis-panel__pivot-tip">
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
                </div>
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
