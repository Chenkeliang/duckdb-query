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
        <button class="tab-btn active text-xs" onclick="switchSecondaryTab('query', event)">
          <i data-lucide="search" class="w-3 h-3"></i>
          查询模式
        </button>
        <button class="tab-btn text-xs" onclick="switchSecondaryTab('tasks', event)">
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
                <label class="flex items-center gap-2 px-3 py-2 rounded hover:bg-surface-hover cursor-pointer">
                  <input type="checkbox" class="accent-primary" />
                  <span class="text-sm">date</span>
                  <span class="text-xs text-muted-fg ml-auto">DATE</span>
                </label>
                <label class="flex items-center gap-2 px-3 py-2 rounded hover:bg-surface-hover cursor-pointer">
                  <input type="checkbox" class="accent-primary" />
                  <span class="text-sm">category</span>
                  <span class="text-xs text-muted-fg ml-auto">VARCHAR</span>
                </label>
              </div>
            </div>

            <!-- 筛选条件模式 -->
            <div id="content-filter" class="query-mode-content" style="display: none;">
              <div class="mb-4">
                <h3 class="text-base font-semibold flex items-center gap-2">
                  <i data-lucide="filter" class="w-5 h-5 text-primary"></i>
                  筛选条件
                </h3>
                <p class="text-sm text-muted-fg mt-1">添加 WHERE 条件过滤数据</p>
              </div>
              <div class="space-y-3">
                <!-- 条件 1 -->
                <div class="flex gap-2 items-center">
                  <select class="duck-input flex-1">
                    <option selected>amount</option>
                    <option>name</option>
                    <option>date</option>
                  </select>
                  <select class="duck-input w-24">
                    <option selected>></option>
                    <option>=</option>
                    <option>&lt;</option>
                    <option>>=</option>
                    <option>&lt;=</option>
                  </select>
                  <input type="text" class="duck-input flex-1" placeholder="1000" value="1000" />
                  <button class="px-3 py-2 text-xs rounded-md border border-border hover:bg-surface-hover text-error" title="删除">
                    <i data-lucide="x" class="w-4 h-4"></i>
                  </button>
                </div>
                <!-- 条件 2 -->
                <div class="flex gap-2 items-center">
                  <select class="duck-input flex-1">
                    <option>amount</option>
                    <option selected>date</option>
                    <option>name</option>
                  </select>
                  <select class="duck-input w-24">
                    <option>></option>
                    <option>=</option>
                    <option>&lt;</option>
                    <option selected>>=</option>
                    <option>&lt;=</option>
                  </select>
                  <input type="text" class="duck-input flex-1" placeholder="2024-01-01" value="'2024-01-01'" />
                  <button class="px-3 py-2 text-xs rounded-md border border-border hover:bg-surface-hover text-error" title="删除">
                    <i data-lucide="x" class="w-4 h-4"></i>
                  </button>
                </div>
                <button class="w-full py-2 border border-dashed border-primary/50 text-primary rounded text-sm hover:bg-primary/5">
                  <i data-lucide="plus" class="w-4 h-4 inline mr-1"></i>
                  添加条件
                </button>
              </div>
            </div>

            <!-- 分组聚合模式 -->
            <div id="content-group" class="query-mode-content" style="display: none;">
              <div class="mb-4">
                <h3 class="text-base font-semibold flex items-center gap-2">
                  <i data-lucide="layers" class="w-5 h-5 text-primary"></i>
                  分组聚合
                </h3>
                <p class="text-sm text-muted-fg mt-1">按字段分组并计算聚合值</p>
              </div>
              <div class="space-y-4">
                <!-- 分组字段 -->
                <div>
                  <label class="text-sm font-medium mb-2 block">分组字段 (GROUP BY)</label>
                  <div class="space-y-2">
                    <div class="flex items-center gap-2 p-2 bg-muted/30 rounded border border-border">
                      <i data-lucide="grip-vertical" class="w-4 h-4 text-muted-fg"></i>
                      <span class="text-sm flex-1">category</span>
                      <button class="text-error hover:bg-error/10 p-1 rounded" title="移除">
                        <i data-lucide="x" class="w-3 h-3"></i>
                      </button>
                    </div>
                    <button class="w-full py-2 border border-dashed border-primary/50 text-primary rounded text-sm hover:bg-primary/5">
                      <i data-lucide="plus" class="w-4 h-4 inline mr-1"></i>
                      添加分组字段
                    </button>
                  </div>
                </div>
                <!-- 聚合函数 -->
                <div>
                  <label class="text-sm font-medium mb-2 block">聚合函数</label>
                  <div class="space-y-2">
                    <div class="p-3 bg-muted/30 rounded border border-border">
                      <div class="flex gap-2 mb-2">
                        <select class="duck-input flex-1">
                          <option selected>SUM</option>
                          <option>AVG</option>
                          <option>COUNT</option>
                          <option>MIN</option>
                          <option>MAX</option>
                        </select>
                        <select class="duck-input flex-1">
                          <option selected>amount</option>
                          <option>quantity</option>
                          <option>price</option>
                        </select>
                        <button class="px-3 py-2 text-xs rounded-md border border-border hover:bg-surface-hover text-error" title="删除">
                          <i data-lucide="x" class="w-4 h-4"></i>
                        </button>
                      </div>
                      <input type="text" class="duck-input text-sm" placeholder="别名 (可选)" value="total_amount" />
                    </div>
                    <button class="w-full py-2 border border-dashed border-primary/50 text-primary rounded text-sm hover:bg-primary/5">
                      <i data-lucide="plus" class="w-4 h-4 inline mr-1"></i>
                      添加聚合函数
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <!-- 排序模式 -->
            <div id="content-sort" class="query-mode-content" style="display: none;">
              <div class="mb-4">
                <h3 class="text-base font-semibold flex items-center gap-2">
                  <i data-lucide="arrow-up-down" class="w-5 h-5 text-primary"></i>
                  排序
                </h3>
                <p class="text-sm text-muted-fg mt-1">设置结果排序规则</p>
              </div>
              <div class="space-y-2">
                <div class="flex items-center gap-2 p-2 bg-muted/30 rounded border border-border">
                  <i data-lucide="grip-vertical" class="w-4 h-4 text-muted-fg"></i>
                  <select class="duck-input flex-1">
                    <option selected>amount</option>
                    <option>name</option>
                    <option>date</option>
                  </select>
                  <select class="duck-input w-24">
                    <option selected>DESC</option>
                    <option>ASC</option>
                  </select>
                  <button class="text-error hover:bg-error/10 p-1 rounded" title="移除">
                    <i data-lucide="x" class="w-3 h-3"></i>
                  </button>
                </div>
                <button class="w-full py-2 border border-dashed border-primary/50 text-primary rounded text-sm hover:bg-primary/5">
                  <i data-lucide="plus" class="w-4 h-4 inline mr-1"></i>
                  添加排序字段
                </button>
              </div>
            </div>

            <!-- 限制结果模式 -->
            <div id="content-limit" class="query-mode-content" style="display: none;">
              <div class="mb-4">
                <h3 class="text-base font-semibold flex items-center gap-2">
                  <i data-lucide="list" class="w-5 h-5 text-primary"></i>
                  限制结果数
                </h3>
                <p class="text-sm text-muted-fg mt-1">限制返回的记录数量</p>
              </div>
              <div class="space-y-4">
                <div class="flex gap-3 items-center">
                  <label class="flex items-center gap-2">
                    <input type="checkbox" checked class="accent-primary" />
                    <span class="text-sm font-medium">启用 LIMIT</span>
                  </label>
                  <input type="number" class="duck-input w-32" placeholder="行数" value="100" min="1" />
                  <span class="text-xs text-muted-fg">行</span>
                </div>
                <div class="p-3 bg-muted/30 rounded-lg border border-border">
                  <div class="text-xs text-muted-fg mb-2">常用值</div>
                  <div class="flex gap-2">
                    <button class="px-3 py-1.5 text-xs rounded-md border border-border hover:bg-surface-hover">10</button>
                    <button class="px-3 py-1.5 text-xs rounded-md border border-border hover:bg-surface-hover">50</button>
                    <button class="px-3 py-1.5 text-xs rounded-md border border-border bg-primary/10 border-primary text-primary">100</button>
                    <button class="px-3 py-1.5 text-xs rounded-md border border-border hover:bg-surface-hover">500</button>
                    <button class="px-3 py-1.5 text-xs rounded-md border border-border hover:bg-surface-hover">1000</button>
                  </div>
                </div>
                <div class="p-3 bg-info/10 rounded-lg border border-info/30 flex items-start gap-2">
                  <i data-lucide="info" class="w-4 h-4 text-info flex-shrink-0 mt-0.5"></i>
                  <div class="text-xs text-muted-fg">
                    <strong class="text-foreground">提示：</strong>LIMIT 限制返回的最大行数，有助于提高查询性能和减少数据传输量。
                  </div>
                </div>
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
      <!-- SQL 编辑器区域 -->
      <div class="bg-surface flex flex-col overflow-hidden" style="flex: 1; min-height: 0;">
        <!-- 顶部工具栏 -->
        <div class="h-12 px-6 border-b border-border shrink-0 flex items-center justify-between bg-muted/20">
          <div class="flex items-center gap-3">
            <i data-lucide="code" class="w-4 h-4 text-primary"></i>
            <span class="text-sm font-medium">SQL 查询</span>
            <span class="text-xs text-muted-fg px-2 py-0.5 bg-muted rounded">双击左侧插入表名</span>
          </div>
          <div class="flex items-center gap-2">
            <button class="px-3 py-1.5 text-xs rounded-md border border-border hover:bg-surface-hover">
              <i data-lucide="file-text" class="w-3 h-3 inline mr-1"></i>
              模板
            </button>
            <button class="px-3 py-1.5 text-xs rounded-md border border-border hover:bg-surface-hover">
              <i data-lucide="wand-2" class="w-3 h-3 inline mr-1"></i>
              格式化
            </button>
            <button class="px-4 py-1.5 bg-primary text-white rounded-md text-sm font-medium hover:opacity-90 flex items-center gap-1.5">
              <i data-lucide="play" class="w-3.5 h-3.5"></i>
              执行
            </button>
          </div>
        </div>
        
        <!-- SQL 编辑器内容 -->
        <div class="flex-1 overflow-auto p-6 space-y-4">
          <!-- SQL 编辑器 -->
          <div class="flex flex-col">
            <textarea
              class="duck-input font-mono text-sm resize-none"
              placeholder="-- 输入 SQL 查询语句
