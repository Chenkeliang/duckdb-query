# Excel 工作表选择器修复设计文档

## 概述

本设计文档描述了如何修复 `UploadPanel` 组件中 Excel 工作表选择功能的实现方案。当用户上传包含多个工作表的 Excel 文件时，系统需要显示工作表选择器，让用户选择要导入的工作表。

### 问题描述

当前 `UploadPanel.tsx` 组件存在以下问题：

1. 没有处理后端返回的 `requires_sheet_selection` 标志
2. 没有 `pendingExcel` 状态来保存待处理的 Excel 文件信息
3. 没有渲染 `ExcelSheetSelector` 组件
4. 缺少工作表选择完成和取消的处理逻辑

### 解决方案概述

通过以下方式修复问题：

1. 添加 `pendingExcel` 状态管理
2. 在 `handleUpload` 函数中检查 `requires_sheet_selection` 标志
3. 条件渲染 `ExcelSheetSelector` 组件
4. 实现 `onImported` 和 `onClose` 回调处理

## 架构

### 组件关系

```
UploadPanel (新版)
├── 文件上传区域
├── URL 导入区域
├── 服务器文件导入区域
└── ExcelSheetSelector (条件渲染)
    ├── 工作表列表
    ├── 导入配置
    └── 确认/取消按钮
```

### 数据流

```
用户上传 Excel 文件
    ↓
uploadFile API 调用
    ↓
后端返回响应
    ↓
检查 requires_sheet_selection
    ↓
    ├─ true → 保存 pending_excel → 显示 ExcelSheetSelector
    │           ↓
    │       用户选择工作表
    │           ↓
    │       importExcelSheets API 调用
    │           ↓
    │       导入完成 → 调用 onDataSourceSaved
    │
    └─ false → 直接调用 onDataSourceSaved
```

## 组件和接口

### UploadPanel 新增状态

```typescript
interface PendingExcel {
  file_id: string;
  original_filename: string;
}

// 新增状态
const [pendingExcel, setPendingExcel] = useState<PendingExcel | null>(null);
```

### UploadPanel Props (保持不变)

```typescript
interface UploadPanelProps {
  onDataSourceSaved?: (dataSource: DataSource) => void;
  showNotification?: (message: string, severity: string) => void;
}
```

### ExcelSheetSelector Props (现有接口)

```typescript
interface ExcelSheetSelectorProps {
  open: boolean;                    // 是否显示对话框
  pendingInfo: PendingExcel;        // 待处理的 Excel 文件信息
  onClose: () => void;              // 关闭/取消回调
  onImported: (result: any) => void; // 导入成功回调
  showNotification: (message: string, severity: string) => void;
}
```

### uploadFile API 响应格式

```typescript
interface UploadResponse {
  success: boolean;
  message: string;
  file_type?: string;
  requires_sheet_selection?: boolean;
  pending_excel?: PendingExcel;
  file_id?: string;
  row_count?: number;
  columns?: string[];
}
```

## 数据模型

### PendingExcel 数据结构

```typescript
interface PendingExcel {
  file_id: string;           // 后端生成的文件 ID
  original_filename: string; // 原始文件名
}
```

### DataSource 数据结构 (现有)

```typescript
interface DataSource {
  id: string;
  type: string;
  name: string;
  row_count?: number;
  columns?: string[];
}
```

## 正确性属性

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: 上传响应状态更新

*For any* Excel 文件上传响应，如果 `requires_sheet_selection` 为 `true`，则 `pendingExcel` 状态应该被设置为响应中的 `pending_excel` 对象。

**Validates: Requirements 1.1, 1.3**

### Property 2: 直接导入路径

*For any* Excel 文件上传响应，如果 `requires_sheet_selection` 为 `false` 或不存在，则应该直接调用 `onDataSourceSaved` 回调，而不设置 `pendingExcel` 状态。

**Validates: Requirements 1.2, 1.4**

### Property 3: 错误响应处理

*For any* 上传失败的响应（`success: false`），应该显示错误消息并且不设置 `pendingExcel` 状态。

**Validates: Requirements 1.5**

### Property 4: 选择器条件渲染

*For any* 组件渲染，当且仅当 `pendingExcel` 状态非空时，`ExcelSheetSelector` 组件应该被渲染且 `open` prop 为 `true`。

**Validates: Requirements 2.1, 2.2, 2.5**

### Property 5: 选择器数据传递

