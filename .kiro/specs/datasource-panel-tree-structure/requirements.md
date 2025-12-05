# 数据源面板树形结构需求文档

## Introduction

实现类似 DataGrip 的数据源面板树形结构，支持 DuckDB 表分组和外部数据库连接的层级展示。

## Glossary

- **DuckDB 表**: 在 DuckDB 中创建的表（文件上传、查询结果等）
- **系统表**: 以 `system_` 开头的表，用于存储元数据
- **数据库连接**: 外部数据库连接（PostgreSQL、MySQL 等）
- **Schema**: 数据库模式/命名空间
- **TreeView**: 树形视图组件，支持展开/折叠

## Requirements

### Requirement 1: DuckDB 表分组显示

**User Story:** 作为用户，我想要看到 DuckDB 表按类型分组，以便快速找到需要的表。

#### Acceptance Criteria

1. WHEN 用户打开数据源面板 THEN 系统 SHALL 显示两个 DuckDB 表分组：系统表和普通表
2. WHEN 表名以 `system_` 开头 THEN 系统 SHALL 将其归类为系统表分组
3. WHEN 表名不以 `system_` 开头 THEN 系统 SHALL 将其归类为普通表分组
4. WHEN 用户点击分组标题 THEN 系统 SHALL 展开或折叠该分组
5. WHEN 分组展开 THEN 系统 SHALL 显示该分组下的所有表

### Requirement 2: 数据库连接树形结构

**User Story:** 作为用户，我想要以树形结构查看数据库连接及其下的表，就像 DataGrip 一样。

#### Acceptance Criteria

1. WHEN 用户打开数据源面板 THEN 系统 SHALL 显示所有已保存的数据库连接
2. WHEN 显示数据库连接 THEN 系统 SHALL 显示连接名称、数据库类型和连接状态
3. WHEN 用户点击数据库连接 THEN 系统 SHALL 展开显示该连接下的所有 schema
4. WHEN 用户点击 schema THEN 系统 SHALL 展开显示该 schema 下的表列表
5. WHEN 显示表数量 THEN 系统 SHALL 在 schema 旁边显示表的数量

### Requirement 3: 连接状态管理

**User Story:** 作为用户，我想要看到数据库连接的实时状态，以便知道连接是否可用。

#### Acceptance Criteria

1. WHEN 数据库连接处于活动状态 THEN 系统 SHALL 显示绿色的"已连接"状态指示器
2. WHEN 数据库连接处于非活动状态 THEN 系统 SHALL 显示灰色的"未连接"状态指示器
3. WHEN 数据库连接失败 THEN 系统 SHALL 显示红色的"连接失败"状态指示器
4. WHEN 用户点击刷新按钮 THEN 系统 SHALL 重新检查所有连接的状态

### Requirement 4: 表选择和操作

**User Story:** 作为用户，我想要选择任意表（DuckDB 或外部数据库）进行查询。

#### Acceptance Criteria

1. WHEN 用户点击 DuckDB 表 THEN 系统 SHALL 选中该表并触发选择回调
2. WHEN 用户点击外部数据库表 THEN 系统 SHALL 选中该表并触发选择回调
3. WHEN 用户右键点击表 THEN 系统 SHALL 显示上下文菜单（预览、删除等）
4. WHEN 用户搜索表名 THEN 系统 SHALL 在所有分组中过滤匹配的表
5. WHEN 搜索结果为空 THEN 系统 SHALL 显示"未找到匹配的表"提示

### Requirement 5: 懒加载和性能优化

**User Story:** 作为用户，我想要快速打开数据源面板，即使有大量的数据库连接和表。

#### Acceptance Criteria

1. WHEN 用户打开数据源面板 THEN 系统 SHALL 仅加载 DuckDB 表和数据库连接列表
2. WHEN 用户展开数据库连接 THEN 系统 SHALL 懒加载该连接下的 schema 列表
3. WHEN 用户展开 schema THEN 系统 SHALL 懒加载该 schema 下的表列表
4. WHEN 加载数据时 THEN 系统 SHALL 显示加载指示器
5. WHEN 加载失败 THEN 系统 SHALL 显示错误提示并允许重试

### Requirement 6: 图标和视觉层级

**User Story:** 作为用户，我想要通过图标和缩进快速识别不同类型的节点。

#### Acceptance Criteria

1. WHEN 显示数据库连接 THEN 系统 SHALL 使用数据库图标（🔌）
2. WHEN 显示 schema THEN 系统 SHALL 使用文件夹图标（📂）
3. WHEN 显示表 THEN 系统 SHALL 使用表格图标（📋）
4. WHEN 显示嵌套节点 THEN 系统 SHALL 使用缩进表示层级关系
5. WHEN 节点可展开 THEN 系统 SHALL 显示展开/折叠箭头图标

### Requirement 7: 数据缓存和刷新

**User Story:** 作为用户，我想要数据源面板能够缓存数据，同时支持手动刷新。

#### Acceptance Criteria

1. WHEN 用户首次打开面板 THEN 系统 SHALL 从服务器加载数据并缓存
2. WHEN 用户再次打开面板 THEN 系统 SHALL 优先使用缓存数据
3. WHEN 用户点击刷新按钮 THEN 系统 SHALL 清除缓存并重新加载所有数据
4. WHEN 用户上传文件或创建表 THEN 系统 SHALL 自动刷新 DuckDB 表列表
5. WHEN 缓存数据超过 5 分钟 THEN 系统 SHALL 自动标记为过期并在下次访问时刷新
