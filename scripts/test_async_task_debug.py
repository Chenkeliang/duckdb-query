#!/usr/bin/env python3
"""
异步任务调试脚本
用于触发异步任务并收集详细日志，排查写写冲突问题
"""

import requests
import time
import json
import sys

BASE_URL = "http://localhost:8000"

def submit_async_query(sql: str, custom_table_name: str = None):
    """提交异步查询任务"""
    payload = {
        "sql": sql,
        "task_type": "query"
    }
    if custom_table_name:
        payload["custom_table_name"] = custom_table_name
    
    response = requests.post(f"{BASE_URL}/api/async_query", json=payload)
    return response.json()

def get_task_status(task_id: str):
    """获取任务状态"""
    response = requests.get(f"{BASE_URL}/api/async_tasks/{task_id}")
    return response.json()

def wait_for_task(task_id: str, timeout: int = 60):
    """等待任务完成"""
    start_time = time.time()
    while time.time() - start_time < timeout:
        result = get_task_status(task_id)
        if result.get("success"):
            task = result.get("task", {})
            status = task.get("status")
            print(f"  任务状态: {status}")
            if status in ("completed", "failed"):
                return task
        time.sleep(1)
    return None

def main():
    print("=" * 60)
    print("异步任务调试测试")
    print("=" * 60)
    
    # 简单的测试 SQL
    test_sql = "SELECT 1 as id, 'test' as name"
    table_name = f"debug_test_{int(time.time())}"
    
    print(f"\n1. 提交异步任务")
    print(f"   SQL: {test_sql}")
    print(f"   表名: {table_name}")
    
    result = submit_async_query(test_sql, table_name)
    print(f"   响应: {json.dumps(result, ensure_ascii=False, indent=2)}")
    
    if not result.get("success"):
        print("   ❌ 提交失败")
        return 1
    
    task_id = result.get("task_id")
    print(f"   ✓ 任务ID: {task_id}")
    
    print(f"\n2. 等待任务完成...")
    task = wait_for_task(task_id)
    
    if task:
        print(f"\n3. 任务结果:")
        print(f"   状态: {task.get('status')}")
        print(f"   错误: {task.get('error_message', '无')}")
        if task.get("result_info"):
            print(f"   结果信息: {json.dumps(task.get('result_info'), ensure_ascii=False, indent=4)}")
        
        if task.get("status") == "completed":
            print("\n   ✓ 任务成功完成")
            return 0
        else:
            print("\n   ❌ 任务失败")
            return 1
    else:
        print("\n   ❌ 任务超时")
        return 1

if __name__ == "__main__":
    sys.exit(main())
