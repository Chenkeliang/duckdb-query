# Excel 工作表选择器修复实现任务

## 任务列表

- [x] 1. 添加状态管理和类型定义
  - 在 `UploadPanel.tsx` 中添加 `PendingExcel` 类型定义
  - 添加 `pendingExcel` 状态：`const [pendingExcel, setPendingExcel] = useState<PendingExcel | null>(null)`
  - 导入 `ExcelSheetSelector` 组件
  - _Requirements: 1.1, 1.3, 6.1_

- [ ] 2. 修改 handleUpload 函数处理工作表选择
  - [x] 2.1 添加 requires_sheet_selection 检查逻辑
    - 在成功响应后检查 `response.requires_sheet_selection`
    - 如果为 `true`，调用 `setPendingExcel(response.pending_excel)`
    - 如果为 `false` 或不存在，执行现有的直接导入逻辑
    - _Requirements: 1.1, 1.2, 1.3, 1.4_

  - [ ] 2.2 编写 Property Test: 上传响应状态更新
    - **Property 1: 上传响应状态更新**
    - **Validates: Requirements 1.1, 1.3**
    - 测试当 `requires_sheet_selection` 为 `true` 时，`pendingExcel` 状态被正确设置

  - [ ] 2.3 编写 Property Test: 直接导入路径
    - **Property 2: 直接导入路径**
    - **Validates: Requirements 1.2, 1.4**
    - 测试当 `requires_sheet_selection` 为 `false` 时，直接调用 `onDataSourceSaved`

  - [ ] 2.4 编写 Unit Test: 上传错误处理
    - 测试上传失败时显示错误消息
    - 测试网络错误的处理
    - _Requirements: 1.5_

- [ ] 3. 实现工作表选择完成回调
  - [x] 3.1 创建 handleExcelImported 函数
    - 检查导入结果的 `success` 字段
    - 成功时：清除 `pendingExcel` 状态，调用 `onDataSourceSaved`，显示成功通知
    - 失败时：显示错误通知，保持 `pendingExcel` 状态（允许重试）
    - 添加 try-catch 错误处理和控制台日志
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 5.4, 5.5_

  - [ ] 3.2 编写 Property Test: 导入完成状态清理
    - **Property 7: 导入完成状态清理**
    - **Validates: Requirements 3.1, 3.2, 3.3, 3.4**
    - 测试成功导入后状态被正确清理

  - [ ] 3.3 编写 Property Test: 导入失败处理
    - **Property 8: 导入失败处理**
    - **Validates: Requirements 3.5, 5.4**
    - 测试失败时状态保持不变且显示错误

- [ ] 4. 实现工作表选择取消回调
  - [x] 4.1 创建 handleExcelClose 函数
    - 清除 `pendingExcel` 状态
    - 添加 try-catch 错误处理
    - 确保即使出错也清理状态
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

  - [ ] 4.2 编写 Property Test: 取消操作状态重置
    - **Property 9: 取消操作状态重置**
    - **Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5**
    - 测试取消时状态被正确重置且不调用成功回调

- [ ] 5. 添加 ExcelSheetSelector 组件渲染
  - [x] 5.1 在 JSX 中添加条件渲染
    - 在组件返回的 JSX 末尾添加 `ExcelSheetSelector` 条件渲染
    - 使用 `{pendingExcel && <ExcelSheetSelector ... />}` 模式
    - 传递 `open={true}` prop
    - 传递 `pendingInfo={pendingExcel}` prop
    - 传递 `onClose={handleExcelClose}` prop
    - 传递 `onImported={handleExcelImported}` prop
    - 传递 `showNotification={showNotification}` prop
    - _Requirements: 2.1, 2.2, 2.3, 2.5_

  - [ ] 5.2 编写 Property Test: 选择器条件渲染
    - **Property 4: 选择器条件渲染**
    - **Validates: Requirements 2.1, 2.2, 2.5**
    - 测试选择器只在 `pendingExcel` 非空时渲染

  - [ ] 5.3 编写 Property Test: 选择器数据传递
    - **Property 5: 选择器数据传递**
    - **Validates: Requirements 2.3**
    - 测试 `pendingInfo` prop 正确传递数据

- [ ] 6. 优化上传成功消息显示逻辑
  - [ ] 6.1 修改上传成功消息的条件渲染
    - 确保当 `pendingExcel` 存在时不显示上传成功消息
    - 修改条件为 `{uploadResult && !pendingExcel && (...)}`
    - _Requirements: 2.4_

  - [ ] 6.2 编写 Property Test: 消息显示互斥
    - **Property 6: 消息显示互斥**
    - **Validates: Requirements 2.4**
    - 测试成功消息和选择器不同时显示

