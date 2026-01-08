/**
 * 多值标签输入组件
 * TagsInput Component
 * 
 * 用于 IN/NOT IN 操作符的多值输入
 */

import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { Badge } from '@/new/components/ui/badge';
import { Input } from '@/new/components/ui/input';

export interface TagsInputProps {
    /** 当前值列表 */
    value: (string | number)[];
    /** 值变化回调 */
    onChange: (values: (string | number)[]) => void;
    /** 占位文本 */
    placeholder?: string;
    /** 是否禁用 */
    disabled?: boolean;
    /** 每个 Tag 的类型（用于校验） */
    valueType?: 'string' | 'number' | 'auto';
    /** 自定义类名 */
    className?: string;
    /** 最大数量限制 */
    maxTags?: number;
}

export const TagsInput: React.FC<TagsInputProps> = ({
    value,
    onChange,
    placeholder,
    disabled = false,
    valueType = 'auto',
    className,
    maxTags = 100,
}) => {
    const { t } = useTranslation('common');
    const [inputValue, setInputValue] = React.useState('');
    const inputRef = React.useRef<HTMLInputElement>(null);

    /**
     * 解析输入值（支持粘贴多行）
     */
    const parseValue = (raw: string): (string | number)[] => {
        // 按逗号、换行、分号分割
        const parts = raw.split(/[,\n;]+/).map(s => s.trim()).filter(Boolean);

        return parts.map(part => {
            if (valueType === 'number') {
                const num = Number(part);
                return isNaN(num) ? part : num;
            }
            if (valueType === 'auto') {
                const num = Number(part);
                if (!isNaN(num) && part !== '') {
                    return num;
                }
            }
            return part;
        });
    };

    /**
     * 添加值
     */
    const addValues = (newValues: (string | number)[]) => {
        const uniqueValues = newValues.filter(v => !value.includes(v));
        if (uniqueValues.length === 0) return;

        const combined = [...value, ...uniqueValues];
        if (combined.length > maxTags) {
            onChange(combined.slice(0, maxTags));
        } else {
            onChange(combined);
        }
    };

    /**
     * 移除值
     */
    const removeValue = (index: number) => {
        const newValues = [...value];
        newValues.splice(index, 1);
        onChange(newValues);
    };

    /**
     * 处理键盘事件
     */
    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            if (inputValue.trim()) {
                addValues(parseValue(inputValue));
                setInputValue('');
            }
        } else if (e.key === 'Backspace' && inputValue === '' && value.length > 0) {
            // 退格删除最后一个 tag
            removeValue(value.length - 1);
        }
    };

    /**
     * 处理粘贴
     */
    const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
        const pastedText = e.clipboardData.getData('text');
        if (pastedText.includes('\n') || pastedText.includes(',')) {
            e.preventDefault();
            addValues(parseValue(pastedText));
        }
    };

    /**
     * 处理失去焦点
     */
    const handleBlur = () => {
        if (inputValue.trim()) {
            addValues(parseValue(inputValue));
            setInputValue('');
        }
    };

    return (
        <div
            className={`
        flex flex-wrap gap-1 p-2 
        border rounded-md 
        bg-background
        min-h-[38px]
        focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2
        ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-text'}
        ${className || ''}
      `}
            onClick={() => inputRef.current?.focus()}
        >
            {/* 已添加的 Tags */}
            {value.map((v, index) => (
                <Badge
                    key={`${v}-${index}`}
                    variant="outline"
                    className="gap-1 pr-1"
                >
                    <span className="max-w-[120px] truncate">{String(v)}</span>
                    {!disabled && (
                        <button
                            type="button"
                            className="ml-1 hover:bg-destructive/20 hover:text-destructive rounded-full p-0.5"
                            onClick={(e) => {
                                e.stopPropagation();
                                removeValue(index);
                            }}
                            aria-label={t('query.filter.action.remove', '移除') + ` ${v}`}
                        >
                            <X className="h-3 w-3" />
                        </button>
                    )}
                </Badge>
            ))}

            {/* 输入框 */}
            {!disabled && value.length < maxTags && (
                <Input
                    ref={inputRef}
                    type="text"
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={handleKeyDown}
                    onPaste={handlePaste}
                    onBlur={handleBlur}
                    placeholder={value.length === 0 ? (placeholder || t('query.filter.form.placeholder.enterValues', '输入值，回车添加')) : ''}
                    className="flex-1 min-w-[100px] border-0 p-0 h-6 focus-visible:ring-0 focus-visible:ring-offset-0"
                    disabled={disabled}
                />
            )}

            {/* 达到上限提示 */}
            {value.length >= maxTags && (
                <span className="text-xs text-muted-foreground">
                    {t('query.filter.error.maxTagsReached', '已达上限')}
                </span>
            )}
        </div>
    );
};

export default TagsInput;
