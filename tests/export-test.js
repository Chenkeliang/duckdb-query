/**
 * 导出功能专项测试
 * 验证DuckDB数据源的导出功能是否正常工作
 */

const { chromium } = require('playwright');

class ExportTest {
  constructor() {
    this.browser = null;
    this.page = null;
    this.testResults = [];
  }

  async setup() {
    console.log('🚀 启动浏览器...');
    this.browser = await chromium.launch({ 
      headless: false,
      slowMo: 1000
    });
    this.page = await this.browser.newPage();
    
    // 监听下载事件
    this.page.on('download', async download => {
      console.log(`📥 文件下载: ${download.suggestedFilename()}`);
      await download.saveAs(`/tmp/${download.suggestedFilename()}`);
    });
    
    // 监听控制台消息
    this.page.on('console', msg => {
      if (msg.type() === 'error') {
        console.log(`[ERROR] ${msg.text()}`);
      }
    });
  }

  async addTestResult(testName, success, message) {
    const result = { testName, success, message };
    this.testResults.push(result);
    const status = success ? '✅' : '❌';
    console.log(`${status} ${testName}: ${message}`);
  }

  async testExportFunctionality() {
    console.log('\n📊 测试导出功能...');
    
    try {
      // 导航到页面
      await this.page.goto('http://localhost:3000');
      await this.page.waitForTimeout(3000);
      
      // 切换到数据查询页面
      await this.page.click('[role="tab"]:has-text("数据查询与结果")');
      await this.page.waitForTimeout(2000);
      
      // 检查是否有可用的数据源
      const dataSourceCount = await this.page.locator('.MuiList-root button').count();
      if (dataSourceCount === 0) {
        await this.addTestResult('导出功能', false, '没有可用的数据源');
        return false;
      }
      
      // 添加第一个数据源
      await this.page.click('.MuiList-root button:first-child');
      await this.page.waitForTimeout(1000);
      
      // 执行查询
      const executeButton = this.page.locator('button:has-text("执行查询")');
      if (await executeButton.isEnabled()) {
        await executeButton.click();
        await this.page.waitForTimeout(3000);
        
        // 检查是否有查询结果
        const resultExists = await this.page.locator('text=查询结果').isVisible();
        if (!resultExists) {
          await this.addTestResult('导出功能', false, '查询未返回结果');
          return false;
        }
        
        // 测试导出功能
        const downloadButton = this.page.locator('button:has-text("下载结果")');
        if (await downloadButton.isEnabled()) {
          // 设置下载监听
          const downloadPromise = this.page.waitForEvent('download');
          
          await downloadButton.click();
          
          // 等待下载完成
          const download = await downloadPromise;
          const filename = download.suggestedFilename();
          
          if (filename && filename.includes('.xlsx')) {
            await this.addTestResult('导出功能', true, `成功下载文件: ${filename}`);
            return true;
          } else {
            await this.addTestResult('导出功能', false, `下载文件格式错误: ${filename}`);
            return false;
          }
        } else {
          await this.addTestResult('导出功能', false, '下载按钮不可用');
          return false;
        }
      } else {
        await this.addTestResult('导出功能', false, '执行查询按钮不可用');
        return false;
      }
    } catch (error) {
      await this.addTestResult('导出功能', false, `测试失败: ${error.message}`);
      return false;
    }
  }

  async testJoinExport() {
    console.log('\n🔗 测试表连接导出功能...');
    
    try {
      // 检查是否有多个数据源可用于连接
      const dataSourceCount = await this.page.locator('.MuiList-root button').count();
      if (dataSourceCount < 2) {
        await this.addTestResult('表连接导出', false, '数据源不足，无法测试表连接');
        return false;
      }
      
      // 清除已选择的数据源
      const removeButtons = await this.page.locator('button:has-text("从查询中移除")').count();
      for (let i = 0; i < removeButtons; i++) {
        await this.page.click('button:has-text("从查询中移除")');
        await this.page.waitForTimeout(500);
      }
      
      // 添加两个数据源
      await this.page.click('.MuiList-root button:nth-child(1)');
      await this.page.waitForTimeout(1000);
      
      if (dataSourceCount > 1) {
        await this.page.click('.MuiList-root button:nth-child(2)');
        await this.page.waitForTimeout(1000);
      }
      
      // 检查是否显示了连接条件设置
      const joinSectionExists = await this.page.locator('text=连接条件').isVisible();
      if (joinSectionExists) {
        await this.addTestResult('表连接导出', true, '表连接界面正常显示');
        return true;
      } else {
        await this.addTestResult('表连接导出', false, '表连接界面未显示');
        return false;
      }
    } catch (error) {
      await this.addTestResult('表连接导出', false, `测试失败: ${error.message}`);
      return false;
    }
  }

  async printResults() {
    console.log('\n📈 测试结果分析...');
    
    const totalTests = this.testResults.length;
    const passedTests = this.testResults.filter(r => r.success).length;
    const failedTests = this.testResults.filter(r => r.success === false);
    
    console.log(`\n📊 测试统计: ${passedTests}/${totalTests} 通过`);
    
    if (failedTests.length > 0) {
      console.log('\n❌ 失败的测试:');
      failedTests.forEach(test => {
        console.log(`  - ${test.testName}: ${test.message}`);
      });
    }
    
    console.log('\n✅ 导出功能测试完成!');
  }

  async cleanup() {
    if (this.browser) {
      await this.browser.close();
    }
  }

  async run() {
    try {
      await this.setup();
      
      console.log('🧪 开始执行导出功能专项测试...\n');
      
      await this.testExportFunctionality();
      await this.testJoinExport();
      
      await this.printResults();
      
    } catch (error) {
      console.error('测试执行失败:', error);
    } finally {
      await this.cleanup();
    }
  }
}

// 运行测试
const test = new ExportTest();
test.run().catch(console.error);
