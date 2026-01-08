# require-i18n

检测代码中的中文字符串，要求使用 i18n 国际化。

## 📋 规则详情

此规则会检测以下位置的中文字符串：

- ✅ JSX 文本节点
- ✅ JSX 属性值
- ✅ 字符串字面量
- ✅ 模板字符串
- ⚠️ 注释（可选）
- ⚠️ console.log（可选）

## ❌ 错误示例

```tsx
// ❌ 错误：JSX 文本节点中的中文
function MyComponent() {
  return <div>欢迎使用</div>;
}

// ❌ 错误：按钮文本
function MyButton() {
  return <Button>提交</Button>;
}

// ❌ 错误：属性中的中文
function MyInput() {
  return <Input placeholder="请输入内容" />;
}

// ❌ 错误：字符串字面量
const message = "操作成功";

// ❌ 错误：模板字符串
const greeting = `你好，${name}`;

// ❌ 错误：对象属性值
const config = {
  title: "设置",
  description: "系统设置页面"
};
```

## ✅ 正确示例

```tsx
import { useTranslation } from 'react-i18next';

// ✅ 正确：使用 i18n
function MyComponent() {
  const { t } = useTranslation('common');
  
  return (
    <div>
      <h1>{t('welcome.title')}</h1>
      <Button>{t('actions.submit')}</Button>
      <Input placeholder={t('input.placeholder')} />
    </div>
  );
}

// ✅ 正确：使用 i18n 的消息
const message = t('messages.success');

// ✅ 正确：使用 i18n 的模板
const greeting = t('greetings.hello', { name });

// ✅ 正确：配置对象使用 i18n
const config = {
  title: t('settings.title'),
  description: t('settings.description')
};
```

## 🔧 配置选项

```javascript
{
  "rules": {
    "duckquery/require-i18n": ["warn", {
      // 允许的中文文本白名单
      "allowList": ["DuckDB", "SQL"],
      
      // 是否检查注释中的中文
      "checkComments": false,
      
      // 是否检查 console.log 中的中文
      "checkConsole": false,
      
      // 最小中文字符数（少于此数量不报错）
      "minChineseChars": 1
    }]
  }
}
```

### 配置说明

#### `allowList` (Array)

允许的中文文本白名单。某些专有名词或品牌名称可以不翻译。

```javascript
{
  "allowList": [
    "DuckDB",      // 产品名称
    "SQL",         // 技术术语
    "MySQL",       // 数据库名称
    "PostgreSQL"
  ]
}
```

#### `checkComments` (Boolean)

是否检查注释中的中文。默认 `false`。

```javascript
{
  "checkComments": true  // 启用注释检查
}
```

**注意**：通常不建议检查注释，因为注释主要是给开发者看的。

#### `checkConsole` (Boolean)

是否检查 `console.log` 等调试语句中的中文。默认 `false`。

```javascript
{
  "checkConsole": true  // 启用 console 检查
}
```

**注意**：调试语句通常在生产环境中会被移除，可以不检查。

#### `minChineseChars` (Number)

最小中文字符数。少于此数量的中文不会报错。默认 `1`。

```javascript
{
  "minChineseChars": 2  // 只检查 2 个及以上的中文字符
}
```

## 🎯 使用场景

### 场景 1: 新功能开发

开发新功能时，确保所有用户可见的文本都使用 i18n：

```tsx
// ❌ 错误
function NewFeature() {
  return (
    <Card>
      <CardTitle>新功能</CardTitle>
      <CardDescription>这是一个新功能的描述</CardDescription>
    </Card>
  );
}

// ✅ 正确
function NewFeature() {
  const { t } = useTranslation('features');
  
  return (
    <Card>
      <CardTitle>{t('newFeature.title')}</CardTitle>
      <CardDescription>{t('newFeature.description')}</CardDescription>
    </Card>
  );
}
```

### 场景 2: 错误消息

错误消息和提示信息必须使用 i18n：

```tsx
// ❌ 错误
try {
  await saveData();
  toast.success('保存成功');
} catch (error) {
  toast.error('保存失败：' + error.message);
}

// ✅ 正确
const { t } = useTranslation('common');

try {
  await saveData();
  toast.success(t('messages.saveSuccess'));
} catch (error) {
  toast.error(t('messages.saveError', { error: error.message }));
}
```

### 场景 3: 表单验证

表单验证消息也需要国际化：

```tsx
// ❌ 错误
const schema = z.object({
  name: z.string().min(1, '名称不能为空'),
  email: z.string().email('邮箱格式不正确'),
});

// ✅ 正确
const { t } = useTranslation('validation');

const schema = z.object({
  name: z.string().min(1, t('name.required')),
  email: z.string().email(t('email.invalid')),
});
```

### 场景 4: 动态文本

包含变量的动态文本：

```tsx
// ❌ 错误
const message = `共 ${count} 条记录`;

// ✅ 正确
const { t } = useTranslation('common');
const message = t('records.count', { count });
```

## 📝 翻译文件组织

