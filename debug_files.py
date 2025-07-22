#!/usr/bin/env python3
import os
import json


def debug_temp_files():
    temp_dir = os.path.join("api", "temp_files")
    print(f"检查目录: {os.path.abspath(temp_dir)}")
    print(f"目录存在: {os.path.exists(temp_dir)}")

    if os.path.exists(temp_dir):
        all_items = os.listdir(temp_dir)
        print(f"所有项目: {all_items}")

        verified_files = []
        for filename in all_items:
            file_path = os.path.join(temp_dir, filename)
            is_file = os.path.isfile(file_path)
            is_readable = os.access(file_path, os.R_OK)
            try:
                file_size = os.path.getsize(file_path) if is_file else 0
            except:
                file_size = 0

            print(f"文件: {filename}")
            print(f"  路径: {file_path}")
            print(f"  是文件: {is_file}")
            print(f"  可读: {is_readable}")
            print(f"  大小: {file_size}")
            print(f"  验证通过: {is_file and is_readable and file_size > 0}")
            print()

            if is_file and is_readable and file_size > 0:
                verified_files.append(filename)

        print(f"最终验证文件列表: {verified_files}")

        # 检查0711.xlsx是否存在
        target_file = "0711.xlsx"
        target_path = os.path.join(temp_dir, target_file)
        print(f"\n特别检查 {target_file}:")
        print(f"  完整路径: {os.path.abspath(target_path)}")
        print(f"  存在: {os.path.exists(target_path)}")
        if os.path.exists(target_path):
            print(f"  大小: {os.path.getsize(target_path)}")


if __name__ == "__main__":
    debug_temp_files()
