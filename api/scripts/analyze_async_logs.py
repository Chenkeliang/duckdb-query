#!/usr/bin/env python3
"""
异步任务写冲突日志分析工具

用法:
    python analyze_async_logs.py [日志文件路径]
    
如果不指定日志文件，默认读取 ../logs/async_debug.log
"""

import re
import sys
from collections import defaultdict
from datetime import datetime
from typing import Dict, List, Optional, Tuple
from dataclasses import dataclass, field


@dataclass
class TaskEvent:
    """任务事件"""
    timestamp: datetime
    task_id: str
    event_type: str
    status_before: Optional[str] = None
    status_after: Optional[str] = None
    rows_affected: Optional[int] = None
    extra_info: str = ""
    raw_line: str = ""


@dataclass
class TaskTimeline:
    """任务时间线"""
    task_id: str
    events: List[TaskEvent] = field(default_factory=list)
    
    def add_event(self, event: TaskEvent):
        self.events.append(event)
        self.events.sort(key=lambda e: e.timestamp)
    
    def get_status_changes(self) -> List[Tuple[str, str, str]]:
        """获取状态变化列表: [(时间, 事件, 状态)]"""
        changes = []
        for event in self.events:
            if event.status_after:
                changes.append((
                    event.timestamp.strftime("%H:%M:%S.%f")[:-3],
                    event.event_type,
                    event.status_after
                ))
        return changes


