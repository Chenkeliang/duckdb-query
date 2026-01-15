/**
 * 双模筛选器工具函数单元测试
 * Dual-Mode Filter Utility Functions Unit Tests
 */

import { describe, it, expect } from 'vitest';
import {
    generateFilterSQL,
    parseFilterSQL,
    escapeSqlIdentifier,
    escapeSqlString,
    validateValueType,
    validateNestingDepth,
    countConditions,
    createEmptyGroup,
    createCondition,
    createRawNode,
    addConditionToTree,
    removeNodeById,
    toggleGroupLogic,
    groupNodes,
    cloneFilterTree,
    // Placement related functions
    separateConditionsByPlacement,
    cloneTreeWithoutOnConditions,
    getConditionsForTable,
    generateConditionsSQL,
    getDefaultPlacement,
    canPlaceInOrGroup,
    groupContainsOnConditions,
} from '../filterUtils';
import type { FilterGroup, FilterCondition, PlacementContext } from '../types';

// ============================================
// SQL 生成测试
// ============================================

describe('generateFilterSQL', () => {
    describe('空条件', () => {
        it('空分组生成空字符串', () => {
            const emptyGroup = createEmptyGroup();
            expect(generateFilterSQL(emptyGroup)).toBe('');
        });
    });

    describe('单条件', () => {
        it('生成等于条件', () => {
            const condition = createCondition('users', 'status', '=', 'active');
            expect(generateFilterSQL(condition)).toBe('"users"."status" = \'active\'');
        });

        it('生成不等于条件', () => {
            const condition = createCondition('users', 'status', '!=', 'deleted');
            expect(generateFilterSQL(condition)).toBe('"users"."status" != \'deleted\'');
        });

        it('生成大于条件', () => {
            const condition = createCondition('orders', 'amount', '>', 100);
            expect(generateFilterSQL(condition)).toBe('"orders"."amount" > 100');
        });

        it('生成大于等于条件', () => {
            const condition = createCondition('orders', 'amount', '>=', 100);
            expect(generateFilterSQL(condition)).toBe('"orders"."amount" >= 100');
        });

        it('生成小于条件', () => {
            const condition = createCondition('orders', 'amount', '<', 100);
            expect(generateFilterSQL(condition)).toBe('"orders"."amount" < 100');
        });

        it('生成小于等于条件', () => {
            const condition = createCondition('orders', 'amount', '<=', 100);
            expect(generateFilterSQL(condition)).toBe('"orders"."amount" <= 100');
        });
    });

    describe('LIKE 操作符', () => {
        it('生成 LIKE 条件', () => {
            const condition = createCondition('users', 'name', 'LIKE', '%John%');
            expect(generateFilterSQL(condition)).toBe('"users"."name" LIKE \'%John%\'');
        });

        it('生成 NOT LIKE 条件', () => {
            const condition = createCondition('users', 'name', 'NOT LIKE', 'test%');
            expect(generateFilterSQL(condition)).toBe('"users"."name" NOT LIKE \'test%\'');
        });
    });

    describe('IN 操作符', () => {
        it('生成 IN 条件（字符串数组）', () => {
            const condition = createCondition('users', 'city', 'IN', ['北京', '上海', '广州']);
            expect(generateFilterSQL(condition)).toBe('"users"."city" IN (\'北京\', \'上海\', \'广州\')');
        });

        it('生成 IN 条件（数字数组）', () => {
            const condition = createCondition('orders', 'status', 'IN', [1, 2, 3]);
            expect(generateFilterSQL(condition)).toBe('"orders"."status" IN (1, 2, 3)');
        });

        it('生成 NOT IN 条件', () => {
            const condition = createCondition('users', 'role', 'NOT IN', ['admin', 'super']);
            expect(generateFilterSQL(condition)).toBe('"users"."role" NOT IN (\'admin\', \'super\')');
        });
    });

    describe('IS NULL 操作符', () => {
        it('生成 IS NULL 条件', () => {
            const condition = createCondition('users', 'deleted_at', 'IS NULL', null);
            expect(generateFilterSQL(condition)).toBe('"users"."deleted_at" IS NULL');
        });

        it('生成 IS NOT NULL 条件', () => {
            const condition = createCondition('users', 'email', 'IS NOT NULL', null);
            expect(generateFilterSQL(condition)).toBe('"users"."email" IS NOT NULL');
        });
    });

    describe('BETWEEN 操作符', () => {
        it('生成 BETWEEN 条件（数字）', () => {
            const condition = createCondition('orders', 'amount', 'BETWEEN', 100, 500);
            expect(generateFilterSQL(condition)).toBe('"orders"."amount" BETWEEN 100 AND 500');
        });

        it('生成 BETWEEN 条件（日期字符串）', () => {
            const condition = createCondition('orders', 'created_at', 'BETWEEN', '2024-01-01', '2024-12-31');
            expect(generateFilterSQL(condition)).toBe('"orders"."created_at" BETWEEN \'2024-01-01\' AND \'2024-12-31\'');
        });
    });

    describe('嵌套条件', () => {
        it('生成 AND 组合', () => {
            const group: FilterGroup = {
                id: 'g1',
                type: 'group',
                logic: 'AND',
                children: [
                    createCondition('users', 'status', '=', 'active'),
                    createCondition('users', 'age', '>', 18),
                ],
            };
            expect(generateFilterSQL(group)).toBe('("users"."status" = \'active\' AND "users"."age" > 18)');
        });

        it('生成 OR 组合', () => {
            const group: FilterGroup = {
                id: 'g1',
                type: 'group',
                logic: 'OR',
                children: [
                    createCondition('users', 'role', '=', 'admin'),
                    createCondition('users', 'role', '=', 'super'),
                ],
            };
            expect(generateFilterSQL(group)).toBe('("users"."role" = \'admin\' OR "users"."role" = \'super\')');
        });

        it('生成 (A OR B) AND C 嵌套逻辑', () => {
            const innerGroup: FilterGroup = {
                id: 'inner',
                type: 'group',
                logic: 'OR',
                children: [
                    createCondition('users', 'city', '=', '北京'),
                    createCondition('users', 'city', '=', '上海'),
                ],
            };
            const outerGroup: FilterGroup = {
                id: 'outer',
                type: 'group',
                logic: 'AND',
                children: [
                    innerGroup,
                    createCondition('users', 'status', '=', 'active'),
                ],
            };
            expect(generateFilterSQL(outerGroup)).toBe(
                '(("users"."city" = \'北京\' OR "users"."city" = \'上海\') AND "users"."status" = \'active\')'
            );
        });

        it('单子节点分组直接返回子节点 SQL', () => {
            const group: FilterGroup = {
                id: 'g1',
                type: 'group',
                logic: 'AND',
                children: [createCondition('users', 'id', '=', 1)],
            };
            expect(generateFilterSQL(group)).toBe('"users"."id" = 1');
        });
    });

    describe('Raw SQL 节点', () => {
        it('原样返回 Raw SQL', () => {
            const raw = createRawNode('LOWER(name) = \'test\'');
            expect(generateFilterSQL(raw)).toBe('LOWER(name) = \'test\'');
        });
    });
});

