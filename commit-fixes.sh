#!/bin/bash

# Git提交脚本 - 提交所有修复的内容

echo "📝 Git提交脚本"
echo "=============="
echo "提交所有项目修复的内容到git仓库"
echo ""

# 检查git状态
echo "1. 检查Git状态"
echo "============="
git status --porcelain

echo ""
echo "2. 添加所有修改的文件"
echo "=================="

# 添加所有修改的文件
git add .

echo "已添加所有修改的文件到暂存区"

echo ""
echo "3. 创建详细的提交信息"
echo "==================="

# 创建详细的提交信息
commit_message="fix: 修复项目中的多个关键问题

🔧 修复内容总结：

1. 测试脚本修复 (5个问题)
   - 修复test-all-functions.sh中Excel预览API问题
   - 修复test-api-functions.sh中head命令参数错误
   - 修复test-table-display-fix.sh中缺少测试文件问题
   - 修复test-datagrid-fix.sh中缺少测试文件问题  
   - 修复test-delete-file-fix.sh中缺少测试文件问题

2. 数据一致性修复
   - 修复文件删除后数据源仍显示的问题
   - 删除文件时同时清理DuckDB中的对应表
   - 增强file_columns API的文件存在性检查

3. API接口修复
   - 修复list_files和connect_database接口无响应问题
   - 修复PostgreSQL连接字符串代码缩进问题
   - 修复pandas导入作用域问题

4. 联表查询功能增强
   - 支持MySQL直接连接参数模式（无需connectionId）
   - 添加\"outer\"到JoinType枚举，支持全外连接
   - 完善错误处理和日志记录

📁 修改的文件：
- api/routers/data_sources.py: 增强删除文件API和文件列名API
- api/routers/query.py: 支持直接MySQL连接参数
- api/models/query_models.py: 添加\"outer\"到JoinType枚举
- tests/scripts/: 修复多个测试脚本问题
- 新增: restart-docker-services.sh (Docker重启脚本)
- 新增: tests/scripts/test-*.sh (多个测试验证脚本)

🎯 修复原则：
- 不删除代码逻辑，保持向后兼容
- 只做功能修复，专注解决问题
- 保持项目整体运行稳定

✅ 现在支持：
- MySQL直接连接参数的联表查询
- 全外连接(FULL OUTER JOIN) 
- 文件删除的数据一致性
- 完整的测试工具链"

echo ""
echo "4. 执行Git提交"
echo "============="

# 执行提交
git commit -m "$commit_message"

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Git提交成功！"
    echo ""
    echo "📊 提交统计："
    git log --oneline -1
    echo ""
    echo "📁 本次提交包含的文件："
    git show --name-only --pretty=format: HEAD | grep -v '^$'
    echo ""
    echo "🎉 所有修复内容已成功提交到Git仓库！"
else
    echo ""
    echo "❌ Git提交失败"
    echo "可能的原因："
    echo "1. 没有要提交的更改"
    echo "2. Git配置问题"
    echo "3. 权限问题"
fi

echo ""
echo "📝 提交完成"