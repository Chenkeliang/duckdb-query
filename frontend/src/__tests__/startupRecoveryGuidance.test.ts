// @vitest-environment node

/**
 * Regression 2026-07-29: WAL replay failures fail closed and preserve the WAL,
 * so the startup page must not suggest that retrying will recover the data.
 */
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const mainSource = readFileSync(new URL('../main.tsx', import.meta.url), 'utf8');

describe('desktop startup recovery guidance', () => {
  it('describes fail-closed WAL handling without recommending retry', () => {
    expect(mainSource).toContain(
      '为保护数据，DuckQuery 已停止启动并保留恢复文件（WAL）'
    );
    expect(mainSource).toContain('请勿删除或移动数据目录');
    expect(mainSource).not.toContain('点击重试通常可自动恢复');
  });
});
