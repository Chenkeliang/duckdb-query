// 全局状态管理
const AppState = {
  currentTab: 'visual',
  currentMode: 'query',
  selectedTables: {
    visual: ['sales_data'],  // 默认选中
    sql: [],
    join: [],
    set: [],
    pivot: ['sales_data']
  }
};

// 表结构定义（用于生成卡片）
const tableSchemas = {
  'sales_data': {
    source: 'DuckDB 表',
    columns: [
      { name: 'id', type: 'INTEGER' },
      { name: 'customer_id', type: 'INTEGER' },
      { name: 'amount', type: 'DOUBLE' },
      { name: 'date', type: 'DATE' }
    ]
  },
  'customer_info': {
    source: 'DuckDB 表',
    columns: [
      { name: 'id', type: 'INTEGER' },
      { name: 'name', type: 'VARCHAR' },
      { name: 'email', type: 'VARCHAR' },
      { name: 'city', type: 'VARCHAR' }
    ]
  },
  'product_catalog': {
    source: 'DuckDB 表',
    columns: [
      { name: 'id', type: 'INTEGER' },
      { name: 'name', type: 'VARCHAR' },
      { name: 'price', type: 'DOUBLE' },
      { name: 'category', type: 'VARCHAR' }
    ]
  },
  'orders': {
    source: 'MySQL - 生产库',
    columns: [
      { name: 'id', type: 'INTEGER' },
      { name: 'user_id', type: 'INTEGER' },
      { name: 'total', type: 'DOUBLE' },
      { name: 'status', type: 'VARCHAR' }
    ]
  },
  'users': {
    source: 'MySQL - 生产库',
    columns: [
      { name: 'id', type: 'INTEGER' },
      { name: 'username', type: 'VARCHAR' },
      { name: 'email', type: 'VARCHAR' }
    ]
  },
  'products': {
    source: 'MySQL - 生产库',
    columns: [
      { name: 'id', type: 'INTEGER' },
      { name: 'name', type: 'VARCHAR' },
      { name: 'price', type: 'DOUBLE' }
    ]
  }
};

// 切换二级Tab（查询模式/异步任务）
function switchSecondaryTab(mode, evt) {
  AppState.currentMode = mode;
  
  const queryMode = document.getElementById('query-mode');
  const tasksContent = document.getElementById('tasks-content');
  
  if (mode === 'query') {
    queryMode.classList.remove('hidden');
    queryMode.classList.add('flex', 'flex-1', 'flex-col');
    tasksContent.classList.add('hidden');
  } else {
    queryMode.classList.add('hidden');
    tasksContent.classList.remove('hidden');
    tasksContent.classList.add('flex', 'flex-1', 'flex-col');
  }
  
  // 更新Tab按钮状态
  document.querySelectorAll('.tab-btn[onclick^="switchSecondaryTab"]').forEach(btn => {
    btn.classList.remove('active');
  });
  if (evt && evt.currentTarget) {
    evt.currentTarget.classList.add('active');
  }
  
  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }
}

// 切换三级Tab（可视化/SQL/JOIN/SET/PIVOT）
function switchThirdTab(tab, evt) {
  console.log('Switching to tab:', tab);
  AppState.currentTab = tab;
  
  // 更新Tab按钮状态
  document.querySelectorAll('.tab-btn[onclick^="switchThirdTab"]').forEach(btn => {
    btn.classList.remove('active');
  });
  if (evt && evt.currentTarget) {
    evt.currentTarget.classList.add('active');
  }
  
  // 加载对应的Tab模板
  const tabTemplates = {
    visual: 'visualQuery',
    sql: 'sqlQuery',
    join: 'joinQuery',
    set: 'setOperations',
    pivot: 'pivotTable'
  };
  
  const templateKey = tabTemplates[tab];
  if (templateKey && typeof TemplateLoader !== 'undefined') {
    console.log('Loading template:', templateKey);
    TemplateLoader.loadTemplate(templateKey, 'tab-content-container');
    
    // 更新左侧树的选中状态
    setTimeout(() => {
      updateTreeSelection();
    }, 50);
    
    // 更新内容区（对于 join 和 set 需要动态生成卡片）
    setTimeout(() => {
      updateContentArea();
    }, 100);
    
    // 重新初始化图标
    if (typeof lucide !== 'undefined') {
      setTimeout(() => {
        console.log('Reinitializing Lucide icons');
        lucide.createIcons();
      }, 150);
    }
  }
}

