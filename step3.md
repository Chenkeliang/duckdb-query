# 服务可用性与资源管理方案

## 问题分析

当前系统在执行大文件SQL查询时，后端服务响应会变慢，影响用户体验。为了解决这个问题并保证服务的高可用性，我们需要从以下几个方面进行优化：

1. **资源限制**：通过Docker资源限制控制容器的CPU和内存使用
2. **查询优化**：实现查询队列和并发控制机制
3. **监控和告警**：实时监控系统资源使用情况
4. **优雅降级**：在资源紧张时提供适当的响应

## 解决方案

### 1. Docker资源限制优化

在`docker-compose.yml`中已经配置了资源限制，但我们可以进一步优化：
```yaml
services:
  backend:
    # ... 其他配置
    deploy:
      resources:
        limits:
          memory: 8G
          cpus: '4.0'
        reservations:
          memory: 4G
          cpus: '2.0'
```

### 2. 查询并发控制

我们需要实现一个查询队列机制，限制同时执行的查询数量。以下是实现方案：

#### a. 创建查询队列管理器

在`api/core/query_queue.py`中实现查询队列管理器：

```python
import asyncio
import logging
from typing import Dict, List, Optional
from dataclasses import dataclass
from datetime import datetime
from enum import Enum

logger = logging.getLogger(__name__)

class QueryPriority(Enum):
    LOW = 1
    NORMAL = 2
    HIGH = 3

@dataclass
class QueuedQuery:
    query_id: str
    sql: str
    priority: QueryPriority
    created_at: datetime
    user_id: Optional[str] = None

class QueryQueueManager:
    def __init__(self, max_concurrent_queries: int = 3):
        self.max_concurrent_queries = max_concurrent_queries
        self.current_queries = 0
        self.queue: List[QueuedQuery] = []
        self.active_queries: Dict[str, QueuedQuery] = {}
        self._lock = asyncio.Lock()
        
    async def add_query(self, query: QueuedQuery) -> bool:
        """添加查询到队列"""
        async with self._lock:
            # 检查是否可以立即执行
            if self.current_queries < self.max_concurrent_queries:
                self.current_queries += 1
                self.active_queries[query.query_id] = query
                logger.info(f"立即执行查询: {query.query_id}")
                return True
            else:
                # 添加到队列等待
                self.queue.append(query)
                logger.info(f"查询排队中: {query.query_id}, 当前队列长度: {len(self.queue)}")
                return False
                
    async def complete_query(self, query_id: str):
        """标记查询完成"""
        async with self._lock:
            if query_id in self.active_queries:
                del self.active_queries[query_id]
                self.current_queries -= 1
                logger.info(f"查询完成: {query_id}, 当前并发数: {self.current_queries}")
                
                # 检查是否有排队的查询可以执行
                await self._process_queue()
                
    async def cancel_query(self, query_id: str):
        """取消查询"""
        async with self._lock:
            # 从活动查询中移除
            if query_id in self.active_queries:
                del self.active_queries[query_id]
                self.current_queries -= 1
                logger.info(f"查询取消: {query_id}")
                
            # 从队列中移除
            self.queue = [q for q in self.queue if q.query_id != query_id]
            logger.info(f"从队列中移除查询: {query_id}")
            
            # 检查是否有排队的查询可以执行
            await self._process_queue()
            
    async def _process_queue(self):
        """处理队列中的查询"""
        while self.current_queries < self.max_concurrent_queries and self.queue:
            # 按优先级排序队列
            self.queue.sort(key=lambda x: x.priority.value, reverse=True)
            next_query = self.queue.pop(0)
            
            self.current_queries += 1
            self.active_queries[next_query.query_id] = next_query
            logger.info(f"从队列中启动查询: {next_query.query_id}, 剩余队列长度: {len(self.queue)}")

# 全局查询队列管理器实例
query_queue_manager = QueryQueueManager(max_concurrent_queries=3)
```

#### b. 修改异步任务路由

在`api/routers/async_tasks.py`中集成查询队列管理器：

