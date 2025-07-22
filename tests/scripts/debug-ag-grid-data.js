// AG Grid数据显示问题调试
// 问题：表格显示记录数但不显示实际数据行

console.log('🔍 AG Grid数据显示问题调试');
console.log('============================');

// 模拟后端返回的实际数据
const actualData = {
    "data": [
        {"id":"1","name":"测试项目1","value":"100","category":"A类"},
        {"id":"2","name":"测试项目2","value":"200","category":"B类"},
        {"id":"3","name":"测试项目3","value":"300","category":"A类"}
    ],
    "columns": ["id","name","value","category"],
    "index": [0,1,2],
    "sql": "SELECT * FROM \"test_unit\""
};

console.log('📊 实际数据结构分析:');
console.log('- 数据行数:', actualData.data.length);
console.log('- 列数:', actualData.columns.length);
console.log('- 数据类型:', typeof actualData.data[0]);
console.log('- 第一行数据:', actualData.data[0]);

console.log('\n🔧 AG Grid期望的格式:');
const rowData = actualData.data;
const columnDefs = actualData.columns.map(col => ({
    field: col,
    headerName: col,
    sortable: true,
    filter: true,
    resizable: true
}));

console.log('- rowData:', rowData);
console.log('- columnDefs:', columnDefs);

console.log('\n❓ 可能的问题:');
console.log('1. 列定义field与数据字段不匹配');
console.log('2. AG Grid容器高度为0或不可见');
console.log('3. CSS样式覆盖导致行不可见');
console.log('4. AG Grid版本兼容性问题');
console.log('5. 数据类型转换问题');

console.log('\n🔍 字段匹配检查:');
actualData.columns.forEach(col => {
    const hasField = actualData.data[0].hasOwnProperty(col);
    console.log(`- 字段 "${col}": ${hasField ? '✅ 存在' : '❌ 缺失'}`);
});

console.log('\n🎯 调试步骤:');
console.log('1. 检查浏览器开发者工具Elements标签');
console.log('2. 查找.ag-center-cols-container元素');
console.log('3. 检查是否有.ag-row元素');
console.log('4. 查看.ag-cell元素是否存在');
console.log('5. 检查表格容器的height样式');

console.log('\n🔧 可能的修复方案:');
console.log('A. 确保表格容器有明确的高度');
console.log('B. 检查AG Grid CSS是否正确加载');
console.log('C. 验证columnDefs的field属性正确');
console.log('D. 添加调试日志查看AG Grid接收的数据');

console.log('\n🧪 调试完成');
