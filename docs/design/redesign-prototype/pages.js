/* DuckQuery redesign prototype — pages, overlays, commands, init */
const L = (zh, en) => S.lang === 'zh' ? zh : en;

/* ---------------- data sources page ---------------- */
const CONN_META_F = () => ({
  crm: { target: 'crm-db.internal:3306 / prod_crm', user: 'readonly', used: ['2 分钟前', '2 min ago'] },
  fin: { target: 'pg.finance.internal:5432 / finance', user: 'analyst', used: ['昨天', 'yesterday'] },
  reg: { target: '~/data/regions.sqlite', user: '—', used: ['3 天前', '3 days ago'] },
});
const LOCAL_META = [
  ['readme_demo_orders', '2,418', 6, '312 KB', 'readme_demo_orders.csv', '09-28'],
  ['payments_2026q3', '18,654', 5, '1.9 MB', 'payments_q3.parquet', '10-02'],
  ['excel_对账_0930', '1,204', 3, '96 KB', '对账_0930.xlsx · Sheet1', '10-09'],
  ['sales_by_month', '36', 2, '8 KB', ['查询结果', 'Query result'], '10-09'],
];
function renderSources() {
  const conns = SOURCES.filter(s => s.id !== 'local');
  const typeAbbr = { MySQL: 'MY', PostgreSQL: 'PG', SQLite: 'SL' };
  $('#sourcesPage').innerHTML = `
  <div class="ph"><div><h1>${t('nav.sources')}</h1><p>${L('本地文件与远程数据库，在一条 SQL 里联查。数据完全留在本机。', 'Local files and remote databases, joined in one SQL statement. Your data stays local.')}</p></div><span class="sp"></span>
    <button class="btn line" data-act="refreshTree">${ic('refresh', 's')}${t('act.refresh')}</button><button class="btn inv" data-act="addData" data-prop="3">${ic('plus', 's')}${t('act.addData')}<kbd>⌘N</kbd></button></div>
  <div class="sec"><h2>${L('数据库连接', 'Database connections')}<small>${conns.length}</small></h2><div class="list">
    <div class="li conn head"><span>${L('名称', 'Name')}</span><span>${L('类型', 'Type')}</span><span>${L('地址', 'Address')}</span><span>${L('状态', 'Status')}</span><span class="r">${L('表', 'Tables')}</span><span>${L('最近使用', 'Last used')}</span><span></span></div>
    ${conns.map(s => { const m = CONN_META_F()[s.id]; return `<div class="li conn"><span class="nm"><span class="typeic">${typeAbbr[s.kind]}</span><span>${esc(s.name[S.lang])}</span></span><span class="sub">${s.kind}</span><span class="sub mono">${esc(m.target)}</span>
      <span class="stat"><span class="dot ${s.st === 'off' ? 'off' : ''}"></span>${s.st === 'off' ? L('离线', 'Offline') : L('在线', 'Online')}</span><span class="r mono sub">${s.tables.length || '—'}</span><span class="sub">${Array.isArray(m.used) ? L(...m.used) : m.used}</span>
      <span class="acts">${s.st === 'off' ? `<button class="btn line" data-conn="${s.id}">${ic('plug', 's')}${L('重连', 'Reconnect')}</button>` : `<button class="btn line" data-query="${s.id}">${ic('code', 's')}${L('查询', 'Query')}</button>`}<button class="ib" data-more="conn" aria-label="more">${ic('more', 's')}</button></span></div>`; }).join('')}
  </div></div>
  <div class="sec"><h2>${L('本地表 · DuckDB', 'Local tables · DuckDB')}<small>${LOCAL_META.length}</small></h2><div class="list">
    <div class="li ltbl head"><span>${L('表名', 'Table')}</span><span class="r">${L('行数', 'Rows')}</span><span class="r">${L('列', 'Cols')}</span><span class="r">${L('大小', 'Size')}</span><span>${L('来源', 'Origin')}</span><span>${L('创建', 'Created')}</span><span></span></div>
    ${LOCAL_META.map(r => `<div class="li ltbl"><span class="nm"><span class="typeic">${ic('table', 's')}</span><span class="mono">${esc(r[0])}</span></span><span class="r mono">${r[1]}</span><span class="r mono sub">${r[2]}</span><span class="r mono sub">${r[3]}</span><span class="sub">${esc(Array.isArray(r[4]) ? L(...r[4]) : r[4])}</span><span class="sub mono">2026-${r[5]}</span>
      <span class="acts"><button class="btn line" data-qt="${esc(r[0])}">${ic('code', 's')}${L('查询', 'Query')}</button><button class="ib" data-more="tbl" aria-label="more">${ic('more', 's')}</button></span></div>`).join('')}
  </div></div>`;
}
$('#sourcesPage').addEventListener('click', e => {
  const q = e.target.closest('[data-qt]'); if (q) { setView('work'); newTab('sql', `SELECT *\nFROM ${q.dataset.qt}\nLIMIT 100;`, q.dataset.qt, 'preview:local/' + q.dataset.qt); run(); return; }
  const qc = e.target.closest('[data-query]'); if (qc) { const s = SOURCES.find(x => x.id === qc.dataset.query); setView('work'); newTab('sql', `SELECT *\nFROM ${s.alias}.${s.tables[0].n}\nLIMIT 100;`, s.tables[0].n, 'preview:' + s.id + '/' + s.tables[0].n); run(); return; }
  const c = e.target.closest('[data-conn]'); if (c) { c.innerHTML = ic('loader', 's st run') + L('连接中', 'Connecting'); setTimeout(() => { toast(L('regions.sqlite 仍不可达：文件不存在', 'regions.sqlite still unreachable: file not found'), 'err'); renderSources(); }, 900); return; }
  const m = e.target.closest('[data-more]');
  if (m) openMenu(m, m.dataset.more === 'conn'
    ? `<button>${ic('sliders', 's')}${L('编辑连接', 'Edit connection')}</button><button>${ic('refresh', 's')}${L('刷新元数据', 'Refresh metadata')}</button><button>${ic('copy', 's')}${L('复制 SQL 前缀', 'Copy SQL prefix')}</button><hr><button style="color:var(--err)">${ic('trash', 's')}${L('删除连接', 'Delete connection')}</button>`
    : `<button>${ic('eye', 's')}${L('预览', 'Preview')}</button><button>${ic('download', 's')}${L('导出', 'Export')}</button><button>${ic('copy', 's')}${L('复制表名', 'Copy name')}</button><hr><button style="color:var(--err)">${ic('trash', 's')}${L('删除表', 'Drop table')}</button>`,
    menu => menu.onclick = ev => { if (ev.target.closest('button')) { closeMenu(); toast(L('原型：此操作仅演示', 'Prototype: demo only'), 'info'); } });
});

