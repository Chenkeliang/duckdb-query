#!/usr/bin/env python3
"""
Replace ALL remaining Chinese messages in backend files
"""

import re
from pathlib import Path

def replace_chinese_in_file(file_path: Path) -> int:
    """Replace Chinese messages in a single file"""
    if not file_path.exists():
        print(f"File not found: {file_path}")
        return 0
    
    content = file_path.read_text(encoding='utf-8')
    original_content = content
    replacements_count = 0
    
    # Define comprehensive replacement patterns
    replacements = [
        # Common patterns
        (r'异步Task管理器', 'Async Task Manager'),
        (r'负责管理异步Task的status、持久化与导出记录', 'Manages async task status, persistence and export records'),
        (r'重试机制：处理 DuckDB 写写冲突', 'Retry mechanism: handle DuckDB write-write conflicts'),
        (r'使用指数退避策略', 'Using exponential backoff strategy'),
        (r'写写冲突，第 %d 次重试，等待 %.2f 秒', 'Write-write conflict, retry %d, waiting %.2f seconds'),
        (r'所有重试都failed了', 'All retries failed'),
        (r'取消监控守护线程 \(Watchdog\)', 'Cancellation monitoring daemon thread (Watchdog)'),
        (r'模块级单例控制，防止多次初始化启动多个线程', 'Module-level singleton control to prevent multiple thread initialization'),
        (r'启动取消监控守护线程（单例）', 'Start cancellation monitoring daemon thread (singleton)'),
        (r'清理超时的 CANCELLING Task，将其标记为 CANCELLED', 'Clean up timed-out CANCELLING tasks and mark them as CANCELLED'),
        (r'取消超时，强制标记', 'Cancellation timeout, force marked'),
        (r'清理注册表中的残留条目', 'Clean up residual entries in registry'),
        (r'忽略 _cleanup 后缀的临时Task（cleanup 操作很快，不应被清理）', 'Ignore temporary tasks with _cleanup suffix (cleanup operations are fast and should not be cleaned)'),
        (r'Taskstatus枚举', 'Task status enumeration'),
        (r'cancelling（用于取消信号模式）', 'cancelling (for cancellation signal mode)'),
        (r'cancelled（最终status）', 'cancelled (final status)'),
        (r'异步Task数据结构', 'Async task data structure'),
        (r'转换为字典格式，便于返回给前端', 'Convert to dictionary format for frontend response'),
        (r'将后端status映射为前端期望的status值', 'Map backend status to frontend expected status values'),
        (r'前端期望 sql 字段，后端存储为 query', 'Frontend expects sql field, backend stores as query'),
        (r'异步Task管理器（基于DuckDB持久化）', 'Async task manager (based on DuckDB persistence)'),
        (r'单例控制，多次调用不会重复启动', 'Singleton control, multiple calls will not start repeatedly'),
        (r'初始化与工具方法', 'Initialization and utility methods'),
        (r'确保所需的DuckDB表已创建', 'Ensure required DuckDB tables are created'),
        (r'迁移旧版本的系统表名称', 'Migrate legacy system table names'),
        (r'JSON序列化默认处理', 'JSON serialization default handler'),
        (r'确保写入数据库的时间为 naive，避免 tz 混淆', 'Ensure time written to database is naive to avoid tz confusion'),
        (r'对外接口', 'Public interface'),
        (r'Creating new task', 'Creating new task'),
        (r'兼容旧接口：直接写入一条Task记录', 'Compatible with old interface: directly write a task record'),
        (r'标记Task为running', 'Mark task as running'),
        (r'先查询current status用于调试', 'Query current status for debugging'),
        (r'更新后再查询确认', 'Query again after update to confirm'),
        (r'Taskstatus不允许启动', 'Task status does not allow starting'),
        (r'标记Task为成功', 'Mark task as successful'),
        (r'如果Task已被取消，不再更新为成功', 'If task has been cancelled, do not update to success'),
        (r'Task已被取消或failed，跳过完成', 'Task has been cancelled or failed, skip completion'),
        (r'只更新status为 RUNNING 的Task', 'Only update tasks with RUNNING status'),
        (r'complete_task 成功', 'complete_task successful'),
        (r'complete_task failed', 'complete_task failed'),
        (r'期望 running', 'expected running'),
        (r'增加重试次数和延迟以应对 DuckDB WAL checkpoint 期间的写写冲突', 'Increase retry count and delay to handle write-write conflicts during DuckDB WAL checkpoint'),
        (r'complete_task 最终failed', 'complete_task finally failed'),
        (r'标记Task为failed', 'Mark task as failed'),
        (r'Task执行failed', 'Task execution failed'),
        (r'fail_task 最终failed', 'fail_task finally failed'),
        (r'无论current status，强制将Task标记为failed（手动取消等场景）', 'Force mark task as failed regardless of current status (manual cancellation scenarios)'),
        (r'更新Task元数据failed', 'Failed to update task metadata'),
        (r'Force fail 遇到冲突但Task已处于终端status', 'Force fail encountered conflict but task is already in terminal status'),
        (r'视为成功', 'considered successful'),
        (r'force_fail_task 最终failed', 'force_fail_task finally failed'),
        (r'请求取消Task（设置取消标志 \+ 中断查询）', 'Request task cancellation (set cancellation flag + interrupt query)'),
        (r'将status更新为 CANCELLING', 'Update status to CANCELLING'),
        (r'调用 connection_registry\.interrupt\(\) 中断查询', 'Call connection_registry.interrupt() to interrupt query'),
        (r'更新取消元数据', 'Update cancellation metadata'),
        (r'Task取消请求已设置', 'Task cancellation request set'),
        (r'原因', 'reason'),
        (r'已中断Task %s 的查询执行', 'Interrupted query execution for task %s'),
        (r'Task %s 不在注册表中（可能completed或尚未开始）', 'Task %s not in registry (possibly completed or not started yet)'),
        (r'中断Task %s failed', 'Failed to interrupt task %s'),
        (r'更新取消元数据failed', 'Failed to update cancellation metadata'),
        (r'Task status does not allow cancellation或Task does not exist', 'Task status does not allow cancellation or task does not exist'),
        (r'标记Task为cancelled（最终status）', 'Mark task as cancelled (final status)'),
        (r'在捕获 duckdb\.InterruptException 后调用此方法', 'Call this method after catching duckdb.InterruptException'),
        (r'取消原因', 'Cancellation reason'),
        (r'查询被中断', 'Query interrupted'),
        (r'查询开始时间以计算执行时长', 'Query start time to calculate execution duration'),
        (r'标记Task为cancelled', 'Mark task as cancelled'),
        (r'Task已取消', 'Task cancelled'),
        (r'gettingTask列表', 'Get task list'),
        (r'gettingTask详情', 'Get task details'),
        (r'updatingTask', 'Update task'),
        (r'deletingTask', 'Delete task'),
        (r'清理过期Task', 'Clean up expired tasks'),
        (r'清理了 %d 个过期Task', 'Cleaned up %d expired tasks'),
        (r'清理过期Taskfailed', 'Failed to clean up expired tasks'),
        (r'gettingTask统计info', 'Get task statistics'),
        (r'导出Task记录', 'Export task records'),
        (r'gettingTask导出记录', 'Get task export records'),
        (r'清理过期导出记录', 'Clean up expired export records'),
        (r'清理了 %d 个过期导出记录', 'Cleaned up %d expired export records'),
        (r'清理过期导出记录failed', 'Failed to clean up expired export records'),
    ]
    
    for pattern, replacement in replacements:
        if re.search(pattern, content):
            content = re.sub(pattern, replacement, content)
            replacements_count += 1
            print(f"  ✓ Replaced: {pattern[:50]}...")
    
    if content != original_content:
        file_path.write_text(content, encoding='utf-8')
        return replacements_count
    return 0

def main():
    print("Starting comprehensive Chinese message replacement...\n")
    
    # List of files to process
    files_to_process = [
        "api/core/services/task_manager.py",
        "api/core/database/database_manager.py",
        "api/core/services/visual_query_generator.py",
        "api/core/database/metadata_manager.py",
        "api/core/common/config_manager.py",
    ]
    
    total_replacements = 0
    updated_files = 0
    
    for file_path_str in files_to_process:
        file_path = Path(file_path_str)
        print(f"\nProcessing: {file_path}")
        count = replace_chinese_in_file(file_path)
        if count > 0:
            total_replacements += count
            updated_files += 1
            print(f"✓ Updated: {file_path} ({count} replacements)")
        else:
            print(f"  No changes needed: {file_path}")
    
    print(f"\n{'='*60}")
    print(f"Replacement complete!")
    print(f"Updated {updated_files} files")
    print(f"Total replacements: {total_replacements}")
    print(f"{'='*60}")

if __name__ == "__main__":
    main()
