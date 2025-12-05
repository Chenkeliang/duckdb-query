import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/new/components/ui/card";
import { Skeleton } from "@/new/components/ui/skeleton";

/**
 * 结果面板（AG-Grid）
 * 
 * 职责：
 * - 显示查询结果（AG-Grid）
 * - Excel 风格列筛选
 * - 单元格选择和复制
 * - 键盘导航
 * - 浮动工具栏
 * - 全局搜索
 * - 导出功能
 * 
 * TODO: 完整实现将在后续任务中完成
 */

interface ResultPanelProps {
  data: any[][] | null;
  columns: string[] | null;
  loading: boolean;
  error: Error | null;
  rowCount?: number;
  execTime?: number;
}

export const ResultPanel: React.FC<ResultPanelProps> = ({
  data,
  columns,
  loading,
  error,
  rowCount,
  execTime,
}) => {
  if (loading) {
    return (
      <div className="h-full p-4 bg-surface">
        <Skeleton className="h-full w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full p-4 bg-surface">
        <Card className="border-error">
          <CardHeader>
            <CardTitle className="text-error">查询错误</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">{error.message}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!data || !columns) {
    return (
      <div className="h-full flex items-center justify-center bg-surface">
        <p className="text-sm text-muted-foreground">
          执行查询以查看结果
        </p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-surface">
      {/* 工具栏 */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border">
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span>{rowCount} 行</span>
          <span>{columns.length} 列</span>
          {execTime && <span>{execTime}ms</span>}
        </div>
      </div>

      {/* 结果表格（占位） */}
      <div className="flex-1 overflow-auto p-4">
        <p className="text-sm text-muted-foreground">
          AG-Grid 表格（待实现）
        </p>
        <p className="text-xs text-muted-foreground mt-2">
          数据: {rowCount} 行 × {columns.length} 列
        </p>
      </div>
    </div>
  );
};
