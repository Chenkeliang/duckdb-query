/**
 * 筛选条件编辑弹窗组件
 * FilterPopover Component
 * 
 * 用于添加/编辑筛选条件
 */

import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Filter, Plus } from 'lucide-react';
import { Button } from '@/new/components/ui/button';
import { Input } from '@/new/components/ui/input';
import { Label } from '@/new/components/ui/label';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/new/components/ui/popover';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/new/components/ui/select';
import { TagsInput } from './TagsInput';
import { PlacementSelector } from './PlacementSelector';
import type {
    FilterCondition,
    FilterOperator,
    ColumnInfo,
    FilterValue,
    FilterPlacement,
    PlacementContext,
} from './types';
import {
    OPERATOR_CONFIGS,
    getOperatorConfig,
} from './types';
import {
    createCondition,
    validateValueType,
    getDefaultPlacement,
} from './filterUtils';

export interface FilterPopoverProps {
    /** 模式：添加或编辑 */
    mode: 'add' | 'edit';
    /** 编辑模式下的初始值 */
    initialValue?: FilterCondition;
    /** 可用的列信息 */
    availableColumns: ColumnInfo[];
    /** 提交回调 */
    onSubmit: (condition: FilterCondition) => void;
    /** 取消回调 */
    onCancel?: () => void;
    /** 触发按钮（可选，用于编辑模式） */
    trigger?: React.ReactNode;
    /** 是否默认打开 */
    defaultOpen?: boolean;
    /** 受控打开状态 */
    open?: boolean;
    /** 打开状态变化回调 */
    onOpenChange?: (open: boolean) => void;
    /** 预设的表名（从 TableCard 触发时） */
    presetTable?: string;
    /** 预设的列名（从列图标触发时） */
    presetColumn?: string;
    /** 条件位置上下文（用于智能推荐 ON/WHERE） */
    placementContext?: PlacementContext;
}

