import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { Info, Loader2 } from "lucide-react";
import { inspectExcelSheets, importExcelSheets } from "../../services/apiClient";
import { Button } from "@/new/components/ui/button";
import { Input } from "@/new/components/ui/input";
import { Label } from "@/new/components/ui/label";
import { Checkbox } from "@/new/components/ui/checkbox";
import { Switch } from "@/new/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/new/components/ui/dialog";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/new/components/ui/accordion";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/new/components/ui/table";
import { Alert, AlertDescription } from "@/new/components/ui/alert";

// 类型定义
interface PendingInfo {
  file_id: string;
  original_filename: string;
  default_table_prefix?: string;
}

interface SheetMeta {
  name: string;
  rows: number;
  columns_count: number;
  has_merged_cells: boolean;
  suggested_header_rows: number;
  suggested_header_row_index: number;
  default_table_name: string;
  columns: Array<{ name: string; type: string }>;
  preview: Array<Record<string, any>>;
}

interface SheetConfig {
  name: string;
  selected: boolean;
  targetTable: string;
  headerRows: number | string;
  headerRowIndex: number | string | null;
  fillMerged: boolean;
  meta: SheetMeta;
}

interface ExcelSheetSelectorProps {
  open: boolean;
  pendingInfo: PendingInfo | null;
  onClose: () => void;
  onImported: (result: any) => void;
}

