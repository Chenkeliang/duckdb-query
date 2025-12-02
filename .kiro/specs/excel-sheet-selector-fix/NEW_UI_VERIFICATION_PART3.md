# 新 UI 数据源管理全面验证报告 (Part 3: 取消/关闭/错误/Toast处理)

## 4️⃣ 取消处理

### ✅ UploadPanel - Excel 选择取消

**评分**: ⭐⭐⭐⭐⭐ (5/5)

**代码分析**:
```typescript
const handleExcelClose = () => {
  try {
    setPendingExcel(null);
  } catch (err) {
    console.error("Close handling failed:", err);
    // 即使出错也要尝试清理状态 ⭐ 防御性编程
    setPendingExcel(null);
  }
};
```

**优秀实践**:
1. ✅ **防御性编程**: try-catch 确保状态清理
2. ✅ **简单清理**: 只清理必要的状态
3. ✅ **错误日志**: 记录错误但不影响用户

**使用场景**:
```typescript
<ExcelSheetSelector
  open={true}
  pendingInfo={pendingExcel}
  onClose={handleExcelClose}  // ⭐ 用户点击取消
  onImported={handleExcelImported}
  showNotification={showNotification}
/>
```

---

### ✅ UploadPanel - 文件清除

**评分**: ⭐⭐⭐⭐⭐ (5/5)

**代码分析**:
```typescript
<Button
  variant="ghost"
  onClick={() => {
    setSelectedFile(null);
    setAlias("");
  }}
>
  {t("page.datasource.paste.btnClear")}
</Button>
```

**优秀实践**:
1. ✅ **内联处理**: 简单操作直接内联
2. ✅ **完整清理**: 清理相关状态

---

## 5️⃣ 关闭处理

### ✅ 所有组件的关闭处理

**评分**: ⭐⭐⭐⭐⭐ (5/5)

**分析**:
- ✅ **UploadPanel**: `handleExcelClose` 处理 Excel 选择器关闭
- ✅ **DatabaseForm**: 无需关闭处理（表单组件）
- ✅ **DataPasteCard**: `clearForm` 处理表单重置

**关闭处理模式**:
```typescript
// 模式 1: 对话框关闭
const handleClose = () => {
  setPendingState(null);
};

// 模式 2: 表单重置
const clearForm = () => {
  // 清理所有表单状态
  setState1("");
  setState2(null);
  setError("");
  setSuccess("");
};
```

---

## 6️⃣ 错误处理

### ✅ UploadPanel - 错误处理

**评分**: ⭐⭐⭐⭐⭐ (5/5)

**错误处理层次**:

1. **输入验证错误**:
```typescript
if (!selectedFile) {
  notify(t("page.datasource.pickFileFirst"), "warning");
  return;
}
```

2. **API 响应错误**:
```typescript
if (!response?.success) {
  notify(response?.message || t("page.datasource.uploadFail"), "error");
  return;
}
```

3. **网络/异常错误**:
```typescript
catch (err) {
  console.error("Upload failed:", err);
  notify(err?.message || t("page.datasource.uploadFail"), "error");
}
```

4. **状态清理保证**:
```typescript
finally {
  setUploading(false);
}
```

**优秀实践**:
1. ✅ **分层处理**: 不同类型错误不同处理
2. ✅ **用户友好**: 显示本地化错误消息
3. ✅ **开发友好**: 控制台记录详细错误
4. ✅ **状态保证**: finally 确保状态清理

---

### ✅ DatabaseForm - 错误处理

**评分**: ⭐⭐⭐⭐⭐ (5/5)

