const { chromium } = require('playwright');

(async () => {
  console.log('🔍 启动验证调试面板移除测试...');
  
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    console.log('🌐 正在访问前端应用...');
    await page.goto('http://localhost:3000', { 
      waitUntil: 'domcontentloaded',
      timeout: 30000 
    });

    // 等待页面加载
    await page.waitForTimeout(3000);

    // 检查页面是否包含调试面板
    const debugPanelExists = await page.locator('text=请求管理器调试面板').count();
    const debugPanelByStyle = await page.locator('[style*="position: fixed"][style*="top: 10px"][style*="left: 10px"]').count();
    const debugPanelByText = await page.locator('text=测试单个请求').count();

    console.log(`📊 调试面板检查结果:`);
    console.log(`- 包含"请求管理器调试面板"文本: ${debugPanelExists}`);
    console.log(`- 包含固定位置样式: ${debugPanelByStyle}`);
    console.log(`- 包含"测试单个请求"按钮: ${debugPanelByText}`);

    if (debugPanelExists === 0 && debugPanelByStyle === 0 && debugPanelByText === 0) {
      console.log('✅ 调试面板已成功移除');
    } else {
      console.log('❌ 调试面板仍然存在');
    }

    // 截图保存验证结果
    await page.screenshot({ path: 'debug-panel-removal-verification.png' });
    console.log('📸 已保存页面截图用于验证');

  } catch (error) {
    console.error('❌ 验证过程中出现错误:', error.message);
  } finally {
    await browser.close();
    console.log('🔍 验证完成');
  }
})();