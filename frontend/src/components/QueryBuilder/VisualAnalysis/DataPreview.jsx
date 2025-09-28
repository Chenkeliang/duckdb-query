import { AlertTriangle } from 'lucide-react';
import React, { useCallback, useEffect, useState } from 'react';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';

const DataPreview = ({
  config,
  tableName,
  onPreviewData,
  className = ''
}) => {
  const [previewData, setPreviewData] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [rowCount, setRowCount] = useState(null);
  const [estimatedTime, setEstimatedTime] = useState(null);
  const [validationWarnings, setValidationWarnings] = useState([]);

  // Debounced preview update
  const [previewTimeout, setPreviewTimeout] = useState(null);

  const executePreviewQuery = useCallback(async (sql) => {
    if (!sql || sql.trim() === '') return;

    setIsLoading(true);
    setError(null);

    try {
      // Add LIMIT to preview query if not already present
      const previewSQL = sql.includes('LIMIT') ? sql : `${sql} LIMIT 10`;

      const response = await fetch('/api/query/execute', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sql: previewSQL,
          preview: true
        }),
      });

      if (!response.ok) {
        throw new Error(`查询失败: ${response.statusText}`);
      }

      const result = await response.json();

      if (result.success) {
        setPreviewData(result.data);
        setRowCount(result.rowCount || result.data?.length || 0);

        if (onPreviewData) {
          onPreviewData(result.data, result.rowCount);
        }
      } else {
        throw new Error(result.error || '查询执行失败');
      }
    } catch (err) {
      console.error('预览查询失败:', err);
      setError(err.message);
      setPreviewData(null);
      setRowCount(null);
    } finally {
      setIsLoading(false);
    }
  }, [onPreviewData]);

  const estimateQueryPerformance = useCallback(async (sql) => {
    if (!sql || sql.trim() === '') return;

    try {
      // Get query execution plan for performance estimation
      const explainSQL = `EXPLAIN ${sql}`;

      const response = await fetch('/api/query/execute', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sql: explainSQL,
          preview: true
        }),
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          // Simple estimation based on query complexity
          const complexity = sql.length + (sql.match(/JOIN/gi) || []).length * 100;
          const estimated = Math.max(0.1, complexity / 1000);
          setEstimatedTime(estimated);
        }
      }
    } catch (err) {
      console.warn('性能估算失败:', err);
      setEstimatedTime(null);
    }
  }, []);

  const validateQuery = useCallback((config) => {
    const warnings = [];

    // Check for potential performance issues
    if (config.aggregations?.length > 0 && !config.groupBy?.length && config.selectedColumns?.length > 0) {
      warnings.push('使用聚合函数时建议设置分组列，否则可能产生意外结果');
    }

    if (!config.limit || config.limit > 1000) {
      warnings.push('建议设置合理的显示条数限制以提高查询性能');
    }

    if (config.filters?.length > 5) {
      warnings.push('过多的筛选条件可能影响查询性能');
    }

    if (config.orderBy?.length > 3) {
      warnings.push('过多的排序列可能影响查询性能');
    }

    // Check for complex calculated fields
    if (config.calculatedFields?.some(field => field.expression?.includes('CASE'))) {
      warnings.push('复杂的计算字段可能影响查询性能');
    }

    setValidationWarnings(warnings);
  }, []);

  const updatePreview = useCallback(async () => {
    if (!config || !tableName) return;

    // Clear previous timeout
    if (previewTimeout) {
      clearTimeout(previewTimeout);
    }

    // Validate query configuration
    validateQuery(config);

    // Set new timeout for debounced update
    const timeout = setTimeout(async () => {
      try {
        const { generateSQL } = await import('../../../utils/visualQueryGenerator');
        const result = generateSQL(config, tableName);

        if (result.success && result.sql) {
          await executePreviewQuery(result.sql);
          await estimateQueryPerformance(result.sql);
        } else {
          setError(result.errors?.join(', ') || '查询配置无效');
          setPreviewData(null);
          setRowCount(null);
          setEstimatedTime(null);
        }
      } catch (err) {
        console.error('预览更新失败:', err);
        setError(err.message);
      }
    }, 500); // 500ms debounce

    setPreviewTimeout(timeout);
  }, [config, tableName, executePreviewQuery, estimateQueryPerformance, validateQuery, previewTimeout]);

  useEffect(() => {
    updatePreview();

    // Cleanup timeout on unmount
    return () => {
      if (previewTimeout) {
        clearTimeout(previewTimeout);
      }
    };
  }, [updatePreview]);

  const formatValue = (value) => {
    if (value === null || value === undefined) {
      return <span className="text-gray-400 italic">NULL</span>;
    }
    if (typeof value === 'string' && value.length > 50) {
      return <span title={value}>{value.substring(0, 50)}...</span>;
    }
    return String(value);
  };

  const getPerformanceColor = (time) => {
    if (time < 0.5) return 'text-green-600';
    if (time < 2) return 'text-yellow-600';
    return 'text-red-600';
  };

  return (
    <Card className={`p-4 ${className}`}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-semibold text-gray-800">数据预览</h3>
        <div className="flex items-center space-x-2 text-sm text-gray-600">
          {isLoading && (
            <div className="flex items-center space-x-1">
              <div className="animate-spin w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full"></div>
              <span>加载中...</span>
            </div>
          )}
          {rowCount !== null && (
            <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded">
              {rowCount} 行
            </span>
          )}
          {estimatedTime !== null && (
            <span className={`px-2 py-1 rounded ${getPerformanceColor(estimatedTime)}`}>
              预计 {estimatedTime.toFixed(1)}s
            </span>
          )}
        </div>
      </div>

      {/* Validation Warnings */}
      {validationWarnings.length > 0 && (
        <div className="mb-3 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
          <div className="flex items-start space-x-2">
            <AlertTriangle size={16} className="text-yellow-600" style={{ marginRight: '8px' }} />
            <div className="flex-1">
              <h4 className="text-sm font-medium text-yellow-800 mb-1">性能建议</h4>
              <ul className="text-sm text-yellow-700 space-y-1">
                {validationWarnings.map((warning, index) => (
                  <li key={index}>• {warning}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-md">
          <div className="flex items-start space-x-2">
            <span className="text-red-600">❌</span>
            <div className="flex-1">
              <h4 className="text-sm font-medium text-red-800 mb-1">查询错误</h4>
              <p className="text-sm text-red-700">{error}</p>
            </div>
          </div>
        </div>
      )}

      {/* Data Table */}
      {previewData && previewData.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                {Object.keys(previewData[0]).map((column) => (
                  <th
                    key={column}
                    className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {previewData.slice(0, 5).map((row, index) => (
                <tr key={index} className="hover:bg-gray-50">
                  {Object.values(row).map((value, cellIndex) => (
                    <td
                      key={cellIndex}
                      className="px-3 py-2 whitespace-nowrap text-sm text-gray-900"
                    >
                      {formatValue(value)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>

          {previewData.length > 5 && (
            <div className="mt-2 text-center text-sm text-gray-500">
              显示前5行，共 {previewData.length} 行预览数据
            </div>
          )}
        </div>
      ) : !isLoading && !error && (
        <div className="text-center text-gray-500 py-8">
          <p>配置查询条件后将显示数据预览</p>
        </div>
      )}

      {/* Quick Stats */}
      {previewData && previewData.length > 0 && (
        <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
          <div className="bg-gray-50 p-2 rounded text-center">
            <div className="font-medium text-gray-800">
              {Object.keys(previewData[0]).length}
            </div>
            <div className="text-gray-600">列数</div>
          </div>

          <div className="bg-gray-50 p-2 rounded text-center">
            <div className="font-medium text-gray-800">
              {previewData.length}
            </div>
            <div className="text-gray-600">预览行数</div>
          </div>

          <div className="bg-gray-50 p-2 rounded text-center">
            <div className="font-medium text-gray-800">
              {rowCount || 0}
            </div>
            <div className="text-gray-600">总行数</div>
          </div>

          <div className="bg-gray-50 p-2 rounded text-center">
            <div className={`font-medium ${getPerformanceColor(estimatedTime || 0)}`}>
              {estimatedTime ? `${estimatedTime.toFixed(1)}s` : '-'}
            </div>
            <div className="text-gray-600">预计时间</div>
          </div>
        </div>
      )}

      {/* Refresh Button */}
      <div className="mt-3 flex justify-center">
        <Button
          variant="outline"
          size="sm"
          onClick={updatePreview}
          disabled={isLoading}
        >
          {isLoading ? '刷新中...' : '刷新预览'}
        </Button>
      </div>
    </Card>
  );
};

export default DataPreview;