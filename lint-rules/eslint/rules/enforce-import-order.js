/**
 * @fileoverview 强制执行导入顺序规范
 * @author DuckQuery Team
 */

"use strict";

module.exports = {
  meta: {
    type: "suggestion",
    docs: {
      description: "强制执行导入顺序规范",
      category: "Stylistic Issues",
      recommended: true,
      url:
        "https://github.com/duckquery/lint-rules/blob/main/eslint/docs/enforce-import-order.md"
    },
    fixable: "code",
    messages: {
      wrongOrder: "导入顺序不正确。期望顺序：{{expected}}",
      missingNewline: "导入组之间应该有空行",
      extraNewline: "导入组内不应该有空行"
    },
    schema: [
      {
        type: "object",
        properties: {
          groups: {
            type: "array",
            items: { type: "string" },
            description: "导入组的顺序"
          },
          pathGroups: {
            type: "array",
            description: "自定义路径组"
          }
        },
        additionalProperties: false
      }
    ]
  },

  create(context) {
    const options = context.options[0] || {};
    const groups = options.groups || [
      "react", // React 相关
      "external", // 外部依赖
      "internal", // 内部模块
      "components", // 组件
      "hooks", // Hooks
      "utils", // 工具函数
      "types", // 类型定义
      "styles" // 样式
    ];

    const pathGroups = options.pathGroups || [
      { pattern: "react", group: "react", position: "before" },
      { pattern: "react-*", group: "react", position: "before" },
      { pattern: "@tanstack/**", group: "external", position: "before" },
      {
        pattern: "@/components/ui/**",
        group: "components",
        position: "before"
      },
      { pattern: "@/components/**", group: "components", position: "after" },
      { pattern: "@/hooks/**", group: "hooks", position: "before" },
      { pattern: "@/utils/**", group: "utils", position: "before" },
      { pattern: "@/api/**", group: "internal", position: "before" },
      { pattern: "@/types/**", group: "types", position: "before" },
      { pattern: "*.css", group: "styles", position: "after" },
      { pattern: "*.scss", group: "styles", position: "after" }
    ];

    const sourceCode = context.getSourceCode();
    const imports = [];

    /**
     * 判断导入属于哪个组
     */
    function getImportGroup(importPath) {
      // 检查自定义路径组
      for (const pathGroup of pathGroups) {
        const pattern = pathGroup.pattern.replace(/\*/g, ".*");
        const regex = new RegExp(`^${pattern}$`);
        if (regex.test(importPath)) {
          return pathGroup.group;
        }
      }

      // React 相关
      if (importPath.startsWith("react")) {
        return "react";
      }

      // 外部依赖（不以 . 或 @ 开头）
      if (!importPath.startsWith(".") && !importPath.startsWith("@/")) {
        return "external";
      }

      // 内部模块（@/ 开头）
      if (importPath.startsWith("@/")) {
        // 组件
        if (importPath.includes("/components/")) {
          return "components";
        }
        // Hooks
        if (importPath.includes("/hooks/")) {
          return "hooks";
        }
        // 工具函数
        if (importPath.includes("/utils/")) {
          return "utils";
        }
        // 类型
        if (importPath.includes("/types/")) {
          return "types";
        }
        // API
        if (importPath.includes("/api/")) {
          return "internal";
        }
        return "internal";
      }

      // 样式文件
      if (importPath.endsWith(".css") || importPath.endsWith(".scss")) {
        return "styles";
      }

      // 相对路径
      return "internal";
    }

    /**
     * 获取组的优先级
     */
    function getGroupPriority(group) {
      const index = groups.indexOf(group);
      return index === -1 ? groups.length : index;
    }

    /**
     * 检查导入顺序
     */
    function checkImportOrder() {
      if (imports.length === 0) {
        return;
      }

      // 按组分类
      const importsByGroup = {};
      imports.forEach(imp => {
        const group = getImportGroup(imp.source);
        if (!importsByGroup[group]) {
          importsByGroup[group] = [];
        }
        importsByGroup[group].push(imp);
      });

      // 检查顺序
      let lastGroupPriority = -1;
      let lastImport = null;

      imports.forEach((imp, index) => {
        const group = getImportGroup(imp.source);
        const priority = getGroupPriority(group);

        // 检查组顺序
        if (priority < lastGroupPriority) {
          const expectedGroups = groups
            .slice(0, groups.indexOf(group) + 1)
            .join(" → ");
          context.report({
            node: imp.node,
            messageId: "wrongOrder",
            data: { expected: expectedGroups }
          });
        }

        // 检查组之间的空行
        if (lastImport && priority > lastGroupPriority) {
          const lastLine = lastImport.node.loc.end.line;
          const currentLine = imp.node.loc.start.line;

          if (currentLine - lastLine === 1) {
            context.report({
              node: imp.node,
              messageId: "missingNewline",
              fix(fixer) {
                return fixer.insertTextBefore(imp.node, "\n");
              }
            });
          }
        }

        // 检查组内的空行
        if (lastImport && priority === lastGroupPriority) {
          const lastLine = lastImport.node.loc.end.line;
          const currentLine = imp.node.loc.start.line;

          if (currentLine - lastLine > 1) {
            context.report({
              node: imp.node,
              messageId: "extraNewline",
              fix(fixer) {
                const range = [lastImport.node.range[1], imp.node.range[0]];
                return fixer.replaceTextRange(range, "\n");
              }
            });
          }
        }

        lastGroupPriority = priority;
        lastImport = imp;
      });
    }

    return {
      ImportDeclaration(node) {
        imports.push({
          node,
          source: node.source.value
        });
      },

      "Program:exit"() {
        checkImportOrder();
      }
    };
  }
};
