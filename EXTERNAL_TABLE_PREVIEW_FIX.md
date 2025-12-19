# 外部表预览 SQL 生成错误修复

## 问题描述

用户双击左侧外部 MySQL 表 `bschool_order` 时,生成的 SQL 为:
```sql
SELECT * FROM 'bschool_order' LIMIT 10000
```

错误:表名被单引号 `'...'` 包裹,导致 Parser Error。

在 SQL 中:
- 单引号 `'...'` 用于字符串字面量
- 双引号 `"..."` 或反引号 `` `...` `` 用于标识符

对于 MySQL 外部表,应该使用反引号:
```sql
SELECT * FROM `bschool_order` LIMIT 10000
```

## 代码审查结果

已检查的代码(均正确):
1. ✅ `QueryWorkspace.tsx` - `handlePreview` 使用 `quoteQualifiedTable`
2. ✅ `AsyncTaskPanel.tsx` - `handlePreview` 使用 `quoteDuckDBTable`  
3. ✅ `sqlUtils.ts` - `quoteQualifiedTable` 正确实现

## 可能的问题来源

用户可能不是通过新布局的 `QueryWorkspace` 触发预览,而是通过其他路径。需要检查:

1. 是否有其他组件也显示外部表列表并支持预览?
2. 是否有旧代码路径仍在使用?
3. 用户实际使用的是新布局还是旧布局?

## 建议的调查步骤

1. 请用户提供完整的操作步骤截图
2. 确认用户使用的入口(DuckQueryApp 还是 ShadcnApp)
3. 检查浏览器控制台的网络请求,查看实际发送的 SQL
4. 搜索所有可能生成 `LIMIT 10000` 的代码路径

## 临时解决方案

如果用户急需使用,可以:
1. 手动修改 SQL,将单引号改为反引号或双引号
2. 使用右键菜单的"预览"功能而不是双击
3. 在 SQL 查询面板手动输入正确的 SQL

## 需要用户提供的信息

1. 完整的操作步骤(从哪个页面,点击了什么)
2. 浏览器控制台的错误信息
3. 网络请求中的实际 SQL 内容
