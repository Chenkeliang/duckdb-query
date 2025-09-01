/**
 * 异步任务系统专项测试
 * 专门测试异步任务功能的完整流程
 */

const { chromium } = require('playwright');

class AsyncTaskTestSuite {
  constructor() {
    this.browser = null;
    this.page = null;
    this.baseUrl = 'http://localhost:3000';
    this.apiBaseUrl = 'http://localhost:8000';
    this.testResults = [];
  }

  async setup() {
    console.log('🚀 启动浏览器...');
    this.browser = await chromium.launch({ headless: false });
    this.page = await this.browser.newPage();
    
    // 设置视口大小
    await this.page.setViewportSize({ width: 1920, height: 1080 });
    
    // 监听控制台消息
    this.page.on('console', msg => {
      console.log(`[CONSOLE] ${msg.text()}`);
    });
    
    // 监听网络请求
    this.page.on('request', request => {
      if (request.url().includes('/api/async')) {
        console.log(`[ASYNC REQUEST] ${request.method()} ${request.url()}`);
      }
    });
    
    // 监听网络响应
    this.page.on('response', response => {
      if (response.url().includes('/api/async')) {
        console.log(`[ASYNC RESPONSE] ${response.status()} ${response.url()}`);
      }
    });
  }

  async teardown() {
    if (this.browser) {
      await this.browser.close();
    }
  }

  async addTestResult(testName, success, message = '') {
    const result = {
      test: testName,
      success,
      message,
      timestamp: new Date().toISOString()
    };
    this.testResults.push(result);
    
    const status = success ? '✅' : '❌';
    console.log(`${status} ${testName}: ${message}`);
  }

  async testApiHealth() {
    console.log('\n📋 测试API健康状态...');
    
    try {
      const response = await fetch(`${this.apiBaseUrl}/health`);
      const data = await response.json();
      
      if (response.ok && data.status === 'healthy') {
        await this.addTestResult('API健康检查', true, '后端API正常运行');
        return true;
      } else {
        await this.addTestResult('API健康检查', false, `API状态异常: ${data.status}`);
        return false;
      }
    } catch (error) {
      await this.addTestResult('API健康检查', false, `API连接失败: ${error.message}`);
      return false;
    }
  }

  async testPageLoad() {
    console.log('\n🌐 测试页面加载...');
    
    try {
      await this.page.goto(this.baseUrl, { waitUntil: 'networkidle' });
      
      // 检查页面标题
      const title = await this.page.title();
      if (title.includes('Duck Query') || title.includes('数据查询')) {
        await this.addTestResult('页面加载', true, `页面标题: ${title}`);
        return true;
      } else {
        await this.addTestResult('页面加载', false, `页面标题异常: ${title}`);
        return false;
      }
    } catch (error) {
      await this.addTestResult('页面加载', false, `页面加载失败: ${error.message}`);
      return false;
    }
  }

  async testAsyncTaskTabNavigation() {
    console.log('\n📋 测试异步任务标签页导航...');
    
    try {
      // 点击异步任务标签页
      const asyncTab = this.page.locator('button:has-text("异步任务")');
      if (await asyncTab.isVisible({ timeout: 5000 })) {
        await asyncTab.click();
        await this.page.waitForTimeout(2000);
        
        // 检查页面标题
        const pageTitle = this.page.locator('h2:has-text("异步任务列表")');
        if (await pageTitle.isVisible()) {
          await this.addTestResult('异步任务标签页导航', true, '成功导航到异步任务页面');
          return true;
        } else {
          await this.addTestResult('异步任务标签页导航', false, '导航后页面标题未找到');
          return false;
        }
      } else {
        await this.addTestResult('异步任务标签页导航', false, '未找到异步任务标签页');
        return false;
      }
    } catch (error) {
      await this.addTestResult('异步任务标签页导航', false, `导航失败: ${error.message}`);
      return false;
    }
  }

  async testAsyncTaskListDisplay() {
    console.log('\n📋 测试异步任务列表显示...');
    
    try {
      // 检查任务列表容器
      const taskListContainer = this.page.locator('div:has-text("异步任务列表")').first();
      if (await taskListContainer.isVisible()) {
        // 检查刷新按钮
        const refreshButton = this.page.locator('button:has-text("refresh")').first();
        if (await refreshButton.isVisible()) {
          await this.addTestResult('异步任务列表显示', true, '任务列表和刷新按钮正常显示');
          return true;
        } else {
          await this.addTestResult('异步任务列表显示', true, '任务列表显示正常，但未找到刷新按钮');
          return true;
        }
      } else {
        await this.addTestResult('异步任务列表显示', false, '任务列表容器未找到');
        return false;
      }
    } catch (error) {
      await this.addTestResult('异步任务列表显示', false, `检查失败: ${error.message}`);
      return false;
    }
  }