**验证错误处理**:
```typescript
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

**服务器浏览错误处理**:
```typescript
const loadServerMounts = async () => {
  setServerMountLoading(true);
  setServerError("");
  try {
    const data = await getServerMounts();
    // ...
  } catch (err) {
    // 静默处理错误 - 如果服务器没有配置挂载点，不显示错误 ⭐
    console.debug("Server mounts not configured:", err?.message);
    setServerMounts([]);
  } finally {
    setServerMountLoading(false);
  }
};
```

**优秀实践**:
1. ✅ **验证优先**: 操作前验证输入
2. ✅ **静默失败**: 可选功能失败不影响主流程
3. ✅ **清晰反馈**: 错误消息显示在表单中

---

### ✅ DataPasteCard - 错误处理

**评分**: ⭐⭐⭐⭐⭐ (5/5)

**解析错误处理**:
```typescript
const parseData = () => {
  if (!pastedData.trim()) {
    setError(t("page.datasource.paste.error.noData"));
    return;
  }
  
  try {
    setError("");
    setSuccess("");
    
    // 解析逻辑
    if (format === "json") {
      try {
        json = JSON.parse(raw);
      } catch (err) {
        setError(t("page.datasource.paste.parseFail", { message: err.message }));
        return;
      }
    }
    
    // 验证结果
    if (!inferredNames.length) {
      setError(t("page.datasource.paste.error.noValid"));
      return;
    }
    
    setSuccess(t("page.datasource.paste.parseSuccess", { rows, cols }));
  } catch (err) {
    setError(t("page.datasource.paste.parseFail", { message: err.message }));
  }
};
```

**优秀实践**:
1. ✅ **嵌套 try-catch**: JSON 解析单独处理
2. ✅ **验证结果**: 解析后验证数据有效性
3. ✅ **清除旧状态**: 操作前清除旧的错误/成功消息

---

## 7️⃣ Toast/通知处理

### ✅ 统一的通知模式

**评分**: ⭐⭐⭐⭐⭐ (5/5)

**UploadPanel 通知封装**:
```typescript
const notify = (message, severity = "info") => {
  if (!message) return;
  showNotification?.(message, severity);
};

// 使用示例
notify(t("page.datasource.pickFileFirst"), "warning");
notify(t("page.datasource.uploadSuccess"), "success");
notify(err?.message || t("page.datasource.uploadFail"), "error");
```

**通知类型使用**:

| 类型 | 使用场景 | 示例 |
|------|---------|------|
| `info` | 信息提示 | Excel 文件已上传，请选择工作表 |
| `success` | 操作成功 | 文件上传成功 |
| `warning` | 警告提示 | 请先选择文件 |
| `error` | 错误提示 | 上传失败 |

**优秀实践**:
1. ✅ **统一封装**: `notify` 函数统一处理
2. ✅ **空值检查**: 不显示空消息
3. ✅ **可选回调**: 使用 `?.` 安全调用
4. ✅ **本地化**: 所有消息都本地化

---

### ✅ 错误和成功状态显示

**DataPasteCard 示例**:
```typescript
{error ? (
  <div className="rounded-lg border border-error-border bg-error-bg px-3 py-2 text-sm text-error">
    {error}
  </div>
) : null}

{success ? (
  <div className="rounded-lg border border-success-border bg-success-bg px-3 py-2 text-sm text-success">
    {success}
  </div>
) : null}
```

**优秀实践**:
1. ✅ **语义化颜色**: 使用 `error-border`, `success-bg` 等
2. ✅ **条件渲染**: 只在有消息时显示
3. ✅ **一致样式**: 所有组件使用相同的样式模式

---

## 📊 错误和通知处理总结

### 优秀实践

1. **分层错误处理**:
   - 输入验证 → 警告
   - API 错误 → 错误
   - 网络异常 → 错误 + 日志

2. **用户友好**:
   - 本地化消息
   - 清晰的错误描述
   - 适当的严重级别

3. **开发友好**:
   - 控制台日志
   - 详细的错误信息
   - 堆栈跟踪保留

4. **状态管理**:
   - 错误状态独立
   - 操作前清除旧状态
   - finally 确保清理

### 改进建议

1. **错误边界**: 考虑添加 React Error Boundary
2. **错误追踪**: 集成错误追踪服务（如 Sentry）
3. **重试机制**: 网络错误自动重试

---

**继续阅读**: Part 4 - 数据流、性能与兼容性
