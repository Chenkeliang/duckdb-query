const axios = require('axios');

// 测试配置
const BASE_URL = 'http://localhost:8000';
const TEST_CONFIG = {
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json'
  }
};

async function testQuickExportAPI() {
  console.log('\n🔍 测试 /api/export/quick 端点...');
  
  try {
    const testData = {
      data: [
        { id: 1, name: '测试数据1', value: 100 },
        { id: 2, name: '测试数据2', value: 200 }
      ],
      columns: ['id', 'name', 'value'],
      filename: 'test_export'
    };
    
    const response = await axios.post(`${BASE_URL}/api/export/quick`, testData, {
      ...TEST_CONFIG,
      responseType: 'blob'
    });
    
    if (response.status === 200 && response.data.size > 0) {
      console.log('✅ /api/export/quick 端点测试成功');
      console.log(`   - 状态码: ${response.status}`);
      console.log(`   - 文件大小: ${response.data.size} bytes`);
      console.log(`   - 内容类型: ${response.headers['content-type']}`);
      return true;
    } else {
      console.log('❌ /api/export/quick 端点返回空数据');
      return false;
    }
  } catch (error) {
    console.log('❌ /api/export/quick 端点测试失败');
    console.log(`   - 错误: ${error.response?.status || error.code} - ${error.response?.data?.detail || error.message}`);
    return false;
  }
}

async function testSaveQueryToDuckDB() {
  console.log('\n🔍 测试 /api/save_query_to_duckdb 端点...');
  
  try {
    const testData = {
      sql: 'SELECT 1 as test_id, "测试数据" as test_name',
      datasource: {
        id: 'test_datasource',
        type: 'mysql'
      },
      table_alias: 'test_table_' + Date.now()
    };
    
    const response = await axios.post(`${BASE_URL}/api/save_query_to_duckdb`, testData, TEST_CONFIG);
    
    if (response.status === 200 && response.data.success) {
      console.log('✅ /api/save_query_to_duckdb 端点测试成功');
      console.log(`   - 状态码: ${response.status}`);
      console.log(`   - 表别名: ${response.data.table_alias}`);
      console.log(`   - 行数: ${response.data.row_count}`);
      return true;
    } else {
      console.log('❌ /api/save_query_to_duckdb 端点返回失败状态');
      console.log(`   - 响应: ${JSON.stringify(response.data, null, 2)}`);
      return false;
    }
  } catch (error) {
    console.log('❌ /api/save_query_to_duckdb 端点测试失败');
    console.log(`   - 错误: ${error.response?.status || error.code} - ${error.response?.data?.detail || error.message}`);
    
    // 如果是500错误，说明端点存在但有实现问题
    if (error.response?.status === 500) {
      console.log('   - 注意: 端点存在但有内部错误，需要检查数据库连接配置');
    }
    return false;
  }
}

async function testAPIHealth() {
  console.log('\n🔍 测试API服务健康状态...');
  
  try {
    const response = await axios.get(`${BASE_URL}/docs`, { timeout: 5000 });
    if (response.status === 200) {
      console.log('✅ API服务运行正常');
      return true;
    }
  } catch (error) {
    console.log('❌ API服务连接失败');
    console.log(`   - 错误: ${error.code || error.message}`);
    return false;
  }
}

async function runTests() {
  console.log('🚀 开始测试导出和保存功能修复效果...');
  console.log(`📍 测试目标: ${BASE_URL}`);
  
  const results = {
    apiHealth: false,
    quickExport: false,
    saveQuery: false
  };
  
  // 1. 测试API健康状态
  results.apiHealth = await testAPIHealth();
  
  if (!results.apiHealth) {
    console.log('\n❌ API服务不可用，跳过其他测试');
    return results;
  }
  
  // 2. 测试快速导出端点
  results.quickExport = await testQuickExportAPI();
  
  // 3. 测试保存查询到DuckDB端点
  results.saveQuery = await testSaveQueryToDuckDB();
  
  // 4. 汇总结果
  console.log('\n📊 测试结果汇总:');
  console.log(`   API健康状态: ${results.apiHealth ? '✅ 通过' : '❌ 失败'}`);
  console.log(`   快速导出功能: ${results.quickExport ? '✅ 通过' : '❌ 失败'}`);
  console.log(`   保存到DuckDB功能: ${results.saveQuery ? '✅ 通过' : '❌ 失败'}`);
  
  const successCount = Object.values(results).filter(Boolean).length;
  const totalCount = Object.keys(results).length;
  
  console.log(`\n🎯 总体结果: ${successCount}/${totalCount} 项测试通过`);
  
  if (successCount === totalCount) {
    console.log('🎉 所有功能修复验证成功！');
  } else {
    console.log('⚠️  部分功能需要进一步检查');
  }
  
  return results;
}

// 执行测试
if (require.main === module) {
  runTests().catch(error => {
    console.error('测试执行失败:', error);
    process.exit(1);
  });
}

module.exports = { runTests, testQuickExportAPI, testSaveQueryToDuckDB };