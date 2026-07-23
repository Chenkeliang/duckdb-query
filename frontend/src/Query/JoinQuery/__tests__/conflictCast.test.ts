import { describe, it, expect } from 'vitest';
import { decideConflictCast } from '../conflictCast';
import type { InferCastResult, InferCastReason } from '@/api';

const res = (over: Partial<InferCastResult>): InferCastResult => ({
    recommended: null, total: 10, numeric: 10, non_numeric: 0,
    max_int_digits: 3, max_frac_digits: 0,
    safe_decimal_cast: true, reason: null,
    ...over,
});
const unsafe = (reason: InferCastReason): InferCastResult =>
    res({ safe_decimal_cast: false, reason });

describe('decideConflictCast', () => {
    it('两侧安全整数 → BIGINT(≤18 位)', () => {
        expect(decideConflictCast(res({}), res({})).cast).toBe('BIGINT');
    });

    it('两侧安全、有小数 → DECIMAL(38, 最大 scale)', () => {
        const d = decideConflictCast(res({ max_frac_digits: 2 }), res({ max_frac_digits: 4 }));
        expect(d.cast).toBe('DECIMAL(38,4)'); // 取两侧最大,不舍高精度侧
    });

    it('左侧不安全 → cast=null,报告 left 侧及其 reason', () => {
        const d = decideConflictCast(unsafe('binary_float'), res({}));
        expect(d.cast).toBeNull();
        expect(d.unsafe).toEqual({ side: 'left', reason: 'binary_float' });
    });

    it('仅右侧不安全 → 报告 right 侧', () => {
        const d = decideConflictCast(res({}), unsafe('non_numeric'));
        expect(d.cast).toBeNull();
        expect(d.unsafe).toEqual({ side: 'right', reason: 'non_numeric' });
    });

    it('两侧都不安全 → 报告【第一处】左侧(与采样顺序一致)', () => {
        const d = decideConflictCast(unsafe('scientific'), unsafe('overflow'));
        expect(d.unsafe).toEqual({ side: 'left', reason: 'scientific' });
    });

    it('两侧各自安全但合并超 DECIMAL(38) 容量 → overflow', () => {
        const d = decideConflictCast(
            res({ max_int_digits: 30, max_frac_digits: 5 }),
            res({ max_int_digits: 20, max_frac_digits: 10 }),
        );
        // max_int=30, max_frac=10 → 40 > 38
        expect(d.cast).toBeNull();
        expect(d.overflow).toBe(true);
    });

    it('每种 reason 都被如实带出,供 UI 映射文案', () => {
        for (const r of ['non_numeric', 'binary_float', 'scientific', 'overflow'] as const) {
            expect(decideConflictCast(unsafe(r), res({})).unsafe?.reason).toBe(r);
        }
    });
});
