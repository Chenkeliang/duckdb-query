/**
 * PivotTableDesigner - 统一的透视表设计器
 * 
 * 特点：
 * - 表格即配置区：拖拽字段到表格的不同区域完成配置
 * - 实时预览：配置后即时显示表格结构
 * - 三个拖放区域：ROWS（左侧）、COLUMNS（顶部）、VALUES（数据区）
 */

import * as React from "react";
import { useTranslation } from "react-i18next";
import {
    DndContext,
    DragOverlay,
    useSensor,
    useSensors,
    MouseSensor,
    TouchSensor,
    DragStartEvent,
    DragEndEvent,
    useDroppable,
    useDraggable,
    defaultDropAnimationSideEffects,
    DropAnimation,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { createPortal } from "react-dom";
import { GripVertical, X, ChevronDown, Rows3, Columns3, Calculator } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AggregationFunction } from "@/types/visualQuery";

// Types
interface PivotValueConfig {
    column: string;
    aggregation: AggregationFunction;
}

interface PivotTableDesignerProps {
    availableFields: { name: string; type: string }[];
    rows: string[];
    columns: string[];
    values: PivotValueConfig[];
    onRowsChange: (rows: string[]) => void;
    onColumnsChange: (columns: string[]) => void;
    onValuesChange: (values: PivotValueConfig[]) => void;
    isLoading?: boolean;
}

// Draggable Field Badge (from palette)
const DraggableField: React.FC<{ field: string; type: string }> = ({ field, type }) => {
    const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
        id: `field-${field}`,
        data: { field, type, isFromPalette: true }
    });

    const style: React.CSSProperties = {
        transform: CSS.Translate.toString(transform),
        opacity: isDragging ? 0.5 : 1,
    };

    return (
        <Badge
            ref={setNodeRef}
            variant="outline"
            style={style}
            {...listeners}
            {...attributes}
            className="cursor-grab hover:bg-accent/50 gap-1 shrink-0"
        >
            <GripVertical className="h-3 w-3 text-muted-foreground" />
            {field}
        </Badge>
    );
};

// Configured Field Badge (in drop zone)
const ConfiguredField: React.FC<{
    id: string;
    label: string;
    onRemove: () => void;
    type?: "row" | "column" | "value";
    extra?: React.ReactNode;
}> = ({ id, label, onRemove, type = "row", extra }) => {
    const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
        id,
        data: { fieldId: id, isFromPalette: false }
    });

    const style: React.CSSProperties = {
        transform: CSS.Translate.toString(transform),
        opacity: isDragging ? 0.5 : 1,
    };

    const typeClasses = {
        row: "bg-blue-500/10 text-blue-700 border-blue-200 dark:bg-blue-500/20 dark:text-blue-300 dark:border-blue-700",
        column: "bg-purple-500/10 text-purple-700 border-purple-200 dark:bg-purple-500/20 dark:text-purple-300 dark:border-purple-700",
        value: "bg-green-500/10 text-green-700 border-green-200 dark:bg-green-500/20 dark:text-green-300 dark:border-green-700",
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            {...attributes}
            {...listeners}
            className={`
        flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium border cursor-move select-none
        ${typeClasses[type]}
      `}
        >
            <span className="truncate max-w-[120px]">{label}</span>
            {extra}
            <button
                type="button"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                    e.stopPropagation();
                    onRemove();
                }}
                className="hover:bg-black/10 dark:hover:bg-white/10 rounded p-0.5 ml-0.5 shrink-0"
            >
                <X className="h-3 w-3" />
            </button>
        </div>
    );
};

// Drop Zone
const DropZone: React.FC<{
    id: string;
    title: string;
    icon: React.ReactNode;
    children: React.ReactNode;
    placeholder?: string;
    badge?: string;
}> = ({ id, title, icon, children, placeholder, badge }) => {
    const { setNodeRef, isOver } = useDroppable({ id });

    return (
        <div
            ref={setNodeRef}
            className={`
        rounded-lg border-2 border-dashed transition-all p-3
        ${isOver ? "border-primary bg-primary/5" : "border-border/50 hover:border-border bg-muted/20"}
      `}
        >
            <div className="flex items-center gap-2 mb-2 text-xs font-medium text-muted-foreground">
                {icon}
                <span>{title}</span>
                {badge && <Badge variant="outline" className="text-[10px] px-1 h-4">{badge}</Badge>}
            </div>
            <div className="flex flex-wrap gap-1.5 min-h-[40px]">
                {React.Children.count(children) === 0 ? (
                    <div className="w-full h-10 flex items-center justify-center text-xs text-muted-foreground/40">
                        {placeholder}
                    </div>
                ) : (
                    children
                )}
            </div>
        </div>
    );
};

