const { chromium } = require('playwright');

async function testMonacoEditor() {
    console.log('🚀 开始测试 Monaco Editor 自动补全功能...');

    const browser = await chromium.launch({
        headless: false, // 显示浏览器窗口以便观察
        slowMo: 1000 // 放慢操作速度
    });

    const context = await browser.newContext();
    const page = await context.newPage();

    try {
        // 1. 访问应用
        console.log('📱 访问应用...');
        await page.goto('http://localhost:3000');
        await page.waitForLoadState('networkidle');

        // 2. 等待页面加载完成
        console.log('⏳ 等待页面加载...');
        await page.waitForTimeout(3000);

        // 3. 检查是否有 Monaco Editor
        console.log('🔍 检查 Monaco Editor...');
        const editorExists = await page.locator('.monaco-editor').count() > 0;
        console.log(`Monaco Editor 存在: ${editorExists}`);

        if (!editorExists) {
            console.log('❌ Monaco Editor 未找到，检查页面内容...');
            const pageContent = await page.content();
            console.log('页面内容片段:', pageContent.substring(0, 500));
            return;
        }

        // 4. 点击编辑器获取焦点
        console.log('🎯 点击编辑器获取焦点...');
        await page.click('.monaco-editor');
        await page.waitForTimeout(1000);

        // 5. 输入 SQL 查询
        console.log('⌨️ 输入 SQL 查询...');
        await page.keyboard.type('SELECT * FROM ');
        await page.waitForTimeout(2000);

        // 6. 检查自动补全是否出现
        console.log('🔍 检查自动补全...');
        const suggestions = await page.locator('.monaco-list-row').count();
        console.log(`找到 ${suggestions} 个建议项`);

        if (suggestions > 0) {
            console.log('✅ 自动补全正常工作！');

            // 获取建议项内容
            const suggestionTexts = await page.locator('.monaco-list-row .monaco-highlighted-label').allTextContents();
            console.log('建议项:', suggestionTexts);
        } else {
            console.log('❌ 未找到自动补全建议');

            // 尝试手动触发自动补全
            console.log('🔄 尝试手动触发自动补全...');
            await page.keyboard.press('Control+Space');
            await page.waitForTimeout(2000);

            const manualSuggestions = await page.locator('.monaco-list-row').count();
            console.log(`手动触发后找到 ${manualSuggestions} 个建议项`);
        }

        // 7. 检查控制台错误
        console.log('🔍 检查控制台错误...');
        const errors = [];
        page.on('console', msg => {
            if (msg.type() === 'error') {
                errors.push(msg.text());
            }
        });

        await page.waitForTimeout(2000);

        if (errors.length > 0) {
            console.log('❌ 发现控制台错误:');
            errors.forEach(error => console.log(`  - ${error}`));
        } else {
            console.log('✅ 没有发现控制台错误');
        }

        // 8. 测试表名补全
        console.log('📋 测试表名补全...');
        await page.keyboard.press('Escape'); // 关闭当前建议
        await page.keyboard.press('Home'); // 回到行首
        await page.keyboard.press('Control+A'); // 全选
        await page.keyboard.press('Delete'); // 删除内容

        await page.keyboard.type('SELECT * FROM "');
        await page.waitForTimeout(2000);

        const tableSuggestions = await page.locator('.monaco-list-row').count();
        console.log(`表名建议数量: ${tableSuggestions}`);

        if (tableSuggestions > 0) {
            console.log('✅ 表名补全正常工作！');
        } else {
            console.log('❌ 表名补全未工作');
        }

    } catch (error) {
        console.error('❌ 测试过程中发生错误:', error);
    } finally {
        // 等待一段时间以便观察结果
        console.log('⏳ 等待 5 秒以便观察结果...');
        await page.waitForTimeout(5000);

        await browser.close();
        console.log('🏁 测试完成');
    }
}

// 运行测试
testMonacoEditor().catch(console.error);
