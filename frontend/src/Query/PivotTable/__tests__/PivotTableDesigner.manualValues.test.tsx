/**
 * 手选列值标签输入(复审 P2):回车逐个添加、中文输入法组合态不误提交、可删、含逗号值、
 * 换透视列时清空暂存文本。仅当恰好一个透视列时渲染该控件。
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { PivotTableDesigner } from '../PivotTableDesigner';
import { AggregationFunction } from '@/types/pivotQuery';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, opts?: unknown) => (typeof opts === 'string' ? opts : key),
        i18n: { language: 'zh', changeLanguage: vi.fn() },
    }),
}));
vi.mock('@/utils/toastHelpers', () => ({ showSuccessToast: vi.fn(), showErrorToast: vi.fn() }));

const PLACEHOLDER = '输入后回车添加;留空=自动';

function Harness({ initial = [] as string[] }) {
    const [manual, setManual] = React.useState<string[]>(initial);
    const [cols, setCols] = React.useState<string[]>(['year']);
    return (
        <div>
            <div data-testid="mv">{manual.join('|')}</div>
            <button data-testid="setcol" onClick={() => setCols(['month'])}>c</button>
            <PivotTableDesigner
                availableFields={[
                    { name: 'region', type: 'VARCHAR' },
                    { name: 'year', type: 'VARCHAR' },
                    { name: 'qty', type: 'INTEGER' },
                ]}
                rows={['region']}
                columns={cols}
                values={[{ column: 'qty', aggregation: AggregationFunction.COUNT }] as never}
                onRowsChange={() => {}}
                onColumnsChange={() => {}}
                onValuesChange={() => {}}
                includeSubtotals={false}
                includeGrandTotals={false}
                manualColumnValues={manual}
                onManualColumnValuesChange={setManual}
            />
        </div>
    );
}

const tagInput = () => screen.getByPlaceholderText(PLACEHOLDER) as HTMLInputElement;

describe('手选列值标签输入', () => {
    it('回车添加标签', () => {
        render(<Harness />);
        fireEvent.change(tagInput(), { target: { value: '2022' } });
        fireEvent.keyDown(tagInput(), { key: 'Enter' });
        expect(screen.getByTestId('mv').textContent).toBe('2022');
    });

    it('中文输入法组合态的 Enter 不提交(确认候选词);组合结束后再回车才提交', () => {
        render(<Harness />);
        fireEvent.change(tagInput(), { target: { value: '华北' } });
        fireEvent.keyDown(tagInput(), { key: 'Enter', isComposing: true });
        expect(screen.getByTestId('mv').textContent).toBe(''); // 未误提交
        fireEvent.keyDown(tagInput(), { key: 'Enter' });
        expect(screen.getByTestId('mv').textContent).toBe('华北');
    });

    it('含逗号的值作为单个标签(不再按逗号切分)', () => {
        render(<Harness />);
        fireEvent.change(tagInput(), { target: { value: 'ACME, Inc' } });
        fireEvent.keyDown(tagInput(), { key: 'Enter' });
        expect(screen.getByTestId('mv').textContent).toBe('ACME, Inc');
    });

    it('重复值不重复添加(前端保序去重)', () => {
        render(<Harness initial={['A']} />);
        fireEvent.change(tagInput(), { target: { value: 'A' } });
        fireEvent.keyDown(tagInput(), { key: 'Enter' });
        expect(screen.getByTestId('mv').textContent).toBe('A');
    });

    it('空/空白输入回车不加空标签', () => {
        render(<Harness />);
        fireEvent.change(tagInput(), { target: { value: '   ' } });
        fireEvent.keyDown(tagInput(), { key: 'Enter' });
        expect(screen.getByTestId('mv').textContent).toBe('');
    });

    it('空输入 Backspace 删除最后一个标签', () => {
        render(<Harness initial={['A', 'B']} />);
        fireEvent.keyDown(tagInput(), { key: 'Backspace' });
        expect(screen.getByTestId('mv').textContent).toBe('A');
    });

    it('换透视列时清空未提交的暂存文本', () => {
        render(<Harness />);
        fireEvent.change(tagInput(), { target: { value: 'draft' } });
        expect(tagInput().value).toBe('draft');
        fireEvent.click(screen.getByTestId('setcol')); // year → month
        expect(tagInput().value).toBe(''); // 暂存文本随透视列变更清空
    });
});
