/**
 * 右键菜单过滤属性测试
 * 
 * **Feature: external-table-integration-fixes, Property 11: External Table Context Menu Filtering**
 * **Validates: Requirements 11.1, 11.2, 11.3**
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

// 菜单项类型
type MenuItemType = 'preview' | 'viewStructure' | 'delete' | 'import';

interface MenuConfig {
  isExternal: boolean;
  canDelete: boolean;
  hasOnDelete: boolean;
  hasOnImport: boolean;
}

/**
 * 根据配置确定可见的菜单项
 */
const getVisibleMenuItems = (config: MenuConfig): MenuItemType[] => {
  const items: MenuItemType[] = [];
  
  // 预览数据 - 所有表都可用
  items.push('preview');
  
  if (config.isExternal) {
    // 外部表特有选项
    if (config.hasOnImport) {
      items.push('import');
    }
  } else {
    // DuckDB 表特有选项
    items.push('viewStructure');
    if (config.canDelete && config.hasOnDelete) {
      items.push('delete');
    }
  }
  
  return items;
};

/**
 * 检查菜单项是否应该可见
 */
const shouldShowMenuItem = (item: MenuItemType, config: MenuConfig): boolean => {
  switch (item) {
    case 'preview':
      // 预览对所有表都可用
      return true;
    case 'viewStructure':
      // 查看结构只对 DuckDB 表可用
      return !config.isExternal;
    case 'delete':
      // 删除只对 DuckDB 表可用，且需要 canDelete 和 onDelete
      return !config.isExternal && config.canDelete && config.hasOnDelete;
    case 'import':
      // 导入只对外部表可用，且需要 onImport
      return config.isExternal && config.hasOnImport;
    default:
      return false;
  }
};