SELECT * FROM sales_data
WHERE amount > 1000
ORDER BY date DESC
LIMIT 100;"
              style="min-height: 300px;"
            >SELECT name, amount, date
FROM sales_data
WHERE amount > 1000
  AND date >= '2024-01-01'
ORDER BY amount DESC
LIMIT 100;</textarea>
          </div>

          <!-- 快捷操作 -->
          <div class="flex items-center gap-3">
            <button class="px-4 py-2 border border-border rounded-md text-sm font-medium hover:bg-surface-hover flex items-center gap-2">
              <i data-lucide="save" class="w-4 h-4"></i>
              保存查询
            </button>
            <button class="px-4 py-2 border border-border rounded-md text-sm font-medium hover:bg-surface-hover flex items-center gap-2">
              <i data-lucide="eye" class="w-4 h-4"></i>
              查询计划
            </button>
            <div class="flex-1"></div>
            <div class="text-xs text-muted-fg">
              <i data-lucide="info" class="w-3 h-3 inline mr-1"></i>
              支持 DuckDB SQL 语法
            </div>
          </div>

          <!-- 查询历史 -->
          <div>
            <label class="text-sm font-semibold mb-2 block">查询历史</label>
            <div class="space-y-2">
              <div class="p-3 rounded-lg border border-border bg-muted/30 hover:border-primary/50 cursor-pointer transition-colors">
                <div class="flex items-start justify-between mb-1">
                  <code class="text-xs font-mono text-foreground">SELECT * FROM sales_data WHERE...</code>
                  <span class="text-xs text-muted-fg">2 分钟前</span>
                </div>
                <div class="flex items-center gap-3 text-xs text-muted-fg">
                  <span>✓ 成功</span>
                  <span>100 行</span>
                  <span>0.3s</span>
                </div>
              </div>
              <div class="p-3 rounded-lg border border-border bg-muted/30 hover:border-primary/50 cursor-pointer transition-colors">
                <div class="flex items-start justify-between mb-1">
                  <code class="text-xs font-mono text-foreground">SELECT category, SUM(amount)...</code>
                  <span class="text-xs text-muted-fg">5 分钟前</span>
                </div>
                <div class="flex items-center gap-3 text-xs text-muted-fg">
                  <span>✓ 成功</span>
                  <span>12 行</span>
                  <span>0.1s</span>
                </div>
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
      <!-- 查询配置区域 -->
      <div class="bg-surface flex flex-col overflow-hidden" style="flex: 1; min-height: 0;">
        <!-- 顶部工具栏 -->
        <div class="h-12 px-6 border-b border-border shrink-0 flex items-center justify-between bg-muted/20">
          <div class="flex items-center gap-3">
            <i data-lucide="git-merge" class="w-4 h-4 text-primary"></i>
            <span class="text-sm font-medium">关联查询</span>
            <span class="text-xs text-muted-fg px-2 py-0.5 bg-muted rounded">双击左侧数据源添加表</span>
          </div>
          <div class="flex items-center gap-2">
            <button class="px-3 py-1.5 text-xs rounded-md border border-border hover:bg-surface-hover text-muted-fg">
              <i data-lucide="trash-2" class="w-3 h-3 inline mr-1"></i>
              清空
            </button>
            <button class="px-4 py-1.5 bg-primary text-white rounded-md text-sm font-medium hover:opacity-90 flex items-center gap-1.5">
              <i data-lucide="play" class="w-3.5 h-3.5"></i>
              执行
            </button>
          </div>
        </div>

        <!-- 横向数据源卡片区域 -->
        <div class="flex-1 overflow-auto p-6">
          <!-- 已选择的表卡片 - 横向排列 -->
          <div class="flex items-start gap-4 min-h-[300px] pb-4">
            <!-- 空状态提示 -->
            <div class="flex-1 flex flex-col items-center justify-center text-center py-12 border-2 border-dashed border-border rounded-xl">
              <i data-lucide="git-merge" class="w-12 h-12 text-muted-fg mb-4"></i>
              <h3 class="text-sm font-medium mb-2">开始关联查询</h3>
              <p class="text-xs text-muted-fg max-w-xs">
                双击左侧数据源面板中的表来添加到关联查询。<br/>
                第一个添加的表将作为主表。
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,

  // 集合操作Tab模板
  setOperations: `
    <div class="flex-1 flex-col overflow-hidden bg-surface" style="display: flex;">
      <!-- 顶部工具栏 -->
      <div class="h-12 px-6 border-b border-border shrink-0 flex items-center justify-between bg-muted/20">
        <div class="flex items-center gap-3">
          <i data-lucide="layers" class="w-4 h-4 text-primary"></i>
          <span class="text-sm font-medium">集合操作</span>
          <span class="text-xs text-muted-fg px-2 py-0.5 bg-muted rounded">双击左侧数据源添加表</span>
        </div>
        <div class="flex items-center gap-2">
          <!-- 集合操作类型选择 -->
          <div class="flex bg-muted p-0.5 rounded-md h-8 gap-0.5">
            <button class="px-2.5 text-xs font-medium rounded bg-surface text-foreground shadow-sm">UNION</button>
            <button class="px-2.5 text-xs font-medium rounded text-muted-fg hover:text-foreground">UNION ALL</button>
            <button class="px-2.5 text-xs font-medium rounded text-muted-fg hover:text-foreground">INTERSECT</button>
            <button class="px-2.5 text-xs font-medium rounded text-muted-fg hover:text-foreground">EXCEPT</button>
          </div>
          <button class="px-3 py-1.5 text-xs rounded-md border border-border hover:bg-surface-hover text-muted-fg">
            <i data-lucide="trash-2" class="w-3 h-3 inline mr-1"></i>
            清空
          </button>
          <button class="px-4 py-1.5 bg-primary text-white rounded-md text-sm font-medium hover:opacity-90 flex items-center gap-1.5">
            <i data-lucide="play" class="w-3.5 h-3.5"></i>
            执行
          </button>
        </div>
      </div>

      <!-- 横向数据源卡片区域 -->
      <div class="flex-1 overflow-auto p-6">
        <!-- 已选择的表卡片 - 横向排列 -->
        <div class="flex items-start gap-4 min-h-[300px] pb-4">
          <!-- 空状态提示 -->
          <div class="flex-1 flex flex-col items-center justify-center text-center py-12 border-2 border-dashed border-border rounded-xl">
            <i data-lucide="layers" class="w-12 h-12 text-muted-fg mb-4"></i>
            <h3 class="text-sm font-medium mb-2">开始集合操作</h3>
            <p class="text-xs text-muted-fg max-w-xs">
              双击左侧数据源面板中的表来添加到集合操作。<br/>
              可以添加多个表进行 UNION / INTERSECT / EXCEPT 操作。
            </p>
          </div>
        </div>
      </div>
    </div>
  `,

  // 透视表Tab模板
  pivotTable: `
    <div class="flex-1 flex-col overflow-hidden bg-surface" style="display: flex;">
      <!-- 顶部工具栏 -->
      <div class="h-12 px-6 border-b border-border shrink-0 flex items-center justify-between bg-muted/20">
        <div class="flex items-center gap-3">
          <i data-lucide="table-2" class="w-4 h-4 text-primary"></i>
          <span class="text-sm font-medium">透视表</span>
          <span class="text-xs text-muted-fg">|</span>
          <span class="text-sm">数据源: <span class="font-semibold">sales_data</span></span>
          <span class="text-xs text-muted-fg px-2 py-0.5 bg-muted rounded">双击左侧切换</span>
        </div>
        <div class="flex items-center gap-2">
          <button class="px-3 py-1.5 text-xs rounded-md border border-border hover:bg-surface-hover text-muted-fg">
            <i data-lucide="trash-2" class="w-3 h-3 inline mr-1"></i>
            清空配置
          </button>
          <button class="px-4 py-1.5 bg-primary text-white rounded-md text-sm font-medium hover:opacity-90 flex items-center gap-1.5">
            <i data-lucide="play" class="w-3.5 h-3.5"></i>
            执行
          </button>
        </div>
      </div>
      
      <!-- 横向配置区域 -->
      <div class="flex-1 overflow-auto p-6">
        <!-- 配置卡片 - 横向排列 -->
        <div class="flex items-start gap-4 min-h-[300px] pb-4">
          
          <!-- 行维度卡片 -->
          <div class="datasource-card shrink-0" style="min-width: 260px; max-width: 280px;">
            <div class="p-3 border-b border-border flex items-center justify-between">
              <div class="flex items-center gap-2">
                <i data-lucide="rows" class="w-4 h-4 text-primary"></i>
                <span class="font-medium text-sm">行维度</span>
              </div>
              <span class="text-xs px-1.5 py-0.5 bg-primary/20 text-primary rounded">2</span>
            </div>
            <div class="p-3">
              <div class="text-xs text-muted-fg mb-3">作为表格的行分组</div>
              <div class="space-y-2 mb-3">
                <div class="flex items-center gap-2 p-2 bg-muted/30 rounded border border-border">
                  <i data-lucide="grip-vertical" class="w-3.5 h-3.5 text-muted-fg cursor-move"></i>
                  <span class="text-sm flex-1">category</span>
                  <button class="text-error hover:bg-error/10 p-1 rounded" title="移除">
                    <i data-lucide="x" class="w-3 h-3"></i>
                  </button>
                </div>
                <div class="flex items-center gap-2 p-2 bg-muted/30 rounded border border-border">
                  <i data-lucide="grip-vertical" class="w-3.5 h-3.5 text-muted-fg cursor-move"></i>
                  <span class="text-sm flex-1">region</span>
                  <button class="text-error hover:bg-error/10 p-1 rounded" title="移除">
                    <i data-lucide="x" class="w-3 h-3"></i>
                  </button>
                </div>
              </div>
              <button class="w-full py-2 border border-dashed border-primary/50 text-primary rounded text-xs hover:bg-primary/5">
                <i data-lucide="plus" class="w-3 h-3 inline mr-1"></i>
                添加行维度
              </button>
            </div>
          </div>

          <!-- 列维度卡片 -->
          <div class="datasource-card shrink-0" style="min-width: 260px; max-width: 280px;">
            <div class="p-3 border-b border-border flex items-center justify-between">
              <div class="flex items-center gap-2">
                <i data-lucide="columns" class="w-4 h-4 text-primary"></i>
                <span class="font-medium text-sm">列维度</span>
              </div>
              <span class="text-xs px-1.5 py-0.5 bg-primary/20 text-primary rounded">1</span>
            </div>
            <div class="p-3">
              <div class="text-xs text-muted-fg mb-3">作为表格的列分组</div>
              <div class="space-y-2 mb-3">
                <div class="flex items-center gap-2 p-2 bg-muted/30 rounded border border-border">
                  <i data-lucide="grip-vertical" class="w-3.5 h-3.5 text-muted-fg cursor-move"></i>
                  <span class="text-sm flex-1">year</span>
                  <button class="text-error hover:bg-error/10 p-1 rounded" title="移除">
                    <i data-lucide="x" class="w-3 h-3"></i>
                  </button>
                </div>
              </div>
              <button class="w-full py-2 border border-dashed border-primary/50 text-primary rounded text-xs hover:bg-primary/5">
                <i data-lucide="plus" class="w-3 h-3 inline mr-1"></i>
                添加列维度
              </button>
            </div>
          </div>

          <!-- 聚合指标卡片 -->
          <div class="datasource-card shrink-0" style="min-width: 280px; max-width: 320px;">
            <div class="p-3 border-b border-border flex items-center justify-between">
              <div class="flex items-center gap-2">
                <i data-lucide="sigma" class="w-4 h-4 text-primary"></i>
                <span class="font-medium text-sm">聚合指标</span>
              </div>
              <span class="text-xs px-1.5 py-0.5 bg-primary/20 text-primary rounded">1</span>
            </div>
            <div class="p-3">
              <div class="text-xs text-muted-fg mb-3">统计计算指标</div>
              <div class="space-y-2 mb-3">
                <div class="p-2 bg-muted/30 rounded border border-border">
                  <div class="flex items-center justify-between mb-2">
                    <span class="text-xs font-medium">总金额</span>
                    <button class="text-error hover:bg-error/10 p-1 rounded" title="移除">
                      <i data-lucide="x" class="w-3 h-3"></i>
                    </button>
                  </div>
                  <div class="flex gap-2">
                    <select class="duck-input text-xs flex-1 py-1">
                      <option selected>SUM</option>
                      <option>AVG</option>
                      <option>COUNT</option>
                      <option>MIN</option>
                      <option>MAX</option>
                    </select>
                    <select class="duck-input text-xs flex-1 py-1">
                      <option selected>amount</option>
                      <option>quantity</option>
                      <option>price</option>
                    </select>
                  </div>
                </div>
              </div>
              <button class="w-full py-2 border border-dashed border-primary/50 text-primary rounded text-xs hover:bg-primary/5">
                <i data-lucide="plus" class="w-3 h-3 inline mr-1"></i>
                添加指标
              </button>
            </div>
          </div>

        </div>

        <!-- SQL 预览 -->
        <div class="mt-4">
          <div class="flex items-center justify-between mb-2">
            <label class="text-sm font-medium flex items-center gap-2">
              <i data-lucide="code" class="w-4 h-4 text-primary"></i>
              生成的 SQL
            </label>
            <button class="text-xs text-primary hover:underline">复制</button>
          </div>
          <pre class="code-block text-xs overflow-x-auto">SELECT
  category,
  region,
  SUM(CASE WHEN year = 2023 THEN amount END) AS "2023_总金额",
  SUM(CASE WHEN year = 2024 THEN amount END) AS "2024_总金额"
FROM sales_data
GROUP BY category, region
ORDER BY category, region</pre>
        </div>

        <!-- 提示信息 -->
        <div class="p-3 bg-muted/50 rounded-lg text-xs text-muted-fg flex items-start gap-2 mt-4">
          <i data-lucide="info" class="w-4 h-4 flex-shrink-0 mt-0.5"></i>
          <div>
            <strong class="text-foreground">透视表说明：</strong><br />
            • 行维度：决定表格的行（如类别、地区）<br />
            • 列维度：决定表格的列（如年份、季度）<br />
            • 聚合指标：在交叉点显示的统计值（如总金额、平均价格）
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
    console.log(`Loading template: ${templateKey} into #${targetId}`);
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
    
    // 立即初始化新加载内容中的图标
    if (typeof lucide !== 'undefined') {
      setTimeout(() => {
        console.log(`Initializing icons for template: ${templateKey}`);
        lucide.createIcons();
      }, 10);
    }
    
    console.log(`✓ Template ${templateKey} loaded successfully`);
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
    
    // 最后统一初始化所有Lucide图标
    if (typeof lucide !== 'undefined') {
      setTimeout(() => {
        console.log('Final icon initialization');
        lucide.createIcons();
      }, 100);
    }
    
    console.log('✓ All templates loaded successfully');
  }
};

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', () => {
  TemplateLoader.init();
});
