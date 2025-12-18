# 文档对齐检查

## 需求 → 设计 → 任务 对齐表

| 需求编号 | 需求名称 | 设计属性 | 任务编号 |
|---------|---------|---------|---------|
| 1.1 | 外部表列信息获取 - API 调用 | Property 1 | 2.1, 2.2, 3.1 |
| 1.2 | 外部表列信息获取 - 错误处理 | - | 3.2 |
| 1.3 | 外部表列信息获取 - 加载指示器 | - | 3.1 |
| 1.4 | 外部表列信息获取 - 格式一致性 | Property 2 | 2.1, 2.3, 3.1 |
| 1.5 | 外部表列信息获取 - 空数组处理 | - | 2.1, 3.3 |
| 1.6 | 外部表列信息获取 - null/undefined 处理 | - | 2.1, 3.3 |
| 2.1 | 联邦查询 API - 路由 | Property 3 | 1.1, 1.2, 4.3, 6.1 |
| 2.2 | 联邦查询 API - 参数验证 | Property 5 | 1.1, 1.2, 1.3, 6.2 |
| 2.3 | 联邦查询 API - 响应格式 | Property 6 | 1.2, 1.3, 6.3 |
| 2.4 | 联邦查询 API - 端点创建 | - | 1.2 |
| 3.1 | SQL 查询 - 自动检测 | - | 5.1, 5.2 |
| 3.2 | SQL 查询 - 混合查询 | Property 3 | 4.2, 5.1, 5.2 |
| 3.3 | SQL 查询 - 纯 DuckDB | Property 4 | 4.2, 4.4 |
| 3.4 | SQL 查询 - 错误提示 | - | 5.3 |
| 4.1 | API 集成 - 端点调用 | Property 1 | 2.1, 2.2 |
| 4.2 | API 集成 - 格式转换 | Property 2 | 2.1, 2.3 |
| 4.3 | API 集成 - 无效连接 | Property 5 | 6.2 |
| 4.4 | API 集成 - 表不存在 | - | 6.2 |
| 5.1 | SetOperations - 列信息获取 | - | 7.1 |
| 5.2 | SetOperations - 启用执行 | - | 7.2 |
| 5.3 | SetOperations - 联邦查询 | - | 7.3 |
| 5.4 | SetOperations - 列数量验证 | - | 7.4 |
| 6.1 | PivotTable - 列信息获取 | - | 8.1 |
| 6.2 | PivotTable - distinct 值查询 | - | 8.2 |
| 6.3 | PivotTable - 空列处理 | - | 8.3 |
| 6.4 | PivotTable - 联邦查询执行 | - | 8.4 |

## 正确性属性对齐

| 属性编号 | 属性名称 | 验证需求 | 测试任务 |
|---------|---------|---------|---------|
| Property 1 | External Table Column API Selection | 1.1, 4.1 | 2.2 |
| Property 2 | Column Data Format Consistency | 1.4, 4.2 | 2.3 |
| Property 3 | Federated Query API Routing | 2.1, 3.2 | 4.3 |
| Property 4 | Pure DuckDB Query Routing | 3.3 | 4.4 |
| Property 5 | Attach Database Parameter Validation | 2.2, 4.3 | 6.2 |
| Property 6 | Federated Query Response Format | 2.3 | 6.3 |

## 任务分组

### 后端任务 (3 个)
- 1.1 创建 FederatedQueryRequest 模型
- 1.2 实现联邦查询端点
- 1.3 编写联邦查询端点单元测试

### 前端核心任务 (15 个)
- 2.1-2.3 useTableColumns Hook
- 3.1-3.3 JoinQueryPanel 修复
- 4.1-4.4 useQueryWorkspace 联邦查询
- 5.1-5.3 SQLQueryPanel 联邦查询
- 6.1-6.3 apiClient 更新

### 其他面板修复 (8 个)
- 7.1-7.4 SetOperationsPanel
- 8.1-8.4 PivotTablePanel

### 测试验证 (4 个)
- 10.1-10.4 集成测试

### Checkpoints (2 个)
- 9. Checkpoint
- 11. Final Checkpoint

**总计: 33 个子任务**
