#!/usr/bin/env python3
"""
调试文件列表API问题
"""

import os
import requests
import json

def debug_file_list():
    """调试文件列表问题"""
    
    print("🔍 调试文件列表API问题")
    print("=" * 50)
    
    # 1. 检查当前目录结构
    print("1. 检查目录结构:")
    print(f"   当前工作目录: {os.getcwd()}")
    
    # 查找所有temp_files目录
    temp_dirs = []
    for root, dirs, files in os.walk('.'):
        if 'temp_files' in dirs:
            temp_dir_path = os.path.join(root, 'temp_files')
            temp_dirs.append(temp_dir_path)
    
    print(f"   找到的temp_files目录: {temp_dirs}")
    
    # 检查每个目录的内容
    for temp_dir in temp_dirs:
        abs_path = os.path.abspath(temp_dir)
        print(f"   {abs_path}:")
        if os.path.exists(temp_dir):
            files = os.listdir(temp_dir)
            print(f"     文件: {files}")
        else:
            print("     目录不存在")
    
    print()
    
    # 2. 模拟API的路径计算
    print("2. 模拟API路径计算:")
    api_file = "api/routers/data_sources.py"
    api_temp_dir = os.path.join(os.path.dirname(os.path.dirname(api_file)), "temp_files")
    print(f"   API文件路径: {api_file}")
    print(f"   API计算的temp_dir: {os.path.abspath(api_temp_dir)}")
    print(f"   该目录存在: {os.path.exists(api_temp_dir)}")
    
    if os.path.exists(api_temp_dir):
        files = os.listdir(api_temp_dir)
        print(f"   该目录文件: {files}")
    
    print()
    
    # 3. 测试API响应
    print("3. 测试API响应:")
    try:
        response = requests.get("http://localhost:8000/api/list_files")
        if response.status_code == 200:
            files = response.json()
            print(f"   API返回状态: {response.status_code}")
            print(f"   API返回文件数: {len(files)}")
            print(f"   API返回文件列表: {files}")
        else:
            print(f"   API返回错误: {response.status_code}")
            print(f"   错误内容: {response.text}")
    except Exception as e:
        print(f"   API请求失败: {str(e)}")
    
    print()
    
    # 4. 检查是否有缓存或其他问题
    print("4. 可能的问题分析:")
    
    # 检查是否有其他地方存储了文件列表
    possible_cache_files = [
        "file_cache.json",
        "data_sources.json", 
        ".file_list_cache",
        "api/file_cache.json"
    ]
    
    for cache_file in possible_cache_files:
        if os.path.exists(cache_file):
            print(f"   发现可能的缓存文件: {cache_file}")
            try:
                with open(cache_file, 'r') as f:
                    content = f.read()[:200]  # 只读前200字符
                    print(f"     内容预览: {content}")
            except:
                print(f"     无法读取文件内容")
    
    # 检查是否有环境变量影响
    env_vars = ['TEMP_DIR', 'DATA_DIR', 'UPLOAD_DIR']
    for var in env_vars:
        value = os.environ.get(var)
        if value:
            print(f"   环境变量 {var}: {value}")
    
    print()
    print("🔧 建议解决方案:")
    print("1. 重启后端服务器")
    print("2. 清除可能的缓存")
    print("3. 检查API代码中的路径计算")
    print("4. 使用前端的刷新按钮")

if __name__ == "__main__":
    debug_file_list()
