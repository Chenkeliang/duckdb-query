/** 列宽拖拽结束后短暂屏蔽表头排序，避免 mouseup 误触 click 排序 */

let blockSortUntil = 0;

export function blockHeaderSortBriefly(durationMs = 300): void {
  blockSortUntil = Date.now() + durationMs;
}

export function shouldBlockHeaderSort(): boolean {
  return Date.now() < blockSortUntil;
}
