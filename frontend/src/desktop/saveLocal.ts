/**
 * 桌面(Tauri)本地保存原语 —— 全部"选路径 + 直写"场景的唯一入口。
 *
 * 调用方自行以 isTauri() 分流(Web 走各自的浏览器下载),这里只管桌面侧:
 * - pickSavePath: 原生存盘对话框(按扩展名自动配过滤器),取消返回 null
 * - writeTextToPath / writeBytesToPath: fs 插件直写(dialog 选中的路径由
 *   Tauri 运行时授权给 fs scope,capability 无需路径白名单)
 *
 * 已接入:异步结果下载弹窗、网格导出 CSV/JSON/Excel、Parquet(服务端)导出。
 * 新增下载场景请复用这里,不要再各自 import 插件拼流程。
 */

import { save } from '@tauri-apps/plugin-dialog';
import { writeFile, writeTextFile } from '@tauri-apps/plugin-fs';

const FILTER_NAMES: Record<string, string> = {
  csv: 'CSV',
  json: 'JSON',
  xlsx: 'Excel',
  parquet: 'Parquet',
};

/** 弹原生存盘对话框;返回用户选定的绝对路径,取消返回 null */
export async function pickSavePath(
  defaultFileName: string,
  options?: { title?: string }
): Promise<string | null> {
  const ext = defaultFileName.split('.').pop() ?? '';
  return save({
    title: options?.title,
    defaultPath: defaultFileName,
    filters: [{ name: FILTER_NAMES[ext] ?? ext.toUpperCase(), extensions: [ext] }],
  });
}

/** 直写文本文件;bom=true 时前置 UTF-8 BOM(Excel 打开 CSV 兼容) */
export async function writeTextToPath(
  path: string,
  content: string,
  options?: { bom?: boolean }
): Promise<void> {
  const BOM = '\uFEFF';
  await writeTextFile(path, options?.bom ? BOM + content : content);
}

/** 直写二进制文件 */
export async function writeBytesToPath(path: string, bytes: Uint8Array): Promise<void> {
  await writeFile(path, bytes);
}
