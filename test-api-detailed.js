// 详细的API测试脚本
const axios = require('axios');

async function testAPIEndpoints() {
    console.log('🔍 详细API端点测试...');
    
    // 测试导出API
    console.log('\n📤 测试导出API...');
    try {
        const exportData = {
            data: [
                { id: "1", name: "测试数据1", value: "100" },
                { id: "2", name: "测试数据2", value: "200" }
            ],
            columns: ["id", "name", "value"],
            filename: "test_export"
        };
        
        console.log('发送请求到:', 'http://localhost:8000/api/export/quick');
        console.log('请求数据:', JSON.stringify(exportData, null, 2));
        
        const response = await axios.post('http://localhost:8000/api/export/quick', exportData, {
            responseType: 'blob',
            timeout: 30000,
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        console.log('✅ 导出API成功');
        console.log('响应状态:', response.status);
        console.log('响应头:', response.headers);
        console.log('文件大小:', response.data.size, 'bytes');
        
    } catch (error) {
        console.log('❌ 导出API失败');
        console.log('错误状态:', error.response?.status);
        console.log('错误消息:', error.response?.statusText);
        console.log('错误详情:', error.response?.data);
        console.log('完整错误:', error.message);
    }
    
    // 测试保存API
    console.log('\n💾 测试保存API...');
    try {
        const saveData = {
            sql: "SELECT 1 as test_col, '测试中文' as chinese_col",
            datasource: { id: "test_datasource", type: "duckdb" },
            table_alias: "test_table_" + Date.now()
        };
        
        console.log('发送请求到:', 'http://localhost:8000/api/save_query_to_duckdb');
        console.log('请求数据:', JSON.stringify(saveData, null, 2));
        
        const response = await axios.post('http://localhost:8000/api/save_query_to_duckdb', saveData, {
            timeout: 30000,
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        console.log('✅ 保存API成功');
        console.log('响应数据:', JSON.stringify(response.data, null, 2));
        
    } catch (error) {
        console.log('❌ 保存API失败');
        console.log('错误状态:', error.response?.status);
        console.log('错误消息:', error.response?.statusText);
        if (error.response?.data) {
            console.log('错误详情:', typeof error.response.data === 'string' ? 
                error.response.data : JSON.stringify(error.response.data, null, 2));
        }
        console.log('完整错误:', error.message);
    }
    
    // 测试基础健康检查
    console.log('\n🔗 测试基础API健康检查...');
    try {
        const healthResponse = await axios.get('http://localhost:8000/docs');
        console.log('✅ API基础服务正常, 状态:', healthResponse.status);
    } catch (error) {
        console.log('❌ API基础服务异常:', error.message);
    }
    
    // 测试DuckDB表列表
    console.log('\n📋 测试DuckDB表列表API...');
    try {
        const tablesResponse = await axios.get('http://localhost:8000/api/duckdb_tables');
        console.log('✅ DuckDB表列表API正常');
        console.log('当前表数量:', tablesResponse.data.total_tables || 0);
    } catch (error) {
        console.log('❌ DuckDB表列表API失败:', error.response?.status, error.message);
    }
}

// 运行测试
testAPIEndpoints().catch(console.error);