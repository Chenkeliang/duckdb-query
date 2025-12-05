# 后端数据源管理 API 统一化 - 任务列表

## 任务 1: 创建数据模型和基础结构

- [ ] 1.1 创建统一的数据源响应模型
  - 在 `api/models/` 创建 `datasource_models.py`
  - 定义 `DataSourceResponse` 模型
  - 定义批量操作相关模型
  - 定义改进的连接测试响应模型
  - _需求: 2.1, 2.2, 3.1_

- [ ] 1.2 创建数据源聚合器
  - 在 `api/services/` 创建 `datasource_aggregator.py`
  - 实现 `DataSourceAggregator` 类
  - 实现 `list_all_datasources()` 方法
  - 实现 `get_datasource()` 方法
  - 实现 `delete_datasource()` 方法
  - _需求: 2.1, 2.5_

## 任务 2: 实现统一数据源端点

- [ ] 2.1 创建数据源路由文件
  - 在 `api/routers/` 创建 `datasources.py`
  - 设置路由器和基础结构
  - _需求: 2.1_

- [ ] 2.2 实现数据源列表端点
  - 实现 `GET /api/datasources`
  - 支持类型过滤（type, subtype, status）
  - 实现数据源信息聚合
  - 实现敏感信息过滤
  - _需求: 2.1, 2.2, 8.1_

- [ ] 2.3 实现单个数据源查询端点
  - 实现 `GET /api/datasources/{id}`
  - 支持所有类型的数据源
  - _需求: 2.2_

- [ ] 2.4 实现数据源删除端点
  - 实现 `DELETE /api/datasources/{id}`
  - 支持所有类型的数据源删除
  - _需求: 2.5_

## 任务 3: 实现改进的连接测试

- [ ] 3.1 创建增强的连接测试器
  - 在 `api/services/` 创建 `connection_tester.py`
  - 实现 `EnhancedConnectionTester` 类
  - 实现连接时间测量
  - 实现数据库信息获取（版本、表数量等）
  - _需求: 3.1, 3.3_

- [ ] 3.2 实现错误诊断功能
  - 实现 `_diagnose_error()` 方法
  - 区分错误类型（network, auth, permission, timeout）
  - 提供针对性的解决建议
  - _需求: 3.4, 7.4_

- [ ] 3.3 实现警告检测
  - 检测未启用 SSL
  - 检测弱密码
  - 检测其他安全问题
  - _需求: 3.5_

- [ ] 3.4 实现连接测试端点
  - 实现 `POST /api/datasources/test`（测试未保存配置）
  - 实现 `POST /api/datasources/{id}/test`（测试已保存配置）
  - 添加超时参数支持
  - _需求: 3.1, 3.2, 8.3_

## 任务 4: 实现批量操作

- [ ] 4.1 创建批量操作处理器
  - 在 `api/services/` 创建 `batch_operations.py`
  - 实现 `BatchOperationHandler` 类
  - _需求: 4.1_

- [ ] 4.2 实现批量删除
  - 实现 `batch_delete()` 方法
  - 实现 `POST /api/datasources/batch/delete` 端点
  - 支持部分失败的详细报告
  - 添加批量大小限制（最多 50 个）
  - _需求: 4.1, 4.3, 8.4_

- [ ] 4.3 实现批量测试
  - 实现 `batch_test()` 方法
  - 实现 `POST /api/datasources/batch/test` 端点
  - 使用并发测试提高性能
  - 支持超时控制
  - _需求: 4.2, 4.3, 8.4_

## 任务 5: 向后兼容性

- [ ] 5.1 添加废弃标记到旧端点
  - 在旧的 `/api/database_connections` 端点添加 `deprecated=True`
  - 添加 `X-Deprecated: true` 响应头
  - 添加 `X-New-Endpoint` 响应头指向新端点
  - _需求: 6.1, 6.2_

