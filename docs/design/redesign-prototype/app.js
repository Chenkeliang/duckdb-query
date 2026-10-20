/* DuckQuery redesign prototype — core: i18n, data, shell, editor, results. Demo data is illustrative. */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const ic = (n, c = '') => `<svg class="i ${c}"><use href="#i-${n}"/></svg>`;
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const isMac = /Mac|iPhone|iPad/.test(navigator.platform);
const fmt = (n, d = 2) => Number(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });

/* ---------------- i18n ---------------- */
const I18N = {
  zh: {
    'nav.work': '查询工作台', 'nav.sources': '数据源', 'nav.ai': 'AI 助手', 'nav.ext': '扩展', 'nav.settings': '设置',
    'exp.sources': '数据源', 'exp.saved': '收藏', 'exp.runs': '运行记录', 'exp.filter': '筛选表或列', 'exp.noMatch': '没有匹配的表或列',
    'exp.offline': '连接已断开', 'exp.retry': '重连', 'exp.tables': '{n} 表', 'exp.insert': '插入到编辑器', 'exp.preview': '预览前 100 行',
    'exp.today': '今天', 'exp.earlier': '更早', 'exp.savedEmpty': '还没有收藏。在工具栏点击「收藏」保存当前查询。',
    'act.addData': '添加数据', 'act.refresh': '刷新', 'tb.run': '执行', 'tb.stop': '取消', 'tb.async': '异步执行', 'tb.format': '格式化', 'tb.save': '收藏', 'tb.ask': 'AI', 'tb.more': '更多操作',
    'fed.local': 'DuckDB 本地', 'fed.fed': '联邦查询', 'fed.ext': '外部数据库',
    'rt.grid': '结果', 'rt.chart': '图表', 'rt.msgs': '消息', 'rb.cols': '列', 'rb.copy': '复制', 'rb.saveTable': '存为表', 'rb.export': '导出', 'rb.max': '最大化结果',
    'res.idleT': '执行查询以查看结果', 'res.idleD': '按 ⌘↵ 执行当前标签的 SQL，或按 ⌘K 搜索表和操作。', 'res.running': '正在执行…',
    'res.emptyT': '查询成功，但没有返回任何行', 'res.emptyD': '条件可能过严。检查 WHERE 子句，或在消息里查看下推到远程库的过滤条件。', 'res.showMsgs': '查看消息',
    'res.errT': '查询失败', 'res.didYouMean': '你是不是想找{a}？', 'res.fix': '替换为 {a} 并重新执行', 'res.aiFix': 'AI 解释并修复',
    'res.rows': '{n} 行', 'res.cols': '{n} 列', 'res.sel': '已选 1 格', 'res.slow': '已执行 {s} 秒，长查询建议转为异步，结果完成后可在「运行记录」取回。', 'res.toAsync': '转为异步',
    'chart.title': '各客户已完成订单金额', 'chart.sub': '按 customer_name 汇总 amount · 来自当前结果',
    'msg.parse': '解析 SQL', 'msg.detect': '识别来源：DuckDB 本地 · MySQL prod_crm', 'msg.push': '下推到 MySQL：customer_id IN (…)，612 → 9 行', 'msg.exec': 'DuckDB 执行 JOIN · ORDER BY', 'msg.done': '返回 {n} 行',
    'st.engine': 'DuckDB 2.0 alpha · 本地引擎', 'st.conns': '4 个连接 · 1 个离线', 'st.tasks': '{n} 个异步任务运行中', 'st.mem': '内存 1.4 / 12 GB', 'st.props': '设计提案', 'st.scene': '演示状态', 'st.pos': '行 {l}，列 {c}',
    'scene.ok': '成功', 'scene.err': '表名错误', 'scene.empty': '空结果', 'scene.slow': '慢查询',
    'tab.new': '新建标签', 'tab.sql': 'SQL 查询', 'tab.join': 'JOIN 查询', 'tab.set': '集合操作', 'tab.pivot': '透视表', 'tab.untitled': '未命名',
    'cmdk.ph': '搜索操作、表或最近的查询…', 'cmdk.nav': '选择', 'cmdk.go': '执行', 'cmdk.toggle': '开关', 'cmdk.none': '没有匹配项',
    'cmdk.actions': '操作', 'cmdk.goto': '跳转', 'cmdk.tables': '表', 'cmdk.recent': '最近运行',
    'toast.exported': '已导出 {f}（{n} 行）', 'toast.copied': '已复制 {n} 行到剪贴板', 'toast.saved': '已保存为 DuckDB 表 {t}', 'toast.bookmarked': '已收藏「{t}」',
    'toast.async': '已提交异步任务，完成后可在「运行记录」取回', 'toast.asyncDone': '异步任务完成：{n} 行', 'toast.formatted': '已格式化', 'toast.inserted': '已插入到编辑器',
    'toast.conn': '{n} 连接成功', 'toast.view': '查看', 'toast.cancel': '已取消执行', 'toast.imported': '已导入表 {t}',
    'dlg.saveT': '存为 DuckDB 表', 'dlg.saveD': '把当前结果写入本地 DuckDB，之后可以像普通表一样联查。', 'dlg.name': '表名', 'dlg.mode': '如果已存在', 'dlg.new': '报错，不覆盖', 'dlg.replace': '替换', 'dlg.append': '追加',
    'common.cancel': '取消', 'common.save': '保存', 'common.close': '关闭', 'common.copy': '复制', 'common.copied': '已复制',
    'ai.title': 'AI 助手', 'ai.scope': '范围', 'ai.add': '添加', 'ai.q': '上个月各地区已完成订单的实付金额是多少？',
    'ai.s1': '查看表结构 · readme_demo_orders', 'ai.s2': '查看表结构 · prod_crm.customers', 'ai.s3': '运行只读查询',
    'ai.a': '9 月共 <b>4 个地区</b>有已完成订单：East 最高，<b>5,055.25</b>；其后 North 2,170.50、West 1,220.50、South 415.75。下面的 SQL 已经在 DuckDB 里执行过，可直接插入编辑器复用。',
    'ai.insert': '插入编辑器', 'ai.runIt': '执行', 'ai.ev': '数字由 DuckDB 执行 SQL 得出，模型不做任何算术。', 'ai.ph': '用自然语言提问，或 @ 一张表…', 'ai.hint': '只读 · 使用你自己的 Key 与模型',
    'grid.copy': '复制', 'grid.copyCsv': '复制为 CSV', 'grid.copyJson': '复制为 JSON', 'grid.copyCol': '复制列名', 'grid.filterVal': '按此值筛选', 'grid.excludeVal': '排除此值', 'grid.clearFilter': '清除筛选',
    'grid.selCells': '已选 {n} 格', 'grid.sum': '求和', 'grid.avg': '平均', 'grid.rangeCopied': '已复制 {r} 行 {c} 列到剪贴板', 'grid.allCopied': '已复制全部 {n} 行（含表头）', 'grid.filtered': '筛选后 {n} / {t} 行',
    'grid.filter': '筛选', 'grid.contains': '包含', 'grid.equals': '等于', 'grid.startsWith': '开头是', 'grid.endsWith': '结尾是', 'grid.condPh': '输入条件值', 'grid.search': '搜索值…', 'grid.selectAll': '全选', 'grid.clearAll': '清空', 'grid.invert': '反选',
    'grid.colCopied': '已复制列名 {c}', 'grid.noMatch': '没有符合筛选条件的行', 'grid.autoFit': '自动列宽', 'grid.reset': '重置列', 'grid.pasteHint': '已识别剪贴板中的表格数据',
    'props.title': '设计提案', 'props.lead': '在保留全部现有功能的前提下，以下是建议合并或更精确的交互。点击条目可跳到对应位置。', 'props.mark': '在界面中标出提案位置', 'props.note': '示例数据仅用于演示',
  },
  en: {
    'nav.work': 'Query workbench', 'nav.sources': 'Data sources', 'nav.ai': 'AI assistant', 'nav.ext': 'Extensions', 'nav.settings': 'Settings',
    'exp.sources': 'Sources', 'exp.saved': 'Saved', 'exp.runs': 'Runs', 'exp.filter': 'Filter tables or columns', 'exp.noMatch': 'No matching tables or columns',
    'exp.offline': 'Disconnected', 'exp.retry': 'Reconnect', 'exp.tables': '{n} tables', 'exp.insert': 'Insert into editor', 'exp.preview': 'Preview first 100 rows',
    'exp.today': 'Today', 'exp.earlier': 'Earlier', 'exp.savedEmpty': 'Nothing saved yet. Use “Save” in the toolbar to keep the current query.',
    'act.addData': 'Add data', 'act.refresh': 'Refresh', 'tb.run': 'Run', 'tb.stop': 'Cancel', 'tb.async': 'Run async', 'tb.format': 'Format', 'tb.save': 'Save', 'tb.ask': 'AI', 'tb.more': 'More actions',
    'fed.local': 'DuckDB local', 'fed.fed': 'Federated', 'fed.ext': 'External DB',
    'rt.grid': 'Results', 'rt.chart': 'Chart', 'rt.msgs': 'Messages', 'rb.cols': 'Columns', 'rb.copy': 'Copy', 'rb.saveTable': 'Save as table', 'rb.export': 'Export', 'rb.max': 'Maximize results',
    'res.idleT': 'Run a query to see results', 'res.idleD': 'Press ⌘↵ to run this tab, or ⌘K to search tables and actions.', 'res.running': 'Running…',
    'res.emptyT': 'Query succeeded but returned no rows', 'res.emptyD': 'The filter may be too strict. Check the WHERE clause, or see Messages for the predicate pushed to the remote database.', 'res.showMsgs': 'Open messages',
    'res.errT': 'Query failed', 'res.didYouMean': 'Did you mean {a}?', 'res.fix': 'Replace with {a} and rerun', 'res.aiFix': 'Explain & fix with AI',
    'res.rows': '{n} rows', 'res.cols': '{n} cols', 'res.sel': '1 cell selected', 'res.slow': 'Running for {s}s. Move long queries to async and pick the result up from Runs.', 'res.toAsync': 'Move to async',
    'chart.title': 'Completed order amount by customer', 'chart.sub': 'Sum of amount by customer_name · from current result',
    'msg.parse': 'Parse SQL', 'msg.detect': 'Sources: DuckDB local · MySQL prod_crm', 'msg.push': 'Pushed to MySQL: customer_id IN (…), 612 → 9 rows', 'msg.exec': 'DuckDB runs JOIN · ORDER BY', 'msg.done': 'Returned {n} rows',
    'st.engine': 'DuckDB 2.0 alpha · local engine', 'st.conns': '4 connections · 1 offline', 'st.tasks': '{n} async task running', 'st.mem': 'Memory 1.4 / 12 GB', 'st.props': 'Proposals', 'st.scene': 'Demo state', 'st.pos': 'Ln {l}, Col {c}',
    'scene.ok': 'Success', 'scene.err': 'Wrong table', 'scene.empty': 'Empty result', 'scene.slow': 'Slow query',
    'tab.new': 'New tab', 'tab.sql': 'SQL query', 'tab.join': 'JOIN query', 'tab.set': 'Set operation', 'tab.pivot': 'Pivot table', 'tab.untitled': 'Untitled',
    'cmdk.ph': 'Search actions, tables or recent queries…', 'cmdk.nav': 'select', 'cmdk.go': 'run', 'cmdk.toggle': 'toggle', 'cmdk.none': 'No matches',
    'cmdk.actions': 'Actions', 'cmdk.goto': 'Go to', 'cmdk.tables': 'Tables', 'cmdk.recent': 'Recent runs',
    'toast.exported': 'Exported {f} ({n} rows)', 'toast.copied': 'Copied {n} rows to clipboard', 'toast.saved': 'Saved as DuckDB table {t}', 'toast.bookmarked': 'Saved “{t}”',
    'toast.async': 'Async task submitted. Pick it up from Runs when done', 'toast.asyncDone': 'Async task finished: {n} rows', 'toast.formatted': 'Formatted', 'toast.inserted': 'Inserted into editor',
    'toast.conn': 'Connected to {n}', 'toast.view': 'View', 'toast.cancel': 'Query cancelled', 'toast.imported': 'Imported table {t}',
    'dlg.saveT': 'Save as DuckDB table', 'dlg.saveD': 'Write this result into local DuckDB so it can be joined like any other table.', 'dlg.name': 'Table name', 'dlg.mode': 'If it already exists', 'dlg.new': 'Fail, don’t overwrite', 'dlg.replace': 'Replace', 'dlg.append': 'Append',
    'common.cancel': 'Cancel', 'common.save': 'Save', 'common.close': 'Close', 'common.copy': 'Copy', 'common.copied': 'Copied',
    'ai.title': 'AI assistant', 'ai.scope': 'Scope', 'ai.add': 'Add', 'ai.q': 'What was the paid amount of completed orders by region last month?',
    'ai.s1': 'Inspect schema · readme_demo_orders', 'ai.s2': 'Inspect schema · prod_crm.customers', 'ai.s3': 'Run read-only query',
    'ai.a': '<b>4 regions</b> had completed orders in September: East leads with <b>5,055.25</b>, then North 2,170.50, West 1,220.50 and South 415.75. The SQL below already ran in DuckDB and can be inserted into the editor.',
    'ai.insert': 'Insert into editor', 'ai.runIt': 'Run', 'ai.ev': 'Figures come from SQL executed by DuckDB. The model does no arithmetic.', 'ai.ph': 'Ask in plain language, or @ a table…', 'ai.hint': 'Read-only · your own key and model',
    'grid.copy': 'Copy', 'grid.copyCsv': 'Copy as CSV', 'grid.copyJson': 'Copy as JSON', 'grid.copyCol': 'Copy column name', 'grid.filterVal': 'Filter by this value', 'grid.excludeVal': 'Exclude this value', 'grid.clearFilter': 'Clear filter',
    'grid.selCells': '{n} cells selected', 'grid.sum': 'Sum', 'grid.avg': 'Avg', 'grid.rangeCopied': 'Copied {r} rows × {c} columns to clipboard', 'grid.allCopied': 'Copied all {n} rows (with header)', 'grid.filtered': '{n} of {t} rows',
    'grid.filter': 'Filter', 'grid.contains': 'contains', 'grid.equals': 'equals', 'grid.startsWith': 'starts with', 'grid.endsWith': 'ends with', 'grid.condPh': 'Condition value', 'grid.search': 'Search values…', 'grid.selectAll': 'Select all', 'grid.clearAll': 'Clear', 'grid.invert': 'Invert',
    'grid.colCopied': 'Copied column name {c}', 'grid.noMatch': 'No rows match the filters', 'grid.autoFit': 'Auto-size columns', 'grid.reset': 'Reset columns', 'grid.pasteHint': 'Detected table data on the clipboard',
    'props.title': 'Design proposals', 'props.lead': 'Every existing feature stays. These are suggested merges and more precise interactions. Click one to jump to it.', 'props.mark': 'Mark proposal locations in the UI', 'props.note': 'Sample data is illustrative',
  },
};
const S = {
  lang: (() => { try { return localStorage.getItem('dqp-lang') || 'zh' } catch (e) { return 'zh' } })(),
  view: 'work', exp: 'sources', rt: 'grid', scene: 'ok', running: false, result: null, sort: { c: null, d: 0 }, hidden: new Set(), sel: null,
  ai: false, max: false, open: new Set(['local', 'crm', 'local/readme_demo_orders']), filter: '', tabs: [], cur: null, seq: 3, bookmarks: [], runs: [],
};
const t = (k, v = {}) => (I18N[S.lang][k] ?? I18N.zh[k] ?? k).replace(/\{(\w+)\}/g, (_, x) => v[x] ?? '');

