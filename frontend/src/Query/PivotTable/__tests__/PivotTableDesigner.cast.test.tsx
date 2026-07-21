/**
 * PivotTableDesigner 的 cast 推断行为(挂载级)——覆盖纯 helper 测不到的交互:
 *  - 推断上下文键变化(切表/改筛选)→ 对系统推断值重推;
 *  - 用户手填(manual)→ 上下文变化不覆盖;
 *  - 异步响应乱序 → 旧上下文的迟到结果被丢弃,不覆盖新结果。
 * 均走真实 handleUpdateValueAgg/effect/inferCastFor 路径,不依赖拖拽。
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react';

import { PivotTableDesigner } from '../PivotTableDesigner';
import { AggregationFunction } from '@/types/pivotQuery';
import { showErrorToast } from '@/utils/toastHelpers';
import type { InferCastResult } from '@/api';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, opts?: unknown) => (typeof opts === 'string' ? opts : key),
        i18n: { language: 'zh', changeLanguage: vi.fn() },
    }),
}));
vi.mock('@/utils/toastHelpers', () => ({
    showSuccessToast: vi.fn(),
    showErrorToast: vi.fn(),
}));

function deferred<T>() {
    let resolve!: (v: T) => void;
    const promise = new Promise<T>((r) => { resolve = r; });
    return { promise, resolve };
}

const okResult = (recommended: string): InferCastResult => ({
    recommended, total: 3, numeric: 3, non_numeric: 0,
    max_int_digits: 2, max_frac_digits: Number(recommended.match(/,(\d+)\)/)?.[1] ?? 0),
    safe_decimal_cast: true, reason: null,
});

// 受控 Harness:values 存 state(onValuesChange 回写),inferenceContextKey 由 prop 驱动(rerender 切换)。
// price 为 VARCHAR → 文本列 → SUM 需要 cast。
type SeedValue = {
    column: string; aggregation: AggregationFunction; typeConversion?: string;
    castStatus?: 'pending' | 'unsafe'; castSource?: 'inferred' | 'manual';
    castContextKey?: string; castSeq?: number;
};
function Harness({
    ctx, onInferCast, seed,
}: {
    ctx: string;
    onInferCast: (c: string) => Promise<InferCastResult | null>;
    seed: SeedValue[];
}) {
    const [values, setValues] = React.useState<SeedValue[]>(seed);
    return (
        <div>
            <div data-testid="tc">{values.map((v) => v.typeConversion ?? '').join('|')}</div>
            <div data-testid="src">{values.map((v) => v.castSource ?? '').join('|')}</div>
            <div data-testid="ctxk">{values.map((v) => v.castContextKey ?? '').join('|')}</div>
            <div data-testid="status">{values.map((v) => v.castStatus ?? '').join('|')}</div>
            <button data-testid="removeFirst" onClick={() => setValues((v) => v.slice(1))}>x</button>
            <PivotTableDesigner
                availableFields={[{ name: 'price', type: 'VARCHAR' }, { name: 'region', type: 'VARCHAR' }]}
                rows={['region']}
                columns={[]}
                values={values as never}
                onRowsChange={() => {}}
                onColumnsChange={() => {}}
                onValuesChange={(v) => setValues(v as never)}
                onInferCast={onInferCast}
                inferenceContextKey={ctx}
            />
        </div>
    );
}

const seedInferred = (): SeedValue[] => [{
    column: 'price', aggregation: AggregationFunction.SUM,
    typeConversion: 'DECIMAL(38,2)', castSource: 'inferred', castContextKey: 'ctx0',
}];

describe('PivotTableDesigner cast 推断(挂载)', () => {
    it('上下文键变化(筛选切换)→ 对系统推断值重推,并采用新标度', async () => {
        const d = deferred<InferCastResult>();
        const onInferCast = vi.fn().mockReturnValue(d.promise);

        const { rerender } = render(<Harness ctx="ctx0" onInferCast={onInferCast} seed={seedInferred()} />);
        // 挂载:castContextKey==='ctx0'===ctx → 不重推
        expect(onInferCast).not.toHaveBeenCalled();

        rerender(<Harness ctx="ctx1" onInferCast={onInferCast} seed={seedInferred()} />);
        await waitFor(() => expect(onInferCast).toHaveBeenCalledWith('price'));
        // 重推期间 pending:typeConversion 清空、上下文键更新为 ctx1
        await waitFor(() => expect(screen.getByTestId('ctxk').textContent).toBe('ctx1'));

        await act(async () => { d.resolve(okResult('DECIMAL(38,3)')); });
        await waitFor(() => expect(screen.getByTestId('tc').textContent).toBe('DECIMAL(38,3)'));
        expect(screen.getByTestId('src').textContent).toBe('inferred');
    });

    it('用户手填(manual)→ 上下文键变化不重推、不覆盖', async () => {
        const onInferCast = vi.fn();
        const seedManual = (): SeedValue[] => [{
            column: 'price', aggregation: AggregationFunction.SUM,
            typeConversion: 'DECIMAL(38,4)', castSource: 'manual',
        }];

        const { rerender } = render(<Harness ctx="ctx0" onInferCast={onInferCast} seed={seedManual()} />);
        rerender(<Harness ctx="ctx1" onInferCast={onInferCast} seed={seedManual()} />);

        // 给 effect 一拍执行
        await act(async () => { await Promise.resolve(); });
        expect(onInferCast).not.toHaveBeenCalled();
        expect(screen.getByTestId('tc').textContent).toBe('DECIMAL(38,4)');
        expect(screen.getByTestId('src').textContent).toBe('manual');
    });

    it('异步乱序:旧上下文的迟到结果被丢弃,不覆盖新结果', async () => {
        const d1 = deferred<InferCastResult>();
        const d2 = deferred<InferCastResult>();
        const onInferCast = vi.fn()
            .mockReturnValueOnce(d1.promise)
            .mockReturnValueOnce(d2.promise);

        const { rerender } = render(<Harness ctx="ctx0" onInferCast={onInferCast} seed={seedInferred()} />);

        rerender(<Harness ctx="ctx1" onInferCast={onInferCast} seed={seedInferred()} />);
        await waitFor(() => expect(onInferCast).toHaveBeenCalledTimes(1));
        await waitFor(() => expect(screen.getByTestId('ctxk').textContent).toBe('ctx1'));

        rerender(<Harness ctx="ctx2" onInferCast={onInferCast} seed={seedInferred()} />);
        await waitFor(() => expect(onInferCast).toHaveBeenCalledTimes(2));
        await waitFor(() => expect(screen.getByTestId('ctxk').textContent).toBe('ctx2'));

        // 乱序:先回新(ctx2),后回旧(ctx1)
        await act(async () => { d2.resolve(okResult('DECIMAL(38,9)')); });
        await waitFor(() => expect(screen.getByTestId('tc').textContent).toBe('DECIMAL(38,9)'));

        await act(async () => { d1.resolve(okResult('DECIMAL(38,2)')); });
        await act(async () => { await Promise.resolve(); });
        // 旧结果 forKey='ctx1' !== 当前 'ctx2' → 丢弃,不回退标度
        expect(screen.getByTestId('tc').textContent).toBe('DECIMAL(38,9)');
    });

    it('同上下文 A→B→A 重复在途:旧派发迟到不覆盖新结果(castSeq 守卫)', async () => {
        // 两个同 forKey='ctxA' 的在途请求 d0(seq1)、d2(seq3):forKey/castSource 都相同,只有 seq 能区分。
        const d0 = deferred<InferCastResult>();
        const d1 = deferred<InferCastResult>();
        const d2 = deferred<InferCastResult>();
        const onInferCast = vi.fn()
            .mockReturnValueOnce(d0.promise)   // 挂载 @ctxA
            .mockReturnValueOnce(d1.promise)   // @ctxB
            .mockReturnValueOnce(d2.promise);  // 回到 @ctxA
        // 种子 castContextKey='old' → 挂载时(ctxA)即派发 d0
        const seedStale = (): SeedValue[] => [{
            column: 'price', aggregation: AggregationFunction.SUM,
            typeConversion: 'DECIMAL(38,2)', castSource: 'inferred', castContextKey: 'old',
        }];

        const { rerender } = render(<Harness ctx="ctxA" onInferCast={onInferCast} seed={seedStale()} />);
        await waitFor(() => expect(onInferCast).toHaveBeenCalledTimes(1));  // d0 @ctxA
        rerender(<Harness ctx="ctxB" onInferCast={onInferCast} seed={seedStale()} />);
        await waitFor(() => expect(onInferCast).toHaveBeenCalledTimes(2));  // d1 @ctxB
        rerender(<Harness ctx="ctxA" onInferCast={onInferCast} seed={seedStale()} />);
        await waitFor(() => expect(onInferCast).toHaveBeenCalledTimes(3));  // d2 @ctxA(与 d0 同 forKey)

        // 最新派发 d2 先回:采用好结果
        await act(async () => { d2.resolve(okResult('DECIMAL(38,7)')); });
        await waitFor(() => expect(screen.getByTestId('tc').textContent).toBe('DECIMAL(38,7)'));
        // 最旧派发 d0(同 forKey='ctxA')迟到并给出更差结果:castSeq 不匹配 → 丢弃,不覆盖
        await act(async () => { d0.resolve(okResult('DECIMAL(38,2)')); });
        await act(async () => { await Promise.resolve(); });
        expect(screen.getByTestId('tc').textContent).toBe('DECIMAL(38,7)');
        // d1(ctxB)也迟到:forKey 过期 → 丢弃
        await act(async () => { d1.resolve(okResult('DECIMAL(38,1)')); });
        await act(async () => { await Promise.resolve(); });
        expect(screen.getByTestId('tc').textContent).toBe('DECIMAL(38,7)');
    });

    it('推断在途时删除前置值:幸存值按 castSeq 重定位并落地,不永卡 pending', async () => {
        // [A=COUNT(region) 不推断, B=SUM(price) 待推断]。挂载时仅 B 派发(idx=1)。
        const d = deferred<InferCastResult>();
        const onInferCast = vi.fn().mockReturnValue(d.promise);
        const seed = (): SeedValue[] => [
            { column: 'region', aggregation: AggregationFunction.COUNT },
            { column: 'price', aggregation: AggregationFunction.SUM, castSource: 'inferred', castContextKey: 'old' },
        ];

        render(<Harness ctx="ctxA" onInferCast={onInferCast} seed={seed()} />);
        await waitFor(() => expect(onInferCast).toHaveBeenCalledWith('price'));
        // B 进入 pending(idx 仍为 1)
        await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('|pending'));

        // 删除前置值 A → B 左移到 idx 0(派发时下标 1 已失效)
        await act(async () => { screen.getByTestId('removeFirst').click(); });
        expect(screen.getByTestId('status').textContent).toBe('pending'); // 仅剩 B,仍 pending

        // 推断回填:按 castSeq 在最新数组重定位到 idx 0(而非旧 idx 1),B 落地、脱离 pending
        await act(async () => { d.resolve(okResult('DECIMAL(38,3)')); });
        await waitFor(() => expect(screen.getByTestId('tc').textContent).toBe('DECIMAL(38,3)'));
        expect(screen.getByTestId('status').textContent).toBe(''); // 不再 pending
    });

    it('手填非法 cast(裸 DECIMAL)→ 保持 unsafe 不放行 + 报错(复审 P1:与后端同口径)', () => {
        const onInferCast = vi.fn();
        vi.mocked(showErrorToast).mockClear();
        // 文本 SUM + castStatus=unsafe → 值 chip 上显示 cast 输入(占位"请选类型")
        const seed = (): SeedValue[] => [
            { column: 'price', aggregation: AggregationFunction.SUM, castStatus: 'unsafe' },
        ];
        render(<Harness ctx="c" onInferCast={onInferCast} seed={seed()} />);
        const input = screen.getByPlaceholderText('请选类型') as HTMLInputElement;
        fireEvent.change(input, { target: { value: 'DECIMAL' } }); // 裸 DECIMAL
        fireEvent.blur(input);
        expect(screen.getByTestId('status').textContent).toBe('unsafe'); // 仍挡住
        expect(screen.getByTestId('tc').textContent).toBe('');            // 未存
        expect(showErrorToast).toHaveBeenCalled();
    });

    it('手填合法 cast(小写 decimal(38,6))→ 存规范拼写并放行', () => {
        const onInferCast = vi.fn();
        const seed = (): SeedValue[] => [
            { column: 'price', aggregation: AggregationFunction.SUM, castStatus: 'unsafe' },
        ];
        render(<Harness ctx="c" onInferCast={onInferCast} seed={seed()} />);
        const input = screen.getByPlaceholderText('请选类型') as HTMLInputElement;
        fireEvent.change(input, { target: { value: 'decimal(38,6)' } });
        fireEvent.blur(input);
        expect(screen.getByTestId('tc').textContent).toBe('DECIMAL(38,6)'); // 规范拼写
        expect(screen.getByTestId('src').textContent).toBe('manual');
        expect(screen.getByTestId('status').textContent).toBe('');
    });
});
