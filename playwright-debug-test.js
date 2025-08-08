const { chromium } = require('playwright');

async function debugFrontendRequests() {
  console.log('🔍 启动 Playwright 测试来诊断前端API请求问题...');
  
  const browser = await chromium.launch({ 
    headless: false, // 显示浏览器窗口
    slowMo: 1000 // 慢动作执行
  });
  
  const context = await browser.newContext();
  const page = await context.newPage();
  
  // 监听所有网络请求
  const requests = [];
  page.on('request', request => {
    const url = request.url();
    if (url.includes('/api/database_connections')) {
      const timestamp = new Date().toISOString();
      console.log(`🚨 API请求: ${timestamp} - ${url}`);
      requests.push({ timestamp, url, method: request.method() });
    }
  });
  
  // 监听控制台日志
  page.on('console', msg => {
    const text = msg.text();
    if (text.includes('🚀') || text.includes('🔄') || text.includes('🛡️') || text.includes('🚨') || 
        text.includes('database_connections') || text.includes('DataSourceList')) {
      console.log(`📋 控制台: ${text}`);
    }
  });
  
  // 监听页面错误
  page.on('pageerror', error => {
    console.log(`❌ 页面错误: ${error.message}`);
  });
  
  try {
    console.log('🌐 正在访问前端应用...');
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
    
    console.log('⏳ 等待页面加载完成...');
    await page.waitForTimeout(5000);
    
    // 检查是否有疯狂请求
    const connectionRequests = requests.filter(r => r.url.includes('/api/database_connections'));
    console.log(`📊 数据库连接API请求总数: ${connectionRequests.length}`);
    
    if (connectionRequests.length > 3) {
      console.log('🚨 发现疯狂请求！请求详情:');
      connectionRequests.forEach((req, index) => {
        console.log(`  ${index + 1}. ${req.timestamp} - ${req.method} ${req.url}`);
      });
      
      // 分析请求时间间隔
      if (connectionRequests.length > 1) {
        for (let i = 1; i < connectionRequests.length; i++) {
          const prev = new Date(connectionRequests[i-1].timestamp);
          const curr = new Date(connectionRequests[i].timestamp);
          const interval = curr - prev;
          console.log(`  📏 请求间隔 ${i}: ${interval}ms`);
        }
      }
    } else {
      console.log('✅ 请求数量正常，未发现疯狂请求');
    }
    
    // 检查页面是否有我们添加的诊断日志
    const pageContent = await page.content();
    console.log('🔍 检查页面内容...');
    
    // 等待更长时间观察
    console.log('⏳ 持续监控60秒...');
    const startTime = Date.now();
    const initialRequestCount = requests.length;
    
    while (Date.now() - startTime < 60000) { // 60秒
      await page.waitForTimeout(1000);
      const currentRequestCount = requests.filter(r => r.url.includes('/api/database_connections')).length;
      if (currentRequestCount > initialRequestCount + 5) {
        console.log(`🚨 在监控期间发现新的疯狂请求！总数: ${currentRequestCount}`);
        break;
      }
    }
    
    const finalRequestCount = requests.filter(r => r.url.includes('/api/database_connections')).length;
    console.log(`📈 监控结果: 初始请求数 ${initialRequestCount}, 最终请求数 ${finalRequestCount}`);
    
    // 获取浏览器控制台的所有日志
    console.log('📝 获取更多页面信息...');
    const userAgent = await page.evaluate(() => navigator.userAgent);
    console.log(`🌐 浏览器: ${userAgent}`);
    
  } catch (error) {
    console.error(`❌ 测试执行出错: ${error.message}`);
  } finally {
    await browser.close();
  }
  
  return requests.filter(r => r.url.includes('/api/database_connections'));
}

// 执行测试
debugFrontendRequests()
  .then(requests => {
    console.log('\n🎯 测试总结:');
    console.log(`- 总共监测到 ${requests.length} 个数据库连接API请求`);
    if (requests.length > 5) {
      console.log('- ⚠️  发现疑似疯狂请求问题');
      console.log('- 🔧 建议检查前端代码中的useEffect依赖和防抖逻辑');
    } else {
      console.log('- ✅ API请求数量正常');
    }
    console.log('\n测试完成！');
    process.exit(0);
  })
  .catch(error => {
    console.error('❌ 测试失败:', error);
    process.exit(1);
  });