*For any* 渲染的 `ExcelSheetSelector`，`pendingInfo` prop 应该等于 `pendingExcel` 状态的值。

**Validates: Requirements 2.3**

### Property 6: 消息显示互斥

*For any* 组件状态，当 `pendingExcel` 非空时，上传成功消息不应该显示。

**Validates: Requirements 2.4**

### Property 7: 导入完成状态清理

*For any* 成功的工作表导入，`pendingExcel` 状态应该被清除，`onDataSourceSaved` 应该被调用，且成功通知应该显示。

**Validates: Requirements 3.1, 3.2, 3.3, 3.4**

### Property 8: 导入失败处理

*For any* 失败的工作表导入，应该显示错误通知，且 `pendingExcel` 状态应该保持不变（允许用户重试）。

**Validates: Requirements 3.5, 5.4**

### Property 9: 取消操作状态重置

*For any* 取消操作，`pendingExcel` 状态应该被清除，`ExcelSheetSelector` 应该关闭，且 `onDataSourceSaved` 不应该被调用。

**Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5**

### Property 10: 错误通知传播

*For any* 在 `ExcelSheetSelector` 内部发生的错误，应该通过 `showNotification` 显示错误消息。

**Validates: Requirements 5.1, 5.2, 5.3**

### Property 11: 错误日志记录

*For any* 捕获的错误，应该在控制台记录错误信息以便调试。

**Validates: Requirements 5.5**

### Property 12: 多次上传状态重置

*For any* 连续的上传操作，每次上传前应该清除之前的 `pendingExcel` 状态，确保状态不会累积。

**Validates: Requirements 6.5**

## 错误处理

### 错误类型

1. **网络错误**: API 调用失败
2. **后端错误**: 后端返回错误响应
3. **状态错误**: 组件状态不一致
4. **用户错误**: 用户操作不当

### 错误处理策略

#### 上传阶段错误

```typescript
try {
  const response = await uploadFile(selectedFile, alias || null);
  if (!response?.success) {
    // 后端错误
    notify(response?.message || t("page.datasource.uploadFail"), "error");
    return;
  }
  // 处理成功响应
} catch (err) {
  // 网络错误
  console.error("Upload failed:", err);
  notify(err?.message || t("page.datasource.uploadFail"), "error");
}
```

#### 工作表选择阶段错误

```typescript
const handleImported = (result) => {
  try {
    if (!result?.success) {
      // 导入失败，保持选择器打开
      notify(result?.message || t("page.datasource.importFail"), "error");
      return;
    }
    // 导入成功，清理状态
    setPendingExcel(null);
    onDataSourceSaved?.(/* ... */);
    notify(t("page.datasource.importSuccess"), "success");
  } catch (err) {
    console.error("Import handling failed:", err);
    notify(err?.message || t("page.datasource.importFail"), "error");
  }
};
```

#### 取消操作错误

```typescript
const handleClose = () => {
  try {
    setPendingExcel(null);
    // 可选：清理其他相关状态
  } catch (err) {
    console.error("Close handling failed:", err);
    // 即使出错也要尝试清理状态
    setPendingExcel(null);
  }
};
```

### 错误恢复机制

1. **保持选择器打开**: 导入失败时不关闭选择器，允许用户重试
2. **状态回滚**: 操作失败时保持之前的状态
3. **清晰的错误消息**: 显示用户友好的错误消息
4. **控制台日志**: 记录详细错误信息以便调试

## 测试策略

### 单元测试

#### 测试用例 1: 需要工作表选择的上传

```typescript
test("should show ExcelSheetSelector when requires_sheet_selection is true", async () => {
  const mockResponse = {
    success: true,
    file_type: "excel",
    requires_sheet_selection: true,
    message: "Excel 文件已上传，请选择需要导入的工作表。",
    pending_excel: {
      file_id: "test-file-id",
      original_filename: "test.xlsx"
    }
  };
  
  // Mock uploadFile API
  uploadFile.mockResolvedValue(mockResponse);
  
  // Render component and upload file
  const { getByText } = render(<UploadPanel />);
  // ... trigger upload
  
  // Assert ExcelSheetSelector is rendered
  await waitFor(() => {
    expect(getByText(/选择工作表/)).toBeInTheDocument();
  });
});
```

#### 测试用例 2: 不需要工作表选择的上传