/* ---------------- demo data ---------------- */
const SOURCES = [
  { id: 'local', name: { zh: 'DuckDB 本地', en: 'DuckDB local' }, kind: 'DuckDB', st: 'ok', tables: [
    { n: 'readme_demo_orders', rows: '2.4k', cols: [['order_id', 'INTEGER'], ['customer_id', 'INTEGER'], ['region', 'VARCHAR'], ['status', 'VARCHAR'], ['amount', 'DECIMAL(10,2)'], ['created_at', 'TIMESTAMP']] },
    { n: 'payments_2026q3', rows: '18k', cols: [['payment_id', 'BIGINT'], ['order_id', 'INTEGER'], ['paid_at', 'TIMESTAMP'], ['amount', 'DECIMAL(10,2)'], ['channel', 'VARCHAR']] },
    { n: 'excel_对账_0930', rows: '1.2k', cols: [['单号', 'VARCHAR'], ['金额', 'DOUBLE'], ['日期', 'DATE']] },
    { n: 'sales_by_month', rows: '36', cols: [['month', 'DATE'], ['revenue', 'DECIMAL(12,2)']] },
  ] },
  { id: 'crm', name: { zh: 'prod_crm', en: 'prod_crm' }, kind: 'MySQL', st: 'ok', alias: 'mysql_prod_crm', tables: [
    { n: 'customers', rows: '612', cols: [['customer_id', 'INT'], ['customer_name', 'VARCHAR(120)'], ['segment', 'VARCHAR(32)'], ['city', 'VARCHAR(64)']] },
    { n: 'invoices', rows: '9.8k', cols: [['invoice_id', 'BIGINT'], ['order_id', 'INT'], ['amount', 'DECIMAL(10,2)'], ['issued_at', 'DATETIME']] },
    { n: 'refunds', rows: '311', cols: [['refund_id', 'BIGINT'], ['order_id', 'INT'], ['amount', 'DECIMAL(10,2)']] },
  ] },
  { id: 'fin', name: { zh: 'finance', en: 'finance' }, kind: 'PostgreSQL', st: 'ok', alias: 'pg_finance', tables: [
    { n: 'ledger_entries', rows: '41k', cols: [['entry_id', 'bigint'], ['account', 'text'], ['debit', 'numeric'], ['credit', 'numeric']] },
    { n: 'accounts', rows: '128', cols: [['account', 'text'], ['name', 'text']] },
  ] },
  { id: 'reg', name: { zh: 'regions.sqlite', en: 'regions.sqlite' }, kind: 'SQLite', st: 'off', tables: [] },
];
const ORDERS = {
  cols: [
    { k: 'order_id', ty: 'INTEGER', src: 'o', r: 1 }, { k: 'customer_name', ty: 'VARCHAR', src: 'c' }, { k: 'segment', ty: 'VARCHAR', src: 'c', tag: 1 },
    { k: 'region', ty: 'VARCHAR', src: 'o' }, { k: 'amount', ty: 'DECIMAL(10,2)', src: 'o', r: 1, money: 1 },
  ],
  rows: [
    [1004, 'Orbit Retail', 'Enterprise', 'East', 1940], [1011, 'Orbit Retail', 'Enterprise', 'East', 1425.25], [1001, 'Northwind Studio', 'Enterprise', 'North', 1280.5],
    [1009, 'Blue Harbor', 'SMB', 'East', 930], [1007, 'Northwind Studio', 'Enterprise', 'North', 890], [1002, 'Blue Harbor', 'SMB', 'East', 760],
    [1005, 'Field Notes', 'SMB', 'West', 680.5], [1008, 'Field Notes', 'SMB', 'West', 540], [1012, 'Lumen Labs', 'Mid-Market', 'South', 415.75],
  ],
  ms: 159, srcs: ['local', 'crm'],
};
const MONTHLY = { cols: [{ k: 'month', ty: 'DATE' }, { k: 'revenue', ty: 'DECIMAL(12,2)', r: 1, money: 1 }, { k: 'payments', ty: 'BIGINT', r: 1 }],
  rows: [['2026-07-01', 412880.4, 5931], ['2026-08-01', 438102.75, 6204], ['2026-09-01', 471356.1, 6519]], ms: 42, srcs: ['local'] };
