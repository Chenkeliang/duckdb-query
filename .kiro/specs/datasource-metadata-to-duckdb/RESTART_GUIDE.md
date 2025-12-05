# 应用重启指南

## 🎯 问题说明

清理完成后，如果仍然看到以下错误：
```
加载应用配置失败: AppConfig.__init__() got an unexpected keyword argument 'enable_pivot_tables'
应用DuckDB配置时出错: Parser Error: Unrecognized print format true
```

**原因**：应用还在运行，使用的是旧的内存配置。

## ✅ 解决方案

### 方法 1：重启应用（推荐）

1. **停止当前运行的应用**
   ```bash
   # 如果使用 Ctrl+C 停止
   # 或者找到进程并杀死
   ps aux | grep uvicorn
   kill <PID>
   ```

2. **清理 Python 缓存**
   ```bash
   find api -name "__pycache__" -type d -exec rm -rf {} +
   find api -name "*.pyc" -delete
   ```

3. **重新启动应用**
   ```bash
   cd api
   source .venv/bin/activate
   python -m uvicorn main:app --reload
   ```

### 方法 2：使用 Docker（如果适用）

```bash
# 停止容器
docker-compose down

# 清理缓存
docker-compose build --no-cache

# 重新启动
docker-compose up
```

## 🔍 验证配置

在重启前，可以验证配置文件是否正确：

```bash
# 检查配置文件
python3 << 'EOF'
import json

with open('config/app-config.json', 'r') as f:
    config = json.load(f)

# 检查关键配置
print("=== 配置验证 ===")
print(f"enable_pivot_tables: {config.get('enable_pivot_tables', '✅ 不存在')}")
print(f"pivot_table_extension: {config.get('pivot_table_extension', '✅ 不存在')}")
print(f"duckdb_enable_profiling: {config.get('duckdb_enable_profiling')}")

# 验证
if 'enable_pivot_tables' not in config and \
   'pivot_table_extension' not in config and \
   config.get('duckdb_enable_profiling') == 'query_tree':
    print("\n✅ 配置文件正确，可以重启应用")
else:
    print("\n❌ 配置文件有问题")
EOF
```

## 📊 预期结果

重启后，应用启动日志应该：

### ✅ 正常日志
```
INFO: Started server process
INFO: Waiting for application startup.
应用正在启动...
检查是否需要数据迁移...
无需数据迁移，配置已在 DuckDB 中
开始加载数据库连接配置...
从 DuckDB 加载 X 个数据库连接
数据库连接配置加载完成，共 X 个连接
所有数据源加载完成
文件清理调度器启动成功
INFO: Application startup complete.
```

### ❌ 不应该出现的错误
- ❌ `enable_pivot_tables` 参数错误
- ❌ `pivot_table` 404 错误
- ❌ `profiling` 格式错误
- ❌ 迁移相关日志

## 🎉 验证成功

如果看到以下情况，说明清理成功：

1. ✅ 应用正常启动，无错误
2. ✅ 不生成任何 JSON 配置文件
3. ✅ 数据库连接正常工作
4. ✅ 文件数据源正常工作
5. ✅ 所有功能正常

## 📝 故障排查

如果重启后仍有问题：

### 1. 检查是否有多个配置文件
```bash
find . -name "app-config*.json" -type f | grep -v node_modules
```

### 2. 检查所有配置文件内容
```bash
for file in $(find . -name "app-config*.json" -type f | grep -v node_modules); do
    echo "=== $file ==="
    grep -E "enable_pivot|pivot_table|duckdb_enable_profiling" "$file" || echo "未找到相关配置"
done
```

### 3. 检查环境变量
```bash
env | grep -i pivot
env | grep -i duckdb
```

### 4. 完全清理并重启
```bash
# 停止应用
pkill -f uvicorn

# 清理所有缓存
find . -name "__pycache__" -type d -exec rm -rf {} + 2>/dev/null
find . -name "*.pyc" -delete 2>/dev/null

# 重新启动
cd api
source .venv/bin/activate
python -m uvicorn main:app --reload
```

## 💡 提示

- 如果使用 `--reload` 模式，修改配置文件后应该会自动重启
- 如果使用生产模式，需要手动重启
- Docker 环境需要重新构建镜像

---

**文档创建时间**: 2024-12-04  
**状态**: ✅ 配置已清理，等待重启验证
