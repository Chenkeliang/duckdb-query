/** 列可见性（工具栏 / DataGridWrapper 共用） */
export interface DataGridColumnInfo {
  field: string;
  visible: boolean;
}

/** ResultPanel 工具栏统计（与 DataGrid onStatsChange 映射） */
export interface ResultPanelGridStats {
  totalRows: number;
  filteredRows: number;
  columnCount: number;
  visibleColumnCount: number;
}