export const FilterPopover: React.FC<FilterPopoverProps> = ({
    mode,
    initialValue,
    availableColumns,
    onSubmit,
    onCancel,
    trigger,
    defaultOpen,
    open: controlledOpen,
    onOpenChange,
    presetTable,
    presetColumn,
    placementContext,
}) => {
    const { t } = useTranslation('common');

    // 内部打开状态
    const [internalOpen, setInternalOpen] = React.useState(defaultOpen || false);
    const open = controlledOpen !== undefined ? controlledOpen : internalOpen;
    const setOpen = (value: boolean) => {
        setInternalOpen(value);
        onOpenChange?.(value);
    };

    // 表单状态
    const [selectedTable, setSelectedTable] = React.useState<string>(
        initialValue?.table || presetTable || ''
    );
    const [selectedColumn, setSelectedColumn] = React.useState<string>(
        initialValue?.column || presetColumn || ''
    );
    const [selectedOperator, setSelectedOperator] = React.useState<FilterOperator>(
        initialValue?.operator || '='
    );
    const [inputValue, setInputValue] = React.useState<string>(
        formatInitialValue(initialValue?.value)
    );
    const [multiValues, setMultiValues] = React.useState<(string | number)[]>(
        Array.isArray(initialValue?.value) ? initialValue.value : []
    );
    const [inputValue2, setInputValue2] = React.useState<string>(
        formatInitialValue(initialValue?.value2)
    );
    const [selectedPlacement, setSelectedPlacement] = React.useState<FilterPlacement>(
        initialValue?.placement || getDefaultPlacement(placementContext)
    );
    const [error, setError] = React.useState<string>('');

    // 获取唯一的表名列表
    const tables = React.useMemo(() => {
        const tableSet = new Set(availableColumns.map(c => c.table));
        return Array.from(tableSet);
    }, [availableColumns]);

    // 获取当前表的列列表
    const columns = React.useMemo(() => {
        if (!selectedTable) return [];
        return availableColumns.filter(c => c.table === selectedTable);
    }, [availableColumns, selectedTable]);

    // 获取当前选中列的类型
    const selectedColumnInfo = React.useMemo(() => {
        return availableColumns.find(
            c => c.table === selectedTable && c.column === selectedColumn
        );
    }, [availableColumns, selectedTable, selectedColumn]);

    // 获取当前操作符配置
    const operatorConfig = React.useMemo(() => {
        return getOperatorConfig(selectedOperator);
    }, [selectedOperator]);

    // 重置表单
    const resetForm = () => {
        setSelectedTable(presetTable || '');
        setSelectedColumn(presetColumn || '');
        setSelectedOperator('=');
        setInputValue('');
        setMultiValues([]);
        setInputValue2('');
        setSelectedPlacement(getDefaultPlacement(placementContext));
        setError('');
    };

    // 用于追踪是否刚从 initialValue 同步（避免竞态条件）
    const justSyncedFromInitialValue = React.useRef(false);

    // 当弹窗打开时，根据初始值重置表单
    React.useEffect(() => {
        if (open) {
            if (mode === 'edit' && initialValue) {
                justSyncedFromInitialValue.current = true;
                setSelectedTable(initialValue.table);
                setSelectedColumn(initialValue.column);
                setSelectedOperator(initialValue.operator);
                setInputValue(formatInitialValue(initialValue.value));
                setMultiValues(Array.isArray(initialValue.value) ? initialValue.value : []);
                setInputValue2(formatInitialValue(initialValue.value2));
                setSelectedPlacement(initialValue.placement || 'where');
            } else {
                resetForm();
            }
            setError('');
        }
    }, [open, mode, initialValue]);

    // 当表变化时，重置列选择（但编辑模式下刚同步时跳过）
    React.useEffect(() => {
        if (!presetColumn) {
            // 如果刚从 initialValue 同步，跳过重置
            if (justSyncedFromInitialValue.current) {
                justSyncedFromInitialValue.current = false;
                return;
            }
            setSelectedColumn('');
        }
    }, [selectedTable, presetColumn]);

    // 校验表单
    const validateForm = (): boolean => {
        console.log('[FilterPopover] validateForm called', { selectedTable, selectedColumn, selectedOperator, inputValue, multiValues });
        if (!selectedTable) {
            setError(t('filter.error.required', '请选择表'));
            return false;
        }
        if (!selectedColumn) {
            setError(t('filter.error.required', '请选择列'));
            return false;
        }

        // 需要值的操作符
        if (operatorConfig?.needsValue) {
            if (operatorConfig.isMultiValue) {
                if (multiValues.length === 0) {
                    setError(t('filter.error.required', '请至少添加一个值'));
                    return false;
                }
            } else {
                if (inputValue.trim() === '') {
                    setError(t('filter.error.required', '请输入值'));
                    return false;
                }

                // 类型校验
                if (selectedColumnInfo) {
                    const validation = validateValueType(inputValue, selectedColumnInfo.type);
                    if (!validation.valid && validation.error) {
                        setError(t(validation.error, validation.details || '值无效'));
                        return false;
                    }
                }
            }

            // BETWEEN 需要第二个值
            if (operatorConfig.needsSecondValue) {
                if (inputValue2.trim() === '') {
                    setError(t('filter.error.required', '请输入第二个值'));
                    return false;
                }
                if (selectedColumnInfo) {
                    const validation = validateValueType(inputValue2, selectedColumnInfo.type);
                    if (!validation.valid && validation.error) {
                        setError(t(validation.error, validation.details || '第二个值无效'));
                        return false;
                    }
                }
            }
        }

        setError('');
        return true;
    };

    // 提交表单
    const handleSubmit = () => {
        console.log('[FilterPopover] handleSubmit called');
        if (!validateForm()) {
            console.log('[FilterPopover] validateForm returned false, not submitting');
            return;
        }

        let value: FilterValue;
        let value2: FilterValue | undefined;

        if (operatorConfig?.isMultiValue) {
            value = multiValues;
        } else if (operatorConfig?.needsValue) {
            value = parseInputValue(inputValue, selectedColumnInfo?.type);
            if (operatorConfig.needsSecondValue) {
                value2 = parseInputValue(inputValue2, selectedColumnInfo?.type);
            }
        } else {
            value = null;
        }

        const condition = createCondition(
            selectedTable,
            selectedColumn,
            selectedOperator,
            value,
            value2,
            selectedPlacement
        );

        // 编辑模式保留原 ID
        if (mode === 'edit' && initialValue) {
            condition.id = initialValue.id;
        }

        onSubmit(condition);
        setOpen(false);
    };

    // 取消
    const handleCancel = () => {
        setOpen(false);
        onCancel?.();
    };

    // 默认触发按钮
    const defaultTrigger = mode === 'add' ? (
        <Button variant="outline" size="sm" className="gap-1">
            <Plus className="h-4 w-4" />
            {t('filter.addCondition', '添加条件')}
        </Button>
    ) : (
        <Button variant="ghost" size="icon" className="h-6 w-6">
            <Filter className="h-4 w-4" />
        </Button>
    );

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                {trigger || defaultTrigger}
            </PopoverTrigger>
            <PopoverContent
                className="w-80 max-h-[80vh] overflow-y-auto"
                align="start"
                sideOffset={5}
                collisionPadding={16}
                role="dialog"
                aria-label={mode === 'add' ? t('filter.addCondition', '添加条件') : t('filter.editCondition', '编辑条件')}
                aria-modal="true"
            >
                <div className="space-y-4">
                    {/* 标题 */}
                    <h4 className="font-medium text-sm">
                        {mode === 'add'
                            ? t('filter.addCondition', '添加筛选条件')
                            : t('filter.editCondition', '编辑筛选条件')
                        }
                    </h4>

                    {/* 表和列选择 */}
                    <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                            <Label htmlFor="filter-table" className="text-xs">
                                {t('filter.form.table', '表')}
                            </Label>
                            <Select
                                value={selectedTable}
                                onValueChange={setSelectedTable}
                                disabled={!!presetTable}
                            >
                                <SelectTrigger id="filter-table">
                                    <SelectValue placeholder={t('filter.form.placeholder.selectTable', '选择表')} />
                                </SelectTrigger>
                                <SelectContent className="z-[9999]">
                                    {tables.map(table => (
                                        <SelectItem key={table} value={table}>
                                            {table}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1">
                            <Label htmlFor="filter-column" className="text-xs">
                                {t('filter.form.column', '列')}
                            </Label>
                            <Select
                                value={selectedColumn}
                                onValueChange={setSelectedColumn}
                                disabled={!selectedTable || !!presetColumn}
                            >
                                <SelectTrigger id="filter-column">
                                    <SelectValue placeholder={t('filter.form.placeholder.selectColumn', '选择列')} />
                                </SelectTrigger>
                                <SelectContent className="z-[9999]">
                                    {columns.map(col => (
                                        <SelectItem key={col.column} value={col.column}>
                                            <span>{col.column}</span>
                                            <span className="ml-2 text-xs text-muted-foreground">
                                                ({col.type})
                                            </span>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    {/* 操作符选择 */}
                    <div className="space-y-1">
                        <Label htmlFor="filter-operator" className="text-xs">
                            {t('filter.form.operator', '操作符')}
                        </Label>
                        <Select
                            value={selectedOperator}
                            onValueChange={(v) => setSelectedOperator(v as FilterOperator)}
                        >
                            <SelectTrigger id="filter-operator">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="z-[9999]">
                                {OPERATOR_CONFIGS.map(config => (
                                    <SelectItem key={config.value} value={config.value}>
                                        <span className="font-mono mr-2">{config.symbol}</span>
                                        <span className="text-muted-foreground">
                                            {t(config.labelKey, config.value)}
                                        </span>
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {/* 值输入 */}
                    {operatorConfig?.needsValue && (
                        <div className="space-y-1">
                            <Label htmlFor="filter-value" className="text-xs">
                                {operatorConfig.isMultiValue
                                    ? t('filter.form.values', '值列表')
                                    : t('filter.form.value', '值')
                                }
                            </Label>
                            {operatorConfig.isMultiValue ? (
                                <TagsInput
                                    value={multiValues}
                                    onChange={setMultiValues}
                                    placeholder={t('filter.form.placeholder.enterValues', '输入值，回车添加')}
                                    valueType={selectedColumnInfo?.type?.includes('INT') ? 'number' : 'auto'}
                                />
                            ) : (
                                <Input
                                    id="filter-value"
                                    value={inputValue}
                                    onChange={(e) => setInputValue(e.target.value)}
                                    placeholder={t('filter.form.placeholder.enterValue', '输入值')}
                                />
                            )}
                        </div>
                    )}

                    {/* BETWEEN 第二个值 */}
                    {operatorConfig?.needsSecondValue && (
                        <div className="space-y-1">
                            <Label htmlFor="filter-value2" className="text-xs">
                                {t('filter.form.value', '值')} 2
                            </Label>
                            <Input
                                id="filter-value2"
                                value={inputValue2}
                                onChange={(e) => setInputValue2(e.target.value)}
                                placeholder={t('filter.form.placeholder.enterValue', '输入第二个值')}
                            />
                        </div>
                    )}

                    {/* 条件应用位置选择 */}
                    <PlacementSelector
                        value={selectedPlacement}
                        onChange={setSelectedPlacement}
                        context={placementContext}
                    />

                    {/* 错误提示 */}
                    {error && (
                        <p className="text-sm text-destructive">{error}</p>
                    )}

                    {/* 操作按钮 */}
                    <div className="flex justify-end gap-2 pt-2">
                        <Button variant="ghost" size="sm" onClick={handleCancel}>
                            {t('filter.action.cancel', '取消')}
                        </Button>
                        <Button size="sm" onClick={handleSubmit}>
                            {t('filter.action.confirm', '确定')}
                        </Button>
                    </div>
                </div>
            </PopoverContent>
        </Popover>
    );
};

/**
 * 格式化初始值为字符串
 */
function formatInitialValue(value: any): string {
    if (value === null || value === undefined) return '';
    if (Array.isArray(value)) return '';
    return String(value);
}

/**
 * 解析输入值为正确类型
 */
function parseInputValue(input: string, columnType?: string): FilterValue {
    if (input === '') return '';

    const type = columnType?.toUpperCase() || '';

    // 数字类型
    if (type.includes('INT') || type.includes('DOUBLE') || type.includes('FLOAT') || type.includes('DECIMAL')) {
        const num = Number(input);
        if (!isNaN(num)) return num;
    }

    // 布尔类型
    if (type.includes('BOOL')) {
        const lower = input.toLowerCase();
        if (lower === 'true' || lower === '1') return true;
        if (lower === 'false' || lower === '0') return false;
    }

    return input;
}

export default FilterPopover;
