const { chromium } = require('playwright');

(async () => {
  console.log('🔍 开始诊断导出和保存功能问题...');
  
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  // 监听网络请求
  const networkRequests = [];
  page.on('request', request => {
    if (request.url().includes('/api/')) {
      networkRequests.push({
        url: request.url(),
        method: request.method(),
        timestamp: new Date().toISOString()
      });
    }
  });

  // 监听网络响应
  const networkResponses = [];
  page.on('response', response => {
    if (response.url().includes('/api/')) {
      networkResponses.push({
        url: response.url(),
        status: response.status(),
        timestamp: new Date().toISOString()
      });
    }
  });

  // 监听控制台日志
  const consoleLogs = [];
  page.on('console', msg => {
    consoleLogs.push({
      type: msg.type(),
      text: msg.text(),
      timestamp: new Date().toISOString()
    });
  });

  try {
    console.log('🌐 访问前端应用...');
    await page.goto('http://localhost:3000', { 
      waitUntil: 'domcontentloaded',
      timeout: 30000 
    });

    // 等待页面加载
    await page.waitForTimeout(5000);

    // 检查是否有查询结果显示组件
    const queryResultsExist = await page.locator('text=保存为数据源').count();
    const exportButtonExist = await page.locator('text=导出').count();

    console.log(`📊 功能按钮检查:`);
    console.log(`- "保存为数据源"按钮: ${queryResultsExist > 0 ? '找到' : '未找到'}`);
    console.log(`- "导出"按钮: ${exportButtonExist > 0 ? '找到' : '未找到'}`);

    // 检查后端API可用性
    console.log('\n🔗 检查关键API端点...');
    
    try {
      // 检查保存到DuckDB的API
      const saveApiResponse = await page.evaluate(async () => {
        try {
          const response = await fetch('/api/save_query_to_duckdb', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sql: 'SELECT 1 as test',
              datasource: 'test',
              table_alias: 'test_table'
            })
          });
          return {
            exists: true,
            status: response.status,
            ok: response.ok
          };
        } catch (error) {
          return {
            exists: false,
            error: error.message
          };
        }
      });

      console.log('- /api/save_query_to_duckdb:', JSON.stringify(saveApiResponse, null, 2));

      // 检查快速导出API
      const exportApiResponse = await page.evaluate(async () => {
        try {
          const response = await fetch('/api/export/quick', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              query_request: { sql: 'SELECT 1 as test' },
              format: 'csv',
              filename: 'test.csv'
            })
          });
          return {
            exists: true,
            status: response.status,
            ok: response.ok
          };
        } catch (error) {
          return {
            exists: false,
            error: error.message
          };
        }
      });

      console.log('- /api/export/quick:', JSON.stringify(exportApiResponse, null, 2));

    } catch (error) {
      console.error('API检查失败:', error.message);
    }

    // 打印网络请求日志
    console.log('\n📡 网络请求记录:');
    networkRequests.forEach(req => {
      console.log(`${req.timestamp} - ${req.method} ${req.url}`);
    });

    console.log('\n📡 网络响应记录:');
    networkResponses.forEach(res => {
      console.log(`${res.timestamp} - ${res.status} ${res.url}`);
    });

    // 打印重要的控制台日志
    console.log('\n📋 重要控制台日志:');
    consoleLogs
      .filter(log => log.text.includes('导出') || log.text.includes('保存') || log.text.includes('export') || log.text.includes('save'))
      .forEach(log => {
        console.log(`${log.timestamp} [${log.type}] ${log.text}`);
      });

  } catch (error) {
    console.error('❌ 诊断过程中出现错误:', error.message);
  } finally {
    await browser.close();
    console.log('\n🔍 诊断完成');
  }
})();