import React, { useState } from 'react';
import { Card } from '../../ui/Card';
import { Input } from '../../ui/Input';
import { Button } from '@mui/material';

const CalculatedFieldsControls = ({ 
  columns = [], 
  calculatedFields = [], 
  onCalculatedFieldsChange 
}) => {
  const [newField, setNewField] = useState({
    name: '',
    expression: '',
    type: 'mathematical',
    operation: 'add'
  });

  const mathematicalOperations = [
    { value: 'add', label: '加法', symbol: '+' },
    { value: 'subtract', label: '减法', symbol: '-' },
    { value: 'multiply', label: '乘法', symbol: '*' },
    { value: 'divide', label: '除法', symbol: '/' },
    { value: 'power', label: '乘方', symbol: '^' },
    { value: 'sqrt', label: '开方', symbol: 'SQRT' },
    { value: 'abs', label: '绝对值', symbol: 'ABS' },
    { value: 'round', label: '四舍五入', symbol: 'ROUND' }
  ];

  const dateFunctions = [
    { value: 'extract_year', label: '提取年份', symbol: 'EXTRACT(YEAR FROM' },
    { value: 'extract_month', label: '提取月份', symbol: 'EXTRACT(MONTH FROM' },
    { value: 'extract_day', label: '提取日期', symbol: 'EXTRACT(DAY FROM' }
  ];

  const stringFunctions = [
    { value: 'upper', label: '转大写', symbol: 'UPPER' },
    { value: 'lower', label: '转小写', symbol: 'LOWER' },
    { value: 'length', label: '字符长度', symbol: 'LENGTH' }
  ];

  const addCalculatedField = () => {
    if (!newField.name.trim()) return;

    const field = {
      ...newField,
      id: Date.now().toString()
    };

    onCalculatedFieldsChange([...calculatedFields, field]);
    setNewField({
      name: '',
      expression: '',
      type: 'mathematical',
      operation: 'add'
    });
  };

  const removeCalculatedField = (fieldId) => {
    onCalculatedFieldsChange(calculatedFields.filter(f => f.id !== fieldId));
  };

  const generateExpression = (field) => {
    const { type, operation } = field;
    
    if (type === 'mathematical') {
      const op = mathematicalOperations.find(o => o.value === operation);
      return op ? op.symbol : '';
    } else if (type === 'date') {
      const func = dateFunctions.find(f => f.value === operation);
      return func ? func.symbol : '';
    } else if (type === 'string') {
      const func = stringFunctions.find(f => f.value === operation);
      return func ? func.symbol : '';
    }
    
    return '';
  };

  return (
    <Card className="p-4">
      <h3 className="text-lg font-semibold mb-4 dq-text-primary">计算字段</h3>
      
      {/* Existing calculated fields */}
      {calculatedFields.length > 0 && (
        <div className="mb-4">
          <h4 className="text-sm font-medium mb-2 dq-text-secondary">已创建的计算字段</h4>
          <div className="space-y-2">
            {calculatedFields.map((field) => (
              <div key={field.id} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                <div className="flex-1">
                  <span className="font-medium dq-text-primary">{field.name}</span>
                  <span className="ml-2 text-sm dq-text-tertiary">
                    ({generateExpression(field)})
                  </span>
                </div>
                <Button
                  variant="outlined"
                  size="small"
                  color="error"
                  onClick={() => removeCalculatedField(field.id)}
                >
                  删除
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add new calculated field */}
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium dq-text-secondary mb-1">
            字段名称
          </label>
          <Input
            value={newField.name}
            onChange={(e) => setNewField({ ...newField, name: e.target.value })}
            placeholder="输入计算字段名称"
            className="w-full"
          />
        </div>

        <div>
          <label className="block text-sm font-medium dq-text-secondary mb-2">
            计算类型
          </label>
          <div className="dq-tab-group">
            {[
              { id: 'mathematical', label: '数学运算', defaultOp: 'add' },
              { id: 'date', label: '日期函数', defaultOp: 'extract_year' },
              { id: 'string', label: '字符串函数', defaultOp: 'upper' }
            ].map(item => (
              <Button
                key={item.id}
                variant="text"
                disableRipple
                className={`dq-tab ${newField.type === item.id ? 'dq-tab--active' : ''}`}
                onClick={() => setNewField({ ...newField, type: item.id, operation: item.defaultOp })}
                sx={{ minWidth: 'auto', padding: 'var(--dq-tab-padding-y) var(--dq-tab-padding-x)' }}
              >
                {item.label}
              </Button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium dq-text-secondary mb-2">
            操作类型
          </label>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {(newField.type === 'mathematical' ? mathematicalOperations : newField.type === 'date' ? dateFunctions : stringFunctions).map((option) => (
              <Button
                key={option.value}
                variant="text"
                disableRipple
                className={`dq-tab ${newField.operation === option.value ? 'dq-tab--active' : ''}`}
                onClick={() => setNewField({ ...newField, operation: option.value })}
                sx={{ justifyContent: 'flex-start', textAlign: 'left', minWidth: 'auto', padding: 'var(--dq-tab-padding-y) var(--dq-tab-padding-x)' }}
              >
                {option.label}
              </Button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium dq-text-secondary mb-1">
            表达式
          </label>
          <Input
            value={newField.expression}
            onChange={(e) => setNewField({ ...newField, expression: e.target.value })}
            placeholder="输入计算表达式，如: column1 + column2"
            className="w-full"
          />
          <p className="text-sm dq-text-tertiary mt-1">
            可用列: {columns.map(col => col.name).join(', ')}
          </p>
        </div>

        <Button
          variant="contained"
          onClick={addCalculatedField}
          disabled={!newField.name.trim()}
          sx={{ width: '100%' }}
        >
          添加计算字段
        </Button>
      </div>
    </Card>
  );
};

export default CalculatedFieldsControls;
