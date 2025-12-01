# Requirements Document

## Introduction

修复 DuckQuery Demo 页面中的两个关键问题：
1. 双击数据源表名无法触发选择功能
2. 关联查询、集合操作、透视表的示例卡片内容丢失

这些问题影响了用户体验和功能演示的完整性。

## Glossary

- **Demo Page**: 位于 `docs/demo/index.html` 的演示页面
- **Data Source Panel**: 左侧数据源面板，显示可用的数据表
- **Double-Click Selection**: 双击表名将其插入到当前查询中的功能
- **Template Cards**: 在关联查询、集合操作、透视表中显示的示例配置卡片
- **Event Binding**: JavaScript 事件处理器的绑定机制

## Requirements

### Requirement 1

**User Story:** 作为用户，我想要双击数据源面板中的表名，以便将表名插入到当前查询中

#### Acceptance Criteria

1. WHEN 用户双击数据源面板中的任何表名 THEN 系统 SHALL 触发 `selectTable` 函数并传递正确的表名和事件对象
2. WHEN `selectTable` 函数被调用 THEN 系统 SHALL 更新表名的视觉选中状态（高亮显示）
3. WHEN 表名被选中 THEN 系统 SHALL 在对应的查询区域显示或插入该表名
4. WHEN 用户在不同的 Tab 页（可视化查询、SQL查询、关联查询等）双击表名 THEN 系统 SHALL 根据当前 Tab 的上下文正确处理表名插入

### Requirement 2

**User Story:** 作为用户，我想要在关联查询 Tab 中看到示例数据源卡片，以便理解如何配置关联查询

#### Acceptance Criteria

1. WHEN 用户切换到关联查询 Tab THEN 系统 SHALL 显示至少两个示例数据源卡片（如 sales_data 和 customer_info）
2. WHEN 显示数据源卡片 THEN 系统 SHALL 包含表名、字段列表、关联类型选择器和关联条件配置
3. WHEN 用户查看卡片 THEN 系统 SHALL 显示卡片之间的关联关系指示器（如箭头或连接线）
4. WHEN 用户与卡片交互 THEN 系统 SHALL 提供删除卡片、修改关联类型、配置关联字段的功能

### Requirement 3

**User Story:** 作为用户，我想要在集合操作 Tab 中看到示例数据源卡片，以便理解如何配置集合操作

#### Acceptance Criteria

1. WHEN 用户切换到集合操作 Tab THEN 系统 SHALL 显示至少两个示例数据源卡片
2. WHEN 显示数据源卡片 THEN 系统 SHALL 包含表名、字段列表和字段映射配置
3. WHEN 用户查看卡片 THEN 系统 SHALL 显示集合操作类型（UNION、INTERSECT、EXCEPT）的选择器
4. WHEN 用户选择不同的集合操作类型 THEN 系统 SHALL 更新 SQL 预览以反映选择的操作

### Requirement 4

**User Story:** 作为用户，我想要在透视表 Tab 中看到示例配置卡片，以便理解如何配置透视表

#### Acceptance Criteria

1. WHEN 用户切换到透视表 Tab THEN 系统 SHALL 显示行维度、列维度和聚合指标三个配置卡片
2. WHEN 显示行维度卡片 THEN 系统 SHALL 包含至少两个示例维度字段（如 category 和 region）
3. WHEN 显示列维度卡片 THEN 系统 SHALL 包含至少一个示例维度字段（如 year）
4. WHEN 显示聚合指标卡片 THEN 系统 SHALL 包含至少一个示例聚合配置（如 SUM(amount)）
5. WHEN 用户查看配置 THEN 系统 SHALL 在底部显示生成的 SQL 预览

### Requirement 5

**User Story:** 作为开发者，我想要确保模板系统正确加载所有内容，以便用户看到完整的功能演示

#### Acceptance Criteria

1. WHEN 页面加载完成 THEN 系统 SHALL 正确初始化所有 Lucide 图标
2. WHEN 模板被加载 THEN 系统 SHALL 确保所有事件处理器正确绑定
3. WHEN 用户切换 Tab THEN 系统 SHALL 重新初始化新加载内容的图标和事件处理器
4. WHEN 发生错误 THEN 系统 SHALL 在控制台输出清晰的错误信息以便调试
