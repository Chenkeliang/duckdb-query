# Server File Excel Import - Design (v2)

## 概述

本文档描述服务器文件 Excel 导入功能的技术设计，包括后端 API、前端组件和数据流。

---

## 系统架构

```
┌─────────────────────┐     ┌──────────────────────┐
│  ServerFileBrowser  │────▶│  ExcelSheetSelector  │
│   (前端组件)         │     │   (复用现有组件)      │
└─────────┬───────────┘     └──────────┬───────────┘
          │                            │
          ▼                            ▼
┌─────────────────────────────────────────────────┐
│                 API Layer                        │
├─────────────────────┬───────────────────────────┤
│ /server-files/excel │ /server-files/excel/import│
│    /inspect         │                           │
└─────────────────────┴───────────────────────────┘
          │                            │
          ▼                            ▼
┌─────────────────────────────────────────────────┐
│            Excel Import Manager                  │
│  ┌─────────────┐    ┌─────────────────────────┐ │
│  │ DuckDB      │───▶│  pandas (fallback)      │ │
│  │ read_xlsx   │    │  read_excel             │ │
│  └─────────────┘    └─────────────────────────┘ │
└─────────────────────────────────────────────────┘
```

---

## 关键设计决策

### 1. 单工作表也显示选择器
无论工作表数量，都弹出 `ExcelSheetSelector`，让用户配置：
- 表头行号
- 目标表名
- 合并单元格处理

### 2. DuckDB vs pandas 选择逻辑

```python
def should_use_duckdb(file_ext, header_row_index, fill_merged):
    # .xls 只能用 pandas
    if file_ext == 'xls':
        return False
    # 非首行表头只能用 pandas
    if header_row_index > 0:
        return False
    # 需要合并单元格填充只能用 pandas
    if fill_merged:
        return False
    return True
```

### 3. 文件格式支持

| 格式 | 引擎 | 说明 |
|------|------|------|
| `.xlsx` | DuckDB read_xlsx 或 openpyxl | 优先 DuckDB |
| `.xls` | pandas + xlrd | 仅 pandas 支持 |

### 4. 表名冲突处理
- 如果表名已存在，API 返回错误提示用户修改
- 不自动覆盖，不自动加后缀

### 5. 合并单元格处理 (`fill_merged`)
当 `fill_merged=true` 时：
- 强制使用 pandas（DuckDB 不支持）
- 对数据执行 `ffill()` 填充合并单元格
- 注意：公式单元格可能结果不准确

---

## 后端 API 设计

### API 1: 检查 Excel 工作表

**端点**: `POST /api/server-files/excel/inspect`

**安全验证**: 复用 `_resolve_path()` 验证路径在白名单内

**请求体**:
```json
{
  "path": "/path/to/file.xlsx"
}
```

**响应体**:
```json
{
  "success": true,
  "file_path": "/path/to/file.xlsx",
  "file_extension": "xlsx",
  "default_table_prefix": "table_name",
  "sheets": [...]
}
```

**错误响应**: 使用 `create_error_response()` 统一格式

---

### API 2: 导入 Excel 工作表

**端点**: `POST /api/server-files/excel/import`

**请求体**:
```json
{
  "path": "/path/to/file.xlsx",
  "sheets": [
    {
      "name": "Sheet1",
      "target_table": "my_table",
      "header_rows": 1,
      "header_row_index": 0,
      "fill_merged": false,
      "mode": "create"
    }
  ]
}
```

---

## 导入策略

```python
def import_sheet(path, sheet_name, config):
    file_ext = get_extension(path)
    
    # 判断是否可以使用 DuckDB
    if should_use_duckdb(file_ext, config.header_row_index, config.fill_merged):
        try:
            sql = f"SELECT * FROM read_xlsx('{path}', sheet='{sheet_name}', header=true)"
            return duckdb_execute(sql)
        except Exception as e:
            logger.warning(f"DuckDB 失败，回退 pandas: {e}")
    
    # pandas fallback
    df = pd.read_excel(
        path, 
        sheet_name=sheet_name,
        header=config.header_row_index,
        engine='openpyxl' if file_ext == 'xlsx' else 'xlrd'
    )
    if config.fill_merged:
        df = df.ffill()
    return df
```

---

## 大文件处理

- **前端**: 导入按钮点击后显示 "正在导入，请稍候..." loading 状态
- **后端**: 暂不实现进度条（流式进度复杂度高）
- **内存警告**: pandas fallback 对 >100MB 文件可能占用大量内存
- **未来优化**: 可考虑分块导入或后台任务

---

## 文件变更清单

### 后端

| 文件 | 变更类型 | 说明 |
|------|----------|------|
| `api/routers/server_files.py` | MODIFY | 添加两个新 API 端点 |

### 前端

| 文件 | 变更类型 | 说明 |
|------|----------|------|
| `frontend/src/api/fileApi.ts` | MODIFY | 添加两个新 API 函数 |
| `frontend/src/new/DataSource/ExcelSheetSelector.tsx` | MODIFY | 支持 server 模式 |
| `frontend/src/new/DataSource/ServerFileBrowser.tsx` | MODIFY | Excel 导入触发选择器 |

---

## 测试计划

### 边界条件测试

| 测试场景 | 预期行为 |
|----------|----------|
| 单工作表 xlsx | 显示选择器，用户可配置 |
| 多工作表 xlsx | 显示选择器 |
| .xls 文件 | 直接 pandas，不尝试 DuckDB |
| header_row_index > 0 | 直接 pandas |
| fill_merged = true | 直接 pandas + ffill |
| 表名已存在 | 返回错误提示 |
| 路径不在白名单 | 返回 403 错误 |
