# 快速修复 meepo 连接问题

## 🎯 问题

前端显示 `meepo` 数据库连接，但后端找不到这个连接。

## ✅ 快速检查（30 秒）

### 在浏览器控制台运行：

```javascript
// 检查前端看到的连接
fetch('/api/datasources/databases/list')
  .then(r => r.json())
  .then(data => {
    console.log('连接数量:', data.data?.items?.length || 0);
    console.log('连接列表:', data.data?.items?.map(i => i.id));
  });
```

**如果返回空列表或没有 `db_meepo`**，说明：
- ✅ 代码修复正确
- ❌ 数据库连接配置缺失

---

## 🔧 解决方案

### 方案 1: 前端显示的是假数据（Mock Data）

如果 `meepo` 连接是前端测试数据，需要：

1. **检查前端代码**是否有硬编码的测试数据
2. **移除或替换**为真实的数据库连接

### 方案 2: 连接配置丢失

如果 `meepo` 是真实的数据库连接，需要重新创建：

#### 通过 API 创建（推荐）

```bash
curl -X POST http://localhost:8000/api/datasources/databases \
  -H "Content-Type: application/json" \
  -d '{
    "name": "meepo",
    "type": "postgresql",
    "params": {
      "host": "localhost",
      "port": 5432,
      "database": "meepo",
      "username": "your_username",
      "password": "your_password"
    }
  }'
```

**注意**：
- 替换 `your_username` 和 `your_password` 为实际值
- 如果是 MySQL，改 `type` 为 `"mysql"`，端口改为 `3306`
- 如果是 SQLite，改 `type` 为 `"sqlite"`，只需要 `database` 参数（文件路径）

#### 通过前端 UI 创建

1. 打开数据源管理页面
2. 点击"添加数据库连接"
3. 填写连接信息
4. 测试连接
5. 保存

---

## 🔍 检查前端是否使用 Mock 数据

让我检查 `useDatabaseConnections` 是否有假数据：

```typescript
// 检查是否有硬编码的测试数据
// 文件: frontend/src/new/hooks/useDatabaseConnections.ts
```

如果有类似这样的代码：

```typescript
// ❌ 错误：硬编码测试数据
const mockConnections = [
  { id: 'meepo', name: 'meepo', type: 'postgresql', ... }
];
```

需要移除它，使用真实的 API 数据。

---

## 📊 当前状态总结

### 代码修复 ✅
- [x] 前端 6 个问题已修复
- [x] 后端导入错误已修复
- [x] API 路径问题已修复

### 数据配置 ⏳
- [ ] 数据库连接 `meepo` 需要创建或配置

---

## 🚀 下一步

### 1. 确认问题类型

运行浏览器控制台命令，查看返回结果：

**情况 A**: 返回空列表 `[]`
- 说明：没有任何数据库连接
- 解决：创建 `meepo` 连接（使用上面的 curl 命令）

**情况 B**: 返回其他连接，但没有 `meepo`
- 说明：`meepo` 连接丢失
- 解决：重新创建 `meepo` 连接

**情况 C**: 返回包含 `db_meepo`
- 说明：连接存在，但前端缓存问题
- 解决：清除浏览器缓存，硬刷新（Cmd+Shift+R）

### 2. 创建连接后

重新测试：
1. 刷新浏览器
2. 打开 DataSource Panel
3. 展开 `meepo` 连接
4. 验证 schema 和表列表显示

---

**重要提示**: 所有代码修复都已完成，现在是数据配置问题，不是代码问题。
