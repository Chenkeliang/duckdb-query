/** Regression 2026-10-13: desktop downloads should open the system Downloads folder, not the last save location. */
import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ save: vi.fn(), downloadDir: vi.fn(), join: vi.fn() }));
vi.mock('@tauri-apps/plugin-dialog', () => ({ save: mocks.save }));
vi.mock('@tauri-apps/api/path', () => ({ downloadDir: mocks.downloadDir, join: mocks.join }));
import { pickSavePath } from './saveLocal';
describe('desktop default download directory', () => {
  beforeEach(() => vi.clearAllMocks());
  it.each([
    ['/Users/analyst/Downloads', '/Users/analyst/Downloads/result.csv'],
    ['D:\\User Downloads', 'D:\\User Downloads\\result.csv'],
  ])('uses the directory returned by the platform, including relocated Windows folders: %s', async (directory, filePath) => {
    mocks.downloadDir.mockResolvedValue(directory);
    mocks.join.mockResolvedValue(filePath);
    mocks.save.mockResolvedValue(filePath);
    expect(await pickSavePath('result.csv', { title: 'Export result' })).toBe(filePath);
    expect(mocks.downloadDir).toHaveBeenCalledOnce();
    expect(mocks.join).toHaveBeenCalledWith(directory, 'result.csv');
    expect(mocks.save).toHaveBeenCalledWith({ title: 'Export result', defaultPath: filePath, filters: [{ name: 'CSV', extensions: ['csv'] }] });
  });
  it('still returns null when the save dialog is cancelled', async () => {
    mocks.downloadDir.mockResolvedValue('/Users/analyst/Downloads');
    mocks.join.mockResolvedValue('/Users/analyst/Downloads/result.xlsx');
    mocks.save.mockResolvedValue(null);
    expect(await pickSavePath('result.xlsx')).toBeNull();
    expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ filters: [{ name: 'Excel', extensions: ['xlsx'] }] }));
  });
});
