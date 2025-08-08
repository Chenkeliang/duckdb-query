// 诊断导出错误的测试脚本
const axios = require('axios');

async function testExportError() {
    console.log('🔍 诊断导出错误...');
    
    // 测试数据 - 简化的数据避免复杂编码问题
    const testData = {
        data: [
            { id: "1", name: "测试1", value: "100" },
            { id: "2", name: "测试2", value: "200" }
        ],
        columns: ["id", "name", "value"],
        filename: "test_export"
    };
    
    try {
        console.log('📤 测试导出API...');
        const response = await axios.post('http://localhost:3000/api/export/quick', testData, {
            timeout: 10000,
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        console.log('✅ 导出成功!');
        console.log('响应状态:', response.status);
        console.log('响应头:', response.headers);
        
    } catch (error) {
        console.log('❌ 导出失败:');
        console.log('错误状态:', error.response?.status);
        console.log('错误信息:', error.response?.data);
        console.log('错误详情:', error.message);
        
        if (error.response?.data) {
            console.log('服务器错误详情:', JSON.stringify(error.response.data, null, 2));
        }
    }
}

// 运行测试
testExportError().catch(console.error);