```typescript
test("should call onDataSourceSaved directly when requires_sheet_selection is false", async () => {
  const mockResponse = {
    success: true,
    file_type: "csv",
    requires_sheet_selection: false,
    file_id: "test-table",
    row_count: 100,
    columns: ["col1", "col2"]
  };
  
  const onDataSourceSaved = jest.fn();
  uploadFile.mockResolvedValue(mockResponse);
  
  // Render and upload
  const { getByText } = render(<UploadPanel onDataSourceSaved={onDataSourceSaved} />);
  // ... trigger upload
  
  // Assert callback is called
  await waitFor(() => {
    expect(onDataSourceSaved).toHaveBeenCalledWith(
      expect.objectContaining({ id: "test-table" })
    );
  });
});
```

#### 测试用例 3: 工作表选择完成

```typescript
test("should clear pendingExcel and call onDataSourceSaved when import succeeds", async () => {
  const onDataSourceSaved = jest.fn();
  const mockImportResult = {
    success: true,
    table_name: "imported-table",
    row_count: 50,
    columns: ["col1", "col2"]
  };
  
  // Setup component with pendingExcel
  const { getByText } = render(
    <UploadPanel onDataSourceSaved={onDataSourceSaved} />
  );
  
  // Trigger import completion
  // ... simulate ExcelSheetSelector onImported callback
  
  // Assert state is cleared and callback is called
  expect(onDataSourceSaved).toHaveBeenCalled();
  expect(getByText(/选择工作表/)).not.toBeInTheDocument();
});
```

#### 测试用例 4: 取消工作表选择

```typescript
test("should clear pendingExcel when user cancels", async () => {
  // Setup component with pendingExcel
  const { getByText, queryByText } = render(<UploadPanel />);
  
  // Trigger cancel
  // ... simulate ExcelSheetSelector onClose callback
  
  // Assert selector is closed
  expect(queryByText(/选择工作表/)).not.toBeInTheDocument();
});
```

#### 测试用例 5: 上传错误处理

```typescript
test("should show error notification when upload fails", async () => {
  const showNotification = jest.fn();
  uploadFile.mockRejectedValue(new Error("Network error"));
  
  const { getByText } = render(
    <UploadPanel showNotification={showNotification} />
  );
  
  // Trigger upload
  // ... trigger upload
  
  // Assert error notification is shown
  await waitFor(() => {
    expect(showNotification).toHaveBeenCalledWith(
      expect.stringContaining("error"),
      "error"
    );
  });
});
```

### 属性测试

由于这是 UI 组件，属性测试主要关注状态转换的正确性：

#### Property Test 1: 状态转换一致性

```typescript
test("property: state transitions are consistent", () => {
  // For any sequence of upload responses
  fc.assert(
    fc.property(
      fc.array(fc.record({
        success: fc.boolean(),
        requires_sheet_selection: fc.boolean(),
        pending_excel: fc.option(fc.record({
          file_id: fc.string(),
          original_filename: fc.string()
        }))
      })),
      (responses) => {
        // Simulate uploads with these responses
        // Verify that pendingExcel state matches the last response
        // that had requires_sheet_selection: true
      }
    )
  );
});
```

### 集成测试

#### 测试场景 1: 完整的 Excel 导入流程

1. 用户选择 Excel 文件
2. 点击上传
3. 系统显示工作表选择器
4. 用户选择工作表并配置
5. 点击确认
6. 系统完成导入并更新数据源列表

#### 测试场景 2: 取消 Excel 导入流程

1. 用户选择 Excel 文件
2. 点击上传
3. 系统显示工作表选择器
4. 用户点击取消
5. 系统关闭选择器并重置状态

#### 测试场景 3: 错误恢复流程

1. 用户选择 Excel 文件
2. 点击上传
3. 系统显示工作表选择器
4. 用户选择工作表并确认
5. 导入失败
6. 系统显示错误消息但保持选择器打开
7. 用户修改配置并重试
8. 导入成功

## 实现细节

### 状态初始化

```typescript
const [pendingExcel, setPendingExcel] = useState<PendingExcel | null>(null);
```

### handleUpload 修改

