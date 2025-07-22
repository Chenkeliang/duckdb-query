#!/bin/bash

# 现代化UI一键启动脚本
# 使用Docker自动启动前后端服务

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m' # No Color

# 日志函数
log_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

log_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

log_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

log_error() {
    echo -e "${RED}❌ $1${NC}"
}

log_header() {
    echo -e "${PURPLE}🚀 $1${NC}"
}

# 显示帮助信息
show_help() {
    echo "现代化UI启动脚本"
    echo ""
    echo "用法: $0 [选项]"
    echo ""
    echo "选项:"
    echo "  dev         启动开发环境 (默认)"
    echo "  prod        启动生产环境"
    echo "  stop        停止所有服务"
    echo "  restart     重启服务"
    echo "  logs        查看日志"
    echo "  clean       清理Docker资源"
    echo "  help        显示此帮助信息"
    echo ""
    echo "示例:"
    echo "  $0 dev      # 启动开发环境"
    echo "  $0 prod     # 启动生产环境"
    echo "  $0 logs     # 查看服务日志"
}

# 检查Docker是否安装
check_docker() {
    if ! command -v docker &> /dev/null; then
        log_error "Docker 未安装，请先安装 Docker"
        exit 1
    fi

    if ! command -v docker-compose &> /dev/null; then
        log_error "Docker Compose 未安装，请先安装 Docker Compose"
        exit 1
    fi

    log_success "Docker 环境检查通过"
}

# 检查端口是否被占用
check_ports() {
    local ports=("3000" "8000")
    
    for port in "${ports[@]}"; do
        if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null 2>&1; then
            log_warning "端口 $port 已被占用"
            read -p "是否要停止占用端口的进程？(y/n): " -n 1 -r
            echo
            if [[ $REPLY =~ ^[Yy]$ ]]; then
                lsof -ti:$port | xargs kill -9 2>/dev/null || true
                log_success "已释放端口 $port"
            fi
        fi
    done
}

# 启动开发环境
start_dev() {
    log_header "启动开发环境"
    
    check_docker
    check_ports
    
    log_info "构建并启动开发环境..."
    docker-compose up --build -d backend frontend
    
    log_info "等待服务启动..."
    sleep 10
    
    # 检查服务状态
    if docker-compose ps | grep -q "Up"; then
        log_success "服务启动成功！"
        echo ""
        echo "🌐 访问地址:"
        echo "  前端 (现代化UI): http://localhost:3000"
        echo "  后端 API:       http://localhost:8000"
        echo "  API 文档:       http://localhost:8000/docs"
        echo ""
        echo "📋 常用命令:"
        echo "  查看日志: $0 logs"
        echo "  停止服务: $0 stop"
        echo "  重启服务: $0 restart"
    else
        log_error "服务启动失败，请检查日志"
        docker-compose logs
    fi
}

# 启动生产环境
start_prod() {
    log_header "启动生产环境"
    
    check_docker
    
    log_info "构建并启动生产环境..."
    docker-compose --profile production up --build -d
    
    log_info "等待服务启动..."
    sleep 15
    
    # 检查服务状态
    if docker-compose ps | grep -q "Up"; then
        log_success "生产环境启动成功！"
        echo ""
        echo "🌐 访问地址:"
        echo "  应用地址: http://localhost"
        echo "  API地址:  http://localhost:8000"
        echo ""
    else
        log_error "生产环境启动失败，请检查日志"
        docker-compose logs
    fi
}

# 停止服务
stop_services() {
    log_header "停止服务"
    
    log_info "停止所有服务..."
    docker-compose down
    
    log_success "服务已停止"
}

# 重启服务
restart_services() {
    log_header "重启服务"
    
    stop_services
    sleep 2
    start_dev
}

# 查看日志
show_logs() {
    log_header "查看服务日志"
    
    echo "选择要查看的服务日志:"
    echo "1) 所有服务"
    echo "2) 前端服务"
    echo "3) 后端服务"
    echo "4) 实时日志 (Ctrl+C 退出)"
    
    read -p "请选择 (1-4): " choice
    
    case $choice in
        1)
            docker-compose logs
            ;;
        2)
            docker-compose logs frontend
            ;;
        3)
            docker-compose logs backend
            ;;
        4)
            log_info "显示实时日志，按 Ctrl+C 退出"
            docker-compose logs -f
            ;;
        *)
            log_error "无效选择"
            ;;
    esac
}

# 清理Docker资源
clean_docker() {
    log_header "清理Docker资源"
    
    log_warning "这将删除所有相关的Docker镜像、容器和卷"
    read -p "确定要继续吗？(y/n): " -n 1 -r
    echo
    
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        log_info "停止并删除容器..."
        docker-compose down -v --remove-orphans
        
        log_info "删除相关镜像..."
        docker images | grep dataquery | awk '{print $3}' | xargs docker rmi -f 2>/dev/null || true
        
        log_info "清理未使用的资源..."
        docker system prune -f
        
        log_success "Docker资源清理完成"
    else
        log_info "清理操作已取消"
    fi
}

# 显示服务状态
show_status() {
    log_header "服务状态"
    
    echo "Docker Compose 服务状态:"
    docker-compose ps
    
    echo ""
    echo "端口使用情况:"
    echo "端口 3000: $(lsof -Pi :3000 -sTCP:LISTEN -t >/dev/null 2>&1 && echo "已占用" || echo "空闲")"
    echo "端口 8000: $(lsof -Pi :8000 -sTCP:LISTEN -t >/dev/null 2>&1 && echo "已占用" || echo "空闲")"
}

# 主函数
main() {
    case "${1:-dev}" in
        "dev"|"development")
            start_dev
            ;;
        "prod"|"production")
            start_prod
            ;;
        "stop")
            stop_services
            ;;
        "restart")
            restart_services
            ;;
        "logs")
            show_logs
            ;;
        "clean")
            clean_docker
            ;;
        "status")
            show_status
            ;;
        "help"|"-h"|"--help")
            show_help
            ;;
        *)
            log_error "未知选项: $1"
            show_help
            exit 1
            ;;
    esac
}

# 错误处理
trap 'log_error "脚本执行出错，请检查上述输出"' ERR

# 运行主函数
main "$@"
