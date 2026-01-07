# Server File Excel Import - Requirements (v2)

## 简介

本文档定义了服务器文件浏览器中 Excel 文件导入功能的需求。

---

## 需求

### 需求 1: Excel 文件检测与选择器触发

**用户故事**: 作为用户，当我选择 Excel 文件导入时，无论工作表数量，都应显示配置界面。

#### 验收标准

1. WHEN 用户点击导入 Excel 文件 THEN 系统 SHALL 调用工作表检查 API
2. WHEN Excel 有单个或多个工作表 THEN 系统 SHALL 都显示工作表选择器
3. WHEN 单工作表 THEN 选择器 SHALL 默认选中该工作表

### 需求 2: 工作表配置

**用户故事**: 作为用户，我希望能够配置表头行、目标表名和合并单元格处理。

#### 验收标准

1. WHEN 选择工作表 THEN 用户 SHALL 能够配置表头行号
2. WHEN 选择工作表 THEN 用户 SHALL 能够自定义目标表名
3. WHEN 选择工作表 THEN 用户 SHALL 能够启用/禁用合并单元格填充

### 需求 3: 导入引擎选择

**用户故事**: 作为系统，应根据配置智能选择 DuckDB 或 pandas。

#### 验收标准

1. WHEN `.xlsx` + 表头行=1 + 无合并填充 THEN 系统 SHALL 优先 DuckDB
2. WHEN `.xls` 文件 THEN 系统 SHALL 直接使用 pandas
3. WHEN 表头行 ≠ 1 THEN 系统 SHALL 直接使用 pandas
4. WHEN fill_merged=true THEN 系统 SHALL 直接使用 pandas
5. WHEN DuckDB 失败 THEN 系统 SHALL 回退到 pandas

### 需求 4: 表名冲突处理

**用户故事**: 作为用户，当目标表名已存在时，系统应提示我修改。

#### 验收标准

1. WHEN 目标表名已存在 THEN 系统 SHALL 返回错误提示
2. WHEN 返回错误 THEN 前端 SHALL 显示用户友好的错误消息
3. 系统 SHALL NOT 自动覆盖或自动加后缀

### 需求 5: 错误处理与安全

#### 验收标准

1. WHEN 路径不在白名单 THEN 系统 SHALL 返回 403 错误
2. WHEN API 失败 THEN 系统 SHALL 返回统一格式错误响应
3. WHEN 导入进行中 THEN 前端 SHALL 显示 loading 状态

---

## 非功能需求

### 性能
- 工作表检查应在 3 秒内完成
- 大文件导入时显示 loading 提示

### 兼容性
- 支持 `.xlsx` (Excel 2007+)
- 支持 `.xls` (Excel 97-2003)
