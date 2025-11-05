import AddIcon from '@mui/icons-material/Add';
import {
  Alert,
  Backdrop,
  Box,
  Button,
  CircularProgress,
  Fade,
  Paper,
  Stack,
  Typography
} from '@mui/material';
import { Play } from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useToast } from '../../contexts/ToastContext';
import { executeDuckDBSQL, performQuery, previewVisualQuery } from '../../services/apiClient';
import { transformVisualConfigForApi, transformPivotConfigForApi } from '../../utils/visualQueryUtils';
import JoinCondition from './JoinCondition';
import SetOperationBuilder from './SetOperationBuilder';
import SourceSelector from './SourceSelector';
import VisualAnalysisPanel from './VisualAnalysisPanel';
import JoinTypeConflictDialog from './JoinTypeConflictDialog';

// 智能LIMIT处理函数
const applyDisplayLimit = (sql, maxRows = 10000) => {
  const sqlTrimmed = sql.trim().replace(/;$/, '');

  // 检查是否已有LIMIT
  const limitMatch = sqlTrimmed.match(/\bLIMIT\s+(\d+)(\s+OFFSET\s+\d+)?\s*$/i);

  if (limitMatch) {
    const userLimit = parseInt(limitMatch[1]);
    if (userLimit > maxRows) {
      // 用户LIMIT > 10000，前端显示限制为10000，但保存时使用用户原始LIMIT
      const displaySql = sqlTrimmed.replace(/\bLIMIT\s+\d+(\s+OFFSET\s+\d+)?\s*$/i, `LIMIT ${maxRows}`);
      return {
        displaySql: displaySql,
        originalSql: sqlTrimmed  // 保留用户原始LIMIT
      };
    } else {
      // 用户LIMIT ≤ 10000，前端和保存都使用用户LIMIT
      return {
        displaySql: sqlTrimmed,
        originalSql: sqlTrimmed
      };
    }
  } else {
    // 用户无LIMIT，前端添加LIMIT 10000，保存时无LIMIT
    return {
      displaySql: `${sqlTrimmed} LIMIT ${maxRows}`,
      originalSql: sqlTrimmed  // 保留用户原始SQL（无LIMIT）
    };
  }
};

const createDefaultSetOperationConfig = () => ({
  operation_type: 'UNION',
  use_by_name: false
});