// 数据源面板折叠/展开
function toggleDataSourcePanel() {
  const panel = document.getElementById('datasource-panel');
  const expandBtn = document.getElementById('expand-datasource-btn');
  
  if (!panel || !expandBtn) return;
  
  if (panel.classList.contains('datasource-panel-collapsed')) {
    // 展开：恢复到保存的宽度（至少 180px）
    panel.classList.remove('datasource-panel-collapsed');
    const expandWidth = Math.max(savedPanelWidth, 180);
    panel.style.width = expandWidth + 'px';
    savedPanelWidth = expandWidth;
    expandBtn.classList.add('hidden');
    expandBtn.classList.remove('flex');
  } else {
    // 折叠：保存当前宽度
    savedPanelWidth = panel.offsetWidth;
    panel.classList.add('datasource-panel-collapsed');
    expandBtn.classList.remove('hidden');
    expandBtn.classList.add('flex');
  }
  
  if (typeof lucide !== 'undefined') {
    setTimeout(() => {
      lucide.createIcons();
    }, 100);
  }
}

// 数据表选择（双击）
function selectTable(tableName, evt) {
  console.log('selectTable called:', tableName, evt);
  
  if (evt) {
    evt.stopPropagation();
  }
  
  const currentTab = AppState.currentTab;
  const isMultiSelect = currentTab === 'join' || currentTab === 'set';
  const tables = AppState.selectedTables[currentTab];
  const tableIndex = tables.indexOf(tableName);
  
  if (isMultiSelect) {
    // 多表模式：切换选择状态
    if (tableIndex > -1) {
      // 已选中，取消选择
      tables.splice(tableIndex, 1);
      console.log(`Removed table: ${tableName}`);
    } else {
      // 未选中，添加
      tables.push(tableName);
      console.log(`Added table: ${tableName}`);
    }
  } else {
    // 单表模式：替换选择
    AppState.selectedTables[currentTab] = [tableName];
    console.log(`Selected single table: ${tableName}`);
  }
  
  // 更新左侧树的选中状态
  updateTreeSelection();
  
  // 更新右侧内容区
  updateContentArea();
  
  // 重新初始化图标
  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }
  
  console.log(`✓ Selected table: ${tableName}`, AppState.selectedTables);
}

// 更新左侧树的选中状态
function updateTreeSelection() {
  const tables = AppState.selectedTables[AppState.currentTab];
  const allTreeItems = document.querySelectorAll('.tree-item');
  
  allTreeItems.forEach(item => {
    const nameSpan = item.querySelector('.item-name');
    if (!nameSpan) return;
    
    const tableName = nameSpan.textContent.trim();
    const icon = item.querySelector('i[data-lucide="table"]');
    
    if (tables.includes(tableName)) {
      item.classList.add('selected');
      if (icon) {
        icon.classList.remove('text-muted-fg');
        icon.classList.add('text-primary');
      }
    } else {
      item.classList.remove('selected');
      if (icon) {
        icon.classList.remove('text-primary');
        icon.classList.add('text-muted-fg');
      }
    }
  });
}

// 更新右侧内容区
function updateContentArea() {
  const currentTab = AppState.currentTab;
  
  if (currentTab === 'join') {
    updateJoinContent();
  } else if (currentTab === 'set') {
    updateSetContent();
  } else if (currentTab === 'visual') {
    // 更新可视化查询的表名显示
    const tables = AppState.selectedTables.visual;
    const nameEl = document.getElementById('selected-table-name');
    if (nameEl && tables.length > 0) {
      nameEl.textContent = tables[0];
    }
  } else if (currentTab === 'pivot') {
    // 更新透视表的表名显示
    const tables = AppState.selectedTables.pivot;
    // 可以扩展：更新透视表的数据源显示
  }
}

// 更新树形列表选中状态
function updateTreeSelection() {
  const currentTab = AppState.currentTab;
  const selectedTables = AppState.selectedTables[currentTab];
  
  document.querySelectorAll('.tree-item').forEach(item => {
    const tableName = item.getAttribute('ondblclick')?.match(/'([^']+)'/)?.[1];
    if (tableName && selectedTables.includes(tableName)) {
      item.classList.add('selected');
    } else {
      item.classList.remove('selected');
    }
  });
}

