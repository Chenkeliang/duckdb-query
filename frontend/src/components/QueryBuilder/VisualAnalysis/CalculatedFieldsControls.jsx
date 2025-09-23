import React, { useState } from 'react';
import { Card } from '../../ui/Card';
import { Button } from '../../ui/Button';
import { Input } from '../../ui/Input';

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
      <h3 className="text-lg font-semibold mb-4 text-gray-800">计算字段</h3>
      
      {/* Existing calculated fields */}
      {calculatedFields.length > 0 && (
        <div className="mb-4">
          <h4 className="text-sm font-medium mb-2 text-gray-700">已创建的计算字段</h4>
          <div className="space-y-2">
            {calculatedFields.map((field) => (
              <div key={field.id} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                <div className="flex-1">
                  <span className="font-medium text-gray-800">{field.name}</span>
                  <span className="ml-2 text-sm text-gray-600">
                    ({generateExpression(field)})
                  </span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => removeCalculatedField(field.id)}
                  className="text-red-600 hover:text-red-700"
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
          <label className="block text-sm font-medium text-gray-700 mb-1">
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
          <label className="block text-sm font-medium text-gray-700 mb-2">
            计算类型
          </label>
          <div className="flex space-x-2">
            <Button
              variant={newField.type === 'mathematical' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setNewField({ ...newField, type: 'mathematical', operation: 'add' })}
            >
              数学运算
            </Button>
            <Button
              variant={newField.type === 'date' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setNewField({ ...newField, type: 'date', operation: 'extract_year' })}
            >
              日期函数
            </Button>
            <Button
              variant={newField.type === 'string' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setNewField({ ...newField, type: 'string', operation: 'upper' })}
            >
              字符串函数
            </Button>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            操作类型
          </label>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {newField.type === 'mathematical' && mathematicalOperations.map((op) => (
              <Button
                key={op.value}
                variant={newField.operation === op.value ? 'default' : 'outline'}
                size="sm"
                onClick={() => setNewField({ ...newField, operation: op.value })}
                className="text-xs"
              >
                {op.label}
              </Button>
            ))}
            {newField.type === 'date' && dateFunctions.map((func) => (
              <Button
                key={func.value}
                variant={newField.operation === func.value ? 'default' : 'outline'}
                size="sm"
                onClick={() => setNewField({ ...newField, operation: func.value })}
                className="text-xs"
              >
                {func.label}
              </Button>
            ))}
            {newField.type === 'string' && stringFunctions.map((func) => (
              <Button
                key={func.value}
                variant={newField.operation === func.value ? 'default' : 'outline'}
                size="sm"
                onClick={() => setNewField({ ...newField, operation: func.value })}
                className="text-xs"
              >
                {func.label}
              </Button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            表达式
          </label>
          <Input
            value={newField.expression}
            onChange={(e) => setNewField({ ...newField, expression: e.target.value })}
            placeholder="输入计算表达式，如: column1 + column2"
            className="w-full"
          />
          <p className="text-xs text-gray-500 mt-1">
            可用列: {columns.map(col => col.name).join(', ')}
          </p>
        </div>

        <Button
          onClick={addCalculatedField}
          disabled={!newField.name.trim()}
          className="w-full"
        >
          添加计算字段
        </Button>
      </div>
    </Card>
  );
};

export default CalculatedFieldsControls;