import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Info, Loader2 } from "lucide-react";
import {
  inspectExcelSheets,
  importExcelSheets,
  inspectServerExcelSheets,
  importServerExcelSheets,
} from '@/api';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
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
}

const ExcelSheetSelector: React.FC<ExcelSheetSelectorProps> = ({
  open,
  pendingInfo,
  onClose,
  onImported,
  sourceType = 'upload',
  serverPath,
}) => {
  const { t } = useTranslation('common');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sheetConfigs, setSheetConfigs] = useState<SheetConfig[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const fileId = pendingInfo?.file_id;

  const handleFetchSheets = async () => {
    setLoading(true);
    setError("");
    try {
      let data: any;
      if (sourceType === 'server' && serverPath) {
        data = await inspectServerExcelSheets(serverPath);
      } else if (fileId) {
        data = await inspectExcelSheets(fileId);
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
  }, [open, fileId, serverPath, sourceType]);

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
          mode: "replace" as const,
          header_rows: headerRowsNumber,
          header_row_index: headerRowIndexNumber,
          fill_merged: Boolean(sheet.fillMerged),
        };
      });

      let result: any;
      if (sourceType === 'server' && serverPath) {
        result = await importServerExcelSheets(serverPath, sheetsPayload);
      } else {
        result = await importExcelSheets({
          file_id: fileId!,
          sheets: sheetsPayload,
        });
      }

      onImported?.(result);
      onClose?.();
    } catch (err: any) {
      const message = err?.message || t('page.datasource.excelSheet.importFailed');
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
          <DialogTitle>{t('page.datasource.excelSheet.title')}</DialogTitle>
          <DialogDescription>
            {t('page.datasource.excelSheet.description')}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 py-4">
          {/* 文件信息 */}
          <div className="bg-muted rounded-lg p-4 space-y-1">
            <p className="text-sm text-foreground">
              <span className="text-muted-foreground">{t('page.datasource.excelSheet.file')}</span>
              {sourceType === 'server' ? serverPath?.split('/').pop() : pendingInfo?.original_filename || "-"}
            </p>
            <p className="text-sm text-foreground">
              <span className="text-muted-foreground">{t('page.datasource.excelSheet.source')}</span>
              {sourceType === 'server' ? t('page.datasource.excelSheet.sourceServer') : t('page.datasource.excelSheet.sourceUpload')}
            </p>
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
            <div className="space-y-4">
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

                    <AccordionContent className="px-4 pb-4 space-y-4">
                      {/* 配置表单 */}
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor={`target-${sheet.name}`}>{t('page.datasource.excelSheet.targetTable')}</Label>
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
                            placeholder={t('page.datasource.excelSheet.tablePlaceholder')}
                          />
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor={`header-rows-${sheet.name}`}>{t('page.datasource.excelSheet.headerRows')}</Label>
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
                              {t('page.datasource.excelSheet.headerRowIndex')}
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
                              {t('page.datasource.excelSheet.fillMerged')}
                            </Label>
                          </div>
                        )}
                      </div>

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
                        <div className="space-y-2">
                          <Label>{t('page.datasource.excelSheet.preview')}</Label>
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