class AsyncLogAnalyzer:
    """异步日志分析器"""
    
    # 日志模式匹配
    PATTERNS = {
        # [TASK_DEBUG] start_task 开始: task_id=xxx, 当前状态=xxx
        'start_task_begin': re.compile(
            r'\[TASK_DEBUG\] start_task 开始: task_id=([^,]+), 当前状态=(\S+)'
        ),
        # [TASK_DEBUG] start_task 完成: task_id=xxx, 更新后状态=xxx, 影响行数=xxx
        'start_task_end': re.compile(
            r'\[TASK_DEBUG\] start_task 完成: task_id=([^,]+), 更新后状态=(\S+), 影响行数=(\d+)'
        ),
        # [TASK_DEBUG] complete_task 开始: task_id=xxx, 当前状态=xxx
        'complete_task_begin': re.compile(
            r'\[TASK_DEBUG\] complete_task 开始: task_id=([^,]+), 当前状态=(\S+)'
        ),
        # [TASK_DEBUG] complete_task 成功/失败
        'complete_task_success': re.compile(
            r'\[TASK_DEBUG\] complete_task 成功: task_id=([^,]+), 更新后状态=(\S+)'
        ),
        'complete_task_fail': re.compile(
            r'\[TASK_DEBUG\] complete_task 失败: task_id=([^,]+), 当前状态=(\S+) \(期望 running\), 更新后状态=(\S+), 影响行数=(\d+)'
        ),
        # [TASK_DEBUG] force_fail_task 开始/完成/异常
        'force_fail_begin': re.compile(
            r'\[TASK_DEBUG\] force_fail_task 开始: task_id=([^,]+), 当前状态=(\S+)'
        ),
        'force_fail_end': re.compile(
            r'\[TASK_DEBUG\] force_fail_task 完成: task_id=([^,]+), 更新后状态=(\S+), 影响行数=(\d+)'
        ),
        'force_fail_error': re.compile(
            r'\[TASK_DEBUG\] force_fail_task 异常: task_id=([^,]+), error=(.+)'
        ),
        'force_fail_conflict': re.compile(
            r'\[TASK_DEBUG\] force_fail_task 冲突后查询: task_id=([^,]+), 当前状态=(\S+)'
        ),
        # [ASYNC_DEBUG] 异步任务开始/步骤
        'async_start': re.compile(
            r'\[ASYNC_DEBUG\] 异步任务开始: task_id=(\S+)'
        ),
        'async_step': re.compile(
            r'\[ASYNC_DEBUG\] \[([^\]]+)\] (步骤\d+: .+|调用 complete_task .+|complete_task .+)'
        ),
        # 写写冲突
        'write_conflict': re.compile(
            r'write-write conflict|TransactionContext Error'
        ),
    }
    
    # 时间戳模式
    TIMESTAMP_PATTERN = re.compile(
        r'(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2},\d{3})'
    )
    
    def __init__(self):
        self.tasks: Dict[str, TaskTimeline] = defaultdict(lambda: TaskTimeline(task_id=""))
        self.conflicts: List[TaskEvent] = []
        self.raw_lines: List[str] = []
    
    def parse_timestamp(self, line: str) -> Optional[datetime]:
        """解析日志时间戳"""
        match = self.TIMESTAMP_PATTERN.search(line)
        if match:
            try:
                return datetime.strptime(match.group(1), "%Y-%m-%d %H:%M:%S,%f")
            except ValueError:
                return None
        return None
    
    def parse_line(self, line: str) -> Optional[TaskEvent]:
        """解析单行日志"""
        timestamp = self.parse_timestamp(line)
        if not timestamp:
            return None
        
        # 检查各种模式
        for pattern_name, pattern in self.PATTERNS.items():
            match = pattern.search(line)
            if match:
                groups = match.groups()
                
                if pattern_name == 'start_task_begin':
                    return TaskEvent(
                        timestamp=timestamp,
                        task_id=groups[0],
                        event_type='START_TASK_BEGIN',
                        status_before=groups[1],
                        raw_line=line
                    )
                
                elif pattern_name == 'start_task_end':
                    return TaskEvent(
                        timestamp=timestamp,
                        task_id=groups[0],
                        event_type='START_TASK_END',
                        status_after=groups[1],
                        rows_affected=int(groups[2]),
                        raw_line=line
                    )
                
                elif pattern_name == 'complete_task_begin':
                    return TaskEvent(
                        timestamp=timestamp,
                        task_id=groups[0],
                        event_type='COMPLETE_TASK_BEGIN',
                        status_before=groups[1],
                        raw_line=line
                    )
                
                elif pattern_name == 'complete_task_success':
                    return TaskEvent(
                        timestamp=timestamp,
                        task_id=groups[0],
                        event_type='COMPLETE_TASK_SUCCESS',
                        status_after=groups[1],
                        raw_line=line
                    )
                
                elif pattern_name == 'complete_task_fail':
                    return TaskEvent(
                        timestamp=timestamp,
                        task_id=groups[0],
                        event_type='COMPLETE_TASK_FAIL',
                        status_before=groups[1],
                        status_after=groups[2],
                        rows_affected=int(groups[3]),
                        extra_info=f"期望 running, 实际 {groups[1]}",
                        raw_line=line
                    )
                
                elif pattern_name == 'force_fail_begin':
                    return TaskEvent(
                        timestamp=timestamp,
                        task_id=groups[0],
                        event_type='FORCE_FAIL_BEGIN',
                        status_before=groups[1],
                        raw_line=line
                    )
                
                elif pattern_name == 'force_fail_end':
                    return TaskEvent(
                        timestamp=timestamp,
                        task_id=groups[0],
                        event_type='FORCE_FAIL_END',
                        status_after=groups[1],
                        rows_affected=int(groups[2]),
                        raw_line=line
                    )
                
                elif pattern_name == 'force_fail_error':
                    event = TaskEvent(
                        timestamp=timestamp,
                        task_id=groups[0],
                        event_type='FORCE_FAIL_ERROR',
                        extra_info=groups[1][:100],
                        raw_line=line
                    )
                    self.conflicts.append(event)
                    return event
                
                elif pattern_name == 'force_fail_conflict':
                    return TaskEvent(
                        timestamp=timestamp,
                        task_id=groups[0],
                        event_type='FORCE_FAIL_CONFLICT_CHECK',
                        status_after=groups[1],
                        raw_line=line
                    )
                
                elif pattern_name == 'async_start':
                    return TaskEvent(
                        timestamp=timestamp,
                        task_id=groups[0],
                        event_type='ASYNC_START',
                        raw_line=line
                    )
                
                elif pattern_name == 'async_step':
                    return TaskEvent(
                        timestamp=timestamp,
                        task_id=groups[0],
                        event_type='ASYNC_STEP',
                        extra_info=groups[1],
                        raw_line=line
                    )
        
        # 检查写写冲突
        if self.PATTERNS['write_conflict'].search(line):
            # 尝试从上下文提取 task_id
            task_id_match = re.search(r'task_id[=:]?\s*([a-f0-9-]{36})', line, re.IGNORECASE)
            task_id = task_id_match.group(1) if task_id_match else "UNKNOWN"
            event = TaskEvent(
                timestamp=timestamp,
                task_id=task_id,
                event_type='WRITE_CONFLICT',
                extra_info=line[-100:],
                raw_line=line
            )
            self.conflicts.append(event)
            return event
        
        return None
    
    def analyze_file(self, filepath: str):
        """分析日志文件"""
        print(f"\n{'='*60}")
        print(f"📁 分析日志文件: {filepath}")
        print(f"{'='*60}\n")
        
        try:
            with open(filepath, 'r', encoding='utf-8') as f:
                self.raw_lines = f.readlines()
        except FileNotFoundError:
            print(f"❌ 文件不存在: {filepath}")
            return
        except Exception as e:
            print(f"❌ 读取文件失败: {e}")
            return
        
        # 解析所有行
        event_count = 0
        for line in self.raw_lines:
            event = self.parse_line(line.strip())
            if event:
                event_count += 1
                if event.task_id != "UNKNOWN":
                    self.tasks[event.task_id].task_id = event.task_id
                    self.tasks[event.task_id].add_event(event)
        
        print(f"📊 解析统计:")
        print(f"   - 总行数: {len(self.raw_lines)}")
        print(f"   - 解析事件数: {event_count}")
        print(f"   - 任务数: {len(self.tasks)}")
        print(f"   - 冲突事件数: {len(self.conflicts)}")
        
        # 分析各任务
        self._analyze_tasks()
        
        # 分析冲突
        self._analyze_conflicts()
    
    def _analyze_tasks(self):
        """分析各任务时间线"""
        if not self.tasks:
            print("\n⚠️ 未发现任何任务事件")
            return
        
        print(f"\n{'='*60}")
        print("📋 任务时间线分析")
        print(f"{'='*60}")
        
        for task_id, timeline in sorted(self.tasks.items(), key=lambda x: x[1].events[0].timestamp if x[1].events else datetime.min):
            if not timeline.events:
                continue
            
            print(f"\n🔹 任务: {task_id[:8]}...")
            print(f"   事件数: {len(timeline.events)}")
            
            # 找出异常状态变化
            status_history = []
            for event in timeline.events:
                time_str = event.timestamp.strftime("%H:%M:%S.%f")[:-3]
                
                if event.event_type == 'START_TASK_BEGIN':
                    print(f"   [{time_str}] 🟡 start_task 开始 (当前: {event.status_before})")
                    status_history.append(('before_start', event.status_before))
                
                elif event.event_type == 'START_TASK_END':
                    marker = "✅" if event.rows_affected > 0 else "❌"
                    print(f"   [{time_str}] {marker} start_task 完成 (状态: {event.status_after}, 影响行: {event.rows_affected})")
                    status_history.append(('after_start', event.status_after))
                
                elif event.event_type == 'COMPLETE_TASK_BEGIN':
                    print(f"   [{time_str}] 🟡 complete_task 开始 (当前: {event.status_before})")
                    status_history.append(('before_complete', event.status_before))
                
                elif event.event_type == 'COMPLETE_TASK_SUCCESS':
                    print(f"   [{time_str}] ✅ complete_task 成功 (状态: {event.status_after})")
                    status_history.append(('after_complete', event.status_after))
                
                elif event.event_type == 'COMPLETE_TASK_FAIL':
                    print(f"   [{time_str}] ❌ complete_task 失败!")
                    print(f"              期望状态: running")
                    print(f"              实际状态: {event.status_before}")
                    print(f"              更新后: {event.status_after}")
                    status_history.append(('complete_fail', event.status_before))
                
                elif event.event_type == 'FORCE_FAIL_BEGIN':
                    print(f"   [{time_str}] 🟠 force_fail_task 开始 (当前: {event.status_before})")
                
                elif event.event_type == 'FORCE_FAIL_END':
                    marker = "✅" if event.rows_affected > 0 else "⚠️"
                    print(f"   [{time_str}] {marker} force_fail_task 完成 (状态: {event.status_after}, 影响行: {event.rows_affected})")
                
                elif event.event_type == 'FORCE_FAIL_ERROR':
                    print(f"   [{time_str}] 💥 force_fail_task 异常!")
                    print(f"              {event.extra_info[:80]}...")
                
                elif event.event_type == 'WRITE_CONFLICT':
                    print(f"   [{time_str}] 💥 写写冲突!")
                
                elif event.event_type == 'ASYNC_STEP':
                    print(f"   [{time_str}] 📝 {event.extra_info}")
            
            # 检测状态异常
            self._detect_anomalies(task_id, status_history)
    
    def _detect_anomalies(self, task_id: str, status_history: List[Tuple[str, str]]):
        """检测状态异常"""
        anomalies = []
        
        for i, (phase, status) in enumerate(status_history):
            if phase == 'before_start' and status != 'queued':
                anomalies.append(f"start_task 前状态不是 queued，而是 {status}")
            
            if phase == 'after_start' and status != 'running':
                anomalies.append(f"start_task 后状态不是 running，而是 {status}")
            
            if phase == 'before_complete' and status != 'running':
                anomalies.append(f"complete_task 开始时状态不是 running，而是 {status}")
            
            if phase == 'complete_fail':
                # 查找是谁改变了状态
                anomalies.append(f"complete_task 失败，状态被改为 {status}")
        
        if anomalies:
            print(f"\n   ⚠️ 检测到异常:")
            for a in anomalies:
                print(f"      - {a}")
    
    def _analyze_conflicts(self):
        """分析冲突"""
        if not self.conflicts:
            print(f"\n{'='*60}")
            print("✅ 未发现写写冲突")
            print(f"{'='*60}")
            return
        
        print(f"\n{'='*60}")
        print("💥 写写冲突分析")
        print(f"{'='*60}")
        
        for i, conflict in enumerate(self.conflicts, 1):
            print(f"\n冲突 #{i}:")
            print(f"   时间: {conflict.timestamp}")
            print(f"   任务: {conflict.task_id}")
            print(f"   类型: {conflict.event_type}")
            if conflict.extra_info:
                print(f"   详情: {conflict.extra_info[:100]}")
            
            # 查找冲突前后的事件
            if conflict.task_id in self.tasks:
                timeline = self.tasks[conflict.task_id]
                conflict_time = conflict.timestamp
                
                # 找出冲突前后 1 秒的事件
                nearby_events = [
                    e for e in timeline.events
                    if abs((e.timestamp - conflict_time).total_seconds()) < 1
                ]
                
                if nearby_events:
                    print(f"   近期事件:")
                    for e in nearby_events:
                        delta_ms = (e.timestamp - conflict_time).total_seconds() * 1000
                        print(f"      [{delta_ms:+.0f}ms] {e.event_type} ({e.status_before or ''} -> {e.status_after or ''})")
    
    def print_summary(self):
        """打印总结"""
        print(f"\n{'='*60}")
        print("📊 分析总结")
        print(f"{'='*60}")
        
        # 统计各状态的任务
        success_count = 0
        fail_count = 0
        conflict_count = 0
        unknown_count = 0
        
        for task_id, timeline in self.tasks.items():
            has_success = any(e.event_type == 'COMPLETE_TASK_SUCCESS' for e in timeline.events)
            has_fail = any(e.event_type == 'COMPLETE_TASK_FAIL' for e in timeline.events)
            has_conflict = any(e.event_type in ('WRITE_CONFLICT', 'FORCE_FAIL_ERROR') for e in timeline.events)
            
            if has_success:
                success_count += 1
            elif has_conflict:
                conflict_count += 1
            elif has_fail:
                fail_count += 1
            else:
                unknown_count += 1
        
        print(f"\n任务统计:")
        print(f"   ✅ 成功: {success_count}")
        print(f"   ❌ 失败 (状态不匹配): {fail_count}")
        print(f"   💥 冲突: {conflict_count}")
        print(f"   ❓ 未知: {unknown_count}")
        
        if self.conflicts:
            print(f"\n💡 建议:")
            print("   1. 检查是否有并发请求修改同一任务")
            print("   2. 检查前端是否有自动取消逻辑")
            print("   3. 检查是否有超时清理机制")
            print("   4. 查看 complete_task 失败时的状态变化时间点")


def main():
    """主函数"""
    # 默认日志路径
    default_log = "../logs/async_debug.log"
    
    if len(sys.argv) > 1:
        log_file = sys.argv[1]
    else:
        log_file = default_log
    
    analyzer = AsyncLogAnalyzer()
    analyzer.analyze_file(log_file)
    analyzer.print_summary()
    
    print("\n" + "="*60)
    print("分析完成。如需查看原始日志，请检查:", log_file)
    print("="*60 + "\n")


if __name__ == "__main__":
    main()
