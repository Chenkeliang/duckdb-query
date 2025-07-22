# Docker 开发环境使用指南

## 🚀 快速开始

本项目提供了完善的Docker开发环境，支持自动更新代码并重启服务。

### 方法一：使用智能管理脚本 (推荐)

```bash
# 完全重启开发环境（自动更新代码）
./docker-dev.sh

# 或者明确指定重启
./docker-dev.sh restart

# 其他可用命令
./docker-dev.sh start    # 仅启动服务
./docker-dev.sh stop     # 停止服务
./docker-dev.sh logs     # 查看日志
./docker-dev.sh status   # 查看状态
./docker-dev.sh test     # 测试功能
./docker-dev.sh clean    # 深度清理
```

### 方法二：使用传统Docker Compose

```bash
# 停止并重建服务
docker-compose down && docker-compose build --no-cache && docker-compose up -d

# 简单重启
docker-compose restart

# 查看日志
docker-compose logs -f

# 查看状态
docker-compose ps
```

## 📋 智能管理脚本功能

### 🔧 自动化功能
- ✅ **容器冲突处理**: 自动检测并清理冲突的容器名
- ✅ **代码热更新**: 使用`--no-cache`确保获取最新代码
- ✅ **健康检查**: 自动等待服务启动并验证功能
- ✅ **错误处理**: 完善的错误捕获和提示
- ✅ **状态监控**: 实时显示服务状态和访问地址

### 🎯 解决的问题
- **容器名冲突**: 自动处理"容器名已被使用"的错误
- **代码不更新**: 强制重建镜像确保使用最新代码
- **启动失败**: 智能等待和健康检查
- **调试困难**: 彩色日志输出和详细状态信息

## 🌐 服务访问地址

| 服务 | 地址 | 说明 |
|------|------|------|
| 后端API | http://localhost:8000 | FastAPI后端服务 |
| API文档 | http://localhost:8000/docs | Swagger API文档 |
| 健康检查 | http://localhost:8000/health | 服务健康状态 |
| 前端界面 | http://localhost:3000 | React开发界面 |

## 🔍 常见问题解决

### 1. 容器名冲突
```bash
Error response from daemon: Conflict. The container name "/dataquery-backend" is already in use
```
**解决方案**: 使用智能管理脚本，它会自动处理冲突
```bash
./docker-dev.sh restart
```

### 2. 代码修改不生效
**原因**: Docker镜像缓存了旧代码
**解决方案**: 使用`--no-cache`重建
```bash
./docker-dev.sh restart  # 自动使用--no-cache
```

### 3. 服务启动失败
**解决方案**: 查看详细日志
```bash
./docker-dev.sh logs
```

### 4. 端口被占用
**解决方案**: 清理并重启
```bash
./docker-dev.sh clean
./docker-dev.sh restart
```

## 🛠️ 开发工作流

### 日常开发
```bash
# 1. 启动开发环境
./docker-dev.sh

# 2. 修改代码 (api/ 或 frontend/ 目录)

# 3. 重新应用修改
./docker-dev.sh restart

# 4. 查看日志调试
./docker-dev.sh logs
```

### 功能测试
```bash
# 测试后端API
curl http://localhost:8000/health
curl http://localhost:8000/api/list_files

# 测试MySQL功能
curl http://localhost:8000/api/mysql_robust/list

# 自动化测试
./docker-dev.sh test
```

## 🔧 高级配置

### 环境变量
在 `docker-compose.yml` 中可以配置：
- `PYTHONUNBUFFERED=1`: Python实时输出
- `ENV=development`: 开发模式
- `REACT_APP_API_URL`: 前端API地址

### 数据持久化
- `backend_temp`: 后端临时文件存储
- `backend_exports`: 导出文件存储
- 代码通过volume挂载，修改立即生效

### 网络配置
- 内部网络：`dataquery-network`
- 健康检查：30秒间隔
- 自动重启：`unless-stopped`

## 📚 脚本选项详解

| 命令 | 功能 | 用途 |
|------|------|------|
| `restart` | 完全重启 | 代码更新后使用 |
| `start` | 启动服务 | 首次启动或停止后启动 |
| `stop` | 停止服务 | 临时停止服务 |
| `logs` | 查看日志 | 调试和监控 |
| `status` | 显示状态 | 检查服务健康度 |
| `test` | 功能测试 | 验证核心功能 |
| `clean` | 深度清理 | 解决复杂问题 |

## ⚡ 性能优化

- **并行构建**: 前后端服务并行启动
- **健康检查**: 前端等待后端就绪后启动
- **资源限制**: 适当的内存和CPU限制
- **缓存优化**: 智能的Docker层缓存策略

使用本指南，您可以高效地管理和使用Docker开发环境！🐳