// ============================================
// 转义函数测试
// ============================================

describe('escapeSqlIdentifier', () => {
    it('普通标识符', () => {
        expect(escapeSqlIdentifier('users')).toBe('"users"');
    });

    it('含空格的标识符', () => {
        expect(escapeSqlIdentifier('user name')).toBe('"user name"');
    });

    it('含中文的标识符', () => {
        expect(escapeSqlIdentifier('用户表')).toBe('"用户表"');
    });

    it('含双引号的标识符', () => {
        expect(escapeSqlIdentifier('table"name')).toBe('"table""name"');
    });

    it('空标识符', () => {
        expect(escapeSqlIdentifier('')).toBe('""');
    });
});

describe('escapeSqlString', () => {
    it('普通字符串', () => {
        expect(escapeSqlString('hello')).toBe("'hello'");
    });

    it('含单引号的字符串', () => {
        expect(escapeSqlString("O'Brien")).toBe("'O''Brien'");
    });

    it('含多个单引号的字符串', () => {
        expect(escapeSqlString("It's Tom's book")).toBe("'It''s Tom''s book'");
    });

    it('空字符串', () => {
        expect(escapeSqlString('')).toBe("''");
    });

    it('null 值', () => {
        expect(escapeSqlString(null as any)).toBe('NULL');
    });
});

