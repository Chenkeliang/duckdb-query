# shadcn/ui 集成已知问题

## 📋 当前已知问题

### 1. 🟡 API 404/403 错误（非关键）

**错误信息**:
```
Failed to load resource: 403/404
/api/server_files?path=%2Fapp%2Fserver_mounts
/api/server_files?path=%2Fapp%2Fhost_downloads
```

**原因**:
- 后端服务器没有配置 `server_mounts` 或 `host_downloads` 目录
- 这是 SQLite 服务器浏览功能的可选特性
- API 路径是正确的，只是服务器端没有这些挂载点

**影响**:
- ✅ 不影响核心功能
- ✅ 只影响 SQLite 的服务器文件浏览功能
- ✅ 用户仍可以通过其他方式上传 SQLite 文件

**解决方案**:

#### 选项 1: 配置服务器挂载点（推荐）
在后端配置文件中添加挂载点：

```python
# api/config/settings.py 或环境变量
SERVER_MOUNTS = [
    {
        "name": "Server Mounts",
        "path": "/app/server_mounts",
        "description": "Server mounted files"
    },
    {
        "name": "Downloads",
        "path": "/app/host_downloads",
        "description": "Downloaded files"
    }
]
```

然后创建对应的目录：
```bash
mkdir -p /app/server_mounts
mkdir -p /app/host_downloads
```

#### 选项 2: 忽略错误（可接受）
- 这些错误不影响其他功能
- 用户可以通过文件上传使用 SQLite
- 可以在浏览器控制台忽略这些错误

#### 选项 3: 禁用服务器浏览功能
如果不需要服务器浏览功能，可以在 DatabaseForm 中禁用：

```typescript
// 在 DatabaseForm.tsx 中
const ENABLE_SERVER_BROWSE = false; // 设置为 false

// 然后在 useEffect 中检查
useEffect(() => {
  if (isSqlite && ENABLE_SERVER_BROWSE) {
    loadServerMounts();
  }
}, [isSqlite]);
```

---

### 2. 🟡 密码字段警告（非关键）

**警告信息**:
```
[DOM] Password field is not contained in a form
```

**原因**:
- 密码输入框没有包裹在 `<form>` 标签中
- 这是浏览器的安全建议，不是错误

**影响**:
- ✅ 不影响功能
- ✅ 只是浏览器控制台警告
- ⚠️ 浏览器可能不会提供密码自动填充

**解决方案**:

#### 选项 1: 添加 form 标签（推荐）
将 DatabaseForm 的内容包裹在 `<form>` 标签中：

```typescript
return (
  <Card className="shadow-sm">
    <CardContent className="p-8 space-y-6">
      <form onSubmit={(e) => { e.preventDefault(); handleTest(); }}>
        {/* 现有的表单内容 */}
        
        {/* 按钮组 */}
        <div className="flex gap-3 pt-4">
          <Button
            type="submit"  // 改为 submit
            disabled={testing || loading}
          >
            {testing ? t("actions.testing") : t("actions.testConnection")}
          </Button>
          <Button
            type="button"  // 明确指定 button
            onClick={handleSave}
            disabled={testing || loading}
          >
            {loading ? t("actions.saving") : t("actions.saveConnection")}
          </Button>
        </div>
      </form>
    </CardContent>
  </Card>
);
```

#### 选项 2: 忽略警告（可接受）
- 功能完全正常
- 只是浏览器的建议性警告
- 不影响用户体验

---

## 📊 问题优先级

### 🔴 高优先级（需要立即修复）
- 无

### 🟡 中优先级（建议修复）
1. 密码字段警告 - 添加 form 标签
2. API 404 错误 - 配置服务器挂载点或禁用功能

### 🟢 低优先级（可选）
- 无

---

## ✅ 验证功能正常

尽管有这些警告/错误，以下功能都是正常的：

### 核心功能 ✅
- ✅ 数据库连接配置（MySQL/PostgreSQL/SQLite）
- ✅ 连接测试
- ✅ 连接保存
- ✅ 文件上传
- ✅ 数据粘贴
- ✅ 已保存连接管理

### UI 组件 ✅
- ✅ 所有 shadcn/ui 组件正常工作
- ✅ 深色模式切换
- ✅ 响应式布局
- ✅ 键盘导航
- ✅ 可访问性

### TypeScript ✅
- ✅ 所有文件类型检查通过
- ✅ 构建成功
- ✅ 无类型错误

---

## 🔧 快速修复脚本

如果你想快速修复这些问题，可以运行：

### 修复密码字段警告
```bash
# 这需要手动编辑 DatabaseForm.tsx
# 添加 <form> 标签包裹表单内容
```

### 配置服务器挂载点
```bash
# 创建挂载目录
mkdir -p api/server_mounts
mkdir -p api/host_downloads

# 或者在 Docker 中
docker exec -it <container_name> mkdir -p /app/server_mounts
docker exec -it <container_name> mkdir -p /app/host_downloads
```

---

## 📝 总结

**当前状态**: ✅ 系统完全可用

这些问题都是**非关键性**的：
- API 404 错误：可选功能，不影响核心功能
- 密码字段警告：浏览器建议，不影响功能

**建议**:
1. 如果需要服务器浏览功能 → 配置挂载点
2. 如果想消除警告 → 添加 form 标签
3. 如果都不需要 → 可以忽略这些提示

**项目状态**: 🚀 可投入生产使用

---

**文档创建日期**: 2024-12-01  
**最后更新**: 2024-12-01  
**状态**: 📋 已记录
