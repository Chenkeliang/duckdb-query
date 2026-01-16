import * as React from "react";
import { useTranslation } from "react-i18next";
import { useDroppable } from "@dnd-kit/core";
import {
    SortableContext,
    useSortable,
    horizontalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { X, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { PivotValueConfig, AggregationFunction } from "@/types/visualQuery";

// Props for the main area
interface PivotConfigAreaProps {
    rows: string[];
    columns: string[];
    values: PivotValueConfig[];
    onRemoveRow: (id: string) => void;
    onRemoveColumn: (id: string) => void;
    onRemoveValue: (id: string) => void;
    onUpdateValueAgg: (id: string, agg: AggregationFunction) => void;
}

// Check design.md: Values array contains objects. Row/Col are strings.
// For Sortable to work, we need unique IDs.
// For Row/Col, the column name is the ID.
// For Values, we might have multiple aggregations of same column, so we need unique ID in PivotValueConfig?
// In our type definition, PivotValueConfig doesn't have ID. We should probably use index or add temp ID.
// For simplicity V1: Let's assume column name is unique in Rows/Columns.
// For Values, we'll generate an ID combination: "col-agg".

// Component: A Single Sortable Item Tag
const SortableItem = ({
    id,
    label,
    onRemove,
    type = "default",
    extra,
}: {
    id: string;
    label: string;
    onRemove: () => void;
    type?: "default" | "value";
    extra?: React.ReactNode;
}) => {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id });

    const style = {
        transform: CSS.Translate.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            {...attributes}
            {...listeners}
            className={`
        flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium border cursor-move select-none animate-in fade-in zoom-in-95 duration-200
        ${type === "value"
                    ? "bg-green-500/10 text-green-700 border-green-200 dark:bg-green-500/20 dark:text-green-300 dark:border-green-800"
                    : "bg-blue-500/10 text-blue-700 border-blue-200 dark:bg-blue-500/20 dark:text-blue-300 dark:border-blue-800"}
      `}
        >
            <span>{label}</span>
            {extra}
            <button
                type="button"
                onPointerDown={(e) => {
                    e.stopPropagation(); // prevent drag start
                }}
                onClick={(e) => {
                    e.stopPropagation();
                    onRemove();
                }}
                className="hover:bg-black/10 dark:hover:bg-white/10 rounded p-0.5"
            >
                <X className="h-3 w-3" />
            </button>
        </div>
    );
};

// Component: Drop Zone Container
const DropZone = ({
    id,
    title,
    items,
    children,
    placeholder
}: {
    id: string;
    title: string;
    items: string[];
    children: React.ReactNode;
    placeholder?: string;
}) => {
    const { setNodeRef, isOver } = useDroppable({ id });

    return (
        <div className="flex-1 flex flex-col gap-2 min-w-[200px]">
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                {title}
                <Badge variant="outline" className="text-[10px] h-4 px-1">{items.length}</Badge>
            </div>
            <div
                ref={setNodeRef}
                className={`
          flex-1 flex flex-wrap content-start gap-2 p-3 rounded-lg border-2 border-dashed transition-colors min-h-[80px]
          ${isOver ? "border-primary bg-primary/5" : "border-border/50 hover:border-border bg-muted/20"}
        `}
            >
                {children}
                {items.length === 0 && (
                    <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground/40 pointer-events-none">
                        {placeholder || "Drag fields here"}
                    </div>
                )}
            </div>
        </div>
    );
};

export const PivotConfigArea: React.FC<PivotConfigAreaProps> = ({
    rows,
    columns,
    values,
    onRemoveRow,
    onRemoveColumn,
    onRemoveValue,
    onUpdateValueAgg,
}) => {
    const { t } = useTranslation("pivot");

    // Helper to render value item extra (agg dropdown)
    const renderAggDropdown = (val: PivotValueConfig, idx: number) => {
        // We construct a unique ID for the sortable context: `value-${val.column}-${idx}`
        // But for this simple implementation we pass the actual ID used in dnd context
        return (
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-4 w-4 p-0 ml-1 hover:bg-black/5 rounded-full"
                        onPointerDown={(e) => e.stopPropagation()} // Prevent drag
                    >
                        <ChevronDown className="h-3 w-3 opacity-50" />
                        <span className="sr-only">Agg</span>
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                    {Object.values(AggregationFunction).map((agg) => (
                        <DropdownMenuItem
                            key={agg}
                            onClick={() => onUpdateValueAgg(`${val.column}-${idx}`, agg)}
                        >
                            {agg.toUpperCase()}
                        </DropdownMenuItem>
                    ))}
                </DropdownMenuContent>
            </DropdownMenu>
        );
    };

    return (
        <div className="flex gap-4 p-4 border-b bg-background/50 backdrop-blur-sm z-10 sticky top-0">

            {/* Rows Zone */}
            <SortableContext id="rows-context" items={rows} strategy={horizontalListSortingStrategy}>
                <DropZone id="zone-rows" title={t("pivot.rows", "Rows")} items={rows} placeholder={t("pivot.dropZone.rows")}>
                    {rows.map((row) => (
                        <SortableItem
                            key={row}
                            id={row}
                            label={row}
                            onRemove={() => onRemoveRow(row)}
                        />
                    ))}
                </DropZone>
            </SortableContext>

            {/* Columns Zone - 只支持单个透视列 */}
            <SortableContext id="cols-context" items={columns} strategy={horizontalListSortingStrategy}>
                <DropZone
                    id="zone-columns"
                    title={`${t("pivot.columns", "Columns")} (1 max)`}
                    items={columns}
                    placeholder={t("pivot.dropZone.columnsSingle", "拖入一个字段作为透视列 (仅支持单列)")}
                >
                    {columns.map((col) => (
                        <SortableItem
                            key={col}
                            id={col}
                            label={col}
                            onRemove={() => onRemoveColumn(col)}
                        />
                    ))}
                </DropZone>
            </SortableContext>

            {/* Values Zone */}
            {/* Note: Values are objects, but Sortable needs string IDs. We'll use a crafted ID. */}
            <SortableContext
                id="values-context"
                items={values.map((v, i) => `${v.column}-${i}`)}
                strategy={horizontalListSortingStrategy}
            >
                <DropZone id="zone-values" title={t("pivot.values", "Values")} items={values.map(v => v.column)} placeholder={t("pivot.dropZone.values")}>
                    {values.map((val, idx) => {
                        const id = `${val.column}-${idx}`;
                        return (
                            <SortableItem
                                key={id}
                                id={id}
                                label={`${val.aggregation.toUpperCase()}(${val.column})`}
                                type="value"
                                onRemove={() => onRemoveValue(id)}
                                extra={renderAggDropdown(val, idx)}
                            />
                        );
                    })}
                </DropZone>
            </SortableContext>
        </div>
    );
};
