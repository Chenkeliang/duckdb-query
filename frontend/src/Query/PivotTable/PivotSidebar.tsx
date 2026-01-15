import * as React from "react";
import { useTranslation } from "react-i18next";
import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Table2, Search } from "lucide-react";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { useDuckDBTables } from "@/hooks/useDuckDBTables";
import { useTableColumns } from "@/hooks/useTableColumns";
import { SelectedTable } from "@/types/SelectedTable";
import { normalizeSelectedTable } from "@/utils/tableUtils";

interface PivotSidebarProps {
    selectedTable: SelectedTable | null;
    onTableSelect: (table: SelectedTable) => void;
}

// Draggable Field Item
const DraggableField = ({ field, type }: { field: string; type: string }) => {
    const { attributes, listeners, setNodeRef, transform } = useDraggable({
        id: `field-${field}`,
        data: { field, type, isField: true }
    });

    const style = {
        transform: CSS.Translate.toString(transform),
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            {...listeners}
            {...attributes}
            className="flex items-center gap-2 p-2 rounded-md hover:bg-muted/50 cursor-grab active:cursor-grabbing border border-transparent hover:border-border transition-colors text-sm"
        >
            <GripVertical className="h-4 w-4 text-muted-foreground/50" />
            <span className="flex-1 truncate font-medium">{field}</span>
            <Badge variant="outline" className="text-[10px] h-5 px-1.5 font-normal text-muted-foreground">
                {type}
            </Badge>
        </div>
    );
};

export const PivotSidebar: React.FC<PivotSidebarProps> = ({
    selectedTable,
    onTableSelect,
}) => {
    const { t } = useTranslation("pivot");
    const { tables: duckdbTables } = useDuckDBTables();
    const [searchTerm, setSearchTerm] = React.useState("");

    // Get columns for selected table
    const { columns, isLoading } = useTableColumns(selectedTable);

    // Filter columns
    const filteredColumns = React.useMemo(() => {
        if (!columns) return [];
        return columns.filter(c =>
            c.name.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [columns, searchTerm]);

    // Simplify table selection to just DuckDB tables for V1
    const handleTableChange = (tableName: string) => {
        const table = duckdbTables.find(t => t.name === tableName);
        if (table) {
            onTableSelect(table); // SelectedTable interface match
        }
    };

    return (
        <div className="flex flex-col h-full border-r bg-card">
            <div className="p-4 space-y-4 border-b">
                <div className="space-y-2">
                    <label className="text-sm font-medium text-muted-foreground">
                        {t("pivot.dataSource", "数据源")}
                    </label>
                    <Select
                        value={selectedTable ? selectedTable.name : ""}
                        onValueChange={handleTableChange}
                    >
                        <SelectTrigger>
                            <SelectValue placeholder="选择数据表" />
                        </SelectTrigger>
                        <SelectContent>
                            {duckdbTables.map((table) => (
                                <SelectItem key={table.name} value={table.name}>
                                    <div className="flex items-center gap-2">
                                        <Table2 className="h-4 w-4 text-muted-foreground" />
                                        <span>{table.name}</span>
                                    </div>
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                {selectedTable && (
                    <div className="relative">
                        <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder={t("pivot.search", "搜索字段...")}
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="pl-8 h-9"
                        />
                    </div>
                )}
            </div>

            <div className="flex-1 overflow-hidden">
                {!selectedTable ? (
                    <div className="h-full flex flex-col items-center justify-center p-4 text-center text-muted-foreground text-sm">
                        <Table2 className="h-10 w-10 mb-2 opacity-20" />
                        <p>{t("pivot.empty", "请先选择数据表")}</p>
                    </div>
                ) : isLoading ? (
                    <div className="p-4 text-sm text-muted-foreground">Loading schema...</div>
                ) : (
                    <ScrollArea className="h-full">
                        <div className="p-2 space-y-0.5">
                            {filteredColumns.map((col) => (
                                <DraggableField key={col.name} field={col.name} type={col.type} />
                            ))}
                            {filteredColumns.length === 0 && (
                                <div className="p-4 text-center text-xs text-muted-foreground">
                                    未找到字段
                                </div>
                            )}
                        </div>
                    </ScrollArea>
                )}
            </div>
        </div>
    );
};