// 受控组件：selectedSources/setSelectedSources 由父组件(App.jsx)传入
const QueryBuilder = ({ dataSources = [], selectedSources = [], setSelectedSources, onResultsReceived, onRefresh }) => {
  const { showSuccess, showError } = useToast();
  const [joins, setJoins] = useState([]);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // 错误信息翻译函数
  const translateError = (errorMessage) => {
    if (!errorMessage) return errorMessage;

    const errorTranslations = {
      'Set operations can only apply to expressions with the same number of result columns':
        '集合操作只能应用于具有相同列数的表达式',
      'Binder Error: Set operations can only apply to expressions with the same number of result columns':
        '绑定错误：集合操作只能应用于具有相同列数的表达式',
      'Binder Error: Referenced column':
        '绑定错误：引用的列',
      'not found':
        '未找到',
      'Table with name':
        '表名',
      'Catalog Error: Table':
        '目录错误：表',
      'does not exist':
        '不存在'
    };

    let translatedError = errorMessage;
    if (translatedError && typeof translatedError === 'object') {
      translatedError = translatedError.message ?? JSON.stringify(translatedError);
    }
    translatedError = translatedError != null ? String(translatedError) : '';
    Object.entries(errorTranslations).forEach(([en, zh]) => {
      translatedError = translatedError.replace(new RegExp(en, 'g'), zh);
    });

    return translatedError;
  };

  // Visual query state
  const [visualQuerySQL, setVisualQuerySQL] = useState('');
  const [visualQueryConfig, setVisualQueryConfig] = useState(null);

  // Set operation state
  const [setOperationConfig, setSetOperationConfig] = useState(createDefaultSetOperationConfig);

  const [queryHistory, setQueryHistory] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('queryHistory') || '[]');
    } catch {
      return [];
    }
  });
  const [joinTypeConflicts, setJoinTypeConflicts] = useState([]);
  const [resolvedJoinCasts, setResolvedJoinCasts] = useState({});
  const [isJoinConflictDialogOpen, setIsJoinConflictDialogOpen] = useState(false);
  const [pendingJoinAction, setPendingJoinAction] = useState(null);
  const [activeJoinConflicts, setActiveJoinConflicts] = useState([]);
  const [isVisualQueryReady, setIsVisualQueryReady] = useState(false);
  const resolvedJoinSelectionMap = useMemo(() => {
    return Object.entries(resolvedJoinCasts).reduce((acc, [key, value]) => {
      if (value?.targetType) {
        acc[key] = value.targetType;
      }
      return acc;
    }, {});
  }, [resolvedJoinCasts]);

  const classifyTypeCategory = useCallback((rawType) => {
    if (!rawType && rawType !== 0) {
      return { category: 'unknown', display: '未知' };
    }
    const upper = String(rawType).toUpperCase();

    if (
      /INT|DECIMAL|NUMERIC|DOUBLE|FLOAT|REAL|HUGEINT|SMALLINT|TINYINT|BIGINT/.test(upper)
    ) {
      return { category: 'numeric', display: upper };
    }
    if (/TIMESTAMP|DATETIME/.test(upper)) {
      return { category: 'datetime', display: upper };
    }
    if (/\bDATE\b/.test(upper)) {
      return { category: 'date', display: upper };
    }
    if (/\bTIME\b/.test(upper)) {
      return { category: 'time', display: upper };
    }
    if (/BOOL/.test(upper)) {
      return { category: 'boolean', display: upper };
    }
    if (/JSON|STRUCT|MAP|OBJECT/.test(upper)) {
      return { category: 'json', display: upper };
    }
    return { category: 'text', display: upper || 'TEXT' };
  }, []);

  const buildRecommendedTypes = useCallback((leftCategory, rightCategory) => {
    if (leftCategory === rightCategory) {
      return [];
    }

    const pair = [leftCategory, rightCategory].sort().join('|');

    switch (pair) {
      case 'numeric|text':
      case 'numeric|unknown':
      case 'text|unknown':
      case 'numeric|json':
      case 'numeric|boolean':
        return ['VARCHAR', 'DOUBLE', 'DECIMAL(18,4)', 'BIGINT'];
      case 'date|datetime':
      case 'date|time':
      case 'datetime|time':
        return ['TIMESTAMP', 'DATE', 'VARCHAR'];
      case 'boolean|text':
        return ['VARCHAR', 'BOOLEAN'];
      case 'json|text':
        return ['VARCHAR'];
      default:
        return ['VARCHAR', 'DOUBLE'];
    }
  }, []);

  const sourceColumnTypeMap = useMemo(() => {
    const buildMapForSource = (source) => {
      const map = {};
      if (!source || !Array.isArray(source.columns)) {
        return map;
      }
      source.columns.forEach((col, index) => {
        const name = typeof col === 'string' ? col : col?.name;
        if (!name) {
          return;
        }
        const rawType =
          (typeof col === 'string' ? 'TEXT' : (
            col?.dataType ||
            col?.type ||
            col?.normalizedType ||
            col?.rawType ||
            col?.columnType ||
            col?.column_type ||
            col?.sqlType
          )) || 'TEXT';
        const info = classifyTypeCategory(rawType);
        map[name] = {
          rawType,
          category: info.category,
          displayType: info.display,
          sourceLabel: source.name || source.id,
        };
        map[name.toLowerCase()] = map[name];
        map[`__index_${index}`] = map[name];
      });
      return map;
    };

    return selectedSources.reduce((acc, source) => {
      acc[source.id] = buildMapForSource(source);
      return acc;
    }, {});
  }, [selectedSources, classifyTypeCategory]);

  useEffect(() => {
    const conflicts = [];

    joins.forEach((join, index) => {
      if (!join.left_on || !join.right_on) {
        return;
      }
      const leftSourceMap = sourceColumnTypeMap[join.left_source_id] || {};
      const rightSourceMap = sourceColumnTypeMap[join.right_source_id] || {};

      const leftInfo =
        leftSourceMap[join.left_on] ||
        leftSourceMap[join.left_on?.toLowerCase()] ||
        null;
      const rightInfo =
        rightSourceMap[join.right_on] ||
        rightSourceMap[join.right_on?.toLowerCase()] ||
        null;

      if (!leftInfo || !rightInfo) {
        return;
      }

      if (leftInfo.category === rightInfo.category) {
        return;
      }

      const key = [
        join.left_source_id,
        join.left_on,
        join.right_source_id,
        join.right_on,
      ]
        .map((part) => (part || '').toString().toLowerCase())
        .join('::');

      const recommendedTypes = buildRecommendedTypes(
        leftInfo.category,
        rightInfo.category,
      );

      conflicts.push({
        key,
        joinIndex: index,
        left: {
          sourceId: join.left_source_id,
          sourceLabel: leftInfo.sourceLabel || join.left_source_id,
          column: join.left_on,
          category: leftInfo.category,
          rawType: leftInfo.rawType,
          displayType: leftInfo.displayType,
        },
        right: {
          sourceId: join.right_source_id,
          sourceLabel: rightInfo.sourceLabel || join.right_source_id,
          column: join.right_on,
          category: rightInfo.category,
          rawType: rightInfo.rawType,
          displayType: rightInfo.displayType,
        },
        recommendedTypes,
        defaultType: recommendedTypes[0] || 'VARCHAR',
      });
    });

    setJoinTypeConflicts(conflicts);
  }, [joins, sourceColumnTypeMap, buildRecommendedTypes]);

  useEffect(() => {
    if (!joinTypeConflicts || joinTypeConflicts.length === 0) {
      if (Object.keys(resolvedJoinCasts).length === 0) {
        return;
      }
    }
    const activeKeys = new Set(joinTypeConflicts.map((conflict) => conflict.key));
    setResolvedJoinCasts((prev) => {
      const entries = Object.entries(prev).filter(([key]) => activeKeys.has(key));
      if (entries.length === Object.entries(prev).length) {
        return prev;
      }
      return entries.reduce((acc, [key, value]) => {
        acc[key] = value;
        return acc;
      }, {});
    });
  }, [joinTypeConflicts]);

  // 智能显示逻辑：根据选择的表数量决定显示哪个操作区块
  const showJoinBlock = selectedSources.length >= 2;
  const showSetOperationBlock = selectedSources.length >= 2;

  // 当前操作模式：根据用户选择决定
  const [currentOperationMode, setCurrentOperationMode] = useState(null); // 'join' or 'set_operation'

  // 选中/移除数据源全部用props
  const handleSourceSelect = (source) => {
    if (!selectedSources.some(s => s.id === source.id)) {
      setSelectedSources([...selectedSources, source]);
    }
  };
  const handleSourceRemove = (sourceId) => {
    setSelectedSources(selectedSources.filter(s => s.id !== sourceId));
    setJoins(joins.filter(j => j.left_source_id !== sourceId && j.right_source_id !== sourceId));
  };

  // 监听数据源变化，自动添加连接条件
  React.useEffect(() => {
    // 当数据源数量达到2个，当前是join模式，且没有连接条件时，自动添加连接
    if (selectedSources.length >= 2 && currentOperationMode === 'join' && joins.length === 0) {
      handleAddJoin();
    }
  }, [selectedSources.length, currentOperationMode, joins.length]);

  React.useEffect(() => {
    if (selectedSources.length < 2) {
      if (currentOperationMode !== null) {
        setCurrentOperationMode(null);
      }
      if (currentOperationMode === 'set_operation') {
        setSetOperationConfig(createDefaultSetOperationConfig());
      }
    }
  }, [selectedSources.length, currentOperationMode]);

  const handleAddJoin = () => {
    if (selectedSources.length < 2) {
      setError('需要至少选择两个数据源才能创建连接');
      return;
    }

    setJoins([...joins, {
      left_source_id: selectedSources[0].id,
      right_source_id: selectedSources[1].id,
      left_on: '',
      right_on: '',
      how: 'inner'
    }]);
    setError('');
  };

  const handleJoinUpdate = (index, updatedJoin) => {
    const updatedJoins = [...joins];
    updatedJoins[index] = updatedJoin;
    setJoins(updatedJoins);
  };

  const handleJoinRemove = (index) => {
    const updatedJoins = [...joins];
    updatedJoins.splice(index, 1);
    setJoins(updatedJoins);
  };

  const handleJoinConflictDialogClose = () => {
    setIsJoinConflictDialogOpen(false);
    setActiveJoinConflicts([]);
    setPendingJoinAction(null);
  };

  const handleJoinConflictResolution = (selectionMap = {}) => {
    if (selectionMap && Object.keys(selectionMap).length > 0) {
      setResolvedJoinCasts((prev) => {
        const next = { ...prev };
        Object.entries(selectionMap).forEach(([key, value]) => {
          if (!value) return;
          next[key] = { targetType: value.toUpperCase() };
        });
        return next;
      });
    }
    setIsJoinConflictDialogOpen(false);
    setActiveJoinConflicts([]);
    const pending = pendingJoinAction;
    setPendingJoinAction(null);
    if (pending?.type === 'execute_query') {
      // 延迟执行，确保状态已经更新
      setTimeout(() => {
        handleExecuteQuery();
      }, 0);
    }
  };

  // Handle visual query generation
  const handleVisualQueryGenerated = useCallback((sql, config) => {
    setVisualQuerySQL(sql);
    setVisualQueryConfig(config || null);
    setIsVisualQueryReady(true);
  }, []);

  const handleVisualQueryInvalid = useCallback(() => {
    setVisualQueryConfig(null);
    setIsVisualQueryReady(false);
  }, []);

  const handleExecuteQuery = async () => {
    if (selectedSources.length === 0) {
      setError('请至少选择一个数据源');
      return;
    }

    if (joins.length > 0) {
      const unresolved = joinTypeConflicts.filter(
        (conflict) => !resolvedJoinCasts[conflict.key],
      );
      if (unresolved.length > 0) {
        setActiveJoinConflicts(unresolved);
        setIsJoinConflictDialogOpen(true);
        setPendingJoinAction({ type: 'execute_query' });
        return;
      }
    }

    setError('');
    setIsLoading(true);

    try {
      // 单表且可视化查询已生成时，直接执行可视化SQL
      const canExecuteVisualQuery =
        selectedSources.length === 1 &&
        isVisualQueryReady &&
        visualQueryConfig &&
        !currentOperationMode;

      if (canExecuteVisualQuery) {
        const visualMode = visualQueryConfig?.mode || 'regular';

        if (visualMode === 'pivot') {
          try {
            const tableName =
              visualQueryConfig?.tableName ||
              selectedSources[0]?.name ||
              selectedSources[0]?.id ||
              '';

            const configPayload = transformVisualConfigForApi(
              visualQueryConfig?.regular || {},
              tableName,
            );
            const pivotPayload = transformPivotConfigForApi(
              visualQueryConfig?.pivot || {},
            );

           const resp = await previewVisualQuery(
              {
                config: configPayload,
                mode: 'pivot',
                pivotConfig: pivotPayload,
                includeMetadata: true,
              },
              visualQueryConfig?.previewLimit || 10000,
              { resolvedCasts: visualQueryConfig?.resolvedCasts || {} },
            );

            if (!resp || resp.success === false) {
              const message =
                resp?.errors?.join('; ') ||
                resp?.error ||
                '透视查询执行失败';
              setError(message);
              return;
            }

            const results = {
              ...resp,
              isVisualQuery: true,
              visualConfig: visualQueryConfig,
              visualQueryMeta: visualQueryConfig,
            };

            onResultsReceived(results);
            if (resp.sql) {
              saveHistory(resp.sql);
            }
            showSuccess('透视查询执行成功');
          } catch (error) {
            setError(error?.message || '透视查询执行失败');
          }
          return;
        }

        if (!visualQuerySQL || !visualQuerySQL.trim()) {
          setError('未找到可执行的可视化查询 SQL');
          return;
        }

        const { displaySql, originalSql } = applyDisplayLimit(
          visualQuerySQL,
          10000,
        );

        const results = await executeDuckDBSQL(displaySql, null, true);

        if (results && results.success === false) {
          setError(results.error || '可视化查询执行失败');
          return;
        }

        if (results) {
          results.isVisualQuery = true;
          results.visualConfig = visualQueryConfig;
          results.visualQueryMeta = visualQueryConfig;
          results.generatedSQL = originalSql;
          results.sql = originalSql;
          results.displaySQL = displaySql;
        }

        onResultsReceived(results);
        saveHistory(originalSql);
        showSuccess('可视化查询执行成功');
        return;
      }

      // Original multi-table query logic (unchanged)
      // 转换数据源格式以匹配后端期望的DataSource模型
      const convertedSources = selectedSources.map(source => {
        if (source.sourceType === 'file') {
          // 文件数据源 - 直接使用DuckDB中的表名，不需要文件路径
          return {
            id: source.id,
            type: 'duckdb', // 文件已经加载到DuckDB中，所以类型是duckdb
            name: source.name,
            table_name: source.id // 使用source.id作为表名
          };
        } else if (source.sourceType === 'duckdb') {
          // DuckDB数据源 - 使用name字段作为表名
          return {
            id: source.id,
            type: 'duckdb',
            name: source.name,
            table_name: source.name // 直接使用name字段，它就是实际的表名
          };
        } else if (source.sourceType === 'database') {
          // 数据库数据源，使用实际的数据库类型
          return {
            id: source.id,
            type: source.type, // 使用实际的数据库类型（mysql, postgresql等）
            params: source.params || {
              connectionId: source.connectionId
            }
          };
        }

        // 如果数据源已经有 params 字段，直接返回
        if (source.params) {
          return source;
        }

        // 默认处理：假设是DuckDB表
        return {
          id: source.id,
          type: 'duckdb',
          name: source.name || source.id,
          table_name: source.name || source.id
        };
      });

      // 转换 JOIN 数据结构以匹配后端期望的格式
      const convertedJoins = joins.map(join => {
        const key = [
          join.left_source_id,
          join.left_on,
          join.right_source_id,
          join.right_on
        ]
          .map((part) => (part || '').toString().toLowerCase())
          .join('::');
        const resolvedCast = resolvedJoinCasts[key];
        const condition = {
          left_column: join.left_on,
          right_column: join.right_on,
          operator: '='
        };
        if (resolvedCast?.targetType) {
          condition.left_cast = resolvedCast.targetType;
          condition.right_cast = resolvedCast.targetType;
        }
        return {
          left_source_id: join.left_source_id,
          right_source_id: join.right_source_id,
          join_type: join.how || 'inner',
          conditions: [condition]
        };
      });

      const queryRequest = {
        sources: convertedSources,
        joins: convertedJoins
      };

      // 获取后端实际执行的SQL
      const results = await performQuery(queryRequest);

      // 检查后端返回的错误信息
      if (results && results.success === false) {
        // 优先提取original_error
        let errorMessage = results.error;
        if (typeof results.error === 'object' && results.error.message) {
          if (typeof results.error.message === 'object' && results.error.message.details?.original_error) {
            errorMessage = results.error.message.details.original_error;
          } else if (typeof results.error.message === 'string') {
            errorMessage = results.error.message;
          }
        }
        const translatedError = translateError(errorMessage || '查询执行失败');
        setError(translatedError);
        // 如果有可用表信息，也显示出来
        if (results.available_tables && results.available_tables.length > 0) {
          // 表信息已获取，无需额外处理
        }
        return;
      }

      onResultsReceived(results);
      if (results && results.sql) {
        saveHistory(results.sql);
        showSuccess('查询执行成功');
      }
    } catch (err) {
      // 处理网络错误或其他异常
      if (err.response && err.response.data) {
        // 如果后端返回了结构化的错误信息
        const errorData = err.response.data;
        if (errorData.success === false) {
          // 优先提取original_error
          let errorMessage = errorData.error;
          if (typeof errorData.error === 'object' && errorData.error.message) {
            if (typeof errorData.error.message === 'object' && errorData.error.message.details?.original_error) {
              errorMessage = errorData.error.message.details.original_error;
            } else if (typeof errorData.error.message === 'string') {
              errorMessage = errorData.error.message;
            }
          }
          const translatedError = translateError(errorMessage || '查询执行失败');
          setError(translatedError);
          showError(translatedError);
        } else {
          const translatedError = translateError(errorData.detail || err.message || '未知错误');
          const errorMsg = `查询执行失败: ${translatedError}`;
          setError(errorMsg);
          showError(errorMsg);
        }
      } else {
        const translatedError = translateError(err.message || '未知错误');
        const errorMsg = `查询执行失败: ${translatedError}`;
        setError(errorMsg);
        showError(errorMsg);
      }
    } finally {
      setIsLoading(false);
    }
  };


  // 保存历史（只保存最终执行的SQL字符串）
  const saveHistory = (sql) => {
    const newItem = {
      sql,
      time: new Date().toLocaleString(),
      id: Date.now() + Math.random()
    };
    const newHistory = [newItem, ...queryHistory].slice(0, 50); // 最多50条
    setQueryHistory(newHistory);
    localStorage.setItem('queryHistory', JSON.stringify(newHistory));
  };

  // 集合操作处理函数
  const handleSetOperationChange = useCallback((config) => {
    // 使用函数式更新避免依赖config对象引用
    setSetOperationConfig(prevConfig => {
      // 深度比较，避免不必要的更新
      if (JSON.stringify(prevConfig) === JSON.stringify(config)) {
        return prevConfig;
      }
      return config;
    });
  }, []);

  // 构建集合操作配置（基于已选择的表）
  const buildSetOperationConfig = useCallback(() => {
    return {
      ...setOperationConfig,
      tables: selectedSources.map(source => ({
        table_name: source.id,
        selected_columns: [],
        alias: null
      }))
    };
  }, [setOperationConfig, selectedSources]);

  const handleExecuteSetOperation = async () => {
    if (selectedSources.length < 2) {
      showError('至少需要选择两个表');
      return;
    }

    setError('');
    setIsLoading(true);

    try {
      // 使用SetOperationBuilder传递的完整配置，包含column_mappings
      const config = setOperationConfig;
      const response = await fetch('/api/set-operations/execute', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          config: config,
          preview: false
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        const translatedError = translateError(errorData.errors?.[0] || errorData.error || '集合操作执行失败');
        throw new Error(translatedError);
      }

      const results = await response.json();

      if (results.success) {
        onResultsReceived(results);
        if (results.sql) {
          saveHistory(results.sql);
        }
        showSuccess('集合操作执行成功');
      } else {
        const translatedError = translateError(results.errors?.[0] || results.error || '集合操作执行失败');
        setError(translatedError);
        showError(translatedError);
      }
    } catch (err) {
      const translatedError = translateError(err.message || '未知错误');
      const errorMsg = `集合操作执行失败: ${translatedError}`;
      setError(errorMsg);
      showError(errorMsg);
    } finally {
      setIsLoading(false);
    }
  };




  return (
    <Paper
      sx={{
        p: 3,
        borderRadius: 'var(--dq-radius-card)',
        boxShadow: 'var(--dq-shadow-soft)',
        border: '1px solid var(--dq-border-card)',
        height: '100%',
        // 防止触控板手势导致的页面导航
        overscrollBehavior: 'contain',
        touchAction: 'pan-x pan-y',
        backdropFilter: 'blur(20px)',
        backgroundColor: 'var(--dq-surface-card)'
      }}
    >


      {error && (
        <Fade in={!!error}>
          <Alert
            severity="error"
            sx={{
              mb: 3,
              borderRadius: 2,
              border: '1px solid var(--dq-status-error-bg)'
            }}
            onClose={() => setError('')}
          >
            {error}
          </Alert>
        </Fade>
      )}


      {/* 数据源选择器 - 始终显示 */}
      <Typography variant="subtitle1" sx={{ mb: 2, fontWeight: 600, fontSize: '16px', color: 'var(--dq-text-primary)' }}>
        选择数据源
      </Typography>
      <SourceSelector
        availableSources={dataSources}
        selectedSources={selectedSources}
        onSourceSelect={handleSourceSelect}
        onSourceRemove={handleSourceRemove}
        onRefresh={onRefresh}
      />

      {/* 操作模式选择按钮 */}
      {showJoinBlock && showSetOperationBlock && (
        <>
          <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 600, textAlign: 'right' }}>
            选择操作类型
          </Typography>
          <Stack direction="row" spacing={2} sx={{ mb: 3, justifyContent: 'flex-end' }}>
            <Button
              variant={currentOperationMode === 'join' ? 'contained' : 'outlined'}
              onClick={() => {
                setCurrentOperationMode('join');
                // 自动触发添加连接，简化用户操作步骤
                if (selectedSources.length >= 2 && joins.length === 0) {
                  handleAddJoin();
                }
              }}
              sx={{ borderRadius: 2 }}
            >
              表连接 (JOIN)
            </Button>
            <Button
              variant={currentOperationMode === 'set_operation' ? 'contained' : 'outlined'}
              onClick={() => setCurrentOperationMode('set_operation')}
              sx={{ borderRadius: 2 }}
            >
              集合操作 (UNION/EXCEPT/INTERSECT)
            </Button>
          </Stack>
        </>
      )}

      {/* 集合操作区块 */}
      {showSetOperationBlock && currentOperationMode === 'set_operation' && (
        <>
          <Typography variant="subtitle1" sx={{ mb: 2, fontWeight: 600, fontSize: '16px', color: 'var(--dq-text-primary)' }}>
            集合操作配置
          </Typography>
          <SetOperationBuilder
            onOperationChange={handleSetOperationChange}
            availableTables={selectedSources.map(s => s.id)}
            initialConfig={setOperationConfig}
            hideTableSelector={true} // 隐藏表选择器，直接使用已选择的表
            sources={selectedSources} // 传递数据源信息，包含列信息
          />
        </>
      )}

      {/* 表连接区块 */}
      {showJoinBlock && currentOperationMode === 'join' && (
        <>
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 600, fontSize: '16px', color: 'var(--dq-text-primary)' }}>
              连接条件
            </Typography>
            <Button
              variant="outlined"
              size="small"
              onClick={handleAddJoin}
              startIcon={<AddIcon />}
              sx={{
                borderRadius: 20,
                fontWeight: 500,
                textTransform: 'none',
                fontSize: '0.8125rem',
                border: '1px solid color-mix(in oklab, var(--dq-accent-primary) 45%, transparent)',
                '&:hover': {
                  border: '1px solid color-mix(in oklab, var(--dq-accent-primary) 65%, transparent)',
                  backgroundColor: 'color-mix(in oklab, var(--dq-accent-primary) 14%, transparent)'
                }
              }}
            >
              添加连接
            </Button>
          </Stack>
          {joins.length > 0 ? (
            <Stack spacing={2}>
              {joins.map((join, index) => (
                <JoinCondition
                  key={index}
                  join={join}
                  sources={selectedSources}
                  onUpdate={(updatedJoin) => handleJoinUpdate(index, updatedJoin)}
                  onRemove={() => handleJoinRemove(index)}
                />
              ))}
            </Stack>
          ) : (
            <Box sx={{
              p: 3,
              textAlign: 'center',
              backgroundColor: 'var(--dq-surface-hover)',
              borderRadius: 2,
              border: '1px dashed var(--dq-border-subtle)'
            }}>
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{
                  fontWeight: 500,
                }}
              >
                未添加连接条件
              </Typography>
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ display: 'block', mt: 0.5 }}
              >
                点击"添加连接"创建数据源之间的关联
              </Typography>
            </Box>
          )}
        </>
      )}

      {/* Visual Analysis Panel - Only shown for single table selection */}
      <VisualAnalysisPanel
        selectedSources={selectedSources}
        onVisualQueryGenerated={handleVisualQueryGenerated}
        onVisualQueryInvalid={handleVisualQueryInvalid}
        isVisible={selectedSources.length === 1}
      />

      <Stack
        direction="row"
        justifyContent="flex-end"
        spacing={2}
        sx={{
          mt: 'auto',
          pt: 3,
          borderTop: '1px solid var(--dq-border)'
        }}
      >
        {/* 默认执行查询按钮 - 当没有选择操作模式时显示 */}
        {!currentOperationMode && selectedSources.length > 0 && (
          <Button
            variant="contained"
            onClick={handleExecuteQuery}
            disabled={isLoading}
            sx={{
              borderRadius: 20,
              px: 4,
              py: 1.5,
              fontSize: '16px',
              fontWeight: 600,
              textTransform: 'none',
              backgroundColor: 'var(--dq-accent-primary-strong)',
              color: 'var(--dq-text-on-primary)',
              boxShadow: 'var(--dq-accent-shadow)',
              '&:hover': {
                backgroundColor: 'var(--dq-accent-primary-strong)',
                boxShadow: 'var(--dq-accent-shadow)'
              },
              '&.Mui-disabled': {
                backgroundColor: 'var(--dq-border-subtle)',
                color: 'var(--dq-text-tertiary)'
              }
            }}
            startIcon={isLoading ? <CircularProgress size={20} color="inherit" /> : <Play size={20} />}
          >
            {isLoading ? '查询执行中...' : '执行查询'}
          </Button>
        )}

        {currentOperationMode === 'join' && (
          <>
            <Button
              variant="contained"
              onClick={handleExecuteQuery}
              disabled={selectedSources.length === 0 || selectedSources.length > 1 && joins.length === 0 || (joins.length > 0 && joins.some(join => !join.left_on || !join.right_on)) || isLoading}
              sx={{
                borderRadius: 20,
                px: 4,
                py: 1.5,
                fontSize: '16px',
                fontWeight: 600,
                textTransform: 'none',
                backgroundColor: 'var(--dq-accent-primary-strong)',
                color: 'var(--dq-text-on-primary)',
                boxShadow: 'var(--dq-accent-shadow)',
                '&:hover': {
                  backgroundColor: 'var(--dq-accent-primary-strong)',
                  boxShadow: 'var(--dq-accent-shadow)'
                },
                '&.Mui-disabled': {
                  backgroundColor: 'var(--dq-border-subtle)',
                  color: 'var(--dq-text-tertiary)'
                }
              }}
              startIcon={isLoading ? <CircularProgress size={20} color="inherit" /> : <Play size={20} />}
            >
              {isLoading ? '查询执行中...' : '执行查询'}
            </Button>
          </>
        )}

        {currentOperationMode === 'set_operation' && (
          <>
            <Button
              variant="contained"
              onClick={handleExecuteSetOperation}
              disabled={selectedSources.length < 2 || isLoading}
              sx={{
                borderRadius: 20,
                px: 4,
                py: 1.5,
                fontSize: '16px',
                fontWeight: 600,
                textTransform: 'none',
                backgroundColor: 'var(--dq-accent-primary-strong)',
                color: 'var(--dq-text-on-primary)',
                boxShadow: 'var(--dq-accent-shadow)',
                '&:hover': {
                  backgroundColor: 'var(--dq-accent-primary-strong)',
                  boxShadow: 'var(--dq-accent-shadow)'
                },
                '&.Mui-disabled': {
                  backgroundColor: 'var(--dq-border-subtle)',
                  color: 'var(--dq-text-tertiary)'
                }
              }}
              startIcon={isLoading ? <CircularProgress size={20} color="inherit" /> : <Play size={20} />}
            >
              {isLoading ? '执行中...' : '执行集合操作'}
            </Button>
      </>
    )}
  </Stack>

      <JoinTypeConflictDialog
        open={isJoinConflictDialogOpen}
        conflicts={activeJoinConflicts}
        resolvedSelections={resolvedJoinSelectionMap}
        onClose={handleJoinConflictDialogClose}
        onSubmit={handleJoinConflictResolution}
        isSubmitting={isLoading}
      />





      {/* 全屏加载遮罩 */}
      <Backdrop
        sx={{
          color: 'var(--dq-text-on-primary)',
          zIndex: (theme) => theme.zIndex.drawer + 1,
          backgroundColor: 'var(--dq-overlay-strong)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          flexDirection: 'column',
          gap: 2
        }}
        open={isLoading}
      >
        <CircularProgress
          color="inherit"
          size={60}
          thickness={4}
          sx={{
            animation: 'pulse 2s infinite',
            '@keyframes pulse': {
              '0%': {
                opacity: 1,
                transform: 'scale(1)',
              },
              '50%': {
                opacity: 0.8,
                transform: 'scale(1.05)',
              },
              '100%': {
                opacity: 1,
                transform: 'scale(1)',
              },
            },
          }}
        />
        <Typography
          variant="h6"
          sx={{
            fontWeight: 500,
            textAlign: 'center',
            animation: 'fadeInOut 2s infinite',
            '@keyframes fadeInOut': {
              '0%': { opacity: 0.7 },
              '50%': { opacity: 1 },
              '100%': { opacity: 0.7 },
            },
          }}
        >
          {isLoading ? '正在执行查询...' : '正在执行SQL...'}
        </Typography>
        <Typography
          variant="body2"
          sx={{
            opacity: 0.8,
            textAlign: 'center',
            maxWidth: 300
          }}
        >
          {isLoading ? '正在处理数据源连接和查询优化，请稍候' : '正在执行自定义SQL语句，请稍候'}
        </Typography>
      </Backdrop>
    </Paper>
  );
};

export default QueryBuilder;