// 外部数据库展开/折叠
function toggleExternalDb() {
  const list = document.getElementById('external-db-list');
  const chevron = document.getElementById('external-db-chevron');
  
  if (list.classList.contains('hidden')) {
    list.classList.remove('hidden');
    chevron.setAttribute('data-lucide', 'chevron-down');
  } else {
    list.classList.add('hidden');
    chevron.setAttribute('data-lucide', 'chevron-right');
  }
  
  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }
}

// MySQL表展开/折叠
function toggleMysqlTables(event) {
  event.stopPropagation();
  const tables = document.getElementById('mysql-tables');
  const chevron = document.getElementById('mysql-chevron');
  
  if (tables.classList.contains('hidden')) {
    tables.classList.remove('hidden');
    chevron.setAttribute('data-lucide', 'chevron-down');
  } else {
    tables.classList.add('hidden');
    chevron.setAttribute('data-lucide', 'chevron-right');
  }
  
  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }
}

// PostgreSQL表展开/折叠
function togglePostgresTables(event) {
  event.stopPropagation();
  const tables = document.getElementById('postgres-tables');
  const chevron = document.getElementById('postgres-chevron');
  
  if (tables.classList.contains('hidden')) {
    tables.classList.remove('hidden');
    chevron.setAttribute('data-lucide', 'chevron-down');
  } else {
    tables.classList.add('hidden');
    chevron.setAttribute('data-lucide', 'chevron-right');
  }
  
  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }
}

// 查询模式切换
function switchQueryMode(mode) {
  // 移除所有卡片的active状态
  document.querySelectorAll('.query-mode-card').forEach(card => {
    card.classList.remove('active');
  });
  
  // 激活当前卡片
  const modeCard = document.getElementById(`mode-${mode}`);
  if (modeCard) {
    modeCard.classList.add('active');
  }
  
  // 隐藏所有内容区
  document.querySelectorAll('.query-mode-content').forEach(content => {
    content.style.display = 'none';
  });
  
  // 显示对应的内容区
  const content = document.getElementById(`content-${mode}`);
  if (content) {
    content.style.display = 'block';
  }
  
  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }
}

// 执行可视化查询
function executeVisualQuery() {
  console.log('执行可视化查询...');
  
  // 更新结果面板
  updateResultPanel({
    rows: 20,
    cols: 3,
    execTime: '0.8s',
    data: [
      { id: 1, name: '记录A', value: 100 },
      { id: 2, name: '记录B', value: 200 },
      { id: 3, name: '记录C', value: 300 }
    ]
  });
  
  // 展开结果面板
  const resultPane = document.getElementById('unified-result-panel');
  if (resultPane) {
    resultPane.style.height = '400px';
    resultPane.style.display = 'flex';
  }
}

// 更新结果面板
function updateResultPanel(result) {
  // 更新统计信息
  const rowCount = document.getElementById('result-row-count');
  const colCount = document.getElementById('result-col-count');
  const execTime = document.getElementById('result-exec-time');
  
  if (rowCount) rowCount.textContent = `${result.rows} 行`;
  if (colCount) colCount.textContent = `${result.cols} 列`;
  if (execTime) execTime.textContent = `执行时间: ${result.execTime}`;
  
  // 更新表格数据（简化版）
  const tableContainer = document.getElementById('unified-table-container');
  if (tableContainer && result.data) {
    const cols = Object.keys(result.data[0]);
    let html = '<table class="ide-table"><thead><tr>';
    cols.forEach(col => {
      html += `<th>${col}</th>`;
    });
    html += '</tr></thead><tbody>';
    result.data.forEach(row => {
      html += '<tr>';
      cols.forEach(col => {
        html += `<td>${row[col]}</td>`;
      });
      html += '</tr>';
    });
    html += '</tbody></table>';
    tableContainer.innerHTML = html;
  }
  
  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }
}

// 统一结果面板折叠/展开
function toggleUnifiedResultPane(event) {
  if (event) {
    event.stopPropagation();
  }
  
  const resultPane = document.getElementById('unified-result-panel');
  const tabContainer = document.getElementById('tab-content-container');
  const icon = document.getElementById('unified-collapse-icon');
  
  if (!resultPane || !tabContainer || !icon) return;
  
  const currentHeight = resultPane.offsetHeight;
  
  if (currentHeight > 50) {
    // 折叠 - 保存当前高度
    savedUnifiedResultHeight = currentHeight;
    resultPane.style.height = '0px';
    resultPane.classList.add('collapsed');
    tabContainer.style.height = 'calc(100% - 4px)';
    icon.setAttribute('data-lucide', 'chevron-up');
  } else {
    // 展开 - 恢复保存的高度
    const expandHeight = savedUnifiedResultHeight || 400;
    resultPane.style.height = expandHeight + 'px';
    resultPane.classList.remove('collapsed');
    tabContainer.style.height = `calc(100% - ${expandHeight}px - 4px)`;
    icon.setAttribute('data-lucide', 'chevron-down');
  }
  
  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }
}

