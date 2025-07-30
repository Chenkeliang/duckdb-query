# 🚀 Interactive Data Query v2.2.0 发布说明

## 📅 发布日期
2025年7月30日

## 🎯 版本概述
v2.2.0 是一个重要的稳定性和功能增强版本，主要解决了数据库连接和文件上传的关键问题，显著提升了用户体验和系统可靠性。

## 🔧 主要修复

### 数据库连接系统重构
- **修复MySQL连接参数字段名不一致问题**
  - 统一支持 `user` 和 `username` 两种参数格式
  - 解决前端发送 `username` 但后端期望 `user` 的兼容性问题
  - 影响的API端点：
    - `/api/connect_database`
    - `/api/database_tables/{connection_id}`
    - `/api/database_table_details/{connection_id}/{table_name}`

- **新增连接测试功能**
  - 添加"测试连接"按钮，支持连接前验证
  - 实时显示连接状态和延迟信息
  - 友好的错误提示和解决建议

### 文件上传系统升级
- **解决413 Request Entity Too Large错误**
  - 支持最大100MB文件上传
  - nginx配置优化：`client_max_body_size 100M`
  - 前端axios超时和大小限制配置
  - 后端文件大小预检查和验证

- **改进的错误处理**
  - 友好的中文错误提示
  - 针对常见错误的具体解决建议
  - 超时和网络错误的统一处理

## 🛡️ 安全增强

### 敏感数据清理
- **修复容器内敏感数据残留问题**
  - 创建专门的容器数据清理脚本 `clean-container-data.sh`
  - 改进自动化清理流程
  - 完善Docker Hub发布前安全检查

### 配置安全
- **nginx配置语法修复**
  - 修复 `gzip_proxied` 指令语法错误
  - 优化文件上传相关配置
  - 改进容器配置管理

## 🎨 用户体验提升

### 界面优化
- **数据库连接界面**
  - 新增"测试连接"按钮
  - 改进表单验证和错误提示
  - 优化按钮布局和响应式设计
  - 连接状态实时反馈

- **文件上传界面**
  - 友好的上传进度显示
  - 清晰的错误提示和重试指导
  - 支持拖拽上传

### 表单验证
- **SQL查询验证**
  - 必填字段检查
  - 空值和格式验证
  - 实时错误提示

## 🔍 调试和监控

### 日志改进
- **详细的连接参数调试日志**
  - 记录连接参数和状态
  - 参数验证结果跟踪
  - 错误原因详细记录

### 健康检查
- **容器健康监控**
  - 改进容器启动检查
  - 服务状态实时监控
  - 自动重启机制

## 🧪 质量保证

### 测试覆盖
- **完整的API端点测试**
  - 数据库连接功能验证
  - 文件上传功能测试
  - 错误场景覆盖测试
  - 兼容性测试

### 向后兼容
- **参数格式兼容**
  - 支持旧版本参数格式
  - 平滑升级路径
  - 配置迁移支持

## 📋 技术栈信息

### 前端技术栈
- React 18
- Material-UI 5
- Vite 4
- Axios (改进的错误处理)

### 后端技术栈
- FastAPI 0.104
- DuckDB (数据处理引擎)
- SQLAlchemy (数据库ORM)
- PyMySQL (MySQL驱动)

### 基础设施
- Docker 24
- Docker Compose v2
- Nginx (优化配置)

## 🆕 新增API端点

### 数据库管理
- `POST /api/database_connections/test` - 数据库连接测试
- `GET /api/database_tables/{connection_id}` - 获取数据库表信息
- `GET /api/database_table_details/{connection_id}/{table_name}` - 获取表详细信息

### 改进的端点
- `POST /api/connect_database` - 改进的数据库连接
- `POST /api/upload` - 增强的文件上传

## 🔧 部署说明

### 快速部署
```bash
# 克隆项目
git clone <repository-url>
cd interactive-data-query

# 检出v2.2.0版本
git checkout v2.2.0

# 启动服务
docker-compose up -d
```

### 访问地址
- **前端界面**: http://localhost:3000
- **API文档**: http://localhost:8000/docs
- **健康检查**: http://localhost:8000/health

### 升级说明
从v2.1.0升级到v2.2.0：
1. 停止现有服务：`docker-compose down`
2. 拉取最新代码：`git pull origin main`
3. 检出新版本：`git checkout v2.2.0`
4. 重新构建：`docker-compose up --build -d`

## 🐛 已知问题
无重大已知问题。

## 📞 支持和反馈
如有问题或建议，请通过以下方式联系：
- 创建GitHub Issue
- 发送邮件至项目维护者

## 🙏 致谢
感谢所有贡献者和测试用户的支持！

---

**这是一个稳定、安全、功能完整的企业级版本！** 🎉
