# CSV / Excel 导入：精度问题与 UI 优化说明

> 项目 DuckDB 版本：`api/requirements.txt` → `duckdb==1.5.3`；持久化库使用 `storage_compatibility_version=latest`（迁移见 `docs/CONFIGURATION_ZH.md` § JSON / VARIANT 入湖）  
> 官方参考：[CSV 自动检测](https://duckdb.org/docs/current/data/csv/auto_detection.html)、[Excel 扩展](https://duckdb.org/docs/current/core_extensions/excel)、[Excel 导入指南](https://duckdb.org/docs/current/guides/file_formats/excel_import)

---

## 1. 科学计数法 / 精度丢失（根因）

| 环节 | 现象 | 原因 |
|------|------|------|
| CSV 入库 | 长数字 ID 变成 `1.23E+18` 或末位错误 | `read_csv_auto` 将列推断为 **DOUBLE**；`SAMPLE_SIZE=-1` 只影响采样范围，不阻止浮点推断 |
| CSV pandas 回退 | 同左 | `read_csv` 未按文本读入，推断为 `float64` |
| Excel 导入 | 预览/表中 ID 位数变化 | `pd.read_excel` 默认把数字格读成 **float64**；原逻辑对 object 列整列 `pd.to_numeric` 加剧问题 |
| Excel 预览 JSON | 前端看到科学计数法 | `normalize_dataframe_output` 对已是 float 的值按 JSON number 输出 |
| 查询结果 | 大整数变字符串 | `jsonable_encoder` 对超过 JS `MAX_SAFE_INTEGER` 的整数转 str（**有意为之**，与导入类型无关） |

DuckDB 1.5 推荐做法（按场景）：

1. **先全文本再转型号**：`read_csv(..., all_varchar=true)`，再在 SQL 里 `TRY_CAST`。  
2. **覆盖嗅探类型**：`sniff_csv` → 对 ID 列使用 `types={'order_id': 'VARCHAR', ...}`（注意：`columns` 在 DuckDB 中表示**只读这些列**，不是改类型）。  
3. **金额/小数**：依赖 `decimal_infer_max_length` / `decimal_infer_max_scale`（见 `_configure_duckdb_for_ingestion`），或显式 `DECIMAL(p,s)`。  
4. **Excel**：扩展 `read_xlsx` 仍会做类型推断；多表头/合并单元格场景以 **pandas + `dtype=object` + 安全数值收敛** 为主（见 `load_excel_sheet_dataframe`）。

---

## 2. 代码层已做 / 建议后续

### 已实现（用户可选 `import_mode`）

模块：`api/core/data/import_mode.py`；前端 `UploadPanel` / `fileApi.ts` 传 `import_mode`。

| 模式 | 行为 |
|------|------|
| **`auto`（默认）** | CSV/Excel：`all_varchar` 或 pandas 字面量 → 落库后 `promote_table_column_types_from_varchar`（`BIGINT` / `DECIMAL` / `DATE`，**永不 DOUBLE**） |
| **`literal`** | 同上读入为文本，**不 promote**，表保持 VARCHAR |

1. **CSV**：`load_file_to_duckdb` 在 `auto` 下 `all_varchar` + promote；`literal` 仅 VARCHAR。  
2. **Excel（单文件 / 服务器）**：`read_xlsx(all_varchar=true)` + 条件 promote；多 Sheet 走 `load_excel_sheet_dataframe`。  
3. **ID 列**：列名启发式（`*_id`、`sku` 等）在 promote 阶段保持 `VARCHAR`。  

类型覆盖须用 DuckDB `types={...}`，勿用 `columns={...}`（后者只选列名）。

### 可选增强（产品 / 工程）

| 项 | 说明 |
|----|------|
| 上传 UI「全部按文本」 | 已支持：`import_mode=literal` |
| 预览与入库类型一致 | 预览走与 `importExcelSheets` 相同的 `load_excel_sheet_dataframe` 参数 |
| DuckDB `read_xlsx` 统一 | 多 sheet 且无双行表头时优先扩展，失败再 pandas |
| 前端类型列 | `ExcelSheetSelector` 展示 `columns[].duckdb_type`，导入前可选「全部文本」 |

---

## 3. 多 Sheet / 页面与预览（UX 现状与建议）

**现状**

- 上传：`UploadPanel` → 大文件分块 `uploadFileAuto`；Excel 返回 `requires_sheet_selection` → `ExcelSheetSelector` Dialog。  
- 多 Sheet：`Accordion` + 勾选、表头行数、合并单元格填充、目标表名；`inspectExcelSheets` 约 20 行预览。  
- CSV：无 Sheet 选择器，上传后直接入库或走预览 API。

**可优化方向（未全部实现）**

1. **预览**：增加「仅预览 / 确认后导入」；大表预览用服务端 LIMIT + 列类型标签。  
2. **批量**：已支持全选/全不选；可补「仅导入可见行数 &lt; N 的 Sheet」过滤。  
3. **布局**：Sheet 列表与预览分栏（左列表右表格），减少 Accordion 内滚动。  
4. **CSV 多文件**：与 Excel 统一的「上传队列 + 逐文件预览」组件。  
5. **导入进度**：多 Sheet 并行/串行进度条（与分块上传进度一致）。

相关前端：`frontend/src/DataSource/UploadPanel.tsx`、`ExcelSheetSelector.tsx`。  
相关后端：`api/core/data/excel_import_manager.py`、`api/routers/file_ingestion.py`（inspect/import 端点）。

---

## 4. 验证建议

```bash
cd api
python -m pytest tests/test_ingestion_precision.py tests/test_typed_ingestion.py -q
```

手工：上传含 19 位 `order_id` 的 CSV/xlsx，在数据源树预览与 SQL `SELECT order_id FROM ...` 核对无科学计数法且末位一致。