// ============================================
// SQL 解析测试
// ============================================

describe('parseFilterSQL', () => {
    describe('基本解析', () => {
        it('解析空字符串返回空分组', () => {
            const result = parseFilterSQL('');
            expect(result.success).toBe(true);
            expect(result.node.type).toBe('group');
            expect((result.node as FilterGroup).children).toHaveLength(0);
        });

        it('解析简单等于条件', () => {
            const result = parseFilterSQL('"users"."status" = \'active\'');
            expect(result.success).toBe(true);
            expect(result.node.type).toBe('condition');
            const cond = result.node as FilterCondition;
            expect(cond.table).toBe('users');
            expect(cond.column).toBe('status');
            expect(cond.operator).toBe('=');
            expect(cond.value).toBe('active');
        });

        it('解析数字条件', () => {
            const result = parseFilterSQL('"orders"."amount" > 100');
            expect(result.success).toBe(true);
            expect(result.node.type).toBe('condition');
            const cond = result.node as FilterCondition;
            expect(cond.value).toBe(100);
        });
    });

    describe('IN 操作符解析', () => {
        it('解析 IN 条件', () => {
            const result = parseFilterSQL('"users"."city" IN (\'北京\', \'上海\')');
            expect(result.success).toBe(true);
            expect(result.node.type).toBe('condition');
            const cond = result.node as FilterCondition;
            expect(cond.operator).toBe('IN');
            expect(cond.value).toEqual(['北京', '上海']);
        });
    });

    describe('IS NULL 解析', () => {
        it('解析 IS NULL 条件', () => {
            const result = parseFilterSQL('"users"."deleted_at" IS NULL');
            expect(result.success).toBe(true);
            expect(result.node.type).toBe('condition');
            const cond = result.node as FilterCondition;
            expect(cond.operator).toBe('IS NULL');
        });

        it('解析 IS NOT NULL 条件', () => {
            const result = parseFilterSQL('"users"."email" IS NOT NULL');
            expect(result.success).toBe(true);
            expect(result.node.type).toBe('condition');
            const cond = result.node as FilterCondition;
            expect(cond.operator).toBe('IS NOT NULL');
        });
    });

    describe('复杂逻辑解析', () => {
        it('解析 AND 组合', () => {
            const result = parseFilterSQL('"users"."a" = 1 AND "users"."b" = 2');
            expect(result.success).toBe(true);
            expect(result.node.type).toBe('group');
            const group = result.node as FilterGroup;
            expect(group.logic).toBe('AND');
            expect(group.children).toHaveLength(2);
        });

        it('解析 OR 组合', () => {
            const result = parseFilterSQL('"users"."a" = 1 OR "users"."b" = 2');
            expect(result.success).toBe(true);
            expect(result.node.type).toBe('group');
            const group = result.node as FilterGroup;
            expect(group.logic).toBe('OR');
            expect(group.children).toHaveLength(2);
        });
    });

    describe('解析失败降级', () => {
        it('复杂函数降级为 Raw', () => {
            const result = parseFilterSQL('LOWER(name) = \'test\'');
            expect(result.node.type).toBe('raw');
        });

        it('子查询降级为 Raw', () => {
            const result = parseFilterSQL('id IN (SELECT user_id FROM orders)');
            expect(result.node.type).toBe('raw');
        });
    });
});

// ============================================
// 类型校验测试
// ============================================

