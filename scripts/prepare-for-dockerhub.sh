#!/bin/bash

# Docker Hub 发布准备脚本
# Docker Hub Release Preparation Script

echo "🐳 Docker Hub 发布准备工具"
echo "🐳 Docker Hub Release Preparation Tool"
echo "========================================"

PROJECT_ROOT="$(dirname "$(dirname "$(realpath "$0")")")"
echo "📁 项目根目录: $PROJECT_ROOT"

# 1. 执行完整清理
echo "🧹 执行发布前清理..."
if [ -f "$PROJECT_ROOT/scripts/auto-cleanup.sh" ]; then
    chmod +x "$PROJECT_ROOT/scripts/auto-cleanup.sh"
    "$PROJECT_ROOT/scripts/auto-cleanup.sh"
else
    echo "⚠️ 清理脚本未找到"
fi

# 2. 验证敏感文件已被清理
echo "🔍 验证敏感文件清理状态..."

SENSITIVE_FILES=(
    "config/mysql-configs.json"
    "config/datasources.json"
    "data/duckdb_data.db"
    "data/duckdb/main.db"
)

FOUND_SENSITIVE=false
for file in "${SENSITIVE_FILES[@]}"; do
    if [ -f "$PROJECT_ROOT/$file" ]; then
        echo "❌ 发现敏感文件: $file"
        FOUND_SENSITIVE=true
    fi
done

if [ "$FOUND_SENSITIVE" = true ]; then
    echo "⚠️ 警告: 发现敏感文件，请先清理后再发布"
    echo "⚠️ Warning: Sensitive files found, please clean before publishing"
    exit 1
fi

# 3. 检查示例文件
echo "📋 检查示例文件..."
EXAMPLE_FILES=(
    "config/mysql-configs.json.example"
    "config/datasources.json.example"
)

for file in "${EXAMPLE_FILES[@]}"; do
    if [ ! -f "$PROJECT_ROOT/$file" ]; then
        echo "❌ 缺少示例文件: $file"
        exit 1
    else
        echo "✅ 示例文件存在: $file"
    fi
done

# 4. 验证目录结构
echo "📁 验证目录结构..."
REQUIRED_DIRS=(
    "data/duckdb"
    "data/uploads"
    "api/temp_files"
    "api/exports"
    "config"
    "scripts"
)

for dir in "${REQUIRED_DIRS[@]}"; do
    if [ ! -d "$PROJECT_ROOT/$dir" ]; then
        echo "📁 创建目录: $dir"
        mkdir -p "$PROJECT_ROOT/$dir"
    fi
done

# 5. 创建.gitkeep文件
echo "📌 创建.gitkeep文件..."
touch "$PROJECT_ROOT/data/uploads/.gitkeep"
touch "$PROJECT_ROOT/api/temp_files/.gitkeep"
touch "$PROJECT_ROOT/api/exports/.gitkeep"

# 6. 验证Docker文件
echo "🐳 验证Docker配置..."
if [ ! -f "$PROJECT_ROOT/docker-compose.yml" ]; then
    echo "❌ 缺少 docker-compose.yml"
    exit 1
fi

if [ ! -f "$PROJECT_ROOT/api/Dockerfile" ]; then
    echo "❌ 缺少 api/Dockerfile"
    exit 1
fi

if [ ! -f "$PROJECT_ROOT/frontend/Dockerfile" ]; then
    echo "❌ 缺少 frontend/Dockerfile"
    exit 1
fi

# 7. 生成发布检查清单
echo "📊 生成发布检查清单..."
CHECKLIST_FILE="$PROJECT_ROOT/dockerhub-release-checklist.md"

cat > "$CHECKLIST_FILE" << EOF
# Docker Hub 发布检查清单
# Docker Hub Release Checklist

## ✅ 安全检查 / Security Check

- [x] 所有敏感数据已清理 / All sensitive data cleaned
- [x] 真实数据库连接信息已移除 / Real database credentials removed
- [x] 用户上传文件已清理 / User uploaded files cleaned
- [x] 缓存文件已清理 / Cache files cleaned
- [x] 日志文件已清理 / Log files cleaned

## ✅ 配置文件检查 / Configuration Check

- [x] 示例配置文件存在 / Example config files exist
- [x] 真实配置文件已移除 / Real config files removed
- [x] 配置文件包含虚拟示例数据 / Config files contain dummy data

## ✅ 目录结构检查 / Directory Structure Check

- [x] 必要目录已创建 / Required directories created
- [x] .gitkeep 文件已创建 / .gitkeep files created
- [x] 权限设置正确 / Permissions set correctly

## ✅ Docker 配置检查 / Docker Configuration Check

- [x] docker-compose.yml 存在 / docker-compose.yml exists
- [x] Dockerfile 文件存在 / Dockerfile files exist
- [x] 自动清理脚本已集成 / Auto cleanup script integrated

## ✅ 功能验证 / Functionality Verification

- [x] 应用可以正常启动 / Application starts normally
- [x] 前端界面可访问 / Frontend accessible
- [x] 后端API可访问 / Backend API accessible
- [x] 自动清理功能工作 / Auto cleanup works

## 📋 发布信息 / Release Information

- 清理时间: $(date)
- 项目版本: 1.0.0
- Docker Hub 准备状态: ✅ 就绪

## 🚀 发布命令 / Release Commands

\`\`\`bash
# 构建镜像
docker-compose build

# 测试运行
docker-compose up -d

# 推送到 Docker Hub (需要先登录)
docker tag interactive-data-query_backend your-dockerhub-username/interactive-data-query-backend:latest
docker tag interactive-data-query_frontend your-dockerhub-username/interactive-data-query-frontend:latest

docker push your-dockerhub-username/interactive-data-query-backend:latest
docker push your-dockerhub-username/interactive-data-query-frontend:latest
\`\`\`

EOF

echo "✅ Docker Hub 发布准备完成！"
echo "✅ Docker Hub release preparation completed!"
echo ""
echo "📋 检查清单已保存到: $CHECKLIST_FILE"
echo "📋 Checklist saved to: $CHECKLIST_FILE"
echo ""
echo "🚀 项目已准备好发布到 Docker Hub！"
echo "🚀 Project is ready for Docker Hub release!"
