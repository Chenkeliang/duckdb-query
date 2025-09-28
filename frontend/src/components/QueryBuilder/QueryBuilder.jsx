import AddIcon from '@mui/icons-material/Add';
import DownloadIcon from '@mui/icons-material/Download';
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
import React, { useCallback, useState } from 'react';
import { useToast } from '../../contexts/ToastContext';
import { downloadResults, executeDuckDBSQL, performQuery } from '../../services/apiClient';
import JoinCondition from './JoinCondition';
import SetOperationBuilder from './SetOperationBuilder';
import SourceSelector from './SourceSelector';
import VisualAnalysisPanel from './VisualAnalysisPanel';

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


// 受控组件：selectedSources/setSelectedSources 由父组件(App.jsx)传入
const QueryBuilder = ({ dataSources = [], selectedSources = [], setSelectedSources, onResultsReceived }) => {
  const { showSuccess, showError } = useToast();
  const [joins, setJoins] = useState([]);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Visual query state
  const [visualQuerySQL, setVisualQuerySQL] = useState('');
  const [visualQueryConfig, setVisualQueryConfig] = useState(null);

  // Set operation state
  const [setOperationConfig, setSetOperationConfig] = useState({
    operation_type: 'UNION',
    use_by_name: false
  });

  const [queryHistory, setQueryHistory] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('queryHistory') || '[]');
    } catch {
      return [];
    }
  });

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

  // Handle visual query generation
  const handleVisualQueryGenerated = (sql, config) => {
    setVisualQuerySQL(sql);
    setVisualQueryConfig(config);
  };

  const handleExecuteQuery = async () => {
    if (selectedSources.length === 0) {
      setError('请至少选择一个数据源');
      return;
    }

    setError('');
    setIsLoading(true);

    try {
      // Check if we're in visual analysis mode (single table with visual query)
      const isVisualAnalysisMode = selectedSources.length === 1 && visualQuerySQL && visualQuerySQL.trim() && visualQueryConfig;

      if (isVisualAnalysisMode) {
        // Apply display limit for visual analysis queries (preview mode)
        const { displaySql, originalSql } = applyDisplayLimit(visualQuerySQL, 10000);

        // Use executeDuckDBSQL for direct SQL execution with preview mode
        const results = await executeDuckDBSQL(displaySql, null, true);

        if (results && results.success === false) {
          setError(results.error || '可视化查询执行失败');
          return;
        }

        // Add visual query metadata to results
        if (results) {
          results.isVisualQuery = true;
          results.visualConfig = visualQueryConfig;
          results.generatedSQL = originalSql; // Use original SQL without LIMIT
          results.sql = originalSql; // Ensure SQL is included for history
          results.displaySQL = displaySql; // Store display SQL for reference
        }

        onResultsReceived(results);
        saveHistory(originalSql); // Save original SQL without LIMIT
        showSuccess('可视化查询执行成功');
        return; // 重要：直接返回，不执行后续的常规查询逻辑
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
      const convertedJoins = joins.map(join => ({
        left_source_id: join.left_source_id,
        right_source_id: join.right_source_id,
        join_type: join.how || 'inner',
        conditions: [{
          left_column: join.left_on,
          right_column: join.right_on,
          operator: '='
        }]
      }));

      const queryRequest = {
        sources: convertedSources,
        joins: convertedJoins
      };

      // 获取后端实际执行的SQL
      const results = await performQuery(queryRequest);

      // 检查后端返回的错误信息
      if (results && results.success === false) {
        setError(results.error || '查询执行失败');
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
          const errorMsg = errorData.error || '查询执行失败';
          setError(errorMsg);
          showError(errorMsg);
        } else {
          const errorMsg = `查询执行失败: ${errorData.detail || err.message || '未知错误'}`;
          setError(errorMsg);
          showError(errorMsg);
        }
      } else {
        const errorMsg = `查询执行失败: ${err.message || '未知错误'}`;
        setError(errorMsg);
        showError(errorMsg);
      }
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownload = async () => {
    if (selectedSources.length === 0) {
      showError('请至少选择一个数据源');
      return;
    }

    setError('');
    setIsLoading(true);

    try {
      const queryRequest = {
        sources: selectedSources,
        joins: joins
      };

      await downloadResults(queryRequest);
      showSuccess('文件下载成功');
    } catch (err) {
      const errorMsg = `下载失败: ${err.message || '未知错误'}`;
      setError(errorMsg);
      showError(errorMsg);
      console.error(err);
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
      const config = buildSetOperationConfig();
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
        throw new Error(errorData.errors?.[0] || '集合操作执行失败');
      }

      const results = await response.json();

      if (results.success) {
        onResultsReceived(results);
        if (results.sql) {
          saveHistory(results.sql);
        }
        showSuccess('集合操作执行成功');
      } else {
        setError(results.errors?.[0] || '集合操作执行失败');
        showError(results.errors?.[0] || '集合操作执行失败');
      }
    } catch (err) {
      const errorMsg = `集合操作执行失败: ${err.message || '未知错误'}`;
      setError(errorMsg);
      showError(errorMsg);
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };




  return (
    <Paper
      sx={{
        p: 3,
        borderRadius: 3,
        boxShadow: '0 2px 12px rgba(0,0,0,0.05)',
        border: '1px solid rgba(0, 0, 0, 0.06)',
        height: '100%',
        // 防止触控板手势导致的页面导航
        overscrollBehavior: 'contain',
        touchAction: 'pan-x pan-y',
        backdropFilter: 'blur(20px)',
        background: 'rgba(255,255,255,0.95)'
      }}
    >


      {error && (
        <Fade in={!!error}>
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
        </Fade>
      )}


      {/* 数据源选择器 - 始终显示 */}
      <Typography variant="subtitle1" sx={{ mb: 2, fontWeight: 500, fontSize: '0.95rem', color: 'text.primary' }}>
        选择数据源
      </Typography>
      <SourceSelector
        availableSources={dataSources}
        selectedSources={selectedSources}
        onSourceSelect={handleSourceSelect}
        onSourceRemove={handleSourceRemove}
      />

      {/* 操作模式选择按钮 */}
      {showJoinBlock && showSetOperationBlock && (
        <>
          <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 600 }}>
            选择操作类型
          </Typography>
          <Stack direction="row" spacing={2} sx={{ mb: 3 }}>
            <Button
              variant={currentOperationMode === 'join' ? 'contained' : 'outlined'}
              onClick={() => setCurrentOperationMode('join')}
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
          <Typography variant="subtitle1" sx={{ mb: 2, fontWeight: 500, fontSize: '0.95rem', color: 'text.primary' }}>
            集合操作配置
          </Typography>
          <SetOperationBuilder
            onOperationChange={handleSetOperationChange}
            availableTables={selectedSources.map(s => s.id)}
            initialConfig={setOperationConfig}
            hideTableSelector={true} // 隐藏表选择器，直接使用已选择的表
          />
        </>
      )}

      {/* 表连接区块 */}
      {showJoinBlock && currentOperationMode === 'join' && (
        <>
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 500, fontSize: '0.95rem', color: 'text.primary' }}>
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
                border: '1px solid rgba(0, 113, 227, 0.5)',
                '&:hover': {
                  border: '1px solid rgba(0, 113, 227, 0.8)',
                  backgroundColor: 'rgba(0, 113, 227, 0.04)'
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
              backgroundColor: 'rgba(0,0,0,0.01)',
              borderRadius: 2,
              border: '1px dashed rgba(0,0,0,0.1)'
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
        isVisible={selectedSources.length === 1}
      />

      <Stack
        direction="row"
        justifyContent="flex-end"
        spacing={2}
        sx={{
          mt: 'auto',
          pt: 3,
          borderTop: '1px solid rgba(0,0,0,0.06)'
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
              fontSize: '0.95rem',
              fontWeight: 600,
              textTransform: 'none',
              backgroundColor: '#0071e3',
              color: 'white',
              boxShadow: '0 4px 12px rgba(0, 113, 227, 0.2)',
              '&:hover': {
                backgroundColor: '#0077ed',
                boxShadow: '0 2px 8px rgba(0, 113, 227, 0.3)'
              },
              '&.Mui-disabled': {
                backgroundColor: '#e0e0e0',
                color: 'rgba(0, 0, 0, 0.38)'
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
              variant="outlined"
              onClick={handleDownload}
              disabled={selectedSources.length === 0 || isLoading}
              sx={{
                borderRadius: 20,
                px: 3,
                py: 1.5,
                fontSize: '0.9rem',
                fontWeight: 500,
                textTransform: 'none',
                border: '1px solid rgba(0, 113, 227, 0.5)',
                color: '#0071e3',
                '&:hover': {
                  border: '1px solid rgba(0, 113, 227, 0.8)',
                  backgroundColor: 'rgba(0, 113, 227, 0.04)'
                }
              }}
              startIcon={<DownloadIcon />}
            >
              下载结果
            </Button>
            <Button
              variant="contained"
              onClick={handleExecuteQuery}
              disabled={selectedSources.length === 0 || isLoading}
              sx={{
                borderRadius: 20,
                px: 4,
                py: 1.5,
                fontSize: '0.95rem',
                fontWeight: 600,
                textTransform: 'none',
                backgroundColor: '#0071e3',
                color: 'white',
                boxShadow: '0 4px 12px rgba(0, 113, 227, 0.2)',
                '&:hover': {
                  backgroundColor: '#0077ed',
                  boxShadow: '0 2px 8px rgba(0, 113, 227, 0.3)'
                },
                '&.Mui-disabled': {
                  backgroundColor: '#e0e0e0',
                  color: 'rgba(0, 0, 0, 0.38)'
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
                fontSize: '0.95rem',
                fontWeight: 600,
                textTransform: 'none',
                backgroundColor: '#0071e3',
                color: 'white',
                boxShadow: '0 4px 12px rgba(0, 113, 227, 0.2)',
                '&:hover': {
                  backgroundColor: '#0077ed',
                  boxShadow: '0 2px 8px rgba(0, 113, 227, 0.3)'
                },
                '&.Mui-disabled': {
                  backgroundColor: '#e0e0e0',
                  color: 'rgba(0, 0, 0, 0.38)'
                }
              }}
              startIcon={isLoading ? <CircularProgress size={20} color="inherit" /> : <Play size={20} />}
            >
              {isLoading ? '执行中...' : '执行集合操作'}
            </Button>
          </>
        )}
      </Stack>





      {/* 全屏加载遮罩 */}
      <Backdrop
        sx={{
          color: '#fff',
          zIndex: (theme) => theme.zIndex.drawer + 1,
          backgroundColor: 'rgba(0, 0, 0, 0.7)',
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
