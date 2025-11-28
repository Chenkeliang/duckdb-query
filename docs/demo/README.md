# DuckQuery Demo - 模块化版本（Template方案）

## ✅ 已完成

- ✅ 基于Template的模块化架构
- ✅ 统一结果面板（所有Tab共享）
- ✅ 可视化查询Tab（基础版）
- ✅ Sidebar、Header、数据源面板
- ✅ 查询模式切换功能
- ✅ 结果面板折叠/展开功能

## 📁 文件结构

```
docs/demo/
├── index.html                      # 主入口文件
├── styles/
│   └── main.css                   # 所有CSS样式
├── scripts/
│   ├── loader.js                  # 组件加载器
│   └── main.js                    # 主要JavaScript逻辑
└── components/
    ├── sidebar.html               # 侧边栏导航
    ├── header.html                # 顶部Header
    ├── datasource-panel.html      # 数据源面板
    └── tabs/
        ├── visual-query.html      # 可视化查询Tab
        ├── sql-query.html         # SQL查询Tab
        ├── join-query.html        # 关联查询Tab
        ├── set-operations.html    # 集合操作Tab
        └── pivot-table.html       # 透视表Tab
```

## 🚀 使用方法

### 本地开发

由于使用了`fetch` API加载组件，需要通过HTTP服务器访问：

```bash
# 方法1: 使用Python
cd docs/demo
python -m http.server 8000

# 方法2: 使用Node.js (需要安装http-server)
cd docs/demo
npx http-server -p 8000

# 方法3: 使用VS Code Live Server插件
# 右键index.html -> Open with Live Server
```

然后访问: `http://localhost:8000`

## ✨ 特性

### 模块化设计
- **组件分离**: 每个UI组件独立为单独的HTML文件
- **样式集中**: 所有CSS集中在`styles/main.css`
- **逻辑分离**: JavaScript分为加载器和业务逻辑

### 动态加载
- 使用`fetch` API动态加载组件
- 按需加载Tab内容，提升性能
- 自动初始化Lucide图标

### 易于维护
- 修改某个Tab不影响其他部分
- 清晰的文件结构
- 便于团队协作

## 🔧 开发指南

### 添加新Tab

1. 在`components/tabs/`创建新的HTML文件
2. 在`scripts/main.js`的`tabFiles`对象中添加映射
3. 在`index.html`的三级Tab导航中添加按钮

### 修改样式

所有样式集中在`styles/main.css`，使用CSS变量系统：

```css
/* 修改主题色 */
:root {
  --dq-primary: 221.2 83.2% 53.3%;  /* 蓝色 */
}

.dark {
  --dq-primary: 24.6 95% 53.1%;     /* 橙色 */
}
```

### 添加新功能

在`scripts/main.js`中添加全局函数，组件HTML中可以直接调用。

## 📝 注意事项

1. **必须通过HTTP服务器访问**，直接打开HTML文件会因为CORS限制无法加载组件
2. **图标初始化**: 组件加载后需要调用`lucide.createIcons()`重新初始化图标
3. **状态管理**: 当前使用简单的全局状态对象`AppState`，后续可以升级为更复杂的状态管理方案

## 🎯 下一步计划

- [ ] 完善各个Tab的功能实现
- [ ] 添加统一的结果面板组件
- [ ] 实现数据源面板的拖拽调整
- [ ] 添加更多交互功能
- [ ] 优化加载性能

## 🐛 已知问题

- 首次加载时图标可能需要短暂延迟才能正确显示
- 组件加载顺序可能影响某些交互功能

## 📄 License

MIT
