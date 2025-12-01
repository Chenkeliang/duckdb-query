#!/bin/bash

# DuckQuery Demo 启动脚本

echo "🚀 启动 DuckQuery Demo..."
echo ""
echo "📂 当前目录: $(pwd)"
echo ""
echo "🌐 启动 HTTP 服务器..."
echo ""
echo "✅ 服务器已启动！"
echo ""
echo "📍 请在浏览器中访问："
echo "   http://localhost:8000/docs/demo/index.html"
echo ""
echo "💡 提示："
echo "   - 按 Ctrl+C 停止服务器"
echo "   - 确保端口 8000 未被占用"
echo ""

# 启动 Python HTTP 服务器
python3 -m http.server 8000
