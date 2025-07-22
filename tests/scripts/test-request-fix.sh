#!/bin/bash

# 测试请求修复效果

echo "🚦 测试前端请求频率修复"
echo "====================="

# 监控API请求
echo "监控API请求频率（30秒）..."
echo "开始时间: $(date)"

# 计算初始请求数
initial_requests=$(netstat -an 2>/dev/null | grep :8000 | wc -l)
echo "初始连接数: $initial_requests"

# 等待30秒并监控
sleep 30

# 计算30秒后的请求数
final_requests=$(netstat -an 2>/dev/null | grep :8000 | wc -l)
echo "30秒后连接数: $final_requests"

# 计算差值
request_diff=$((final_requests - initial_requests))
echo "新增连接数: $request_diff"

echo ""
echo "结束时间: $(date)"

# 判断修复效果
if [ $request_diff -lt 10 ]; then
    echo "✅ 修复成功！请求频率已控制在合理范围内"
else
    echo "❌ 仍有过多请求，需要进一步检查"
fi

echo ""
echo "🎯 预期结果："
echo "• 页面加载时：应该只有2-4个初始请求"
echo "• 30秒内：不应该有大量重复请求"
echo "• 手动刷新：点击时才发送请求"

echo ""
echo "🌐 请访问 http://localhost:3000 测试："
echo "1. 打开Network标签页"
echo "2. 观察API请求频率"
echo "3. 点击刷新按钮测试"
echo "4. 检查控制台日志"
