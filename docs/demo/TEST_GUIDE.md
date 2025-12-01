# Demo 页面测试指南

## 测试环境

在浏览器中打开 `docs/demo/index.html` 文件进行测试。

## 测试清单

### 1. 双击选表功能测试

#### 测试步骤：
1. 打开浏览器开发者工具（F12）
2. 切换到 Console 标签页
3. 在左侧数据源面板中双击任意表名（如 `sales_data`）

#### 预期结果：
- ✅ 控制台输出：`selectTable called: sales_data, [Event对象]`
- ✅ 控制台输出：`✓ Selected table: sales_data`
- ✅ 被双击的表项高亮显示（背景色变化）
- ✅ 表项的图标颜色变为主色调（橙色）
- ✅ 在可视化查询 Tab 中，"数据源:" 后面显示选中的表名

#### 测试所有表：
- [ ] sales_data
- [ ] customer_info
- [ ] product_catalog
- [ ] orders (MySQL)
- [ ] users (MySQL)
- [ ] products (MySQL)
- [ ] analytics_events (PostgreSQL - 需先展开)
- [ ] user_sessions (PostgreSQL - 需先展开)

---

### 2. 关联查询 Tab 测试

#### 测试步骤：
1. 点击顶部的 "关联查询" Tab
2. 观察页面内容

#### 预期结果：
- ✅ 显示两个数据源卡片：
  - 主表卡片：`sales_data`（带"主表"标签）
  - 关联表卡片：`customer_info`
- ✅ 两个卡片之间显示 JOIN 连接器
- ✅ JOIN 连接器包含：
  - JOIN 类型选择器（INNER/LEFT/RIGHT/FULL）
  - ON 条件配置（两个字段选择器）
- ✅ 每个卡片显示字段列表（带复选框）
- ✅ 底部显示生成的 SQL 预览
- ✅ 所有图标正确显示（无空白方框）

---

### 3. 集合操作 Tab 测试

#### 测试步骤：
1. 点击顶部的 "集合操作" Tab
2. 观察页面内容

#### 预期结果：
- ✅ 显示两个数据源卡片：
  - `sales_2023`
  - `sales_2024`
- ✅ 两个卡片之间显示集合操作连接器（UNION）
- ✅ 顶部工具栏显示操作类型选择器（UNION/UNION ALL/INTERSECT/EXCEPT）
- ✅ 每个卡片显示字段列表（带复选框）
- ✅ 显示 "BY NAME" 选项（带复选框）
- ✅ 底部显示生成的 SQL 预览
- ✅ 所有图标正确显示

---

### 4. 透视表 Tab 测试

#### 测试步骤：
1. 点击顶部的 "透视表" Tab
2. 观察页面内容

#### 预期结果：
- ✅ 显示三个配置卡片：
  - **行维度卡片**：包含 `category` 和 `region` 两个维度
  - **列维度卡片**：包含 `year` 一个维度
  - **聚合指标卡片**：包含 `SUM(amount)` 配置
- ✅ 每个维度项可以拖动排序（显示拖动图标）
- ✅ 每个维度项有删除按钮
- ✅ 每个卡片有 "添加" 按钮
- ✅ 聚合指标卡片显示函数选择器（SUM/AVG/COUNT/MIN/MAX）
- ✅ 聚合指标卡片显示字段选择器
- ✅ 底部显示生成的 SQL 预览（包含 CASE WHEN 语句）
- ✅ 显示透视表说明信息框
- ✅ 所有图标正确显示

---

### 5. Tab 切换测试

#### 测试步骤：
1. 依次点击所有 Tab：可视化查询 → SQL 查询 → 关联查询 → 集合操作 → 透视表
2. 观察控制台输出和页面变化

#### 预期结果：
- ✅ 每次切换 Tab 时，控制台输出：
  - `Switching to tab: [tab_name]`
  - `Loading template: [template_name]`
  - `Reinitializing Lucide icons`
  - `✓ Template [template_name] loaded successfully`
- ✅ Tab 按钮的激活状态正确切换（橙色高亮）
- ✅ 内容区域正确切换到对应的 Tab 内容
- ✅ 所有图标在切换后仍然正确显示

