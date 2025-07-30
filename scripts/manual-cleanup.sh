#!/bin/bash

# 手动清理脚本 - 用户可以手动执行的清理脚本
# Manual Cleanup Script - User can manually execute this cleanup script

echo "🧹 手动数据清理工具"
echo "🧹 Manual Data Cleanup Tool"
echo "=================================="

# 获取脚本所在目录的父目录作为项目根目录
PROJECT_ROOT="$(dirname "$(dirname "$(realpath "$0")")")"

echo "📁 项目根目录: $PROJECT_ROOT"
echo "📁 Project root: $PROJECT_ROOT"
echo ""

# 显示清理选项
echo "请选择要执行的清理操作："
echo "Please select cleanup operations:"
echo ""
echo "1. 🗄️  清理所有数据库文件 (Clear all database files)"
echo "2. 📁  清理上传文件 (Clear uploaded files)"
echo "3. 📋  重置数据源配置 (Reset datasource configurations)"
echo "4. 🗑️  清理缓存文件 (Clear cache files)"
echo "5. 📝  清理日志文件 (Clear log files)"
echo "6. 📤  清理导出文件 (Clear export files)"
echo "7. ⚙️  重置配置文件为示例 (Reset config files to examples)"
echo "8. 🧹  执行完整清理 (Execute full cleanup)"
echo "9. ❌  退出 (Exit)"
echo ""

read -p "请输入选项 (1-9): " choice

case $choice in
    1)
        echo "🗄️ 清理数据库文件..."
        rm -f "$PROJECT_ROOT/data/duckdb_data.db"
        rm -f "$PROJECT_ROOT/data/duckdb/main.db"*
        rm -rf "$PROJECT_ROOT/data/duckdb/temp"
        mkdir -p "$PROJECT_ROOT/data/duckdb"
        echo "✅ 数据库文件清理完成"
        ;;
    2)
        echo "📁 清理上传文件..."
        rm -f "$PROJECT_ROOT/api/temp_files"/*
        rm -f "$PROJECT_ROOT/data/uploads"/*
        echo "✅ 上传文件清理完成"
        ;;
    3)
        echo "📋 重置数据源配置..."
        echo '{}' > "$PROJECT_ROOT/data/file_datasources.json"
        echo "✅ 数据源配置重置完成"
        ;;
    4)
        echo "🗑️ 清理缓存文件..."
        find "$PROJECT_ROOT" -name "__pycache__" -type d -exec rm -rf {} + 2>/dev/null || true
        find "$PROJECT_ROOT" -name "*.pyc" -delete 2>/dev/null || true
        find "$PROJECT_ROOT" -name "*.pyo" -delete 2>/dev/null || true
        find "$PROJECT_ROOT" -name ".DS_Store" -delete 2>/dev/null || true
        echo "✅ 缓存文件清理完成"
        ;;
    5)
        echo "📝 清理日志文件..."
        find "$PROJECT_ROOT" -name "*.log" -delete 2>/dev/null || true
        rm -rf "$PROJECT_ROOT/logs" 2>/dev/null || true
        mkdir -p "$PROJECT_ROOT/logs"
        echo "✅ 日志文件清理完成"
        ;;
    6)
        echo "📤 清理导出文件..."
        rm -f "$PROJECT_ROOT/api/exports"/*
        echo "✅ 导出文件清理完成"
        ;;
    7)
        echo "⚙️ 重置配置文件为示例..."
        rm -f "$PROJECT_ROOT/config/mysql-configs.json"
        rm -f "$PROJECT_ROOT/config/datasources.json"
        echo "✅ 配置文件重置完成"
        echo "ℹ️ 请使用 .example 文件创建您的配置"
        ;;
    8)
        echo "🧹 执行完整清理..."
        
        # 执行自动清理脚本
        if [ -f "$PROJECT_ROOT/scripts/auto-cleanup.sh" ]; then
            chmod +x "$PROJECT_ROOT/scripts/auto-cleanup.sh"
            "$PROJECT_ROOT/scripts/auto-cleanup.sh"
        else
            echo "⚠️ 自动清理脚本未找到"
        fi
        ;;
    9)
        echo "👋 退出清理工具"
        exit 0
        ;;
    *)
        echo "❌ 无效选项，请重新运行脚本"
        exit 1
        ;;
esac

echo ""
echo "🎉 清理操作完成！"
echo "🎉 Cleanup operation completed!"

# 询问是否重启服务
if command -v docker-compose &> /dev/null; then
    read -p "是否重启Docker服务? (y/n): " restart_choice
    if [ "$restart_choice" = "y" ] || [ "$restart_choice" = "Y" ]; then
        echo "🔄 重启Docker服务..."
        cd "$PROJECT_ROOT"
        docker-compose restart
        echo "✅ Docker服务重启完成"
    fi
fi
