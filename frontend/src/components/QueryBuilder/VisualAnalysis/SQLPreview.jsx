import { Lightbulb } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';

const SQLPreview = ({
  config,
  tableName,
  onSQLGenerated,
  className = ''
}) => {
  const [generatedSQL, setGeneratedSQL] = useState('');
  const [sqlMetadata, setSqlMetadata] = useState(null);
  const [copySuccess, setCopySuccess] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    if (config && tableName) {
      generateSQLPreview();
    }
  }, [config, tableName]);

  const generateSQLPreview = async () => {
    try {
      // Import the visual query generator
      const { generateSQLPreview } = await import('../../../utils/visualQueryGenerator');

      const result = generateSQLPreview(config, tableName);

      if (result.success) {
        setGeneratedSQL(result.sql);
        setSqlMetadata(result.metadata);

        if (onSQLGenerated) {
          onSQLGenerated(result.sql, result.metadata);
        }
      } else {
        setGeneratedSQL(`-- SQL生成失败\n-- 错误: ${result.errors.join(', ')}`);
        setSqlMetadata(null);
      }
    } catch (error) {
      setGeneratedSQL(`-- SQL预览生成失败\n-- 错误: ${error.message}`);
      setSqlMetadata(null);
    }
  };

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(generatedSQL);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (error) {
    }
  };

  const formatSQL = (sql) => {
    if (!sql) return '';

    // Simple SQL formatting
    return sql
      .replace(/SELECT/gi, 'SELECT')
      .replace(/FROM/gi, '\nFROM')
      .replace(/WHERE/gi, '\nWHERE')
      .replace(/GROUP BY/gi, '\nGROUP BY')
      .replace(/ORDER BY/gi, '\nORDER BY')
      .replace(/LIMIT/gi, '\nLIMIT')
      .replace(/CASE/gi, '\n  CASE')
      .replace(/WHEN/gi, '\n    WHEN')
      .replace(/THEN/gi, ' THEN')
      .replace(/ELSE/gi, '\n    ELSE')
      .replace(/END/gi, '\n  END');
  };

  const getSQLExplanation = () => {
    if (!sqlMetadata) return '';

    const explanations = [];

    if (sqlMetadata.hasColumns) {
      explanations.push('选择指定的列');
    }

    if (sqlMetadata.hasAggregations) {
      explanations.push('使用聚合函数进行数据汇总');
    }

    if (sqlMetadata.hasFilters) {
      explanations.push('应用筛选条件');
    }

    if (sqlMetadata.hasGroupBy) {
      explanations.push('按指定列分组');
    }

    if (sqlMetadata.hasOrderBy) {
      explanations.push('按指定顺序排序');
    }

    if (sqlMetadata.hasLimit) {
      explanations.push('限制返回行数');
    }

    if (sqlMetadata.isDistinct) {
      explanations.push('去除重复行');
    }

    return explanations.length > 0
      ? `查询说明: ${explanations.join('，')}`
      : '基础查询';
  };

  if (!generatedSQL) {
    return (
      <Card className={`p-4 ${className}`}>
        <div className="text-center text-gray-500">
          <p>配置查询条件后将显示SQL预览</p>
        </div>
      </Card>
    );
  }

  return (
    <Card className={`p-4 ${className}`}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-semibold text-gray-800">SQL预览</h3>
        <div className="flex space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsExpanded(!isExpanded)}
          >
            {isExpanded ? '收起' : '展开'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={copyToClipboard}
            className={copySuccess ? 'bg-green-50 text-green-700' : ''}
          >
            {copySuccess ? '已复制' : '复制'}
          </Button>
        </div>
      </div>

      {/* SQL Explanation */}
      {sqlMetadata && (
        <div className="mb-3 p-2 bg-blue-50 rounded-md">
          <p className="text-sm text-blue-800">
            {getSQLExplanation()}
          </p>
        </div>
      )}

      {/* SQL Code Display */}
      <div className="relative">
        <pre className={`
          bg-gray-900 text-gray-100 p-4 rounded-md overflow-x-auto text-sm font-mono
          ${isExpanded ? 'max-h-none' : 'max-h-48'}
        `}>
          <code className="language-sql">
            {isExpanded ? formatSQL(generatedSQL) : generatedSQL}
          </code>
        </pre>

        {!isExpanded && generatedSQL.split('\n').length > 8 && (
          <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-gray-900 to-transparent rounded-b-md"></div>
        )}
      </div>

      {/* SQL Statistics */}
      {sqlMetadata && (
        <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
          <div className="bg-gray-50 p-2 rounded text-center">
            <div className="font-medium text-gray-800">
              {sqlMetadata.hasColumns ? '✓' : '○'}
            </div>
            <div className="text-gray-600">列选择</div>
          </div>

          <div className="bg-gray-50 p-2 rounded text-center">
            <div className="font-medium text-gray-800">
              {sqlMetadata.hasAggregations ? '✓' : '○'}
            </div>
            <div className="text-gray-600">聚合函数</div>
          </div>

          <div className="bg-gray-50 p-2 rounded text-center">
            <div className="font-medium text-gray-800">
              {sqlMetadata.hasFilters ? '✓' : '○'}
            </div>
            <div className="text-gray-600">筛选条件</div>
          </div>

          <div className="bg-gray-50 p-2 rounded text-center">
            <div className="font-medium text-gray-800">
              {sqlMetadata.hasOrderBy ? '✓' : '○'}
            </div>
            <div className="text-gray-600">排序</div>
          </div>
        </div>
      )}

      {/* Performance Hints */}
      <div className="mt-3 text-sm text-gray-600">
        <div className="flex items-center space-x-4">
          <Lightbulb size={16} style={{ marginRight: '8px' }} />
          提示:
          {sqlMetadata?.hasAggregations && !sqlMetadata?.hasGroupBy && (
            <span className="text-amber-600">使用聚合函数时建议添加分组条件</span>
          )}
          {sqlMetadata?.hasFilters && (
            <span className="text-green-600">筛选条件有助于提高查询性能</span>
          )}
          {!sqlMetadata?.hasLimit && (
            <span className="text-blue-600">建议设置显示条数限制</span>
          )}
        </div>
      </div>
    </Card>
  );
};

export default SQLPreview;