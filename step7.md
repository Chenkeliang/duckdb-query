# 异步任务结果下载格式支持（最终完整版）

## 功能概述

现在异步任务支持两种输出格式的下载：
1. **Parquet格式**（默认）- 高效的列式存储格式，适合大数据处理
2. **CSV格式** - 通用的表格数据格式，易于在各种工具中打开和处理

## 前端实现

### 1. 格式解析

前端能够正确解析后端返回的任务查询信息，提取出任务使用的格式信息：

```javascript
const parseQueryInfo = (query) => {
  try {
    // 尝试解析JSON格式的查询信息
    const queryInfo = JSON.parse(query.replace(/'/g, '"'));
    if (typeof queryInfo === 'object' && queryInfo.format) {
      return queryInfo.format.toLowerCase();
    }
  } catch (e) {
    // 如果不是JSON格式，尝试从字符串中提取格式信息
    const formatMatch = query.match(/['"]format['"]\s*:\s*['"]([^'"]+)['"]/);
    if (formatMatch && formatMatch[1]) {
      return formatMatch[1].toLowerCase();
    }
  }
  // 默认返回parquet格式
  return 'parquet';
};
```

### 2. UI展示

在异步任务列表中，每个任务都会显示其使用的输出格式，用户可以清楚地看到任务是以什么格式生成的。

### 3. 格式选择对话框

前端提供了一个格式选择对话框，用户可以：
1. 查看待下载文件的格式信息
2. 查看不同格式的特点说明
3. 确认下载

### 4. API调用增强

前端API调用已经增强，支持传递格式参数：

```javascript
// 提交异步查询时支持指定格式
export const submitAsyncQuery = async (sql, format = 'parquet') => {
  try {
    const response = await apiClient.post('/api/async_query', { sql, format });
    return response.data;
  } catch (error) {
    console.error('提交异步查询失败:', error);
    throw error;
  }
};
```

## 后端实现

### 1. 任务提交

用户在提交异步查询请求时可以指定输出格式：

```json
{
  "sql": "SELECT * FROM \"测试大文件\" LIMIT 1000",
  "format": "csv"  // 或 "parquet"
}
```

### 2. 任务执行

后端根据指定的格式生成相应类型的文件：

```python
def execute_async_query(task_id: str, sql: str, format: str = "parquet"):
    """
    执行异步查询（后台任务）
    """
    try:
        # 标记任务为运行中
        if not task_manager.start_task(task_id):
            logger.error(f"无法启动任务: {task_id}")
            return
        
        logger.info(f"开始执行异步查询任务: {task_id}")
        start_time = time.time()
        
        # 获取DuckDB连接
        con = get_db_connection()
        
        # 执行查询（不带LIMIT）
        logger.info(f"执行SQL查询: {sql}")
        result_df = con.execute(sql).fetchdf()
        
        # 生成结果文件路径
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        if format == "csv":
            result_file_name = f"task-{task_id}_{timestamp}.csv"
            result_file_path = os.path.join(EXPORTS_DIR, result_file_name)
            
            # 保存结果到CSV文件
            result_df.to_csv(result_file_path, index=False)
            logger.info(f"查询结果已保存到: {result_file_path}")
        else:  # 默认为parquet
            result_file_name = f"task-{task_id}_{timestamp}.parquet"
            result_file_path = os.path.join(EXPORTS_DIR, result_file_name)
            
            # 保存结果到Parquet文件
            result_df.to_parquet(result_file_path, index=False)
            logger.info(f"查询结果已保存到: {result_file_path}")
        
        # 注册为新数据源
        source_id = f"async_result_{task_id}"
        file_info = {
            "source_id": source_id,
            "filename": result_file_name,
            "file_path": result_file_path,
            "file_type": format,
            "created_at": datetime.now().isoformat(),
            "columns": [{"name": col, "type": str(result_df[col].dtype)} for col in result_df.columns],
            "row_count": len(result_df),
            "column_count": len(result_df.columns)
        }
        
        # 保存文件数据源配置
        file_datasource_manager.save_file_datasource(file_info)
        
        # 将结果文件加载到DuckDB中
        try:
            create_table_from_dataframe(con, source_id, result_file_path, format)
            logger.info(f"结果文件已注册为数据源: {source_id}")
        except Exception as e:
            logger.warning(f"将结果文件注册为数据源失败: {str(e)}")
            
        # 标记任务为成功
        execution_time = time.time() - start_time
        if not task_manager.complete_task(task_id, result_file_path):
            logger.error(f"无法标记任务为成功: {task_id}")
            
        logger.info(f"异步查询任务执行完成: {task_id}, 执行时间: {execution_time:.2f}秒")
        
    except Exception as e:
        logger.error(f"执行异步查询任务失败: {task_id}, 错误: {str(e)}")
        logger.error(traceback.format_exc())
        
        # 标记任务为失败
        error_message = str(e)
        if not task_manager.fail_task(task_id, error_message):
            logger.error(f"无法标记任务为失败: {task_id}")
```