### 推荐的翻译文件结构

```
frontend/src/i18n/locales/
├── zh/
│   ├── common.json          # 通用翻译
│   ├── validation.json      # 验证消息
│   ├── errors.json          # 错误消息
│   └── features/
│       ├── query.json       # 查询功能
│       ├── datasource.json  # 数据源功能
│       └── settings.json    # 设置功能
└── en/
    ├── common.json
    ├── validation.json
    ├── errors.json
    └── features/
        ├── query.json
        ├── datasource.json
        └── settings.json
```

### 翻译 Key 命名规范

```json
{
  "actions": {
    "submit": "提交",
    "cancel": "取消",
    "save": "保存",
    "delete": "删除"
  },
  "messages": {
    "saveSuccess": "保存成功",
    "saveError": "保存失败",
    "deleteConfirm": "确定要删除吗？"
  },
  "validation": {
    "required": "此字段为必填项",
    "email": "请输入有效的邮箱地址",
    "minLength": "至少需要 {{min}} 个字符"
  }
}
```

## 🚫 例外情况

### 1. 测试文件

测试文件中的中文不会被检查：

```tsx
// ✅ 测试文件中可以使用中文
describe('用户登录功能', () => {
  it('应该成功登录', () => {
    // 测试代码
  });
});
```

### 2. 注释（默认）

默认情况下，注释中的中文不会被检查：

```tsx
// ✅ 注释中可以使用中文
// 这是一个处理用户登录的函数
function handleLogin() {
  // ...
}
```

### 3. 调试语句（默认）

默认情况下，`console.log` 中的中文不会被检查：

```tsx
// ✅ console.log 中可以使用中文（默认配置）
console.log('用户登录成功');
console.error('登录失败：', error);
```

### 4. 白名单

配置的白名单中的文本不会被检查：

```tsx
// ✅ 白名单中的文本可以使用
const title = "DuckDB 查询工具"; // "DuckDB" 在白名单中
```

## 🔄 迁移指南

### 步骤 1: 识别需要翻译的文本

运行 ESLint 检查，找出所有需要翻译的中文文本：

```bash
npm run lint
```

### 步骤 2: 添加翻译 Key

在翻译文件中添加对应的 key：

```json
// frontend/src/i18n/locales/zh/common.json
{
  "welcome": {
    "title": "欢迎使用",
    "description": "这是一个数据查询工具"
  }
}

// frontend/src/i18n/locales/en/common.json
{
  "welcome": {
    "title": "Welcome",
    "description": "This is a data query tool"
  }
}
```

### 步骤 3: 替换硬编码文本

```tsx
// 修改前
function Welcome() {
  return <h1>欢迎使用</h1>;
}

// 修改后
import { useTranslation } from 'react-i18next';

function Welcome() {
  const { t } = useTranslation('common');
  return <h1>{t('welcome.title')}</h1>;
}
```

### 步骤 4: 验证

重新运行 ESLint 检查，确保没有遗漏：

```bash
npm run lint
```

## 💡 最佳实践

### 1. 使用语义化的 Key

```json
// ❌ 不好
{
  "text1": "提交",
  "text2": "取消"
}

// ✅ 好
{
  "actions": {
    "submit": "提交",
    "cancel": "取消"
  }
}
```

### 2. 按功能模块组织

```json
// ✅ 按功能模块组织
{
  "query": {
    "title": "查询",
    "execute": "执行查询",
    "saveAs": "另存为"
  },
  "datasource": {
    "title": "数据源",
    "add": "添加数据源",
    "delete": "删除数据源"
  }
}
```

### 3. 使用插值变量

```json
// ✅ 使用插值变量
{
  "messages": {
    "recordCount": "共 {{count}} 条记录",
    "greeting": "你好，{{name}}"
  }
}
```

### 4. 提供上下文

```json
// ✅ 提供上下文信息
{
  "delete": {
    "button": "删除",           // 按钮文本
    "confirm": "确定要删除吗？", // 确认消息
    "success": "删除成功",       // 成功消息
    "error": "删除失败"          // 错误消息
  }
}
```

## 🔗 相关资源

- [react-i18next 官方文档](https://react.i18next.com/)
- [i18next 官方文档](https://www.i18next.com/)
- [项目 i18n 使用指南](../../../frontend/src/i18n/README.md)
- [前端开发约束](../../../.kiro/steering/frontend-constraints.md)

## 📊 规则统计

| 检查项 | 默认状态 | 可配置 |
|--------|---------|--------|
| JSX 文本 | ✅ 启用 | ❌ |
| JSX 属性 | ✅ 启用 | ❌ |
| 字符串字面量 | ✅ 启用 | ❌ |
| 模板字符串 | ✅ 启用 | ❌ |
| 注释 | ❌ 禁用 | ✅ |
| console.log | ❌ 禁用 | ✅ |
| 测试文件 | ❌ 禁用 | ❌ |

---

**规则类型**: suggestion  
**严重程度**: warn  
**可自动修复**: ❌  
**需要类型信息**: ❌
