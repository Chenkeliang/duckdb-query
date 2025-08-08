# 🔧 Docker容器冲突修复方案

## 问题分析
错误显示容器名 `/3f78f9920b2e_dataquery-frontend` 被容器 `a2e4992a875d8b5f522163517571ece227f8a3f16d525ecc524adf28defb3b89` 占用。

## 精确修复步骤

### 方案1：直接删除冲突容器（推荐）
```bash
# 删除具体的冲突容器
docker rm -f a2e4992a875d8b5f522163517571ece227f8a3f16d525ecc524adf28defb3b89

# 然后正常启动
docker-compose up --build -d
```

### 方案2：完全清理重建
```bash
# 1. 停止所有容器
docker stop $(docker ps -aq)

# 2. 删除所有dataquery相关容器
docker rm $(docker ps -aq --filter "name=dataquery")

# 3. 删除所有已停止的容器
docker container prune -f

# 4. 强制停止docker-compose
docker-compose down --remove-orphans --volumes

# 5. 重新启动
docker-compose up --build -d
```

### 方案3：重命名方式
```bash
# 重命名冲突容器
docker rename a2e4992a875d8b5f522163517571ece227f8a3f16d525ecc524adf28defb3b89 old-frontend

# 然后启动新服务
docker-compose up --build -d
```

## 验证步骤
```bash
# 检查没有冲突容器
docker ps -a --filter "name=dataquery"

# 检查服务状态
docker-compose ps

# 测试访问
curl http://localhost:3000
curl http://localhost:8000/docs
```

## 如果还有问题

查看详细的容器信息：
```bash
# 查看所有容器
docker ps -a

# 查看容器详情
docker inspect a2e4992a875d8b5f522163517571ece227f8a3f16d525ecc524adf28defb3b89
```

推荐先尝试**方案1**，最快捷有效。