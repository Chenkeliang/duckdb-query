import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const stylesheet = readFileSync(resolve(process.cwd(), 'src/styles/tailwind.css'), 'utf8');

describe('global theme border fallback', () => {
  // Regression: bare Tailwind borders rendered as large white frames in dark mode (2026-09-04).
  it('uses the semantic border token instead of the Tailwind v3 gray fallback', () => {
    expect(stylesheet).toContain('border-color: var(--color-border, currentcolor);');
    expect(stylesheet).not.toContain('border-color: var(--color-gray-200, currentcolor);');
  });
});
