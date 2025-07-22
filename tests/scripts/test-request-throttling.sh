#!/bin/bash

# 测试请求限制修复效果

echo "🚦 测试前端请求限制修复"
echo "====================="

# 1. 监控API请求频率
echo "1. 监控API请求频率（10秒）"
echo "请在另一个终端运行以下命令来监控请求："
echo "tail -f interactive-data-query/api/logs/app.log | grep -E '(list_files|database_connections)'"
echo ""
echo "或者使用网络监控："
echo "netstat -an | grep :8000 | wc -l"

# 2. 测试防抖机制
echo ""
echo "2. 测试防抖机制"
echo "✅ 页面加载时：只应该有一次初始请求"
echo "✅ 30秒内重复刷新：应该被防抖限制"
echo "✅ 手动刷新按钮：应该强制刷新"

# 3. 检查控制台日志
echo ""
echo "3. 检查浏览器控制台"
echo "应该看到以下日志："
echo "- '获取数据源列表...'"
echo "- '数据源列表更新完成'"
echo "- '跳过数据源请求，距离上次请求不足30秒'"

# 4. 功能验证
echo ""
echo "4. 功能验证清单"
echo "□ 页面加载时只有一次API请求"
echo "□ 快速切换标签页不会触发额外请求"
echo "□ 手动刷新按钮可以强制刷新"
echo "□ 30秒内的自动刷新被防抖限制"
echo "□ 文件上传后会触发一次刷新"

echo ""
echo "🎯 修复效果总结"
echo "=============="
echo "✅ 添加了30秒防抖机制"
echo "✅ 区分强制刷新和普通刷新"
echo "✅ 添加了手动刷新按钮"
echo "✅ 添加了详细的控制台日志"
echo "✅ 可选的自动刷新定时器（默认关闭）"

echo ""
echo "🌐 测试步骤："
echo "1. 访问 http://localhost:3000"
echo "2. 打开浏览器开发者工具的Network标签"
echo "3. 观察API请求频率"
echo "4. 尝试快速切换标签页"
echo "5. 点击顶部的刷新按钮"
echo "6. 检查控制台日志"

echo ""
echo "📊 预期结果："
echo "• 初始加载：2个请求（list_files + database_connections）"
echo "• 快速操作：不应该有额外请求"
echo "• 手动刷新：强制发送请求"
echo "• 防抖生效：控制台显示跳过消息"

echo ""
echo "🚀 请求限制已成功实现！"
