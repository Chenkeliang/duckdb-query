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
import { AggregationFunction } from "@/types/pivotQuery";
import { isNumericType } from "@/utils/duckdbTypes";
import { showSuccessToast, showErrorToast } from "@/utils/toastHelpers";
import type { InferCastResult } from "@/api";

// Types
interface PivotValueConfig {
    column: string;
    aggregation: AggregationFunction;
    /** 文本列按数值聚合时的转换目标(如 DECIMAL(38,2));后端渲染为 TRY_CAST */
    typeConversion?: string;
    /** UI-only:'pending'=推断中,'unsafe'=无法安全推断需用户显式选择。二者都会挡住生成/执行。 */
    castStatus?: 'pending' | 'unsafe';
    /** UI-only:cast 来源。'inferred'=系统数据感知推断(上下文变化会重推);'manual'=用户手填(不覆盖)。 */
    castSource?: 'inferred' | 'manual';
    /** UI-only:该推断结果依据的推断上下文键(表身份+筛选);与当前不同 → 结果过期需重推。 */
    castContextKey?: string;
    /** UI-only:单调派发号,只应用最新一次推断派发的结果(区分同上下文的重复在途请求)。 */
    castSeq?: number;
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
    /** 文本列选 SUM/AVG 时,在筛选后数据上做数据感知 cast 推断(由 PivotPanel 提供,含表/筛选/attach) */
    onInferCast?: (column: string) => Promise<InferCastResult | null>;
    /** 当前推断上下文键(表身份+筛选,由 PivotPanel 提供)。变化时对"系统推断"的值重新推断,并作为
     *  异步结果的上下文标识:回来时若键已变则丢弃 stale 结果。手填(manual)的值不受其变化影响。 */
    inferenceContextKey?: string;
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
                {badge && <Badge variant="outline" className="text-xs px-1 h-4">{badge}</Badge>}
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
}> = ({ value: _value, onChange }) => {
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
    onInferCast,
    inferenceContextKey,
}) => {
    const { t } = useTranslation("common");
    const [activeId, setActiveId] = React.useState<string | null>(null);
    const [activeData, setActiveData] = React.useState<any>(null);

    const sensors = useSensors(
        useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
        useSensor(TouchSensor)
    );

    // Get configured field names for filtering palette
    const configuredFields = new Set([...rows, ...columns, ...values.map(v => v.column)]);
    const paletteFields = availableFields.filter(f => !configuredFields.has(f.name));

    // 字段是否数值类型(据 availableFields 的 type);拿不到类型时保守视为数值(维持旧默认)
    const isFieldNumeric = (fieldName: string): boolean => {
        const field = availableFields.find(f => f.name === fieldName);
        return field ? isNumericType(field.type) : true;
    };

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
            // 按列类型给默认聚合:数值→SUM,非数值(文本/日期)→COUNT(避免默认 SUM 直接撞 sum(VARCHAR))
            const defaultAgg = isFieldNumeric(fieldName)
                ? AggregationFunction.SUM
                : AggregationFunction.COUNT;
            onValuesChange([...values, { column: fieldName, aggregation: defaultAgg }]);
        }
    };

    const handleRemoveRow = (field: string) => onRowsChange(rows.filter(r => r !== field));
    const handleRemoveColumn = (field: string) => onColumnsChange(columns.filter(c => c !== field));
    const handleRemoveValue = (idx: number) => onValuesChange(values.filter((_, i) => i !== idx));

    // 用 ref 读最新 values,避免异步推断回来时用了旧闭包。updateValueAt 同步回写 ref:
    // 筛选变化可能让【多个】推断值在同一 tick 内先后更新(重推 effect + 各自 async 回填),
    // 若只依赖 onValuesChange(下次 render 才刷新 ref),后一次更新会读到旧 ref 覆盖掉前一次。
    const valuesRef = React.useRef(values);
    valuesRef.current = values;
    const contextKeyRef = React.useRef(inferenceContextKey);
    contextKeyRef.current = inferenceContextKey;
    // 单调派发号:只应用【最新一次派发】的推断结果。forKey 内容寻址,A→B→A 时会出现两个同 forKey
    // 的在途请求(d0 与 d2),仅靠 forKey/castSource 无法区分——谁后【到达】谁赢会让旧解覆盖新解。
    // castSeq 随值同行(reorder 安全),迟到的旧派发因 seq 不再匹配被丢弃(对抗复审 flaw:inferred×inferred 竞态)。
    const inferSeqRef = React.useRef(0);

    const updateValueAt = (idx: number, patch: Partial<PivotValueConfig>) => {
        const cur = valuesRef.current;
        if (idx < 0 || idx >= cur.length) return;
        const next = [...cur];
        next[idx] = { ...next[idx], ...patch };
        valuesRef.current = next; // 同步回写,保证同 tick 内后续更新基于最新值合成
        onValuesChange(next);
    };

    const needsTextCast = (v: PivotValueConfig): boolean =>
        !isFieldNumeric(v.column) &&
        (v.aggregation === AggregationFunction.SUM || v.aggregation === AggregationFunction.AVG);

    // 在推断上下文 forKey(表身份+筛选)下对 idx 列做数据感知推断:先落 pending 挡住生成/执行,再异步回填。
    // forKey 兼作上下文标识:结果回来时若当前上下文键已变(切表/改筛选),丢弃这次 stale 结果。
    const inferCastFor = (idx: number, col: string, forKey: string) => {
        const seq = (inferSeqRef.current += 1);
        updateValueAt(idx, {
            typeConversion: undefined, castStatus: 'pending',
            castSource: 'inferred', castContextKey: forKey, castSeq: seq,
        });
        if (!onInferCast) {
            updateValueAt(idx, { castStatus: 'unsafe', castSource: 'inferred', castContextKey: forKey });
            return;
        }
        void onInferCast(col).then((res) => {
            // 按【稳定派发号 castSeq】在最新数组里重定位目标,而非信任派发时下标 idx:推断在途时删除
            // 前置值会让目标值下标左移,按旧 idx 回填会写错槽/落空,导致幸存值永卡 pending(复审 P2)。
            // castSeq 全局单调唯一,只有本次派发的那个值带它;更晚派发会覆盖其 castSeq,故 findIndex 落空即丢。
            const at = valuesRef.current.findIndex((v) => v.castSeq === seq);
            if (at < 0) return; // 值已删除,或已被更晚派发取代
            const cur = valuesRef.current[at];
            // 再校验:换列、上下文已变(forKey 过期)、被用户手填覆盖、已不再需要 cast(切回 COUNT/数值列)
            if (cur.column !== col) return;
            if (forKey !== (contextKeyRef.current ?? '')) return;
            if (cur.castSource !== 'inferred') return;
            if (!needsTextCast(cur)) return;
            if (res && res.recommended) {
                updateValueAt(at, {
                    typeConversion: res.recommended, castStatus: undefined,
                    castSource: 'inferred', castContextKey: forKey,
                });
                showSuccessToast(t, undefined, t("query.pivot.textCastRecommended", {
                    column: col, cast: res.recommended,
                }));
            } else {
                // 无法安全推断:要求显式选择。按后端 reason 给出【可操作】提示——
                // 二进制浮点/科学计数法/超容量各有不同处置,通用文案(还带 count=0)会误导。
                updateValueAt(at, {
                    typeConversion: undefined, castStatus: 'unsafe',
                    castSource: 'inferred', castContextKey: forKey,
                });
                const reasonKey: Record<string, string> = {
                    non_numeric: "query.pivot.textCastUnsafeNonNumeric",
                    binary_float: "query.pivot.textCastUnsafeBinaryFloat",
                    scientific: "query.pivot.textCastUnsafeScientific",
                    overflow: "query.pivot.textCastUnsafeOverflow",
                };
                const key = (res?.reason && reasonKey[res.reason]) || "query.pivot.textCastUnsafe";
                showErrorToast(t, undefined, t(key, {
                    column: col, count: res?.non_numeric ?? 0,
                }));
            }
        });
    };

    const handleUpdateValueAgg = (idx: number, agg: AggregationFunction) => {
        const col = values[idx].column;
        const needsNumericCast =
            !isFieldNumeric(col) &&
            (agg === AggregationFunction.SUM || agg === AggregationFunction.AVG);
        if (!needsNumericCast) {
            // 数值列 / COUNT 等:无需转换,清掉 typeConversion 与所有 cast 状态/来源
            updateValueAt(idx, {
                aggregation: agg, typeConversion: undefined, castStatus: undefined,
                castSource: undefined, castContextKey: undefined,
            });
            return;
        }
        // 文本列 SUM/AVG:不落任何固定默认(固定 scale 会舍入假匹配),在当前上下文数据上数据感知推断。
        updateValueAt(idx, { aggregation: agg });
        inferCastFor(idx, col, contextKeyRef.current ?? '');
    };

    // 上下文变化(切表 / 换同名异连接表 / 改筛选):对【系统推断且上下文键已过期】的文本 SUM/AVG 值
    // 重新推断(手填的 manual 值不动)。修复:先在小范围数据上推出 DECIMAL(38,2)、再扩大筛选到含
    // 3 位小数的数据时,旧标度会把 1.234 静默舍成 1.23——须随上下文键变化重推。仅依赖 inferenceContextKey。
    React.useEffect(() => {
        const key = inferenceContextKey ?? '';
        valuesRef.current.forEach((v, idx) => {
            if (v.castSource !== 'inferred') return;
            if (v.castContextKey === key) return;
            if (!needsTextCast(v)) return;
            inferCastFor(idx, v.column, key);
        });
        // inferCastFor/needsTextCast 依赖当前 render 闭包,仅在上下文键变化时触发即可
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [inferenceContextKey]);

    // 值 chip 上的可编辑 cast 输入:用户手填即 manual 显式选择(清除 pending/unsafe,筛选变化不再覆盖)。
    // 清空时:文本列仍是 SUM/AVG 则须保持 unsafe 挡住——否则后端收到没有 TRY_CAST 的文本 SUM/AVG,
    // 生成 SUM(VARCHAR) 触发 Binder Error(Codex P2)。仅当聚合无需数值转换时才可真正清空放行。
    const handleUpdateValueCast = (idx: number, cast: string) => {
        const trimmed = cast.trim();
        if (trimmed) {
            updateValueAt(idx, {
                typeConversion: trimmed, castStatus: undefined,
                castSource: 'manual', castContextKey: undefined,
            });
            return;
        }
        const cur = valuesRef.current[idx];
        const stillNeeds = !!cur && needsTextCast(cur);
        updateValueAt(idx, {
            typeConversion: undefined,
            castStatus: stillNeeds ? 'unsafe' : undefined,
            castSource: undefined, castContextKey: undefined,
        });
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
                        {t("query.pivot.availableFields", "可用字段")}
                    </div>
                    <div className="flex flex-wrap gap-1.5 min-h-[32px]">
                        {isLoading ? (
                            <span className="text-xs text-muted-foreground">{t("common.loading", "加载中...")}</span>
                        ) : paletteFields.length === 0 && availableFields.length > 0 ? (
                            <span className="text-xs text-muted-foreground">{t("query.pivot.allFieldsConfigured", "所有字段已配置")}</span>
                        ) : paletteFields.length === 0 ? (
                            <span className="text-xs text-muted-foreground">{t("query.pivot.selectTableHint", "请先选择数据表")}</span>
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
                        title={t("query.pivot.rows", "行字段")}
                        icon={<Rows3 className="h-3.5 w-3.5" />}
                        placeholder={t("query.pivot.dropRowHint", "拖入行分组字段")}
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
                        title={t("query.pivot.columns", "透视列")}
                        icon={<Columns3 className="h-3.5 w-3.5" />}
                        placeholder={t("query.pivot.dropColumnHint", "拖入透视列字段")}
                        badge={t("query.pivot.maxOne", "限1个")}
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
                        title={t("query.pivot.values", "聚合值")}
                        icon={<Calculator className="h-3.5 w-3.5" />}
                        placeholder={t("query.pivot.dropValueHint", "拖入聚合值字段")}
                    >
                        {values.map((v, i) => (
                            <ConfiguredField
                                key={`value-${v.column}-${i}`}
                                id={`value-${v.column}-${i}`}
                                label={`${v.aggregation.toUpperCase()}(${v.column})`}
                                type="value"
                                onRemove={() => handleRemoveValue(i)}
                                extra={
                                    <div className="flex items-center gap-1">
                                        <AggDropdown
                                            value={v.aggregation}
                                            onChange={(agg) => handleUpdateValueAgg(i, agg)}
                                        />
                                        {v.castStatus === 'pending' && (
                                            <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                                                {t("query.pivot.castInferring", "推断中…")}
                                            </span>
                                        )}
                                        {(v.typeConversion !== undefined || v.castStatus === 'unsafe') && (
                                            <input
                                                // key 随 typeConversion/状态 变:异步推荐到达时重挂显示新值
                                                key={`cast-${i}-${v.typeConversion ?? v.castStatus}`}
                                                className={
                                                    "w-28 text-[11px] px-1 py-0.5 rounded border bg-background text-foreground " +
                                                    (v.castStatus === 'unsafe' ? "border-destructive" : "border-border")
                                                }
                                                defaultValue={v.typeConversion ?? ''}
                                                placeholder={v.castStatus === 'unsafe'
                                                    ? t("query.pivot.castPickType", "请选类型")
                                                    : "DECIMAL(38,2)"}
                                                title={t("query.pivot.castTypeHint", "聚合前的类型转换(可手填,如 DECIMAL(38,2);留空取消)")}
                                                onBlur={(e) => handleUpdateValueCast(i, e.target.value)}
                                                onKeyDown={(e) => {
                                                    if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                                                }}
                                            />
                                        )}
                                    </div>
                                }
                            />
                        ))}
                    </DropZone>
                </div>

                {/* Preview Table - 更好地体现三个配置区域 */}
                {hasConfig && (
                    <div className="border border-border rounded-lg overflow-hidden">
                        <div className="bg-muted/30 px-3 py-2 border-b border-border text-xs font-medium text-muted-foreground flex items-center justify-between">
                            <span>{t("query.pivot.tablePreview", "表格结构预览")}</span>
                            {columns.length > 0 && values.length > 0 && (
                                <span className="text-xs text-purple-500 dark:text-purple-400">
                                    {t("query.pivot.pivotMode", "透视模式")}: [{columns[0]}] → {values.map(v => `${v.aggregation}(${v.column})`).join(", ")}
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
                                                className="border-b border-r border-border px-3 py-1.5 text-left text-xs text-muted-foreground"
                                                colSpan={rows.length || 1}
                                            >
                                                {t("query.pivot.rowDimension", "行维度")}
                                            </th>
                                            <th
                                                className="border-b border-border px-3 py-1.5 text-center text-xs text-purple-600 dark:text-purple-400"
                                                colSpan={3}
                                            >
                                                ← {t("query.pivot.pivotColumnValues", "透视列")}: <strong>{columns[0]}</strong> {t("query.pivot.uniqueValues", "的唯一值")} →
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
                                                ({t("query.pivot.noRows", "无行字段")})
                                            </th>
                                        )}
                                        {/* Column headers */}
                                        {columns.length > 0 ? (
                                            // 透视模式：显示透视列的预览值 + 聚合函数
                                            <>
                                                <th className="border-b border-border px-3 py-2 text-center font-medium text-purple-600 dark:text-purple-400">
                                                    [{columns[0]}]=A<br />
                                                    <span className="text-xs text-green-600 dark:text-green-400">{values.map(v => v.aggregation.toUpperCase()).join("/")}</span>
                                                </th>
                                                <th className="border-b border-border px-3 py-2 text-center font-medium text-purple-600 dark:text-purple-400">
                                                    [{columns[0]}]=B<br />
                                                    <span className="text-xs text-green-600 dark:text-green-400">{values.map(v => v.aggregation.toUpperCase()).join("/")}</span>
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
                                                ({t("query.pivot.noValues", "无聚合值")})
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
                                                <td className="border-border px-3 py-2 text-center text-green-600 dark:text-green-400">123</td>
                                                <td className="border-border px-3 py-2 text-center text-green-600 dark:text-green-400">456</td>
                                                <td className="border-border px-3 py-2 text-center">...</td>
                                            </>
                                        ) : values.length > 0 ? (
                                            values.map((_, i) => (
                                                <td key={i} className="border-border px-3 py-2 text-center text-green-600 dark:text-green-400">123</td>
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
                                                <td className="border-t border-border px-3 py-2 text-center text-green-600 dark:text-green-400">789</td>
                                                <td className="border-t border-border px-3 py-2 text-center text-green-600 dark:text-green-400">101</td>
                                                <td className="border-t border-border px-3 py-2 text-center">...</td>
                                            </>
                                        ) : values.length > 0 ? (
                                            values.map((_, i) => (
                                                <td key={i} className="border-t border-border px-3 py-2 text-center text-green-600 dark:text-green-400">456</td>
                                            ))
                                        ) : (
                                            <td className="border-t border-border px-3 py-2 text-center">-</td>
                                        )}
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                        <div className="bg-muted/20 px-3 py-1.5 border-t border-border text-xs text-muted-foreground">
                            {columns.length > 0
                                ? t("query.pivot.previewHintPivot", "透视表预览：[透视列]的每个唯一值将成为单独的列")
                                : t("query.pivot.previewHint", "聚合查询预览：按行字段分组后计算聚合值")}
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
