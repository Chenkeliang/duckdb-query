#!/usr/bin/env bash
# DuckQuery 一键启动：Docker 全栈（前端 48000 / API 48001）
# 数据目录 ./data（bind mount，重建容器不会删除已导入表）

set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
print_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
print_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
print_error() { echo -e "${RED}[ERROR]${NC} $1"; }

check_docker() {
  if ! command -v docker >/dev/null 2>&1; then
    print_error "未找到 Docker，请先安装: https://docs.docker.com/get-docker/"
    exit 1
  fi

  if docker compose version >/dev/null 2>&1; then
    DC=(docker compose)
  elif command -v docker-compose >/dev/null 2>&1; then
    DC=(docker-compose)
  else
    print_error "需要 Docker Compose（docker compose 或 docker-compose）"
    exit 1
  fi

  print_success "Docker 环境检查通过"
}

check_and_fix_permissions() {
  print_info "检查目录权限..."
  local dirs=("data" "data/duckdb" "data/uploads" "temp_files" "exports" "logs")
  local permission_issues=()

  for dir in "${dirs[@]}"; do
    if [[ -d "$dir" ]] && [[ ! -w "$dir" ]]; then
      permission_issues+=("$dir")
      print_warning "目录 $dir 不可写，尝试修复权限..."
      chmod 755 "$dir" 2>/dev/null || true
    fi
  done

  if [[ ${#permission_issues[@]} -eq 0 ]]; then
    print_success "目录权限正常"
  else
    print_warning "已尝试修复权限，若仍失败请检查 data/ 目录属主"
  fi
}

setup_config() {
  print_info "设置配置文件..."
  mkdir -p config data/duckdb data/uploads temp_files exports logs

  print_info "设置目录权限..."
  chmod 755 config data data/duckdb data/uploads temp_files exports logs 2>/dev/null || true
  if docker info >/dev/null 2>&1; then
    chmod 777 data data/duckdb data/uploads temp_files exports logs 2>/dev/null || true
  fi

  if [[ ! -f "config/app-config.json" ]]; then
    if [[ -f "config/app-config.example.json" ]]; then
      cp config/app-config.example.json config/app-config.json
      print_success "已创建 config/app-config.json"
    else
      print_warning "未找到 config/app-config.example.json，将使用内置默认项"
      cat > config/app-config.json <<'EOF'
{
  "debug": false,
  "cors_origins": ["http://localhost:48000"],
  "max_file_size": 53687091200,
  "max_query_rows": 10000,
  "max_tables": 200,
  "timezone": "Asia/Shanghai",
  "duckdb_memory_limit": "8GB",
  "duckdb_threads": 8,
  "duckdb_extensions": ["excel", "json", "parquet", "httpfs", "mysql", "postgres"],
  "server_data_mounts": [
    { "label": "Shared Data", "path": "/app/server_mounts" },
    { "label": "macOS Downloads", "path": "/app/host_downloads" },
    { "label": "macOS Documents", "path": "/app/host_documents" }
  ]
}
EOF
    fi
  fi

  if [[ ! -f "config/mysql-configs.json" ]]; then
    if [[ -f "config/mysql-configs.json.example" ]]; then
      cp config/mysql-configs.json.example config/mysql-configs.json
    else
      echo "[]" > config/mysql-configs.json
    fi
  fi

  if [[ ! -f ".env" ]] && [[ -f ".env.docker.cn.example" ]]; then
    cp .env.docker.cn.example .env
    print_success "已创建 .env（Docker 构建镜像加速，可编辑或删除）"
  fi

  print_success "配置就绪"
}

resolve_compose_images() {
  if [[ "${USE_DOCKER_HUB:-}" == "1" ]]; then
    export NODE_IMAGE="${NODE_IMAGE:-node:24-alpine}"
    export NGINX_IMAGE="${NGINX_IMAGE:-nginx:stable-alpine}"
  else
    export NODE_IMAGE="${NODE_IMAGE:-docker.m.daocloud.io/library/node:24-alpine}"
    export NGINX_IMAGE="${NGINX_IMAGE:-docker.m.daocloud.io/library/nginx:stable-alpine}"
  fi
}

start_services() {
  print_info "构建并启动 DuckQuery（Docker）..."
  resolve_compose_images

  if docker info 2>/dev/null | grep -q '127.0.0.1:7890'; then
    print_warning "检测到 Docker 仍指向 127.0.0.1:7890 代理，拉镜像可能失败"
    print_info "可执行: ./scripts/clear-orbstack-docker-proxy.sh  后重启 OrbStack"
  fi

  print_info "NODE_IMAGE=${NODE_IMAGE}"
  print_info "NGINX_IMAGE=${NGINX_IMAGE}"

  if [[ "${QUICK_START_RESET:-}" == "1" ]]; then
    print_info "QUICK_START_RESET=1：先停止旧容器..."
    "${DC[@]}" down 2>/dev/null || true
  fi

  NODE_IMAGE="${NODE_IMAGE}" NGINX_IMAGE="${NGINX_IMAGE}" "${DC[@]}" up -d --build

  print_success "容器已启动，等待健康检查..."
  sleep 10

  print_success "DuckQuery 已就绪"
  print_info "前端:     http://localhost:48000"
  print_info "API 文档: http://localhost:48001/docs"
  print_info ""
  print_info "数据保存在宿主机 ./data（重建容器不会删除 DuckDB 表）"
  print_info "日志: ${DC[*]} logs -f"
  print_info "停止: ${DC[*]} down   （勿随意使用 down -v）"
  print_info ""
  print_info "海外网络拉镜像失败时: USE_DOCKER_HUB=1 ./quick-start.sh"
  print_info "国内默认已使用 DaoCloud 镜像；也可编辑项目根目录 .env"
}

main() {
  echo "DuckQuery · DuckDB Query Workbench"
  echo "=================================="
  check_docker
  setup_config
  check_and_fix_permissions
  start_services
}

main "$@"
