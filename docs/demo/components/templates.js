// 所有组件模板定义
const Templates = {
  // Sidebar模板
  sidebar: `
    <!-- Logo -->
    <div class="h-14 flex items-center gap-3 px-5 border-b border-border">
      <div class="w-8 h-8 bg-primary rounded-lg flex items-center justify-center text-white font-bold shadow-lg">
        D
      </div>
      <div class="sidebar-text">
        <div class="font-bold text-sm tracking-wide text-foreground">DuckQuery</div>
        <div class="text-[10px] text-muted-fg font-mono">v2.0 Preview</div>
      </div>
    </div>

    <!-- 导航菜单 -->
    <nav class="flex-1 p-3 space-y-1 overflow-hidden">
      <button class="w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-lg transition-all border border-transparent text-muted-fg hover:text-foreground hover:bg-surface-hover" title="数据源管理">
        <i data-lucide="database" class="w-4 h-4 shrink-0"></i>
        <span class="sidebar-text truncate">数据源管理</span>
      </button>
      <button class="w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-lg nav-active transition-all border" title="数据查询">
        <i data-lucide="search" class="w-4 h-4 shrink-0"></i>
        <span class="sidebar-text truncate">数据查询</span>
      </button>
    </nav>

    <!-- 底部操作 -->
    <div class="p-3 border-t border-border space-y-2">
      <div class="grid grid-cols-2 gap-2">
        <button class="flex items-center justify-center rounded-lg border border-border bg-surface px-2 py-2 text-xs text-muted-fg hover:bg-surface-hover" title="切换主题">
          <i data-lucide="sun" class="w-4 h-4"></i>
        </button>
        <button class="flex items-center justify-center rounded-lg border border-border bg-surface px-2 py-2 text-xs text-muted-fg hover:bg-surface-hover" title="切换语言">
          <i data-lucide="languages" class="w-4 h-4"></i>
        </button>
      </div>
    </div>
  `,

  // Header模板
  header: `
    <div class="flex items-center gap-6">
      <h1 class="text-lg font-semibold">数据查询</h1>
      <div class="flex bg-muted/50 p-1 rounded-lg h-9 border border-border gap-1">
        <button class="tab-btn active text-xs" onclick="switchSecondaryTab('query')">
          <i data-lucide="search" class="w-3 h-3"></i>
          查询模式
        </button>
        <button class="tab-btn text-xs" onclick="switchSecondaryTab('tasks')">
          <i data-lucide="clock" class="w-3 h-3"></i>
          异步任务
        </button>
      </div>
    </div>

    <div class="flex items-center gap-2">
      <button class="px-3 py-1.5 text-sm rounded-md border border-border hover:bg-surface-hover">
        <i data-lucide="save" class="w-4 h-4 inline mr-1"></i>
        保存查询
      </button>
      <button class="px-3 py-1.5 text-sm rounded-md border border-border hover:bg-surface-hover">
        <i data-lucide="download" class="w-4 h-4 inline mr-1"></i>
        导出
      </button>
    </div>
  `,

  // 数据源面板模板
  datasource: `
    <!-- 顶部：标题 + 折叠按钮 -->
    <div class="h-12 flex items-center justify-between px-6 border-b border-border shrink-0">
      <h2 class="text-sm font-semibold text-foreground datasource-title">数据源</h2>
      <button onclick="toggleDataSourcePanel()" class="p-1.5 rounded-lg hover:bg-surface-hover transition-colors" title="折叠/展开数据源面板" id="datasource-toggle-btn">
        <i data-lucide="panel-left-close" class="w-4 h-4 text-muted-fg"></i>
      </button>
    </div>

    <!-- 搜索框 -->
    <div class="h-12 px-6 border-b border-border shrink-0 flex items-center">
      <div class="relative w-full">
        <i data-lucide="search" class="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-fg"></i>
        <input type="text" placeholder="搜索表名或字段..." class="duck-input pl-9 text-sm h-9 w-full" />
      </div>
    </div>

    <!-- 数据源树 -->
    <div class="flex-1 overflow-auto px-6 py-2" id="datasource-tree">
      <!-- DuckDB 表 -->
      <div class="mb-4">
        <div class="flex items-center gap-2 px-2 py-1.5 text-xs font-semibold text-muted-fg">
          <i data-lucide="chevron-down" class="w-3 h-3"></i>
          <span>DuckDB 表</span>
        </div>
        <div class="mt-1 space-y-0.5">
          <div class="tree-item selected" ondblclick="selectTable('sales_data', event)">
            <i data-lucide="table" class="w-4 h-4 text-primary shrink-0"></i>
            <span class="item-name">sales_data</span>
          </div>
          <div class="tree-item" ondblclick="selectTable('customer_info', event)">
            <i data-lucide="table" class="w-4 h-4 text-muted-fg shrink-0"></i>
            <span class="item-name">customer_info</span>
          </div>
          <div class="tree-item" ondblclick="selectTable('product_catalog', event)">
            <i data-lucide="table" class="w-4 h-4 text-muted-fg shrink-0"></i>
            <span class="item-name">product_catalog</span>
          </div>
        </div>
      </div>

      <!-- 外部数据库 -->
      <div class="mb-4">
        <div class="flex items-center gap-2 px-2 py-1.5 text-xs font-semibold text-muted-fg cursor-pointer hover:text-foreground transition-colors" onclick="toggleExternalDb()">
          <i data-lucide="chevron-down" class="w-3 h-3" id="external-db-chevron"></i>
          <span>外部数据库</span>
        </div>
        <div class="mt-1 space-y-0.5" id="external-db-list">
          <!-- MySQL 连接 -->
          <div class="space-y-0.5">
            <div class="tree-item cursor-pointer" onclick="toggleMysqlTables(event)">
              <i data-lucide="chevron-down" class="w-3 h-3 text-muted-fg shrink-0" id="mysql-chevron"></i>
              <i data-lucide="database" class="w-4 h-4 text-muted-fg shrink-0"></i>
              <span class="item-name">MySQL - 生产库</span>
              <span class="w-2 h-2 rounded-full bg-success shrink-0"></span>
            </div>
            <div class="ml-6 space-y-0.5" id="mysql-tables">
              <div class="tree-item" ondblclick="selectTable('orders', event)">
                <i data-lucide="table" class="w-4 h-4 text-muted-fg shrink-0"></i>
                <span class="item-name">orders</span>
              </div>
              <div class="tree-item" ondblclick="selectTable('users', event)">
                <i data-lucide="table" class="w-4 h-4 text-muted-fg shrink-0"></i>
                <span class="item-name">users</span>
              </div>
              <div class="tree-item" ondblclick="selectTable('products', event)">
                <i data-lucide="table" class="w-4 h-4 text-muted-fg shrink-0"></i>
                <span class="item-name">products</span>
              </div>
            </div>
          </div>

          <!-- PostgreSQL 连接 -->
          <div class="space-y-0.5">
            <div class="tree-item cursor-pointer" onclick="togglePostgresTables(event)">
              <i data-lucide="chevron-right" class="w-3 h-3 text-muted-fg shrink-0" id="postgres-chevron"></i>
              <i data-lucide="database" class="w-4 h-4 text-muted-fg shrink-0"></i>
              <span class="item-name">PostgreSQL - 分析库</span>
              <span class="w-2 h-2 rounded-full bg-muted-fg shrink-0"></span>
            </div>
            <div class="ml-6 space-y-0.5 hidden" id="postgres-tables">
              <div class="tree-item" ondblclick="selectTable('analytics_events', event)">
                <i data-lucide="table" class="w-4 h-4 text-muted-fg shrink-0"></i>
                <span class="item-name">analytics_events</span>
              </div>
              <div class="tree-item" ondblclick="selectTable('user_sessions', event)">
                <i data-lucide="table" class="w-4 h-4 text-muted-fg shrink-0"></i>
                <span class="item-name">user_sessions</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 快速操作 -->
    <div class="px-6 py-3 border-t border-border flex gap-2 shrink-0 datasource-footer">
      <button class="flex-1 px-3 py-2 text-xs rounded-md border border-border hover:bg-surface-hover transition-colors">
        <i data-lucide="refresh-cw" class="w-3 h-3 inline mr-1"></i>
        刷新
      </button>
      <button class="flex-1 px-3 py-2 text-xs rounded-md border border-border hover:bg-surface-hover transition-colors">
        <i data-lucide="plus" class="w-3 h-3 inline mr-1"></i>
        添加
      </button>
    </div>

    <!-- 横向拖拽边框 -->
    <div class="border-r border-border"></div>
  `,

  // 可视化查询Tab模板
  visualQuery: `
    <div class="flex-1 flex-col overflow-hidden bg-surface" style="display: flex;">
      <!-- 查询构建器 -->
      <div class="bg-surface flex flex-col overflow-hidden" style="flex: 1; min-height: 0;">
        <!-- 数据源选择行 -->
        <div class="h-12 px-6 border-b border-border shrink-0 flex items-center justify-between gap-3">
          <div class="flex items-center gap-2 text-sm flex-1 min-w-0">
            <i data-lucide="table" class="w-4 h-4 text-primary"></i>
            <span class="text-muted-fg">数据源:</span>
            <span class="font-semibold" id="selected-table-name">sales_data</span>
            <span class="text-xs text-muted-fg px-2 py-0.5 bg-muted rounded ml-2">双击左侧切换</span>
          </div>
          <div class="flex gap-2 shrink-0">
            <button class="px-4 h-9 bg-primary text-primary-fg rounded-md text-sm font-medium hover:opacity-90 transition-opacity flex items-center gap-1.5" title="执行查询" onclick="executeVisualQuery()">
              <i data-lucide="play" class="w-4 h-4"></i>
              执行
            </button>
            <button class="px-4 h-9 border border-border rounded-md text-sm font-medium hover:bg-surface-hover transition-colors flex items-center gap-1.5" title="保存为表">
              <i data-lucide="save" class="w-4 h-4"></i>
              保存
            </button>
          </div>
        </div>

        <!-- 查询构建器内容 (左右布局) -->
        <div class="flex-1 overflow-hidden flex">
          <!-- 左侧：模式切换卡片 -->
          <div class="w-64 border-r border-border overflow-auto p-4 space-y-3 bg-muted/20">
            <div class="text-xs font-semibold text-muted-fg mb-3 px-2">查询构建模式</div>

            <!-- 字段选择卡片 -->
            <div class="query-mode-card active" onclick="switchQueryMode('fields')" id="mode-fields">
              <div class="flex items-center gap-3">
                <div class="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                  <i data-lucide="columns" class="w-4 h-4 text-primary"></i>
                </div>
                <div class="flex-1 min-w-0">
                  <div class="font-medium text-sm">字段选择</div>
                  <div class="text-xs text-muted-fg">SELECT</div>
                </div>
                <div class="text-xs bg-success/20 text-success px-2 py-0.5 rounded">启用</div>
              </div>
            </div>

            <!-- 筛选条件卡片 -->
            <div class="query-mode-card" onclick="switchQueryMode('filter')" id="mode-filter">
              <div class="flex items-center gap-3">
                <div class="w-8 h-8 rounded-lg bg-muted flex items-center justify-center">
                  <i data-lucide="filter" class="w-4 h-4 text-muted-fg"></i>
                </div>
                <div class="flex-1 min-w-0">
                  <div class="font-medium text-sm">筛选条件</div>
                  <div class="text-xs text-muted-fg">WHERE</div>
                </div>
              </div>
            </div>

            <!-- 分组聚合卡片 -->
            <div class="query-mode-card" onclick="switchQueryMode('group')" id="mode-group">
              <div class="flex items-center gap-3">
                <div class="w-8 h-8 rounded-lg bg-muted flex items-center justify-center">
                  <i data-lucide="layers" class="w-4 h-4 text-muted-fg"></i>
                </div>
                <div class="flex-1 min-w-0">
                  <div class="font-medium text-sm">分组聚合</div>
                  <div class="text-xs text-muted-fg">GROUP BY</div>
                </div>
              </div>
            </div>

            <!-- 排序卡片 -->
            <div class="query-mode-card" onclick="switchQueryMode('sort')" id="mode-sort">
              <div class="flex items-center gap-3">
                <div class="w-8 h-8 rounded-lg bg-muted flex items-center justify-center">
                  <i data-lucide="arrow-up-down" class="w-4 h-4 text-muted-fg"></i>
                </div>
                <div class="flex-1 min-w-0">
                  <div class="font-medium text-sm">排序</div>
                  <div class="text-xs text-muted-fg">ORDER BY</div>
                </div>
              </div>
            </div>

            <!-- 限制结果卡片 -->
            <div class="query-mode-card" onclick="switchQueryMode('limit')" id="mode-limit">
              <div class="flex items-center gap-3">
                <div class="w-8 h-8 rounded-lg bg-muted flex items-center justify-center">
                  <i data-lucide="list" class="w-4 h-4 text-muted-fg"></i>
                </div>
                <div class="flex-1 min-w-0">
                  <div class="font-medium text-sm">限制结果</div>
                  <div class="text-xs text-muted-fg">LIMIT</div>
                </div>
                <div class="text-xs bg-success/20 text-success px-2 py-0.5 rounded">启用</div>
              </div>
            </div>
          </div>

          <!-- 右侧：动态内容区 -->
          <div class="flex-1 overflow-auto p-6 space-y-4" id="query-mode-contents">
            <!-- 字段选择模式 -->
            <div id="content-fields" class="query-mode-content" style="display: block;">
              <div class="mb-4">
                <h3 class="text-base font-semibold flex items-center gap-2">
                  <i data-lucide="columns" class="w-5 h-5 text-primary"></i>
                  字段选择
                </h3>
                <p class="text-sm text-muted-fg mt-1">选择要在查询结果中显示的列</p>
              </div>
              <div class="space-y-2">
                <label class="flex items-center gap-2 px-3 py-2 rounded hover:bg-surface-hover cursor-pointer">
                  <input type="checkbox" checked class="accent-primary" />
                  <span class="text-sm">id</span>
                  <span class="text-xs text-muted-fg ml-auto">INTEGER</span>
                </label>
                <label class="flex items-center gap-2 px-3 py-2 rounded hover:bg-surface-hover cursor-pointer">
                  <input type="checkbox" checked class="accent-primary" />
                  <span class="text-sm">name</span>
                  <span class="text-xs text-muted-fg ml-auto">VARCHAR</span>
                </label>
                <label class="flex items-center gap-2 px-3 py-2 rounded hover:bg-surface-hover cursor-pointer">
                  <input type="checkbox" checked class="accent-primary" />
                  <span class="text-sm">amount</span>
                  <span class="text-xs text-muted-fg ml-auto">DOUBLE</span>
                </label>
              </div>
            </div>

            <!-- 生成的 SQL (固定在底部) -->
            <div class="mt-4 pt-4 border-t border-border">
              <label class="block text-sm font-medium mb-2">生成的 SQL</label>
              <div class="code-block">
                <span class="text-purple-400">SELECT</span> *<br />
                <span class="text-purple-400">FROM</span> sales_data<br />
                <span class="text-purple-400">LIMIT</span> 100
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,

  // SQL查询Tab模板
  sqlQuery: `
    <div class="flex-1 flex-col overflow-hidden bg-surface" style="display: flex;">
      <div class="bg-surface flex flex-col overflow-hidden" style="flex: 1; min-height: 0;">
        <div class="h-12 px-6 border-b border-border shrink-0 flex items-center justify-between bg-muted/20">
          <div class="flex items-center gap-3">
            <i data-lucide="code" class="w-4 h-4 text-primary"></i>
            <span class="text-sm font-medium">SQL 查询</span>
          </div>
          <button class="px-4 py-1.5 bg-primary text-white rounded-md text-sm font-medium hover:opacity-90 flex items-center gap-1.5">
            <i data-lucide="play" class="w-3.5 h-3.5"></i>
            执行
          </button>
        </div>
        
        <div class="flex-1 overflow-auto p-6">
          <div class="max-w-4xl mx-auto">
            <div class="bg-muted/30 border border-border rounded-xl p-6">
              <h3 class="text-base font-semibold mb-4">SQL 编辑器</h3>
              <p class="text-sm text-muted-fg mb-4">SQL查询功能开发中...</p>
              <div class="code-block">
                <span class="text-purple-400">SELECT</span> *<br />
                <span class="text-purple-400">FROM</span> sales_data<br />
                <span class="text-purple-400">LIMIT</span> 100
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,

  // 关联查询Tab模板
  joinQuery: `
    <div class="flex-1 flex-col overflow-hidden bg-surface" style="display: flex;">
      <div class="bg-surface flex flex-col overflow-hidden" style="flex: 1; min-height: 0;">
        <div class="h-12 px-6 border-b border-border shrink-0 flex items-center justify-between bg-muted/20">
          <div class="flex items-center gap-3">
            <i data-lucide="git-merge" class="w-4 h-4 text-primary"></i>
            <span class="text-sm font-medium">关联查询</span>
          </div>
          <button class="px-4 py-1.5 bg-primary text-white rounded-md text-sm font-medium hover:opacity-90 flex items-center gap-1.5">
            <i data-lucide="play" class="w-3.5 h-3.5"></i>
            执行
          </button>
        </div>
        
        <div class="flex-1 overflow-auto p-6">
          <div class="max-w-4xl mx-auto">
            <div class="bg-muted/30 border border-border rounded-xl p-6">
              <h3 class="text-base font-semibold mb-4">关联查询配置</h3>
              <p class="text-sm text-muted-fg">关联查询功能开发中...</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,

  // 集合操作Tab模板
  setOperations: `
    <div class="flex-1 flex-col overflow-hidden bg-surface" style="display: flex;">
      <div class="bg-surface flex flex-col overflow-hidden" style="flex: 1; min-height: 0;">
        <div class="h-12 px-6 border-b border-border shrink-0 flex items-center justify-between bg-muted/20">
          <div class="flex items-center gap-3">
            <i data-lucide="layers" class="w-4 h-4 text-primary"></i>
            <span class="text-sm font-medium">集合操作</span>
          </div>
          <button class="px-4 py-1.5 bg-primary text-white rounded-md text-sm font-medium hover:opacity-90 flex items-center gap-1.5">
            <i data-lucide="play" class="w-3.5 h-3.5"></i>
            执行
          </button>
        </div>
        
        <div class="flex-1 overflow-auto p-6">
          <div class="max-w-4xl mx-auto">
            <div class="bg-muted/30 border border-border rounded-xl p-6">
              <h3 class="text-base font-semibold mb-4">集合操作配置</h3>
              <p class="text-sm text-muted-fg">集合操作功能开发中...</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,

  // 透视表Tab模板
  pivotTable: `
    <div class="flex-1 flex-col overflow-hidden bg-surface" style="display: flex;">
      <div class="bg-surface flex flex-col overflow-hidden" style="flex: 1; min-height: 0;">
        <div class="h-12 px-6 border-b border-border shrink-0 flex items-center justify-between bg-muted/20">
          <div class="flex items-center gap-3">
            <i data-lucide="table-2" class="w-4 h-4 text-primary"></i>
            <span class="text-sm font-medium">透视表</span>
          </div>
          <button class="px-4 py-1.5 bg-primary text-white rounded-md text-sm font-medium hover:opacity-90 flex items-center gap-1.5">
            <i data-lucide="play" class="w-3.5 h-3.5"></i>
            执行
          </button>
        </div>
        
        <div class="flex-1 overflow-auto p-6">
          <div class="max-w-4xl mx-auto">
            <div class="bg-muted/30 border border-border rounded-xl p-6">
              <h3 class="text-base font-semibold mb-4">透视表配置</h3>
              <p class="text-sm text-muted-fg">透视表功能开发中...</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,

  // 统一结果面板模板
  unifiedResultPanel: `
    <div class="flex flex-col flex-1 min-h-0 overflow-hidden bg-surface">
      <div class="flex flex-col flex-1 min-h-0 overflow-hidden">
        <!-- 工具栏 -->
        <div class="result-toolbar sticky top-0 z-sticky border-t-0">
          <i data-lucide="table" class="w-3.5 h-3.5"></i>
          <span class="font-medium">查询结果</span>
          <span class="opacity-60">·</span>
          <span id="result-row-count">0 行</span>
          <span class="opacity-60">·</span>
          <span id="result-col-count">0 列</span>
          <div class="flex-1"></div>
          <span class="text-xs opacity-60" id="result-exec-time">执行时间: --</span>
          <button class="px-2 py-1 rounded hover:bg-surface text-xs flex items-center gap-1" title="导出">
            <i data-lucide="download" class="w-3 h-3"></i>
          </button>
          <button class="px-2 py-1 rounded hover:bg-surface text-xs flex items-center gap-1" title="刷新">
            <i data-lucide="refresh-cw" class="w-3 h-3"></i>
          </button>
        </div>

        <!-- 表格区域 -->
        <div class="result-scroll-area overflow-x-auto overflow-y-auto" id="unified-table-container">
          <table class="ide-table">
            <thead>
              <tr>
                <th>id</th>
                <th>name</th>
                <th>value</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>1</td>
                <td>示例数据</td>
                <td>100</td>
              </tr>
              <tr>
                <td>2</td>
                <td>示例数据</td>
                <td>200</td>
              </tr>
              <tr>
                <td>3</td>
                <td>示例数据</td>
                <td>300</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `
};

// 模板加载器
const TemplateLoader = {
  // 从模板加载内容到目标元素
  loadTemplate(templateKey, targetId) {
    const target = document.getElementById(targetId);
    const template = Templates[templateKey];
    
    if (!target) {
      console.error(`Target element #${targetId} not found`);
      return false;
    }
    
    if (!template) {
      console.error(`Template "${templateKey}" not found`);
      return false;
    }
    
    target.innerHTML = template;
    return true;
  },

  // 初始化所有基础组件
  init() {
    console.log('Loading templates...');
    
    // 加载基础组件
    this.loadTemplate('sidebar', 'sidebar');
    this.loadTemplate('header', 'header');
    this.loadTemplate('datasource', 'datasource-panel');
    
    // 加载默认Tab（可视化查询）
    this.loadTemplate('visualQuery', 'tab-content-container');
    
    // 加载统一结果面板
    this.loadTemplate('unifiedResultPanel', 'unified-result-panel');
    
    // 初始化Lucide图标
    if (typeof lucide !== 'undefined') {
      lucide.createIcons();
    }
    
    console.log('All templates loaded successfully');
  }
};

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', () => {
  TemplateLoader.init();
});