const SQL_DEFAULT = {
  zh: `-- 已完成订单 × CRM 客户分层（本地 DuckDB + MySQL）\nSELECT\n  o.order_id,\n  c.customer_name,\n  c.segment,\n  o.region,\n  o.amount\nFROM readme_demo_orders AS o\nJOIN mysql_prod_crm.customers AS c\n  ON o.customer_id = c.customer_id\nWHERE o.status = 'completed'\nORDER BY o.amount DESC;`,
  en: `-- Completed orders × CRM segments (local DuckDB + MySQL)\nSELECT\n  o.order_id,\n  c.customer_name,\n  c.segment,\n  o.region,\n  o.amount\nFROM readme_demo_orders AS o\nJOIN mysql_prod_crm.customers AS c\n  ON o.customer_id = c.customer_id\nWHERE o.status = 'completed'\nORDER BY o.amount DESC;`,
};
const SQL_MONTHLY = `SELECT\n  date_trunc('month', paid_at) AS month,\n  sum(amount) AS revenue,\n  count(*) AS payments\nFROM payments_2026q3\nGROUP BY 1\nORDER BY 1;`;
S.tabs = [
  { id: 't1', title: { zh: '订单 × 客户', en: 'orders × customers' }, type: 'sql', sql: SQL_DEFAULT[S.lang], data: 'orders' },
  { id: 't2', title: { zh: '月度营收', en: 'monthly revenue' }, type: 'sql', sql: SQL_MONTHLY, data: 'monthly' },
  { id: 't3', title: { zh: '订单 ⋈ 发票', en: 'orders ⋈ invoices' }, type: 'join', sql: '', data: 'orders' },
];
S.cur = 't1';
S.runs = [
  { id: 'r1', sql: 'SELECT region, sum(amount) FROM readme_demo_orders GROUP BY 1', st: 'ok', rows: 4, ms: 31, when: '10:42', day: 0 },
  { id: 'r2', sql: 'COPY (SELECT * FROM pg_finance.ledger_entries) TO …', st: 'run', pct: 46, when: '10:38', day: 0, async: 1 },
  { id: 'r3', sql: 'SELECT * FROM mysql_prod_crm.refund WHERE …', st: 'err', when: '10:21', day: 0 },
  { id: 'r4', sql: 'SELECT * FROM excel_对账_0930 EXCEPT SELECT …', st: 'ok', rows: 37, ms: 88, when: '昨天 18:05', day: 1 },
];
S.bookmarks = [{ id: 'b1', title: { zh: '月度营收', en: 'monthly revenue' }, sql: SQL_MONTHLY }];
const curTab = () => S.tabs.find(x => x.id === S.cur);
const tabTitle = tb => tb.title[S.lang] || tb.title.zh;

/* ---------------- toasts & menus ---------------- */
function toast(msg, kind = 'ok', action) {
  const el = document.createElement('div');
  el.className = 'toast ' + kind;
  el.innerHTML = `${ic(kind === 'err' ? 'alert' : kind === 'info' ? 'clock' : 'check')}<span>${msg}</span>${action ? `<button>${action.label}</button>` : ''}`;
  if (action) el.querySelector('button').onclick = () => { action.fn(); el.remove(); };
  $('#toasts').append(el);
  setTimeout(() => { el.style.transition = 'opacity .2s'; el.style.opacity = 0; setTimeout(() => el.remove(), 220); }, 3600);
}
let menuOwner = null;
function openMenu(anchor, html, bind) {
  const m = $('#menu');
  if (menuOwner === anchor && m.classList.contains('on')) return closeMenu();
  m.innerHTML = html; m.classList.add('on'); menuOwner = anchor;
  const r = anchor.getBoundingClientRect(), mw = m.offsetWidth, mh = m.offsetHeight;
  let x = Math.min(r.left, innerWidth - mw - 8), y = r.bottom + 4;
  if (y + mh > innerHeight - 8) y = r.top - mh - 4;
  m.style.left = Math.max(8, x) + 'px'; m.style.top = Math.max(8, y) + 'px';
  bind && bind(m);
  m.querySelector('button')?.focus({ preventScroll: true });
}
function closeMenu() { $('#menu').classList.remove('on'); menuOwner = null; }
document.addEventListener('pointerdown', e => { if (!e.target.closest('#menu') && !e.target.closest('[data-act]')) closeMenu(); });

/* ---------------- i18n apply ---------------- */
function applyI18n() {
  document.documentElement.lang = S.lang === 'zh' ? 'zh' : 'en';
  document.title = S.lang === 'zh' ? 'DuckQuery 原型' : 'DuckQuery prototype';
  $$('[data-i]').forEach(el => el.textContent = t(el.dataset.i));
  $$('[data-i-ph]').forEach(el => el.placeholder = t(el.dataset.iPh));
  $$('[data-i-title]').forEach(el => { el.title = t(el.dataset.iTitle); el.setAttribute('aria-label', t(el.dataset.iTitle)); });
  $$('[data-i-tip]').forEach(el => { el.dataset.tip = t(el.dataset.iTip); el.setAttribute('aria-label', t(el.dataset.iTip)); });
  // keep untouched default SQL in the active language
  S.tabs.forEach(tb => { if (tb.sql === SQL_DEFAULT.zh || tb.sql === SQL_DEFAULT.en) tb.sql = SQL_DEFAULT[S.lang]; });
  if (curTab().type === 'sql') { $('#sql').value = curTab().sql; paintEditor(); }
  renderAll();
}
function renderAll() {
  renderTabs(); renderTree(); renderFed(); renderResults(); renderStatus(); renderAi();
  window.renderPages && renderPages();
}

/* ---------------- shell ---------------- */
function setView(v) {
  S.view = v;
  $$('.view').forEach(x => x.classList.toggle('on', x.id === 'v-' + v));
  $$('.rb[data-view]').forEach(b => b.classList.toggle('on', b.dataset.view === v));
  $('#app').classList.toggle('no-exp', v !== 'work' || $('#app').dataset.exp === 'off');
  if (v === 'work') requestAnimationFrame(syncScroll);
}
function toggleExplorer() {
  if (innerWidth <= 900) { $('#app').classList.toggle('exp-mobile'); return; }
  const off = $('#app').dataset.exp === 'off';
  $('#app').dataset.exp = off ? 'on' : 'off';
  $('#app').classList.toggle('no-exp', !off || S.view !== 'work');
}
function setTheme(th) {
  document.documentElement.dataset.theme = th;
  try { localStorage.setItem('dqp-theme', th) } catch (e) {}
  renderStatus();
}
function setLang(l) { S.lang = l; try { localStorage.setItem('dqp-lang', l) } catch (e) {} applyI18n(); }
function toggleAi(force) {
  S.ai = force ?? !S.ai;
  $('#app').classList.toggle('ai-on', S.ai);
  $('#app').style.setProperty('--ai-w', S.ai && innerWidth > 900 ? '380px' : '0px');
  $('#railAi').classList.toggle('on', S.ai);
  if (S.ai) setTimeout(() => $('#aiInput')?.focus(), 200);
}

