#!/bin/bash

# Docker开发环境管理脚本（智能依赖检测版）
# 功能：自动更新代码、智能重建镜像、重启服务（依赖未变时仅重启，不重装依赖）

set -e

DOCKER_COMPOSE_FILE="docker-compose.yml"
API_REQUIREMENTS="api/requirements.txt"
FRONTEND_PACKAGE="frontend/package.json"
API_REQUIREMENTS_HASH=".requirements.hash"
FRONTEND_PACKAGE_HASH=".packagejson.hash"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info()    { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
log_error()   { echo -e "${RED}[ERROR]${NC} $1"; }

check_requirements() {
    if [[ ! -f "$DOCKER_COMPOSE_FILE" ]]; then
        log_error "Docker Compose配置文件不存在: $DOCKER_COMPOSE_FILE"
        exit 1
    fi
    if ! command -v docker >/dev/null 2>&1; then
        log_error "Docker未安装或不在PATH中"
        exit 1
    fi
    if ! command -v docker-compose >/dev/null 2>&1; then
        log_error "Docker Compose未安装或不在PATH中"
        exit 1
    fi
}

hash_file() {
    if [[ -f "$1" ]]; then
        sha256sum "$1" | awk '{print $1}'
    else
        echo ""
    fi
}

dependencies_changed() {
    local changed=0
    local req_hash pkg_hash old_req_hash old_pkg_hash

    req_hash=$(hash_file "$API_REQUIREMENTS")
    pkg_hash=$(hash_file "$FRONTEND_PACKAGE")
    old_req_hash=$(cat "$API_REQUIREMENTS_HASH" 2>/dev/null || echo "")
    old_pkg_hash=$(cat "$FRONTEND_PACKAGE_HASH" 2>/dev/null || echo "")

    if [[ "$req_hash" != "$old_req_hash" ]]; then
        log_info "Python依赖变更: $API_REQUIREMENTS"
        changed=1
    fi
    if [[ "$pkg_hash" != "$old_pkg_hash" ]]; then
        log_info "前端依赖变更: $FRONTEND_PACKAGE"
        changed=1
    fi

    # 更新hash
    echo "$req_hash" > "$API_REQUIREMENTS_HASH"
    echo "$pkg_hash" > "$FRONTEND_PACKAGE_HASH"

    return $changed
}

cleanup_containers() {
    log_info "清理现有容器和镜像..."
    docker-compose -f "$DOCKER_COMPOSE_FILE" down --remove-orphans 2>/dev/null || true
    local containers=("dataquery-backend" "dataquery-frontend" "dataquery-frontend-prod")
    for container in "${containers[@]}"; do
        if docker ps -a --format "table {{.Names}}" | grep -q "^${container}$"; then
            log_warning "删除冲突容器: $container"
            docker stop "$container" 2>/dev/null || true
            docker rm "$container" 2>/dev/null || true
        fi
    done
    docker image prune -f >/dev/null 2>&1 || true
    log_success "容器清理完成"
}

build_services() {
    log_info "智能构建Docker镜像..."
    if dependencies_changed; then
        log_info "依赖变更，执行完整构建（含依赖安装）..."
        docker-compose -f "$DOCKER_COMPOSE_FILE" build --no-cache
    else
        log_info "依赖未变，仅重启服务，跳过依赖安装。"
    fi
    log_success "镜像构建/重启完成"
}

start_services() {
    log_info "启动Docker服务..."
    docker-compose -f "$DOCKER_COMPOSE_FILE" up -d backend frontend
    log_success "服务启动完成"
}

wait_for_services() {
    log_info "等待服务启动..."
    local max_attempts=30
    local attempt=0
    while [[ $attempt -lt $max_attempts ]]; do
        if curl -sf http://localhost:8000/health >/dev/null 2>&1; then
            log_success "后端服务已就绪"
            break
        fi
        ((attempt++))
        echo -n "."
        sleep 2
    done
    if [[ $attempt -eq $max_attempts ]]; then
        log_error "等待后端服务超时"
        return 1
    fi
    if curl -sf http://localhost:3000 >/dev/null 2>&1; then
        log_success "前端服务已就绪"
    else
        log_warning "前端服务可能尚未完全启动，请稍等片刻"
    fi
}

show_status() {
    log_info "服务状态："
    docker-compose -f "$DOCKER_COMPOSE_FILE" ps
    echo ""
    log_info "服务地址："
    echo "  后端API: http://localhost:8000"
    echo "  前端界面: http://localhost:3000"
    echo "  API文档: http://localhost:8000/docs"
    echo "  健康检查: http://localhost:8000/health"
}

test_functionality() {
    log_info "测试核心功能..."
    if curl -sf http://localhost:8000/health >/dev/null; then
        log_success "✓ 健康检查通过"
    else
        log_error "✗ 健康检查失败"
        return 1
    fi
    if curl -sf http://localhost:8000/api/list_files >/dev/null; then
        log_success "✓ 文件列表API正常"
    else
        log_warning "✗ 文件列表API异常"
    fi
    if curl -sf http://localhost:8000/api/mysql_robust/list >/dev/null; then
        log_success "✓ MySQL管理API正常"
    else
        log_warning "✗ MySQL管理API异常"
    fi
    log_success "功能测试完成"
}

show_logs() {
    log_info "显示服务日志 (Ctrl+C退出)："
    docker-compose -f "$DOCKER_COMPOSE_FILE" logs -f
}

main() {
    local action=${1:-"restart"}
    echo "🐳 Docker开发环境管理器（智能依赖检测版）"
    echo "=========================="
    case $action in
        "start"|"up")
            check_requirements
            start_services
            wait_for_services
            show_status
            ;;
        "stop"|"down")
            log_info "停止服务..."
            docker-compose -f "$DOCKER_COMPOSE_FILE" down
            log_success "服务已停止"
            ;;
        "restart"|"rebuild")
            check_requirements
            cleanup_containers
            build_services
            start_services
            wait_for_services
            test_functionality
            show_status
            ;;
        "logs")
            show_logs
            ;;
        "status")
            show_status
            ;;
        "test")
            test_functionality
            ;;
        "clean")
            log_info "深度清理..."
            cleanup_containers
            docker system prune -f
            log_success "清理完成"
            ;;
        *)
            echo "用法: $0 [action]"
            echo ""
            echo "可用操作:"
            echo "  restart/rebuild  - 完全重启并重建 (默认)"
            echo "  start/up        - 启动服务"
            echo "  stop/down       - 停止服务"
            echo "  logs            - 显示日志"
            echo "  status          - 显示状态"
            echo "  test            - 测试功能"
            echo "  clean           - 深度清理"
            echo ""
            echo "示例:"
            echo "  $0              # 完全重启"
            echo "  $0 restart      # 完全重启"
            echo "  $0 start        # 仅启动"
            echo "  $0 logs         # 查看日志"
            exit 1
            ;;
    esac
}

trap 'log_error "脚本执行失败，请检查错误信息"' ERR
main "$@"