/* ---------------- extensions page ---------------- */
const EXTS = [
  { g: 'ds', n: 'mysql', d: ['连接 MySQL，支持谓词下推与联邦 JOIN。', 'Attach MySQL with predicate pushdown and federated JOINs.'], st: 'bundled', u: "ATTACH '…' AS mysql_prod_crm (TYPE mysql)" },
  { g: 'ds', n: 'postgres', d: ['连接 PostgreSQL / 兼容库。', 'Attach PostgreSQL and compatible databases.'], st: 'bundled', u: "ATTACH '…' AS pg_finance (TYPE postgres)" },
  { g: 'ds', n: 'sqlite', d: ['直接读写 SQLite 文件。', 'Read and write SQLite files directly.'], st: 'installed', u: "ATTACH 'regions.sqlite' (TYPE sqlite)" },
  { g: 'ds', n: 'httpfs', d: ['通过 HTTP(S) / S3 读取远程文件。', 'Read remote files over HTTP(S) and S3.'], st: 'installed', u: "SELECT * FROM 'https://…/data.parquet'" },
  { g: 'ds', n: 'iceberg', d: ['读取 Apache Iceberg 表。', 'Read Apache Iceberg tables.'], st: 'available', u: "SELECT * FROM iceberg_scan('…')" },
  { g: 'cap', n: 'spatial', d: ['地理空间类型与函数（GEOMETRY、ST_*）。', 'Geospatial types and functions (GEOMETRY, ST_*).'], st: 'available', u: 'SELECT ST_Distance(a, b) FROM …' },
  { g: 'cap', n: 'fts', d: ['全文检索索引与 BM25 排序。', 'Full-text search indexes with BM25 ranking.'], st: 'available', u: "PRAGMA create_fts_index('docs', 'id', 'body')" },
  { g: 'cap', n: 'vss', d: ['向量相似度检索（HNSW 索引）。', 'Vector similarity search (HNSW index).'], st: 'available', u: 'CREATE INDEX … USING HNSW (embedding)' },
];
function renderExt() {
  const row = x => `<div class="li ext"><div><div class="mono" style="font-weight:500;color:var(--text)">${x.n}</div><code>${esc(x.u)}</code></div><span class="desc">${L(...x.d)}</span>
    <span>${x.st === 'bundled' ? `<span class="pill">${L('已预置', 'Bundled')}</span>` : x.st === 'installed' ? `<span class="pill ok">${ic('check', 's')}${L('已安装', 'Installed')}</span>` : x.st === 'dl' ? `<span class="pill">${ic('loader', 's st run')}${x.phase}</span>` : ''}</span>
    <span class="acts">${x.st === 'available' ? `<button class="btn line" data-install="${x.n}">${ic('download', 's')}${L('安装', 'Install')}</button>` : `<button class="btn line" data-copy="${esc(x.u)}">${ic('copy', 's')}${t('common.copy')}</button>`}</span></div>`;
  $('#extPage').innerHTML = `<div class="ph"><div><h1>${t('nav.ext')}</h1><p>${L('扩展来自 DuckDB 官方仓库，安装后离线可用。', 'Extensions come from the official DuckDB repository and work offline once installed.')}</p></div></div>
    <div class="sec"><h2>${L('数据源', 'Data sources')}</h2><div class="list">${EXTS.filter(x => x.g === 'ds').map(row).join('')}</div></div>
    <div class="sec"><h2>${L('能力增强', 'Capabilities')}</h2><div class="list">${EXTS.filter(x => x.g === 'cap').map(row).join('')}</div></div>`;
}
$('#extPage').addEventListener('click', e => {
  const b = e.target.closest('[data-install]');
  if (b) { const x = EXTS.find(y => y.n === b.dataset.install); x.st = 'dl'; x.phase = L('下载中', 'Downloading'); renderExt();
    setTimeout(() => { x.phase = L('校验中', 'Verifying'); renderExt(); }, 1100);
    setTimeout(() => { x.st = 'installed'; renderExt(); toast(L(`${x.n} 安装成功`, `${x.n} installed`)); }, 2000); return; }
  const c = e.target.closest('[data-copy]'); if (c) { navigator.clipboard?.writeText(c.dataset.copy).catch(() => {}); c.innerHTML = ic('check', 's') + t('common.copied'); setTimeout(renderExt, 1200); }
});