/* ---------------- explorer ---------------- */
function renderTree() {
  $$('[data-exp]').forEach(b => b.classList.toggle('on', b.dataset.exp === S.exp));
  const running = S.runs.filter(r => r.st === 'run').length;
  $('#runCount').textContent = running ? running : '';
  const el = $('#tree'), f = S.filter.trim().toLowerCase();
  $('.search').style.display = S.exp === 'sources' ? '' : 'none';
  if (S.exp === 'runs') {
    const item = r => `<div class="run-item" data-run="${r.id}" role="button" tabindex="0">
      <span class="st ${r.st}">${ic(r.st === 'ok' ? 'check' : r.st === 'err' ? 'alert' : 'loader', 's')}</span>
      <span class="t">${esc(r.sql)}</span><span class="d">${esc(r.when)}</span>
      <span class="m">${r.async ? `<span>${S.lang === 'zh' ? '异步' : 'Async'}</span>` : ''}${r.st === 'ok' ? `<span>${t('res.rows', { n: r.rows })}</span><span>${r.ms} ms</span>` : r.st === 'err' ? `<span style="color:var(--err)">${S.lang === 'zh' ? '表不存在' : 'Table not found'}</span>` : `<span>${r.pct}%</span>`}</span>
      ${r.st === 'run' ? `<span class="bar"><i style="width:${r.pct}%"></i></span>` : ''}</div>`;
    el.innerHTML = `<div class="day">${t('exp.today')}</div>${S.runs.filter(r => !r.day).map(item).join('')}<div class="day">${t('exp.earlier')}</div>${S.runs.filter(r => r.day).map(item).join('')}`;
    return;
  }
  if (S.exp === 'saved') {
    el.innerHTML = S.bookmarks.length ? S.bookmarks.map(b => `<div class="row" data-bm="${b.id}" role="button" tabindex="0">${ic('star', 's')}<span class="lbl">${esc(b.title[S.lang] || b.title.zh)}</span></div>`).join('')
      : `<div class="empty-note">${t('exp.savedEmpty')}</div>`;
    return;
  }
  let html = '', any = false;
  for (const s of SOURCES) {
    const tables = s.tables.filter(tb => !f || tb.n.toLowerCase().includes(f) || tb.cols.some(c => c[0].toLowerCase().includes(f)));
    if (f && !tables.length) continue;
    any = true;
    const open = f || S.open.has(s.id);
    html += `<div class="row grp ${open ? 'open' : ''}" data-node="${s.id}" role="treeitem" aria-expanded="${!!open}" tabindex="0">${ic('chev', 's cv')}<span class="dot ${s.st === 'off' ? 'off' : ''}"></span><span class="lbl">${esc(s.name[S.lang])}</span>${s.id === 'local' ? '' : `<span class="kind">${s.kind}</span>`}${s.st === 'off' ? '' : `<span class="meta">${t('exp.tables', { n: s.tables.length })}</span>`}</div>`;
    if (!open) continue;
    if (s.st === 'off') { html += `<div class="row off-row" style="padding-left:26px">${ic('plug', 's')}<span class="lbl">${t('exp.offline')}</span><button class="retry" data-retry="${s.id}">${t('exp.retry')}</button></div>`; continue; }
    for (const tb of tables) {
      const key = s.id + '/' + tb.n, topen = S.open.has(key) || (f && tb.cols.some(c => c[0].toLowerCase().includes(f)));
      html += `<div class="row tbl ${topen ? 'open' : ''}" data-node="${key}" data-src="${s.id}" data-t="${tb.n}" role="treeitem" tabindex="0">${ic('chev', 's cv')}${ic('table', 's')}<span class="lbl">${esc(tb.n)}</span>
        <span class="acts"><button class="ib" data-ins="${s.id}|${tb.n}" title="${t('exp.insert')}">${ic('plus', 's')}</button><button class="ib" data-prev="${s.id}|${tb.n}" title="${t('exp.preview')}">${ic('eye', 's')}</button></span><span class="meta">${tb.rows}</span></div>`;
      if (topen) for (const c of tb.cols) if (!f || !tb.n.toLowerCase().includes(f) ? (!f || c[0].toLowerCase().includes(f)) : true)
        html += `<div class="row col">${ic('col', 's')}<span class="lbl">${esc(c[0])}</span><span class="meta">${esc(c[1])}</span></div>`;
    }
  }
  el.innerHTML = any ? html : `<div class="empty-note">${t('exp.noMatch')}</div>`;
}
const refName = (sid, n) => { const s = SOURCES.find(x => x.id === sid); return s.alias ? `${s.alias}.${n}` : n; };
$('#tree').addEventListener('click', e => {
  const ins = e.target.closest('[data-ins]'), prev = e.target.closest('[data-prev]'), retry = e.target.closest('[data-retry]');
  if (ins) { const [s, n] = ins.dataset.ins.split('|'); insertAtCursor(refName(s, n)); toast(t('toast.inserted'), 'info'); return; }
  if (prev) { const [s, n] = prev.dataset.prev.split('|'); newTab('sql', `SELECT *\nFROM ${refName(s, n)}\nLIMIT 100;`, n, 'preview:' + s + '/' + n); run(); return; }
  if (retry) { const s = SOURCES.find(x => x.id === retry.dataset.retry); retry.textContent = '…'; setTimeout(() => toast(S.lang === 'zh' ? `${s.name.zh} 仍不可达：文件不存在` : `${s.name.en} still unreachable: file not found`, 'err'), 700); return; }
  const run_ = e.target.closest('[data-run]'); if (run_) { const r = S.runs.find(x => x.id === run_.dataset.run); newTab('sql', r.sql, r.sql.slice(0, 18) + '…'); return; }
  const bm = e.target.closest('[data-bm]'); if (bm) { const b = S.bookmarks.find(x => x.id === bm.dataset.bm); newTab('sql', b.sql, b.title[S.lang]); return; }
  const node = e.target.closest('[data-node]'); if (!node) return;
  const k = node.dataset.node; S.open.has(k) ? S.open.delete(k) : S.open.add(k);
  $$('.row.sel').forEach(r => r.classList.remove('sel'));
  renderTree();
  $(`[data-node="${CSS.escape(k)}"]`)?.classList.add('sel');
});
$('#tree').addEventListener('dblclick', e => { const n = e.target.closest('.row.tbl'); if (n) { insertAtCursor(refName(n.dataset.src, n.dataset.t)); toast(t('toast.inserted'), 'info'); } });
$('#tree').addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[data-node],[data-run],[data-bm]')) { e.preventDefault(); e.target.click(); } });
$$('[data-exp]').forEach(b => b.onclick = () => { S.exp = b.dataset.exp; renderTree(); });
$('#treeFilter').addEventListener('input', e => { S.filter = e.target.value; renderTree(); });

/* ---------------- tabs ---------------- */
const TAB_IC = { sql: 'code', join: 'merge', set: 'layers', pivot: 'pivot' };
function renderTabs() {
  $('#etabs').innerHTML = S.tabs.map(tb => `<div class="etab ${tb.id === S.cur ? 'on' : ''}" data-tab="${tb.id}" role="tab" tabindex="0" aria-selected="${tb.id === S.cur}">${ic(TAB_IC[tb.type], 's')}<span class="tt">${esc(tabTitle(tb))}</span><button class="x" data-close="${tb.id}" aria-label="${t('common.close')}">${ic('x', 's')}</button></div>`).join('')
    + `<button class="add" data-act="newTabMenu" aria-label="${t('tab.new')}" title="${t('tab.new')} ⌘T">${ic('plus')}</button><div class="sp"></div>`;
  $('#v-work').classList.toggle('join', curTab().type !== 'sql');
  if (curTab().type !== 'sql') renderBuilder();
}
$('#etabs').addEventListener('click', e => {
  const c = e.target.closest('[data-close]');
  if (c) { e.stopPropagation(); closeTab(c.dataset.close); return; }
  const tb = e.target.closest('[data-tab]'); if (tb) switchTab(tb.dataset.tab);
});
$('#etabs').addEventListener('auxclick', e => { const tb = e.target.closest('[data-tab]'); if (tb && e.button === 1) closeTab(tb.dataset.tab); });
function switchTab(id) {
  if (curTab().type === 'sql') curTab().sql = $('#sql').value;
  S.cur = id; renderTabs();
  if (curTab().type === 'sql') { $('#sql').value = curTab().sql; paintEditor(); }
  renderFed();
}
function newTab(type = 'sql', sql = '', title, data) {
  if (curTab().type === 'sql') curTab().sql = $('#sql').value;
  const id = 't' + (++S.seq);
  const ttl = title ? { zh: title, en: title } : { zh: `${t('tab.untitled')} ${S.seq - 2}`, en: `Untitled ${S.seq - 2}` };
  if (!title && type !== 'sql') { ttl.zh = I18N.zh['tab.' + type]; ttl.en = I18N.en['tab.' + type]; }
  S.tabs.push({ id, title: ttl, type, sql, data: data || (type === 'sql' && !sql ? 'none' : 'orders') });
  switchTab(id);
  if (type === 'sql') $('#sql').focus();
}
function closeTab(id) {
  if (S.tabs.length === 1) { curTab().sql = ''; $('#sql').value = ''; paintEditor(); return; }
  const i = S.tabs.findIndex(x => x.id === id);
  S.tabs.splice(i, 1);
  if (S.cur === id) { S.cur = S.tabs[Math.max(0, i - 1)].id; if (curTab().type === 'sql') { $('#sql').value = curTab().sql; paintEditor(); } }
  renderTabs();
}

/* ---------------- JOIN builder (tab type) ---------------- */
const B = { type: 'LEFT', lc: new Set(['order_id', 'region', 'amount']), rc: new Set(['invoice_id', 'amount']) };
function builderSql() {
  const sel = [...B.lc].map(c => `o.${c}`).concat([...B.rc].map(c => `i.${c}${c === 'amount' ? ' AS invoice_amount' : ''}`));
  return `SELECT\n  ${sel.join(',\n  ')}\nFROM readme_demo_orders AS o\n${B.type} JOIN mysql_prod_crm.invoices AS i\n  ON o.order_id = i.order_id;`;
}
function renderBuilder() {
  const L = SOURCES[0].tables[0], R = SOURCES[1].tables[1];
  const li = (c, set) => `<li class="${set.has(c[0]) ? 'on' : ''}" data-c="${c[0]}"><span class="ck">${set.has(c[0]) ? ic('check', 's') : ''}</span>${esc(c[0])}<small>${c[1]}</small></li>`;
  $('#builder').innerHTML = `<div class="bgrid">
    <div class="bcard" data-side="l"><header>${ic('table', 's')}readme_demo_orders<small>${t('fed.local')}</small></header><ul>${L.cols.map(c => li(c, B.lc)).join('')}</ul></div>
    <div class="jt"><div class="seg">${['INNER', 'LEFT', 'RIGHT', 'FULL'].map(x => `<button class="${B.type === x ? 'on' : ''}" data-jt="${x}">${x}</button>`).join('')}</div></div>
    <div class="bcard" data-side="r"><header>${ic('table', 's')}invoices<small>MySQL · prod_crm</small></header><ul>${R.cols.map(c => li(c, B.rc)).join('')}</ul></div></div>
    <div class="on-row">ON <span class="pillsel">o.order_id ${ic('down', 's')}</span> = <span class="pillsel">i.order_id ${ic('down', 's')}</span><button class="btn">${ic('plus', 's')}${S.lang === 'zh' ? '添加条件' : 'Add condition'}</button></div>
    <div class="gen"><header><span>${S.lang === 'zh' ? '生成的 SQL' : 'Generated SQL'}</span><span class="sp"></span><button class="btn" data-act="builderToSql">${ic('code', 's')}${S.lang === 'zh' ? '在 SQL 标签中打开' : 'Open in SQL tab'}</button></header><pre>${highlight(builderSql())}</pre></div>`;
}
$('#builder').addEventListener('click', e => {
  const jt = e.target.closest('[data-jt]'); if (jt) { B.type = jt.dataset.jt; renderBuilder(); return; }
  const c = e.target.closest('li[data-c]'); if (c) { const set = c.closest('[data-side]').dataset.side === 'l' ? B.lc : B.rc; set.has(c.dataset.c) ? set.delete(c.dataset.c) : set.add(c.dataset.c); renderBuilder(); }
});

