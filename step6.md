# 异步任务结果下载格式支持（更新版）

## 功能概述

现在异步任务支持两种输出格式的下载：
1. **Parquet格式**（默认）- 高效的列式存储格式，适合大数据处理
2. **CSV格式** - 通用的表格数据格式，易于在各种工具中打开和处理

## 使用方法

### 1. 提交任务时指定格式

在提交异步查询请求时，可以通过`format`参数指定输出格式：

```json
{
  "sql": "SELECT * FROM \"测试大文件\" LIMIT 1000",
  "format": "csv"  // 或 "parquet"
}
```

### 2. 不指定格式时的行为

如果不指定`format`参数，默认使用Parquet格式：

```json
{
  "sql": "SELECT * FROM \"测试大文件\" LIMIT 1000"
  // 默认为 format: "parquet"
}
```

### 3. 支持的格式

- `parquet` - Apache Parquet格式（默认）
- `csv` - CSV格式

### 4. 错误处理

如果指定了不支持的格式，系统会返回错误：

```json
{
  "success": false,
  "error": {
    "code": "HTTP_ERROR",
    "message": "不支持的输出格式，仅支持 parquet 或 csv",
    "details": {}
  }
}
```

## 示例

### 提交CSV格式任务

```bash
curl -X POST "http://localhost:3000/api/async_query" \
  -H "Content-Type: application/json" \
  -d '{"sql": "SELECT * FROM \"测试大文件\" LIMIT 1000", "format": "csv"}'
```

### 提交Parquet格式任务（默认）

```bash
curl -X POST "http://localhost:3000/api/async_query" \
  -H "Content-Type: application/json" \
  -d '{"sql": "SELECT * FROM \"测试大文件\" LIMIT 1000"}'
```

或者明确指定：

```bash
curl -X POST "http://localhost:3000/api/async_query" \
  -H "Content-Type: application/json" \
  -d '{"sql": "SELECT * FROM \"测试大文件\" LIMIT 1000", "format": "parquet"}'
```

### 下载结果文件

下载任务结果的API对于两种格式是一样的：

```bash
curl -X GET "http://localhost:3000/api/async_tasks/{task_id}/result" -o result.csv
```

或者：

```bash
curl -X GET "http://localhost:3000/api/async_tasks/{task_id}/result" -o result.parquet
```

## 技术实现

### 1. 架构变更

- 修改了`AsyncQueryRequest`模型以支持`format`参数
- 修改了`execute_async_query`函数以根据指定格式生成相应文件
- 修改了下载接口以正确设置响应的MIME类型
- 添加了输入验证以确保只接受支持的格式

### 2. 文件处理

- **Parquet**: 使用`pandas.to_parquet()`生成，具有高效的压缩和列式存储
- **CSV**: 使用`pandas.to_csv()`生成，具有良好的兼容性

### 3. MIME类型设置

- **Parquet文件**: `application/octet-stream`
- **CSV文件**: `text/csv`

### 4. 文件扩展名

- **Parquet文件**: `.parquet`
- **CSV文件**: `.csv`

## 测试验证

### 1. CSV格式测试
- 提交任务成功
- 任务执行成功
- 文件生成成功（扩展名为.csv）
- 文件下载成功
- 文件类型确认为CSV

### 2. Parquet格式测试
- 提交任务成功
- 任务执行成功
- 文件生成成功（扩展名为.parquet）
- 文件下载成功
- 文件类型确认为Apache Parquet

### 3. 默认行为测试
- 不指定格式时默认使用Parquet格式
- 任务执行和下载均正常工作

### 4. 错误处理测试
- 指定不支持的格式时返回适当错误

## 性能考虑

### 1. 存储效率

- **Parquet**: 更高的压缩比，更适合存储大量数据
- **CSV**: 较低的压缩比，文件相对较大

### 2. 处理效率

- **Parquet**: 列式存储，适合数据分析场景
- **CSV**: 行式存储，适合导入导出场景

### 3. 兼容性

- **Parquet**: 需要专门的工具或库来处理
- **CSV**: 几乎所有的数据处理工具都支持

## 使用建议

1. **大数据分析**: 推荐使用Parquet格式，因为它提供了更好的性能和存储效率
2. **数据交换**: 推荐使用CSV格式，因为它有更好的兼容性
3. **日常使用**: 默认使用Parquet格式，除非有特殊需求

## 注意事项

1. 一旦任务完成，文件格式就不能更改，需要重新提交任务
2. 不同格式的文件大小可能差异很大
3. CSV格式可能在某些特殊字符处理上有局限性
4. Parquet格式在某些老版本的工具中可能不被支持

## 故障排除

### 下载的Parquet文件无法打开

如果你下载的Parquet文件无法打开，请检查以下几点：

1. **文件完整性**：
   - 确认文件大小是否合理
   - 使用`file`命令检查文件类型是否为"Apache Parquet"

2. **使用正确的工具**：
   - Python: `pandas.read_parquet()` 或 `pyarrow.parquet.read_table()`
   - 其他语言: 使用对应的Parquet库

3. **检查日志**：
   - 查看后端服务日志中是否有任何错误信息

### 下载的CSV文件格式不正确

如果你下载的CSV文件格式不正确，请检查以下几点：

1. **文件完整性**：
   - 确认文件大小是否合理
   - 使用`file`命令检查文件类型是否为"CSV text"

2. **编码问题**：
   - CSV文件使用UTF-8编码
   - 在某些编辑器中可能需要手动选择编码

3. **特殊字符处理**：
   - CSV文件中的逗号、引号等特殊字符已被正确转义

### 任务一直卡在运行中

如果任务一直卡在运行中，请检查以下几点：

1. **SQL查询复杂度**：
   - 复杂的查询可能需要较长时间执行
   - 可以尝试简化查询或添加LIMIT子句

2. **系统资源**：
   - 检查Docker容器的资源使用情况
   - 确保有足够的内存和CPU资源

3. **数据量**：
   - 处理大量数据可能需要较长时间
   - 可以考虑分批处理数据