// @vitest-environment node

/**
 * Regression (2026-07): Rollup's CommonJS helper was emitted into the charts
 * chunk, making vendor import charts and creating a browser-time TDZ cycle.
 */
import { describe, expect, it } from 'vitest';

// @ts-expect-error vite.config.js intentionally remains JavaScript.
import viteConfig from '../../vite.config.js';

function getManualChunks() {
  const output = viteConfig.build?.rollupOptions?.output;
  if (!output || Array.isArray(output) || typeof output.manualChunks !== 'function') {
    throw new Error('vite manualChunks function is not configured');
  }
  return output.manualChunks;
}

describe('Vite chunk grouping', () => {
  it('keeps Rollup CommonJS helpers in vendor to avoid cross-chunk cycles', () => {
    expect(getManualChunks()('\0commonjsHelpers.js', {})).toBe('vendor');
  });
});
