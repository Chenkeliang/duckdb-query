const { chromium } = require('playwright');
const axios = require('axios');

async function testExportAndSaveFeatures() {
    console.log('🎭 启动Playwright自动化测试...');
    
    const browser = await chromium.launch({ headless: false }); // 设置为false以便观察
    const context = await browser.newContext();
    const page = await context.newPage();
    
    try {
        // 1. 测试前端页面加载
        console.log('📄 测试前端页面加载...');
        await page.goto('http://localhost:3000');
        await page.waitForTimeout(3000);
        
        const title = await page.title();
        console.log(`页面标题: ${title}`);
        
        // 2. 测试API端点
        console.log('🔗 测试API端点...');
        
        // 测试API文档页面
        try {
            const apiResponse = await axios.get('http://localhost:8000/docs');
            console.log('✅ API文档页面正常');
        } catch (error) {
            console.log('❌ API文档页面异常:', error.message);
        }
        
        // 3. 测试导出API端点
        console.log('📤 测试导出API端点...');
        try {
            const exportData = {
                data: [
                    { id: "1", name: "测试数据1", value: "100" },
                    { id: "2", name: "测试数据2", value: "200" }
                ],
                columns: ["id", "name", "value"],
                filename: "test_export"
            };
            
            const response = await axios.post('http://localhost:8000/api/export/quick', exportData, {
                responseType: 'blob',
                timeout: 30000
            });
            
            if (response.status === 200 && response.data.size > 0) {
                console.log(`✅ 导出API测试成功，文件大小: ${response.data.size} bytes`);
            } else {
                console.log('❌ 导出API响应异常');
            }
        } catch (error) {
            console.log('❌ 导出API测试失败:', error.response?.status, error.response?.data || error.message);
        }
        
        // 4. 测试保存API端点
        console.log('💾 测试保存API端点...');
        try {
            const saveData = {
                sql: "SELECT 1 as test_col",
                datasource: { id: "test", type: "duckdb" },
                table_alias: "test_table_" + Date.now()
            };
            
            const saveResponse = await axios.post('http://localhost:8000/api/save_query_to_duckdb', saveData);
            
            if (saveResponse.data.success) {
                console.log('✅ 保存API测试成功:', saveResponse.data.message);
            } else {
                console.log('❌ 保存API响应失败:', saveResponse.data.message);
            }
        } catch (error) {
            console.log('❌ 保存API测试失败:', error.response?.status, error.response?.data?.detail || error.message);
        }
        
        // 5. 测试前端交互（如果页面有相关元素）
        console.log('🖱️ 测试前端交互...');
        try {
            // 等待页面完全加载
            await page.waitForTimeout(5000);
            
            // 尝试查找导出按钮
            const exportButton = await page.$('text=导出');
            if (exportButton) {
                console.log('✅ 找到导出按钮');
            } else {
                console.log('⚠️ 未找到导出按钮（可能需要先执行查询）');
            }
            
            // 尝试查找保存按钮
            const saveButton = await page.$('text=保存为数据源');
            if (saveButton) {
                console.log('✅ 找到保存按钮');
            } else {
                console.log('⚠️ 未找到保存按钮（可能需要先执行查询）');
            }
            
        } catch (error) {
            console.log('⚠️ 前端交互测试跳过:', error.message);
        }
        
        console.log('\n🎉 测试完成！');
        
    } catch (error) {
        console.error('❌ 测试过程中发生错误:', error);
    } finally {
        await browser.close();
    }
}

// 检查依赖
async function checkDependencies() {
    try {
        require('playwright');
        require('axios');
        return true;
    } catch (error) {
        console.log('⚠️ 缺少依赖，尝试安装...');
        const { execSync } = require('child_process');
        try {
            execSync('npm install playwright axios', { stdio: 'inherit' });
            execSync('npx playwright install chromium', { stdio: 'inherit' });
            return true;
        } catch (installError) {
            console.error('❌ 依赖安装失败:', installError.message);
            return false;
        }
    }
}

// 主函数
(async () => {
    console.log('🔍 检查测试依赖...');
    const depsOk = await checkDependencies();
    
    if (depsOk) {
        await testExportAndSaveFeatures();
    } else {
        console.log('❌ 无法运行测试，请手动安装依赖：');
        console.log('npm install playwright axios');
        console.log('npx playwright install chromium');
    }
})();
