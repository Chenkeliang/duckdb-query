#!/bin/bash

# 项目根目录测试快速入口
# 自动执行所有测试，检查代码问题

echo "🚀 项目测试快速入口"
echo "=================="
echo "正在启动聚合测试执行器..."
echo ""

# 获取脚本所在目录
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# 执行聚合测试脚本
exec "$SCRIPT_DIR/tests/run-all-tests.sh" "$@"
