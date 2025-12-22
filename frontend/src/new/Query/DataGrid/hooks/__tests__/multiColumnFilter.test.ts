/**
 * 多列筛选测试
 * 
 * 验证：
 * 1. 多个列筛选时使用 AND 逻辑（所有列的筛选条件都必须满足）
 * 2. 单个列内多个值使用 OR 逻辑（任一值匹配即可）
 */

import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useDataGrid } from '../useDataGrid';

describe('多列筛选', () => {
  const testData = [
    { 商品名称: '苹果', 类别: '水果', 价格: 5 },
    { 商品名称: '香蕉', 类别: '水果', 价格: 3 },
    { 商品名称: '西红柿', 类别: '蔬菜', 价格: 4 },
    { 商品名称: '黄瓜', 类别: '蔬菜', 价格: 2 },
    { 商品名称: '牛奶', 类别: '饮品', 价格: 6 },
  ];

  it('单列筛选：选中多个值应使用 OR 逻辑', () => {
    const { result } = renderHook(() =>
      useDataGrid({
        data: testData,
        initialFilters: [
          {
            id: '商品名称',
            value: {
              selectedValues: ['苹果', '香蕉'],
              mode: 'include',
            },
          },
        ],
      })
    );

    // 应该返回 2 行：苹果和香蕉
    expect(result.current.filteredData).toHaveLength(2);
    expect(result.current.filteredData[0]['商品名称']).toBe('苹果');
    expect(result.current.filteredData[1]['商品名称']).toBe('香蕉');
  });

  it('多列筛选：不同列应使用 AND 逻辑', () => {
    const { result } = renderHook(() =>
      useDataGrid({
        data: testData,
        initialFilters: [
          {
            id: '类别',
            value: {
              selectedValues: ['水果', '蔬菜'],
              mode: 'include',
            },
          },
          {
            id: '商品名称',
            value: {
              selectedValues: ['苹果', '西红柿'],
              mode: 'include',
            },
          },
        ],
      })
    );

    // 应该返回 2 行：苹果（水果 AND 苹果）和西红柿（蔬菜 AND 西红柿）
    expect(result.current.filteredData).toHaveLength(2);
    const names = result.current.filteredData.map((row) => row['商品名称']);
    expect(names).toContain('苹果');
    expect(names).toContain('西红柿');
    expect(names).not.toContain('香蕉'); // 香蕉是水果但不在商品名称筛选中
    expect(names).not.toContain('黄瓜'); // 黄瓜是蔬菜但不在商品名称筛选中
  });

  it('多列筛选：复杂场景', () => {
    const { result } = renderHook(() =>
      useDataGrid({
        data: testData,
        initialFilters: [
          {
            id: '类别',
            value: {
              selectedValues: ['水果'],
              mode: 'include',
            },
          },
          {
            id: '商品名称',
            value: {
              selectedValues: ['苹果', '香蕉', '西红柿'],
              mode: 'include',
            },
          },
        ],
      })
    );

    // 应该返回 2 行：苹果和香蕉（都是水果 AND 在商品名称列表中）
    // 西红柿虽然在商品名称列表中，但不是水果，所以被排除
    expect(result.current.filteredData).toHaveLength(2);
    const names = result.current.filteredData.map((row) => row['商品名称']);
    expect(names).toContain('苹果');
    expect(names).toContain('香蕉');
    expect(names).not.toContain('西红柿');
  });

  it('排除模式：单列排除多个值', () => {
    const { result } = renderHook(() =>
      useDataGrid({
        data: testData,
        initialFilters: [
          {
            id: '商品名称',
            value: {
              selectedValues: ['苹果', '香蕉'],
              mode: 'exclude',
            },
          },
        ],
      })
    );

    // 应该返回 3 行：除了苹果和香蕉之外的所有商品
    expect(result.current.filteredData).toHaveLength(3);
    const names = result.current.filteredData.map((row) => row['商品名称']);
    expect(names).not.toContain('苹果');
    expect(names).not.toContain('香蕉');
    expect(names).toContain('西红柿');
    expect(names).toContain('黄瓜');
    expect(names).toContain('牛奶');
  });

  it('selectedValues 为数组时也应正常工作', () => {
    const { result } = renderHook(() =>
      useDataGrid({
        data: testData,
        initialFilters: [
          {
            id: '商品名称',
            value: {
              // 模拟从 FilterMenu 传递过来的数组格式
              selectedValues: ['苹果', '香蕉'] as any,
              mode: 'include',
            },
          },
        ],
      })
    );

    // 应该返回 2 行：苹果和香蕉
    expect(result.current.filteredData).toHaveLength(2);
    expect(result.current.filteredData[0]['商品名称']).toBe('苹果');
    expect(result.current.filteredData[1]['商品名称']).toBe('香蕉');
  });

  it('空值筛选', () => {
    const dataWithNull = [
      ...testData,
      { 商品名称: null, 类别: '其他', 价格: 0 },
      { 商品名称: undefined, 类别: '其他', 价格: 0 },
    ];

    const { result } = renderHook(() =>
      useDataGrid({
        data: dataWithNull,
        initialFilters: [
          {
            id: '商品名称',
            value: {
              selectedValues: ['(空)'],
              mode: 'include',
            },
          },
        ],
      })
    );

    // 应该返回 2 行：null 和 undefined 都被转换为 '(空)'
    expect(result.current.filteredData).toHaveLength(2);
  });
});