- [ ] 5.2 实现重定向逻辑
  - 旧端点内部调用新端点
  - 记录废弃警告日志
  - _需求: 6.2, 6.3_

## 任务 6: 统一响应格式和错误处理

- [ ] 6.1 实现统一响应格式辅助函数（支持国际化）
  - 在 `api/utils/` 创建 `response_helpers.py`
  - 定义 `MessageCode` 枚举（包含所有消息代码）
  - 创建 `DEFAULT_MESSAGES` 映射（默认消息文本）
  - 创建 `create_success_response()` 函数（支持 messageCode）
  - 创建 `create_error_response()` 函数（支持 messageCode）
  - 定义 `SuccessResponse` 和 `ErrorResponse` 模型
  - 实现 ISO 8601 时间戳生成
  - _需求: 7.1, 7.2_

- [ ] 6.2 更新所有端点使用统一响应格式（包含 messageCode）
  - 更新测试连接端点返回格式（添加 messageCode）
  - 更新创建连接端点返回格式（添加 messageCode）
  - 更新更新连接端点返回格式（添加 messageCode）
  - 更新刷新连接端点返回格式（添加 messageCode）
  - 更新列表端点返回格式（添加 messageCode）
  - 更新删除端点返回格式（添加 messageCode）
  - 确保所有响应都包含 `success`, `data/error`, `messageCode`, `message`, `timestamp`
  - _需求: 7.1, 7.2_

- [ ] 6.3 实现统一的错误处理
  - 定义错误码枚举
  - 实现错误响应格式
  - 添加错误诊断功能
  - _需求: 7.1, 7.2_

- [ ] 6.4 添加请求验证
  - 验证批量操作的 ID 列表
  - 验证连接配置的必填字段
  - 提供详细的验证错误信息
  - _需求: 7.1, 7.2, 7.3_

## 任务 7: 安全和性能优化

- [ ] 7.1 实现敏感信息过滤
  - 实现 `sanitize_datasource()` 函数
  - 自动过滤密码字段
  - 脱敏用户名
  - _需求: 8.1, 8.2_

- [ ] 7.2 添加批量操作限制
  - 限制最大批量大小（50 个）
  - 添加速率限制
  - _需求: 8.4_

- [ ] 7.3 优化查询性能
  - 添加数据源列表缓存
  - 实现缓存失效机制
  - _需求: 8.5_

## 任务 8: 注册新路由

- [ ] 8.1 在 main.py 中注册新路由
  - 导入 `datasources` 路由器
  - 注册到 FastAPI 应用
  - _需求: 所有_

## 任务 9: 测试

- [ ] 9.1 编写单元测试
  - 测试数据源聚合器
  - 测试批量操作处理器
  - 测试连接测试器
  - _需求: 所有_

- [ ] 9.2 编写集成测试
  - 测试完整的 API 端点
  - 测试批量操作
  - 测试错误处理
  - _需求: 所有_

## 任务 10: 文档更新

- [ ] 10.1 更新 API 文档
  - 添加新端点的文档
  - 标记旧端点为废弃
  - 提供迁移指南
  - 添加响应格式国际化说明
  - _需求: 6.4_

- [ ] 10.2 更新 README
  - 更新数据源管理部分
  - 添加新功能说明
  - 添加国际化支持说明
  - _需求: 6.4_

- [ ] 10.3 创建前端 i18n 配置文档
  - 列出所有 MessageCode
  - 提供多语言翻译模板
  - 说明前端如何使用 messageCode
  - _需求: 6.4_

## 检查点

- [ ] Checkpoint 1: 核心功能完成
  - 任务 1, 2, 3 完成
  - 基本的统一端点可用
  - 改进的连接测试可用

- [ ] Checkpoint 2: 批量操作完成
  - 任务 4 完成
  - 批量删除和测试可用

- [ ] Checkpoint 3: 完整功能
  - 所有任务完成
  - 测试通过
  - 文档更新
