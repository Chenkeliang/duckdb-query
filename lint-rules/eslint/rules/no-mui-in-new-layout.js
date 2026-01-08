/**
 * 规则: no-mui-in-new-layout
 * 
 * 禁止在新布局 (frontend/src/new/) 中使用 MUI 组件
 * 
 * 新布局必须使用 Shadcn/UI 组件库
 */

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description: '禁止在新布局中使用 MUI 组件',
      category: 'Best Practices',
      recommended: true,
      url: 'https://github.com/your-org/duckquery/blob/main/lint-rules/eslint/docs/no-mui-in-new-layout.md',
    },
    messages: {
      noMuiInNewLayout: '❌ 新布局禁止使用 MUI 组件 ({{importSource}})，请使用 Shadcn/UI 组件',
      suggestion: '建议使用: {{suggestion}}',
    },
    schema: [],
    fixable: null,
  },

  create(context) {
    const filename = context.getFilename();
    
    // 只检查新布局目录下的文件
    const isNewLayout = filename.includes('/src/new/') || filename.includes('\\src\\new\\');
    
    if (!isNewLayout) {
      return {};
    }

    // MUI 包名列表
    const muiPackages = [
      '@mui/material',
      '@mui/icons-material',
      '@mui/lab',
      '@mui/x-data-grid',
      '@mui/x-date-pickers',
      '@mui/system',
      '@mui/styled-engine',
    ];

    // MUI 到 Shadcn/UI 的映射建议
    const componentSuggestions = {
      'Button': '@/new/components/ui/button',
      'TextField': '@/new/components/ui/input',
      'Dialog': '@/new/components/ui/dialog',
      'Card': '@/new/components/ui/card',
      'Select': '@/new/components/ui/select',
      'Checkbox': '@/new/components/ui/checkbox',
      'Switch': '@/new/components/ui/switch',
      'Tabs': '@/new/components/ui/tabs',
      'Tooltip': '@/new/components/ui/tooltip',
      'Menu': '@/new/components/ui/dropdown-menu',
      'Popover': '@/new/components/ui/popover',
      'Alert': '@/new/components/ui/alert',
      'Badge': '@/new/components/ui/badge',
      'Avatar': '@/new/components/ui/avatar',
    };

    return {
      ImportDeclaration(node) {
        const importSource = node.source.value;
        
        // 检查是否导入了 MUI 包
        const isMuiImport = muiPackages.some(pkg => importSource.startsWith(pkg));
        
        if (isMuiImport) {
          // 尝试提供替代建议
          let suggestion = '';
          if (node.specifiers.length > 0) {
            const importedName = node.specifiers[0].imported?.name || node.specifiers[0].local.name;
            if (componentSuggestions[importedName]) {
              suggestion = componentSuggestions[importedName];
            }
          }

          context.report({
            node,
            messageId: 'noMuiInNewLayout',
            data: {
              importSource,
            },
            suggest: suggestion ? [{
              messageId: 'suggestion',
              data: { suggestion },
              fix: null, // 不自动修复，需要手动调整
            }] : undefined,
          });
        }
      },
    };
  },
};
