# 🚀 DuckDB SQL 编辑器使用指南

## 📖 概述

本项目已集成 Monaco Editor + DuckDB 自定义配置，为 SQL 查询提供了强大的编辑体验，包括语法高亮、自动补全、智能提示等功能。

## ✨ 主要功能

### 1. 🎨 语法高亮
- **标准 SQL 关键字**：SELECT, FROM, WHERE, JOIN, GROUP BY 等
- **DuckDB 特有函数**：read_csv(), read_parquet(), list_agg(), unnest() 等
- **数据类型**：字符串、数字、注释等不同颜色显示

### 2. 🔧 智能自动补全
- **SQL 关键字补全**：输入时自动提示 SQL 关键字
- **DuckDB 函数补全**：支持 DuckDB 特有函数的自动补全
- **表名补全**：自动提示当前可用的表名
- **代码片段**：支持模板代码片段快速插入

### 3. 📝 查询模板系统
- **基础查询模板**：查看数据、统计、去重等
- **数据分析模板**：分组统计、排序、聚合计算等
- **DuckDB 特有功能**：文件读取、列表操作、JSON 处理等
- **表关联模板**：内连接、左连接、多表关联等
- **高级查询模板**：子查询、CTE、递归查询等

### 4. ✅ 实时语法检查
- **语法错误检测**：实时检查 SQL 语法错误
- **表名验证**：检查表名是否存在
- **性能建议**：提供查询优化建议
- **最佳实践提示**：推荐 SQL 编写最佳实践

## 🎯 使用方法

### 1. 访问 SQL 编辑器
1. 打开应用首页
2. 点击 "🚀 增强SQL执行器" 部分
3. 在右侧面板中可以看到两个标签页：
   - **SQL编辑器**：Monaco Editor 编辑器
   - **查询模板**：预设的查询模板

### 2. 使用 SQL 编辑器
1. **基本编辑**：
   - 直接在编辑器中输入 SQL 语句
   - 支持语法高亮和自动缩进
   - 使用 `Ctrl+Space` 触发自动补全

2. **自动补全**：
   - 输入 `SELECT` 后按 `Ctrl+Space` 查看可用选项
   - 输入 `read_` 查看 DuckDB 文件读取函数
   - 输入表名时自动提示当前可用表

3. **代码片段**：
   - 输入 `read_csv` 并按 `Tab` 键自动补全函数调用
   - 支持参数占位符，按 `Tab` 键在参数间跳转

### 3. 使用查询模板
1. **选择模板**：
   - 点击 "查询模板" 标签页
   - 浏览不同类别的模板
   - 点击模板卡片查看详细信息

2. **应用模板**：
   - 点击模板卡片将 SQL 填充到编辑器
   - 点击播放按钮直接执行模板查询
   - 点击复制按钮复制 SQL 到剪贴板

3. **自定义模板**：
   - 将模板中的 `table_name` 替换为实际表名
   - 根据实际需求修改查询条件

### 4. 语法检查
1. **实时检查**：
   - 编辑器下方显示语法检查结果
   - 错误用红色标记，警告用黄色标记
   - 建议用蓝色标记

2. **查看详情**：
   - 点击展开按钮查看详细错误信息
   - 每个问题都提供具体的修改建议

## 🦆 DuckDB 特有功能

### 1. 文件读取函数
```sql
-- 读取 CSV 文件
SELECT * FROM read_csv('data.csv') LIMIT 10;

-- 读取 Parquet 文件
SELECT * FROM read_parquet('data.parquet') LIMIT 10;

-- 读取 JSON 文件
SELECT * FROM read_json('data.json') LIMIT 10;

-- 读取 Excel 文件
SELECT * FROM read_excel('data.xlsx') LIMIT 10;
```

### 2. 列表操作函数
```sql
-- 列表聚合
SELECT category, list_agg(item_name) as items 
FROM table_name 
GROUP BY category;

-- 展开列表
SELECT unnest(list_column) as item 
FROM table_name;

-- 列表包含检查
SELECT * FROM table_name 
WHERE list_contains(list_column, 'value');
```

### 3. JSON 操作函数
```sql
-- JSON 提取
SELECT json_extract(json_column, '$.key') as value 
FROM table_name;

-- JSON 对象创建
SELECT json_object('name', name, 'age', age) as person 
FROM table_name;
```

## 💡 最佳实践

### 1. 查询优化
- 使用 `LIMIT` 限制结果数量
- 添加 `WHERE` 条件过滤数据
- 使用 `ORDER BY` 确保结果一致性
- 避免使用 `SELECT *`，只选择需要的列

### 2. 错误处理
- 检查表名是否正确
- 确保 SQL 语法完整
- 验证数据类型匹配
- 注意引号的使用

### 3. 性能考虑
- 大表查询时添加适当的过滤条件
- 使用索引列进行排序和过滤
- 避免在 WHERE 子句中使用函数
- 合理使用 JOIN 和子查询

## 🔧 快捷键

| 快捷键 | 功能 |
|--------|------|
| `Ctrl+Space` | 触发自动补全 |
| `Ctrl+Shift+Space` | 触发参数提示 |
| `F12` | 跳转到定义 |
| `Shift+F12` | 查找所有引用 |
| `Ctrl+/` | 切换注释 |
| `Ctrl+D` | 选择下一个相同项 |
| `Alt+Shift+F` | 格式化代码 |

## 🐛 常见问题

### 1. 自动补全不工作
- 确保输入了有效的 SQL 关键字
- 检查网络连接是否正常
- 刷新页面重新加载编辑器

### 2. 语法检查不准确
- 语法检查基于规则匹配，可能不完全准确
- 实际执行时 DuckDB 会进行更严格的检查
- 建议以实际执行结果为准

### 3. 模板无法使用
- 确保当前有可用的表
- 检查表名是否正确
- 验证 SQL 语法是否完整

## 📞 技术支持

如果遇到问题，请：
1. 检查浏览器控制台是否有错误信息
2. 确认 Monaco Editor 是否正确加载
3. 验证 DuckDB 连接是否正常
4. 查看应用日志获取更多信息

---

**享受使用增强的 SQL 编辑器！** 🎉
