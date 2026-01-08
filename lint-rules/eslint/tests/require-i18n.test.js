/**
 * require-i18n 规则测试
 */

const { RuleTester } = require('eslint');
const rule = require('../rules/require-i18n');

const ruleTester = new RuleTester({
  parserOptions: {
    ecmaVersion: 2021,
    sourceType: 'module',
    ecmaFeatures: {
      jsx: true,
    },
  },
});

ruleTester.run('require-i18n', rule, {
  valid: [
    // ✅ 使用 i18n
    {
      code: `
        import { useTranslation } from 'react-i18next';
        function MyComponent() {
          const { t } = useTranslation('common');
          return <div>{t('welcome.title')}</div>;
        }
      `,
      filename: 'frontend/src/new/MyComponent.tsx',
    },

    // ✅ 英文文本（不检查）
    {
      code: `
        function MyComponent() {
          return <div>Welcome</div>;
        }
      `,
      filename: 'frontend/src/new/MyComponent.tsx',
    },

    // ✅ 测试文件（不检查）
    {
      code: `
        describe('测试用例', () => {
          it('应该成功', () => {
            expect(true).toBe(true);
          });
        });
      `,
      filename: 'frontend/src/new/__tests__/MyComponent.test.tsx',
    },

    // ✅ 旧布局（不检查）
    {
      code: `
        function MyComponent() {
          return <div>欢迎使用</div>;
        }
      `,
      filename: 'frontend/src/components/MyComponent.tsx',
    },

    // ✅ 白名单中的文本
    {
      code: `
        function MyComponent() {
          return <div>DuckDB</div>;
        }
      `,
      filename: 'frontend/src/new/MyComponent.tsx',
      options: [{ allowList: ['DuckDB'] }],
    },

    // ✅ console.log（默认不检查）
    {
      code: `
        function MyComponent() {
          console.log('调试信息');
          return <div>Test</div>;
        }
      `,
      filename: 'frontend/src/new/MyComponent.tsx',
    },
  ],

  invalid: [
    // ❌ JSX 文本节点中的中文
    {
      code: `
        function MyComponent() {
          return <div>欢迎使用</div>;
        }
      `,
      filename: 'frontend/src/new/MyComponent.tsx',
      errors: [
        {
          messageId: 'chineseTextFound',
          data: { text: '欢迎使用' },
        },
      ],
    },

    // ❌ 按钮文本
    {
      code: `
        function MyComponent() {
          return <Button>提交</Button>;
        }
      `,
      filename: 'frontend/src/new/MyComponent.tsx',
      errors: [
        {
          messageId: 'chineseTextFound',
          data: { text: '提交' },
        },
      ],
    },

    // ❌ 属性中的中文
    {
      code: `
        function MyComponent() {
          return <Input placeholder="请输入内容" />;
        }
      `,
      filename: 'frontend/src/new/MyComponent.tsx',
      errors: [
        {
          messageId: 'chineseTextFound',
          data: { text: '请输入内容' },
        },
      ],
    },

    // ❌ 字符串字面量
    {
      code: `
        const message = "操作成功";
      `,
      filename: 'frontend/src/new/MyComponent.tsx',
      errors: [
        {
          messageId: 'chineseTextFound',
          data: { text: '操作成功' },
        },
      ],
    },

    // ❌ 模板字符串
    {
      code: `
        const greeting = \`你好，\${name}\`;
      `,
      filename: 'frontend/src/new/MyComponent.tsx',
      errors: [
        {
          messageId: 'chineseTextFound',
          data: { text: '你好，' },
        },
      ],
    },

    // ❌ 对象属性值
    {
      code: `
        const config = {
          title: "设置",
          description: "系统设置页面"
        };
      `,
      filename: 'frontend/src/new/MyComponent.tsx',
      errors: [
        {
          messageId: 'chineseTextFound',
          data: { text: '设置' },
        },
        {
          messageId: 'chineseTextFound',
          data: { text: '系统设置页面' },
        },
      ],
    },

    // ❌ Toast 消息
    {
      code: `
        toast.success('保存成功');
        toast.error('保存失败');
      `,
      filename: 'frontend/src/new/MyComponent.tsx',
      errors: [
        {
          messageId: 'chineseTextFound',
          data: { text: '保存成功' },
        },
        {
          messageId: 'chineseTextFound',
          data: { text: '保存失败' },
        },
      ],
    },

    // ❌ console.log（启用检查时）
    {
      code: `
        console.log('调试信息');
      `,
      filename: 'frontend/src/new/MyComponent.tsx',
      options: [{ checkConsole: true }],
      errors: [
        {
          messageId: 'chineseTextFound',
          data: { text: '调试信息' },
        },
      ],
    },

    // ❌ 最小字符数检查
    {
      code: `
        const text = "中";
      `,
      filename: 'frontend/src/new/MyComponent.tsx',
      options: [{ minChineseChars: 1 }],
      errors: [
        {
          messageId: 'chineseTextFound',
          data: { text: '中' },
        },
      ],
    },
  ],
});

console.log('✅ require-i18n 规则测试通过');
