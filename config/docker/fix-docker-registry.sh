#!/bin/bash

# Docker镜像源修复脚本
# 解决Docker镜像拉取失败的问题

set -e

# 颜色定义
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

echo "🔧 Docker镜像源修复工具"
echo "========================"

# 检测操作系统
detect_os() {
    if [[ "$OSTYPE" == "darwin"* ]]; then
        echo "macos"
    elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
        echo "linux"
    else
        echo "unknown"
    fi
}

OS=$(detect_os)
log_info "检测到操作系统: $OS"

# macOS Docker Desktop配置
fix_macos_docker() {
    log_info "修复macOS Docker Desktop配置..."
    
    # Docker Desktop配置文件路径
    DOCKER_CONFIG="$HOME/.docker/daemon.json"
    
    # 备份现有配置
    if [ -f "$DOCKER_CONFIG" ]; then
        cp "$DOCKER_CONFIG" "$DOCKER_CONFIG.backup.$(date +%Y%m%d_%H%M%S)"
        log_info "已备份现有配置"
    fi
    
    # 创建新的配置文件
    mkdir -p "$HOME/.docker"
    cat > "$DOCKER_CONFIG" << 'EOF'
{
  "registry-mirrors": [
    "https://docker.mirrors.ustc.edu.cn",
    "https://hub-mirror.c.163.com",
    "https://mirror.baidubce.com"
  ],
  "insecure-registries": [],
  "debug": false,
  "experimental": false
}
EOF
    
    log_success "已更新Docker配置文件"
    log_warning "请重启Docker Desktop以使配置生效"
    
    # 提示用户重启Docker
    echo ""
    echo "📋 请按以下步骤操作："
    echo "1. 打开Docker Desktop"
    echo "2. 点击右上角设置图标"
    echo "3. 选择 'Restart' 重启Docker"
    echo "4. 等待Docker完全启动后重新运行部署脚本"
}

# Linux Docker配置
fix_linux_docker() {
    log_info "修复Linux Docker配置..."
    
    # Docker daemon配置文件路径
    DOCKER_CONFIG="/etc/docker/daemon.json"
    
    # 检查权限
    if [ ! -w "/etc/docker" ] && [ ! -w "$DOCKER_CONFIG" ]; then
        log_error "需要sudo权限来修改Docker配置"
        echo "请使用sudo运行此脚本: sudo $0"
        exit 1
    fi
    
    # 备份现有配置
    if [ -f "$DOCKER_CONFIG" ]; then
        sudo cp "$DOCKER_CONFIG" "$DOCKER_CONFIG.backup.$(date +%Y%m%d_%H%M%S)"
        log_info "已备份现有配置"
    fi
    
    # 创建配置目录
    sudo mkdir -p /etc/docker
    
    # 创建新的配置文件
    sudo tee "$DOCKER_CONFIG" > /dev/null << 'EOF'
{
  "registry-mirrors": [
    "https://docker.mirrors.ustc.edu.cn",
    "https://hub-mirror.c.163.com",
    "https://mirror.baidubce.com"
  ],
  "insecure-registries": [],
  "debug": false,
  "experimental": false
}
EOF
    
    log_success "已更新Docker配置文件"
    
    # 重启Docker服务
    log_info "重启Docker服务..."
    sudo systemctl daemon-reload
    sudo systemctl restart docker
    
    log_success "Docker服务已重启"
}

# 测试Docker连接
test_docker_connection() {
    log_info "测试Docker连接..."
    
    if docker info > /dev/null 2>&1; then
        log_success "Docker连接正常"
        return 0
    else
        log_error "Docker连接失败"
        return 1
    fi
}

# 测试镜像拉取
test_image_pull() {
    log_info "测试镜像拉取..."
    
    # 尝试拉取一个小镜像进行测试
    if docker pull hello-world > /dev/null 2>&1; then
        log_success "镜像拉取测试成功"
        # 清理测试镜像
        docker rmi hello-world > /dev/null 2>&1 || true
        return 0
    else
        log_error "镜像拉取测试失败"
        return 1
    fi
}

# 提供手动配置指导
manual_config_guide() {
    echo ""
    log_warning "自动配置失败，请手动配置Docker镜像源："
    echo ""
    echo "📋 手动配置步骤："
    
    if [ "$OS" = "macos" ]; then
        echo "1. 打开Docker Desktop"
        echo "2. 点击右上角设置图标 ⚙️"
        echo "3. 选择 'Docker Engine'"
        echo "4. 在JSON配置中添加以下内容："
        echo '   "registry-mirrors": ["https://docker.mirrors.ustc.edu.cn"]'
        echo "5. 点击 'Apply & Restart'"
    else
        echo "1. 编辑 /etc/docker/daemon.json 文件"
        echo "2. 添加以下内容："
        echo '   {"registry-mirrors": ["https://docker.mirrors.ustc.edu.cn"]}'
        echo "3. 重启Docker服务: sudo systemctl restart docker"
    fi
    
    echo ""
    echo "🌐 可用的镜像源："
    echo "- https://docker.mirrors.ustc.edu.cn (中科大)"
    echo "- https://hub-mirror.c.163.com (网易)"
    echo "- https://mirror.baidubce.com (百度)"
}

# 主函数
main() {
    # 检查Docker是否安装
    if ! command -v docker &> /dev/null; then
        log_error "Docker未安装，请先安装Docker"
        exit 1
    fi
    
    # 测试当前Docker连接
    if ! test_docker_connection; then
        log_error "Docker未运行，请先启动Docker"
        exit 1
    fi
    
    # 根据操作系统修复配置
    case $OS in
        "macos")
            fix_macos_docker
            ;;
        "linux")
            fix_linux_docker
            ;;
        *)
            log_error "不支持的操作系统: $OS"
            manual_config_guide
            exit 1
            ;;
    esac
    
    # 等待用户重启Docker (macOS)
    if [ "$OS" = "macos" ]; then
        echo ""
        read -p "请重启Docker Desktop后按回车键继续..." -r
    fi
    
    # 测试修复结果
    echo ""
    log_info "验证修复结果..."
    
    if test_docker_connection && test_image_pull; then
        log_success "Docker镜像源修复成功！"
        echo ""
        echo "🎉 现在可以重新运行部署脚本："
        echo "   ./start-modern-ui.sh dev"
    else
        log_error "修复失败，请尝试手动配置"
        manual_config_guide
    fi
}

# 运行主函数
main "$@"
