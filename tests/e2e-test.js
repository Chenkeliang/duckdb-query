/**
 * 端到端自动测试脚本
 * 测试interactive-data-query项目的完整功能流程
 */

const { chromium } = require('playwright');

class E2ETestSuite {
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
    
    // 监听网络响应
    this.page.on('response', response => {
      if (response.url().includes('/api/')) {
        console.log(`[RESPONSE] ${response.status()} ${response.url()}`);
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

  async testFileListAPI() {
    console.log('\n📁 测试文件列表API...');
    
    try {
      const response = await fetch(`${this.apiBaseUrl}/api/list_files`);
      const files = await response.json();
      
      if (response.ok && Array.isArray(files)) {
        await this.addTestResult('文件列表API', true, `返回${files.length}个文件: ${files.join(', ')}`);
        return files;
      } else {
        await this.addTestResult('文件列表API', false, `API响应异常: ${response.status}`);
        return [];
      }
    } catch (error) {
      await this.addTestResult('文件列表API', false, `API调用失败: ${error.message}`);
      return [];
    }
  }

  async testPageLoad() {
    console.log('\n🌐 测试页面加载...');
    
    try {
      await this.page.goto(this.baseUrl, { waitUntil: 'networkidle' });
      
      // 检查页面标题
      const title = await this.page.title();
      if (title.includes('Interactive Data Query')) {
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

  async testDataSourceDisplay() {
    console.log('\n📊 测试数据源显示...');
    
    try {
      // 等待页面完全加载
      await this.page.waitForTimeout(3000);
      
      // 检查文件数据源显示
      const fileCountElement = await this.page.locator('h6:has-text("已上传文件")').first();
      const fileCountText = await fileCountElement.textContent();
      
      // 检查数据库连接显示
      const dbCountElement = await this.page.locator('h6:has-text("数据库连接")').first();
      const dbCountText = await dbCountElement.textContent();
      
      await this.addTestResult('数据源显示', true, `${fileCountText}, ${dbCountText}`);
      
      // 提取文件数量
      const fileMatch = fileCountText.match(/已上传文件 \((\d+)\)/);
      const fileCount = fileMatch ? parseInt(fileMatch[1]) : 0;
      
      return { fileCount, fileCountText, dbCountText };
    } catch (error) {
      await this.addTestResult('数据源显示', false, `获取数据源信息失败: ${error.message}`);
      return { fileCount: 0, fileCountText: '', dbCountText: '' };
    }
  }

  async testDataSourceRefresh() {
    console.log('\n🔄 测试数据源刷新...');

    try {
      // 尝试多种可能的刷新按钮选择器
      const refreshSelectors = [
        'button:has-text("手动刷新数据源")',
        'button:has-text("刷新")',
        '[data-testid="refresh-button"]',
        'button[title*="刷新"]',
        '.refresh-button'
      ];

      let refreshButton = null;
      for (const selector of refreshSelectors) {
        try {
          refreshButton = this.page.locator(selector).first();
          if (await refreshButton.isVisible({ timeout: 1000 })) {
            break;
          }
        } catch (e) {
          continue;
        }
      }

      if (refreshButton && await refreshButton.isVisible()) {
        await refreshButton.click();
        await this.page.waitForTimeout(2000);
        await this.addTestResult('数据源刷新', true, '刷新操作完成');
      } else {
        await this.addTestResult('数据源刷新', false, '未找到刷新按钮');
      }

      // 再次检查数据源显示
      const result = await this.testDataSourceDisplay();
      return result;
    } catch (error) {
      await this.addTestResult('数据源刷新', false, `刷新失败: ${error.message}`);
      return { fileCount: 0 };
    }
  }

  async testTabNavigation() {\n    console.log('\n\\uD83D\\uDDC2\\uFE0F 测试标签页导航...');\n\n    const tabs = [\n      { name: '\uD83D\uDCC1 数据源管理', selectors: ['[role=\"tab\"]:has-text(\"数据源管理\")', '.MuiTab-root:has-text(\"数据源管理\")', 'button:has-text(\"数据源管理\")'] },\n      { name: '\uD83D\uDD0D 数据查询与结果', selectors: ['[role=\"tab\"]:has-text(\"数据查询\")', '.MuiTab-root:has-text(\"数据查询\")', 'button:has-text(\"数据查询\")'] },\n      { name: '\uD83D\uDCBE SQL执行器', selectors: ['[role=\"tab\"]:has-text(\"SQL执行器\")', '.MuiTab-root:has-text(\"SQL执行器\")', 'button:has-text(\"SQL执行器\")'] },\n      { name: '\uD83D\uDDC4\\uFE0F DuckDB管理', selectors: ['[role=\"tab\"]:has-text(\"DuckDB管理\")', '.MuiTab-root:has-text(\"DuckDB管理\")', 'button:has-text(\"DuckDB管理\")'] },\n      { name: '\uD83D\uDCC3 数据库表管理', selectors: ['[role=\"tab\"]:has-text(\"数据库表管理\")', '.MuiTab-root:has-text(\"数据库表管理\")', 'button:has-text(\"数据库表管理\")'] },\n      { name: '\uD83D\uDCCB 异步任务', selectors: ['[role=\"tab\"]:has-text(\"异步任务\")', '.MuiTab-root:has-text(\"异步任务\")', 'button:has-text(\"异步任务\")'] }\n    ];\n\n    for (const tab of tabs) {\n      let success = false;\n      for (const selector of tab.selectors) {\n        try {\n          const tabElement = this.page.locator(selector).first();\n          if (await tabElement.isVisible({ timeout: 2000 })) {\n            await tabElement.click();\n            await this.page.waitForTimeout(1000);\n            success = true;\n            break;\n          }\n        } catch (error) {\n          continue;\n        }\n      }\n\n      if (success) {\n        await this.addTestResult(`标签页-${tab.name}`, true, '导航成功');\n      } else {\n        await this.addTestResult(`标签页-${tab.name}`, false, '未找到标签页元素');\n      }\n    }\n  }

  async testDatabaseTableManagement() {
    console.log('\n🗃️ 测试数据库表管理...');

    try {
      // 尝试切换到数据库表管理标签
      const tabSelectors = [
        '[role="tab"]:has-text("数据库表管理")',
        '.MuiTab-root:has-text("数据库表管理")',
        'button:has-text("数据库表管理")'
      ];

      let tabFound = false;
      for (const selector of tabSelectors) {
        try {
          const tab = this.page.locator(selector).first();
          if (await tab.isVisible({ timeout: 2000 })) {
            await tab.click();
            await this.page.waitForTimeout(3000);
            tabFound = true;
            break;
          }
        } catch (e) {
          continue;
        }
      }

      if (!tabFound) {
        await this.addTestResult('数据库表管理', false, '未找到数据库表管理标签页');
        return false;
      }

      // 检查是否有500错误
      const errorSelectors = ['text=500', 'text=Internal Server Error', '.error', '[data-testid="error"]'];
      let hasError = false;

      for (const selector of errorSelectors) {
        const errorCount = await this.page.locator(selector).count();
        if (errorCount > 0) {
          hasError = true;
          break;
        }
      }

      if (hasError) {
        await this.addTestResult('数据库表管理', false, '页面显示错误信息');
        return false;
      }

      await this.addTestResult('数据库表管理', true, '页面加载正常');
      return true;
    } catch (error) {
      await this.addTestResult('数据库表管理', false, `测试失败: ${error.message}`);
      return false;
    }
  }

  async testAsyncTasksPage() {
    console.log('\n📋 测试异步任务页面...');

    try {
      // 尝试切换到异步任务标签
      const tabSelectors = [
        '[role="tab"]:has-text("异步任务")',
        '.MuiTab-root:has-text("异步任务")',
        'button:has-text("异步任务")'
      ];

      let tabFound = false;
      for (const selector of tabSelectors) {
        try {
          const tab = this.page.locator(selector).first();
          if (await tab.isVisible({ timeout: 2000 })) {
            await tab.click();
            await this.page.waitForTimeout(3000);
            tabFound = true;
            break;
          }
        } catch (e) {
          continue;
        }
      }

      if (!tabFound) {
        await this.addTestResult('异步任务页面', false, '未找到异步任务标签页');
        return false;
      }

      // 检查页面标题
      const pageTitle = await this.page.locator('h2:has-text("异步任务列表")');
      if (await pageTitle.isVisible()) {
        await this.addTestResult('异步任务页面', true, '页面加载正常');
        return true;
      } else {
        await this.addTestResult('异步任务页面', false, '页面标题未找到');
        return false;
      }
    } catch (error) {
      await this.addTestResult('异步任务页面', false, `测试失败: ${error.message}`);
      return false;
    }
  }

  async runAllTests() {
    console.log('🧪 开始执行完整的端到端测试...\n');
    
    try {
      await this.setup();
      
      // 1. 测试API健康状态
      const apiHealthy = await this.testApiHealth();
      if (!apiHealthy) {
        console.log('❌ API不健康，跳过后续测试');
        return;
      }
      
      // 2. 测试文件列表API
      const files = await this.testFileListAPI();
      
      // 3. 测试页面加载
      const pageLoaded = await this.testPageLoad();
      if (!pageLoaded) {
        console.log('❌ 页面加载失败，跳过后续测试');
        return;
      }
      
      // 4. 测试数据源显示
      const initialDisplay = await this.testDataSourceDisplay();
      
      // 5. 测试数据源刷新
      const refreshedDisplay = await this.testDataSourceRefresh();
      
      // 6. 测试标签页导航
      await this.testTabNavigation();
      
      // 7. 测试数据库表管理
      await this.testDatabaseTableManagement();
      
      // 8. 测试异步任务页面
      await this.testAsyncTasksPage();
      
      // 9. 分析结果
      await this.analyzeResults(files, initialDisplay, refreshedDisplay);
      
    } catch (error) {
      console.error('❌ 测试执行失败:', error);
    } finally {
      await this.teardown();
    }
  }

  async analyzeResults(apiFiles, initialDisplay, refreshedDisplay) {
    console.log('\n📈 测试结果分析...');
    
    const successCount = this.testResults.filter(r => r.success).length;
    const totalCount = this.testResults.length;
    
    console.log(`\n📊 测试统计: ${successCount}/${totalCount} 通过`);
    
    // 分析文件显示问题
    if (apiFiles.length > 0 && initialDisplay.fileCount === 0) {
      console.log('\n🔍 问题分析:');
      console.log(`- API返回${apiFiles.length}个文件: ${apiFiles.join(', ')}`);
      console.log(`- 前端显示${initialDisplay.fileCount}个文件`);
      console.log('- 问题: 前端没有正确显示API返回的文件');
    }
    
    // 显示失败的测试
    const failedTests = this.testResults.filter(r => !r.success);
    if (failedTests.length > 0) {
      console.log('\n❌ 失败的测试:');
      failedTests.forEach(test => {
        console.log(`  - ${test.test}: ${test.message}`);
      });
    }
    
    console.log('\n✅ 测试完成!');
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  const testSuite = new E2ETestSuite();
  testSuite.runAllTests().catch(console.error);
}

module.exports = E2ETestSuite;