/* ---------------- editor ---------------- */
const KW = new Set('SELECT FROM JOIN LEFT RIGHT FULL OUTER INNER CROSS ON WHERE AND OR NOT IN IS NULL AS ORDER BY GROUP HAVING LIMIT DESC ASC WITH UNION ALL DISTINCT CASE WHEN THEN ELSE END BETWEEN LIKE OVER PARTITION COPY TO EXCEPT INTERSECT USING QUALIFY INTERVAL'.split(' '));
function highlight(src, badLine = -1) {
  const re = /(--[^\n]*)|('(?:[^']|'')*'?)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_一-龥][\w一-龥]*)(?=\s*\()|([A-Za-z_一-龥][\w一-龥]*)|([(),;.*=<>+\-/])/g;
  let out = '', last = 0, m;
  while ((m = re.exec(src))) {
    out += esc(src.slice(last, m.index)); last = re.lastIndex;
    const [w, c, s, n, f, id, p] = m;
    if (c) out += `<span class="c">${esc(c)}</span>`;
    else if (s) out += `<span class="s">${esc(s)}</span>`;
    else if (n) out += `<span class="n">${n}</span>`;
    else if (f) out += KW.has(f.toUpperCase()) ? `<span class="k">${esc(f)}</span>` : `<span class="f">${esc(f)}</span>`;
    else if (id) out += KW.has(id.toUpperCase()) ? `<span class="k">${esc(id)}</span>` : esc(id);
    else out += `<span class="p">${esc(p)}</span>`;
  }
  out += esc(src.slice(last));
  if (badLine < 0) return out;
  return out.split('\n').map((l, i) => i === badLine ? `<span class="ln-bad">${l}</span>` : l).join('\n');
}
const ta = $('#sql');
function badLineIdx() { return S.result?.error ? ta.value.split('\n').findIndex(l => /mysql_prod_crm\.customer\b(?!s)/.test(l)) : -1; }
function paintEditor() {
  const v = ta.value, bad = badLineIdx();
  $('#hl').innerHTML = highlight(v, bad) + '\n';
  const n = v.split('\n').length;
  const line = v.slice(0, ta.selectionStart).split('\n').length;
  $('#gutter').innerHTML = Array.from({ length: n }, (_, i) => `<div class="${i + 1 === line ? 'cur' : ''} ${i === bad ? 'bad' : ''}">${i + 1}</div>`).join('');
  syncScroll();
  renderStatus();
}
function syncScroll() {
  const pre = $('#hl');
  pre.scrollTop = ta.scrollTop; pre.scrollLeft = ta.scrollLeft;
  $('#gutter').scrollTop = ta.scrollTop;
  const line = ta.value.slice(0, ta.selectionStart).split('\n').length;
  $('#curline').style.top = (12 + (line - 1) * 22 - ta.scrollTop) + 'px';
}
ta.addEventListener('input', () => { curTab().sql = ta.value; if (S.result?.error) S.result = null; paintEditor(); renderFed(); });
ta.addEventListener('scroll', syncScroll);
['click', 'keyup'].forEach(ev => ta.addEventListener(ev, () => { paintEditor(); }));
ta.addEventListener('keydown', e => {
  if (e.key === 'Tab') { e.preventDefault(); document.execCommand('insertText', false, '  '); }
});
function insertAtCursor(text) {
  if (S.view !== 'work') setView('work');
  if (curTab().type !== 'sql') newTab('sql');
  ta.focus(); document.execCommand('insertText', false, text);
}
function formatSql(s) {
  const lines = s.split('\n'), head = [], body = [];
  lines.forEach(l => (/^\s*--/.test(l) && !body.length ? head : body).push(l));
  let b = body.join(' ').replace(/\s+/g, ' ').trim();
  b = b.replace(/\b(select|from|join|left join|right join|full join|inner join|where|group by|order by|having|limit|on|and|as|desc|asc|sum|count|date_trunc)\b/gi, m => m.toUpperCase());
  b = b.replace(/\s+(FROM|WHERE|GROUP BY|ORDER BY|HAVING|LIMIT)\s+/g, '\n$1 ')
    .replace(/\s+((?:LEFT |RIGHT |FULL |INNER )?JOIN)\s+/g, '\n$1 ').replace(/\s+ON\s+/g, '\n  ON ').replace(/\s+AND\s+/g, '\n  AND ');
  b = b.replace(/^SELECT\s+([\s\S]*?)(\nFROM|$)/, (_, cols, rest) => 'SELECT\n  ' + cols.split(/,\s*/).join(',\n  ') + rest);
  return [...head, b].join('\n');
}

/* ---------------- federation chip ---------------- */
function detectSources(sql) {
  const s = new Set();
  if (/\b(readme_demo_orders|payments_2026q3|excel_|sales_by_month)/.test(sql)) s.add('local');
  if (/mysql_prod_crm\./.test(sql)) s.add('crm');
  if (/pg_finance\./.test(sql)) s.add('fin');
  return [...s];
}
function renderFed() {
  const tb = curTab(); const sql = tb.type === 'sql' ? (tb.id === S.cur ? ta.value : tb.sql) : builderSql();
  const src = detectSources(sql), ext = src.filter(x => x !== 'local');
  const label = ext.length && src.includes('local') ? t('fed.fed') : ext.length ? t('fed.ext') : t('fed.local');
  $('#fedChip').innerHTML = `${ic(ext.length ? 'merge' : 'hdd', 's')}<b>${label}</b><span class="srcs">${src.map(x => `<span>${x === 'local' ? 'local' : SOURCES.find(s => s.id === x).name.en}</span>`).join('')}</span>${ic('down', 's')}`;
}

/* ---------------- run ---------------- */
let runTimer = null, slowTimer = null, tick = null;
function outcome() {
  const tb = curTab(), sql = tb.type === 'sql' ? ta.value : builderSql();
  if (/mysql_prod_crm\.customer\b(?!s)/.test(sql)) return 'err';
  if (/status\s*=\s*'void'/.test(sql)) return 'empty';
  return 'ok';
}
function run(opts = {}) {
  if (S.running) return cancel();
  if (S.view !== 'work') setView('work');
  S.running = true; S.t0 = performance.now();
  S.result = null; S.sel = null;
  const slow = S.scene === 'slow';
  $('#runBtn').classList.add('stop'); $('#runBtn').querySelector('use').setAttribute('href', '#i-stop'); $('#runBtn').querySelector('[data-i]').textContent = t('tb.stop');
  $('#progress').classList.add('on');
  renderResults();
  tick = setInterval(() => { const el = $('#elapsed'); if (el) el.textContent = ((performance.now() - S.t0) / 1000).toFixed(1) + ' s'; }, 100);
  if (slow) slowTimer = setTimeout(() => { S.showSlow = true; renderResults(); }, 1800);
  runTimer = setTimeout(finish, slow ? 6000 : 650 + Math.random() * 250);
}
function stopUi() {
  S.running = false; S.showSlow = false; clearTimeout(runTimer); clearTimeout(slowTimer); clearInterval(tick);
  $('#runBtn').classList.remove('stop'); $('#runBtn').querySelector('use').setAttribute('href', '#i-play'); $('#runBtn').querySelector('[data-i]').textContent = t('tb.run');
  $('#progress').classList.remove('on');
}
function cancel() { stopUi(); S.result = null; renderResults(); toast(t('toast.cancel'), 'info'); }
function finish() {
  stopUi();
  const o = outcome(), tb = curTab();
  if (o === 'err') {
    S.result = { error: true };
    S.runs.unshift({ id: 'r' + Date.now(), sql: ta.value.split('\n').find(l => !l.startsWith('--')) + ' …', st: 'err', when: now(), day: 0 });
  } else {
    let d = tb.data === 'monthly' ? MONTHLY : tb.data && tb.data.startsWith('preview:') ? previewData(tb.data.slice(8)) : ORDERS;
    if (o === 'empty') d = { ...d, rows: [] };
    S.result = d; S.sort = { c: null, d: 0 }; S.hidden.clear(); S.filters = {}; S.widths = {}; S.sel = null;
    S.runs.unshift({ id: 'r' + Date.now(), sql: (tb.type === 'sql' ? ta.value : builderSql()).split('\n').filter(l => !l.startsWith('--')).join(' ').replace(/\s+/g, ' ').slice(0, 80), st: 'ok', rows: d.rows.length, ms: d.ms, when: now(), day: 0 });
  }
  if (S.rt === 'msgs' && !S.result.error) S.rt = 'grid';
  paintEditor(); renderResults(); renderTree();
}
const now = () => new Date().toTimeString().slice(0, 5);
function previewData(key) {
  const [sid, n] = key.split('/'), tb = SOURCES.find(s => s.id === sid).tables.find(x => x.n === n);
  const gen = (ty, i, name) => /INT|BIGINT|bigint/i.test(ty) ? 1000 + i * 7 : /DEC|DOUBLE|numeric/i.test(ty) ? +(120 + ((i * 7919) % 2400) + (i % 4) * .25).toFixed(2)
    : /DATE|TIME/i.test(ty) ? `2026-09-${String(1 + (i % 28)).padStart(2, '0')}${/TIME/i.test(ty) ? ' 10:' + String(10 + i).padStart(2, '0') : ''}`
    : name === 'segment' ? ['Enterprise', 'SMB', 'Mid-Market'][i % 3] : name === 'city' ? ['上海', '杭州', '北京', '深圳'][i % 4] : name === 'channel' ? ['alipay', 'wechat', 'card'][i % 3]
    : name === 'status' ? ['completed', 'completed', 'pending'][i % 3] : name === 'region' ? ['East', 'North', 'West', 'South'][i % 4]
    : name.includes('name') ? ['Orbit Retail', 'Blue Harbor', 'Northwind Studio', 'Field Notes', 'Lumen Labs'][i % 5] : `${name}_${i + 1}`;
  return { cols: tb.cols.map(c => ({ k: c[0], ty: c[1].toUpperCase(), r: /INT|DEC|DOUBLE|numeric/i.test(c[1]) ? 1 : 0, money: /DEC|numeric/i.test(c[1]) })),
    rows: Array.from({ length: 24 }, (_, i) => tb.cols.map(c => i === 5 && /DATE|TIME|DEC/i.test(c[1]) && c[0] !== 'amount' ? null : gen(c[1], i, c[0]))), ms: 23 + n.length, srcs: [sid] };
}

