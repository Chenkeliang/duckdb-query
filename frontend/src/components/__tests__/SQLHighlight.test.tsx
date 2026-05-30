import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';

import { SQLHighlight } from '../SQLHighlight';

// 锁定 scrollable ↔ pointer-events 契约：
// 大段预览（JOIN/集合/透视）传 scrollable 才能用滚轮滚动看全 SQL；
// 列表卡片不传，pointer-events-none 让点击穿透到行。
describe('SQLHighlight scrollable contract', () => {
  it('scrollable enables pointer events so the editor can be scrolled', () => {
    const { container } = render(
      <SQLHighlight sql="SELECT 1" scrollable data-testid="sql" />
    );
    const root = container.querySelector('[data-testid="sql"]')!;
    expect(root.className).toContain('pointer-events-auto');
    expect(root.className).not.toContain('pointer-events-none');
  });

  it('defaults to pointer-events-none (clicks pass through list cards)', () => {
    const { container } = render(
      <SQLHighlight sql="SELECT 1" data-testid="sql" />
    );
    const root = container.querySelector('[data-testid="sql"]')!;
    expect(root.className).toContain('pointer-events-none');
  });
});
