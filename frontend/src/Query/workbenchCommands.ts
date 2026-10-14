/**
 * 工作台命令注册表。
 *
 * 命令面板、状态栏等工作台之外的入口需要驱动编辑器（执行、格式化、插入表名、
 * 打开历史查询……），而它们与面板之间没有 props 通道。面板挂载时注册处理函数，
 * 卸载时注销；外部通过 runWorkbenchCommand 调用，未注册时返回 false 由调用方兜底。
 * 与 agentChatBus 同样是极简模块级 store，不引状态库。
 */

export interface WorkbenchCommandMap {
  /** 执行当前 SQL 标签 */
  run: () => void;
  /** 当前 SQL 以异步任务提交 */
  runAsync: () => void;
  /** 格式化当前 SQL */
  format: () => void;
  /** 在光标处插入文本（表名等），无 SQL 编辑器时由实现方新建 SQL 标签 */
  insertText: (text: string) => void;
  /** 把一段 SQL 载入编辑器（历史 / 收藏 / 运行记录） */
  loadSql: (sql: string) => void;
  /** 新建查询标签 */
  newTab: (kind?: 'sql' | 'join' | 'set' | 'pivot') => void;
  /** 显示 / 隐藏左侧数据源面板 */
  toggleExplorer: () => void;
  /** 定位并展开一个数据库连接，保留当前查询和结果。 */
  revealConnection: (id: string) => void;
  /** 定位导入后的本地表，不覆盖编辑器或执行查询。 */
  revealTable: (name: string) => void;
}

export type WorkbenchCommandId = keyof WorkbenchCommandMap;

const handlers: { [K in WorkbenchCommandId]?: WorkbenchCommandMap[K] } = {};
/** 工作台未挂载时（例如从设置页按 ⌘K 选「执行」）先排队，处理函数注册时补发。 */
const pending: { [K in WorkbenchCommandId]?: Parameters<WorkbenchCommandMap[K]> } = {};

/** 注册处理函数；返回注销函数（只注销自己注册的那一个，避免覆盖后误删）。 */
export function registerWorkbenchCommand<K extends WorkbenchCommandId>(
  id: K,
  handler: WorkbenchCommandMap[K],
): () => void {
  handlers[id] = handler as (typeof handlers)[K];
  const queued = pending[id];
  if (queued) {
    delete pending[id];
    // 等注册方所在组件完成本轮渲染后再执行
    queueMicrotask(() => (handler as (...a: unknown[]) => void)(...queued));
  }
  return () => {
    if (handlers[id] === handler) delete handlers[id];
  };
}

/** 调用命令；没有处理函数时返回 false。 */
export function runWorkbenchCommand<K extends WorkbenchCommandId>(
  id: K,
  ...args: Parameters<WorkbenchCommandMap[K]>
): boolean {
  const handler = handlers[id] as ((...a: Parameters<WorkbenchCommandMap[K]>) => void) | undefined;
  if (!handler) return false;
  handler(...args);
  return true;
}

/** 调用命令；工作台尚未挂载时排队，等处理函数注册后执行（同一命令只保留最后一次）。 */
export function queueWorkbenchCommand<K extends WorkbenchCommandId>(
  id: K,
  ...args: Parameters<WorkbenchCommandMap[K]>
): void {
  if (runWorkbenchCommand(id, ...args)) return;
  pending[id] = args as (typeof pending)[K];
}

export function hasWorkbenchCommand(id: WorkbenchCommandId): boolean {
  return Boolean(handlers[id]);
}

/** 测试用 */
export function __resetWorkbenchCommands(): void {
  (Object.keys(handlers) as WorkbenchCommandId[]).forEach((k) => delete handlers[k]);
  (Object.keys(pending) as WorkbenchCommandId[]).forEach((k) => delete pending[k]);
}
