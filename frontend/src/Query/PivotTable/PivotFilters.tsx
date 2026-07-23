/**
 * 透视表简单筛选（列 / 操作符 / 值）→ PivotQueryConfig.filters
 */

import * as React from "react";
import { useTranslation } from "react-i18next";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import type { FilterConfig } from "@/types/pivotQuery";
import { parseNumericPreservingPrecision } from "@/Query/JoinQuery/FilterBar/filterUtils";

const OPERATORS = [
    { value: "=", labelKey: "query.filter.operators.eq" },
    { value: "!=", labelKey: "query.filter.operators.neq" },
    { value: ">", labelKey: "query.filter.operators.gt" },
    { value: ">=", labelKey: "query.filter.operators.gte" },
    { value: "<", labelKey: "query.filter.operators.lt" },
    { value: "<=", labelKey: "query.filter.operators.lte" },
    { value: "LIKE", labelKey: "query.filter.operators.like" },
    { value: "IS NULL", labelKey: "query.filter.operators.isNull" },
    { value: "IS NOT NULL", labelKey: "query.filter.operators.isNotNull" },
] as const;

export interface PivotFilterRow {
    id: string;
    column: string;
    operator: string;
    value: string;
}

function toApiFilters(rows: PivotFilterRow[]): FilterConfig[] {
    return rows
        .filter((r) => r.column.trim())
        .map((r) => {
            const op = r.operator;
            if (op === "IS NULL" || op === "IS NOT NULL") {
                return { column: r.column.trim(), operator: op, value: null };
            }
            const raw = r.value.trim();
            // 仅精确往返才转 number,否则保留字符串(避免大整数/高精度筛选值丢精度)
            const asNumber = parseNumericPreservingPrecision(raw);
            return {
                column: r.column.trim(),
                operator: op,
                value: raw === "" ? null : asNumber,
            };
        });
}

export function pivotFiltersToApi(rows: PivotFilterRow[]): FilterConfig[] {
    return toApiFilters(rows);
}

interface PivotFiltersProps {
    columnNames: string[];
    filters: PivotFilterRow[];
    onChange: (filters: PivotFilterRow[]) => void;
    disabled?: boolean;
}

export const PivotFilters: React.FC<PivotFiltersProps> = ({
    columnNames,
    filters,
    onChange,
    disabled = false,
}) => {
    const { t } = useTranslation("common");

    const addRow = () => {
        onChange([
            ...filters,
            {
                id: `f-${Date.now()}-${filters.length}`,
                column: columnNames[0] ?? "",
                operator: "=",
                value: "",
            },
        ]);
    };

    const updateRow = (id: string, patch: Partial<PivotFilterRow>) => {
        onChange(filters.map((row) => (row.id === id ? { ...row, ...patch } : row)));
    };

    const removeRow = (id: string) => {
        onChange(filters.filter((row) => row.id !== id));
    };

    return (
        <div className="space-y-2 rounded-xl border border-border bg-muted/20 p-3">
            <div className="flex items-center justify-between gap-2">
                <Label className="text-sm font-medium">
                    {t("query.pivot.filters", "筛选")}
                </Label>
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1"
                    onClick={addRow}
                    disabled={disabled || columnNames.length === 0}
                >
                    <Plus className="h-3.5 w-3.5" />
                    {t("query.pivot.addFilter", "添加条件")}
                </Button>
            </div>

            {filters.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                    {t("query.pivot.filtersEmpty", "可选：限制透视前的行（WHERE）")}
                </p>
            ) : (
                <ul className="space-y-2">
                    {filters.map((row) => {
                        const needsValue =
                            row.operator !== "IS NULL" && row.operator !== "IS NOT NULL";
                        return (
                            <li
                                key={row.id}
                                className="flex flex-wrap items-end gap-2 rounded-lg border border-border bg-background p-2"
                            >
                                <div className="min-w-[120px] flex-1 space-y-1">
                                    <Label className="text-xs text-muted-foreground">
                                        {t("query.pivot.filterColumn", "列")}
                                    </Label>
                                    <Select
                                        value={row.column}
                                        onValueChange={(v) => updateRow(row.id, { column: v })}
                                        disabled={disabled}
                                    >
                                        <SelectTrigger className="h-8">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {columnNames.map((name) => (
                                                <SelectItem key={name} value={name}>
                                                    {name}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="min-w-[100px] space-y-1">
                                    <Label className="text-xs text-muted-foreground">
                                        {t("query.pivot.filterOperator", "操作符")}
                                    </Label>
                                    <Select
                                        value={row.operator}
                                        onValueChange={(v) => updateRow(row.id, { operator: v })}
                                        disabled={disabled}
                                    >
                                        <SelectTrigger className="h-8">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {OPERATORS.map((op) => (
                                                <SelectItem key={op.value} value={op.value}>
                                                    {t(op.labelKey, op.value)}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                {needsValue ? (
                                    <div className="min-w-[120px] flex-1 space-y-1">
                                        <Label className="text-xs text-muted-foreground">
                                            {t("query.pivot.filterValue", "值")}
                                        </Label>
                                        <Input
                                            className="h-8"
                                            value={row.value}
                                            onChange={(e) =>
                                                updateRow(row.id, { value: e.target.value })
                                            }
                                            disabled={disabled}
                                        />
                                    </div>
                                ) : null}
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 shrink-0"
                                    onClick={() => removeRow(row.id)}
                                    disabled={disabled}
                                    aria-label={t("query.filter.action.remove", "删除")}
                                >
                                    <X className="h-4 w-4" />
                                </Button>
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
};
