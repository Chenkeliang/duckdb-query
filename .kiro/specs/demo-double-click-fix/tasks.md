# Implementation Plan

- [x] 1. 诊断和修复双击选表功能
  - 验证 `selectTable` 函数在 `main.js` 中的定义和作用域
  - 检查数据源面板模板中的 `ondblclick` 事件绑定
  - 测试双击功能在所有 Tab 页的工作状态
  - 添加控制台日志以便调试
  - _Requirements: 1.1, 1.2, 1.3, 1.4_

- [x] 2. 补充关联查询 Tab 的示例卡片内容
  - 从 `testquery.html` 提取关联查询的完整卡片 HTML
  - 将示例卡片内容添加到 `templates.js` 的 `joinQuery` 模板中
  - 确保包含至少两个数据源卡片（sales_data 和 customer_info）
  - 添加关联类型选择器和关联条件配置
  - 添加卡片之间的关联关系指示器
  - _Requirements: 2.1, 2.2, 2.3, 2.4_

- [x] 3. 补充集合操作 Tab 的示例卡片内容
  - 从 `testquery.html` 提取集合操作的完整卡片 HTML
  - 将示例卡片内容添加到 `templates.js` 的 `setOperations` 模板中
  - 确保包含至少两个数据源卡片
  - 添加字段列表和字段映射配置
  - 确保集合操作类型选择器正常工作
  - 更新 SQL 预览以反映选择的操作
  - _Requirements: 3.1, 3.2, 3.3, 3.4_

- [x] 4. 补充透视表 Tab 的示例配置卡片
  - 从 `testquery.html` 提取透视表的完整配置卡片 HTML
  - 将示例配置添加到 `templates.js` 的 `pivotTable` 模板中
  - 添加行维度卡片（包含 category 和 region 示例）
  - 添加列维度卡片（包含 year 示例）
  - 添加聚合指标卡片（包含 SUM(amount) 示例）
  - 确保底部显示生成的 SQL 预览
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

- [x] 5. 优化图标初始化机制
  - 在 `switchThirdTab` 函数中添加延迟图标初始化
  - 在 `TemplateLoader.loadTemplate` 方法中确保图标初始化
  - 验证所有动态加载内容的图标都能正确显示
  - 添加错误处理和控制台日志
  - _Requirements: 5.1, 5.3_

- [x] 6. 验证事件处理器绑定
  - 测试模板重新加载后事件处理器是否仍然有效
  - 验证所有 onclick 和 ondblclick 事件正常工作
  - 确保 Tab 切换不会破坏事件绑定
  - 添加错误处理和调试信息
  - _Requirements: 5.2, 5.4_

- [x] 7. 最终测试和验证
  - 在浏览器中打开 `docs/demo/index.html`
  - 测试双击数据源面板中的所有表名
  - 切换到关联查询 Tab 并验证示例卡片显示
  - 切换到集合操作 Tab 并验证示例卡片显示
  - 切换到透视表 Tab 并验证配置卡片显示
  - 验证所有图标正确显示
  - 检查浏览器控制台是否有错误信息
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 2.1, 3.1, 4.1, 5.1, 5.2, 5.3_