// Aggregation Dropdown for Values
const AggDropdown: React.FC<{
    value: AggregationFunction;
    onChange: (agg: AggregationFunction) => void;
}> = ({ value, onChange }) => {
    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-4 w-4 p-0 hover:bg-black/5 rounded-full shrink-0"
                    onPointerDown={(e) => e.stopPropagation()}
                >
                    <ChevronDown className="h-3 w-3 opacity-50" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
                {Object.values(AggregationFunction).map((agg) => (
                    <DropdownMenuItem key={agg} onClick={() => onChange(agg)}>
                        {agg.toUpperCase()}
                    </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
        </DropdownMenu>
    );
};

// Main Component
export const PivotTableDesigner: React.FC<PivotTableDesignerProps> = ({
    availableFields,
    rows,
    columns,
    values,
    onRowsChange,
    onColumnsChange,
    onValuesChange,
    isLoading,
}) => {
    const { t } = useTranslation(["pivot", "common"]);
    const [activeId, setActiveId] = React.useState<string | null>(null);
    const [activeData, setActiveData] = React.useState<any>(null);

    const sensors = useSensors(
        useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
        useSensor(TouchSensor)
    );

    // Get configured field names for filtering palette
    const configuredFields = new Set([...rows, ...columns, ...values.map(v => v.column)]);
    const paletteFields = availableFields.filter(f => !configuredFields.has(f.name));

    const handleDragStart = (event: DragStartEvent) => {
        setActiveId(event.active.id as string);
        setActiveData(event.active.data.current);
    };

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        setActiveId(null);
        setActiveData(null);

        if (!over) return;

        const overId = over.id as string;
        const isFromPalette = active.data.current?.isFromPalette;
        const fieldName = isFromPalette
            ? active.data.current?.field
            : active.id as string;

        // Determine target zone
        let targetZone: "rows" | "columns" | "values" | null = null;
        if (overId === "zone-rows" || rows.includes(overId)) targetZone = "rows";
        else if (overId === "zone-columns" || columns.includes(overId)) targetZone = "columns";
        else if (overId === "zone-values" || values.some((v, i) => `value-${v.column}-${i}` === overId)) targetZone = "values";

        if (!targetZone || !fieldName) return;

        // Remove from current location if moving within table
        if (!isFromPalette) {
            if (rows.includes(fieldName)) onRowsChange(rows.filter(r => r !== fieldName));
            else if (columns.includes(fieldName)) onColumnsChange(columns.filter(c => c !== fieldName));
            else {
                const idx = values.findIndex((v, i) => `value-${v.column}-${i}` === (active.id as string));
                if (idx !== -1) onValuesChange(values.filter((_, i) => i !== idx));
            }
        }

        // Add to new location
        if (targetZone === "rows" && !rows.includes(fieldName)) {
            onRowsChange([...rows, fieldName]);
        } else if (targetZone === "columns") {
            // Single column limit - replace
            onColumnsChange([fieldName]);
        } else if (targetZone === "values") {
            onValuesChange([...values, { column: fieldName, aggregation: AggregationFunction.SUM }]);
        }
    };

    const handleRemoveRow = (field: string) => onRowsChange(rows.filter(r => r !== field));
    const handleRemoveColumn = (field: string) => onColumnsChange(columns.filter(c => c !== field));
    const handleRemoveValue = (idx: number) => onValuesChange(values.filter((_, i) => i !== idx));
    const handleUpdateValueAgg = (idx: number, agg: AggregationFunction) => {
        const newValues = [...values];
        newValues[idx] = { ...newValues[idx], aggregation: agg };
        onValuesChange(newValues);
    };

    const dropAnimation: DropAnimation = {
        sideEffects: defaultDropAnimationSideEffects({
            styles: { active: { opacity: "0.5" } },
        }),
    };

    // hasConfig determines if preview should be shown

    const hasConfig = rows.length > 0 || columns.length > 0 || values.length > 0;

    return (
        <DndContext
            sensors={sensors}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
        >
            <div className="flex flex-col gap-4">
                {/* Field Palette */}
                <div className="bg-muted/30 border border-border rounded-lg p-3">
                    <div className="text-xs font-medium text-muted-foreground mb-2">
                        {t("common:query.pivot.availableFields", "可用字段")}
                    </div>
                    <div className="flex flex-wrap gap-1.5 min-h-[32px]">
                        {isLoading ? (
                            <span className="text-xs text-muted-foreground">{t("common:common.loading", "加载中...")}</span>
                        ) : paletteFields.length === 0 && availableFields.length > 0 ? (
                            <span className="text-xs text-muted-foreground">{t("common:query.pivot.allFieldsConfigured", "所有字段已配置")}</span>
                        ) : paletteFields.length === 0 ? (
                            <span className="text-xs text-muted-foreground">{t("common:query.pivot.selectTableHint", "请先选择数据表")}</span>
                        ) : (
                            paletteFields.map(f => <DraggableField key={f.name} field={f.name} type={f.type} />)
                        )}
                    </div>
                </div>

                {/* Configuration Zones - Grid Layout */}
                <div className="grid grid-cols-3 gap-3">
                    {/* Rows Zone */}
                    <DropZone
                        id="zone-rows"
                        title={t("common:query.pivot.rows", "行字段")}
                        icon={<Rows3 className="h-3.5 w-3.5" />}
                        placeholder={t("common:query.pivot.dropRowHint", "拖入行分组字段")}
                    >
                        {rows.map(r => (
                            <ConfiguredField
                                key={r}
                                id={r}
                                label={r}
                                type="row"
                                onRemove={() => handleRemoveRow(r)}
                            />
                        ))}
                    </DropZone>

                    {/* Columns Zone */}
                    <DropZone
                        id="zone-columns"
                        title={t("common:query.pivot.columns", "透视列")}
                        icon={<Columns3 className="h-3.5 w-3.5" />}
                        placeholder={t("common:query.pivot.dropColumnHint", "拖入透视列字段")}
                        badge={t("common:query.pivot.maxOne", "限1个")}
                    >
                        {columns.map(c => (
                            <ConfiguredField
                                key={c}
                                id={c}
                                label={c}
                                type="column"
                                onRemove={() => handleRemoveColumn(c)}
                            />
                        ))}
                    </DropZone>

                    {/* Values Zone */}
                    <DropZone
                        id="zone-values"
                        title={t("common:query.pivot.values", "聚合值")}
                        icon={<Calculator className="h-3.5 w-3.5" />}
                        placeholder={t("common:query.pivot.dropValueHint", "拖入聚合值字段")}
                    >
                        {values.map((v, i) => (
                            <ConfiguredField
                                key={`value-${v.column}-${i}`}
                                id={`value-${v.column}-${i}`}
                                label={`${v.aggregation.toUpperCase()}(${v.column})`}
                                type="value"
                                onRemove={() => handleRemoveValue(i)}
                                extra={
                                    <AggDropdown
                                        value={v.aggregation}
                                        onChange={(agg) => handleUpdateValueAgg(i, agg)}
                                    />
                                }
                            />
                        ))}
                    </DropZone>
                </div>

                {/* Preview Table - 更好地体现三个配置区域 */}
                {hasConfig && (
                    <div className="border border-border rounded-lg overflow-hidden">
                        <div className="bg-muted/30 px-3 py-2 border-b border-border text-xs font-medium text-muted-foreground flex items-center justify-between">
                            <span>{t("common:query.pivot.tablePreview", "表格结构预览")}</span>
                            {columns.length > 0 && values.length > 0 && (
                                <span className="text-[10px] text-purple-500">
                                    {t("common:query.pivot.pivotMode", "透视模式")}: [{columns[0]}] → {values.map(v => `${v.aggregation}(${v.column})`).join(", ")}
                                </span>
                            )}
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    {/* 第一行：显示透视列信息 */}
                                    {columns.length > 0 && (
                                        <tr className="bg-purple-500/5">
                                            <th
                                                className="border-b border-r border-border px-3 py-1.5 text-left text-[10px] text-muted-foreground"
                                                colSpan={rows.length || 1}
                                            >
                                                {t("common:query.pivot.rowDimension", "行维度")}
                                            </th>
                                            <th
                                                className="border-b border-border px-3 py-1.5 text-center text-[10px] text-purple-600 dark:text-purple-400"
                                                colSpan={3}
                                            >
                                                ← {t("common:query.pivot.pivotColumnValues", "透视列")}: <strong>{columns[0]}</strong> {t("common:query.pivot.uniqueValues", "的唯一值")} →
                                            </th>
                                        </tr>
                                    )}
                                    {/* 第二行：具体列头 */}
                                    <tr className="bg-muted/20">
                                        {/* Row columns */}
                                        {rows.length > 0 ? rows.map(r => (
                                            <th key={r} className="border-b border-r border-border px-3 py-2 text-left font-medium text-blue-600 dark:text-blue-400">
                                                {r}
                                            </th>
                                        )) : (
                                            <th className="border-b border-r border-border px-3 py-2 text-left text-muted-foreground italic">
                                                ({t("common:query.pivot.noRows", "无行字段")})
                                            </th>
                                        )}
                                        {/* Column headers */}
                                        {columns.length > 0 ? (
                                            // 透视模式：显示透视列的预览值 + 聚合函数
                                            <>
                                                <th className="border-b border-border px-3 py-2 text-center font-medium text-purple-600 dark:text-purple-400">
                                                    [{columns[0]}]=A<br />
                                                    <span className="text-[10px] text-green-600">{values.map(v => v.aggregation.toUpperCase()).join("/")}</span>
                                                </th>
                                                <th className="border-b border-border px-3 py-2 text-center font-medium text-purple-600 dark:text-purple-400">
                                                    [{columns[0]}]=B<br />
                                                    <span className="text-[10px] text-green-600">{values.map(v => v.aggregation.toUpperCase()).join("/")}</span>
                                                </th>
                                                <th className="border-b border-border px-3 py-2 text-center text-muted-foreground">
                                                    ...
                                                </th>
                                            </>
                                        ) : values.length > 0 ? (
                                            // 普通聚合模式
                                            values.map((v, i) => (
                                                <th key={i} className="border-b border-border px-3 py-2 text-center font-medium text-green-600 dark:text-green-400">
                                                    {v.aggregation.toUpperCase()}({v.column})
                                                </th>
                                            ))
                                        ) : (
                                            <th className="border-b border-border px-3 py-2 text-center text-muted-foreground italic">
                                                ({t("common:query.pivot.noValues", "无聚合值")})
                                            </th>
                                        )}
                                    </tr>
                                </thead>
                                <tbody className="text-muted-foreground">
                                    {/* 示例数据行 */}
                                    <tr>
                                        {rows.length > 0 ? rows.map((r, i) => (
                                            <td key={i} className="border-r border-border px-3 py-2">
                                                <span className="text-blue-600/60 dark:text-blue-400/60 italic">({r})</span>
                                            </td>
                                        )) : (
                                            <td className="border-r border-border px-3 py-2 italic">...</td>
                                        )}
                                        {columns.length > 0 ? (
                                            <>
                                                <td className="border-border px-3 py-2 text-center text-green-600">123</td>
                                                <td className="border-border px-3 py-2 text-center text-green-600">456</td>
                                                <td className="border-border px-3 py-2 text-center">...</td>
                                            </>
                                        ) : values.length > 0 ? (
                                            values.map((_, i) => (
                                                <td key={i} className="border-border px-3 py-2 text-center text-green-600">123</td>
                                            ))
                                        ) : (
                                            <td className="border-border px-3 py-2 text-center">-</td>
                                        )}
                                    </tr>
                                    <tr>
                                        {rows.length > 0 ? rows.map((r, i) => (
                                            <td key={i} className="border-t border-r border-border px-3 py-2">
                                                <span className="text-blue-600/60 dark:text-blue-400/60 italic">({r})</span>
                                            </td>
                                        )) : (
                                            <td className="border-t border-r border-border px-3 py-2 italic">...</td>
                                        )}
                                        {columns.length > 0 ? (
                                            <>
                                                <td className="border-t border-border px-3 py-2 text-center text-green-600">789</td>
                                                <td className="border-t border-border px-3 py-2 text-center text-green-600">101</td>
                                                <td className="border-t border-border px-3 py-2 text-center">...</td>
                                            </>
                                        ) : values.length > 0 ? (
                                            values.map((_, i) => (
                                                <td key={i} className="border-t border-border px-3 py-2 text-center text-green-600">456</td>
                                            ))
                                        ) : (
                                            <td className="border-t border-border px-3 py-2 text-center">-</td>
                                        )}
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                        <div className="bg-muted/20 px-3 py-1.5 border-t border-border text-[10px] text-muted-foreground">
                            {columns.length > 0
                                ? t("common:query.pivot.previewHintPivot", "透视表预览：[透视列]的每个唯一值将成为单独的列")
                                : t("common:query.pivot.previewHint", "聚合查询预览：按行字段分组后计算聚合值")}
                        </div>
                    </div>
                )}
            </div>

            {/* Drag Overlay */}
            {createPortal(
                <DragOverlay dropAnimation={dropAnimation}>
                    {activeId && activeData && (
                        <div className="flex items-center gap-2 p-2 rounded-md bg-background border shadow-lg opacity-90">
                            <GripVertical className="h-3 w-3 text-muted-foreground" />
                            <span className="text-sm font-medium">
                                {activeData.isFromPalette ? activeData.field : activeId}
                            </span>
                        </div>
                    )}
                </DragOverlay>,
                document.body
            )}
        </DndContext>
    );
};

export default PivotTableDesigner;