- [ ] 7. 添加错误处理和日志
  - [ ] 7.1 在所有 catch 块中添加 console.error
    - `handleUpload` 中的错误日志
    - `handleExcelImported` 中的错误日志
    - `handleExcelClose` 中的错误日志
    - _Requirements: 5.5_

  - [ ] 7.2 编写 Property Test: 错误通知传播
    - **Property 10: 错误通知传播**
    - **Validates: Requirements 5.1, 5.2, 5.3**
    - 测试所有错误都通过 `showNotification` 显示

  - [ ] 7.3 编写 Property Test: 错误日志记录
    - **Property 11: 错误日志记录**
    - **Validates: Requirements 5.5**
    - 测试所有错误都被记录到控制台

- [ ] 8. 添加多次上传状态重置逻辑
  - [ ] 8.1 在 handleUpload 开始时清除 pendingExcel
    - 在 `setUploading(true)` 之前添加 `setPendingExcel(null)`
    - 确保每次上传都从干净的状态开始
    - _Requirements: 6.5_

  - [ ] 8.2 编写 Property Test: 多次上传状态重置
    - **Property 12: 多次上传状态重置**
    - **Validates: Requirements 6.5**
    - 测试连续上传时状态正确重置

- [ ] 9. Checkpoint - 确保所有测试通过
  - 运行所有单元测试和属性测试
  - 确保 TypeScript 编译无错误
  - 确保所有 ESLint 警告已解决
  - 如有问题，询问用户

- [ ] 10. 集成测试和验证
  - [ ] 10.1 编写集成测试：完整 Excel 导入流程
    - 测试从文件选择到导入完成的完整流程
    - 验证数据源列表更新
    - _Requirements: 所有需求_

  - [ ] 10.2 编写集成测试：取消 Excel 导入流程
    - 测试取消操作的完整流程
    - 验证状态正确重置
    - _Requirements: 4.1-4.5_

  - [ ] 10.3 编写集成测试：错误恢复流程
    - 测试导入失败后重试的流程
    - 验证错误处理和恢复机制
    - _Requirements: 5.1-5.5_

- [ ] 11. 手动测试和验证
  - [ ] 11.1 测试单工作表 Excel 文件上传
    - 验证直接导入流程
    - 验证不显示工作表选择器
    - _Requirements: 1.2, 1.4_

  - [ ] 11.2 测试多工作表 Excel 文件上传
    - 验证显示工作表选择器
    - 验证工作表列表正确显示
    - _Requirements: 1.1, 2.1-2.3_

  - [ ] 11.3 测试工作表选择和导入
    - 选择工作表并配置
    - 验证导入成功
    - 验证数据源列表更新
    - _Requirements: 3.1-3.4_

  - [ ] 11.4 测试取消工作表选择
    - 点击取消按钮
    - 验证选择器关闭
    - 验证状态重置
    - _Requirements: 4.1-4.5_

  - [ ] 11.5 测试错误场景
    - 测试网络错误
    - 测试后端错误
    - 验证错误消息显示
    - 验证错误恢复机制
    - _Requirements: 5.1-5.5_

- [ ] 12. 最终 Checkpoint - 确保所有功能正常
  - 确保所有测试通过
  - 确保所有手动测试场景通过
  - 确保构建成功
  - 如有问题，询问用户

## 任务说明

### 任务完整性
- 所有任务都是必需的，包括测试任务
- 核心实现任务（1-8）和测试任务（2.2-10.3）都必须完成
- 这确保了代码质量和功能正确性

### 任务依赖关系
- 任务 1 必须首先完成（状态和类型定义）
- 任务 2-4 可以并行进行（不同的回调函数）
- 任务 5 依赖任务 3-4（需要回调函数）
- 任务 6 可以与任务 5 并行
- 任务 7-8 可以在任务 2-6 之后进行
- 任务 9 是第一个检查点
- 任务 10-11 是验证任务
- 任务 12 是最终检查点

### 实现注意事项
1. **类型安全**: 确保所有 TypeScript 类型正确
2. **错误处理**: 所有异步操作都要有 try-catch
3. **状态清理**: 确保状态在适当的时候被清理
4. **用户体验**: 提供清晰的加载和错误反馈
5. **兼容性**: 不影响现有功能

### 测试注意事项
1. **单元测试**: 测试单个函数的行为
2. **属性测试**: 测试通用属性在所有输入下都成立
3. **集成测试**: 测试完整的用户流程
4. **手动测试**: 验证实际用户体验

### 验收标准
- 所有核心任务（1-8）完成
- TypeScript 编译无错误
- 所有必需的测试通过
- 手动测试所有场景通过
- 构建成功且无警告