describe('validateValueType', () => {
    describe('整数类型', () => {
        it('有效整数通过校验', () => {
            expect(validateValueType(123, 'INTEGER').valid).toBe(true);
            expect(validateValueType(-456, 'BIGINT').valid).toBe(true);
            expect(validateValueType('789', 'SMALLINT').valid).toBe(true);
        });

        it('非整数被拒绝', () => {
            expect(validateValueType('abc', 'INTEGER').valid).toBe(false);
            expect(validateValueType('12.34', 'BIGINT').valid).toBe(false);
        });
    });

    describe('浮点类型', () => {
        it('有效数字通过校验', () => {
            expect(validateValueType(12.34, 'DOUBLE').valid).toBe(true);
            expect(validateValueType('56.78', 'DECIMAL').valid).toBe(true);
        });

        it('非数字被拒绝', () => {
            expect(validateValueType('abc', 'DOUBLE').valid).toBe(false);
        });
    });

    describe('日期类型', () => {
        it('有效日期格式通过校验', () => {
            expect(validateValueType('2024-12-23', 'DATE').valid).toBe(true);
        });

        it('无效日期格式被拒绝', () => {
            expect(validateValueType('2024/12/23', 'DATE').valid).toBe(false);
            expect(validateValueType('12-23-2024', 'DATE').valid).toBe(false);
        });
    });

    describe('时间戳类型', () => {
        it('有效时间戳通过校验', () => {
            expect(validateValueType('2024-12-23T10:30:00', 'TIMESTAMP').valid).toBe(true);
        });

        it('无效时间戳被拒绝', () => {
            expect(validateValueType('not-a-date', 'TIMESTAMP').valid).toBe(false);
        });
    });

    describe('空值', () => {
        it('空值通过校验', () => {
            expect(validateValueType(null, 'INTEGER').valid).toBe(true);
            expect(validateValueType('', 'VARCHAR').valid).toBe(true);
        });
    });
});

// ============================================
// 嵌套深度校验测试
// ============================================

describe('validateNestingDepth', () => {
    it('空分组深度为 1', () => {
        const tree = createEmptyGroup();
        expect(validateNestingDepth(tree, 1)).toBe(true);
    });

    it('单层条件深度为 2', () => {
        const tree = addConditionToTree(
            createEmptyGroup(),
            createCondition('users', 'id', '=', 1)
        );
        expect(validateNestingDepth(tree, 2)).toBe(true);
        expect(validateNestingDepth(tree, 1)).toBe(false);
    });

    it('超过最大深度返回 false', () => {
        // 创建 6 层嵌套
        let tree: FilterGroup = createEmptyGroup();
        for (let i = 0; i < 5; i++) {
            tree = {
                id: `g${i}`,
                type: 'group',
                logic: 'AND',
                children: [tree],
            };
        }
        expect(validateNestingDepth(tree, 5)).toBe(false);
        expect(validateNestingDepth(tree, 6)).toBe(true);
    });
});

// ============================================
// 条件数量统计测试
// ============================================

describe('countConditions', () => {
    it('空分组返回 0', () => {
        expect(countConditions(createEmptyGroup())).toBe(0);
    });

    it('单条件返回 1', () => {
        const cond = createCondition('users', 'id', '=', 1);
        expect(countConditions(cond)).toBe(1);
    });

    it('多条件正确统计', () => {
        const tree: FilterGroup = {
            id: 'root',
            type: 'group',
            logic: 'AND',
            children: [
                createCondition('users', 'a', '=', 1),
                createCondition('users', 'b', '=', 2),
                {
                    id: 'inner',
                    type: 'group',
                    logic: 'OR',
                    children: [
                        createCondition('users', 'c', '=', 3),
                        createCondition('users', 'd', '=', 4),
                    ],
                },
            ],
        };
        expect(countConditions(tree)).toBe(4);
    });

    it('Raw 节点计为 1', () => {
        const raw = createRawNode('complex sql');
        expect(countConditions(raw)).toBe(1);
    });
});

// ============================================
// 树操作函数测试
// ============================================

