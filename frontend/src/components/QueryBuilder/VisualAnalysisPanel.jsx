import {
  Alert,
  Collapse,
  Fade,
  IconButton,
  Tooltip
} from '@mui/material';
import React, { useEffect, useState } from 'react';
import {
  createDefaultConfig,
  generateSQLPreview
} from '../../utils/visualQueryUtils';
import AggregationControls from './AggregationControls';
import ColumnSelector from './ColumnSelector';
import FilterControls from './FilterControls';
import LimitControls from './LimitControls';
import SortControls from './SortControls';
import SQLPreview from './SQLPreview';

/**
 * VisualAnalysisPanel - Visual query builder interface for single table analysis
 * Only displays when a single table is selected, providing no-code query building capabilities
 */
const VisualAnalysisPanel = ({
  selectedSources = [],
  onVisualQueryGenerated,
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

  const [generatedSQL, setGeneratedSQL] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [isExpanded, setIsExpanded] = useState(false); // 默认折叠状态

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

  // Generate SQL when analysis config changes
  useEffect(() => {
    if (shouldShowPanel && selectedTable) {
      generateSQL();
    }
  }, [analysisConfig, shouldShowPanel, selectedTable]);

  const generateSQL = () => {
    if (!selectedTable) return;

    try {
      const tableName = selectedTable.name || selectedTable.id;
      const result = generateSQLPreview(analysisConfig, tableName);

      if (!result.success) {
        setError(result.errors.join('; '));
        setGeneratedSQL('');
        return;
      }

      setGeneratedSQL(result.sql);
      setError('');

      // Show warnings if any
      if (result.warnings && result.warnings.length > 0) {
      }

      // Notify parent component of generated SQL
      if (onVisualQueryGenerated) {
        // Remove comments for actual execution
        const cleanSQL = result.sql.replace(/^--.*$/gm, '').trim();
        onVisualQueryGenerated(cleanSQL, analysisConfig);
      }

    } catch (err) {
      const errorMsg = `SQL生成失败: ${err.message}`;
      setError(errorMsg);
    }
  };

  // Update analysis configuration
  const updateAnalysisConfig = (updates) => {
    setAnalysisConfig(prev => ({
      ...prev,
      ...updates
    }));
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
    <Fade in={shouldShowPanel}>
      <div className="mb-6">
        {/* Main Panel Container - 柔和圆润风格 */}
        <div className="bg-white rounded-3xl border border-gray-200 shadow-lg">
          {/* Panel Header */}
          <div
            className="px-6 py-5 bg-blue-50/30 hover:bg-blue-50/50 transition-colors rounded-t-3xl cursor-pointer border-b border-gray-200"
            onClick={() => setIsExpanded(!isExpanded)}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                {/* Icon - 蓝色渐变图标 */}
                <div className="w-12 h-12 bg-gradient-to-br from-blue-400 to-blue-600 rounded-2xl flex items-center justify-center shadow-md flex-shrink-0">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path>
                  </svg>
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-1.5">
                    <h3 className="text-base font-bold text-gray-900">
                      可视化分析
                    </h3>
                    <span className="px-3 py-1 text-xs font-semibold text-blue-700 bg-blue-100 rounded-full">
                      单表分析
                    </span>
                  </div>
                  <p className="text-sm text-gray-600">
                    {isExpanded
                      ? `为 "${selectedTable?.name || selectedTable?.id}" 配置分析条件`
                      : `${getConfigSummary(analysisConfig)} | 点击展开配置`
                    }
                  </p>
                </div>
              </div>
              <div className="w-10 h-10 rounded-full bg-blue-50 hover:bg-blue-100 flex items-center justify-center transition-colors flex-shrink-0">
                <Tooltip title={isExpanded ? '收起分析面板' : '展开分析面板'}>
                  <IconButton
                    size="small"
                    sx={{
                      color: '#2563eb',
                      padding: 0,
                      '&:hover': {
                        backgroundColor: 'transparent'
                      }
                    }}
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d={isExpanded ? "M5 15l7-7 7 7" : "M19 9l-7 7-7-7"}></path>
                    </svg>
                  </IconButton>
                </Tooltip>
              </div>
            </div>
          </div>

          {/* Panel Content */}
          <Collapse in={isExpanded}>
            <div className="p-6 bg-white rounded-b-3xl">
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

              {/* Analysis Controls Grid - 3行布局按SQL顺序 */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">

                {/* 第一行：SELECT相关 */}
                {/* Column Selection - SELECT */}
                <div>
                  <ColumnSelector
                    selectedTable={selectedTable}
                    selectedColumns={analysisConfig.selectedColumns}
                    onColumnSelectionChange={handleColumnSelectionChange}
                    maxHeight={200}
                    showMetadata={true}
                    disabled={isLoading}
                  />
                </div>

                {/* Aggregation Controls - SELECT聚合函数 */}
                <div>
                  <AggregationControls
                    selectedTable={selectedTable}
                    aggregations={analysisConfig.aggregations}
                    onAggregationsChange={handleAggregationsChange}
                    disabled={isLoading}
                    maxHeight={200}
                  />
                </div>

                {/* 第二行：WHERE相关 */}
                {/* Filter Controls - WHERE */}
                <div>
                  <FilterControls
                    columns={selectedTable?.columns || []}
                    filters={analysisConfig.filters || []}
                    onFiltersChange={handleFiltersChange}
                    disabled={isLoading}
                  />
                </div>

                {/* Sort Controls - ORDER BY */}
                <div>
                  <SortControls
                    columns={selectedTable?.columns || []}
                    orderBy={analysisConfig.orderBy || []}
                    onOrderByChange={handleOrderByChange}
                    disabled={isLoading}
                  />
                </div>

                {/* 第三行：LIMIT相关 */}
                {/* Limit Controls - LIMIT */}
                <div className="lg:col-span-2">
                  <LimitControls
                    limit={analysisConfig.limit}
                    onLimitChange={handleLimitChange}
                    disabled={isLoading}
                  />
                </div>

              </div>

              {/* SQL Preview Section */}
              <div className="space-y-2">
                <SQLPreview
                  sql={generatedSQL}
                  title="生成的SQL查询"
                  height={120}
                />
              </div>


            </div>
          </Collapse>
        </div>
      </div>
    </Fade>
  );
};

export default VisualAnalysisPanel;