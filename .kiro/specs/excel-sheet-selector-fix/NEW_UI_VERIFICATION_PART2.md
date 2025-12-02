# 新 UI 数据源管理全面验证报告 (Part 2: 响应处理与数据流)

## 2️⃣ 响应处理

### ✅ UploadPanel - 文件上传响应

**评分**: ⭐⭐⭐⭐⭐ (5/5)

**优点**:
- ✅ 完整的响应处理逻辑
- ✅ 正确处理 Excel 工作表选择
- ✅ 区分成功/失败路径
- ✅ 清晰的错误处理

**代码分析**:
```typescript
const handleUpload = async () => {
  // 1. 验证输入
  if (!selectedFile) {
    notify(t("page.datasource.pickFileFirst"), "warning");
    return;
  }
  
  // 2. 清除之前的状态（支持多次上传）
  setPendingExcel(null);
  
  setUploading(true);
  try {
    const response = await uploadFile(selectedFile, alias || null);
    
    // 3. 检查响应成功
    if (!response?.success) {
      notify(response?.message || t("page.datasource.uploadFail"), "error");
      return;
    }
    
    // 4. 检查是否需要工作表选择 ⭐ 关键逻辑
    if (response.requires_sheet_selection && response.pending_excel) {
      setPendingExcel(response.pending_excel);
      notify(response.message || t("page.datasource.uploadSuccess"), "info");
      return;
    }
    
    // 5. 直接导入成功
    notify(t("page.datasource.uploadSuccessTable", { table: response.file_id }), "success");
    onDataSourceSaved?.({ /* ... */ });
    
    // 6. 清理状态
    setSelectedFile(null);
    setAlias("");
  } catch (err) {
    console.error("Upload failed:", err);
    notify(err?.message || t("page.datasource.uploadFail"), "error");
  } finally {
    setUploading(false);
  }
};
```

**响应处理流程**:
```
用户上传文件
    ↓
验证文件存在
    ↓
清除旧状态
    ↓
调用 uploadFile API
    ↓
检查 response.success
    ├─ false → 显示错误 → 结束
    └─ true → 继续
        ↓
    检查 requires_sheet_selection
        ├─ true → 设置 pendingExcel → 显示选择器
        └─ false → 调用 onDataSourceSaved → 完成
```

**优秀实践**:
1. ✅ **早期返回**: 使用 early return 简化逻辑
2. ✅ **状态清理**: 上传前清除旧状态
3. ✅ **错误日志**: `console.error` 记录错误
4. ✅ **用户反馈**: 每个路径都有通知

---

### ✅ DatabaseForm - 数据库连接响应

**评分**: ⭐⭐⭐⭐⭐ (5/5)

**优点**:
- ✅ 清晰的验证逻辑
- ✅ 标准化的参数格式
- ✅ 多种操作支持（测试/连接/保存）

**代码分析**:
```typescript
const normalizedParams = useMemo(() => {
  const params = type === "sqlite"
    ? { path: sqlitePath }
    : {
        host: host.trim(),
        port: Number(port) || null,
        user: username.trim(),
        password: password,
        database: database.trim(),
        ...(isPostgreSQL && { schema: schema.trim() || "public" })
      };

  return {
    type,
    id: name.trim() || `${type}-${host || "localhost"}${port ? `:${port}` : ""}`,
    params
  };
}, [type, name, host, port, username, password, database, sqlitePath, schema, isPostgreSQL]);

const validate = () => {
  if (!normalizedParams.id) {
    setError(t("page.datasource.connection.errorName"));
    return false;
  }
  if (!isSqlite) {
    if (!host.trim() || !database.trim()) {
      setError(t("page.datasource.connection.errorSave", { message: "" }));
      return false;
    }
  } else if (!sqlitePath.trim()) {
    setError(t("page.datasource.connection.errorSave", { message: "" }));
    return false;
  }
  setError("");
  return true;
};
```

**优秀实践**:
1. ✅ **参数标准化**: 使用 `useMemo` 计算标准化参数
2. ✅ **验证逻辑**: 独立的 `validate` 函数
3. ✅ **类型特定逻辑**: 根据数据库类型调整参数

---

### ✅ DataPasteCard - 数据解析响应

**评分**: ⭐⭐⭐⭐⭐ (5/5)

**优点**:
- ✅ 智能格式检测
- ✅ 多格式支持（CSV/JSON）
- ✅ 完整的错误处理