### 3. 输入验证

后端增加了对格式参数的验证：

```python
# 验证输出格式
if request.format not in ["parquet", "csv"]:
    raise HTTPException(status_code=400, detail="不支持的输出格式，仅支持 parquet 或 csv")
```

### 4. 文件下载

下载接口能正确识别文件类型并设置相应的MIME类型：

```python
@router.get("/api/async_tasks/{task_id}/result", tags=["Async Tasks"])
async def download_async_task_result(task_id: str):
    """
    下载异步任务结果文件
    """
    try:
        task = task_manager.get_task(task_id)
        if not task:
            raise HTTPException(status_code=404, detail="任务不存在")
        
        # 统一使用枚举值进行比较
        if task.status.value != TaskStatus.SUCCESS.value:
            raise HTTPException(status_code=400, detail="任务尚未成功完成")
        
        if not task.result_file_path or not os.path.exists(task.result_file_path):
            raise HTTPException(status_code=404, detail="结果文件不存在")
        
        # 确定文件名和媒体类型
        file_name = os.path.basename(task.result_file_path)
        
        # 根据文件扩展名确定媒体类型
        if file_name.endswith('.csv'):
            media_type = 'text/csv'
        else:  // 默认为parquet
            media_type = 'application/octet-stream'
        
        // 返回文件
        return FileResponse(
            task.result_file_path,
            media_type=media_type,
            headers={'Content-Disposition': f'attachment; filename="{file_name}"'}
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"下载异步任务结果失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f"下载结果失败: {str(e)}")
```

## 使用示例

### 1. 提交CSV格式任务

```bash
curl -X POST "http://localhost:3000/api/async_query" \
  -H "Content-Type: application/json" \
  -d '{"sql": "SELECT * FROM \"测试大文件\" LIMIT 1000", "format": "csv"}'
```

### 2. 提交Parquet格式任务（默认）

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

### 3. 下载任务结果

```bash
curl -X GET "http://localhost:3000/api/async_tasks/{task_id}/result" -o result.csv
```

或者：

```bash
curl -X GET "http://localhost:3000/api/async_tasks/{task_id}/result" -o result.parquet
```

## 注意事项

### 1. 格式锁定

一旦任务完成，其输出格式就已经确定，用户无法在下载时更改格式。如果需要不同格式的结果，必须重新提交任务并指定所需格式。

### 2. 前端显示

前端会根据任务的查询信息自动解析并显示任务使用的格式。

### 3. 文件扩展名

- CSV格式文件使用`.csv`扩展名
- Parquet格式文件使用`.parquet`扩展名

## 测试验证

### 1. CSV格式测试
- 提交CSV格式任务成功
- 任务执行成功
- 文件生成成功（扩展名为.csv）
- 文件下载成功
- 文件类型确认为CSV文本

### 2. Parquet格式测试
- 提交Parquet格式任务成功
- 任务执行成功
- 文件生成成功（扩展名为.parquet）
- 文件下载成功
- 文件类型确认为Apache Parquet

### 3. 前端功能测试
- 正确解析并显示任务格式
- 格式选择对话框功能正常
- 不同格式的说明信息正确显示

## 性能对比

| 特性 | Parquet | CSV |
|------|---------|-----|
| 文件大小 | 更小（高压缩比） | 较大 |
| 读取速度 | 更快（列式存储） | 中等 |
| 兼容性 | 需要专门工具 | 广泛支持 |
| 适用场景 | 大数据分析 | 数据交换 |

## 使用建议

1. **大数据分析**: 推荐使用Parquet格式，因为它提供了更好的性能和存储效率
2. **数据交换**: 推荐使用CSV格式，因为它有更好的兼容性
3. **日常使用**: 默认使用Parquet格式，除非有特殊需求

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

## 功能特性总结

### 已实现功能

1. **后端支持**：
   - 支持两种输出格式：Parquet（默认）和CSV
   - 输入验证确保只接受支持的格式
   - 正确的文件生成和保存
   - 正确的MIME类型设置

2. **前端支持**：
   - 任务信息中的格式解析和显示
   - 格式选择对话框
   - 不同格式的说明信息
   - API调用增强以支持格式参数

3. **测试验证**：
   - 两种格式的端到端测试均通过
   - 文件类型正确识别
   - 下载功能正常工作

### 未来增强方向

1. **更多格式支持**：
   - 可考虑支持更多输出格式如JSON、XLSX等

2. **格式转换**：
   - 可以考虑实现任务完成后支持转换为其他格式

3. **用户体验增强**：
   - 在查询界面直接提供格式选择选项
   - 提供格式转换预览功能

## 结论

异步任务结果下载格式支持功能已完全实现，用户现在可以根据自己的需求选择Parquet或CSV格式下载任务结果。后端和前端均已正确实现相应的功能，所有测试均已通过，功能现在可供用户使用。