// ========== 拖拽功能 ==========

// 统一结果面板拖拽
let isResizingUnified = false;
let startY = 0;
let startTopHeight = 0;
let startBottomHeight = 0;
let savedUnifiedResultHeight = 400;

function initUnifiedResizer() {
  const resizer = document.getElementById('unified-resizer');
  const tabContainer = document.getElementById('tab-content-container');
  const resultPanel = document.getElementById('unified-result-panel');
  const queryMode = document.getElementById('query-mode');
  
  if (!resizer || !tabContainer || !resultPanel || !queryMode) return;
  
  resizer.addEventListener('mousedown', (e) => {
    if (e.target.classList.contains('collapse-btn') || e.target.closest('.collapse-btn')) {
      return;
    }
    
    isResizingUnified = true;
    startY = e.clientY;
    startTopHeight = tabContainer.offsetHeight;
    startBottomHeight = resultPanel.offsetHeight;
    
    document.body.style.cursor = 'ns-resize';
    document.body.style.userSelect = 'none';
  });
  
  document.addEventListener('mousemove', (e) => {
    if (!isResizingUnified) return;
    
    const deltaY = e.clientY - startY;
    const containerHeight = queryMode.offsetHeight;
    const resizerHeight = resizer.offsetHeight;
    
    let newTopHeight = startTopHeight + deltaY;
    let newBottomHeight = startBottomHeight - deltaY;
    
    // 限制最小高度
    const minTopHeight = 200;
    const minBottomHeight = 100;
    
    if (newTopHeight < minTopHeight) {
      newTopHeight = minTopHeight;
      newBottomHeight = containerHeight - minTopHeight - resizerHeight;
    } else if (newBottomHeight < minBottomHeight) {
      newBottomHeight = minBottomHeight;
      newTopHeight = containerHeight - minBottomHeight - resizerHeight;
    }
    
    tabContainer.style.height = newTopHeight + 'px';
    resultPanel.style.height = newBottomHeight + 'px';
    savedUnifiedResultHeight = newBottomHeight;
  });
  
  document.addEventListener('mouseup', () => {
    if (isResizingUnified) {
      isResizingUnified = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }
  });
}

// 横向拖拽调整数据源面板宽度
let isResizingHorizontal = false;
let startX = 0;
let startWidth = 0;
let savedPanelWidth = 256;

function initHorizontalResizer() {
  const horizontalResizer = document.getElementById('horizontal-resizer');
  const datasourcePanel = document.getElementById('datasource-panel');
  
  if (!horizontalResizer || !datasourcePanel) return;
  
  horizontalResizer.addEventListener('mousedown', (e) => {
    if (datasourcePanel.classList.contains('datasource-panel-collapsed')) {
      return;
    }
    
    isResizingHorizontal = true;
    startX = e.clientX;
    startWidth = datasourcePanel.offsetWidth;
    
    document.body.style.cursor = 'ew-resize';
    document.body.style.userSelect = 'none';
  });
  
  document.addEventListener('mousemove', (e) => {
    if (!isResizingHorizontal) return;
    
    const deltaX = e.clientX - startX;
    let newWidth = startWidth + deltaX;
    
    const collapseThreshold = 50;
    const minWidth = 50;
    const maxWidth = 600;
    
    if (newWidth <= collapseThreshold) {
      datasourcePanel.classList.add('datasource-panel-collapsed');
      const expandBtn = document.getElementById('expand-datasource-btn');
      if (expandBtn) {
        expandBtn.classList.remove('hidden');
        expandBtn.classList.add('flex');
      }
      
      isResizingHorizontal = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      
      if (typeof lucide !== 'undefined') {
        setTimeout(() => lucide.createIcons(), 50);
      }
      return;
    }
    
    if (newWidth < minWidth) newWidth = minWidth;
    if (newWidth > maxWidth) newWidth = maxWidth;
    
    datasourcePanel.style.width = newWidth + 'px';
    savedPanelWidth = newWidth;
  });
  
  document.addEventListener('mouseup', () => {
    if (isResizingHorizontal) {
      isResizingHorizontal = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }
  });
}