const ExcelSheetSelector: React.FC<ExcelSheetSelectorProps> = ({
  open,
  pendingInfo,
  onClose,
  onImported,
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sheetConfigs, setSheetConfigs] = useState<SheetConfig[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const fileId = pendingInfo?.file_id;

  const handleFetchSheets = async (currentFileId: string) => {
    if (!currentFileId) return;
    setLoading(true);
    setError("");
    try {
      const data = await inspectExcelSheets(currentFileId);
      const mapped: SheetConfig[] = (data?.sheets || []).map((sheet: any) => ({
        name: sheet.name,
        selected: true,
        targetTable: sheet.default_table_name || sheet.name,
        headerRows: sheet.suggested_header_rows ?? 1,
        headerRowIndex:
          (sheet.suggested_header_rows ?? 1) > 0
            ? sheet.suggested_header_row_index ?? 1
            : null,
        fillMerged: sheet.has_merged_cells || false,
        meta: {
          ...sheet,
          columns: Array.isArray(sheet.columns) ? sheet.columns : [],
          preview: Array.isArray(sheet.preview) ? sheet.preview : [],
        },
      }));
      setSheetConfigs(mapped);
    } catch (err: any) {
      setError(err?.message || "获取工作表信息失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open && fileId) {
      handleFetchSheets(fileId);
    } else if (!open) {
      setSheetConfigs([]);
      setError("");
    }
  }, [open, fileId]);

  const toggleAll = (nextSelected: boolean) => {
    setSheetConfigs((prev) =>
      prev.map((sheet) => ({ ...sheet, selected: nextSelected }))
    );
  };

  const handleSheetToggle = (name: string, selected: boolean) => {
    setSheetConfigs((prev) =>
      prev.map((sheet) => (sheet.name === name ? { ...sheet, selected } : sheet))
    );
  };

  const handleSheetFieldChange = (
    name: string,
    field: string,
    value: any
  ) => {
    setSheetConfigs((prev) =>
      prev.map((sheet) => {
        if (sheet.name !== name) return sheet;

        if (field === "headerRows") {
          const numericRows = value === "" ? "" : Math.max(0, Number(value) || 0);
          return {
            ...sheet,
            headerRows: numericRows,
            headerRowIndex:
              Number(numericRows) > 0
                ? sheet.headerRowIndex ?? sheet.meta?.suggested_header_row_index ?? 1
                : null,
          };
        }

        if (field === "headerRowIndex") {
          if (Number(sheet.headerRows) === 0) {
            return { ...sheet, headerRowIndex: null };
          }

          if (value === "") {
            return { ...sheet, headerRowIndex: "" };
          }

          const numericIndex = Math.max(1, Number(value) || 1);
          return { ...sheet, headerRowIndex: numericIndex };
        }

        return { ...sheet, [field]: value };
      })
    );
  };

  const handleImport = async () => {
    const selected = sheetConfigs.filter((sheet) => sheet.selected);
    if (selected.length === 0) {
      toast.warning("请至少选择一个工作表进行导入");
      return;
    }

    setSubmitting(true);
    setError("");
    try {
      const payload = {
        file_id: fileId,
        sheets: selected.map((sheet) => {
          const headerRowsNumber = Number(sheet.headerRows) || 0;
          const headerRowIndexNumber =
            headerRowsNumber > 0 ? Number(sheet.headerRowIndex) || 1 : null;

          return {
            name: sheet.name,
            target_table: sheet.targetTable,
            mode: "replace",
            header_rows: headerRowsNumber,
            header_row_index: headerRowIndexNumber,
            fill_merged: Boolean(sheet.fillMerged),
          };
        }),
      };

      const result = await importExcelSheets(payload);
      onImported?.(result);
      onClose?.();
    } catch (err: any) {
      const message = err?.message || "导入失败";
      setError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Excel 工作表导入</DialogTitle>
          <DialogDescription>
            选择要导入的工作表并确认表头设置
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 py-4">
          {/* 文件信息 */}
          <div className="bg-muted rounded-lg p-4 space-y-1">
            <p className="text-sm text-foreground">
              <span className="text-muted-foreground">文件：</span>
              {pendingInfo?.original_filename || "-"}
            </p>
            <p className="text-sm text-foreground">
              <span className="text-muted-foreground">建议表名前缀：</span>
              {pendingInfo?.default_table_prefix || "无"}
            </p>
          </div>

          {/* 加载状态 */}
          {loading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
              <span className="ml-2 text-sm text-muted-foreground">加载工作表信息...</span>
            </div>
          )}

          {/* 错误提示 */}
          {error && !loading && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* 工作表列表 */}
          {!loading && !error && sheetConfigs.length > 0 && (
            <div className="space-y-4">
              {/* 批量操作按钮 */}
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => toggleAll(true)}
                >
                  全选
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => toggleAll(false)}
                >
                  全不选
                </Button>
              </div>

              {/* Accordion 工作表列表 */}
              <Accordion type="multiple" className="space-y-2">
                {sheetConfigs.map((sheet) => (
                  <AccordionItem
                    key={sheet.name}
                    value={sheet.name}
                    className="border border-border rounded-lg"
                  >
                    <AccordionTrigger className="px-4 hover:no-underline">
                      <div className="flex items-center gap-3 flex-1">
                        <div
                          onClick={(e: React.MouseEvent) => {
                            e.stopPropagation();
                            e.preventDefault();
                          }}
                        >
                          <Checkbox
                            checked={sheet.selected}
                            onCheckedChange={(checked: boolean) =>
                              handleSheetToggle(sheet.name, checked)
                            }
                          />
                        </div>
                        <div className="flex-1 text-left">
                          <div className="font-medium text-foreground">{sheet.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {sheet.meta.rows} 行 × {sheet.meta.columns_count} 列
                            {sheet.meta.has_merged_cells && " • 包含合并单元格"}
                          </div>
                        </div>
                      </div>
                    </AccordionTrigger>

                    <AccordionContent className="px-4 pb-4 space-y-4">
                      {/* 配置表单 */}
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor={`target-${sheet.name}`}>目标表名</Label>
                          <Input
                            id={`target-${sheet.name}`}
                            value={sheet.targetTable}
                            onChange={(e) =>
                              handleSheetFieldChange(
                                sheet.name,
                                "targetTable",
                                e.target.value
                              )
                            }
                            placeholder="输入表名"
                          />
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor={`header-rows-${sheet.name}`}>表头行数</Label>
                          <Input
                            id={`header-rows-${sheet.name}`}
                            type="number"
                            min="0"
                            value={sheet.headerRows}
                            onChange={(e) =>
                              handleSheetFieldChange(
                                sheet.name,
                                "headerRows",
                                e.target.value
                              )
                            }
                          />
                        </div>

                        {Number(sheet.headerRows) > 0 && (
                          <div className="space-y-2">
                            <Label htmlFor={`header-index-${sheet.name}`}>
                              表头起始行号
                            </Label>
                            <Input
                              id={`header-index-${sheet.name}`}
                              type="number"
                              min="1"
                              value={sheet.headerRowIndex ?? ""}
                              onChange={(e) =>
                                handleSheetFieldChange(
                                  sheet.name,
                                  "headerRowIndex",
                                  e.target.value
                                )
                              }
                            />
                          </div>
                        )}

                        {sheet.meta.has_merged_cells && (
                          <div className="flex items-center space-x-2">
                            <Switch
                              id={`fill-merged-${sheet.name}`}
                              checked={sheet.fillMerged}
                              onCheckedChange={(checked: boolean) =>
                                handleSheetFieldChange(
                                  sheet.name,
                                  "fillMerged",
                                  checked
                                )
                              }
                            />
                            <Label htmlFor={`fill-merged-${sheet.name}`}>
                              填充合并单元格
                            </Label>
                          </div>
                        )}
                      </div>

                      {/* 警告提示 */}
                      {sheet.meta.has_merged_cells && (
                        <Alert>
                          <Info className="h-4 w-4" />
                          <AlertDescription>
                            此工作表包含合并单元格。建议启用"填充合并单元格"选项。
                          </AlertDescription>
                        </Alert>
                      )}

                      {/* 数据预览 */}
                      {sheet.meta.preview && sheet.meta.preview.length > 0 && (
                        <div className="space-y-2">
                          <Label>数据预览</Label>
                          <div className="border border-border rounded-md overflow-auto max-h-64">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  {sheet.meta.columns.map((col, idx) => (
                                    <TableHead key={idx} className="whitespace-nowrap">
                                      {col.name}
                                    </TableHead>
                                  ))}
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {sheet.meta.preview.slice(0, 5).map((row, rowIdx) => (
                                  <TableRow key={rowIdx}>
                                    {sheet.meta.columns.map((col, colIdx) => (
                                      <TableCell key={colIdx} className="whitespace-nowrap">
                                        {row[col.name] !== null && row[col.name] !== undefined
                                          ? String(row[col.name])
                                          : "-"}
                                      </TableCell>
                                    ))}
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        </div>
                      )}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            取消
          </Button>
          <Button onClick={handleImport} disabled={submitting || loading}>
            {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            导入选中的工作表
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ExcelSheetSelector;