#!/bin/bash

# Duck Query - Docker 启动脚本
# 自动检测并使用正确的配置文件

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 打印带颜色的消息
print_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 检查Docker是否安装
check_docker() {
    if ! command -v docker &> /dev/null; then
        print_error "Docker 未安装，请先安装 Docker"
        exit 1
    fi
    
    if ! command -v docker-compose &> /dev/null; then
        print_error "Docker Compose 未安装，请先安装 Docker Compose"
        exit 1
    fi
}

# 检查项目结构
check_project_structure() {
    local required_dirs=("api" "frontend" "config" "data")
    local missing_dirs=()
    
    for dir in "${required_dirs[@]}"; do
        if [ ! -d "$dir" ]; then
            missing_dirs+=("$dir")
        fi
    done
    
    if [ ${#missing_dirs[@]} -ne 0 ]; then
        print_error "缺少必要的目录: ${missing_dirs[*]}"
        print_error "请确保在项目根目录执行此脚本"
        exit 1
    fi
}

# 检查配置文件
check_config() {
    if [ ! -f "config/mysql-configs.json" ]; then
        print_warning "MySQL配置文件不存在: config/mysql-configs.json"
        print_info "将创建空的配置文件"
        echo "[]" > config/mysql-configs.json
    fi
}

# 主函数
main() {
    print_info "Duck Query Docker 启动脚本"
    print_info "========================================"
    
    # 检查环境
    print_info "检查环境..."
    check_docker
    check_project_structure
    check_config
    
    # 显示当前目录
    print_info "当前目录: $(pwd)"
    
    # 停止现有服务
    print_info "停止现有服务..."
    docker-compose down 2>/dev/null || true
    
    # 清理旧容器
    print_info "清理旧容器..."
    docker rm -f dataquery-backend dataquery-frontend 2>/dev/null || true
    
    # 启动服务
    print_info "启动服务..."
    if [ "$1" = "build" ]; then
        print_info "重新构建镜像..."
        docker-compose up -d --build
    else
        docker-compose up -d
    fi
    
    # 等待服务启动
    print_info "等待服务启动..."
    sleep 10
    
    # 检查服务状态
    print_info "检查服务状态..."
    if curl -s http://localhost:8000/health > /dev/null; then
        print_success "后端服务启动成功！"
        print_success "API地址: http://localhost:8000"
        
        # 测试数据库连接API
        if curl -s http://localhost:8000/api/database_connections > /dev/null; then
            print_success "数据库连接API正常"
        else
            print_warning "数据库连接API可能有问题"
        fi
    else
        print_error "后端服务启动失败"
        print_info "查看日志: docker logs dataquery-backend"
        exit 1
    fi
    
    # 检查前端（如果启动了）
    if docker ps | grep -q dataquery-frontend; then
        print_success "前端服务启动成功！"
        print_success "前端地址: http://localhost:3000"
    else
        print_info "前端服务未启动（仅启动了后端）"
        print_info "要启动前端，请运行: docker-compose up -d frontend"
    fi
    
    print_success "启动完成！"
    print_info "========================================"
    print_info "常用命令:"
    print_info "  查看日志: docker-compose logs -f"
    print_info "  停止服务: docker-compose down"
    print_info "  重启服务: $0"
    print_info "  重新构建: $0 build"
}

# 执行主函数
main "$@"
