import React, { useMemo, useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { invalidateAfterTableCreate } from "@/new/utils/cacheInvalidation";
import { Card, CardContent } from "@/new/components/ui/card";
import { Button } from "@/new/components/ui/button";
import { Input } from "@/new/components/ui/input";
import { Label } from "@/new/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/new/components/ui/select";
// 引用全局 Hooks
import { useSmartParse } from "@/new/hooks/useSmartParse";

interface DataPasteCardProps {
  onDataSourceSaved?: (dataSource: any) => void;
}

interface ParsedDataState {
  rows: string[][];
  preview: string[][];
  columns: number;
}

const DataPasteCard: React.FC<DataPasteCardProps> = ({ onDataSourceSaved }) => {
  const { t } = useTranslation("common");
  const queryClient = useQueryClient();
  const [pastedData, setPastedData] = useState("");
  const [parsedData, setParsedData] = useState<ParsedDataState | null>(null);
  const [tableName, setTableName] = useState("");
  const [columnNames, setColumnNames] = useState<string[]>([]);
  const [columnTypes, setColumnTypes] = useState<string[]>([]);

  // 使用新的智能解析 Hook
  const {
    results,
    selectedIndex,
    currentResult,
    parse,
    selectResult,
    isLoading,
    error: parseError,
  } = useSmartParse();

  const [delimiter, setDelimiter] = useState(","); // 仅用于手动覆盖
  const [hasHeader, setHasHeader] = useState(false);
  const [unifyAsString, setUnifyAsString] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const dataTypes = useMemo(
    () => [
      { value: "VARCHAR", label: t("page.datasource.paste.types.text") },
      { value: "INTEGER", label: t("page.datasource.paste.types.int") },
      { value: "DOUBLE", label: t("page.datasource.paste.types.float") },
      { value: "DATE", label: t("page.datasource.paste.types.date") },
      { value: "BOOLEAN", label: t("page.datasource.paste.types.bool") }
    ],
    [t]
  );

  // 辅助函数：推断数据类型
  const detectDataType = (values: any[]) => {
    const nonEmpty = values.filter(v => v && v.toString().trim() !== "");
    if (nonEmpty.length === 0) return "VARCHAR";
    const isInteger = nonEmpty.every(v => /^\d+$/.test(v.toString().trim()));
    if (isInteger) return "INTEGER";
    const isFloat = nonEmpty.every(v =>
      /^\d*\.?\d+$/.test(v.toString().trim())
    );
    if (isFloat) return "DOUBLE";
    const isDate = nonEmpty.every(v => !isNaN(Date.parse(v.toString().trim())));
    if (isDate) return "DATE";
    const isBool = nonEmpty.every(v =>
      ["true", "false", "1", "0", "yes", "no"].includes(
        v
          .toString()
          .toLowerCase()
          .trim()
      )
    );
    if (isBool) return "BOOLEAN";
    return "VARCHAR";
  };

  // 当解析结果更新时，处理数据（提取表头、推断类型）
  useEffect(() => {
    if (currentResult) {
      // 处理表头逻辑
      // currentResult.rows 是所有行。如果 hasHeader 为 true，第一行是表头
      const effectiveHasHeader = hasHeader || currentResult.hasHeader;
      let bodyRows = currentResult.rows;
      let extractedNames: string[] = [];

      if (effectiveHasHeader && bodyRows.length > 0) {
        extractedNames = bodyRows[0];
        bodyRows = bodyRows.slice(1);
      } else {
        // 生成默认列名
        extractedNames = Array.from({ length: currentResult.columns }, (_, i) =>
          t("page.datasource.paste.columnName", { index: i + 1 })
        );
      }

      setSuccess(t("page.datasource.paste.parseSuccess", {
        rows: bodyRows.length,
        cols: currentResult.columns
      }));
      setError("");

      setColumnNames(extractedNames);

      // 推断类型 (仅根据前 100 行推断以提高性能)
      const sampleRows = bodyRows.slice(0, 100);
      const inferTypes = Array.from({ length: currentResult.columns }, (_, colIdx) =>
        detectDataType(sampleRows.map(r => r[colIdx]))
      );
      setColumnTypes(inferTypes);

      setParsedData({
        rows: bodyRows,
        preview: bodyRows.slice(0, 5),
        columns: currentResult.columns
      });

      if (!tableName) {
        const ts = Date.now();
        setTableName(t("page.datasource.paste.defaultName", { timestamp: ts }));
      }

      // 同步分隔符显示（如果是分隔符策略）
      if (currentResult.delimiter) {
        setDelimiter(currentResult.delimiter);
      }
    }
  }, [currentResult, hasHeader, t]);

  // 监听 Hook 的错误
  useEffect(() => {
    if (parseError) {
      setError(parseError);
      setSuccess("");
      setParsedData(null);
    }
  }, [parseError]);


  const handleParse = () => {
    if (!pastedData.trim()) {
      const errorMsg = t("page.datasource.paste.error.noData");
      setError(errorMsg);
      toast.warning(errorMsg);
      return;
    }
    setError("");
    setSuccess("");
    // 调用智能解析
    parse(pastedData);
  };

  const saveToDatabase = async () => {
    if (!parsedData || !tableName.trim()) {
      setError(t("page.datasource.paste.save.needParse"));
      return;
    }
    if (columnNames.some(n => !n.trim())) {
      setError(t("page.datasource.paste.save.needColumns"));
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/paste-data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          table_name: tableName.trim(),
          column_names: columnNames,
          column_types: columnTypes,
          data_rows: parsedData.rows,
          delimiter: currentResult?.delimiter || delimiter,
          has_header: hasHeader || currentResult?.hasHeader
        })
      });
      const result = await res.json();
      if (result.success) {
        const successMsg = t("page.datasource.paste.save.saveOk", { table: tableName.trim() });
        setSuccess(successMsg);
        toast.success(successMsg);

        // 刷新数据源缓存，使左侧列表自动更新
        await invalidateAfterTableCreate(queryClient);

        onDataSourceSaved?.({
          id: tableName.trim(),
          name: tableName.trim(),
          sourceType: "duckdb",
          type: "table",
          columns: columnNames,
          columnCount: columnNames.length
        });
        clearForm();
      } else {
        const errorMsg = result.error ||
          result.message ||
          t("page.datasource.paste.save.saveFail");
        setError(errorMsg);
        toast.error(errorMsg);
      }
    } catch (err: any) {
      const errorMsg = t("page.datasource.paste.save.saveFailDetail", {
        message: err.message || ""
      });
      setError(errorMsg);
      toast.error(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  const clearForm = () => {
    setPastedData("");
    setParsedData(null);
    setTableName("");
    setColumnNames([]);
    setColumnTypes([]);
    setError("");
    setSuccess("");
    setHasHeader(false);
  };

  const updateColumnName = (idx: number, value: string) => {
    const next = [...columnNames];
    next[idx] = value;
    setColumnNames(next);
  };

  const updateColumnType = (idx: number, value: string) => {
    const next = [...columnTypes];
    next[idx] = value;
    setColumnTypes(next);
  };

  const toggleUnify = (checked: boolean) => {
    setUnifyAsString(checked);
    if (checked && columnTypes.length) {
      setColumnTypes(
        Array.from({ length: columnTypes.length }, () => "VARCHAR")
      );
    } else if (!checked && parsedData) {
      // 重新推断
      const sampleRows = parsedData.rows.slice(0, 100);
      const inferred = Array.from({ length: columnTypes.length }, (_, colIdx) =>
        detectDataType(sampleRows.map(r => r[colIdx]))
      );
      setColumnTypes(inferred);
    }
  };

  // 处理格式切换（当有多个解析结果时）
  const handleStrategyChange = (idxStr: string) => {
    const idx = parseInt(idxStr);
    selectResult(idx);
  };

  return (
    <div className="space-y-4">
      <Card className="shadow-sm">
        <CardContent className="p-4 space-y-4">
          <div className="space-y-2">
            <h3 className="text-base font-semibold text-foreground">
              {t("page.datasource.paste.title")}
            </h3>
            <p className="text-sm text-muted-foreground">
              {t("page.datasource.paste.subtitle")}
            </p>
          </div>

          {error ? (
            <div className="rounded-lg border border-error-border bg-error-bg px-3 py-2 text-sm text-error">
              {error}
            </div>
          ) : null}
          {success ? (
            <div className="rounded-lg border border-success-border bg-success-bg px-3 py-2 text-sm text-success">
              {success}
            </div>
          ) : null}

          <textarea
            className="min-h-[180px] w-full rounded-xl border-2 border-dashed border-border-subtle bg-surface px-3 py-3 text-sm font-mono text-foreground placeholder:text-muted-foreground focus:border-border focus:outline-none"
            value={pastedData}
            onChange={e => setPastedData(e.target.value)}
            placeholder={t("page.datasource.paste.placeholder")}
          />

          <div className="flex flex-wrap items-center gap-2">
            <Button
              onClick={handleParse}
              disabled={!pastedData.trim() || isLoading}
            >
              {isLoading ? "解析中..." : t("page.datasource.paste.btnParse")}
            </Button>
            <Button
              variant="outline"
              onClick={clearForm}
            >
              {t("page.datasource.paste.btnClear")}
            </Button>

            {/* 智能格式选择器 - 仅在解析后显示，替代原来的 "Format" 和 "Delimiter" */}
            {results.length > 0 && (
              <>
                <Label className="ml-2">
                  解析策略:
                </Label>
                <Select
                  value={selectedIndex.toString()}
                  onValueChange={handleStrategyChange}
                >
                  <SelectTrigger className="w-[180px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {results.map((res, idx) => (
                      <SelectItem key={idx} value={idx.toString()}>
                        {res.strategy} ({res.confidence}%)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </>
            )}

            <label className="inline-flex items-center gap-2 text-xs text-muted-foreground ml-auto">
              <input
                type="checkbox"
                checked={hasHeader || (currentResult?.hasHeader ?? false)}
                onChange={e => setHasHeader(e.target.checked)}
                className="accent-primary"
              />
              {t("page.datasource.paste.hasHeader")}
            </label>
          </div>
        </CardContent>
      </Card>

      {parsedData ? (
        <Card className="shadow-sm">
          <CardContent className="p-4 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="md:col-span-2 space-y-2">
                <Label htmlFor="table-name">
                  {t("page.datasource.paste.tableName")}
                </Label>
                <Input
                  id="table-name"
                  value={tableName}
                  onChange={e => setTableName(e.target.value)}
                  placeholder={t("page.datasource.paste.tableNamePlaceholder")}
                />
                <p className="text-[11px] text-muted-foreground">
                  {t("page.datasource.paste.tableNameHelper")}
                </p>
              </div>
              <div className="space-y-2">
                <label className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    className="accent-primary"
                    checked={unifyAsString}
                    onChange={e => toggleUnify(e.target.checked)}
                  />
                  {t("page.datasource.paste.unifyAsString")}
                </label>
                <p className="text-[11px] text-muted-foreground">
                  {t("page.datasource.paste.unifyAsStringDesc")}
                </p>
              </div>
            </div>

            <div className="overflow-auto rounded-lg border border-border-subtle">
              <table className="min-w-full text-sm">
                <thead className="bg-surface-hover text-foreground">
                  <tr>
                    {columnNames.map((name, idx) => (
                      <th key={idx} className="px-3 py-2 text-left">
                        <div className="space-y-1">
                          <input
                            className="w-full rounded-md border border-border bg-input px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                            value={name}
                            onChange={e => updateColumnName(idx, e.target.value)}
                          />
                          <select
                            className="w-full rounded-md border border-border bg-input px-2 py-1 text-xs text-foreground"
                            value={columnTypes[idx] || "VARCHAR"}
                            onChange={e => updateColumnType(idx, e.target.value)}
                          >
                            {dataTypes.map(dt => (
                              <option key={dt.value} value={dt.value}>
                                {dt.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="text-foreground">
                  {parsedData.preview.map((row, rIdx) => (
                    <tr key={rIdx} className="border-t border-border-subtle">
                      {row.map((cell, cIdx) => (
                        <td
                          key={cIdx}
                          className="px-3 py-2 text-muted-foreground"
                        >
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button
                onClick={saveToDatabase}
                disabled={loading}
              >
                {loading
                  ? t("page.datasource.paste.save.saving")
                  : t("page.datasource.paste.save.saveBtn")}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
};

export default DataPasteCard;
