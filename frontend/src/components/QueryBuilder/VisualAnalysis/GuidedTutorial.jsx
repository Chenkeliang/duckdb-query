import React, { useEffect, useState } from 'react';
import { Lightbulb } from 'lucide-react';
import Button from '@mui/material/Button';
import ButtonBase from '@mui/material/ButtonBase';
import { Card } from '../../ui/Card';

const GuidedTutorial = ({
  isFirstTime = false,
  onComplete,
  onSkip,
  className = ''
}) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [isVisible, setIsVisible] = useState(isFirstTime);
  const [completedSteps, setCompletedSteps] = useState(new Set());

  const tutorialSteps = [
    {
      id: 'welcome',
      title: '欢迎使用可视化查询构建器',
      content: '这个工具可以帮助您无需编写SQL代码就能构建复杂的数据查询。让我们一起来了解如何使用它。',
      target: null,
      action: '开始教程'
    },
    {
      id: 'table-selection',
      title: '选择数据表',
      content: '首先，您需要选择一个数据表。可视化查询构建器只在选择单个表时显示，这样可以确保最佳的用户体验。',
      target: '.table-selector',
      action: '下一步'
    },
    {
      id: 'column-selection',
      title: '选择列',
      content: '在这里选择您想要在查询结果中显示的列。您可以选择多个列，或者不选择任何列来显示所有列。',
      target: '.column-selector',
      action: '下一步'
    },
    {
      id: 'aggregations',
      title: '聚合函数',
      content: '使用聚合函数对数据进行统计分析。例如求和、平均值、计数等。选择聚合函数后，系统会自动处理分组逻辑。',
      target: '.aggregation-controls',
      action: '下一步'
    },
    {
      id: 'filters',
      title: '筛选条件',
      content: '设置筛选条件来过滤数据。支持多种操作符，如等于、包含、大于小于等。可以添加多个条件并设置逻辑关系。',
      target: '.filter-controls',
      action: '下一步'
    },
    {
      id: 'sorting',
      title: '排序设置',
      content: '设置结果的排序方式。可以按多个列排序，并设置优先级。支持升序和降序排列。',
      target: '.sort-controls',
      action: '下一步'
    },
    {
      id: 'advanced-features',
      title: '高级功能',
      content: '探索计算字段和条件判断功能。计算字段可以创建自定义计算，条件判断可以实现复杂的业务逻辑。',
      target: '.advanced-controls',
      action: '下一步'
    },
    {
      id: 'preview',
      title: 'SQL预览和数据预览',
      content: '实时查看生成的SQL代码和数据预览。这有助于验证查询逻辑是否正确，并提供性能建议。',
      target: '.preview-section',
      action: '下一步'
    },
    {
      id: 'execution',
      title: '执行查询',
      content: '配置完成后，点击"执行查询"按钮来运行查询。结果将显示在下方的数据表格中。',
      target: '.execute-button',
      action: '完成教程'
    }
  ];

  const currentTutorialStep = tutorialSteps[currentStep];

  useEffect(() => {
    // Check if user has seen tutorial before
    const hasSeenTutorial = localStorage.getItem('visual-query-tutorial-completed');
    if (!hasSeenTutorial && isFirstTime) {
      setIsVisible(true);
    }
  }, [isFirstTime]);

  const nextStep = () => {
    setCompletedSteps(prev => new Set([...prev, currentStep]));

    if (currentStep < tutorialSteps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      completeTutorial();
    }
  };

  const prevStep = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const skipTutorial = () => {
    setIsVisible(false);
    if (onSkip) {
      onSkip();
    }
  };

  const completeTutorial = () => {
    localStorage.setItem('visual-query-tutorial-completed', 'true');
    setIsVisible(false);
    if (onComplete) {
      onComplete();
    }
  };

  const restartTutorial = () => {
    setCurrentStep(0);
    setCompletedSteps(new Set());
    setIsVisible(true);
  };

  const goToStep = (stepIndex) => {
    setCurrentStep(stepIndex);
  };

  if (!isVisible) {
    return (
      <div className={`fixed bottom-20 right-4 z-30 ${className}`}>
        <Button
          variant="outline"
          size="sm"
          onClick={restartTutorial}
          className="bg-white shadow-md"
        >
          📖 重新查看教程
        </Button>
      </div>
    );
  }

  return (
    <>
      {/* Overlay */}
      <div className="fixed inset-0 bg-black bg-opacity-50 z-40" />

      {/* Tutorial Card */}
      <div className={`fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-50 w-96 ${className}`}>
        <Card
          className="p-6"
          style={{
            border: '1px solid var(--dq-border-card)',
            boxShadow: 'var(--dq-shadow-soft)',
            background: 'var(--dq-surface-card)'
          }}
        >
          {/* Progress Bar */}
          <div className="mb-4">
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm dq-text-tertiary">
                步骤 {currentStep + 1} / {tutorialSteps.length}
              </span>
              <span className="text-sm dq-text-tertiary">
                {Math.round(((currentStep + 1) / tutorialSteps.length) * 100)}%
              </span>
            </div>
            <div
              className="w-full rounded-full h-2"
              style={{ backgroundColor: 'color-mix(in oklab, var(--dq-border) 65%, transparent)' }}
            >
              <div
                className="h-2 rounded-full transition-all duration-300"
                style={{
                  width: `${((currentStep + 1) / tutorialSteps.length) * 100}%`,
                  backgroundColor: 'var(--dq-accent-primary)'
                }}
              />
            </div>
          </div>

          {/* Step Content */}
          <div className="mb-6">
            <h3 className="text-xl font-semibold dq-text-primary mb-3">
              {currentTutorialStep.title}
            </h3>
            <p className="dq-text-tertiary leading-relaxed">
              {currentTutorialStep.content}
            </p>
          </div>

          {/* Step Indicators */}
          <div className="mb-6">
            <div className="flex justify-center space-x-2">
              {tutorialSteps.map((_, index) => (
                <ButtonBase
                  key={index}
                  onClick={() => goToStep(index)}
                  title={`步骤 ${index + 1}: ${tutorialSteps[index].title}`}
                  sx={{
                    width: 12,
                    height: 12,
                    borderRadius: '999px',
                    transition: 'transform 0.2s ease, background-color 0.2s ease, box-shadow 0.2s ease',
                    transform: index === currentStep ? 'scale(1.15)' : 'scale(1)',
                    backgroundColor:
                      index === currentStep
                        ? 'var(--dq-accent-primary)'
                        : completedSteps.has(index)
                          ? 'color-mix(in oklab, var(--dq-status-success-fg) 55%, transparent)'
                          : 'color-mix(in oklab, var(--dq-border-card) 90%, transparent)',
                    boxShadow:
                      index === currentStep
                        ? '0 0 0 2px color-mix(in oklab, var(--dq-accent-primary) 35%, transparent)'
                        : 'none'
                  }}
                  aria-label={`跳转到步骤 ${index + 1}`}
                />
              ))}
            </div>
          </div>

          {/* Navigation Buttons */}
          <div className="flex justify-between items-center">
            <div className="flex space-x-2">
              <Button
                variant="outlined"
                size="small"
                onClick={prevStep}
                disabled={currentStep === 0}
                sx={{ minWidth: 96 }}
              >
                上一步
              </Button>
              <Button
                variant="outlined"
                size="small"
                onClick={skipTutorial}
                sx={{
                  color: 'var(--dq-text-tertiary)',
                  borderColor: 'color-mix(in oklab, var(--dq-border-card) 85%, transparent)'
                }}
              >
                跳过教程
              </Button>
            </div>

            <Button
              variant="contained"
              onClick={nextStep}
              sx={{
                minWidth: 120,
                backgroundColor: 'var(--dq-accent-primary)',
                color: 'var(--dq-text-on-primary)',
                '&:hover': {
                  backgroundColor: 'color-mix(in oklab, var(--dq-accent-primary) 85%, var(--dq-accent-200) 15%)'
                }
              }}
            >
              {currentTutorialStep.action}
            </Button>
          </div>

          {/* Quick Tips */}
          {currentStep > 0 && (
            <div
              className="mt-4 p-3 rounded-md"
              style={{ backgroundColor: 'var(--dq-accent-soft-bg)' }}
            >
              <div
                className="text-sm"
                style={{ color: 'color-mix(in oklab, var(--dq-accent-primary) 65%, var(--dq-text-primary) 35%)' }}
              >
                <div className="font-medium mb-1">
                  <Lightbulb size={16} style={{ marginRight: '8px' }} />
                  小贴士:
                </div>
                {currentStep === 1 && (
                  <div>选择表后，可视化查询面板会自动显示在查询构建器中。</div>
                )}
                {currentStep === 2 && (
                  <div>列选择支持多选，勾选的列将出现在查询结果中。</div>
                )}
                {currentStep === 3 && (
                  <div>使用聚合函数时，系统会自动添加必要的GROUP BY子句。</div>
                )}
                {currentStep === 4 && (
                  <div>筛选条件支持AND和OR逻辑，可以构建复杂的筛选规则。</div>
                )}
                {currentStep === 5 && (
                  <div>排序优先级数字越小越优先，可以拖拽调整顺序。</div>
                )}
                {currentStep === 6 && (
                  <div>计算字段和条件判断是高级功能，适合有一定经验的用户。</div>
                )}
                {currentStep === 7 && (
                  <div>预览功能可以帮助您在执行前验证查询的正确性。</div>
                )}
                {currentStep === 8 && (
                  <div>执行查询后，结果会显示在数据表格中，支持导出和进一步分析。</div>
                )}
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* Highlight Target Element */}
      {currentTutorialStep.target && (
        <style jsx>{`
          ${currentTutorialStep.target} {
            position: relative;
            z-index: 45;
            box-shadow: 0 0 0 4px color-mix(in oklab, var(--dq-accent-primary) 55%, transparent);
            border-radius: 8px;
          }
        `}</style>
      )}
    </>
  );
};