/* ---------------- settings page ---------------- */
let SET = 'ai';
const SW = { agent: true, compact: false, sqliteCompat: false, autoAsync: true };
function srow(title, desc, ctrl) { return `<div class="srow"><div><b>${title}</b>${desc ? `<small>${desc}</small>` : ''}</div><div>${ctrl}</div></div>`; }
const sw = k => `<button class="switch ${SW[k] ? 'on' : ''}" role="switch" aria-checked="${SW[k]}" data-sw="${k}"></button>`;
function renderSettings() {
  const nav = [['ai', L('AI 模型', 'AI model')], ['result', L('查询结果', 'Query results')], ['grid', L('表格显示', 'Data grid')], ['engine', L('引擎兼容', 'Engine compatibility')], ['storage', L('数据库存储', 'Database storage')], ['cache', L('缓存', 'Cache')], ['keys', L('快捷键', 'Shortcuts')], ['about', L('关于与更新', 'About & updates')]];
  const B = {
    ai: `<h2>${L('AI 模型', 'AI model')}</h2><p>${L('AI 使用你自己的 Key 与模型；Agent 只运行只读查询。', 'AI runs on your own key and model; the agent only runs read-only queries.')}</p><div class="list">
      ${srow(L('服务商', 'Provider'), '', `<select class="field"><option>OpenAI ${L('兼容接口', 'compatible')}</option><option>Anthropic</option><option>DeepSeek</option><option>Ollama（${L('本地', 'local')}）</option></select>`)}
      ${srow('Base URL', L('OpenAI 兼容接口地址', 'OpenAI-compatible endpoint'), `<input class="field mono" value="https://api.example.com/v1">`)}
      ${srow(L('模型', 'Model'), '', `<input class="field mono" value="your-model-name">`)}
      ${srow('API Key', L('仅保存在本机', 'Stored on this machine only'), `<input class="field mono" type="password" placeholder="sk-…" autocomplete="off">`)}
      ${srow(L('AI Agent（查看表结构并运行只读查询）', 'AI agent (inspects schemas, runs read-only queries)'), L('关闭后只生成 SQL，不自动执行', 'When off, AI only drafts SQL and never runs it'), sw('agent'))}
      ${srow(L('测试连接', 'Test connection'), '', `<button class="btn line" data-test-ai>${ic('plug', 's')}${L('测试', 'Test')}</button> <span id="aiTest"></span>`)}</div>`,
    result: `<h2>${L('查询结果', 'Query results')}</h2><p>${L('工作台结果的默认行为。', 'Defaults for workbench results.')}</p><div class="list">
      ${srow(L('总行数上限', 'Total row LIMIT'), L('同时保护异步执行、持久化、导出与 MCP', 'Also guards async runs, persistence, export and MCP'), `<input class="field mono" value="10000">`)}
      ${srow(L('慢查询建议转异步', 'Suggest async for slow queries'), L('执行超过 3 秒时提示转为异步', 'Offer async after 3 seconds'), sw('autoAsync'))}</div>`,
    grid: `<h2>${L('表格显示', 'Data grid')}</h2><p>${L('结果表格的密度与格式。', 'Density and formatting of result grids.')}</p><div class="list">
      ${srow(L('紧凑行高', 'Compact rows'), L('行高 26px，适合大量数据对账', '26px rows for dense reconciliation'), sw('compact'))}
      ${srow(L('数字千分位', 'Thousands separators'), '', `<select class="field"><option>1,234.56</option><option>1234.56</option></select>`)}
      ${srow(L('NULL 显示为', 'Show NULL as'), '', `<input class="field mono" value="NULL">`)}</div>`,
    engine: `<h2>${L('引擎兼容', 'Engine compatibility')}</h2><p>${L('处理外部库的类型差异。', 'Handle type differences in external databases.')}</p><div class="list">
      ${srow(L('SQLite 兼容模式', 'SQLite compatibility mode'), L('声明类型与实际值不一致时按文本读取', 'Read as text when declared types disagree with values'), sw('sqliteCompat'))}
      ${srow(L('Lambda 语法', 'Lambda syntax'), L('旧写法 x -> x + 1 默认禁用，请使用 lambda x: x + 1', 'Legacy x -> x + 1 is disabled; use lambda x: x + 1'), `<span class="pill">${L('仅新语法', 'New syntax only')}</span>`)}</div>`,
    storage: `<h2>${L('数据库存储', 'Database storage')}</h2><p>${L('预算、备份与恢复。数据库恢复从不自动进行。', 'Budgets, backups and recovery. Restores are never automatic.')}</p><div class="list">
      ${srow(L('引擎内存上限', 'Engine memory cap'), L('检测到物理内存的 75%', '75% of detected physical memory'), `<div class="mono">1.4 / 12 GB</div><div class="meter"><i style="width:12%"></i></div>`)}
      ${srow(L('溢写空间', 'Spill budget'), '', `<div class="mono">0.3 / 4 GB</div><div class="meter"><i style="width:8%"></i></div>`)}
      ${srow(L('用户数据库连接', 'User DB connections'), '', `<div class="mono">3 / 4</div><div class="meter"><i style="width:75%"></i></div>`)}
      ${srow(L('磁盘保留', 'Disk reserve'), '', `<span class="mono">256 MiB</span>`)}
      ${srow(L('最近备份', 'Latest backup'), 'data/duckdb/main.db · system.db', `<span class="inline-ok">${ic('check', 's')}2026-10-10 09:12</span> <button class="btn line">${L('打开备份目录', 'Open backup folder')}</button>`)}</div>`,
    cache: `<h2>${L('缓存', 'Cache')}</h2><p>${L('导出与临时文件。', 'Exports and temporary files.')}</p><div class="list">
      ${srow(L('临时文件', 'Temporary files'), 'temp_files/', `<span class="mono">184 MB</span> <button class="btn line">${L('清理', 'Clear')}</button>`)}
      ${srow(L('导出目录', 'Exports'), 'exports/', `<span class="mono">62 MB</span> <button class="btn line">${L('清理', 'Clear')}</button>`)}</div>`,
    keys: `<h2>${L('快捷键', 'Shortcuts')}</h2><p>${L('点击快捷键可以修改。', 'Click a shortcut to change it.')}</p><div class="list">
      ${[['⌘K', L('打开命令面板', 'Open command palette')], ['⌘↵', L('执行当前查询', 'Run current query')], ['⌘⇧↵', L('异步执行', 'Run async')], ['⌘T', L('新建 SQL 标签', 'New SQL tab')], ['⌘N', L('添加数据', 'Add data')], ['⌘I', L('AI 助手', 'AI assistant')], ['⌘B', L('切换数据源面板', 'Toggle explorer')], ['⇧⌥F', L('格式化 SQL', 'Format SQL')], ['⌘⇧L', L('切换主题', 'Toggle theme')]]
        .map(([k, d]) => srow(d, '', `<button class="btn line mono">${k}</button>`)).join('')}</div>`,
    about: `<h2>${L('关于与更新', 'About & updates')}</h2><p>${L('查看当前版本，手动检查并安装新版本。', 'Check the current version and install updates manually.')}</p><div class="list"><div class="srow"><dl class="kv">
      <dt>${L('当前版本', 'Version')}</dt><dd>v2.0.1</dd><dt>${L('DuckDB 内核', 'DuckDB engine')}</dt><dd>v2.0.0-alpha39998</dd><dt>Python</dt><dd>1.6.0.dev379</dd><dt>${L('存储兼容格式', 'Storage format')}</dt><dd>v2.0.0</dd></dl>
      <div><button class="btn line" data-check>${ic('refresh', 's')}${L('检查更新', 'Check for updates')}</button> <span id="upd"></span></div></div></div>`,
  };
  $('#settingsPage').innerHTML = `<nav class="snav"><h1>${t('nav.settings')}</h1>${nav.map(([k, v]) => `<button class="${SET === k ? 'on' : ''}" data-set="${k}" ${k === 'ai' ? 'data-prop="2"' : ''}>${v}</button>`).join('')}</nav><div class="sbody">${B[SET]}</div>`;
}
$('#settingsPage').addEventListener('click', e => {
  const n = e.target.closest('[data-set]'); if (n) { SET = n.dataset.set; renderSettings(); return; }
  const s = e.target.closest('[data-sw]'); if (s) { SW[s.dataset.sw] = !SW[s.dataset.sw]; renderSettings(); return; }
  if (e.target.closest('[data-test-ai]')) { $('#aiTest').innerHTML = ic('loader', 's st run'); setTimeout(() => $('#aiTest').innerHTML = `<span style="color:var(--err);font-size:12px">${L('未填写 API Key', 'API key is empty')}</span>`, 700); return; }
  if (e.target.closest('[data-check]')) { $('#upd').innerHTML = ic('loader', 's st run'); setTimeout(() => $('#upd').innerHTML = `<span class="inline-ok">${ic('check', 's')}${L('当前已是最新版本 v2.0.1', 'Up to date: v2.0.1')}</span>`, 800); }
});
function renderPages() { renderSources(); renderExt(); renderSettings(); }

