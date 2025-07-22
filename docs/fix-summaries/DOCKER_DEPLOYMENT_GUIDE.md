# Docker部署指南 - 现代化UI版本

## 🐳 为什么选择Docker？

### 传统部署脚本的问题
- ❌ **环境依赖复杂**: 需要正确的Node.js、Python版本
- ❌ **文件管理繁琐**: 需要手动备份、替换文件
- ❌ **版本冲突风险**: 本地依赖可能与项目要求不匹配
- ❌ **回滚困难**: 出问题时难以快速恢复
- ❌ **团队协作问题**: 不同开发者环境不一致

### Docker的优势
- ✅ **环境一致性**: 开发、测试、生产环境完全一致
- ✅ **快速部署**: 一键启动前后端服务
- ✅ **版本管理**: 轻松切换不同版本
- ✅ **隔离性**: 服务间相互隔离，避免冲突
- ✅ **可扩展性**: 易于水平扩展和负载均衡

## 🚀 快速开始

### 前置要求
- Docker 20.10+
- Docker Compose 2.0+
- 8GB+ 可用内存

### 一键启动
```bash
# 克隆项目
git clone <repository-url>
cd interactive-data-query

# 启动开发环境（现代化UI）
./start-modern-ui.sh dev

# 或者直接使用docker-compose
docker-compose up --build
```

### 访问应用
- **前端 (现代化UI)**: http://localhost:3000
- **后端 API**: http://localhost:8000
- **API 文档**: http://localhost:8000/docs

## 📋 可用命令

### 启动脚本命令
```bash
./start-modern-ui.sh dev      # 启动开发环境
./start-modern-ui.sh prod     # 启动生产环境
./start-modern-ui.sh stop     # 停止所有服务
./start-modern-ui.sh restart  # 重启服务
./start-modern-ui.sh logs     # 查看日志
./start-modern-ui.sh clean    # 清理Docker资源
./start-modern-ui.sh status   # 查看服务状态
```

### Docker Compose命令
```bash
# 开发环境
docker-compose up --build                    # 启动开发环境
docker-compose up -d                         # 后台启动
docker-compose down                          # 停止服务
docker-compose logs -f                       # 查看实时日志

# 生产环境
docker-compose --profile production up -d   # 启动生产环境
docker-compose --profile production down    # 停止生产环境

# 服务管理
docker-compose restart backend              # 重启后端
docker-compose restart frontend             # 重启前端
docker-compose exec backend bash            # 进入后端容器
docker-compose exec frontend sh             # 进入前端容器
```

## 🏗️ 架构说明

### 服务组成
```
┌─────────────────────────────────────────────────────┐
│                Docker Network                       │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  │
│  │   Frontend  │  │   Backend   │  │  Database   │  │
│  │   (React)   │  │  (FastAPI)  │  │ (Optional)  │  │
│  │   Port:3000 │  │  Port:8000  │  │  Port:5432  │  │
│  └─────────────┘  └─────────────┘  └─────────────┘  │
└─────────────────────────────────────────────────────┘
```

### 容器详情

#### 前端容器 (frontend)
- **基础镜像**: node:18-alpine
- **端口**: 3000 (开发) / 80 (生产)
- **功能**: 现代化React UI
- **特性**: 热重载、现代化主题、响应式设计

#### 后端容器 (backend)
- **基础镜像**: python:3.11-slim
- **端口**: 8000
- **功能**: FastAPI + DuckDB
- **特性**: 自动重载、健康检查、API文档

#### 数据库容器 (可选)
- **PostgreSQL**: postgres:15-alpine
- **MySQL**: mysql:8.0
- **Redis**: redis:7-alpine

## 🔧 配置说明

### 环境变量

#### 前端环境变量
```bash
REACT_APP_API_URL=http://localhost:8000    # API地址
REACT_APP_UI_MODE=modern                   # UI模式
CHOKIDAR_USEPOLLING=true                   # 文件监听
```

#### 后端环境变量
```bash
PYTHONPATH=/app                            # Python路径
PYTHONUNBUFFERED=1                         # 输出缓冲
ENV=development                            # 环境模式
```

### 卷挂载

#### 开发环境
```yaml
volumes:
  - ./api:/app                    # 后端代码热重载
  - ./frontend:/app               # 前端代码热重载
  - /app/node_modules             # 避免本地node_modules冲突
  - ./data:/app/data              # 数据文件持久化
```

#### 生产环境
```yaml
volumes:
  - backend_exports:/app/exports  # 导出文件持久化
  - postgres_data:/var/lib/postgresql/data  # 数据库持久化
```