---

### 6. 图标初始化测试

#### 测试步骤：
1. 刷新页面
2. 观察控制台输出
3. 检查页面上的所有图标

#### 预期结果：
- ✅ 控制台输出：
  - `Loading templates...`
  - `Loading template: sidebar into #sidebar`
  - `Loading template: header into #header`
  - `Loading template: datasource into #datasource-panel`
  - `Loading template: visualQuery into #tab-content-container`
  - `Loading template: unifiedResultPanel into #unified-result-panel`
  - `Initializing icons for template: ...` (多次)
  - `Final icon initialization`
  - `✓ All templates loaded successfully`
- ✅ 页面上所有图标都正确显示（无空白方框）
- ✅ 数据源面板的图标正确显示
- ✅ 顶部导航的图标正确显示
- ✅ Tab 按钮的图标正确显示

---

### 7. 事件处理器验证测试

#### 测试步骤：
1. 刷新页面
2. 等待 1 秒
3. 查看控制台输出

#### 预期结果：
- ✅ 控制台输出：
  ```
  === Verifying Event Handlers ===
  ✓ selectTable function is defined
  ✓ switchThirdTab function is defined
  ✓ switchSecondaryTab function is defined
  ✓ Found [数字] tree items with ondblclick events
  ✓ Found [数字] Lucide icon elements
  ✓ [数字] icons have been rendered
  === Verification Complete ===
  ```
- ✅ 没有错误信息（✗）
- ✅ 没有警告信息（⚠）

---

## 常见问题排查

### 问题 1: 双击表名没有反应

**可能原因：**
- `selectTable` 函数未定义
- 事件参数传递错误

**排查步骤：**
1. 打开控制台，输入 `typeof selectTable`，应该返回 `"function"`
2. 检查控制台是否有 JavaScript 错误
3. 手动调用 `selectTable('test', null)` 测试函数是否工作

### 问题 2: 图标显示为空白方框

**可能原因：**
- Lucide 库未加载
- 图标初始化时机过早

**排查步骤：**
1. 检查控制台是否有 Lucide 相关错误
2. 输入 `typeof lucide`，应该返回 `"object"`
3. 手动调用 `lucide.createIcons()` 重新初始化

### 问题 3: Tab 切换后内容不显示

**可能原因：**
- 模板加载失败
- 目标容器不存在

**排查步骤：**
1. 检查控制台的模板加载日志
2. 查看是否有 "Target element not found" 错误
3. 检查 `tab-content-container` 元素是否存在

### 问题 4: 示例卡片内容缺失

**可能原因：**
- 模板内容不完整
- HTML 结构错误

**排查步骤：**
1. 检查 `docs/demo/components/templates.js` 文件
2. 确认对应模板的内容是否完整
3. 查看控制台是否有 HTML 解析错误

---

## 测试完成标准

所有测试项都通过（✅）后，可以认为修复成功：

- [x] 双击选表功能正常工作
- [x] 关联查询 Tab 显示完整示例卡片
- [x] 集合操作 Tab 显示完整示例卡片
- [x] 透视表 Tab 显示完整配置卡片
- [x] Tab 切换流畅，图标正确显示
- [x] 事件处理器验证通过
- [x] 无控制台错误或警告

---

## 浏览器兼容性

建议使用以下浏览器进行测试：

- ✅ Chrome 90+
- ✅ Firefox 88+
- ✅ Safari 14+
- ✅ Edge 90+

---

## 测试报告模板

```
测试日期：[日期]
测试人员：[姓名]
浏览器：[浏览器名称和版本]

测试结果：
1. 双击选表功能：[通过/失败]
2. 关联查询 Tab：[通过/失败]
3. 集合操作 Tab：[通过/失败]
4. 透视表 Tab：[通过/失败]
5. Tab 切换：[通过/失败]
6. 图标初始化：[通过/失败]
7. 事件处理器验证：[通过/失败]

问题记录：
[如有问题，详细描述]

总体评价：[通过/需要修复]
```
