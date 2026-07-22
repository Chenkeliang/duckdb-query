/**
 * useGridExport 桌面直写分支(2026-07-10):
 * Tauri 下 CSV/JSON 导出 = 原生存盘对话框 + fs 直写(用户可选目录);
 * 取消对话框 → 不写文件、不弹成功 toast。Web 分支(blob)不在此覆盖。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import * as XLSX from 'xlsx';

const { mocks } = vi.hoisted(() => ({
  mocks: {
    save: vi.fn(),
    writeTextFile: vi.fn(async (_path: string, _content: string) => undefined),
    writeFile: vi.fn(async (_path: string, _data: Uint8Array) => undefined),
    showSuccessToast: vi.fn(),
    showSavedToToast: vi.fn(),
    showErrorToast: vi.fn(),
  },
}));

vi.mock('@tauri-apps/plugin-dialog', () => ({ save: mocks.save }));
vi.mock('@tauri-apps/plugin-fs', () => ({
  writeTextFile: mocks.writeTextFile,
  writeFile: mocks.writeFile,
}));
vi.mock('@/desktop/openExternal', () => ({ isTauri: () => true }));
vi.mock('@/utils/toastHelpers', () => ({
  showSuccessToast: mocks.showSuccessToast,
  showSavedToToast: mocks.showSavedToToast,
  showErrorToast: mocks.showErrorToast,
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, defaultValue?: unknown) =>
      typeof defaultValue === 'string' ? defaultValue : key,
  }),
}));

import { useGridExport } from '../useGridExport';

const data = [
  { id: 1, name: 'Alice' },
  { id: 2, name: 'Bob' },
];

describe('useGridExport 桌面直写', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('CSV:save 选路径后 writeTextFile 直写,成功 toast 弹出', async () => {
    mocks.save.mockResolvedValue('/Users/me/导出 目录/out.csv');
    const { result } = renderHook(() => useGridExport({ data, columns: ['id', 'name'] }));

    await act(async () => {
      await result.current.exportCSV({ filename: 'out' });
    });

    expect(mocks.save).toHaveBeenCalledWith(
      expect.objectContaining({ defaultPath: 'out.csv' })
    );
    expect(mocks.writeTextFile).toHaveBeenCalledTimes(1);
    const [path, content] = mocks.writeTextFile.mock.calls[0];
    expect(path).toBe('/Users/me/导出 目录/out.csv');
    expect(content).toContain('id,name');
    expect(content).toContain('1,Alice');
    expect(mocks.showSavedToToast).toHaveBeenCalledWith(expect.anything(), '/Users/me/导出 目录/out.csv');
  });

  it('取消存盘对话框:不写文件、无成功 toast', async () => {
    mocks.save.mockResolvedValue(null);
    const { result } = renderHook(() => useGridExport({ data, columns: ['id', 'name'] }));

    await act(async () => {
      await result.current.exportCSV({ filename: 'out' });
    });

    expect(mocks.writeTextFile).not.toHaveBeenCalled();
    expect(mocks.showSavedToToast).not.toHaveBeenCalled();
    expect(mocks.showSuccessToast).not.toHaveBeenCalled();
    expect(mocks.showErrorToast).not.toHaveBeenCalled();
  });

  it('JSON:直写内容为合法 JSON 且含数据', async () => {
    mocks.save.mockResolvedValue('/tmp/out.json');
    const { result } = renderHook(() => useGridExport({ data, columns: ['id', 'name'] }));

    await act(async () => {
      await result.current.exportJSON({ filename: 'out' });
    });

    const [, content] = mocks.writeTextFile.mock.calls[0];
    // 去掉 BOM 后应可解析
    const parsed = JSON.parse(String(content).replace(/^﻿/, ''));
    expect(parsed).toEqual([
      { id: 1, name: 'Alice' },
      { id: 2, name: 'Bob' },
    ]);
  });

  it('CSV:数值 0/1 不转成 FALSE/TRUE，真正布尔值仍保持布尔语义', async () => {
    mocks.save.mockResolvedValue('/tmp/flags.csv');
    const flagData = [
      { numeric_flag: 0, boolean_flag: false },
      { numeric_flag: 1, boolean_flag: true },
    ];
    const { result } = renderHook(() =>
      useGridExport({ data: flagData, columns: ['numeric_flag', 'boolean_flag'] })
    );

    await act(async () => {
      await result.current.exportCSV({ filename: 'flags' });
    });

    const [, content] = mocks.writeTextFile.mock.calls[0];
    expect(String(content).replace(/^﻿/, '')).toBe(
      'numeric_flag,boolean_flag\n0,false\n1,true'
    );
    expect(flagData).toEqual([
      { numeric_flag: 0, boolean_flag: false },
      { numeric_flag: 1, boolean_flag: true },
    ]);
  });

  it('Excel:数值 0/1 写成数字单元格，只有真正布尔值写成布尔单元格', async () => {
    mocks.save.mockResolvedValue('/tmp/flags.xlsx');
    const flagData = [
      { numeric_flag: 0, boolean_flag: false },
      { numeric_flag: 1, boolean_flag: true },
    ];
    const { result } = renderHook(() =>
      useGridExport({ data: flagData, columns: ['numeric_flag', 'boolean_flag'] })
    );

    act(() => {
      result.current.exportExcel({ filename: 'flags' });
    });
    await waitFor(() => expect(mocks.writeFile).toHaveBeenCalledTimes(1));

    const [, bytes] = mocks.writeFile.mock.calls[0];
    const workbook = XLSX.read(bytes, { type: 'array' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    expect(sheet.A2).toMatchObject({ t: 'n', v: 0 });
    expect(sheet.A3).toMatchObject({ t: 'n', v: 1 });
    expect(sheet.B2).toMatchObject({ t: 'b', v: false });
    expect(sheet.B3).toMatchObject({ t: 'b', v: true });
  });
});