**代码分析**:
```typescript
const parseData = () => {
  if (!pastedData.trim()) {
    setError(t("page.datasource.paste.error.noData"));
    return;
  }
  
  try {
    setError("");
    setSuccess("");

    let bodyRows = [];
    let colCount = 0;
    let inferredNames = [];

    if (format === "json") {
      // JSON 解析逻辑
      json = JSON.parse(raw);
      // ... 处理 JSON
    } else {
      // CSV 解析逻辑
      const detected = format === "csv" ? delimiter || "," : detectDelimiter(raw);
      // ... 处理 CSV
    }

    // 类型推断
    const inferredTypes = Array.from({ length: colCount }, (_, colIdx) =>
      detectDataType(bodyRows.map(r => r[colIdx]))
    );

    // 设置结果
    setColumnNames(inferredNames);
    setColumnTypes(inferredTypes);
    setParsedData({ rows: bodyRows, preview: previewRows, columns: colCount });
    setSuccess(t("page.datasource.paste.parseSuccess", { rows: bodyRows.length, cols: colCount }));
  } catch (err) {
    setError(t("page.datasource.paste.parseFail", { message: err.message }));
  }
};
```

**优秀实践**:
1. ✅ **智能检测**: 自动检测分隔符和数据类型
2. ✅ **多格式支持**: JSON 和 CSV
3. ✅ **预览功能**: 只显示前 5 行

---

## 3️⃣ 完成处理

### ✅ UploadPanel - Excel 导入完成

**评分**: ⭐⭐⭐⭐⭐ (5/5)

**代码分析**:
```typescript
const handleExcelImported = (result) => {
  try {
    // 1. 检查结果
    if (!result?.success) {
      console.error("Excel import failed:", result);
      notify(result?.message || t("page.datasource.importFail"), "error");
      // 保持 pendingExcel 状态，允许用户重试 ⭐ 关键
      return;
    }
    
    // 2. 清除 pending 状态
    setPendingExcel(null);
    
    // 3. 调用成功回调
    onDataSourceSaved?.({
      id: result.table_name,
      type: "duckdb",
      name: t("page.datasource.duckdbTable", { table: result.table_name }),
      row_count: result.row_count,
      columns: result.columns || []
    });
    
    // 4. 显示成功通知
    notify(result.message || t("page.datasource.importSuccess"), "success");
    
    // 5. 重置上传状态
    setSelectedFile(null);
    setAlias("");
  } catch (err) {
    console.error("Import handling failed:", err);
    notify(err?.message || t("page.datasource.importFail"), "error");
  }
};
```

**优秀实践**:
1. ✅ **失败重试**: 失败时保持 `pendingExcel`，允许重试
2. ✅ **完整清理**: 成功后清理所有相关状态
3. ✅ **错误日志**: 记录错误到控制台
4. ✅ **用户反馈**: 成功和失败都有通知

---

### ✅ DatabaseForm - 连接完成

**评分**: ⭐⭐⭐⭐⭐ (5/5)

**代码分析**:
```typescript
const handleConnect = () => {
  if (!validate()) return;
  onSave?.(normalizedParams);
};

const handleSaveConfigClick = () => {
  if (!validate()) return;
  onSaveConfig?.(normalizedParams);
};
```

**优秀实践**:
1. ✅ **验证优先**: 操作前先验证
2. ✅ **可选回调**: 使用 `?.` 安全调用
3. ✅ **标准化数据**: 传递标准化的参数

---

### ✅ DataPasteCard - 保存完成

**评分**: ⭐⭐⭐⭐⭐ (5/5)

**代码分析**:
```typescript
const saveToDatabase = async () => {
  // 验证
  if (!parsedData || !tableName.trim()) {
    setError(t("page.datasource.paste.save.needParse"));
    return;
  }
  
  setLoading(true);
  setError("");
  
  try {
    const res = await fetch("/api/paste-data", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        table_name: tableName.trim(),
        column_names: columnNames,
        column_types: columnTypes,
        data_rows: parsedData.rows,
        delimiter,
        has_header: hasHeader
      })
    });
    
    const result = await res.json();
    
    if (result.success) {
      setSuccess(t("page.datasource.paste.save.saveOk", { table: tableName.trim() }));
      onDataSourceSaved?.({ /* ... */ });
      clearForm(); // ⭐ 完整清理
    } else {
      setError(result.error || result.message || t("page.datasource.paste.save.saveFail"));
    }
  } catch (err) {
    setError(t("page.datasource.paste.save.saveFailDetail", { message: err.message || "" }));
  } finally {
    setLoading(false);
  }
};

const clearForm = () => {
  setPastedData("");
  setParsedData(null);
  setTableName("");
  setColumnNames([]);
  setColumnTypes([]);
  setError("");
  setSuccess("");
};
```

**优秀实践**:
1. ✅ **完整清理**: `clearForm` 清理所有状态
2. ✅ **加载状态**: 使用 `loading` 状态禁用按钮
3. ✅ **错误处理**: 区分不同类型的错误

---

**继续阅读**: Part 3 - 取消/关闭处理与错误处理