describe('Tree Operations', () => {
    describe('addConditionToTree', () => {
        it('添加条件到根节点', () => {
            const tree = createEmptyGroup();
            const cond = createCondition('users', 'id', '=', 1);
            const newTree = addConditionToTree(tree, cond);
            expect(newTree.children).toHaveLength(1);
            expect(newTree.children[0]).toBe(cond);
        });
    });

    describe('removeNodeById', () => {
        it('从根节点删除条件', () => {
            const cond = createCondition('users', 'id', '=', 1);
            const tree = addConditionToTree(createEmptyGroup(), cond);
            const newTree = removeNodeById(tree, cond.id);
            expect(newTree.children).toHaveLength(0);
        });
    });

    describe('toggleGroupLogic', () => {
        it('切换根节点逻辑', () => {
            const tree = createEmptyGroup(); // 默认 AND
            const newTree = toggleGroupLogic(tree, tree.id);
            expect(newTree.logic).toBe('OR');
        });
    });

    describe('cloneFilterTree', () => {
        it('深拷贝条件节点', () => {
            const cond = createCondition('users', 'id', '=', 1);
            const cloned = cloneFilterTree(cond) as FilterCondition;
            expect(cloned.id).not.toBe(cond.id);
            expect(cloned.table).toBe(cond.table);
            expect(cloned.column).toBe(cond.column);
        });

        it('深拷贝数组值', () => {
            const cond = createCondition('users', 'city', 'IN', ['北京', '上海']);
            const cloned = cloneFilterTree(cond) as FilterCondition;
            expect(cloned.value).toEqual(cond.value);
            expect(cloned.value).not.toBe(cond.value);
        });
    });

    describe('groupNodes', () => {
        it('将两个节点合并为分组', () => {
            const cond1 = createCondition('users', 'a', '=', 1);
            const cond2 = createCondition('users', 'b', '=', 2);
            let tree = createEmptyGroup();
            tree = addConditionToTree(tree, cond1);
            tree = addConditionToTree(tree, cond2);

            const newTree = groupNodes(tree, cond1.id, cond2.id, 'OR');
            expect(newTree.children).toHaveLength(1);
            expect(newTree.children[0].type).toBe('group');
            const innerGroup = newTree.children[0] as FilterGroup;
            expect(innerGroup.logic).toBe('OR');
            expect(innerGroup.children).toHaveLength(2);
        });
    });
});

// ============================================
// Placement 函数测试
// ============================================

