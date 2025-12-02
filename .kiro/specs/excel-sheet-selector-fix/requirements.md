# Excel 工作表选择器修复需求文档

## 简介

本文档定义了修复 Excel 文件上传后工作表选择功能的需求。当用户上传包含多个工作表的 Excel 文件时，系统应该显示工作表选择器，让用户选择要导入的工作表。

## 术语表

- **UploadPanel**: 新版数据源上传面板组件，位于 `frontend/src/new/DataSource/UploadPanel.tsx`
- **ExcelSheetSelector**: Excel 工作表选择器组件，位于 `frontend/src/components/DataSourceManagement/ExcelSheetSelector.jsx`
- **pending_excel**: 后端返回的待处理 Excel 文件信息对象
- **requires_sheet_selection**: 后端返回的布尔标志，指示是否需要工作表选择

## 需求

### 需求 1: Excel 文件上传响应处理

**用户故事**: 作为用户，当我上传 Excel 文件时，系统应该正确识别是否需要工作表选择，以便我可以选择要导入的工作表。

#### 验收标准

1. WHEN 用户上传 Excel 文件并且后端返回 `requires_sheet_selection: true` THEN UploadPanel SHALL 保存 `pending_excel` 信息到组件状态
2. WHEN 后端返回 `requires_sheet_selection: false` THEN UploadPanel SHALL 直接完成导入流程
3. WHEN 上传响应包含 `pending_excel` 对象 THEN UploadPanel SHALL 提取 `file_id` 和 `original_filename` 字段
4. WHEN 上传成功但不需要工作表选择 THEN UploadPanel SHALL 调用 `onDataSourceSaved` 回调
5. WHEN 上传失败 THEN UploadPanel SHALL 显示错误消息

### 需求 2: 工作表选择器显示

**用户故事**: 作为用户，当系统检测到需要工作表选择时，我希望看到工作表选择器界面，以便我可以选择要导入的工作表。

#### 验收标准

1. WHEN `pending_excel` 状态存在 THEN UploadPanel SHALL 显示 ExcelSheetSelector 组件
2. WHEN ExcelSheetSelector 显示时 THEN UploadPanel SHALL 传递 `open={true}` prop
3. WHEN ExcelSheetSelector 显示时 THEN UploadPanel SHALL 传递 `pendingInfo` prop 包含 pending_excel 数据
4. WHEN ExcelSheetSelector 显示时 THEN UploadPanel SHALL 隐藏上传成功消息
5. WHEN 没有 pending_excel 状态 THEN UploadPanel SHALL 不显示 ExcelSheetSelector 组件

### 需求 3: 工作表选择完成处理

**用户故事**: 作为用户，当我选择工作表并确认后，系统应该完成导入并更新数据源列表，以便我可以使用导入的数据。

#### 验收标准

1. WHEN 用户在 ExcelSheetSelector 中选择工作表并确认 THEN UploadPanel SHALL 调用 `onDataSourceSaved` 回调
2. WHEN 工作表选择完成 THEN UploadPanel SHALL 清除 `pending_excel` 状态
3. WHEN 工作表选择完成 THEN UploadPanel SHALL 关闭 ExcelSheetSelector
4. WHEN 导入成功 THEN UploadPanel SHALL 显示成功通知
5. WHEN 导入失败 THEN UploadPanel SHALL 显示错误通知

### 需求 4: 工作表选择取消处理

**用户故事**: 作为用户，当我不想继续导入时，我希望能够取消工作表选择，以便返回到初始上传界面。

#### 验收标准

1. WHEN 用户在 ExcelSheetSelector 中点击取消 THEN UploadPanel SHALL 清除 `pending_excel` 状态
2. WHEN 用户取消工作表选择 THEN UploadPanel SHALL 关闭 ExcelSheetSelector
3. WHEN 用户取消工作表选择 THEN UploadPanel SHALL 清除上传结果消息
4. WHEN 用户取消工作表选择 THEN UploadPanel SHALL 重置文件选择状态
5. WHEN 用户取消工作表选择 THEN UploadPanel SHALL 不调用 `onDataSourceSaved` 回调

### 需求 5: 错误处理

**用户故事**: 作为用户，当工作表选择或导入过程中出现错误时，我希望看到清晰的错误消息，以便我知道发生了什么问题。

#### 验收标准

1. WHEN ExcelSheetSelector 内部发生错误 THEN UploadPanel SHALL 通过 `showNotification` 显示错误消息
2. WHEN 网络请求失败 THEN UploadPanel SHALL 显示用户友好的错误消息
3. WHEN 后端返回错误响应 THEN UploadPanel SHALL 显示后端返回的错误消息
4. WHEN 发生错误 THEN UploadPanel SHALL 保持 ExcelSheetSelector 打开状态以便用户重试
5. WHEN 发生错误 THEN UploadPanel SHALL 记录错误到控制台以便调试

### 需求 6: 状态管理

**用户故事**: 作为开发者，我希望组件状态管理清晰且可预测，以便维护和调试代码。

#### 验收标准

1. WHEN 组件初始化 THEN UploadPanel SHALL 初始化 `pendingExcel` 状态为 `null`
2. WHEN 上传响应到达 THEN UploadPanel SHALL 根据 `requires_sheet_selection` 更新状态
3. WHEN 状态更新 THEN UploadPanel SHALL 触发组件重新渲染
4. WHEN 组件卸载 THEN UploadPanel SHALL 清理所有状态
5. WHEN 多次上传 THEN UploadPanel SHALL 正确重置和更新状态

## 非功能需求

### 性能

- 工作表选择器应该在 500ms 内显示
- 状态更新应该是同步的，不应该有延迟

### 用户体验

- 界面过渡应该平滑，没有闪烁
- 错误消息应该清晰且可操作
- 加载状态应该有明确的视觉反馈

### 兼容性

- 必须与现有的 ExcelSheetSelector 组件兼容
- 必须与现有的通知系统兼容
- 必须与现有的数据源管理流程兼容

## 约束条件

1. 不能修改 ExcelSheetSelector 组件的接口
2. 必须使用现有的 `uploadFile` API
3. 必须保持与旧版 ShadcnApp 的兼容性
4. 必须遵循项目的 TypeScript 类型约定
