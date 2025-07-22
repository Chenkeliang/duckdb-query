# Execute SQL 端点架构设计文档

## 🎯 正确的架构理解

### 📋 数据流程设计
```
数据库连接 → 自定义SQL查询 → 保存到DuckDB → 关联查询
    ↓              ↓              ↓           ↓
  数据源        获取数据        DuckDB表    新数据源
```

## 🔧 核心概念

### 1. 数据库连接作为数据源
- **作用**: 仅作为数据源配置，不直接进行查询
- **配置**: 包含连接信息（host, port, database, username, password）
- **标识**: 通过数据源ID（如"sorder"）进行引用

### 2. 自定义SQL查询
- **目的**: 用户输入SQL语句从数据库获取特定数据
- **要求**: 数据库类型的数据源必须提供自定义SQL查询
- **示例**: `SELECT * FROM dy_order WHERE state = 'TRADE_FINISHED' LIMIT 100`

### 3. 保存到DuckDB
- **功能**: 将查询结果保存为DuckDB表
- **别名**: 支持用户自定义表别名
- **用途**: 作为新的数据源供后续查询使用

### 4. 关联查询
- **能力**: DuckDB表可与其他数据源进行JOIN操作
- **灵活性**: 支持多表关联、复杂查询等

## 🛠️ API端点设计

### 1. `/api/execute_sql` - 执行SQL查询
**功能**: 对数据库执行自定义SQL查询

**请求格式**:
```json
{
  "sql": "SELECT * FROM dy_order LIMIT 10",
  "datasource": {
    "type": "mysql",
    "id": "sorder"
  }
}
```

**响应格式**:
```json
{
  "success": true,
  "data": [...],
  "columns": [...],
  "rowCount": 10,
  "source_type": "database",
  "source_id": "sorder",
  "sql_query": "SELECT * FROM dy_order LIMIT 10",
  "can_save_to_duckdb": true
}
```

### 2. `/api/save_query_to_duckdb` - 保存查询结果
**功能**: 将数据库查询结果保存到DuckDB

**请求格式**:
```json
{
  "sql": "SELECT * FROM dy_order WHERE state = 'TRADE_FINISHED'",
  "datasource": {
    "type": "mysql",
    "id": "sorder"
  },
  "table_alias": "finished_orders"
}
```

**响应格式**:
```json
{
  "success": true,
  "message": "查询结果已保存为DuckDB表: finished_orders",
  "table_alias": "finished_orders",
  "row_count": 1500,
  "columns": [...],
  "source_sql": "SELECT * FROM dy_order WHERE state = 'TRADE_FINISHED'",
  "source_datasource": "sorder"
}
```

### 3. `/api/duckdb_tables` - 列出DuckDB表
**功能**: 获取DuckDB中所有可用表的信息

**响应格式**:
```json
{
  "success": true,
  "tables": [
    {
      "table_name": "finished_orders",
      "row_count": 1500,
      "columns": ["id", "order_id", "state", "total_fee"],
      "column_count": 4
    }
  ],
  "total_tables": 1
}
```

## 🔄 使用流程

### 步骤1: 配置数据库连接
```json
{
  "id": "sorder",
  "type": "mysql",
  "name": "订单数据库",
  "params": {
    "host": "rr-2ze4ks6ww80gpae5z723.mysql.rds.aliyuncs.com",
    "port": 3306,
    "database": "store_order",
    "username": "dataread",
    "password": "GQgx7jbP"
  }
}
```

### 步骤2: 执行自定义SQL查询
```sql
-- 查询已完成的订单
SELECT id, order_id, state, total_fee, pay_time 
FROM dy_order 
WHERE state = 'TRADE_FINISHED' 
AND pay_time >= '2020-02-01'
LIMIT 1000
```

### 步骤3: 保存查询结果到DuckDB
- 表别名: `finished_orders_2020`
- 用途: 作为新数据源供关联查询

### 步骤4: 关联查询示例
```sql
-- 与其他数据源关联
SELECT fo.order_id, fo.total_fee, od.product_name
FROM finished_orders_2020 fo
JOIN other_datasource od ON fo.order_id = od.order_id
WHERE fo.total_fee > 100
```

## 🎯 前端交互设计

### 1. SQL查询界面
- **输入框**: 用户输入自定义SQL
- **数据源选择**: 选择已配置的数据库连接
- **执行按钮**: 执行查询并显示结果
- **保存按钮**: 将结果保存到DuckDB

### 2. 保存对话框
- **表别名输入**: 用户指定DuckDB表名
- **确认保存**: 执行保存操作
- **成功提示**: 显示保存结果

### 3. 数据源管理
- **DuckDB表列表**: 显示已保存的表
- **表信息**: 行数、列数、列名等
- **删除操作**: 删除不需要的表

## 🔍 技术实现要点

### 1. 数据库查询执行
```python
# 使用database_manager执行查询
result_df = db_manager.execute_query(datasource_id, sql_query)
```

### 2. DuckDB表注册
```python
# 注册DataFrame到DuckDB
con = get_db_connection()
con.register(table_alias, result_df)
```

### 3. 数据类型处理
```python
# 处理特殊数据类型
result_df.replace([np.inf, -np.inf], np.nan, inplace=True)
result_df = result_df.astype(object).where(pd.notnull(result_df), None)
```

## 🎉 优势特点

### 1. 灵活性
- 支持任意SQL查询
- 自定义表别名
- 多数据源关联

### 2. 性能
- DuckDB内存计算
- 高效的列式存储
- 快速JOIN操作

### 3. 易用性
- 直观的操作流程
- 清晰的数据流向
- 友好的用户界面

### 4. 扩展性
- 支持多种数据库类型
- 可添加更多数据源
- 灵活的查询组合

## 📝 注意事项

1. **SQL安全**: 需要对用户输入的SQL进行安全检查
2. **内存管理**: 大数据集可能占用较多内存
3. **权限控制**: 确保数据库连接权限合适
4. **错误处理**: 提供清晰的错误信息和建议

这个架构设计确保了数据查询的灵活性和系统的可扩展性，为用户提供了强大的数据分析能力。
