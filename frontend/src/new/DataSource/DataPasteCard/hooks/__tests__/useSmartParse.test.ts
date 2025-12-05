/**
 * useSmartParse Hook 单元测试
 */

import { renderHook, act } from '@testing-library/react';
import { useSmartParse } from '../useSmartParse';

describe('useSmartParse', () => {
  describe('CSV 解析', () => {
    it('应该正确解析逗号分隔的数据', () => {
      const { result } = renderHook(() => useSmartParse());

      act(() => {
        result.current.parse('a,b,c\n1,2,3\n4,5,6');
      });

      expect(result.current.results.length).toBeGreaterThan(0);
      expect(result.current.currentResult).not.toBeNull();
      expect(result.current.currentResult?.rows).toEqual([
        ['a', 'b', 'c'],
        ['1', '2', '3'],
        ['4', '5', '6'],
      ]);
    });

    it('应该处理引号包裹的字段', () => {
      const { result } = renderHook(() => useSmartParse());

      act(() => {
        result.current.parse('"name","age"\n"John",25\n"Jane",30');
      });

      expect(result.current.currentResult?.rows).toEqual([
        ['name', 'age'],
        ['John', '25'],
        ['Jane', '30'],
      ]);
    });
  });

  describe('TSV 解析', () => {
    it('应该正确解析 Tab 分隔的数据', () => {
      const { result } = renderHook(() => useSmartParse());

      act(() => {
        result.current.parse('a\tb\tc\n1\t2\t3');
      });

      expect(result.current.currentResult?.rows).toEqual([
        ['a', 'b', 'c'],
        ['1', '2', '3'],
      ]);
      expect(result.current.currentResult?.strategy).toContain('Tab');
    });
  });

  describe('JSON 解析', () => {
    it('应该正确解析 JSON 数组', () => {
      const { result } = renderHook(() => useSmartParse());

      act(() => {
        result.current.parse('[{"name":"John","age":25},{"name":"Jane","age":30}]');
      });

      // JSON 解析结果应该在结果列表中
      const jsonResult = result.current.results.find(r => r.strategy === 'JSON');
      expect(jsonResult).toBeDefined();
      expect(jsonResult?.hasHeader).toBe(true);
      expect(jsonResult?.rows[0]).toContain('name');
      expect(jsonResult?.rows[0]).toContain('age');
    });

    it('应该正确解析单个 JSON 对象', () => {
      const { result } = renderHook(() => useSmartParse());

      act(() => {
        result.current.parse('{"name":"John","age":25}');
      });

      // JSON 解析结果应该在结果列表中
      const jsonResult = result.current.results.find(r => r.strategy === 'JSON');
      expect(jsonResult).toBeDefined();
    });
  });

  describe('键值对解析', () => {
    it('应该正确解析键值对格式', () => {
      const { result } = renderHook(() => useSmartParse());

      act(() => {
        result.current.parse('name: John\nage: 25\ncity: NYC');
      });

      const kvResult = result.current.results.find(r => r.strategy === '键值对');
      expect(kvResult).toBeDefined();
      expect(kvResult?.columns).toBe(3);
    });
  });

  describe('多空格解析', () => {
    it('应该正确解析多空格分隔的数据', () => {
      const { result } = renderHook(() => useSmartParse());

      act(() => {
        result.current.parse('name    age    city\nJohn    25     NYC\nJane    30     LA');
      });

      const spaceResult = result.current.results.find(r => r.strategy === '多空格分隔');
      expect(spaceResult).toBeDefined();
      expect(spaceResult?.columns).toBe(3);
    });
  });

  describe('格式选择', () => {
    it('应该能切换选中的解析结果', () => {
      const { result } = renderHook(() => useSmartParse());

      act(() => {
        result.current.parse('a,b,c\n1,2,3');
      });

      expect(result.current.selectedIndex).toBe(0);

      if (result.current.results.length > 1) {
        act(() => {
          result.current.selectResult(1);
        });
        expect(result.current.selectedIndex).toBe(1);
      }
    });
  });

  describe('自定义分隔符', () => {
    it('应该支持自定义分隔符', () => {
      const { result } = renderHook(() => useSmartParse());

      act(() => {
        result.current.parse('a|b|c\n1|2|3', { format: 'custom', delimiter: '|' });
      });

      expect(result.current.currentResult?.rows).toEqual([
        ['a', 'b', 'c'],
        ['1', '2', '3'],
      ]);
    });
  });

  describe('错误处理', () => {
    it('空输入应该返回错误', () => {
      const { result } = renderHook(() => useSmartParse());

      act(() => {
        result.current.parse('');
      });

      expect(result.current.error).not.toBeNull();
      expect(result.current.results.length).toBe(0);
    });

    it('只有空格的输入应该返回错误', () => {
      const { result } = renderHook(() => useSmartParse());

      act(() => {
        result.current.parse('   \n   ');
      });

      expect(result.current.error).not.toBeNull();
    });
  });

  describe('置信度排序', () => {
    it('结果应该按置信度降序排列', () => {
      const { result } = renderHook(() => useSmartParse());

      act(() => {
        result.current.parse('a,b,c\n1,2,3\n4,5,6');
      });

      const confidences = result.current.results.map(r => r.confidence);
      for (let i = 1; i < confidences.length; i++) {
        expect(confidences[i - 1]).toBeGreaterThanOrEqual(confidences[i]);
      }
    });
  });
});