describe('Context Menu Filtering - Property Tests', () => {
  describe('Menu item visibility', () => {
    /**
     * Property 11.1: 预览选项对所有表都可用
     */
    it('should always show preview option', () => {
      fc.assert(
        fc.property(
          fc.boolean(), // isExternal
          fc.boolean(), // canDelete
          fc.boolean(), // hasOnDelete
          fc.boolean(), // hasOnImport
          (isExternal, canDelete, hasOnDelete, hasOnImport) => {
            const config: MenuConfig = { isExternal, canDelete, hasOnDelete, hasOnImport };
            const items = getVisibleMenuItems(config);
            return items.includes('preview');
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property 11.2: 外部表不显示查看结构选项
     */
    it('should not show viewStructure for external tables', () => {
      fc.assert(
        fc.property(
          fc.boolean(), // canDelete
          fc.boolean(), // hasOnDelete
          fc.boolean(), // hasOnImport
          (canDelete, hasOnDelete, hasOnImport) => {
            const config: MenuConfig = { 
              isExternal: true, 
              canDelete, 
              hasOnDelete, 
              hasOnImport 
            };
            const items = getVisibleMenuItems(config);
            return !items.includes('viewStructure');
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property 11.3: 外部表不显示删除选项
     */
    it('should not show delete for external tables', () => {
      fc.assert(
        fc.property(
          fc.boolean(), // canDelete
          fc.boolean(), // hasOnDelete
          fc.boolean(), // hasOnImport
          (canDelete, hasOnDelete, hasOnImport) => {
            const config: MenuConfig = { 
              isExternal: true, 
              canDelete, 
              hasOnDelete, 
              hasOnImport 
            };
            const items = getVisibleMenuItems(config);
            return !items.includes('delete');
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property: DuckDB 表显示查看结构选项
     */
    it('should show viewStructure for DuckDB tables', () => {
      fc.assert(
        fc.property(
          fc.boolean(), // canDelete
          fc.boolean(), // hasOnDelete
          fc.boolean(), // hasOnImport
          (canDelete, hasOnDelete, hasOnImport) => {
            const config: MenuConfig = { 
              isExternal: false, 
              canDelete, 
              hasOnDelete, 
              hasOnImport 
            };
            const items = getVisibleMenuItems(config);
            return items.includes('viewStructure');
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property: 外部表有 onImport 时显示导入选项
     */
    it('should show import for external tables with onImport', () => {
      fc.assert(
        fc.property(
          fc.boolean(), // canDelete
          fc.boolean(), // hasOnDelete
          (canDelete, hasOnDelete) => {
            const config: MenuConfig = { 
              isExternal: true, 
              canDelete, 
              hasOnDelete, 
              hasOnImport: true 
            };
            const items = getVisibleMenuItems(config);
            return items.includes('import');
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property: DuckDB 表不显示导入选项
     */
    it('should not show import for DuckDB tables', () => {
      fc.assert(
        fc.property(
          fc.boolean(), // canDelete
          fc.boolean(), // hasOnDelete
          fc.boolean(), // hasOnImport
          (canDelete, hasOnDelete, hasOnImport) => {
            const config: MenuConfig = { 
              isExternal: false, 
              canDelete, 
              hasOnDelete, 
              hasOnImport 
            };
            const items = getVisibleMenuItems(config);
            return !items.includes('import');
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('shouldShowMenuItem function', () => {
    /**
     * Property: shouldShowMenuItem 与 getVisibleMenuItems 一致
     */
    it('should be consistent with getVisibleMenuItems', () => {
      const allItems: MenuItemType[] = ['preview', 'viewStructure', 'delete', 'import'];
      
      fc.assert(
        fc.property(
          fc.boolean(),
          fc.boolean(),
          fc.boolean(),
          fc.boolean(),
          (isExternal, canDelete, hasOnDelete, hasOnImport) => {
            const config: MenuConfig = { isExternal, canDelete, hasOnDelete, hasOnImport };
            const visibleItems = getVisibleMenuItems(config);
            
            // 检查每个菜单项
            for (const item of allItems) {
              const shouldShow = shouldShowMenuItem(item, config);
              const isVisible = visibleItems.includes(item);
              if (shouldShow !== isVisible) {
                return false;
              }
            }
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Edge cases', () => {
    /**
     * Property: 外部表最少有 1 个菜单项（预览）
     */
    it('should have at least preview for external tables', () => {
      const config: MenuConfig = { 
        isExternal: true, 
        canDelete: false, 
        hasOnDelete: false, 
        hasOnImport: false 
      };
      const items = getVisibleMenuItems(config);
      expect(items.length).toBeGreaterThanOrEqual(1);
      expect(items).toContain('preview');
    });

    /**
     * Property: DuckDB 表最少有 2 个菜单项（预览 + 查看结构）
     */
    it('should have at least preview and viewStructure for DuckDB tables', () => {
      const config: MenuConfig = { 
        isExternal: false, 
        canDelete: false, 
        hasOnDelete: false, 
        hasOnImport: false 
      };
      const items = getVisibleMenuItems(config);
      expect(items.length).toBeGreaterThanOrEqual(2);
      expect(items).toContain('preview');
      expect(items).toContain('viewStructure');
    });

    /**
     * Property: 完整配置的外部表有 2 个菜单项
     */
    it('should have 2 items for fully configured external table', () => {
      const config: MenuConfig = { 
        isExternal: true, 
        canDelete: true, 
        hasOnDelete: true, 
        hasOnImport: true 
      };
      const items = getVisibleMenuItems(config);
      expect(items).toEqual(['preview', 'import']);
    });

    /**
     * Property: 完整配置的 DuckDB 表有 3 个菜单项
     */
    it('should have 3 items for fully configured DuckDB table', () => {
      const config: MenuConfig = { 
        isExternal: false, 
        canDelete: true, 
        hasOnDelete: true, 
        hasOnImport: true 
      };
      const items = getVisibleMenuItems(config);
      expect(items).toEqual(['preview', 'viewStructure', 'delete']);
    });
  });
});