/* ---------------- add data drawer ---------------- */
let DR = { tab: 'file', db: 'MySQL', file: null, tested: false };
function openDrawer(tab) {
  if (tab) DR.tab = tab;
  DR.tested = false;
  renderDrawer(); $('#drawer').classList.add('on'); $('#scrim').classList.add('on');
  setTimeout(() => $('#drawer input,#drawer textarea')?.focus(), 260);
}
function closeOverlays() {
  $('#drawer').classList.remove('on'); $('#dialog').classList.remove('on'); $('#cmdk').classList.remove('on'); $('#scrim').classList.remove('on'); closeMenu();
}
function renderDrawer() {
  const tabs = [['file', 'upload', L('文件', 'File')], ['db', 'db', L('数据库', 'Database')], ['paste', 'clip', L('粘贴', 'Paste')], ['url', 'link', 'URL']];
  let body = '', foot = '';
  if (DR.tab === 'file') {
    body = `<div class="drop" id="drop" tabindex="0" role="button">${ic('upload', 'l')}<b>${L('拖入文件，或点击选择', 'Drop a file, or click to choose')}</b><span>${L('导入后成为本地 DuckDB 表，可与远程库联查', 'It becomes a local DuckDB table you can join with remote databases')}</span><div class="fmts"><span>CSV</span><span>XLSX</span><span>Parquet</span><span>JSON</span></div><input type="file" id="fileIn" hidden></div>
      ${DR.file ? `<div class="picked">${ic('file')}<div style="flex:1;min-width:0"><div class="mono">${esc(DR.file.name)}</div><div class="sub">${(DR.file.size / 1024).toFixed(1)} KB</div></div><button class="ib" data-clear-file>${ic('x', 's')}</button></div>` : ''}
      <label class="fl" style="margin-top:16px"><span>${L('表名', 'Table name')}</span><input class="field mono" id="alias" value="${DR.file ? esc(DR.file.name.replace(/\.\w+$/, '').replace(/[^\w一-龥]+/g, '_').toLowerCase()) : ''}" placeholder="orders_1010"><small>${L('留空则按文件名生成', 'Defaults to the file name')}</small></label>
      <label class="fl"><span>${L('类型识别', 'Type detection')}</span><select class="field"><option>${L('自动识别类型', 'Auto-detect types')}</option><option>${L('全部按文本导入', 'Import everything as text')}</option></select></label>`;
    foot = `<button class="btn" data-close>${t('common.cancel')}</button><button class="btn inv" data-import ${DR.file ? '' : 'disabled'}>${L('开始导入', 'Import')}</button>`;
  } else if (DR.tab === 'db') {
    body = `<div class="fl"><span>${L('类型', 'Type')}</span><div class="seg" style="width:100%">${['MySQL', 'PostgreSQL', 'SQLite', 'DuckDB'].map(x => `<button style="flex:1;justify-content:center" class="${DR.db === x ? 'on' : ''}" data-db="${x}">${x}</button>`).join('')}</div></div>
      <label class="fl"><span>${L('连接串（可选）', 'Connection string (optional)')}</span><input class="field mono" id="connStr" placeholder="mysql://user@host:3306/db"><small>${L('粘贴后自动拆分到下面的字段，密码不会写进连接串', 'Paste to fill the fields below; passwords never stay in the string')}</small></label>
      ${DR.db === 'SQLite' || DR.db === 'DuckDB' ? `<label class="fl"><span>${L('文件路径', 'File path')}</span><input class="field mono" placeholder="~/data/file.${DR.db === 'SQLite' ? 'sqlite' : 'duckdb'}"></label>` : `
      <div class="two"><label class="fl"><span>${L('主机', 'Host')}</span><input class="field mono" id="fHost" placeholder="127.0.0.1"></label><label class="fl"><span>${L('端口', 'Port')}</span><input class="field mono" id="fPort" placeholder="${DR.db === 'MySQL' ? 3306 : 5432}"></label></div>
      <label class="fl"><span>${L('数据库', 'Database')}</span><input class="field mono" id="fDb"></label>
      <div class="two" style="grid-template-columns:1fr 1fr"><label class="fl"><span>${L('用户名', 'User')}</span><input class="field mono" id="fUser" autocomplete="off"></label><label class="fl"><span>${L('密码', 'Password')}</span><input class="field mono" type="password" autocomplete="new-password"></label></div>`}
      <label class="fl"><span>${L('SQL 前缀（别名）', 'SQL prefix (alias)')}</span><input class="field mono" id="fAlias" placeholder="${DR.db === 'MySQL' ? 'mysql_crm' : 'pg_finance'}"><small>${L('在 SQL 里这样引用：', 'Reference it in SQL as ')}<span class="mono">mysql_crm.customers</span></small></label>`;
    foot = `<span class="msg">${DR.tested ? `<span class="inline-ok">${ic('check', 's')}${L('连接成功 · 18 ms', 'Connected · 18 ms')}</span>` : ''}</span><button class="btn line" data-test>${L('测试连接', 'Test connection')}</button><button class="btn inv" data-saveconn>${L('保存并连接', 'Save & connect')}</button>`;
  } else if (DR.tab === 'paste') {
    body = `<label class="fl"><span>${L('粘贴表格数据', 'Paste tabular data')}</span><textarea class="field" id="pasteIn" rows="8">order_id,amount,channel\n2001,129.00,alipay\n2002,88.50,wechat\n2003,410.00,card</textarea><small>${L('支持从 Excel、网页表格直接复制；自动识别分隔符', 'Copy straight from Excel or a web table; the delimiter is detected')}</small></label>
      <div class="fl"><span>${L('预览', 'Preview')}</span><div id="pastePrev"></div></div>
      <label class="fl"><span>${L('表名', 'Table name')}</span><input class="field mono" value="pasted_1010"></label>`;
    foot = `<button class="btn" data-close>${t('common.cancel')}</button><button class="btn inv" data-import-paste>${L('创建表', 'Create table')}</button>`;
  } else {
    body = `<label class="fl"><span>URL</span><input class="field mono" placeholder="https://example.com/data.parquet"><small>${L('每次重定向都会校验，并按流式大小限制读取。S3 需先在设置中配置凭据。', 'Each redirect is validated and reads are size-limited while streaming. S3 needs credentials in Settings.')}</small></label>
      <label class="fl"><span>${L('表名', 'Table name')}</span><input class="field mono" placeholder="remote_data"></label>`;
    foot = `<button class="btn" data-close>${t('common.cancel')}</button><button class="btn inv" data-import-url>${L('读取', 'Read')}</button>`;
  }
  $('#drawer').innerHTML = `<header><h3>${t('act.addData')}</h3><button class="ib" data-close aria-label="${t('common.close')}">${ic('x')}</button></header>
    <div class="tabs"><div class="seg">${tabs.map(([k, i, l]) => `<button class="${DR.tab === k ? 'on' : ''}" data-dt="${k}">${ic(i, 's')}${l}</button>`).join('')}</div></div>
    <div class="body">${body}</div><footer>${foot}</footer>`;
  if (DR.tab === 'paste') paintPaste();
}
function paintPaste() {
  const v = $('#pasteIn').value.trim().split('\n').map(l => l.split(/\t|,/));
  $('#pastePrev').innerHTML = `<table class="prev"><tr>${v[0].map(h => `<th>${esc(h)}</th>`).join('')}</tr>${v.slice(1, 6).map(r => `<tr>${r.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</table>`;
}
function addLocalTable(name, cols) {
  SOURCES[0].tables.push({ n: name, rows: cols.rows, cols: cols.cols });
  LOCAL_META.push([name, cols.rows, cols.cols.length, '—', cols.origin, '10-10']);
  S.open.add('local'); renderTree(); renderSources();
}
$('#drawer').addEventListener('click', e => {
  if (e.target.closest('[data-close]')) return closeOverlays();
  const dt = e.target.closest('[data-dt]'); if (dt) { DR.tab = dt.dataset.dt; renderDrawer(); return; }
  const db = e.target.closest('[data-db]'); if (db) { DR.db = db.dataset.db; DR.tested = false; renderDrawer(); return; }
  if (e.target.closest('#drop')) { $('#fileIn').click(); return; }
  if (e.target.closest('[data-clear-file]')) { DR.file = null; renderDrawer(); return; }
  if (e.target.closest('[data-test]')) { e.target.closest('[data-test]').innerHTML = ic('loader', 's st run') + L('测试中', 'Testing'); setTimeout(() => { DR.tested = true; renderDrawer(); }, 700); return; }
  if (e.target.closest('[data-saveconn]')) { closeOverlays(); toast(t('toast.conn', { n: $('#fAlias')?.value || 'mysql_crm' })); return; }
  if (e.target.closest('[data-import]')) { const n = $('#alias').value || 'imported_1010'; closeOverlays(); setTimeout(() => { addLocalTable(n, { rows: '—', cols: [['col_1', 'VARCHAR']], origin: DR.file?.name || 'file' }); DR.file = null; toast(t('toast.imported', { t: n }), 'ok', { label: t('toast.view'), fn: () => { setView('work'); S.exp = 'sources'; renderTree(); } }); }, 500); return; }
  if (e.target.closest('[data-import-paste]')) { closeOverlays(); addLocalTable('pasted_1010', { rows: '3', cols: [['order_id', 'INTEGER'], ['amount', 'DECIMAL(10,2)'], ['channel', 'VARCHAR']], origin: L('粘贴', 'Pasted') }); toast(t('toast.imported', { t: 'pasted_1010' })); return; }
  if (e.target.closest('[data-import-url]')) { closeOverlays(); toast(L('原型：URL 读取仅演示', 'Prototype: URL import is demo only'), 'info'); }
});
$('#drawer').addEventListener('input', e => {
  if (e.target.id === 'pasteIn') paintPaste();
  if (e.target.id === 'connStr') {
    const m = e.target.value.match(/^(\w+):\/\/([^@:/]+)(?::[^@]*)?@([^:/]+)(?::(\d+))?\/(\w+)/);
    if (m) { $('#fUser').value = m[2]; $('#fHost').value = m[3]; $('#fPort').value = m[4] || ''; $('#fDb').value = m[5]; $('#fAlias').value = (m[1].startsWith('postgres') ? 'pg_' : 'mysql_') + m[5]; }
  }
});
$('#drawer').addEventListener('change', e => { if (e.target.id === 'fileIn' && e.target.files[0]) { DR.file = e.target.files[0]; renderDrawer(); } });
['dragover', 'dragleave', 'drop'].forEach(ev => $('#drawer').addEventListener(ev, e => {
  const d = e.target.closest('#drop'); if (!d) return; e.preventDefault();
  d.classList.toggle('over', ev === 'dragover');
  if (ev === 'drop' && e.dataTransfer.files[0]) { DR.file = e.dataTransfer.files[0]; renderDrawer(); }
}));
// dropping a file anywhere on the app opens the drawer with it
document.addEventListener('dragover', e => { if (e.dataTransfer?.types?.includes('Files')) e.preventDefault(); });
document.addEventListener('drop', e => { if (e.target.closest('#drawer')) return; if (e.dataTransfer?.files?.[0]) { e.preventDefault(); DR.file = e.dataTransfer.files[0]; openDrawer('file'); } });

// paste tabular text anywhere outside an input -> open Add data · Paste prefilled (complements in-grid copy)
document.addEventListener('paste', e => {
  if (e.target.closest('input,textarea,[contenteditable]') || $('#drawer').classList.contains('on')) return;
  const txt = e.clipboardData?.getData('text') || '';
  if (!/\t|,/.test(txt) || !/\n/.test(txt.trim())) return;
  e.preventDefault(); openDrawer('paste'); $('#pasteIn').value = txt.trim(); paintPaste(); toast(t('grid.pasteHint'), 'info');
});

/* ---------------- save-as-table dialog ---------------- */
function openSaveDialog() {
  $('#dialog').innerHTML = `<header><h3>${t('dlg.saveT')}</h3><p>${t('dlg.saveD')}</p></header><div class="body">
    <label class="fl"><span>${t('dlg.name')}</span><input class="field mono" id="saveName" value="${curTab().data === 'monthly' ? 'revenue_by_month' : 'completed_orders_by_customer'}"></label>
    <div class="fl"><span>${t('dlg.mode')}</span><div class="seg" style="width:100%"><button class="on" style="flex:1;justify-content:center">${t('dlg.new')}</button><button style="flex:1;justify-content:center">${t('dlg.replace')}</button><button style="flex:1;justify-content:center">${t('dlg.append')}</button></div></div></div>
    <footer><button class="btn" data-close>${t('common.cancel')}</button><button class="btn inv" data-do-save>${t('common.save')}</button></footer>`;
  $('#dialog').classList.add('on'); $('#scrim').classList.add('on');
  setTimeout(() => { const i = $('#saveName'); i.focus(); i.select(); }, 60);
}
$('#dialog').addEventListener('click', e => {
  const seg = e.target.closest('.seg button'); if (seg) { $$('.seg button', seg.parentNode).forEach(b => b.classList.toggle('on', b === seg)); return; }
  if (e.target.closest('[data-close]')) return closeOverlays();
  if (e.target.closest('[data-do-save]')) { const n = $('#saveName').value.trim() || 'result_1'; closeOverlays(); const d = S.result; addLocalTable(n, { rows: String(d.rows.length), cols: d.cols.map(c => [c.k, c.ty]), origin: L('查询结果', 'Query result') }); toast(t('toast.saved', { t: n })); }
});
$('#scrim').onclick = closeOverlays;

/* ---------------- command palette ---------------- */
let CK = { items: [], idx: 0 };
function cmdItems() {
  const A = (lbl, icon, k, fn) => ({ g: 'cmdk.actions', lbl, icon, k, fn });
  const items = [
    A(L('执行当前查询', 'Run current query'), 'play', '⌘↵', () => run()),
    A(L('异步执行', 'Run async'), 'clock', '⌘⇧↵', () => doAct('runAsync')),
    A(L('新建 SQL 标签', 'New SQL tab'), 'plus', '⌘T', () => newTab('sql')),
    A(L('新建 JOIN 查询', 'New JOIN query'), 'merge', '', () => newTab('join')),
    A(L('添加数据', 'Add data'), 'upload', '⌘N', () => openDrawer()),
    A(L('连接数据库', 'Connect a database'), 'db', '', () => openDrawer('db')),
    A(L('格式化 SQL', 'Format SQL'), 'align', '⇧⌥F', () => doAct('format')),
    A(L('打开 AI 助手', 'Open AI assistant'), 'spark', '⌘I', () => toggleAi(true)),
    A(L('切换数据源面板', 'Toggle explorer'), 'panel', '⌘B', () => toggleExplorer()),
    A(L('切换主题', 'Toggle theme'), 'moon', '⌘⇧L', () => doAct('theme')),
    A(S.lang === 'zh' ? 'Switch to English' : '切换到中文', 'lang', '', () => doAct('lang')),
    ...[['work', 'code'], ['sources', 'db'], ['ext', 'blocks'], ['settings', 'sliders']].map(([v, i]) => ({ g: 'cmdk.goto', lbl: t('nav.' + v), icon: i, k: '', fn: () => setView(v) })),
    ...SOURCES.flatMap(s => s.tables.map(tb => ({ g: 'cmdk.tables', lbl: refName(s.id, tb.n), icon: 'table', k: s.kind, mono: 1, fn: () => insertAtCursor(refName(s.id, tb.n)) }))),
    ...S.runs.slice(0, 4).map(r => ({ g: 'cmdk.recent', lbl: r.sql, icon: 'history', k: r.when, mono: 1, fn: () => newTab('sql', r.sql, r.sql.slice(0, 18) + '…') })),
  ];
  return items;
}
function openCmdk() {
  closeOverlays();
  $('#cmdk').classList.add('on'); $('#scrim').classList.add('on');
  $('#cmdkInput').value = ''; CK.idx = 0; paintCmdk();
  setTimeout(() => $('#cmdkInput').focus(), 20);
}
function paintCmdk() {
  const q = $('#cmdkInput').value.trim().toLowerCase();
  const score = s => { s = s.toLowerCase(); if (!q) return 1; if (s.includes(q)) return 2; let i = 0; for (const ch of s) if (ch === q[i]) i++; return i === q.length ? 1 : 0; };
  let all = cmdItems().filter(x => score(x.lbl) > 0);
  if (!q) { const rec = all.filter(x => x.g === 'cmdk.recent').slice(0, 3), act = all.filter(x => x.g === 'cmdk.actions').slice(0, 7), go = all.filter(x => x.g === 'cmdk.goto'), tbl = all.filter(x => x.g === 'cmdk.tables').slice(0, 4); all = [...rec, ...act, ...go, ...tbl]; }
  CK.items = all;
  CK.idx = Math.min(CK.idx, Math.max(0, CK.items.length - 1));
  let g = '', html = '';
  CK.items.forEach((x, i) => { if (x.g !== g) { g = x.g; html += `<div class="grp">${t(g)}</div>`; } html += `<div class="it ${i === CK.idx ? 'on' : ''}" data-ci="${i}" role="option" aria-selected="${i === CK.idx}">${ic(x.icon)}<span class="lbl ${x.mono ? 'mono' : ''}">${esc(x.lbl)}</span>${x.k ? (x.k.startsWith('⌘') || x.k.startsWith('⇧') ? `<kbd>${x.k}</kbd>` : `<small>${esc(x.k)}</small>`) : ''}</div>`; });
  $('#cmdkRes').innerHTML = html || `<div class="none">${t('cmdk.none')}</div>`;
  $('#cmdkRes .it.on')?.scrollIntoView({ block: 'nearest' });
}
$('#cmdkInput').addEventListener('input', () => { CK.idx = 0; paintCmdk(); });
$('#cmdkInput').addEventListener('keydown', e => {
  if (e.key === 'ArrowDown') { e.preventDefault(); CK.idx = (CK.idx + 1) % CK.items.length; paintCmdk(); }
  if (e.key === 'ArrowUp') { e.preventDefault(); CK.idx = (CK.idx - 1 + CK.items.length) % CK.items.length; paintCmdk(); }
  if (e.key === 'Enter' && CK.items[CK.idx]) { e.preventDefault(); const f = CK.items[CK.idx].fn; closeOverlays(); f(); }
});
$('#cmdkRes').addEventListener('click', e => { const it = e.target.closest('[data-ci]'); if (it) { const f = CK.items[+it.dataset.ci].fn; closeOverlays(); f(); } });
$('#cmdkRes').addEventListener('pointermove', e => { const it = e.target.closest('[data-ci]'); if (it && +it.dataset.ci !== CK.idx) { CK.idx = +it.dataset.ci; $$('#cmdkRes .it').forEach(x => x.classList.toggle('on', x === it)); } });

/* ---------------- AI panel ---------------- */
const AI_SQL = `SELECT o.region, sum(o.amount) AS paid\nFROM readme_demo_orders AS o\nWHERE o.status = 'completed'\n  AND o.created_at >= DATE '2026-09-01'\n  AND o.created_at <  DATE '2026-10-01'\nGROUP BY 1\nORDER BY paid DESC;`;
function renderAi() {
  $('#ai').innerHTML = `<div class="ai-head">${ic('spark')}${t('ai.title')}<span class="sp"></span><button class="ib" title="${L('新对话', 'New chat')}">${ic('plus', 's')}</button><button class="ib" data-act="toggleAi" aria-label="${t('common.close')}">${ic('x', 's')}</button></div>
    <div class="scope">${t('ai.scope')}<span class="tag">readme_demo_orders</span><button class="btn" style="height:22px;padding:0 6px;font-size:11.5px">${ic('plus', 's')}${t('ai.add')}</button></div>
    <div class="ai-log"><div class="msg-u">${t('ai.q')}</div>
      <div class="steps"><div><span class="ok">${ic('check', 's')}</span>${t('ai.s1')}<em>12 ms</em></div><div><span class="ok">${ic('check', 's')}</span>${t('ai.s3')}<em>131 ms</em></div></div>
      <div class="ans">${t('ai.a')}<div class="sqlblk"><pre>${highlight(AI_SQL)}</pre><footer><button class="btn" data-ai-insert>${ic('plus', 's')}${t('ai.insert')}</button><button class="btn" data-ai-run>${ic('play', 's')}${t('ai.runIt')}</button><button class="btn" data-copy-ai>${ic('copy', 's')}${t('common.copy')}</button></footer></div>
      <div class="evidence">${ic('check', 's')}<span>${t('ai.ev')}</span></div></div></div>
    <div class="ai-input"><textarea id="aiInput" placeholder="${t('ai.ph')}"></textarea><footer>${t('ai.hint')}<span class="sp"></span><button class="send" aria-label="send">${ic('send', 's')}</button></footer></div>`;
}
$('#ai').addEventListener('click', e => {
  if (e.target.closest('[data-ai-insert]')) { newTab('sql', AI_SQL, L('地区实付', 'paid by region')); toast(t('toast.inserted'), 'info'); }
  if (e.target.closest('[data-ai-run]')) { newTab('sql', AI_SQL, L('地区实付', 'paid by region')); run(); }
  if (e.target.closest('[data-copy-ai]')) { navigator.clipboard?.writeText(AI_SQL).catch(() => {}); toast(t('common.copied'), 'info'); }
  if (e.target.closest('.send')) { const v = $('#aiInput').value.trim(); if (!v) return; const u = document.createElement('div'); u.className = 'msg-u'; u.textContent = v; $('.ai-log').append(u); $('#aiInput').value = '';
    const s = document.createElement('div'); s.className = 'steps'; s.innerHTML = `<div><span class="st run">${ic('loader', 's')}</span>${t('ai.s1')}</div>`; $('.ai-log').append(s); $('.ai-log').scrollTop = 1e6;
    setTimeout(() => s.innerHTML = `<div><span style="color:var(--err)">${ic('alert', 's')}</span>${L('未配置模型：请在 设置 → AI 模型 填写 Key', 'No model configured: add a key in Settings → AI model')}</div>`, 900); }
});

/* ---------------- proposals ---------------- */
const PROPS = () => [
  [L('运行记录：历史 + 异步任务合一', 'Runs: history + async tasks in one list'), L('<i>现状</i> 异步任务是顶栏子页，历史在另一个面板。<i>提案</i> 一个按时间排列的「运行记录」，同步/异步、成功/失败/进行中同一列表，点击即在新标签复现。', '<i>Now</i> async tasks are a header sub-page and history lives in another panel. <i>Proposal</i> one time-ordered Runs list (sync/async, ok/failed/running); click to reopen in a new tab.'), () => { setView('work'); S.exp = 'runs'; renderTree(); }],
  [L('AI 合一：对话在工作台，配置进设置', 'One AI: chat in the workbench, config in Settings'), L('<i>现状</i> 侧栏「AI 模型」是配置页，对话藏在 SQL 工具栏里。<i>提案</i> ⌘I 打开工作台右侧 AI 面板（带范围与执行证据），模型配置并入 设置 → AI 模型。', '<i>Now</i> the “AI model” nav item is a config page, and chat hides in the SQL toolbar. <i>Proposal</i> ⌘I opens a right-hand AI panel with scope and evidence; model config moves to Settings → AI model.'), () => { setView('work'); toggleAi(true); }],
  [L('添加数据：一个入口', 'Add data: one entry point'), L('<i>现状</i> 数据库 / 文件上传 / 粘贴是三个子页。<i>提案</i> ⌘N 或拖入文件即打开同一个抽屉（文件 · 数据库 · 粘贴 · URL），从工作台不必跳页。', '<i>Now</i> database, upload and paste are three sub-pages. <i>Proposal</i> ⌘N or dropping a file opens one drawer (File · Database · Paste · URL) without leaving the workbench.'), () => openDrawer('file')],
  [L('可视化构建器成为标签类型', 'Visual builders become tab types'), L('<i>现状</i> SQL / JOIN / 集合 / 透视 是固定的 4 个标签，各只能开一个。<i>提案</i> 「+」新建任意类型的标签，可同时开多个 SQL，构建器可一键转成 SQL。', '<i>Now</i> SQL / JOIN / Set / Pivot are four fixed tabs, one of each. <i>Proposal</i> “+” creates any tab type, many SQL tabs at once, and builders convert to SQL in one click.'), () => { setView('work'); switchTab('t3'); }],
  [L('慢查询就地建议转异步', 'Suggest async in place for slow queries'), L('<i>现状</i> 需要事先决定同步还是异步。<i>提案</i> 执行超过 3 秒时在结果区出现「转为异步」，不必重跑。', '<i>Now</i> you must pick sync or async up front. <i>Proposal</i> after 3 seconds the result area offers “Move to async” without rerunning.'), () => { setScene('slow'); run(); }],
  [L('错误就地可修复', 'Errors you can fix in place'), L('<i>现状</i> 错误与「你是不是想找」分开显示。<i>提案</i> 编辑器行内波浪线 + 结果区一键替换并重跑，或交给 AI 解释修复。', '<i>Now</i> the error and “did you mean” appear separately. <i>Proposal</i> an inline squiggle in the editor plus one-click replace & rerun, or hand it to AI.'), () => { setScene('err'); run(); }],
];
function openProps() {
  const p = $('#props');
  if (p.classList.contains('on')) { p.classList.remove('on'); return; }
  p.innerHTML = `<header>${ic('bulb')}<h3>${t('props.title')}</h3><button class="ib" data-close-props aria-label="${t('common.close')}">${ic('x', 's')}</button></header><div class="lead">${t('props.lead')}</div>
    <ol>${PROPS().map((x, i) => `<li data-pi="${i}"><b>${x[0]}</b><span>${x[1]}</span></li>`).join('')}</ol>
    <footer><button class="switch ${document.body.classList.contains('mark') ? 'on' : ''}" role="switch" data-mark></button>${t('props.mark')}<span style="margin-left:auto">${t('props.note')}</span></footer>`;
  p.classList.add('on');
}
$('#props').addEventListener('click', e => {
  if (e.target.closest('[data-close-props]')) return $('#props').classList.remove('on');
  const m = e.target.closest('[data-mark]'); if (m) { document.body.classList.toggle('mark'); m.classList.toggle('on'); return; }
  const li = e.target.closest('[data-pi]'); if (li) PROPS()[+li.dataset.pi][2]();
});

/* ---------------- scenes ---------------- */
function setScene(sc) {
  S.scene = sc;
  if (S.view !== 'work') setView('work');
  if (curTab().id !== 't1') switchTab('t1');
  let v = SQL_DEFAULT[S.lang];
  if (sc === 'err') v = v.replace('mysql_prod_crm.customers', 'mysql_prod_crm.customer');
  if (sc === 'empty') v = v.replace("'completed'", "'void'");
  ta.value = v; curTab().sql = v; S.result = null; paintEditor(); renderResults(); renderStatus();
}

/* ---------------- action dispatcher ---------------- */
function doAct(a, el) {
  const d = S.result;
  switch (a) {
    case 'addData': return openDrawer();
    case 'refreshTree': return toast(L('数据源已刷新', 'Sources refreshed'), 'info');
    case 'runAsync': {
      const r = { id: 'r' + Date.now(), sql: (curTab().type === 'sql' ? ta.value : builderSql()).split('\n').filter(l => !l.startsWith('--')).join(' ').replace(/\s+/g, ' ').slice(0, 80), st: 'run', pct: 4, when: now(), day: 0, async: 1 };
      S.runs.unshift(r); renderTree(); renderStatus();
      toast(t('toast.async'), 'info', { label: t('toast.view'), fn: () => { S.exp = 'runs'; renderTree(); } });
      const iv = setInterval(() => { r.pct = Math.min(100, r.pct + 13 + Math.random() * 10); if (r.pct >= 100) { clearInterval(iv); r.st = 'ok'; r.rows = 9; r.ms = 5820; toast(t('toast.asyncDone', { n: 9 })); } if (S.exp === 'runs') renderTree(); else renderTree(); renderStatus(); }, 700);
      return;
    }
    case 'toAsync': stopUi(); S.result = null; renderResults(); return doAct('runAsync');
    case 'format': if (curTab().type !== 'sql') return; ta.value = formatSql(ta.value); curTab().sql = ta.value; paintEditor(); return toast(t('toast.formatted'), 'info');
    case 'bookmark': { const tb = curTab(); if (!S.bookmarks.some(b => b.sql === (tb.sql = ta.value))) S.bookmarks.unshift({ id: 'b' + Date.now(), title: { ...tb.title }, sql: tb.sql }); renderTree(); return toast(t('toast.bookmarked', { t: tabTitle(tb) }), 'ok', { label: t('toast.view'), fn: () => { S.exp = 'saved'; renderTree(); } }); }
    case 'toggleAi': return toggleAi();
    case 'fixTable': ta.value = ta.value.replace(/mysql_prod_crm\.customer\b(?!s)/g, 'mysql_prod_crm.customers'); curTab().sql = ta.value; S.scene = 'ok'; renderStatus(); return run();
    case 'copy': { if (S.sel) return copyRange('tsv'); const vis = visCols(d), rows = viewRows(d); navigator.clipboard?.writeText(vis.map(c => c.k).join('\t') + '\n' + toText(vis, rows.map(({ r }) => vis.map(c => r[c.i])), 'tsv')).catch(() => {}); return toast(t('grid.allCopied', { n: rows.length })); }
    case 'saveTable': return openSaveDialog();
    case 'max': S.max = !S.max; $('#v-work').classList.toggle('max', S.max); $('#maxBtn use').setAttribute('href', S.max ? '#i-min' : '#i-max'); return;
    case 'exportMenu': return openMenu(el, ['CSV', 'Excel (.xlsx)', 'JSON', 'Parquet'].map(f => `<button data-f="${f}">${ic('file', 's')}${f}</button>`).join(''), m => m.onclick = e => { const b = e.target.closest('[data-f]'); if (!b) return; closeMenu(); const ext = { CSV: 'csv', 'Excel (.xlsx)': 'xlsx', JSON: 'json', Parquet: 'parquet' }[b.dataset.f]; toast(t('toast.exported', { f: `orders_customers.${ext}`, n: d.rows.length })); });
    case 'colsMenu': return openMenu(el, `<div class="mh">${t('rb.cols')}</div>` + d.cols.map(c => `<button data-c="${c.k}"><span class="ck ${S.hidden.has(c.k) ? '' : 'on'}">${S.hidden.has(c.k) ? '' : ic('check', 's')}</span><span class="mono">${c.k}</span><small>${c.ty}</small></button>`).join('') + `<hr><button data-c="*">${ic('eye', 's')}${L('显示所有列', 'Show all columns')}</button><button data-c="fit">${ic('columns', 's')}${t('grid.autoFit')}</button><button data-c="reset">${ic('refresh', 's')}${t('grid.reset')}</button>`,
      m => m.onclick = e => { const b = e.target.closest('[data-c]'); if (!b) return; const k = b.dataset.c; if (k === 'fit') { S.widths = {}; renderResults(); return closeMenu(); } if (k === 'reset') { S.widths = {}; S.hidden.clear(); S.filters = {}; S.sel = null; renderResults(); return closeMenu(); } if (k === '*') S.hidden.clear(); else S.hidden.has(k) ? S.hidden.delete(k) : (S.hidden.size < d.cols.length - 1 && S.hidden.add(k)); renderResults(); const ck = b.querySelector('.ck'); if (ck) { const on = !S.hidden.has(k); ck.classList.toggle('on', on); ck.innerHTML = on ? ic('check', 's') : ''; } else closeMenu(); });
    case 'newTabMenu': return openMenu(el, [['sql', 'code', '⌘T'], ['join', 'merge', ''], ['set', 'layers', ''], ['pivot', 'pivot', '']].map(([k, i, s]) => `<button data-nt="${k}">${ic(i, 's')}${t('tab.' + k)}<small>${s}</small></button>`).join(''), m => m.onclick = e => { const b = e.target.closest('[data-nt]'); if (b) { closeMenu(); newTab(b.dataset.nt); } });
    case 'fedMenu': { const src = detectSources(curTab().type === 'sql' ? ta.value : builderSql());
      return openMenu(el, `<div class="mh">${L('本次查询将使用', 'This query will use')}</div>` + SOURCES.filter(s => s.st !== 'off').map(s => `<button><span class="ck ${src.includes(s.id) ? 'on' : ''}">${src.includes(s.id) ? ic('check', 's') : ''}</span>${esc(s.name[S.lang])}<small>${s.alias || 'local'}</small></button>`).join('') + `<hr><button data-go-view="sources">${ic('db', 's')}${L('管理外部数据库', 'Manage external databases')}</button>`); }
    case 'sceneMenu': return openMenu(el, `<div class="mh">${t('st.scene')}</div>` + ['ok', 'err', 'empty', 'slow'].map(s => `<button data-sc="${s}"><span class="ck ${S.scene === s ? 'on' : ''}">${S.scene === s ? ic('check', 's') : ''}</span>${t('scene.' + s)}</button>`).join(''), m => m.onclick = e => { const b = e.target.closest('[data-sc]'); if (b) { closeMenu(); setScene(b.dataset.sc); run(); } });
    case 'props': return openProps();
    case 'lang': return setLang(S.lang === 'zh' ? 'en' : 'zh');
    case 'theme': return setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
    case 'cmdk': return openCmdk();
    case 'showRuns': setView('work'); S.exp = 'runs'; if ($('#app').dataset.exp === 'off') toggleExplorer(); return renderTree();
    case 'toggleExp': return toggleExplorer();
    case 'tbMore': return openMenu(el, `<button data-m="format">${ic('align', 's')}${t('tb.format')}<small>⇧⌥F</small></button><button data-m="bookmark">${ic('star', 's')}${t('tb.save')}</button><hr><button data-m="fedMenu">${ic('merge', 's')}${t('fed.fed')}</button>`, m => m.onclick = e => { const b = e.target.closest('[data-m]'); if (!b) return; closeMenu(); doAct(b.dataset.m, el); });
    case 'builderToSql': return newTab('sql', builderSql(), L('订单 ⋈ 发票', 'orders ⋈ invoices'));
  }
}
document.addEventListener('click', e => {
  const v = e.target.closest('[data-view]'); if (v && v.classList.contains('rb')) { setView(v.dataset.view); closeMenu(); return; }
  const gv = e.target.closest('[data-go-view]'); if (gv) { closeMenu(); setView(gv.dataset.goView); return; }
  if (e.target.closest('#railAi')) return toggleAi();
  if (e.target.closest('#runBtn')) return run();
  const a = e.target.closest('[data-act]'); if (a && !a.disabled) doAct(a.dataset.act, a);
});

/* ---------------- keyboard ---------------- */
document.addEventListener('keydown', e => {
  const mod = isMac ? e.metaKey : e.ctrlKey, k = e.key.toLowerCase();
  if (mod && k === 'k') { e.preventDefault(); return $('#cmdk').classList.contains('on') ? closeOverlays() : openCmdk(); }
  if (e.key === 'Escape') { if ($('#props').classList.contains('on')) $('#props').classList.remove('on'); closeOverlays(); if (innerWidth <= 900) $('#app').classList.remove('exp-mobile'); return; }
  if ($('#cmdk').classList.contains('on') || $('#drawer').classList.contains('on') || $('#dialog').classList.contains('on')) {
    if (e.key === 'Enter' && $('#dialog').classList.contains('on') && e.target.id === 'saveName') { e.preventDefault(); $('[data-do-save]').click(); }
    return;
  }
  if (mod && e.key === 'Enter') { e.preventDefault(); return e.shiftKey ? doAct('runAsync') : run(); }
  if (mod && k === 'i') { e.preventDefault(); return toggleAi(); }
  if (mod && k === 'n') { e.preventDefault(); return openDrawer(); }
  if (mod && k === 't') { e.preventDefault(); return newTab('sql'); }
  if (mod && k === 'b') { e.preventDefault(); return toggleExplorer(); }
  if (mod && e.shiftKey && k === 'l') { e.preventDefault(); return doAct('theme'); }
  if (e.shiftKey && e.altKey && (k === 'f' || e.code === 'KeyF')) { e.preventDefault(); return doAct('format'); }
  if (e.key === '/' && !e.target.closest('input,textarea')) { e.preventDefault(); if (S.view !== 'work') setView('work'); S.exp = 'sources'; renderTree(); $('#treeFilter').focus(); }
});
addEventListener('resize', () => { $('#app').style.setProperty('--ai-w', S.ai && innerWidth > 900 ? '380px' : '0px'); syncScroll(); });

/* ---------------- init ---------------- */
ta.value = curTab().sql;
applyI18n();
setView('work');
// show a finished federated run on first load so the result area demonstrates the product immediately
S.result = ORDERS; renderResults();
// review hooks: #theme=light&lang=en&view=sources&scene=err&open=cmdk|drawer|ai|props
(() => {
  const h = new URLSearchParams(location.hash.slice(1));
  if (h.get('theme')) setTheme(h.get('theme'));
  if (h.get('lang') && h.get('lang') !== S.lang) setLang(h.get('lang'));
  if (h.get('view')) setView(h.get('view'));
  if (h.get('scene')) { setScene(h.get('scene')); if (h.get('scene') !== 'slow') { S.scene = h.get('scene'); finish(); } else run(); }
  if (h.get('rt')) { S.rt = h.get('rt'); renderResults(); }
  const o = h.get('open');
  if (o === 'cmdk') openCmdk(); if (o === 'drawer') openDrawer(h.get('tab') || 'db'); if (o === 'ai') toggleAi(true); if (o === 'props') { openProps(); document.body.classList.add('mark'); }
})();
