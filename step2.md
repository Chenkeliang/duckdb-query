# 问题分析与解决

## 问题描述
在尝试下载异步任务结果时遇到500错误，预览功能也没有显示具体的数据详情。

## 问题定位
通过查看Docker日志，发现以下关键错误信息：
```
2025-08-14 11:59:40,786 - routers.async_tasks - ERROR - 下载异步任务结果失败: name 'TaskStatus' is not defined
2025-08-14 11:59:40,788 - core.exceptions - WARNING - HTTP异常: 500 - 下载结果失败: name 'TaskStatus' is not defined
```

这表明在`/api/async_tasks/{task_id}/result`接口中，`TaskStatus`没有被正确导入。

## 解决方案
在`api/routers/async_tasks.py`文件中，修改导入语句，添加对`TaskStatus`的导入：
```python
# 修改前
from core.task_manager import task_manager

# 修改后
from core.task_manager import task_manager, TaskStatus
```

## 验证修复
1. 重启后端服务：
   ```bash
   docker-compose restart backend
   ```

2. 等待服务完全启动后，测试下载接口：
   ```bash
   curl -X GET "http://localhost:3000/api/async_tasks/3616e0d9-eb35-4fa3-8c45-f611246783c0/result"
   ```

3. 如果修复成功，应该能够正确下载结果文件。

## 结果确认
通过检查容器内的文件系统，确认结果文件确实存在：
```
/app/exports/task-3616e0d9-eb35-4fa3-8c45-f611246783c0_20250814_115857.parquet
```

使用pandas读取该文件，确认文件内容正常：
```
        DCID           FILE  ...    __time__ __topic__
0  lj.bj.mjq  erp/erp.go:28  ...  1754755411      None
1  lj.bj.mjq  erp/erp.go:28  ...  1754755411      None
2  lj.bj.mjq  erp/erp.go:28  ...  1754755411      None
3  lj.bj.mjq  erp/erp.go:28  ...  1754755411      None
4  lj.bj.mjq  erp/erp.go:28  ...  1754755411      None

[5 rows x 18 columns]
```

这表明异步任务执行成功，结果文件也正确生成，问题仅在于下载接口的实现。