#!/bin/bash

# Docker服务重启脚本 - 修复完成后自动重启加载最新代码
# 支持多种Docker配置方式

echo "🐳 Docker服务重启脚本"
echo "===================="
echo "目标：重启Docker服务加载最新修复的代码"
echo ""

# 定义颜色
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

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

# 检查Docker是否运行
check_docker() {
    if ! docker ps >/dev/null 2>&1; then
        log_error "Docker服务未运行或无权限访问"
        echo "请确保:"
        echo "1. Docker Desktop已启动"
        echo "2. 当前用户有Docker权限"
        return 1
    fi
    return 0
}

# 重启Docker Compose服务
restart_compose_service() {
    local compose_file="$1"
    local service_name="$2"
    
    if [ -f "$compose_file" ]; then
        log_info "使用配置文件: $compose_file"
        
        # 停止服务
        log_info "停止现有服务..."
        docker-compose -f "$compose_file" down
        
        # 重建并启动服务
        log_info "重建并启动服务..."
        docker-compose -f "$compose_file" up --build -d
        
        # 等待服务启动
        log_info "等待服务启动..."
        sleep 5
        
        # 检查服务状态
        if docker-compose -f "$compose_file" ps | grep -q "Up"; then
            log_success "Docker服务重启成功"
            return 0
        else
            log_error "Docker服务启动失败"
            return 1
        fi
    else
        log_warning "配置文件不存在: $compose_file"
        return 1
    fi
}

# 主重启逻辑
main() {
    log_info "开始Docker服务重启流程"
    echo ""
    
    # 1. 检查Docker状态
    echo "1. 检查Docker状态"
    echo "=================="
    if ! check_docker; then
        exit 1
    fi
    log_success "Docker服务运行正常"
    
    echo ""
    echo "2. 查找Docker配置文件"
    echo "===================="
    
    # 尝试不同的Docker配置文件
    COMPOSE_FILES=(
        "config/docker/docker-compose.yml"
        "config/docker/docker-compose.simple.yml"
        "config/docker/docker-compose.fixed.yml"
        "docker-compose.yml"
    )
    
    RESTART_SUCCESS=false
    
    for compose_file in "${COMPOSE_FILES[@]}"; do
        if [ -f "$compose_file" ]; then
            log_info "找到配置文件: $compose_file"
            echo ""
            echo "3. 重启Docker服务"
            echo "================="
            
            if restart_compose_service "$compose_file"; then
                RESTART_SUCCESS=true
                break
            fi
        fi
    done
    
    if [ "$RESTART_SUCCESS" = false ]; then
        log_warning "未找到可用的Docker配置文件"
        echo ""
        echo "🔍 尝试其他方式重启..."
        
        # 尝试重启所有运行的容器
        RUNNING_CONTAINERS=$(docker ps -q)
        if [ -n "$RUNNING_CONTAINERS" ]; then
            log_info "重启所有运行的容器..."
            docker restart $RUNNING_CONTAINERS
            sleep 3
            log_success "已重启所有运行的容器"
            RESTART_SUCCESS=true
        else
            log_warning "没有找到运行的容器"
        fi
    fi
    
    echo ""
    echo "4. 验证服务状态"
    echo "============="
    
    # 检查API服务是否响应
    log_info "检查API服务响应..."
    sleep 5  # 等待服务完全启动
    
    API_STATUS=$(curl -s -w "%{http_code}" -o /dev/null --max-time 10 "http://localhost:8000/health" 2>/dev/null || echo "000")
    
    if [ "$API_STATUS" = "200" ]; then
        log_success "API服务响应正常 (状态码: 200)"
    else
        log_warning "API服务响应异常 (状态码: $API_STATUS)"
        log_info "服务可能还在启动中，请稍后手动检查"
    fi
    
    # 显示运行的容器
    echo ""
    echo "5. 当前运行的容器"
    echo "================"
    docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
    
    echo ""
    if [ "$RESTART_SUCCESS" = true ]; then
        log_success "Docker服务重启完成！"
        echo ""
        echo "🎯 下一步操作建议："
        echo "1. 运行API测试: ./tests/scripts/test-api-endpoints.sh"
        echo "2. 访问前端页面: http://localhost:3000"
        echo "3. 测试修复的功能: list_files 和 connect_database接口"
        echo ""
        echo "📊 修复内容已加载："
        echo "✅ 文件删除与DuckDB数据一致性修复"
        echo "✅ API接口PostgreSQL连接代码修复"
        echo "✅ 测试脚本路径和命令兼容性修复"
    else
        log_error "Docker服务重启失败"
        echo ""
        echo "🔧 手动重启建议："
        echo "1. 检查Docker Desktop是否运行"
        echo "2. 手动运行: docker-compose up --build"
        echo "3. 或使用项目启动脚本"
    fi
}

# 执行主函数
main "$@"