  async testAsyncSQLExecution() {
    console.log('\n⚡ 测试异步SQL执行...');
    
    try {
      // 导航到SQL执行器页面
      const sqlTab = this.page.locator('button:has-text("SQL执行器")');
      if (await sqlTab.isVisible()) {
        await sqlTab.click();
        await this.page.waitForTimeout(2000);
      } else {
        await this.addTestResult('异步SQL执行', false, '未找到SQL执行器标签页');
        return false;
      }
      
      // 输入测试SQL
      const sqlEditor = this.page.locator('textarea[aria-label="SQL查询"]');
      if (await sqlEditor.isVisible()) {
        const testSql = 'SELECT generate_series(1, 10) as id, \'test_\' || generate_series(1, 10) as name';
        await sqlEditor.fill(testSql);
        await this.page.waitForTimeout(1000);
      } else {
        await this.addTestResult('异步SQL执行', false, '未找到SQL编辑器');
        return false;
      }
      
      // 点击异步执行按钮
      const asyncButton = this.page.locator('button:has-text("作为异步任务运行")');
      if (await asyncButton.isVisible()) {
        await asyncButton.click();
        await this.page.waitForTimeout(3000);
      } else {
        await this.addTestResult('异步SQL执行', false, '未找到异步执行按钮');
        return false;
      }
      
      // 检查成功消息
      const successMessage = this.page.locator('div[role="alert"]:has-text("异步任务已提交")');
      if (await successMessage.isVisible({ timeout: 5000 })) {
        await this.addTestResult('异步SQL执行', true, '异步任务提交成功');
        return true;
      } else {
        await this.addTestResult('异步SQL执行', false, '未显示任务提交成功消息');
        return false;
      }
    } catch (error) {
      await this.addTestResult('异步SQL执行', false, `执行失败: ${error.message}`);
      return false;
    }
  }

  async testTaskStatusTracking() {
    console.log('\n📋 测试任务状态跟踪...');
    
    try {
      // 导航到异步任务页面
      const asyncTab = this.page.locator('button:has-text("异步任务")');
      if (await asyncTab.isVisible()) {
        await asyncTab.click();
        await this.page.waitForTimeout(2000);
      } else {
        await this.addTestResult('任务状态跟踪', false, '未找到异步任务标签页');
        return false;
      }
      
      // 等待任务列表更新
      await this.page.waitForTimeout(3000);
      
      // 检查是否有任务条目
      const taskRows = await this.page.locator('table tbody tr').count();
      if (taskRows > 0) {
        // 检查第一个任务的状态
        const firstTaskStatus = await this.page.locator('table tbody tr td:nth-child(2) span').first().textContent();
        console.log(`📋 第一个任务状态: ${firstTaskStatus}`);
        
        await this.addTestResult('任务状态跟踪', true, `找到${taskRows}个任务，第一个任务状态: ${firstTaskStatus}`);
        return true;
      } else {
        await this.addTestResult('任务状态跟踪', false, '任务列表为空');
        return false;
      }
    } catch (error) {
      await this.addTestResult('任务状态跟踪', false, `检查失败: ${error.message}`);
      return false;
    }
  }

  async runAllTests() {
    console.log('🧪 开始执行异步任务系统专项测试...\n');
    
    try {
      await this.setup();
      
      // 1. 测试API健康状态
      const apiHealthy = await this.testApiHealth();
      if (!apiHealthy) {
        console.log('❌ API不健康，跳过后续测试');
        return;
      }
      
      // 2. 测试页面加载
      const pageLoaded = await this.testPageLoad();
      if (!pageLoaded) {
        console.log('❌ 页面加载失败，跳过后续测试');
        return;
      }
      
      // 3. 测试异步任务标签页导航
      await this.testAsyncTaskTabNavigation();
      
      // 4. 测试异步任务列表显示
      await this.testAsyncTaskListDisplay();
      
      // 5. 测试异步SQL执行
      await this.testAsyncSQLExecution();
      
      // 6. 测试任务状态跟踪
      await this.testTaskStatusTracking();
      
      // 7. 分析结果
      await this.analyzeResults();
      
    } catch (error) {
      console.error('❌ 测试执行失败:', error);
    } finally {
      await this.teardown();
    }
  }

  async analyzeResults() {
    console.log('\n📈 异步任务系统测试结果分析...');
    
    const successCount = this.testResults.filter(r => r.success).length;
    const totalCount = this.testResults.length;
    
    console.log(`\n📊 测试统计: ${successCount}/${totalCount} 通过`);
    
    // 显示失败的测试
    const failedTests = this.testResults.filter(r => !r.success);
    if (failedTests.length > 0) {
      console.log('\n❌ 失败的测试:');
      failedTests.forEach(test => {
        console.log(`  - ${test.test}: ${test.message}`);
      });
    }
    
    // 总体评估
    const passRate = (successCount / totalCount) * 100;
    if (passRate >= 80) {
      console.log('\n🎉 异步任务系统测试通过!');
    } else {
      console.log('\n⚠️ 异步任务系统测试未完全通过，请检查失败项。');
    }
    
    console.log('\n✅ 异步任务系统专项测试完成!');
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  const testSuite = new AsyncTaskTestSuite();
  testSuite.runAllTests().catch(console.error);
}

module.exports = AsyncTaskTestSuite;