#!/bin/bash

# UI改进部署脚本
# 用于快速部署现代化UI改进

set -e

echo "🚀 开始部署UI改进..."

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
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

# 检查前置条件
check_prerequisites() {
    log_info "检查前置条件..."
    
    # 检查Node.js
    if ! command -v node &> /dev/null; then
        log_error "Node.js 未安装，请先安装 Node.js"
        exit 1
    fi
    
    # 检查npm
    if ! command -v npm &> /dev/null; then
        log_error "npm 未安装，请先安装 npm"
        exit 1
    fi
    
    # 检查是否在正确的目录
    if [ ! -f "package.json" ]; then
        log_error "请在 frontend 目录下运行此脚本"
        exit 1
    fi
    
    log_success "前置条件检查通过"
}

# 备份现有文件
backup_existing_files() {
    log_info "备份现有文件..."
    
    BACKUP_DIR="backup_$(date +%Y%m%d_%H%M%S)"
    mkdir -p "$BACKUP_DIR"
    
    # 备份关键文件
    if [ -f "src/App.jsx" ]; then
        cp "src/App.jsx" "$BACKUP_DIR/"
        log_success "已备份 App.jsx"
    fi
    
    if [ -f "src/index.js" ]; then
        cp "src/index.js" "$BACKUP_DIR/"
        log_success "已备份 index.js"
    fi
    
    if [ -d "src/components" ]; then
        cp -r "src/components" "$BACKUP_DIR/"
        log_success "已备份 components 目录"
    fi
    
    log_success "文件备份完成，备份目录: $BACKUP_DIR"
}

# 安装新依赖
install_dependencies() {
    log_info "安装新依赖包..."
    
    # 安装字体
    npm install @fontsource/inter
    log_success "已安装 Inter 字体"
    
    # 安装AG-Grid (如果尚未安装)
    if ! npm list ag-grid-react &> /dev/null; then
        npm install ag-grid-react ag-grid-community
        log_success "已安装 AG-Grid"
    else
        log_info "AG-Grid 已存在，跳过安装"
    fi
    
    log_success "依赖安装完成"
}

# 创建目录结构
create_directory_structure() {
    log_info "创建新的目录结构..."
    
    # 创建必要的目录
    mkdir -p src/theme
    mkdir -p src/components/Layout
    mkdir -p src/components/DataSource
    mkdir -p src/components/Query
    mkdir -p src/components/Results
    mkdir -p src/styles
    
    log_success "目录结构创建完成"
}

# 更新入口文件
update_entry_files() {
    log_info "更新入口文件..."
    
    # 更新 index.js
    cat > src/index.js << 'EOF'
import React from 'react';
import ReactDOM from 'react-dom/client';
import ModernApp from './ModernApp';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import './styles/modern.css';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<ModernApp />);
EOF
    
    log_success "已更新 index.js"
}

# 更新package.json脚本
update_package_scripts() {
    log_info "更新 package.json 脚本..."
    
    # 使用node来更新package.json
    node -e "
    const fs = require('fs');
    const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    
    // 添加新的脚本
    pkg.scripts = pkg.scripts || {};
    pkg.scripts['dev:modern'] = 'REACT_APP_UI_MODE=modern npm start';
    pkg.scripts['build:modern'] = 'REACT_APP_UI_MODE=modern npm run build';
    pkg.scripts['preview'] = 'npm run build && npx serve -s build';
    
    // 添加新的依赖
    pkg.dependencies = pkg.dependencies || {};
    pkg.dependencies['@fontsource/inter'] = '^5.0.0';
    
    fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2));
    "
    
    log_success "已更新 package.json"
}

# 验证安装
verify_installation() {
    log_info "验证安装..."
    
    # 检查关键文件是否存在
    local files=(
        "src/ModernApp.jsx"
        "src/theme/modernTheme.js"
        "src/components/Layout/ModernLayout.jsx"
        "src/styles/modern.css"
    )
    
    for file in "${files[@]}"; do
        if [ -f "$file" ]; then
            log_success "✓ $file"
        else
            log_warning "✗ $file (缺失)"
        fi
    done
    
    # 检查依赖是否安装
    if npm list @fontsource/inter &> /dev/null; then
        log_success "✓ @fontsource/inter 依赖已安装"
    else
        log_warning "✗ @fontsource/inter 依赖未安装"
    fi
}

# 启动开发服务器
start_dev_server() {
    log_info "准备启动开发服务器..."
    
    echo ""
    echo "🎉 UI改进部署完成！"
    echo ""
    echo "📋 下一步操作："
    echo "1. 运行 'npm start' 启动开发服务器"
    echo "2. 访问 http://localhost:3000 查看新界面"
    echo "3. 如有问题，可以从备份目录恢复原文件"
    echo ""
    echo "📚 更多信息请查看 UI_IMPROVEMENT_GUIDE.md"
    echo ""
    
    read -p "是否现在启动开发服务器？(y/n): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        log_info "启动开发服务器..."
        npm start
    else
        log_info "您可以稍后运行 'npm start' 启动开发服务器"
    fi
}

# 错误处理
handle_error() {
    log_error "部署过程中发生错误！"
    log_info "您可以从备份目录恢复原文件"
    exit 1
}

# 设置错误处理
trap handle_error ERR

# 主函数
main() {
    echo "🎨 现代化UI改进部署脚本"
    echo "================================"
    echo ""
    
    # 确认部署
    log_warning "此脚本将对您的前端代码进行重大修改"
    log_info "建议在部署前提交当前代码到git"
    echo ""
    read -p "确定要继续吗？(y/n): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log_info "部署已取消"
        exit 0
    fi
    
    # 执行部署步骤
    check_prerequisites
    backup_existing_files
    install_dependencies
    create_directory_structure
    update_entry_files
    update_package_scripts
    verify_installation
    start_dev_server
}

# 运行主函数
main "$@"