```typescript
const handleUpload = async () => {
  if (!selectedFile) {
    notify(t("page.datasource.pickFileFirst"), "warning");
    return;
  }
  
  setUploading(true);
  try {
    const response = await uploadFile(selectedFile, alias || null);
    
    if (!response?.success) {
      notify(response?.message || t("page.datasource.uploadFail"), "error");
      return;
    }
    
    // 检查是否需要工作表选择
    if (response.requires_sheet_selection && response.pending_excel) {
      setPendingExcel(response.pending_excel);
      notify(response.message, "info");
      return;
    }
    
    // 直接导入成功
    notify(
      t("page.datasource.uploadSuccessTable", {
        table: response.file_id
      }),
      "success"
    );
    
    onDataSourceSaved?.({
      id: response.file_id,
      type: "duckdb",
      name: t("page.datasource.duckdbTable", {
        table: response.file_id
      }),
      row_count: response.row_count,
      columns: response.columns || []
    });
    
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

### 回调处理函数

```typescript
const handleExcelImported = (result) => {
  try {
    if (!result?.success) {
      notify(result?.message || t("page.datasource.importFail"), "error");
      return;
    }
    
    // 清除 pending 状态
    setPendingExcel(null);
    
    // 调用成功回调
    onDataSourceSaved?.({
      id: result.table_name,
      type: "duckdb",
      name: t("page.datasource.duckdbTable", {
        table: result.table_name
      }),
      row_count: result.row_count,
      columns: result.columns || []
    });
    
    // 显示成功通知
    notify(
      result.message || t("page.datasource.importSuccess"),
      "success"
    );
    
    // 重置上传状态
    setSelectedFile(null);
    setAlias("");
  } catch (err) {
    console.error("Import handling failed:", err);
    notify(err?.message || t("page.datasource.importFail"), "error");
  }
};

const handleExcelClose = () => {
  try {
    setPendingExcel(null);
    // 可选：清理上传结果消息
  } catch (err) {
    console.error("Close handling failed:", err);
    setPendingExcel(null);
  }
};
```

### JSX 渲染

```typescript
return (
  <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
    {/* 现有的上传卡片 */}
    <Card className="shadow-sm">
      {/* ... 现有内容 ... */}
    </Card>
    
    {/* 现有的 URL 和服务器导入卡片 */}
    <div className="flex flex-col gap-6">
      {/* ... 现有内容 ... */}
    </div>
    
    {/* Excel 工作表选择器 */}
    {pendingExcel && (
      <ExcelSheetSelector
        open={true}
        pendingInfo={pendingExcel}
        onClose={handleExcelClose}
        onImported={handleExcelImported}
        showNotification={showNotification}
      />
    )}
  </div>
);
```

## 性能考虑

### 状态更新优化

- 使用 `useState` 而不是 `useReducer`，因为状态逻辑简单
- 避免不必要的重新渲染：`ExcelSheetSelector` 只在 `pendingExcel` 存在时渲染

### 内存管理

- 及时清理 `pendingExcel` 状态
- 避免状态累积

### 用户体验

- 上传过程中显示加载状态
- 错误时提供清晰的反馈
- 成功时自动清理状态

## 兼容性

### 与现有组件的兼容性

- **ExcelSheetSelector**: 使用现有的 props 接口，无需修改
- **通知系统**: 使用现有的 `showNotification` 函数
- **数据源管理**: 使用现有的 `onDataSourceSaved` 回调

### 与旧版的兼容性

- 不影响旧版 `ShadcnApp` 的功能
- 新版 `UploadPanel` 独立工作
- 共享相同的 API 和数据格式

## 部署注意事项

### 前端部署

1. 确保 TypeScript 编译无错误
2. 验证构建产物大小没有显著增加
3. 测试所有浏览器的兼容性

### 后端依赖

- 确保后端 API 返回正确的 `requires_sheet_selection` 标志
- 确保 `pending_excel` 对象包含必要的字段

### 回滚计划

如果出现问题，可以：

1. 回滚到之前的版本
2. 临时禁用工作表选择功能
3. 使用旧版上传组件

## 未来改进

### 短期改进

1. 添加上传进度条
2. 支持批量文件上传
3. 改进错误消息的国际化

### 长期改进

1. 支持更多文件格式的预览
2. 添加文件验证和清理功能
3. 实现拖拽排序工作表

## 参考资料

- [React Hooks 文档](https://react.dev/reference/react)
- [TypeScript 类型系统](https://www.typescriptlang.org/docs/handbook/2/types-from-types.html)
- [Material-UI Dialog 组件](https://mui.com/material-ui/react-dialog/)
- [项目 API 文档](../../api/README.md)
