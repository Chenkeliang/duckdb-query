// 测试保存功能的简化版本
const axios = require('axios');

async function testSaveFunction() {
    console.log('💾 测试DuckDB保存功能...');
    
    try {
        // 使用DuckDB内置函数，不依赖外部数据源
        const saveData = {
            sql: "SELECT 1 as test_col, '测试中文数据' as chinese_col, 'Test English' as english_col",
            datasource: { 
                id: "duckdb_internal", 
                type: "duckdb" 
            },
            table_alias: "test_save_" + Date.now()
        };
        
        console.log('测试数据:', JSON.stringify(saveData, null, 2));
        
        const response = await axios.post('http://localhost:8000/api/save_query_to_duckdb', saveData, {
            timeout: 30000,
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        if (response.data.success) {
            console.log('✅ 保存功能测试成功!');
            console.log('📋 保存结果:');
            console.log('- 表名:', response.data.table_alias);
            console.log('- 行数:', response.data.row_count);
            console.log('- 列数:', response.data.columns?.length || 0);
            console.log('- 列名:', response.data.columns);
            
            // 验证表是否真的创建了
            console.log('\n🔍 验证表是否创建成功...');
            const tablesResponse = await axios.get('http://localhost:8000/api/duckdb_tables');
            const tables = tablesResponse.data.tables || [];
            const createdTable = tables.find(t => t.table_name === response.data.table_alias);
            
            if (createdTable) {
                console.log('✅ 表验证成功:', createdTable.table_name, '包含', createdTable.row_count, '行数据');
            } else {
                console.log('⚠️ 表验证失败: 未在DuckDB中找到创建的表');
            }
            
        } else {
            console.log('❌ 保存功能失败:', response.data.message);
        }
        
    } catch (error) {
        console.log('❌ 保存功能测试失败');
        console.log('错误状态:', error.response?.status);
        if (error.response?.data) {
            console.log('错误详情:', JSON.stringify(error.response.data, null, 2));
        } else {
            console.log('错误消息:', error.message);
        }
    }
}

// 运行测试
testSaveFunction().catch(console.error);