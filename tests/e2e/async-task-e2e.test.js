/**
 * 异步任务系统端到端测试
 * 测试从提交异步任务到查看结果的完整流程
 */

const { chromium } = require('playwright');

class AsyncTaskE2ETest {
  constructor() {
    this.browser = null;
    this.page = null;
    this.baseUrl = 'http://localhost:3000';
    this.apiBaseUrl = 'http://localhost:8000';
  }

  async setup() {
    console.log('🚀 启动浏览器...');
    this.browser = await chromium.launch({ headless: false });
    this.page = await this.browser.newPage();
    
    // 监听控制台消息
    this.page.on('console', msg => {
      console.log(`[CONSOLE] ${msg.text()}`);
    });
    
    // 监听网络请求
    this.page.on('request', request => {
      if (request.url().includes('/api/')) {
        console.log(`[REQUEST] ${request.method()} ${request.url()}`);
      }
    });
  }

  async teardown() {
    if (this.browser) {
      await this.browser.close();
    }
  }

  async runTest() {
    try {
      console.log('🧪 开始异步任务系统端到端测试...');
      
      // 1. 访问应用
      console.log('\n🔗 访问应用...');
      await this.page.goto(this.baseUrl, { waitUntil: 'networkidle' });
      await this.page.waitForTimeout(3000);
      
      // 2. 导航到SQL执行器
      console.log('\n🔍 导航到SQL执行器...');
      await this.page.click('button:has-text("SQL执行器")');
      await this.page.waitForTimeout(2000);
      
      // 3. 输入测试SQL
      console.log('\n📝 输入测试SQL...');
      const testSql = 'SELECT generate_series(1, 100) as id, \'test_\' || generate_series(1, 100) as name';
      await this.page.fill('textarea[aria-label="SQL查询"]', testSql);
      await this.page.waitForTimeout(1000);
      
      // 4. 提交异步任务
      console.log('\n🚀 提交异步任务...');
      await this.page.click('button:has-text("作为异步任务运行")');
      await this.page.waitForTimeout(3000);
      
      // 5. 检查成功消息
      console.log('\n✅ 检查成功消息...');
      const successMessage = await this.page.locator('div[role="alert"]:has-text("异步任务已提交")');
      if (await successMessage.isVisible()) {
        console.log('✅ 异步任务提交成功');
      } else {
        console.log('❌ 未找到成功消息');
      }
      
      // 6. 导航到异步任务页面
      console.log('\n📋 导航到异步任务页面...');
      await this.page.click('button:has-text("异步任务")');
      await this.page.waitForTimeout(2000);
      
      // 7. 检查任务列表
      console.log('\n📊 检查任务列表...');
      const taskTable = await this.page.locator('table');
      if (await taskTable.isVisible()) {
        console.log('✅ 任务列表显示正常');
        
        // 检查是否有任务条目
        const taskRows = await this.page.locator('table tbody tr').count();
        console.log(`📋 找到 ${taskRows} 个任务条目`);
        
        if (taskRows > 0) {
          // 检查第一个任务的状态
          const firstTaskStatus = await this.page.locator('table tbody tr td:nth-child(2) span').first().textContent();
          console.log(`📋 第一个任务状态: ${firstTaskStatus}`);
        }
      } else {
        console.log('❌ 任务列表未显示');
      }
      
      // 8. 等待一段时间模拟任务执行
      console.log('\n⏳ 等待任务执行 (模拟)...');
      await this.page.waitForTimeout(5000);
      
      // 9. 刷新任务列表
      console.log('\n🔄 刷新任务列表...');
      const refreshButton = await this.page.locator('button:has-text("refresh")').first();
      if (await refreshButton.isVisible()) {
        await refreshButton.click();
        await this.page.waitForTimeout(2000);
        console.log('✅ 任务列表已刷新');
      } else {
        console.log('❌ 未找到刷新按钮');
      }
      
      console.log('\n🎉 异步任务系统端到端测试完成!');
      
    } catch (error) {
      console.error('❌ 测试执行失败:', error);
    }
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  const testSuite = new AsyncTaskE2ETest();
  
  (async () => {
    await testSuite.setup();
    await testSuite.runTest();
    await testSuite.teardown();
  })().catch(console.error);
}

module.exports = AsyncTaskE2ETest;