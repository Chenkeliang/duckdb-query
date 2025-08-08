# 手动部署步骤

由于自动化部署命令被中断，请按以下步骤手动执行Docker重新部署：

## 步骤1：停止现有服务
```bash
docker-compose down --remove-orphans
```

## 步骤2：重新构建和启动服务
```bash
docker-compose up --build -d
```

## 步骤3：检查服务状态
```bash
docker-compose ps
```

## 步骤4：等待服务完全启动
等待30-60秒让服务完全启动

## 步骤5：验证服务可访问性
- 前端：http://localhost:3000
- API文档：http://localhost:8000/docs

## 步骤6：测试修复功能
1. 访问前端应用
2. 执行任意查询获取结果
3. 测试"导出"功能 - 应该下载Excel文件
4. 测试"保存为数据源"功能 - 应该成功保存到DuckDB

## 修复内容确认

已修复的文件：
- ✅ `api/routers/query.py` - 添加 `/api/export/quick` 端点，修复 `/api/save_query_to_duckdb`
- ✅ `frontend/src/components/Results/ModernDataDisplay.jsx` - 完善导出下载逻辑

## 如果功能仍不工作

1. 检查浏览器开发者工具的控制台错误
2. 检查网络面板的API调用状态
3. 运行测试脚本：`node test-export-save-fixes.js`
4. 查看Docker日志：`docker-compose logs api -f`

所有代码修复已就位，重新部署后功能应该正常工作！