// Mini tutorial for specific features
export const FeatureTutorial = ({
  feature,
  isVisible,
  onClose,
  position = { top: '50%', left: '50%' }
}) => {
  const featureGuides = {
    aggregations: {
      title: '聚合函数使用指南',
      steps: [
        '选择要聚合的列',
        '选择聚合函数类型（求和、平均值等）',
        '设置别名（可选）',
        '系统会自动处理分组逻辑'
      ]
    },
    filters: {
      title: '筛选条件设置指南',
      steps: [
        '选择要筛选的列',
        '选择操作符（等于、包含等）',
        '输入筛选值',
        '设置多条件间的逻辑关系（且/或）'
      ]
    },
    calculated: {
      title: '计算字段创建指南',
      steps: [
        '输入字段名称',
        '选择计算类型（数学、日期、字符串）',
        '选择具体操作',
        '输入计算表达式'
      ]
    }
  };

  const guide = featureGuides[feature];

  if (!isVisible || !guide) return null;

  return (
    <div
      className="fixed z-50 w-80"
      style={{
        top: position.top,
        left: position.left,
        transform: 'translate(-50%, -50%)'
      }}
    >
      <Card
        className="p-4"
        style={{
          border: '1px solid var(--dq-border-card)',
          boxShadow: 'var(--dq-shadow-soft)',
          background: 'var(--dq-surface-card)'
        }}
      >
        <div className="flex items-center justify-between mb-3">
          <h4
            className="font-semibold"
            style={{ color: 'color-mix(in oklab, var(--dq-accent-primary) 70%, var(--dq-text-primary) 30%)' }}
          >
            {guide.title}
          </h4>
          <Button
            variant="outlined"
            size="small"
            onClick={onClose}
            sx={{ minWidth: 40, padding: '2px 10px' }}
          >
            ✕
          </Button>
        </div>

        <ol className="space-y-2">
          {guide.steps.map((step, index) => (
            <li key={index} className="flex items-start space-x-2 text-sm">
              <span
                className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-sm font-medium"
                style={{
                  backgroundColor: 'var(--dq-accent-soft-bg)',
                  color: 'color-mix(in oklab, var(--dq-accent-primary) 70%, var(--dq-text-primary) 30%)'
                }}
              >
                {index + 1}
              </span>
              <span className="dq-text-secondary">{step}</span>
            </li>
          ))}
        </ol>
      </Card>
    </div>
  );
};

export default GuidedTutorial;
