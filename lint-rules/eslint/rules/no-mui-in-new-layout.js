/**
 * 规则: no-mui-in-new-layout
 *
 * 禁止在新布局（frontend/src/）中使用 MUI 组件
 *
 * 新布局必须使用 Shadcn/UI 组件库
 */

module.exports = {
  meta: {
    type: "problem",
    docs: {
      description: "禁止在新布局中使用 MUI 组件",
      category: "Best Practices",
      recommended: true,
      url:
        "https://github.com/your-org/duckquery/blob/main/lint-rules/eslint/docs/no-mui-in-new-layout.md"
    },
    messages: {
      noMuiInNewLayout:
        "❌ 新布局禁止使用 MUI 组件 ({{importSource}})，请使用 Shadcn/UI 组件",
      suggestion: "建议使用: {{suggestion}}"
    },
    schema: [],
    fixable: null
  },

  create(context) {
    const filename = context.getFilename();

    // 只检查新布局目录下的文件（已扁平化至 src 根）
    const isNewLayout =
      filename.includes("/src/") || filename.includes("\\src\\");

    if (!isNewLayout) {
      return {};
    }

    // MUI 包名列表
    const muiPackages = [
      "@mui/material",
      "@mui/icons-material",
      "@mui/lab",
      "@mui/x-data-grid",
      "@mui/x-date-pickers",
      "@mui/system",
      "@mui/styled-engine"
    ];

    // MUI 到 Shadcn/UI 的映射建议
    const componentSuggestions = {
      Button: "@/components/ui/button",
      TextField: "@/components/ui/input",
      Dialog: "@/components/ui/dialog",
      Card: "@/components/ui/card",
      Select: "@/components/ui/select",
      Checkbox: "@/components/ui/checkbox",
      Switch: "@/components/ui/switch",
      Tabs: "@/components/ui/tabs",
      Tooltip: "@/components/ui/tooltip",
      Menu: "@/components/ui/dropdown-menu",
      Popover: "@/components/ui/popover",
      Alert: "@/components/ui/alert",
      Badge: "@/components/ui/badge",
      Avatar: "@/components/ui/avatar"
    };

    return {
      ImportDeclaration(node) {
        const importSource = node.source.value;

        // 检查是否导入了 MUI 包
        const isMuiImport = muiPackages.some(pkg =>
          importSource.startsWith(pkg)
        );

        if (isMuiImport) {
          // 尝试提供替代建议
          let suggestion = "";
          if (node.specifiers.length > 0) {
            const importedName =
              node.specifiers[0].imported?.name ||
              node.specifiers[0].local.name;
            if (componentSuggestions[importedName]) {
              suggestion = componentSuggestions[importedName];
            }
          }

          context.report({
            node,
            messageId: "noMuiInNewLayout",
            data: {
              importSource
            },
            suggest: suggestion
              ? [
                  {
                    messageId: "suggestion",
                    data: { suggestion },
                    fix: null // 不自动修复，需要手动调整
                  }
                ]
              : undefined
          });
        }
      }
    };
  }
};