## 🔄 开发工作流

### 1. 开发环境设置
```bash
# 启动开发环境
./start-modern-ui.sh dev

# 查看日志
./start-modern-ui.sh logs

# 进入容器调试
docker-compose exec backend bash
docker-compose exec frontend sh
```

### 2. 代码修改
- **前端代码**: 修改 `frontend/src/` 下的文件，自动热重载
- **后端代码**: 修改 `api/` 下的文件，自动重启服务
- **配置文件**: 修改后需要重启容器

### 3. 调试技巧
```bash
# 查看特定服务日志
docker-compose logs backend
docker-compose logs frontend

# 实时日志
docker-compose logs -f

# 进入容器调试
docker-compose exec backend python -c "import sys; print(sys.path)"
docker-compose exec frontend npm list
```

## 🚀 生产部署

### 1. 构建生产镜像
```bash
# 启动生产环境
./start-modern-ui.sh prod

# 或使用docker-compose
docker-compose --profile production up --build -d
```

### 2. 性能优化
- **前端**: 使用Nginx提供静态文件
- **后端**: 使用Gunicorn多进程
- **数据库**: 使用外部数据库服务
- **缓存**: 启用Redis缓存

### 3. 监控和日志
```bash
# 查看容器状态
docker-compose ps

# 查看资源使用
docker stats

# 导出日志
docker-compose logs > app.log
```

## 🔧 故障排除

### 常见问题

#### 1. 端口冲突
```bash
# 检查端口占用
lsof -i :3000
lsof -i :8000

# 停止占用进程
./start-modern-ui.sh dev  # 脚本会自动处理
```

#### 2. 容器启动失败
```bash
# 查看详细日志
docker-compose logs backend
docker-compose logs frontend

# 重新构建
docker-compose up --build --force-recreate
```

#### 3. 依赖问题
```bash
# 清理并重建
./start-modern-ui.sh clean
./start-modern-ui.sh dev
```

#### 4. 数据持久化问题
```bash
# 查看卷
docker volume ls

# 备份数据
docker run --rm -v dataquery_postgres_data:/data -v $(pwd):/backup alpine tar czf /backup/data-backup.tar.gz -C /data .
```

### 性能调优

#### 1. 内存优化
```yaml
# docker-compose.yml
services:
  backend:
    deploy:
      resources:
        limits:
          memory: 1G
        reservations:
          memory: 512M
```

#### 2. 网络优化
```yaml
networks:
  dataquery-network:
    driver: bridge
    ipam:
      config:
        - subnet: 172.20.0.0/16
```

## 📊 监控和维护

### 健康检查
```bash
# 检查服务健康状态
curl http://localhost:8000/health
curl http://localhost:3000/health

# Docker健康检查
docker-compose ps
```

### 日志管理
```bash
# 日志轮转
docker-compose logs --tail=100

# 导出日志
docker-compose logs > logs/$(date +%Y%m%d).log
```

### 备份策略
```bash
# 数据备份
docker-compose exec postgres pg_dump -U dataquery dataquery > backup.sql

# 配置备份
tar czf config-backup.tar.gz docker-compose.yml api/ frontend/
```

## 🎯 最佳实践

### 1. 开发建议
- 使用 `./start-modern-ui.sh dev` 进行日常开发
- 定期运行 `./start-modern-ui.sh clean` 清理资源
- 使用 `docker-compose logs -f` 监控实时日志

### 2. 生产建议
- 使用外部数据库服务
- 配置反向代理 (Nginx)
- 启用HTTPS
- 设置监控和告警

### 3. 安全建议
- 不要在生产环境暴露开发端口
- 使用环境变量管理敏感信息
- 定期更新基础镜像
- 启用容器安全扫描

## 🎉 总结

Docker部署方案相比传统部署脚本的优势：

| 特性 | 传统脚本 | Docker方案 |
|------|----------|------------|
| 环境一致性 | ❌ 依赖本地环境 | ✅ 完全一致 |
| 部署速度 | ⚠️ 需要手动操作 | ✅ 一键部署 |
| 回滚能力 | ❌ 困难 | ✅ 轻松回滚 |
| 团队协作 | ⚠️ 环境差异 | ✅ 环境统一 |
| 扩展性 | ❌ 有限 | ✅ 易于扩展 |
| 维护成本 | ❌ 高 | ✅ 低 |

使用Docker，您可以：
- **5分钟内**启动完整的现代化UI环境
- **零配置**享受热重载开发体验
- **一键切换**开发和生产环境
- **轻松扩展**到多实例部署

这就是为什么我们推荐使用Docker而不是传统部署脚本的原因！
