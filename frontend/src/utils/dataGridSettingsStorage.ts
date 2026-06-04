export type DataGridRowHeight = 28 | 32 | 40;

export interface DataGridSettings {
  /** 双色斑马行 */
  zebraStripes: boolean;
  /** 行高（px）：紧凑 28 / 默认 32 / 宽松 40 */
  rowHeight: DataGridRowHeight;
  /** 新结果加载后默认按内容自动适配列宽 */
  autoFitOnLoad: boolean;
}

const STORAGE_KEY = 'duckquery-datagrid-settings';

/** 设置变更后广播，使已挂载的结果表即时生效（跨组件同步） */
export const DATAGRID_SETTINGS_EVENT = 'duckquery-datagrid-settings-changed';

const ROW_HEIGHTS: DataGridRowHeight[] = [28, 32, 40];

export const DEFAULT_DATAGRID_SETTINGS: DataGridSettings = {
  zebraStripes: true,
  rowHeight: 32,
  autoFitOnLoad: true,
};

function normalizeRowHeight(value: unknown): DataGridRowHeight {
  return ROW_HEIGHTS.includes(value as DataGridRowHeight)
    ? (value as DataGridRowHeight)
    : DEFAULT_DATAGRID_SETTINGS.rowHeight;
}

export function loadDataGridSettings(): DataGridSettings {
  if (typeof window === 'undefined') {
    return { ...DEFAULT_DATAGRID_SETTINGS };
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_DATAGRID_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<DataGridSettings>;
    return {
      zebraStripes:
        parsed.zebraStripes === undefined
          ? DEFAULT_DATAGRID_SETTINGS.zebraStripes
          : Boolean(parsed.zebraStripes),
      rowHeight: normalizeRowHeight(parsed.rowHeight),
      autoFitOnLoad:
        parsed.autoFitOnLoad === undefined
          ? DEFAULT_DATAGRID_SETTINGS.autoFitOnLoad
          : Boolean(parsed.autoFitOnLoad),
    };
  } catch {
    return { ...DEFAULT_DATAGRID_SETTINGS };
  }
}

export function saveDataGridSettings(settings: DataGridSettings): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    window.dispatchEvent(new CustomEvent(DATAGRID_SETTINGS_EVENT));
    return true;
  } catch {
    return false;
  }
}