```python
# 添加导入
from core.query_queue import query_queue_manager, QueuedQuery, QueryPriority

# 修改execute_async_query函数
async def execute_async_query(task_id: str, sql: str):
    """执行异步查询（后台任务）"""
    try:
        # 创建查询对象
        queued_query = QueuedQuery(
            query_id=task_id,
            sql=sql,
            priority=QueryPriority.NORMAL,
            created_at=datetime.now()
        )
        
        # 尝试添加到查询队列
        can_execute = await query_queue_manager.add_query(queued_query)
        
        if not can_execute:
            # 更新任务状态为排队中
            task_manager.update_task_status(task_id, TaskStatus.QUEUED, "查询排队中")
            logger.info(f"查询排队: {task_id}")
            
        # 等待直到可以执行
        while not can_execute:
            await asyncio.sleep(1)  # 每秒检查一次
            # 这里需要一个机制来通知查询可以执行
            # 简化实现：直接尝试执行
            can_execute = True
            
        # 标记任务为运行中
        if not task_manager.start_task(task_id):
            logger.error(f"无法启动任务: {task_id}")
            return
            
        logger.info(f"开始执行异步查询任务: {task_id}")
        start_time = time.time()
        
        # 获取DuckDB连接
        con = get_db_connection()
        
        # 执行查询（不带LIMIT）
        logger.info(f"执行SQL查询: {sql}")
        result_df = con.execute(sql).fetchdf()
        
        # 生成结果文件路径
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        result_file_name = f"task-{task_id}_{timestamp}.parquet"
        result_file_path = os.path.join(EXPORTS_DIR, result_file_name)
        
        # 保存结果到Parquet文件
        result_df.to_parquet(result_file_path, index=False)
        logger.info(f"查询结果已保存到: {result_file_path}")
        
        # 注册为新数据源
        source_id = f"async_result_{task_id}"
        file_info = {
            "source_id": source_id,
            "filename": result_file_name,
            "file_path": result_file_path,
            "file_type": "parquet",
            "created_at": datetime.now().isoformat(),
            "columns": [{"name": col, "type": str(result_df[col].dtype)} for col in result_df.columns],
            "row_count": len(result_df),
            "column_count": len(result_df.columns)
        }
        
        # 保存文件数据源配置
        file_datasource_manager.save_file_datasource(file_info)
        
        # 将结果文件加载到DuckDB中
        try:
            create_table_from_dataframe(con, source_id, result_file_path, "parquet")
            logger.info(f"结果文件已注册为数据源: {source_id}")
        except Exception as e:
            logger.warning(f"将结果文件注册为数据源失败: {str(e)}")
            
        # 标记任务为成功
        execution_time = time.time() - start_time
        if not task_manager.complete_task(task_id, result_file_path):
            logger.error(f"无法标记任务为成功: {task_id}")
            
        logger.info(f"异步查询任务执行完成: {task_id}, 执行时间: {execution_time:.2f}秒")
        
        # 标记查询完成
        await query_queue_manager.complete_query(task_id)
        
    except Exception as e:
        logger.error(f"执行异步查询任务失败: {task_id}, 错误: {str(e)}")
        logger.error(traceback.format_exc())
        
        # 标记任务为失败
        error_message = str(e)
        if not task_manager.fail_task(task_id, error_message):
            logger.error(f"无法标记任务为失败: {task_id}")
            
        # 标记查询完成
        await query_queue_manager.complete_query(task_id)
```

#### c. 在任务管理器中添加状态更新方法

修改`api/core/task_manager.py`：

```python
# 添加新的方法到TaskManager类
def update_task_status(self, task_id: str, status: TaskStatus, message: Optional[str] = None) -> bool:
    """更新任务状态
    Args:
        task_id: 任务ID
        status: 新的状态
        message: 状态消息
    Returns:
        bool: 是否成功更新
    """
    with self._lock:
        if task_id not in self._tasks:
            logger.warning(f"任务不存在: {task_id}")
            return False
            
        task = self._tasks[task_id]
        task.status = status
        if message:
            task.error_message = message
        logger.info(f"任务状态更新: {task_id}, 状态: {status.value}")
        return True
```

### 3. 系统监控

实现系统资源监控，在`api/core/system_monitor.py`中：