// 初始化
document.addEventListener('DOMContentLoaded', function() {
  // 默认选中 sales_data
  AppState.selectedTables.visual = ['sales_data'];
  
  // 延迟更新选中状态，等待组件加载完成
  setTimeout(() => {
    updateTreeSelection();
    
    // 初始化拖拽功能
    initUnifiedResizer();
    initHorizontalResizer();
  }, 500);
});


// ========== 事件处理器验证函数 ==========

// 验证所有关键事件处理器是否正常工作
function verifyEventHandlers() {
  console.log('=== Verifying Event Handlers ===');
  
  // 验证 selectTable 函数
  if (typeof selectTable === 'function') {
    console.log('✓ selectTable function is defined');
  } else {
    console.error('✗ selectTable function is NOT defined');
  }
  
  // 验证 switchThirdTab 函数
  if (typeof switchThirdTab === 'function') {
    console.log('✓ switchThirdTab function is defined');
  } else {
    console.error('✗ switchThirdTab function is NOT defined');
  }
  
  // 验证 switchSecondaryTab 函数
  if (typeof switchSecondaryTab === 'function') {
    console.log('✓ switchSecondaryTab function is defined');
  } else {
    console.error('✗ switchSecondaryTab function is NOT defined');
  }
  
  // 验证双击事件绑定
  const treeItems = document.querySelectorAll('.tree-item[ondblclick]');
  console.log(`✓ Found ${treeItems.length} tree items with ondblclick events`);
  
  // 验证 Lucide 图标
  const lucideIcons = document.querySelectorAll('[data-lucide]');
  const renderedIcons = document.querySelectorAll('[data-lucide] svg');
  console.log(`✓ Found ${lucideIcons.length} Lucide icon elements`);
  console.log(`✓ ${renderedIcons.length} icons have been rendered`);
  
  if (renderedIcons.length < lucideIcons.length) {
    console.warn(`⚠ ${lucideIcons.length - renderedIcons.length} icons not yet rendered`);
  }
  
  console.log('=== Verification Complete ===');
}

// 在页面加载完成后自动验证
document.addEventListener('DOMContentLoaded', function() {
  setTimeout(verifyEventHandlers, 1000);
});


// ========== 动态卡片生成函数 ==========

// 创建表卡片
function createTableCard(tableName, isPrimary, type) {
  const schema = tableSchemas[tableName] || { source: 'Unknown', columns: [] };
  const div = document.createElement('div');
  div.className = `datasource-card ${isPrimary ? 'primary' : ''} shrink-0`;
  div.style.cssText = 'min-width: 260px; max-width: 280px;';
  
  const columnsHtml = schema.columns.slice(0, 6).map(col => `
    <label class="flex items-center gap-2 text-xs px-2 py-1 rounded hover:bg-muted/50 cursor-pointer">
      <input type="checkbox" class="accent-primary w-3 h-3" checked />
      <span class="flex-1 truncate">${col.name}</span>
      <span class="text-muted-fg text-[10px]">${col.type}</span>
    </label>
  `).join('');
  
  const moreColumns = schema.columns.length > 6 ? 
    `<div class="text-xs text-muted-fg text-center py-1">+${schema.columns.length - 6} 更多字段</div>` : '';
  
  div.innerHTML = `
    <div class="p-3 border-b border-border flex items-center justify-between">
      <div class="flex items-center gap-2">
        <i data-lucide="table" class="w-4 h-4 ${isPrimary ? 'text-primary' : 'text-muted-fg'}"></i>
        <span class="font-medium text-sm">${tableName}</span>
        ${isPrimary ? '<span class="text-[10px] px-1.5 py-0.5 bg-primary/20 text-primary rounded">主表</span>' : ''}
      </div>
      <button onclick="removeTableFromSelection('${tableName}', '${type}')" class="text-muted-fg hover:text-error p-1 rounded hover:bg-error/10" title="移除">
        <i data-lucide="x" class="w-4 h-4"></i>
      </button>
    </div>
    <div class="p-3">
      <div class="text-xs text-muted-fg mb-2 flex items-center gap-1">
        <i data-lucide="database" class="w-3 h-3"></i>
        ${schema.source}
      </div>
      <div class="space-y-0.5 max-h-40 overflow-auto">
        ${columnsHtml}
        ${moreColumns}
      </div>
    </div>
  `;
  
  return div;
}

