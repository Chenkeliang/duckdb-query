import { Lightbulb } from 'lucide-react';
import React, { useState } from 'react';
import { Button } from '@mui/material';
import { Card } from '../../ui/Card';

const HelpSystem = ({
  currentStep = 'columns',
  onStepChange,
  className = ''
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [activeTooltip, setActiveTooltip] = useState(null);

  const helpSteps = [
    {
      id: 'columns',
      title: '选择列',
      description: '选择要在查询结果中显示的列',
      tips: [
        '勾选需要显示的列',
        '可以选择多个列',
        '不选择任何列将显示所有列'
      ],
      shortcuts: ['Ctrl+A: 全选', 'Ctrl+D: 取消全选']
    },
    {
      id: 'aggregations',
      title: '聚合函数',
      description: '对数据进行统计分析',
      tips: [
        '求和: 计算数值列的总和',
        '平均值: 计算数值列的平均值',
        '计数: 统计行数',
        '最大值/最小值: 找出极值',
        '去重计数: 统计不重复值的数量'
      ],
      shortcuts: ['Tab: 切换函数类型']
    },
    {
      id: 'filters',
      title: '筛选条件',
      description: '设置数据筛选条件',
      tips: [
        '等于: 精确匹配',
        '包含: 文本包含指定内容',
        '大于/小于: 数值比较',
        '介于...之间: 范围筛选',
        '为空/不为空: 空值筛选'
      ],
      shortcuts: ['Enter: 添加条件', 'Delete: 删除条件']
    },
    {
      id: 'sorting',
      title: '排序设置',
      description: '设置结果排序方式',
      tips: [
        '升序: 从小到大排列',
        '降序: 从大到小排列',
        '可设置多列排序',
        '数字越小优先级越高'
      ],
      shortcuts: ['↑↓: 调整优先级']
    },
    {
      id: 'calculated',
      title: '计算字段',
      description: '创建自定义计算字段',
      tips: [
        '数学运算: 加减乘除、乘方、开方',
        '日期函数: 提取年月日',
        '字符串函数: 大小写转换、长度计算',
        '可以使用现有列进行计算'
      ],
      shortcuts: []
    },
    {
      id: 'conditional',
      title: '条件判断',
      description: '创建条件逻辑和数据分组',
      tips: [
        '条件判断: IF-THEN-ELSE逻辑',
        '数据分组: 按年龄段、价格区间等分组',
        '可设置多个条件',
        '支持自定义分组规则'
      ],
      shortcuts: []
    }
  ];

  const aggregationExamples = [
    {
      function: 'SUM',
      example: 'SUM(销售额)',
      description: '计算所有销售额的总和'
    },
    {
      function: 'AVG',
      example: 'AVG(年龄)',
      description: '计算平均年龄'
    },
    {
      function: 'COUNT',
      example: 'COUNT(*)',
      description: '统计总行数'
    },
    {
      function: 'COUNT_DISTINCT',
      example: 'COUNT(DISTINCT 客户ID)',
      description: '统计不重复客户数量'
    }
  ];

  const filterExamples = [
    {
      operator: '=',
      example: '城市 = "北京"',
      description: '筛选城市为北京的记录'
    },
    {
      operator: 'LIKE',
      example: '姓名 包含 "张"',
      description: '筛选姓名包含"张"的记录'
    },
    {
      operator: '>',
      example: '年龄 > 25',
      description: '筛选年龄大于25的记录'
    },
    {
      operator: 'BETWEEN',
      example: '销售额 介于 1000 和 5000 之间',
      description: '筛选销售额在1000-5000之间的记录'
    }
  ];

  const getCurrentStepHelp = () => {
    return helpSteps.find(step => step.id === currentStep) || helpSteps[0];
  };

  const Tooltip = ({ content, children, id }) => (
    <div
      className="relative inline-block"
      onMouseEnter={() => setActiveTooltip(id)}
      onMouseLeave={() => setActiveTooltip(null)}
    >
      {children}
      {activeTooltip === id && (
        <div className="absolute z-50 bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-sm rounded-md whitespace-nowrap">
          {content}
          <div className="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-gray-900"></div>
        </div>
      )}
    </div>
  );

  if (!isVisible) {
    return (
      <div className={`fixed bottom-4 right-4 z-40 ${className}`}>
        <Tooltip content="显示帮助" id="help-toggle">
          <Button
            variant="outlined"
            onClick={() => setIsVisible(true)}
            sx={{
              width: 48,
              height: 48,
              minWidth: 48,
              borderRadius: '50%',
              fontSize: '1.1rem',
              border: '1.5px solid var(--dq-accent-primary)',
              color: 'var(--dq-accent-primary)',
              backgroundColor: 'var(--dq-surface)',
              boxShadow: '0 6px 20px color-mix(in oklab, var(--dq-text-primary) 20%, transparent)',
              '&:hover': {
                backgroundColor: 'var(--dq-accent-primary)',
                color: 'var(--dq-text-on-primary)',
                borderColor: 'var(--dq-accent-primary)'
              }
            }}
          >
            ?
          </Button>
        </Tooltip>
      </div>
    );
  }

  const currentHelp = getCurrentStepHelp();

  return (
    <div className={`fixed bottom-4 right-4 z-40 w-80 ${className}`}>
      <Card className="p-4 shadow-xl border-2 border-blue-200">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold text-blue-800">
            📚 使用帮助
          </h3>
          <Button
            variant="outlined"
            size="small"
            onClick={() => setIsVisible(false)}
          >
            ✕
          </Button>
        </div>

        {/* Current Step Help */}
        <div className="mb-4">
          <h4 className="font-medium dq-text-primary mb-2">
            {currentHelp.title}
          </h4>
          <p className="text-sm dq-text-tertiary mb-3">
            {currentHelp.description}
          </p>

          <div className="space-y-2">
            <h5 className="text-sm font-medium dq-text-secondary">使用技巧:</h5>
            <ul className="text-sm dq-text-tertiary space-y-1">
              {currentHelp.tips.map((tip, index) => (
                <li key={index} className="flex items-start space-x-2">
                  <span className="text-blue-500 mt-0.5">•</span>
                  <span>{tip}</span>
                </li>
              ))}
            </ul>
          </div>

          {currentHelp.shortcuts.length > 0 && (
            <div className="mt-3">
              <h5 className="text-sm font-medium dq-text-secondary mb-1">快捷键:</h5>
              <div className="space-y-1">
                {currentHelp.shortcuts.map((shortcut, index) => (
                  <div key={index} className="text-sm bg-gray-100 px-2 py-1 rounded font-mono">
                    {shortcut}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Examples Section */}
        {currentStep === 'aggregations' && (
          <div className="mb-4">
            <h5 className="text-sm font-medium dq-text-secondary mb-2">常用示例:</h5>
            <div className="space-y-2">
              {aggregationExamples.map((example, index) => (
                <div key={index} className="bg-gray-50 p-2 rounded text-sm">
                  <div className="font-mono text-blue-600 mb-1">
                    {example.example}
                  </div>
                  <div className="dq-text-tertiary">
                    {example.description}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {currentStep === 'filters' && (
          <div className="mb-4">
            <h5 className="text-sm font-medium dq-text-secondary mb-2">筛选示例:</h5>
            <div className="space-y-2">
              {filterExamples.map((example, index) => (
                <div key={index} className="bg-gray-50 p-2 rounded text-sm">
                  <div className="font-mono text-blue-600 mb-1">
                    {example.example}
                  </div>
                  <div className="dq-text-tertiary">
                    {example.description}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Step Navigation */}
        <div className="border-t pt-3">
          <h5 className="text-sm font-medium dq-text-secondary mb-2">功能导航:</h5>
          <div className="grid grid-cols-2 gap-1">
            {helpSteps.map((step) => (
              <Button
                key={step.id}
                variant={currentStep === step.id ? 'contained' : 'outlined'}
                size="small"
                onClick={() => {
                  if (onStepChange) {
                    onStepChange(step.id);
                  }
                }}
                sx={{ justifyContent: 'flex-start', textAlign: 'left' }}
              >
                {step.title}
              </Button>
            ))}
          </div>
        </div>

        {/* Quick Tips */}
        <div className="mt-3 p-2 bg-blue-50 rounded-md">
          <div className="text-sm text-blue-800">
            <div className="font-medium mb-1">
              <Lightbulb size={16} style={{ marginRight: '8px' }} />
              快速提示:
            </div>
            <div>
              • 鼠标悬停在按钮上查看详细说明<br />
              • 使用预览功能实时查看结果<br />
              • 遇到问题可以重置配置重新开始
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
};

// Tooltip component for individual elements
export const HelpTooltip = ({ content, children, position = 'top' }) => {
  const [isVisible, setIsVisible] = useState(false);

  const positionClasses = {
    top: 'bottom-full left-1/2 transform -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 transform -translate-x-1/2 mt-2',
    left: 'right-full top-1/2 transform -translate-y-1/2 mr-2',
    right: 'left-full top-1/2 transform -translate-y-1/2 ml-2'
  };

  const arrowClasses = {
    top: 'top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-gray-900',
    bottom: 'bottom-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-b-gray-900',
    left: 'left-full top-1/2 transform -translate-y-1/2 border-4 border-transparent border-l-gray-900',
    right: 'right-full top-1/2 transform -translate-y-1/2 border-4 border-transparent border-r-gray-900'
  };

  return (
    <div
      className="relative inline-block"
      onMouseEnter={() => setIsVisible(true)}
      onMouseLeave={() => setIsVisible(false)}
    >
      {children}
      {isVisible && (
        <div className={`absolute z-50 px-3 py-2 bg-gray-900 text-white text-sm rounded-md whitespace-nowrap max-w-xs ${positionClasses[position]}`}>
          {content}
          <div className={`absolute ${arrowClasses[position]}`}></div>
        </div>
      )}
    </div>
  );
};

// Error message component with help
export const ErrorHelp = ({ error, suggestions = [] }) => (
  <div className="p-3 bg-red-50 border border-red-200 rounded-md">
    <div className="flex items-start space-x-2">
      <span className="text-red-600">❌</span>
      <div className="flex-1">
        <h4 className="text-sm font-medium text-red-800 mb-1">错误</h4>
        <p className="text-sm text-red-700 mb-2">{error}</p>
        {suggestions.length > 0 && (
          <div>
            <h5 className="text-sm font-medium text-red-800 mb-1">建议解决方案:</h5>
            <ul className="text-sm text-red-700 space-y-1">
              {suggestions.map((suggestion, index) => (
                <li key={index} className="flex items-start space-x-2">
                  <span className="text-red-500 mt-0.5">•</span>
                  <span>{suggestion}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  </div>
);

export default HelpSystem;
