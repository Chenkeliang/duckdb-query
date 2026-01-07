# Server File Excel Import - Tasks (v2)

## Phase 1: 后端 API

### Task 1.1: 添加 Excel 检查 API
- [ ] 在 `server_files.py` 添加 `POST /api/server-files/excel/inspect`
- [ ] 复用 `_resolve_path()` 路径安全验证
- [ ] 复用 `inspect_excel_sheets()` 函数
- [ ] 返回 `file_extension` 字段（用于前端判断）

### Task 1.2: 添加 Excel 导入 API
- [ ] 在 `server_files.py` 添加 `POST /api/server-files/excel/import`
- [ ] 实现 `should_use_duckdb()` 判断逻辑：
  - `.xls` → pandas
  - `header_row_index > 0` → pandas
  - `fill_merged = true` → pandas
  - 其他 → DuckDB 优先
- [ ] 表名冲突检测：已存在则返回错误
- [ ] pandas 读取时：`.xls` 用 `xlrd` 引擎
- [ ] `fill_merged` 时执行 `ffill()`
- [ ] 使用 `create_error_response()` 统一错误格式

---

## Phase 2: 前端 API

### Task 2.1: 添加 API 函数
- [ ] 在 `fileApi.ts` 添加 `inspectServerExcelSheets(path)`
- [ ] 在 `fileApi.ts` 添加 `importServerExcelSheets(path, sheets)`

---

## Phase 3: 前端组件

### Task 3.1: 扩展 ExcelSheetSelector
- [ ] 添加 `sourceType` prop ('upload' | 'server')
- [ ] 添加 `serverPath` prop
- [ ] 根据 sourceType 切换 API 调用

### Task 3.2: 修改 ServerFileBrowser
- [ ] 检测 Excel 文件（.xlsx, .xls）
- [ ] 导入 Excel 时调用 inspect API
- [ ] **所有 Excel 都显示选择器**（包括单工作表）
- [ ] 添加 loading 状态："正在导入，请稍候..."

---

## Phase 4: 测试

### Task 4.1: 后端单元测试
- [ ] 测试 `should_use_duckdb()` 函数
- [ ] 测试表名冲突检测
- [ ] 测试路径安全验证

### Task 4.2: 集成测试
- [ ] 单工作表 xlsx → 显示选择器
- [ ] 多工作表 xlsx → 显示选择器
- [ ] .xls 文件 → pandas 导入成功
- [ ] header_row_index > 0 → pandas 导入成功
- [ ] fill_merged = true → pandas + ffill
- [ ] 表名已存在 → 返回错误
- [ ] 路径不在白名单 → 403 错误

---

## 估算工时

| Phase | 任务数 | 估算时间 |
|-------|--------|----------|
| Phase 1 | 2 | 3-4 小时 |
| Phase 2 | 1 | 0.5 小时 |
| Phase 3 | 2 | 2-3 小时 |
| Phase 4 | 2 | 2-3 小时 |
| **总计** | 7 | **8-11 小时** |