// 创建 JOIN 连接器
function createJoinConnector(leftTable, rightTable, index) {
  const div = document.createElement('div');
  div.className = 'join-connector shrink-0';
  div.innerHTML = `
    <div class="flex flex-col items-center gap-2 px-2">
      <select class="duck-input text-xs w-28 text-center">
        <option value="INNER JOIN">INNER JOIN</option>
        <option value="LEFT JOIN" selected>LEFT JOIN</option>
        <option value="RIGHT JOIN">RIGHT JOIN</option>
        <option value="FULL JOIN">FULL JOIN</option>
      </select>
      <div class="w-16 h-0.5 bg-primary/50"></div>
      <div class="text-[10px] text-muted-fg">ON</div>
      <div class="flex items-center gap-1 text-xs">
        <select class="duck-input text-xs py-1 px-2" style="width: 80px;">
          ${getColumnOptions(leftTable)}
        </select>
        <span>=</span>
        <select class="duck-input text-xs py-1 px-2" style="width: 80px;">
          ${getColumnOptions(rightTable)}
        </select>
      </div>
    </div>
  `;
  return div;
}

// 创建集合操作连接器
function createSetConnector() {
  const div = document.createElement('div');
  div.className = 'set-connector shrink-0 flex items-center justify-center px-4';
  div.innerHTML = `
    <div class="px-3 py-1.5 bg-primary text-white text-xs font-semibold rounded-full">
      UNION
    </div>
  `;
  return div;
}

// 获取列选项
function getColumnOptions(tableName) {
  const schema = tableSchemas[tableName];
  if (!schema) return '<option>-</option>';
  return schema.columns.map(col => `<option value="${col.name}">${col.name}</option>`).join('');
}

// 从选择中移除表
function removeTableFromSelection(tableName, type) {
  const tables = AppState.selectedTables[type];
  const index = tables.indexOf(tableName);
  if (index > -1) {
    tables.splice(index, 1);
    console.log(`Removed ${tableName} from ${type}`);
  }
  updateTreeSelection();
  updateContentArea();
}

// 更新关联查询内容
function updateJoinContent() {
  const container = document.getElementById('tab-content-container');
  if (!container) return;
  
  const tables = AppState.selectedTables.join;
  
  // 重新加载模板
  if (typeof TemplateLoader !== 'undefined') {
    TemplateLoader.loadTemplate('joinQuery', 'tab-content-container');
  }
  
  // 等待模板加载完成后更新内容
  setTimeout(() => {
    const tablesContainer = container.querySelector('.flex.items-start.gap-4');
    if (!tablesContainer) return;
    
    if (tables.length === 0) {
      // 显示空状态（模板中已有）
      return;
    }
    
    // 清空容器
    tablesContainer.innerHTML = '';
    
    // 添加表卡片和连接器
    tables.forEach((tableName, index) => {
      const isPrimary = index === 0;
      const card = createTableCard(tableName, isPrimary, 'join');
      tablesContainer.appendChild(card);
      
      // 添加连接器（除了最后一个表）
      if (index < tables.length - 1) {
        const connector = createJoinConnector(tableName, tables[index + 1], index);
        tablesContainer.appendChild(connector);
      }
    });
    
    // 重新初始化图标
    if (typeof lucide !== 'undefined') {
      lucide.createIcons();
    }
  }, 100);
}

// 更新集合操作内容
function updateSetContent() {
  const container = document.getElementById('tab-content-container');
  if (!container) return;
  
  const tables = AppState.selectedTables.set;
  
  // 重新加载模板
  if (typeof TemplateLoader !== 'undefined') {
    TemplateLoader.loadTemplate('setOperations', 'tab-content-container');
  }
  
  // 等待模板加载完成后更新内容
  setTimeout(() => {
    const tablesContainer = container.querySelector('.flex.items-start.gap-4');
    if (!tablesContainer) return;
    
    if (tables.length === 0) {
      // 显示空状态（模板中已有）
      return;
    }
    
    // 清空容器
    tablesContainer.innerHTML = '';
    
    // 添加表卡片和连接器
    tables.forEach((tableName, index) => {
      const card = createTableCard(tableName, false, 'set');
      tablesContainer.appendChild(card);
      
      // 添加连接器（除了最后一个表）
      if (index < tables.length - 1) {
        const connector = createSetConnector();
        tablesContainer.appendChild(connector);
      }
    });
    
    // 重新初始化图标
    if (typeof lucide !== 'undefined') {
      lucide.createIcons();
    }
  }, 100);
}