/* ---------------- results grid: range selection, copy, filters (parity with Query/DataGrid) ---------------- */
// S.sel = { a:{r,c}, e:{r,c} } in view coordinates (filtered + sorted rows × visible columns)
S.filters = {}; S.widths = {};
const cellText = v => v == null ? '' : String(v);
function passFilter(f, v) {
  const s = cellText(v);
  if (f.vals && !f.vals.has(s)) return false;
  if (f.q) { const a = s.toLowerCase(), q = f.q.toLowerCase(); if (f.op === 'equals' ? a !== q : f.op === 'startsWith' ? !a.startsWith(q) : f.op === 'endsWith' ? !a.endsWith(q) : !a.includes(q)) return false; }
  return true;
}
function viewRows(d) {
  const keys = Object.keys(S.filters);
  const rows = d.rows.map((r, i) => ({ r, i })).filter(({ r }) => keys.every(k => passFilter(S.filters[k], r[d.cols.findIndex(c => c.k === k)])));
  if (S.sort.c != null && S.sort.d) rows.sort((a, b) => { const x = a.r[S.sort.c], y = b.r[S.sort.c]; return (x > y ? 1 : x < y ? -1 : 0) * S.sort.d; });
  return rows;
}
const visCols = d => d.cols.map((c, i) => ({ ...c, i })).filter(c => !S.hidden.has(c.k));
function selBox() { if (!S.sel) return null; const { a, e } = S.sel; return { r0: Math.min(a.r, e.r), r1: Math.max(a.r, e.r), c0: Math.min(a.c, e.c), c1: Math.max(a.c, e.c) }; }
function rangeValues() {
  const d = S.result, b = selBox(); if (!b) return null;
  const rows = viewRows(d), vis = visCols(d), cols = vis.slice(b.c0, b.c1 + 1);
  return { cols, data: rows.slice(b.r0, b.r1 + 1).map(({ r }) => cols.map(c => r[c.i])) };
}
// same escaping rules as useGridCopy: TSV without header, quote only when a delimiter/newline/quote is present
function toText(cols, data, kind) {
  if (kind === 'json') return JSON.stringify(data.map(row => Object.fromEntries(row.map((v, i) => [cols[i].k, v]))), null, 2);
  const q = kind === 'csv' ? /[,"\n\r]/ : /[\t"\n\r]/;
  const e = v => { const x = cellText(v); return q.test(x) ? `"${x.replace(/"/g, '""')}"` : x; };
  return data.map(row => row.map(e).join(kind === 'csv' ? ',' : '\t')).join('\n');
}
function copyRange(kind = 'tsv') {
  const rv = rangeValues(); if (!rv) return;
  navigator.clipboard?.writeText(toText(rv.cols, rv.data, kind)).catch(() => {});
  toast(t('grid.rangeCopied', { r: rv.data.length, c: rv.cols.length }) + (kind !== 'tsv' ? ` · ${kind.toUpperCase()}` : ''));
}
function selStats() {
  const b = selBox(); if (!b) return '';
  let out = `<span>${t('grid.selCells', { n: (b.r1 - b.r0 + 1) * (b.c1 - b.c0 + 1) })}</span>`;
  const rv = rangeValues(), col = rv.cols.length === 1 ? rv.cols[0] : null;
  if (col && col.r) {
    const nums = rv.data.map(x => x[0]).filter(v => typeof v === 'number');
    if (nums.length > 1) { const sum = nums.reduce((a, x) => a + x, 0); out += `<span>${t('grid.sum')} <b>${fmt(sum, col.money ? 2 : 0)}</b></span><span>${t('grid.avg')} <b>${fmt(sum / nums.length)}</b></span>`; }
  }
  return out;
}
function paintSel() {
  const b = selBox();
  $$('#rbody td[data-cell]').forEach(td => {
    const [r, c] = td.dataset.cell.split(':').map(Number);
    const inR = b && r >= b.r0 && r <= b.r1 && c >= b.c0 && c <= b.c1;
    td.classList.toggle('in-range', !!inR && (b.r0 !== b.r1 || b.c0 !== b.c1));
    td.classList.toggle('cell-sel', !!S.sel && r === S.sel.e.r && c === S.sel.e.c);
  });
  $$('#rbody td[data-row]').forEach(td => { const r = +td.dataset.row; td.classList.toggle('rn-on', !!b && r >= b.r0 && r <= b.r1); });
  const st = $('#rfoot .selstat'); if (st) st.innerHTML = selStats();
}
function setSel(a, e) { S.sel = { a, e: e || a }; paintSel(); }
function scrollCellIntoView() { $(`#rbody td[data-cell="${S.sel.e.r}:${S.sel.e.c}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }

function renderResults() {
  const body = $('#rbody'), d = S.result;
  $$('.rtab').forEach(b => b.classList.toggle('on', b.dataset.rt === S.rt));
  $('#cntGrid').textContent = d && !d.error ? d.rows.length : '';
  $('#cntMsgs').textContent = d?.error ? '1' : ''; $('#cntMsgs').classList.toggle('err', !!d?.error);
  const hasData = d && !d.error && d.rows.length;
  $$('.rbar .btn').forEach(b => b.toggleAttribute('disabled', !hasData));
  body.tabIndex = hasData && S.rt === 'grid' ? 0 : -1;
  let foot = '';
  if (S.running) {
    body.innerHTML = `<div class="state"><div class="box"><div class="ic">${ic('loader', 'l st run')}</div><h3>${t('res.running')}</h3><div class="mono" id="elapsed">0.0 s</div></div></div>`
      + (S.showSlow ? `<div class="slow">${ic('clock', 's')}<span>${t('res.slow', { s: Math.round((performance.now() - S.t0) / 1000) })}</span><button class="btn line" data-act="toAsync" data-prop="5">${t('res.toAsync')}</button></div>` : '');
    foot = `<span>${t('res.running')}</span>`;
  } else if (!d) {
    body.innerHTML = `<div class="state"><div class="box"><div class="ic">${ic('play', 'l')}</div><h3>${t('res.idleT')}</h3><p>${t('res.idleD')}</p></div></div>`;
  } else if (d.error) {
    S.rt = S.rt === 'chart' ? 'grid' : S.rt;
    const lines = ta.value.split('\n'), li = lines.findIndex(l => /mysql_prod_crm\.customer\b(?!s)/.test(l)), col = li >= 0 ? lines[li].indexOf('mysql_prod_crm') : 0;
    body.innerHTML = `<div class="errbox"><div class="errcard"><header>${ic('alert', 's')}${t('res.errT')} · Catalog Error</header>
      <pre>Table with name <b>customer</b> does not exist in catalog <b>mysql_prod_crm</b>!\nLINE ${li + 1}: ${esc(lines[li] || '')}\n${' '.repeat(7 + String(li + 1).length + col)}<span class="caret">^</span></pre>
      <footer><span class="hint">${t('res.didYouMean', { a: '<code>customers</code>' })}</span><button class="btn inv" data-act="fixTable">${ic('check', 's')}${t('res.fix', { a: 'customers' })}</button><button class="btn line" data-act="toggleAi">${ic('spark', 's')}${t('res.aiFix')}</button></footer></div></div>`;
    foot = `<span style="color:var(--err)">${ic('alert', 's')}</span><span>${t('res.errT')}</span><span class="mono">${S.lang === 'zh' ? `第 ${li + 1} 行，第 ${col + 1} 列` : `line ${li + 1}, col ${col + 1}`}</span>`;
  } else if (S.rt === 'msgs') {
    const L = [['ok', 'check', t('msg.parse'), '2 ms'], ['ok', 'check', t('msg.detect'), ''], ['bolt', 'bolt', t('msg.push'), '61 ms'], ['ok', 'check', t('msg.exec'), '94 ms'], ['ok', 'check', t('msg.done', { n: d.rows.length }), d.ms + ' ms']];
    body.innerHTML = `<div class="msgs">${L.map((l, i) => `<div><time>10:4${6}:0${i}.${120 + i * 37}</time><span class="${l[0]}">${ic(l[1], 's')}</span><span>${l[2]} <em>${l[3]}</em></span></div>`).join('')}</div>`;
  } else if (!d.rows.length) {
    body.innerHTML = `<div class="state"><div class="box"><div class="ic">${ic('table', 'l')}</div><h3>${t('res.emptyT')}</h3><p>${t('res.emptyD')}</p><div class="acts"><button class="btn line" data-rt-go="msgs">${t('res.showMsgs')}</button></div></div></div>`;
  } else if (S.rt === 'chart') {
    body.innerHTML = chartSvg(d);
  } else {
    const vis = visCols(d), rows = viewRows(d);
    const srcName = c => c.src === 'c' ? 'prod_crm' : c.src === 'o' ? 'local' : '';
    const wst = c => S.widths[c.k] ? ` style="width:${S.widths[c.k]}px;min-width:${S.widths[c.k]}px;max-width:${S.widths[c.k]}px"` : '';
    const head = vis.map((c, ci) => `<th class="${c.r ? 'r' : ''} ${S.sort.c === c.i && S.sort.d ? 'sorted' : ''}"${wst(c)} data-sort="${c.i}" data-ci="${ci}" aria-sort="${S.sort.c === c.i ? (S.sort.d > 0 ? 'ascending' : S.sort.d < 0 ? 'descending' : 'none') : 'none'}"><div class="h">${esc(c.k)}<span class="so">${ic(S.sort.c === c.i && S.sort.d ? (S.sort.d > 0 ? 'asc' : 'desc') : 'sort', 's')}</span><button class="fbtn ${S.filters[c.k] ? 'on' : ''}" data-filter="${c.i}" aria-label="${t('grid.filter')} ${esc(c.k)}">${ic('filter', 's')}</button></div><span class="ty">${esc(c.ty)}${srcName(c) ? ' · ' + srcName(c) : ''}</span><span class="rz" data-rz="${esc(c.k)}"></span></th>`).join('');
    const bodyRows = rows.length ? rows.map(({ r }, ri) => `<tr style="animation-delay:${Math.min(ri, 14) * 12}ms"><td class="rn" data-row="${ri}">${ri + 1}</td>${vis.map((c, ci) => { const v = r[c.i], w = S.widths[c.k] ? ` style="max-width:${S.widths[c.k]}px"` : ''; return v == null ? `<td class="null" data-cell="${ri}:${ci}"${w}>NULL</td>` : `<td class="${c.r ? 'r' : ''}" data-cell="${ri}:${ci}"${w}>${c.tag ? `<span class="tag">${esc(v)}</span>` : c.money ? fmt(v) : esc(v)}</td>`; }).join('')}<td></td></tr>`).join('')
      : `<tr><td class="rn"></td><td colspan="${vis.length + 1}" class="dim" style="padding:18px 12px">${t('grid.noMatch')}</td></tr>`;
    body.innerHTML = `<table class="grid"><thead><tr><th class="rn" data-all title="${t('grid.selectAll')} ⌘A">#</th>${head}<th style="width:100%;cursor:default"></th></tr></thead><tbody>${bodyRows}</tbody></table>`;
    if (S.sel && (S.sel.e.r >= rows.length || S.sel.a.r >= rows.length || S.sel.e.c >= vis.length || S.sel.a.c >= vis.length)) S.sel = null;
  }
  if (d && !d.error && !S.running) {
    const srcs = d.srcs.map(x => x === 'local' ? 'DuckDB local' : SOURCES.find(s => s.id === x).name.en);
    const fk = Object.keys(S.filters), shown = fk.length ? viewRows(d).length : d.rows.length;
    const chip = k => { const f = S.filters[k]; return `<span class="fchip">${ic('filter', 's')}<span class="mono">${esc(k)}</span>${f.vals ? ` ∈ ${[...f.vals].slice(0, 2).map(v => esc(v || 'NULL')).join(', ')}${f.vals.size > 2 ? '…' : ''}` : ''}${f.q ? ` ${t('grid.' + (f.op || 'contains'))} “${esc(f.q)}”` : ''}<button data-unfilter="${esc(k)}" aria-label="${t('grid.clearFilter')}">${ic('x', 's')}</button></span>`; };
    foot = `<b>${fk.length ? t('grid.filtered', { n: shown, t: d.rows.length }) : t('res.rows', { n: d.rows.length })}</b><span>${t('res.cols', { n: d.cols.length - S.hidden.size })}</span><span class="mono">${d.ms} ms</span><span>${d.srcs.length > 1 ? t('fed.fed') + ' · ' : ''}${srcs.join(' + ')}</span>${fk.map(chip).join('')}<span class="sp"></span><span class="selstat"></span>`;
  }
  $('#rfoot').innerHTML = foot;
  if (S.rt === 'grid') paintSel();
}

