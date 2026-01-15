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
    defaultDropAnimationSideEffects,
    DropAnimation,
} from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import { createPortal } from "react-dom";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { Loader2, Play } from "lucide-react";
import { Button } from "@/components/ui/button";

// Import Components
import { PivotSidebar } from "./PivotTable/PivotSidebar";
import { PivotConfigArea } from "./PivotTable/PivotConfigArea";
import { DataGrid, ColumnDef } from "./DataGrid";

// Import Hooks & Types
import { usePivotQuery } from "@/hooks/usePivotQuery";
import { SelectedTable } from "@/types/SelectedTable";
import { PivotValueConfig, AggregationFunction, PivotConfig } from "@/types/visualQuery";
import { getTableName } from "@/utils/tableUtils";

export const PivotWorkbench: React.FC = () => {
    const { t } = useTranslation(["pivot", "common"]);

    // State
    const [selectedTable, setSelectedTable] = React.useState<SelectedTable | null>(null);
    const [rows, setRows] = React.useState<string[]>([]);
    const [columns, setColumns] = React.useState<string[]>([]);
    const [values, setValues] = React.useState<PivotValueConfig[]>([]);
    const [activeId, setActiveId] = React.useState<string | null>(null);
    const [activeItemData, setActiveItemData] = React.useState<any>(null);

    // Queries
    const pivotConfig: PivotConfig = React.useMemo(() => ({
        rows,
        columns,
        values,
    }), [rows, columns, values]);

    const config = React.useMemo(() => ({
        table_name: selectedTable ? getTableName(selectedTable) : "",
        // We can add filters here later
    }), [selectedTable]);

    // Data Fetching (Use Preview API)
    const { data, isFetching, error, refetch } = usePivotQuery({
        config,
        pivotConfig,
        enabled: false, // User must click run
    });

    // Sensors
    const sensors = useSensors(
        useSensor(MouseSensor, {
            activationConstraint: { distance: 10 },
        }),
        useSensor(TouchSensor)
    );

    // Handlers
    const handleDragStart = (event: DragStartEvent) => {
        setActiveId(event.active.id as string);
        setActiveItemData(event.active.data.current);
    };

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        setActiveId(null);
        setActiveItemData(null);

        // dropped outside
        if (!over) return;

        const activeType = active.data.current?.isField ? "field" : "config-item";
        const overId = over.id as string;

        // Helper to find which zone the 'over' target belongs to
        const findZone = (id: string): "rows" | "columns" | "values" | null => {
            if (id === "zone-rows" || rows.includes(id)) return "rows";
            if (id === "zone-columns" || columns.includes(id)) return "columns";
            // Constructing values ID checks. Values IDs are composite, but we check prefix or direct zone.
            // Simple check: if id is zone-values.
            if (id === "zone-values") return "values";
            // Check if id matches any value ID (complex)
            if (values.some((v, i) => `${v.column}-${i}` === id)) return "values";
            return null;
        };

        const targetZone = findZone(overId);

        // Case 1: Dragging NEW field from Sidebar
        if (activeType === "field" && targetZone) {
            const fieldName = active.data.current?.field;
            if (!fieldName) return;

            if (targetZone === "rows" && !rows.includes(fieldName)) {
                setRows([...rows, fieldName]);
            } else if (targetZone === "columns" && !columns.includes(fieldName)) {
                setColumns([...columns, fieldName]);
            } else if (targetZone === "values") {
                // Values can have duplicates (different aggs), so we just add
                setValues([
                    ...values,
                    { column: fieldName, aggregation: AggregationFunction.SUM }
                ]);
            }
            return;
        }

        // Case 2: Reordering or Moving existing items
        if (activeType === "config-item") {
            // Identify source zone based on active.id
            const sourceZone = findZone(active.id as string);

            if (!sourceZone || !targetZone) return; // Should not happen if logic is correct

            // Same Zone Reorder
            if (sourceZone === targetZone) {
                if (sourceZone === "rows") {
                    const oldIndex = rows.indexOf(active.id as string);
                    const newIndex = rows.indexOf(overId);
                    if (oldIndex !== newIndex && newIndex !== -1) setRows(arrayMove(rows, oldIndex, newIndex));
                } else if (sourceZone === "columns") {
                    const oldIndex = columns.indexOf(active.id as string);
                    const newIndex = columns.indexOf(overId);
                    if (oldIndex !== newIndex && newIndex !== -1) setColumns(arrayMove(columns, oldIndex, newIndex));
                } else if (sourceZone === "values") {
                    // Values IDs are generated strings in rendering, but active.id is passed from SortableItem
                    // We need to re-find indices.
                    const currentIds = values.map((v, i) => `${v.column}-${i}`);
                    const oldIndex = currentIds.indexOf(active.id as string);
                    const newIndex = currentIds.indexOf(overId);
                    if (oldIndex !== newIndex && newIndex !== -1) setValues(arrayMove(values, oldIndex, newIndex));
                }
            }
            // Move between zones (simplified: remove from source, add to target)
            else {
                // Remove from source
                let fieldName = "";
                if (sourceZone === "rows") {
                    fieldName = active.id as string;
                    setRows(rows.filter(r => r !== fieldName));
                } else if (sourceZone === "columns") {
                    fieldName = active.id as string;
                    setColumns(columns.filter(c => c !== fieldName));
                } else if (sourceZone === "values") {
                    // Determine field name from value object
                    const currentIds = values.map((v, i) => `${v.column}-${i}`);
                    const idx = currentIds.indexOf(active.id as string);
                    if (idx !== -1) {
                        fieldName = values[idx].column;
                        setValues(values.filter((_, i) => i !== idx));
                    }
                }

                // Add to target
                if (fieldName) {
                    if (targetZone === "rows" && !rows.includes(fieldName)) setRows(prev => [...prev, fieldName]);
                    if (targetZone === "columns" && !columns.includes(fieldName)) setColumns(prev => [...prev, fieldName]);
                    if (targetZone === "values") setValues(prev => [...prev, { column: fieldName, aggregation: AggregationFunction.SUM }]);
                }
            }
        }

    };

    // Remove Handlers
    const handleRemoveRow = (id: string) => setRows(rows.filter(r => r !== id));
    const handleRemoveCol = (id: string) => setColumns(columns.filter(c => c !== id));
    const handleRemoveValue = (id: string) => {
        // id is "column-index"
        const currentIds = values.map((v, i) => `${v.column}-${i}`);
        const idx = currentIds.indexOf(id);
        if (idx !== -1) setValues(values.filter((_, i) => i !== idx));
    };

    const handleUpdateValueAgg = (id: string, agg: AggregationFunction) => {
        const currentIds = values.map((v, i) => `${v.column}-${i}`);
        const idx = currentIds.indexOf(id);
        if (idx !== -1) {
            const newValues = [...values];
            newValues[idx] = { ...newValues[idx], aggregation: agg };
            setValues(newValues);
        }
    };

    const handleRun = () => {
        if (selectedTable && (rows.length > 0 || columns.length > 0 || values.length > 0)) {
            refetch();
        }
    };

    const dropAnimation: DropAnimation = {
        sideEffects: defaultDropAnimationSideEffects({
            styles: {
                active: { opacity: "0.5" },
            },
        }),
    };

    // Render Overlay Item
    const renderOverlay = () => {
        if (!activeId) return null;
        // If dragging a field from sidebar
        if (activeItemData?.isField) {
            return (
                <div className="flex items-center gap-2 p-2 rounded-md bg-background border shadow-lg w-40 opacity-80 cursor-grabbing">
                    <span className="font-medium text-sm">{activeItemData.field}</span>
                </div>
            );
        }
        return (
            <div className="flex items-center gap-2 p-2 rounded-md bg-primary/20 border border-primary text-primary shadow-lg cursor-grabbing">
                <span className="font-medium text-sm">{activeId}</span>
            </div>
        );
    };

    // Prepare DataGrid columns
    const gridColumns = React.useMemo<ColumnDef[]>(() => {
        return (data?.columns || []).map(col => ({
            field: col,
            headerName: col,
            // Optional: formatting based on type if available
        }));
    }, [data?.columns]);

    return (
        <DndContext
            sensors={sensors}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
        // onDragOver={handleDragOver} // Add if needed for better visual feedback
        >
            <div className="h-full w-full bg-background overflow-hidden flex flex-col">
                <PanelGroup direction="horizontal">
                    {/* Sidebar */}
                    <Panel defaultSize={20} minSize={15} maxSize={30}>
                        <PivotSidebar selectedTable={selectedTable} onTableSelect={setSelectedTable} />
                    </Panel>

                    <PanelResizeHandle className="w-1 bg-border hover:bg-primary/50 transition-colors" />

                    {/* Main Content */}
                    <Panel>
                        <div className="h-full flex flex-col">
                            {/* Top: Config Area */}
                            <div className="flex-none bg-muted/10 p-2">
                                <PivotConfigArea
                                    rows={rows}
                                    columns={columns}
                                    values={values}
                                    onRemoveRow={handleRemoveRow}
                                    onRemoveColumn={handleRemoveCol}
                                    onRemoveValue={handleRemoveValue}
                                    onUpdateValueAgg={handleUpdateValueAgg}
                                />
                            </div>

                            {/* Action Bar */}
                            <div className="flex items-center justify-between px-4 py-2 border-b">
                                <div className="text-sm text-muted-foreground">
                                    {data ? `${data.row_count} rows found` : "Configure and run to see results"}
                                    {data?.estimated_time ? ` (${data.estimated_time.toFixed(3)}s)` : ""}
                                </div>
                                <Button onClick={handleRun} disabled={!selectedTable || isFetching} size="sm">
                                    {isFetching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
                                    {t("pivot.run", "Run Analysis")}
                                </Button>
                            </div>

                            {/* Bottom: Result Grid */}
                            <div className="flex-1 overflow-hidden relative">
                                {error && (
                                    <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/80">
                                        <div className="text-destructive font-medium p-4 border border-destructive/20 bg-destructive/10 rounded-md">
                                            Error: {(error as Error).message}
                                        </div>
                                    </div>
                                )}

                                {/* We reuse DataGrid. We need to adapt data structure if necessary. 
                                PreviewResponse returns: data: any[], columns: string[]
                            */}
                                {data && data.data && (
                                    <DataGrid
                                        data={data.data}
                                        columns={gridColumns}
                                        loading={isFetching}
                                    // Removed rowCount prop if not supported (DataGridProps didn't show it, only onStatsChange)
                                    // But data.row_count is shown in summary.
                                    />
                                )}
                                {!data && !isFetching && (
                                    <div className="h-full flex items-center justify-center text-muted-foreground">
                                        {t("pivot.empty", "Select data and arrange fields to generate pivot table.")}
                                    </div>
                                )}
                            </div>
                        </div>
                    </Panel>
                </PanelGroup>

                {createPortal(
                    <DragOverlay dropAnimation={dropAnimation}>
                        {renderOverlay()}
                    </DragOverlay>,
                    document.body
                )}
            </div>
        </DndContext>
    );
};

export default PivotWorkbench;
