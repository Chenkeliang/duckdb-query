# 测试目录结构说明

## 📁 目录结构

```
tests/
├── README.md                 # 本说明文档
├── run-all-tests.sh         # 聚合测试脚本（主入口）
├── unit/                    # 单元测试目录
├── integration/             # 集成测试目录
├── e2e/                     # 端到端测试目录
└── scripts/                 # 测试脚本目录
    ├── test-all-functions.sh      # 核心功能测试
    ├── test-api-functions.sh      # API功能测试
    ├── test-datasource-fixes.sh   # 数据源功能测试
    ├── test-query-fix.sh          # 查询功能测试
    ├── test-ui-fixes.sh           # UI功能测试
    ├── test-table-display-fix.sh  # 表格显示测试
    ├── test-datagrid-fix.sh       # DataGrid组件测试
    ├── test-delete-file-fix.sh    # 删除功能测试
    ├── test-sql-fix.sh            # SQL功能测试
    ├── test-request-fix.sh        # 请求处理测试
    └── debug-*.js                 # 调试脚本
```

## 🚀 使用方法

### 执行所有测试
```bash
# 在项目根目录执行
./tests/run-all-tests.sh
```

### 执行单个测试脚本
```bash
# 执行核心功能测试
./tests/scripts/test-all-functions.sh

# 执行API功能测试
./tests/scripts/test-api-functions.sh
```

## 📋 测试分类

### 1. 核心功能测试 (test-all-functions.sh)
- 前后端服务状态检查
- 基础API功能验证
- 文件和数据库查询测试
- 整体功能完整性验证

### 2. API功能测试 (test-api-functions.sh)
- REST API接口测试
- 数据源API测试
- 文件上传下载测试
- 错误处理测试

### 3. 数据源功能测试 (test-datasource-fixes.sh)
- 文件数据源管理
- 数据库连接测试
- 数据源类型识别
- 预览功能测试

### 4. 查询功能测试 (test-query-fix.sh)
- SQL查询执行
- 查询结果处理
- 多数据源查询
- 查询性能测试

### 5. UI功能测试 (test-ui-fixes.sh)
- 前端界面功能
- 用户交互测试
- 响应式设计验证
- 错误提示测试

### 6. 表格显示测试 (test-table-display-fix.sh, test-datagrid-fix.sh)
- 数据表格渲染
- 分页排序筛选
- 表格交互功能
- 数据格式转换

### 7. 删除功能测试 (test-delete-file-fix.sh)
- 文件删除功能
- 数据库连接删除
- 删除后刷新机制
- 错误处理验证

### 8. SQL功能测试 (test-sql-fix.sh)
- SQL语句执行
- 语法错误处理
- 查询结果格式化
- 性能优化验证

### 9. 请求处理测试 (test-request-fix.sh)
- HTTP请求处理
- 并发请求测试
- 超时处理验证
- 错误重试机制

## 🔧 测试原则

### 1. 不动已通过测试的代码
- 保持已验证功能的稳定性
- 避免引入新的回归问题
- 维护代码的可靠性

### 2. 只修复错误场景
- 针对性解决具体问题
- 不进行不必要的重构
- 保持最小化修改原则

### 3. 建立完整测试体系
- 覆盖所有核心功能
- 自动化测试执行
- 持续集成验证

## 📝 添加新测试

### 单元测试
将新的单元测试文件放入 `tests/unit/` 目录

### 集成测试
将新的集成测试文件放入 `tests/integration/` 目录

### 端到端测试
将新的E2E测试文件放入 `tests/e2e/` 目录

### 测试脚本
将新的测试脚本放入 `tests/scripts/` 目录，并在 `run-all-tests.sh` 中添加调用

## 🎯 测试目标

- 确保所有功能正常工作
- 验证修复效果
- 防止回归问题
- 提高代码质量
- 支持持续集成

## 📊 测试报告

测试执行结果会显示：
- 总测试数量
- 通过/失败统计
- 具体失败项目
- 修复建议

失败时请按照输出的建议进行修复，然后重新运行测试。