/* pointer: click / drag / shift-click / row header / select-all corner */
let dragSel = false;
$('#rbody').addEventListener('pointerdown', e => {
  if (e.button !== 0 || e.target.closest('.rz,.fbtn')) return;
  const d = S.result; if (!d || d.error) return;
  const td = e.target.closest('td[data-cell]'), rn = e.target.closest('td[data-row]'), all = e.target.closest('th[data-all]');
  const m = visCols(d).length;
  if (all) { setSel({ r: 0, c: 0 }, { r: viewRows(d).length - 1, c: m - 1 }); $('#rbody').focus({ preventScroll: true }); return; }
  if (rn) { const r = +rn.dataset.row; e.shiftKey && S.sel ? setSel({ r: S.sel.a.r, c: 0 }, { r, c: m - 1 }) : setSel({ r, c: 0 }, { r, c: m - 1 }); $('#rbody').focus({ preventScroll: true }); return; }
  if (!td) return;
  e.preventDefault();
  const [r, c] = td.dataset.cell.split(':').map(Number);
  e.shiftKey && S.sel ? setSel(S.sel.a, { r, c }) : setSel({ r, c });
  dragSel = true; $('#rbody').focus({ preventScroll: true });
});
$('#rbody').addEventListener('pointerover', e => {
  if (!dragSel || !S.sel) return; const td = e.target.closest('td[data-cell]'); if (!td) return;
  const [r, c] = td.dataset.cell.split(':').map(Number); if (S.sel.e.r !== r || S.sel.e.c !== c) setSel(S.sel.a, { r, c });
});
document.addEventListener('pointerup', () => { dragSel = false; });
$('#rbody').addEventListener('click', e => {
  const fb = e.target.closest('[data-filter]'); if (fb) { e.stopPropagation(); return openFilterMenu(fb); }
  if (e.target.closest('.rz')) return;
  const th = e.target.closest('[data-sort]');
  if (th) { const c = +th.dataset.sort; S.sort = S.sort.c === c ? { c, d: S.sort.d === 1 ? -1 : S.sort.d === -1 ? 0 : 1 } : { c, d: 1 }; S.sel = null; renderResults(); return; }
  const go = e.target.closest('[data-rt-go]'); if (go) { S.rt = go.dataset.rtGo; renderResults(); }
});
$('#rfoot').addEventListener('click', e => { const b = e.target.closest('[data-unfilter]'); if (b) { delete S.filters[b.dataset.unfilter]; S.sel = null; renderResults(); } });

/* keyboard: arrows / shift+arrows / Home End / PgUp PgDn / ⌘A / ⌘C / Esc */
$('#rbody').addEventListener('keydown', e => {
  const d = S.result; if (!d || d.error || S.rt !== 'grid' || !d.rows.length) return;
  const mod = isMac ? e.metaKey : e.ctrlKey, n = viewRows(d).length, m = visCols(d).length, k = e.key.toLowerCase();
  if (mod && k === 'a') { e.preventDefault(); e.stopPropagation(); return setSel({ r: 0, c: 0 }, { r: n - 1, c: m - 1 }); }
  if (mod && k === 'c') { e.preventDefault(); e.stopPropagation(); return copyRange('tsv'); }
  if (e.key === 'Escape' && S.sel) { e.stopPropagation(); S.sel = null; return paintSel(); }
  const mv = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1], PageUp: [-10, 0], PageDown: [10, 0] }[e.key];
  if (!mv && e.key !== 'Home' && e.key !== 'End') return;
  e.preventDefault(); e.stopPropagation();
  const cur = S.sel ? S.sel.e : { r: 0, c: 0 };
  let r = cur.r, c = cur.c;
  if (mv) { r = Math.max(0, Math.min(n - 1, r + mv[0])); c = Math.max(0, Math.min(m - 1, c + mv[1])); }
  if (e.key === 'Home') { c = 0; if (mod) r = 0; } if (e.key === 'End') { c = m - 1; if (mod) r = n - 1; }
  e.shiftKey && S.sel ? setSel(S.sel.a, { r, c }) : setSel({ r, c });
  scrollCellIntoView();
});

/* context menu: copy TSV / CSV / JSON, column name, filter by value */
$('#rbody').addEventListener('contextmenu', e => {
  const td = e.target.closest('td[data-cell]'); if (!td) return;
  e.preventDefault();
  const [r, c] = td.dataset.cell.split(':').map(Number), b = selBox();
  if (!b || r < b.r0 || r > b.r1 || c < b.c0 || c > b.c1) setSel({ r, c });
  const d = S.result, col = visCols(d)[c], v = viewRows(d)[r].r[col.i];
  const anchor = { getBoundingClientRect: () => ({ left: e.clientX, right: e.clientX, top: e.clientY, bottom: e.clientY }) };
  openMenu(anchor, `<button data-cm="tsv">${ic('copy', 's')}${t('grid.copy')}<small>⌘C</small></button><button data-cm="csv">${ic('file', 's')}${t('grid.copyCsv')}</button><button data-cm="json">${ic('code', 's')}${t('grid.copyJson')}</button><button data-cm="colname">${ic('columns', 's')}${t('grid.copyCol')}<small>${esc(col.k)}</small></button><hr>`
    + `<button data-cm="only">${ic('filter', 's')}${t('grid.filterVal')}<small>${esc(cellText(v) || 'NULL')}</small></button><button data-cm="exclude">${ic('x', 's')}${t('grid.excludeVal')}</button>${S.filters[col.k] ? `<button data-cm="clear">${ic('refresh', 's')}${t('grid.clearFilter')}</button>` : ''}`,
    m => m.onclick = ev => {
      const bt = ev.target.closest('[data-cm]'); if (!bt) return; closeMenu();
      const a = bt.dataset.cm;
      if (a === 'tsv' || a === 'csv' || a === 'json') return copyRange(a);
      if (a === 'colname') { navigator.clipboard?.writeText(col.k).catch(() => {}); return toast(t('grid.colCopied', { c: col.k })); }
      if (a === 'only') S.filters[col.k] = { vals: new Set([cellText(v)]) };
      if (a === 'exclude') { const all = new Set(d.rows.map(x => cellText(x[col.i]))); all.delete(cellText(v)); S.filters[col.k] = { vals: all }; }
      if (a === 'clear') delete S.filters[col.k];
      S.sel = null; renderResults();
    });
});

