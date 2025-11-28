// 全局状态管理
const AppState = {
  currentTab: 'visual',
  currentMode: 'query',
  selectedTables: {
    visual: [],
    sql: [],
    join: [],
    set: [],
    pivot: []
  }
};

// 切换二级Tab（查询模式/异步任务）
function switchSecondaryTab(mode) {
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
  event.currentTarget.classList.add('active');
  
  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }
}

// 切换三级Tab（可视化/SQL/JOIN/SET/PIVOT）
function switchThirdTab(tab) {
  AppState.currentTab = tab;
  
  // 更新Tab按钮状态
  document.querySelectorAll('.tab-btn[onclick^="switchThirdTab"]').forEach(btn => {
    btn.classList.remove('active');
  });
  if (event && event.currentTarget) {
    event.currentTarget.classList.add('active');
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
    TemplateLoader.loadTemplate(templateKey, 'tab-content-container');
    
    // 重新初始化图标
    if (typeof lucide !== 'undefined') {
      setTimeout(() => {
        lucide.createIcons();
      }, 50);
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

// 数据表选择
function selectTable(tableName, event) {
  if (event) {
    event.stopPropagation();
  }
  
  const currentTab = AppState.currentTab;
  const tables = AppState.selectedTables[currentTab];
  
  // 切换选中状态
  const index = tables.indexOf(tableName);
  if (index > -1) {
    tables.splice(index, 1);
  } else {
    tables.push(tableName);
  }
  
  // 更新UI
  updateTreeSelection();
  
  console.log(`Selected tables for ${currentTab}:`, tables);
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
