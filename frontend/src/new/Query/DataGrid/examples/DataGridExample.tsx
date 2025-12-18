/**
 * DataGrid 示例页面
 */

import { useState, useMemo } from 'react';
import { DataGrid } from '../DataGrid';
import { Button } from '@/new/components/ui/button';
import { Input } from '@/new/components/ui/input';
import { Label } from '@/new/components/ui/label';
import type { CellSelection, ColumnDef } from '../types';

// 生成测试数据
function generateData(rowCount: number, colCount: number): Record<string, unknown>[] {
  const data: Record<string, unknown>[] = [];
  
  for (let i = 0; i < rowCount; i++) {
    const row: Record<string, unknown> = { id: i + 1 };
    
    for (let j = 0; j < colCount; j++) {
      const colName = `col_${j + 1}`;
      
      // 生成不同类型的数据
      if (j % 4 === 0) {
        // 数字
        row[colName] = Math.round(Math.random() * 10000) / 100;
      } else if (j % 4 === 1) {
        // 字符串
        row[colName] = `Value_${i}_${j}`;
      } else if (j % 4 === 2) {
        // 日期
        row[colName] = new Date(2020 + (i % 5), i % 12, (i % 28) + 1).toISOString().split('T')[0];
      } else {
        // 可能为 null
        row[colName] = Math.random() > 0.1 ? `Text_${i}` : null;
      }
    }
    
    data.push(row);
  }
  
  return data;
}

export function DataGridExample() {
  const [rowCount, setRowCount] = useState(1000);
  const [colCount, setColCount] = useState(20);
  const [selection, setSelection] = useState<CellSelection | null>(null);

  // 生成数据
  const data = useMemo(() => generateData(rowCount, colCount), [rowCount, colCount]);

  // 生成列定义
  const columns = useMemo<ColumnDef[]>(() => {
    const cols: ColumnDef[] = [
      { field: 'id', headerName: 'ID', width: 80, sortable: true, filterable: true },
    ];
    
    for (let i = 0; i < colCount; i++) {
      cols.push({
        field: `col_${i + 1}`,
        headerName: `Column ${i + 1}`,
        width: 120,
        sortable: true,
        filterable: true,
      });
    }
    
    return cols;
  }, [colCount]);

  const handleSelectionChange = (newSelection: CellSelection | null) => {
    setSelection(newSelection);
  };

  const selectionInfo = useMemo(() => {
    if (!selection) return null;
    
    const minRow = Math.min(selection.anchor.rowIndex, selection.end.rowIndex);
    const maxRow = Math.max(selection.anchor.rowIndex, selection.end.rowIndex);
    const minCol = Math.min(selection.anchor.colIndex, selection.end.colIndex);
    const maxCol = Math.max(selection.anchor.colIndex, selection.end.colIndex);
    const cellCount = (maxRow - minRow + 1) * (maxCol - minCol + 1);
    
    return {
      rows: maxRow - minRow + 1,
      cols: maxCol - minCol + 1,
      cells: cellCount,
    };
  }, [selection]);

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-2xl font-bold">DataGrid 示例</h1>
      
      {/* 控制面板 */}
      <div className="flex items-end gap-4 p-4 border rounded-lg bg-muted/30">
        <div className="space-y-2">
          <Label htmlFor="rowCount">行数</Label>
          <Input
            id="rowCount"
            type="number"
            value={rowCount}
            onChange={(e) => setRowCount(Number(e.target.value) || 100)}
            className="w-32"
          />
        </div>
        
        <div className="space-y-2">
          <Label htmlFor="colCount">列数</Label>
          <Input
            id="colCount"
            type="number"
            value={colCount}
            onChange={(e) => setColCount(Number(e.target.value) || 10)}
            className="w-32"
          />
        </div>
        
        <Button
          variant="outline"
          onClick={() => {
            setRowCount(100000);
            setColCount(50);
          }}
        >
          10万行 × 50列
        </Button>
        
        <Button
          variant="outline"
          onClick={() => {
            setRowCount(1000);
            setColCount(20);
          }}
        >
          重置
        </Button>
        
        {selectionInfo && (
          <div className="text-sm text-muted-foreground">
            选中: {selectionInfo.rows} 行 × {selectionInfo.cols} 列 = {selectionInfo.cells} 单元格
          </div>
        )}
      </div>
      
      {/* DataGrid */}
      <DataGrid
        data={data}
        columns={columns}
        height={600}
        enableSelection={true}
        enableFiltering={true}
        enableSorting={true}
        onSelectionChange={handleSelectionChange}
      />
      
      {/* 使用说明 */}
      <div className="p-4 border rounded-lg bg-muted/30 text-sm space-y-2">
        <h3 className="font-semibold">使用说明</h3>
        <ul className="list-disc list-inside space-y-1 text-muted-foreground">
          <li>点击单元格开始选区，拖拽扩展选区</li>
          <li>Shift + 点击扩展选区</li>
          <li>Ctrl/Cmd + A 全选</li>
          <li>Ctrl/Cmd + C 复制选区（TSV 格式）</li>
          <li>右键打开菜单，可选择复制格式</li>
          <li>点击列头排序，再次点击切换排序方向</li>
          <li>点击列头筛选图标打开筛选菜单</li>
          <li>拖拽列头边缘调整列宽</li>
          <li>Esc 清除选区</li>
        </ul>
      </div>
    </div>
  );
}

export default DataGridExample;
