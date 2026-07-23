/**
 * JOIN 类型冲突的数据感知 cast 决策(纯函数,便于单测)。
 *
 * 采样冲突两侧列的 infer-cast 结果,求两者都能无损转换的公共类型 T:
 * - 任一侧不可安全量化(safe_decimal_cast=false:非数字/二进制浮点/科学计数法/超容量)→ cast=null,
 *   并给出【第一处不安全侧】及其 reason,供 UI 提示(与透视页一致);
 * - 两侧各自安全但合并后 整数位+小数位 超 DECIMAL(38) 容量 → cast=null, overflow=true;
 * - 否则 scale 取两侧实际数据的最大值(不舍高精度侧),整数走 BIGINT/DECIMAL(38,0),小数走 DECIMAL(38,scale)。
 */
import type { InferCastResult, InferCastReason } from '@/api';

export interface ConflictCastDecision {
    cast: string | null;
    unsafe?: { side: 'left' | 'right'; reason: InferCastReason };
    overflow?: boolean;
}

export function decideConflictCast(
    lr: InferCastResult,
    rr: InferCastResult
): ConflictCastDecision {
    // 左优先(与采样顺序一致):报告第一处不安全侧
    if (!lr.safe_decimal_cast) return { cast: null, unsafe: { side: 'left', reason: lr.reason } };
    if (!rr.safe_decimal_cast) return { cast: null, unsafe: { side: 'right', reason: rr.reason } };
    const scale = Math.max(lr.max_frac_digits, rr.max_frac_digits);
    const intDigits = Math.max(lr.max_int_digits, rr.max_int_digits);
    if (intDigits + scale > 38) return { cast: null, overflow: true };
    if (scale === 0) return { cast: intDigits <= 18 ? 'BIGINT' : 'DECIMAL(38,0)' };
    return { cast: `DECIMAL(38,${scale})` };
}
