import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { showErrorToast } from "@/utils/toastHelpers";
import { Info, Loader2 } from "lucide-react";
import {
  inspectExcelSheets,
  importExcelSheets,
  inspectServerExcelSheets,
  importServerExcelSheets,
  type FileImportMode,
} from '@/api';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";

// 类型定义
interface PendingInfo {
  file_id: string;
  original_filename: string;
  table_alias?: string | null;
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
  /** Source type: 'upload' for file upload flow, 'server' for server file browser */
  sourceType?: 'upload' | 'server';
  /** Server file path (required when sourceType is 'server') */
  serverPath?: string;
  /** 与上传面板一致：auto | literal */
  importMode?: FileImportMode;
  /** 服务器 Excel：上传前填写的表别名，用于 inspect 默认表名 */
  tablePrefix?: string;
}

const ExcelSheetSelector: React.FC<ExcelSheetSelectorProps> = ({
  open,
  pendingInfo,
  onClose,
  onImported,
  sourceType = 'upload',
  serverPath,
  importMode = 'auto',
  tablePrefix,
}) => {
  const { t } = useTranslation('common');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sheetConfigs, setSheetConfigs] = useState<SheetConfig[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [namePrefix, setNamePrefix] = useState("");
  /** 撞名处理：create=自动加 _1/_2/_3 后缀（默认），replace=覆盖同名表 */
  const [conflictMode, setConflictMode] = useState<"create" | "replace">("create");

  const fileId = pendingInfo?.file_id;

  const handleFetchSheets = async () => {
    setLoading(true);
    setError("");
    try {
      let data: any;
      if (sourceType === 'server' && serverPath) {
        data = await inspectServerExcelSheets(
          serverPath,
          tablePrefix ?? pendingInfo?.table_alias ?? null
        );
        setNamePrefix(
          data.default_table_prefix ||
            tablePrefix ||
            pendingInfo?.default_table_prefix ||
            ""
        );
      } else if (fileId) {
        data = await inspectExcelSheets(fileId);
        setNamePrefix(
          data.default_table_prefix ||
            pendingInfo?.default_table_prefix ||
            data.table_alias ||
            pendingInfo?.table_alias ||
            ""
        );
      } else {
        throw new Error(t('page.datasource.excelSheet.missingFileInfo'));
      }

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
      setError(err?.message || t('page.datasource.excelSheet.fetchFailed'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      if (sourceType === 'server' && serverPath) {
        handleFetchSheets();
      } else if (sourceType === 'upload' && fileId) {
        handleFetchSheets();
      }
    } else {
      setSheetConfigs([]);
      setError("");
    }
  }, [open, fileId, serverPath, sourceType, tablePrefix, pendingInfo?.table_alias]);

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
      toast.warning(t('page.datasource.excelSelectAtLeastOne'));
      return;
    }

    setSubmitting(true);
    setError("");
    try {
      const sheetsPayload = selected.map((sheet) => {
        const headerRowsNumber = Number(sheet.headerRows) || 0;
        const headerRowIndexNumber =
          headerRowsNumber > 0 ? Number(sheet.headerRowIndex) || 1 : null;

        return {
          name: sheet.name,
          target_table: sheet.targetTable,
          mode: conflictMode,
          header_rows: headerRowsNumber,
          header_row_index: headerRowIndexNumber,
          fill_merged: Boolean(sheet.fillMerged),
        };
      });

      // variant 是给 JSON/JSONL 的"嵌套 JSON 列"模式,Excel 单元格无此概念,
      // 后端 Excel 端点只接受 auto/literal(否则 422)。全局选择器可能停在
      // variant,这里归一到 auto,避免用户导 Excel 时莫名报错。
      const excelImportMode: FileImportMode =
        importMode === 'variant' ? 'auto' : importMode;

      let result: any;
      if (sourceType === 'server' && serverPath) {
        result = await importServerExcelSheets(
          serverPath,
          sheetsPayload,
          excelImportMode
        );
      } else {
        result = await importExcelSheets({
          file_id: fileId!,
          import_mode: excelImportMode,
          sheets: sheetsPayload,
        });
      }

      onImported?.(result);
      onClose?.();
    } catch (err: any) {
      const message = err?.message || t('page.datasource.excelSheet.importFailed');
      setError(message);
      showErrorToast(t, 'EXCEL_IMPORT_FAILED', message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>{t('page.datasource.excelSheet.title')}</DialogTitle>
          <DialogDescription className="sr-only">
            {t('page.datasource.excelSheet.description')}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-3 py-3">
          {/* 文件信息（一行 chip） */}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">
              {sourceType === 'server' ? serverPath?.split('/').pop() : pendingInfo?.original_filename || "-"}
            </span>
            <span className="opacity-40">·</span>
            <span>
              {sourceType === 'server'
                ? t('page.datasource.excelSheet.sourceServer')
                : t('page.datasource.excelSheet.sourceUpload')}
            </span>
            {namePrefix ? (
              <>
                <span className="opacity-40">·</span>
                <span className="inline-flex items-center gap-1">
                  {t('page.datasource.excelSheet.tablePrefix')}
                  <code className="rounded bg-primary/10 px-1 font-mono text-primary">
                    {namePrefix}
                  </code>
                </span>
              </>
            ) : null}
          </div>

          {/* 撞名处理方式（全局，应用于本次选中的所有 Sheet） */}
          <div className="flex items-center gap-2">
            <Label className="text-xs whitespace-nowrap">
              {t('page.datasource.excelSheet.conflictModeLabel')}
            </Label>
            <Select
              value={conflictMode}
              onValueChange={(v) => setConflictMode(v as "create" | "replace")}
            >
              <SelectTrigger className="h-8 w-[280px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="create">
                  {t('page.datasource.excelSheet.conflictModeCreate')}
                </SelectItem>
                <SelectItem value="replace">
                  {t('page.datasource.excelSheet.conflictModeReplace')}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* 加载状态 */}
          {loading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
              <span className="ml-2 text-sm text-muted-foreground">{t('page.datasource.excelSheet.loading')}</span>
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
            <div className="space-y-3">
              {/* 批量操作按钮 */}
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => toggleAll(true)}
                >
                  {t('page.datasource.excelSheet.selectAll')}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => toggleAll(false)}
                >
                  {t('page.datasource.excelSheet.selectNone')}
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
                            {t('page.datasource.excelSheet.rows', { count: sheet.meta.rows })} × {t('page.datasource.excelSheet.columns', { count: sheet.meta.columns_count })}
                            {sheet.meta.has_merged_cells && ` • ${t('page.datasource.excelSheet.hasMergedCells')}`}
                          </div>
                        </div>
                      </div>
                    </AccordionTrigger>

                    <AccordionContent className="px-4 pb-3 space-y-3">
                      {/* 配置表单：三项并一行 */}
                      <div className="flex flex-wrap items-end gap-3">
                        <div className="flex-1 min-w-[200px] space-y-1">
                          <Label className="text-xs" htmlFor={`target-${sheet.name}`}>{t('page.datasource.excelSheet.targetTable')}</Label>
                          <Input
                            id={`target-${sheet.name}`}
                            className="h-9"
                            value={sheet.targetTable}
                            onChange={(e) =>
                              handleSheetFieldChange(
                                sheet.name,
                                "targetTable",
                                e.target.value
                              )
                            }
                            placeholder={t('page.datasource.excelSheet.tablePlaceholder')}
                          />
                        </div>

                        <div className="w-24 space-y-1">
                          <Label className="text-xs" htmlFor={`header-rows-${sheet.name}`}>{t('page.datasource.excelSheet.headerRows')}</Label>
                          <Input
                            id={`header-rows-${sheet.name}`}
                            className="h-9"
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
                          <div className="w-24 space-y-1">
                            <Label className="text-xs" htmlFor={`header-index-${sheet.name}`}>
                              {t('page.datasource.excelSheet.headerRowIndex')}
                            </Label>
                            <Input
                              id={`header-index-${sheet.name}`}
                              className="h-9"
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
                      </div>

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
                          <Label className="text-xs" htmlFor={`fill-merged-${sheet.name}`}>
                            {t('page.datasource.excelSheet.fillMerged')}
                          </Label>
                        </div>
                      )}

                      {/* 警告提示 */}
                      {sheet.meta.has_merged_cells && (
                        <Alert>
                          <Info className="h-4 w-4" />
                          <AlertDescription>
                            {t('page.datasource.excelSheet.mergedWarning')}
                          </AlertDescription>
                        </Alert>
                      )}

                      {/* 数据预览 */}
                      {sheet.meta.preview && sheet.meta.preview.length > 0 && (
                        <div className="space-y-1">
                          <Label className="text-xs">{t('page.datasource.excelSheet.preview')}</Label>
                          <div className="border border-border rounded-md overflow-auto max-h-32">
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
            {t('page.datasource.excelSheet.cancel')}
          </Button>
          <Button onClick={handleImport} disabled={submitting || loading}>
            {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {t('page.datasource.excelSheet.import')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ExcelSheetSelector;