describe('Placement Functions', () => {
    describe('separateConditionsByPlacement', () => {
        it('分离 ON 和 WHERE 条件', () => {
            const onCond: FilterCondition = { ...createCondition('orders', 'status', '=', 'active'), placement: 'on' };
            const whereCond: FilterCondition = { ...createCondition('users', 'age', '>', 18), placement: 'where' };
            const noPlacem: FilterCondition = createCondition('users', 'name', 'LIKE', '%test%'); // 无 placement

            const tree: FilterGroup = {
                id: 'root',
                type: 'group',
                logic: 'AND',
                children: [onCond, whereCond, noPlacem],
            };

            const { onConditions, whereConditions } = separateConditionsByPlacement(tree);
            expect(onConditions).toHaveLength(1);
            expect(onConditions[0].table).toBe('orders');
            expect(whereConditions).toHaveLength(2); // whereCond + noPlacem (无 placement 默认 WHERE)
        });

        it('空树返回空数组', () => {
            const emptyTree = createEmptyGroup();
            const { onConditions, whereConditions } = separateConditionsByPlacement(emptyTree);
            expect(onConditions).toHaveLength(0);
            expect(whereConditions).toHaveLength(0);
        });
    });

    describe('cloneTreeWithoutOnConditions', () => {
        it('移除 ON 条件', () => {
            const onCond: FilterCondition = { ...createCondition('orders', 'status', '=', 'active'), placement: 'on' };
            const whereCond: FilterCondition = { ...createCondition('users', 'age', '>', 18), placement: 'where' };

            const tree: FilterGroup = {
                id: 'root',
                type: 'group',
                logic: 'AND',
                children: [onCond, whereCond],
            };

            const cloned = cloneTreeWithoutOnConditions(tree);
            expect(cloned.children).toHaveLength(1);
            expect((cloned.children[0] as FilterCondition).table).toBe('users');
        });

        it('嵌套 group 中的 ON 条件也被移除', () => {
            const onCond: FilterCondition = { ...createCondition('orders', 'id', '=', 1), placement: 'on' };
            const whereCond: FilterCondition = { ...createCondition('users', 'name', '=', 'test'), placement: 'where' };

            const innerGroup: FilterGroup = {
                id: 'inner',
                type: 'group',
                logic: 'OR',
                children: [onCond, whereCond],
            };

            const tree: FilterGroup = {
                id: 'root',
                type: 'group',
                logic: 'AND',
                children: [innerGroup],
            };

            const cloned = cloneTreeWithoutOnConditions(tree);
            const clonedInner = cloned.children[0] as FilterGroup;
            expect(clonedInner.children).toHaveLength(1);
        });
    });

    describe('getConditionsForTable', () => {
        it('按表名筛选条件', () => {
            const cond1 = createCondition('orders', 'id', '=', 1);
            const cond2 = createCondition('users', 'name', '=', 'test');
            const cond3 = createCondition('orders', 'status', '=', 'active');

            const result = getConditionsForTable([cond1, cond2, cond3], 'orders');
            expect(result).toHaveLength(2);
            expect(result.every(c => c.table === 'orders')).toBe(true);
        });

        it('未匹配表名返回空数组', () => {
            const cond = createCondition('users', 'id', '=', 1);
            const result = getConditionsForTable([cond], 'orders');
            expect(result).toHaveLength(0);
        });
    });

    describe('generateConditionsSQL', () => {
        it('生成 AND 连接的条件 SQL', () => {
            const cond1 = createCondition('orders', 'status', '=', 'active');
            const cond2 = createCondition('orders', 'amount', '>', 100);

            const sql = generateConditionsSQL([cond1, cond2]);
            expect(sql).toBe('"orders"."status" = \'active\' AND "orders"."amount" > 100');
        });

        it('空条件返回空字符串', () => {
            expect(generateConditionsSQL([])).toBe('');
        });

        it('单条件直接返回', () => {
            const cond = createCondition('users', 'id', '=', 1);
            expect(generateConditionsSQL([cond])).toBe('"users"."id" = 1');
        });
    });

    describe('getDefaultPlacement', () => {
        it('无 context 返回 where', () => {
            expect(getDefaultPlacement()).toBe('where');
            expect(getDefaultPlacement(undefined)).toBe('where');
        });

        it('LEFT JOIN 右表返回 on', () => {
            const context: PlacementContext = { isRightTable: true, joinType: 'LEFT JOIN' };
            expect(getDefaultPlacement(context)).toBe('on');
        });

        it('LEFT JOIN 左表返回 where', () => {
            const context: PlacementContext = { isRightTable: false, joinType: 'LEFT JOIN' };
            expect(getDefaultPlacement(context)).toBe('where');
        });

        it('INNER JOIN 右表返回 where', () => {
            const context: PlacementContext = { isRightTable: true, joinType: 'INNER JOIN' };
            expect(getDefaultPlacement(context)).toBe('where');
        });

        it('FULL JOIN 右表返回 on', () => {
            const context: PlacementContext = { isRightTable: true, joinType: 'FULL JOIN' };
            expect(getDefaultPlacement(context)).toBe('on');
        });
    });

    describe('canPlaceInOrGroup', () => {
        it('ON 条件不能放入 OR 分组', () => {
            const cond: FilterCondition = { ...createCondition('orders', 'id', '=', 1), placement: 'on' };
            expect(canPlaceInOrGroup(cond)).toBe(false);
        });

        it('WHERE 条件可以放入 OR 分组', () => {
            const cond: FilterCondition = { ...createCondition('users', 'id', '=', 1), placement: 'where' };
            expect(canPlaceInOrGroup(cond)).toBe(true);
        });

        it('无 placement 条件可以放入 OR 分组', () => {
            const cond = createCondition('users', 'id', '=', 1);
            expect(canPlaceInOrGroup(cond)).toBe(true);
        });
    });

    describe('groupContainsOnConditions', () => {
        it('包含 ON 条件返回 true', () => {
            const onCond: FilterCondition = { ...createCondition('orders', 'id', '=', 1), placement: 'on' };
            const tree: FilterGroup = {
                id: 'root',
                type: 'group',
                logic: 'AND',
                children: [onCond],
            };
            expect(groupContainsOnConditions(tree)).toBe(true);
        });

        it('不包含 ON 条件返回 false', () => {
            const whereCond: FilterCondition = { ...createCondition('users', 'id', '=', 1), placement: 'where' };
            const tree: FilterGroup = {
                id: 'root',
                type: 'group',
                logic: 'AND',
                children: [whereCond],
            };
            expect(groupContainsOnConditions(tree)).toBe(false);
        });

        it('嵌套 group 中包含 ON 条件返回 true', () => {
            const onCond: FilterCondition = { ...createCondition('orders', 'id', '=', 1), placement: 'on' };
            const innerGroup: FilterGroup = {
                id: 'inner',
                type: 'group',
                logic: 'OR',
                children: [onCond],
            };
            const tree: FilterGroup = {
                id: 'root',
                type: 'group',
                logic: 'AND',
                children: [innerGroup],
            };
            expect(groupContainsOnConditions(tree)).toBe(true);
        });
    });
});
