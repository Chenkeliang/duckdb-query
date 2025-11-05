import React, { useState } from 'react';
import { Card } from '../../ui/Card';
import { Input } from '../../ui/Input';
import { Button } from '@mui/material';

const ConditionalLogicControls = ({ 
  columns = [], 
  conditionalFields = [], 
  onConditionalFieldsChange 
}) => {
  const [newCondition, setNewCondition] = useState({
    name: '',
    type: 'case_when',
    conditions: [
      {
        column: '',
        operator: '=',
        value: '',
        result: ''
      }
    ],
    defaultValue: ''
  });

  const [newBinning, setNewBinning] = useState({
    name: '',
    column: '',
    type: 'age_groups',
    bins: 5,
    customRanges: []
  });

  const [activeTab, setActiveTab] = useState('conditional');

  const conditionOperators = [
    { value: '=', label: '等于' },
    { value: '!=', label: '不等于' },
    { value: '>', label: '大于' },
    { value: '<', label: '小于' },
    { value: '>=', label: '大于等于' },
    { value: '<=', label: '小于等于' },
    { value: 'LIKE', label: '包含' },
    { value: 'IS NULL', label: '为空' },
    { value: 'IS NOT NULL', label: '不为空' }
  ];

  const binningTypes = [
    { value: 'age_groups', label: '年龄段', description: '按年龄分组' },
    { value: 'price_ranges', label: '价格区间', description: '按价格分组' },
    { value: 'custom_ranges', label: '自定义区间', description: '自定义数值区间' },
    { value: 'equal_width', label: '等宽分组', description: '等宽度分组' }
  ];

  const addCondition = () => {
    setNewCondition({
      ...newCondition,
      conditions: [
        ...newCondition.conditions,
        {
          column: '',
          operator: '=',
          value: '',
          result: ''
        }
      ]
    });
  };

  const removeCondition = (index) => {
    const updatedConditions = newCondition.conditions.filter((_, i) => i !== index);
    setNewCondition({
      ...newCondition,
      conditions: updatedConditions
    });
  };

  const updateCondition = (index, field, value) => {
    const updatedConditions = newCondition.conditions.map((condition, i) => 
      i === index ? { ...condition, [field]: value } : condition
    );
    setNewCondition({
      ...newCondition,
      conditions: updatedConditions
    });
  };

  const addConditionalField = () => {
    if (!newCondition.name.trim()) return;

    const field = {
      ...newCondition,
      id: Date.now().toString(),
      type: 'conditional'
    };

    onConditionalFieldsChange([...conditionalFields, field]);
    setNewCondition({
      name: '',
      type: 'case_when',
      conditions: [
        {
          column: '',
          operator: '=',
          value: '',
          result: ''
        }
      ],
      defaultValue: ''
    });
  };

  const addBinningField = () => {
    if (!newBinning.name.trim() || !newBinning.column) return;

    const field = {
      ...newBinning,
      id: Date.now().toString(),
      type: 'binning'
    };

    onConditionalFieldsChange([...conditionalFields, field]);
    setNewBinning({
      name: '',
      column: '',
      type: 'age_groups',
      bins: 5,
      customRanges: []
    });
  };

  const removeConditionalField = (fieldId) => {
    onConditionalFieldsChange(conditionalFields.filter(f => f.id !== fieldId));
  };

  const generateCaseWhenPreview = (field) => {
    if (field.type !== 'conditional') return '';
    
    const conditions = field.conditions.map(cond => 
      `WHEN ${cond.column} ${cond.operator} '${cond.value}' THEN '${cond.result}'`
    ).join(' ');
    
    return `CASE ${conditions} ELSE '${field.defaultValue}' END`;
  };

  const generateBinningPreview = (field) => {
    if (field.type !== 'binning') return '';
    
    switch (field.type) {
      case 'age_groups':
        return `WIDTH_BUCKET(${field.column}, 0, 100, ${field.bins})`;
      case 'price_ranges':
        return `WIDTH_BUCKET(${field.column}, 0, 10000, ${field.bins})`;
      case 'equal_width':
        return `WIDTH_BUCKET(${field.column}, MIN(${field.column}), MAX(${field.column}), ${field.bins})`;
      default:
        return `WIDTH_BUCKET(${field.column}, 0, 100, ${field.bins})`;
    }
  };

  return (
    <Card className="p-4">
      <h3 className="text-lg font-semibold mb-4 dq-text-primary">条件判断与数据分组</h3>
      
      {/* Tab Navigation */}
      <div className="flex mb-4">
        <div className="dq-tab-group">
          <Button
            variant="text"
            disableRipple
            className={`dq-tab ${activeTab === 'conditional' ? 'dq-tab--active' : ''}`}
            onClick={() => setActiveTab('conditional')}
            sx={{ minWidth: 'auto', padding: 'var(--dq-tab-padding-y) var(--dq-tab-padding-x)' }}
          >
            条件判断
          </Button>
          <Button
            variant="text"
            disableRipple
            className={`dq-tab ${activeTab === 'binning' ? 'dq-tab--active' : ''}`}
            onClick={() => setActiveTab('binning')}
            sx={{ minWidth: 'auto', padding: 'var(--dq-tab-padding-y) var(--dq-tab-padding-x)' }}
          >
            数据分组
          </Button>
        </div>
      </div>

      {/* Existing conditional fields */}
      {conditionalFields.length > 0 && (
        <div className="mb-4">
          <h4 className="text-sm font-medium mb-2 dq-text-secondary">已创建的条件字段</h4>
          <div className="space-y-2">
            {conditionalFields.map((field) => (
              <div key={field.id} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                <div className="flex-1">
                  <span className="font-medium dq-text-primary">{field.name}</span>
                  <div className="text-sm dq-text-tertiary mt-1 font-mono">
                    {field.type === 'conditional' 
                      ? generateCaseWhenPreview(field)
                      : generateBinningPreview(field)
                    }
                  </div>
                </div>
                <Button
                  variant="outlined"
                  size="small"
                  color="error"
                  onClick={() => removeConditionalField(field.id)}
                >
                  删除
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Conditional Logic Tab */}
      {activeTab === 'conditional' && (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium dq-text-secondary mb-1">
              条件字段名称
            </label>
            <Input
              value={newCondition.name}
              onChange={(e) => setNewCondition({ ...newCondition, name: e.target.value })}
              placeholder="输入条件字段名称"
              className="w-full"
            />
          </div>

          <div>
            <label className="block text-sm font-medium dq-text-secondary mb-2">
              条件设置
            </label>
            <div className="space-y-3">
              {newCondition.conditions.map((condition, index) => (
                <div key={index} className="p-3 border rounded-lg bg-gray-50">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium dq-text-secondary">
                      条件 {index + 1}
                    </span>
                    {newCondition.conditions.length > 1 && (
                      <Button
                        variant="outlined"
                        size="small"
                        color="error"
                        onClick={() => removeCondition(index)}
                      >
                        删除
                      </Button>
                    )}
                  </div>
                  
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    <div>
                      <label className="block text-sm dq-text-tertiary mb-1">列名</label>
                      <select
                        value={condition.column}
                        onChange={(e) => updateCondition(index, 'column', e.target.value)}
                        className="w-full px-2 py-1 text-sm border rounded"
                      >
                        <option value="">选择列</option>
                        {columns.map(col => (
                          <option key={col.name} value={col.name}>{col.name}</option>
                        ))}
                      </select>
                    </div>
                    
                    <div>
                      <label className="block text-sm dq-text-tertiary mb-1">操作符</label>
                      <select
                        value={condition.operator}
                        onChange={(e) => updateCondition(index, 'operator', e.target.value)}
                        className="w-full px-2 py-1 text-sm border rounded"
                      >
                        {conditionOperators.map(op => (
                          <option key={op.value} value={op.value}>{op.label}</option>
                        ))}
                      </select>
                    </div>
                    
                    <div>
                      <label className="block text-sm dq-text-tertiary mb-1">比较值</label>
                      <Input
                        value={condition.value}
                        onChange={(e) => updateCondition(index, 'value', e.target.value)}
                        placeholder="输入值"
                        className="w-full text-sm"
                        disabled={condition.operator === 'IS NULL' || condition.operator === 'IS NOT NULL'}
                      />
                    </div>
                    
                    <div>
                      <label className="block text-sm dq-text-tertiary mb-1">返回值</label>
                      <Input
                        value={condition.result}
                        onChange={(e) => updateCondition(index, 'result', e.target.value)}
                        placeholder="返回值"
                        className="w-full text-sm"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
            
            <Button
              variant="outlined"
              size="small"
              onClick={addCondition}
              sx={{ mt: 2 }}
            >
              添加条件
            </Button>
          </div>

          <div>
            <label className="block text-sm font-medium dq-text-secondary mb-1">
              默认值
            </label>
            <Input
              value={newCondition.defaultValue}
              onChange={(e) => setNewCondition({ ...newCondition, defaultValue: e.target.value })}
              placeholder="当所有条件都不满足时的默认值"
              className="w-full"
            />
          </div>

          <Button
            variant="contained"
            onClick={addConditionalField}
            disabled={!newCondition.name.trim()}
            sx={{ width: '100%' }}
          >
            添加条件字段
          </Button>
        </div>
      )}

      {/* Data Binning Tab */}
      {activeTab === 'binning' && (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium dq-text-secondary mb-1">
              分组字段名称
            </label>
            <Input
              value={newBinning.name}
              onChange={(e) => setNewBinning({ ...newBinning, name: e.target.value })}
              placeholder="输入分组字段名称"
              className="w-full"
            />
          </div>

          <div>
            <label className="block text-sm font-medium dq-text-secondary mb-1">
              选择列
            </label>
            <select
              value={newBinning.column}
              onChange={(e) => setNewBinning({ ...newBinning, column: e.target.value })}
              className="w-full px-3 py-2 border rounded-md"
            >
              <option value="">选择要分组的列</option>
              {columns.filter(col => col.dataType && col.dataType.includes('INT') || col.dataType.includes('DOUBLE')).map(col => (
                <option key={col.name} value={col.name}>{col.name} ({col.dataType})</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium dq-text-secondary mb-2">
              分组类型
            </label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {binningTypes.map((type) => (
                <Button
                  key={type.value}
                  variant={newBinning.type === type.value ? 'contained' : 'outlined'}
                  size="small"
                  onClick={() => setNewBinning({ ...newBinning, type: type.value })}
                  sx={{ justifyContent: 'flex-start', textAlign: 'left' }}
                >
                  <div>
                    <div className="font-medium">{type.label}</div>
                    <div className="text-sm dq-text-tertiary">{type.description}</div>
                  </div>
                </Button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium dq-text-secondary mb-1">
              分组数量
            </label>
            <Input
              type="number"
              value={newBinning.bins}
              onChange={(e) => setNewBinning({ ...newBinning, bins: parseInt(e.target.value) || 5 })}
              min="2"
              max="20"
              className="w-full"
            />
            <p className="text-sm dq-text-tertiary mt-1">
              将数据分为 {newBinning.bins} 个区间
            </p>
          </div>

          <Button
            variant="contained"
            size="small"
            onClick={addBinningField}
            disabled={!newBinning.name.trim() || !newBinning.column}
            sx={{ width: '100%' }}
          >
            添加分组字段
          </Button>
        </div>
      )}
    </Card>
  );
};

export default ConditionalLogicControls;