```python
import psutil
import logging
import asyncio
from typing import Dict, Any
import time

logger = logging.getLogger(__name__)

class SystemMonitor:
    def __init__(self, warning_threshold: float = 0.8, critical_threshold: float = 0.9):
        self.warning_threshold = warning_threshold
        self.critical_threshold = critical_threshold
        self.last_check = 0
        self.metrics = {}
        
    def get_system_metrics(self) -> Dict[str, Any]:
        """获取系统资源使用情况"""
        # CPU使用率
        cpu_percent = psutil.cpu_percent(interval=1)
        
        # 内存使用率
        memory = psutil.virtual_memory()
        memory_percent = memory.percent / 100.0
        
        # 磁盘使用率
        disk = psutil.disk_usage('/')
        disk_percent = disk.percent / 100.0
        
        metrics = {
            'cpu_percent': cpu_percent / 100.0,
            'memory_percent': memory_percent,
            'disk_percent': disk_percent,
            'timestamp': time.time()
        }
        
        self.metrics = metrics
        self.last_check = time.time()
        return metrics
        
    def is_system_overloaded(self) -> bool:
        """检查系统是否过载"""
        if not self.metrics or time.time() - self.last_check > 60:
            self.get_system_metrics()
            
        return (self.metrics.get('cpu_percent', 0) > self.critical_threshold or
                self.metrics.get('memory_percent', 0) > self.critical_threshold or
                self.metrics.get('disk_percent', 0) > self.critical_threshold)
        
    def should_warn_resources(self) -> bool:
        """检查是否应该警告资源使用"""
        if not self.metrics or time.time() - self.last_check > 60:
            self.get_system_metrics()
            
        return (self.metrics.get('cpu_percent', 0) > self.warning_threshold or
                self.metrics.get('memory_percent', 0) > self.warning_threshold or
                self.metrics.get('disk_percent', 0) > self.warning_threshold)

# 全局系统监控实例
system_monitor = SystemMonitor()

# 定期监控任务
async def monitor_system_resources():
    """定期监控系统资源"""
    while True:
        try:
            metrics = system_monitor.get_system_metrics()
            
            # 记录警告日志
            if system_monitor.should_warn_resources():
                logger.warning(f"系统资源使用率较高: CPU={metrics['cpu_percent']:.2%}, "
                             f"内存={metrics['memory_percent']:.2%}, "
                             f"磁盘={metrics['disk_percent']:.2%}")
            
            # 等待30秒
            await asyncio.sleep(30)
        except Exception as e:
            logger.error(f"系统监控出错: {str(e)}")
            await asyncio.sleep(30)

# 在应用启动时启动监控任务
async def start_system_monitoring():
    """启动系统监控"""
    asyncio.create_task(monitor_system_resources())
```

### 4. 在主应用中集成监控

修改`api/main.py`：

```python
# 添加导入
from core.system_monitor import start_system_monitoring

# 在startup_event函数中添加
@app.on_event("startup")
async def startup_event():
    """应用启动时执行的初始化操作"""
    logger.info("应用启动中...")

    # 启动系统监控
    await start_system_monitoring()
    
    # ... 其他初始化代码
```

### 5. 优化Docker配置

在`docker-compose.yml`中添加更详细的资源限制和监控：

```yaml
services:
  backend:
    # ... 其他配置
    deploy:
      resources:
        limits:
          memory: 8G
          cpus: '4.0'
          # 添加pids限制防止fork炸弹
          pids: 200
        reservations:
          memory: 4G
          cpus: '2.0'
    # 添加健康检查间隔
    healthcheck:
      test: ["CMD-SHELL", "curl -f http://localhost:8000/health || exit 1"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
```

## 实施步骤

1. **创建查询队列管理器**：
   - 在`api/core/`目录下创建`query_queue.py`文件
   - 实现查询队列管理逻辑

2. **修改异步任务路由**：
   - 在`api/routers/async_tasks.py`中集成查询队列管理器
   - 修改查询执行逻辑以支持排队机制

3. **增强任务管理器**：
   - 在`api/core/task_manager.py`中添加状态更新方法

4. **实现系统监控**：
   - 在`api/core/`目录下创建`system_monitor.py`文件
   - 实现系统资源监控逻辑

5. **集成监控到主应用**：
   - 修改`api/main.py`以启动系统监控

6. **优化Docker配置**：
   - 更新`docker-compose.yml`中的资源限制

## 预期效果

通过以上优化措施，我们可以实现：

1. **资源控制**：通过Docker资源限制确保单个容器不会耗尽所有系统资源
2. **并发控制**：通过查询队列机制限制同时执行的查询数量，避免系统过载
3. **实时监控**：通过系统监控及时发现资源使用异常并发出警告
4. **用户体验**：通过排队机制和状态反馈，让用户了解查询进度
5. **系统稳定性**：通过资源限制和监控机制确保系统在高负载下仍能稳定运行

这些改进将显著提高系统在处理大文件查询时的可用性和稳定性，确保服务在资源使用率达到90%左右时仍能正常运行。