/* column filter menu: condition + value list with select all / clear / invert */
function openFilterMenu(btn) {
  const d = S.result, ci = +btn.dataset.filter, col = d.cols[ci], k = col.k;
  const uniq = [...new Set(d.rows.map(r => cellText(r[ci])))].sort();
  const f = S.filters[k] || {};
  let vals = new Set(f.vals || uniq), search = '';
  const apply = () => { const full = vals.size === uniq.length, q = $('#fq')?.value.trim() || '', op = $('#fop')?.value || 'contains'; if (full && !q) delete S.filters[k]; else S.filters[k] = { vals: full ? null : new Set(vals), q, op }; S.sel = null; renderResults(); };
  const list = () => uniq.filter(u => !search || u.toLowerCase().includes(search)).map(u => `<button data-v="${esc(u)}"><span class="ck ${vals.has(u) ? 'on' : ''}">${vals.has(u) ? ic('check', 's') : ''}</span><span class="mono">${esc(u || 'NULL')}</span><small>${d.rows.filter(r => cellText(r[ci]) === u).length}</small></button>`).join('');
  openMenu(btn, `<div class="fm"><div class="mh">${t('grid.filter')} · <span class="mono">${esc(k)}</span></div>
    <div class="fm-row"><select class="field" id="fop">${['contains', 'equals', 'startsWith', 'endsWith'].map(o => `<option value="${o}" ${f.op === o ? 'selected' : ''}>${t('grid.' + o)}</option>`).join('')}</select><input class="field" id="fq" placeholder="${t('grid.condPh')}" value="${esc(f.q || '')}"></div>
    <div class="fm-row"><input class="field" id="fsearch" placeholder="${t('grid.search')}"></div>
    <div class="fm-acts"><button data-fa="all">${t('grid.selectAll')}</button><button data-fa="none">${t('grid.clearAll')}</button><button data-fa="inv">${t('grid.invert')}</button></div>
    <div class="fm-list" id="flist">${list()}</div><hr><button data-fa="clear">${ic('refresh', 's')}${t('grid.clearFilter')}</button></div>`, m => {
    m.onclick = ev => {
      const v = ev.target.closest('[data-v]'), fa = ev.target.closest('[data-fa]');
      if (v) { const x = v.dataset.v; vals.has(x) ? vals.delete(x) : vals.add(x); }
      if (fa) { const a = fa.dataset.fa; if (a === 'all') vals = new Set(uniq); if (a === 'none') vals = new Set(); if (a === 'inv') vals = new Set(uniq.filter(u => !vals.has(u))); if (a === 'clear') { delete S.filters[k]; S.sel = null; renderResults(); return closeMenu(); } }
      if (v || fa) { $('#flist').innerHTML = list(); apply(); }
    };
    m.oninput = ev => { if (ev.target.id === 'fsearch') { search = ev.target.value.toLowerCase(); $('#flist').innerHTML = list(); } if (ev.target.id === 'fq') apply(); };
    m.onchange = ev => { if (ev.target.id === 'fop') apply(); };
    setTimeout(() => $('#fq')?.focus(), 0);
  });
}

/* column resize: drag the header edge; double-click restores auto width */
$('#rbody').addEventListener('pointerdown', e => {
  const rz = e.target.closest('.rz'); if (!rz) return;
  e.preventDefault(); e.stopPropagation();
  const th = rz.parentElement, x0 = e.clientX, w0 = th.getBoundingClientRect().width, k = rz.dataset.rz;
  const mv = ev => { S.widths[k] = Math.max(64, Math.round(w0 + ev.clientX - x0)); th.style.width = th.style.minWidth = th.style.maxWidth = S.widths[k] + 'px'; };
  const up = () => { document.removeEventListener('pointermove', mv); document.removeEventListener('pointerup', up); renderResults(); };
  document.addEventListener('pointermove', mv); document.addEventListener('pointerup', up);
}, true);
$('#rbody').addEventListener('dblclick', e => { const rz = e.target.closest('.rz'); if (rz) { delete S.widths[rz.dataset.rz]; renderResults(); } });
$$('.rtab').forEach(b => b.onclick = () => { S.rt = b.dataset.rt; renderResults(); });

function chartSvg(d) {
  const agg = {}; d.rows.forEach(r => agg[r[1]] = (agg[r[1]] || 0) + r[4]);
  if (!d.cols[4] || d.cols[4].k !== 'amount') return `<div class="state"><div class="box"><div class="ic">${ic('chart', 'l')}</div><h3>${S.lang === 'zh' ? '选择一个数值列来作图' : 'Pick a numeric column to chart'}</h3></div></div>`;
  const data = Object.entries(agg).sort((a, b) => b[1] - a[1]), max = Math.max(...data.map(x => x[1]));
  const W = 720, lw = 140, bh = 22, gap = 14, top = 6, plotW = W - lw - 90;
  const ticks = [0, 1000, 2000, 3000];
  const rows = data.map(([k, v], i) => { const y = top + i * (bh + gap), w = Math.max(2, v / 3500 * plotW);
    return `<g class="bar" data-k="${esc(k)}" data-v="${v}"><rect x="0" y="${y - gap / 2}" width="${W}" height="${bh + gap}" fill="transparent"/><text class="lab" x="${lw - 12}" y="${y + bh / 2 + 4}" text-anchor="end">${esc(k)}</text><path class="b" d="M${lw} ${y}h${w - 4}a4 4 0 0 1 4 4v${bh - 8}a4 4 0 0 1-4 4h-${w - 4}z" fill="var(--chart)"/><text class="val" x="${lw + w + 8}" y="${y + bh / 2 + 4}">${fmt(v)}</text></g>`; }).join('');
  const H = top + data.length * (bh + gap) + 22;
  return `<div class="chart"><h4>${t('chart.title')}</h4><p>${t('chart.sub')}</p><svg viewBox="0 0 ${W} ${H}" width="100%" style="max-width:${W}px" role="img" aria-label="${t('chart.title')}">
    ${ticks.map(v => `<line x1="${lw + v / 3500 * plotW}" x2="${lw + v / 3500 * plotW}" y1="0" y2="${H - 20}"/><text x="${lw + v / 3500 * plotW}" y="${H - 4}" text-anchor="middle">${v.toLocaleString()}</text>`).join('')}${rows}</svg></div>`;
}
$('#rbody').addEventListener('pointermove', e => {
  const g = e.target.closest('g.bar'), tip = $('#ctip');
  if (!g) { tip.style.display = 'none'; return; }
  tip.innerHTML = `${esc(g.dataset.k)} · <b>${fmt(+g.dataset.v)}</b>`; tip.style.display = 'block';
  tip.style.left = Math.min(e.clientX + 12, innerWidth - tip.offsetWidth - 8) + 'px'; tip.style.top = (e.clientY - 34) + 'px';
});
$('#rbody').addEventListener('pointerleave', () => $('#ctip').style.display = 'none');

/* ---------------- status bar ---------------- */
function renderStatus() {
  const running = S.runs.filter(r => r.st === 'run').length;
  const line = ta.value.slice(0, ta.selectionStart).split('\n'), dark = document.documentElement.dataset.theme === 'dark';
  $('#status').innerHTML = `<span class="sb"><span class="dot"></span>${t('st.engine')}</span>
    <button class="sb" data-go-view="sources">${ic('db', 's')}${t('st.conns')}</button>
    ${running ? `<button class="sb" data-act="showRuns">${ic('loader', 's st run')}${t('st.tasks', { n: running })}</button>` : ''}
    <span class="sb">${t('st.mem')}</span><span class="sp"></span>
    ${S.view === 'work' && curTab().type === 'sql' ? `<span class="sb mono">${t('st.pos', { l: line.length, c: line[line.length - 1].length + 1 })}</span>` : ''}
    <button class="sb" data-act="sceneMenu">${ic('eye', 's')}${t('st.scene')}: ${t('scene.' + S.scene)}</button>
    <button class="sb prop" data-act="props">${ic('bulb', 's')}${t('st.props')} 6</button>
    <button class="sb" data-act="lang" title="${S.lang === 'zh' ? 'Switch to English' : '切换到中文'}">${ic('lang', 's')}${S.lang === 'zh' ? '中文' : 'EN'}</button>
    <button class="sb" data-act="theme" aria-label="theme">${ic(dark ? 'moon' : 'sun', 's')}</button>
    <button class="sb" data-act="cmdk"><kbd>⌘K</kbd></button>`;
}

/* ---------------- splitters ---------------- */
function drag(handle, onMove) {
  handle.addEventListener('pointerdown', e => {
    e.preventDefault(); handle.setPointerCapture(e.pointerId); handle.classList.add('drag');
    const mv = ev => onMove(ev), up = () => { handle.classList.remove('drag'); handle.removeEventListener('pointermove', mv); handle.removeEventListener('pointerup', up); };
    handle.addEventListener('pointermove', mv); handle.addEventListener('pointerup', up);
  });
}
drag($('#hsplit'), e => { const top = $('#editor').getBoundingClientRect().top; const h = Math.max(96, Math.min(e.clientY - top, innerHeight - top - 180)); document.documentElement.style.setProperty('--ed-h', h + 'px'); syncScroll(); });
$('#hsplit').ondblclick = () => document.documentElement.style.setProperty('--ed-h', '300px');
drag($('#vsplit'), e => { const w = Math.max(200, Math.min(e.clientX - 56, 460)); document.documentElement.style.setProperty('--exp-w', w + 'px'); });
$('#vsplit').ondblclick = () => document.documentElement.style.setProperty('--exp-w', '264px');
