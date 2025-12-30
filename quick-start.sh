#!/bin/bash

# DuckQuery · DuckDB 可视化分析快速开始脚本
# 自动设置 DuckDB 后端配置并启动全栈服务

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

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

# 检查Docker
check_docker() {
    if ! command -v docker &> /dev/null; then
        print_error "Docker 未安装，请先安装 Docker"
        print_info "访问: https://docs.docker.com/get-docker/"
        exit 1
    fi
    
    if ! command -v docker-compose &> /dev/null; then
        print_error "Docker Compose 未安装，请先安装 Docker Compose"
        print_info "访问: https://docs.docker.com/compose/install/"
        exit 1
    fi
    
    print_success "Docker 环境检查通过，已准备好运行 DuckDB 引擎"
}

# 检查并修复权限
check_and_fix_permissions() {
    print_info "检查目录权限..."
    
    # 检查关键目录的权限
    local dirs=("data" "data/duckdb" "data/uploads" "temp_files" "exports" "logs")
    local permission_issues=()
    
    for dir in "${dirs[@]}"; do
        if [ -d "$dir" ]; then
            # 检查目录是否可写
            if [ ! -w "$dir" ]; then
                permission_issues+=("$dir")
                print_warning "目录 $dir 不可写，尝试修复权限..."
                chmod 755 "$dir" 2>/dev/null || true
            fi
        fi
    done
    
    if [ ${#permission_issues[@]} -eq 0 ]; then
        print_success "所有目录权限正常"
    else
        print_warning "已尝试修复权限问题，如果仍有问题请手动检查"
    fi
}

# 设置配置文件
setup_config() {
    print_info "设置配置文件..."
    
    # 创建配置目录
    mkdir -p config data/duckdb data/uploads temp_files exports logs
    
    # 设置目录权限（确保Docker容器可以读写）
    print_info "设置目录权限..."
    
    # 获取当前用户ID和组ID
    CURRENT_UID=$(id -u)
    CURRENT_GID=$(id -g)
    
    # 设置目录权限（755 for directories, 644 for files）
    chmod 755 config data data/duckdb data/uploads temp_files exports logs
    
    # 如果Docker容器使用非特权用户，需要特殊处理
    if [ -n "$(docker ps -q 2>/dev/null)" ]; then
        print_info "检测到Docker环境，设置容器兼容权限..."
        # 设置目录为可写（777 for Docker volume mounts）
        chmod 777 data data/duckdb data/uploads temp_files exports logs
    fi
    
    print_success "目录权限设置完成"


    
    # 复制示例配置文件
    if [ ! -f "config/app-config.json" ]; then
        if [ -f "config/app-config.example.json" ]; then
            cp config/app-config.example.json config/app-config.json
            print_success "应用配置已创建: config/app-config.json"
        else
            print_warning "应用配置示例文件不存在，将创建默认配置"
            cat > config/app-config.json << 'EOF'
{
  "debug": false,
  "cors_origins": ["http://localhost:3000"],
  "max_file_size": 53687091200,
  "max_query_rows": 10000,
  "max_tables": 200,
  "timezone": "Asia/Shanghai",
  "table_metadata_cache_ttl_hours": 24,
  "duckdb_memory_limit": "8GB",
  "duckdb_threads": 8,
  "duckdb_temp_directory": null,
  "duckdb_home_directory": null,
  "duckdb_extension_directory": null,
  "duckdb_enable_profiling": "query_tree",
  "duckdb_profiling_output": null,
  "duckdb_prefer_range_joins": false,
  "duckdb_enable_object_cache": true,
  "duckdb_preserve_insertion_order": false,
  "duckdb_enable_progress_bar": false,
  "duckdb_extensions": ["excel", "json", "parquet", "httpfs", "mysql", "postgres"],
  "duckdb_remote_settings": {
    "s3_region": "cn-hangzhou",
    "s3_endpoint": "oss-cn-hangzhou.aliyuncs.com",
    "s3_url_style": "path",
    "s3_use_ssl": true
  },
  "server_data_mounts": [
    { "label": "Shared Data", "path": "/app/server_mounts" },
    { "label": "macOS Downloads", "path": "/app/host_downloads" },
    { "label": "macOS Documents", "path": "/app/host_documents" }
  ],
  "pool_min_connections": 2,
  "pool_max_connections": 10,
  "pool_connection_timeout": 30,
  "pool_idle_timeout": 300,
  "pool_max_retries": 3,
  "db_connect_timeout": 10,
  "db_read_timeout": 30,
  "db_write_timeout": 30,
  "db_ping_timeout": 5,
  "url_reader_timeout": 30,
  "url_reader_head_timeout": 10,
  "sqlite_timeout": 10,
  "pool_wait_timeout": 1.0
}
EOF
        fi
    fi
    

    
    # 创建MySQL配置文件
    if [ ! -f "config/mysql-configs.json" ]; then
        if [ -f "config/mysql-configs.json.example" ]; then
            cp config/mysql-configs.json.example config/mysql-configs.json
            print_success "MySQL配置已创建: config/mysql-configs.json"
        else
            print_warning "MySQL配置示例文件不存在，将创建空配置"
            echo "[]" > config/mysql-configs.json
        fi
    fi
    

    
    # 创建SQL收藏配置文件
    if [ ! -f "config/sql-favorites.json" ]; then
        if [ -f "config/sql-favorites.json.example" ]; then
            cp config/sql-favorites.json.example config/sql-favorites.json
            print_success "SQL收藏配置已创建: config/sql-favorites.json"
        else
            print_warning "SQL收藏配置示例文件不存在，将创建空配置"
            echo "[]" > config/sql-favorites.json
        fi
    fi
    
    print_success "配置文件设置完成"
}

# 启动服务
start_services() {
    print_info "启动 DuckQuery · DuckDB 可视化服务..."
    
    # 停止现有服务
    docker-compose down 2>/dev/null || true
    
    # 启动服务（使用统一的docker-compose.yml）
    docker-compose up -d --build
    
    print_success "服务启动完成！"
    print_info "等待服务就绪..."
    
    # 等待服务就绪
    sleep 10
    
    print_success "🎉 DuckQuery + DuckDB 启动成功！"
    print_info "前端界面（DuckDB 可视化分析）: http://localhost:3000"
    print_info "API 文档 (FastAPI + DuckDB 数据服务): http://localhost:8001/docs"
    print_info ""
    print_info "提示："
    print_info "- 推荐先阅读 README: README.md"
    print_info "- 在前端可拖拽 Excel/CSV/Parquet，自动建 DuckDB 表"
    print_info "- DuckQuery 支持剪贴板、远程文件、多库连接的 DuckDB 分析"
    print_info "- 调整资源/端口可编辑 docker-compose.yml 或 config/app-config.json"
    print_info ""
    print_info "如果遇到权限问题："
    print_info "- 检查目录权限: ls -la data/ temp_files/ exports/"
    print_info "- 修复权限: chmod 755 data/ temp_files/ exports/"
    print_info "- 或使用: sudo chown -R \$USER:\$USER data/ temp_files/ exports/"
    print_info ""
    print_info "更多示例与截图: https://chenkeliang.github.io/duckdb-query/"
}

# 主函数
main() {
    echo "🦆 DuckQuery · DuckDB Visual Analytics - Quick Start"
    echo "=================================="
    
    check_docker
    setup_config
    check_and_fix_permissions
    start_services
}

# 运行主函数
main "$@"
