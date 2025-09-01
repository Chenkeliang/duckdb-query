const fs = require('fs');
const path = require('path');

console.log('🔍 验证 Monaco Editor 配置...\n');

// 检查关键文件
const files = [
    'frontend/src/simple-monaco-config.js',
    'frontend/src/main.jsx',
    'frontend/src/components/DuckDBSQLEditor.jsx',
    'frontend/package.json'
];

let allFilesExist = true;

files.forEach(file => {
    const fullPath = path.join(__dirname, file);
    if (fs.existsSync(fullPath)) {
        console.log(`✅ ${file} 存在`);
    } else {
        console.log(`❌ ${file} 不存在`);
        allFilesExist = false;
    }
});

if (!allFilesExist) {
    console.log('\n❌ 缺少关键文件，无法继续验证');
    process.exit(1);
}

console.log('\n📋 详细配置检查...\n');

// 检查 simple-monaco-config.js
const configPath = path.join(__dirname, 'frontend/src/simple-monaco-config.js');
const configContent = fs.readFileSync(configPath, 'utf8');

console.log('🔧 simple-monaco-config.js 检查:');
console.log(`  - jQuery 兼容层: ${configContent.includes('window.$ = window.jQuery') ? '✅' : '❌'}`);
console.log(`  - trim 方法: ${configContent.includes('trim: function') ? '✅' : '❌'}`);
console.log(`  - extend 方法: ${configContent.includes('extend: function') ? '✅' : '❌'}`);
console.log(`  - each 方法: ${configContent.includes('each: function') ? '✅' : '❌'}`);
console.log(`  - Monaco 环境: ${configContent.includes('window.MonacoEnvironment') ? '✅' : '❌'}`);
console.log(`  - Worker 配置: ${configContent.includes('getWorkerUrl') ? '✅' : '❌'}`);

// 检查 main.jsx
const mainPath = path.join(__dirname, 'frontend/src/main.jsx');
const mainContent = fs.readFileSync(mainPath, 'utf8');

console.log('\n📝 main.jsx 检查:');
console.log(`  - Monaco 配置导入: ${mainContent.includes('./simple-monaco-config') ? '✅' : '❌'}`);
console.log(`  - 导入位置正确: ${mainContent.indexOf('./simple-monaco-config') < 10 ? '✅' : '❌'}`);

// 检查 DuckDBSQLEditor.jsx
const editorPath = path.join(__dirname, 'frontend/src/components/DuckDBSQLEditor.jsx');
const editorContent = fs.readFileSync(editorPath, 'utf8');

console.log('\n🎯 DuckDBSQLEditor.jsx 检查:');
console.log(`  - Monaco Editor 导入: ${editorContent.includes('@monaco-editor/react') ? '✅' : '❌'}`);
console.log(`  - 自动补全提供者: ${editorContent.includes('registerCompletionItemProvider') ? '✅' : '❌'}`);
console.log(`  - 表名排序: ${editorContent.includes('sortText') ? '✅' : '❌'}`);
console.log(`  - 语法高亮: ${editorContent.includes('setMonarchTokensProvider') ? '✅' : '❌'}`);

// 检查 package.json
const packagePath = path.join(__dirname, 'frontend/package.json');
const packageContent = JSON.parse(fs.readFileSync(packagePath, 'utf8'));

console.log('\n📦 package.json 检查:');
console.log(`  - @monaco-editor/react: ${packageContent.dependencies['@monaco-editor/react'] ? '✅' : '❌'}`);
console.log(`  - jquery: ${packageContent.dependencies['jquery'] ? '✅' : '❌'}`);

// 总结
console.log('\n📊 配置验证总结:');
const configChecks = [
    configContent.includes('window.$ = window.jQuery'),
    configContent.includes('trim: function'),
    configContent.includes('window.MonacoEnvironment'),
    mainContent.includes('./simple-monaco-config'),
    editorContent.includes('registerCompletionItemProvider'),
    packageContent.dependencies['@monaco-editor/react']
];

const passedChecks = configChecks.filter(check => check).length;
const totalChecks = configChecks.length;

console.log(`  - 通过检查: ${passedChecks}/${totalChecks}`);
console.log(`  - 状态: ${passedChecks === totalChecks ? '✅ 配置完整' : '❌ 配置不完整'}`);

if (passedChecks === totalChecks) {
    console.log('\n🎉 Monaco Editor 配置验证通过！');
    console.log('💡 下一步: 启动前端服务并测试功能');
    console.log('   命令: cd frontend && npm run dev');
} else {
    console.log('\n⚠️ 配置需要修复');
    console.log('💡 请检查上述失败的配置项');
}

console.log('\n🏁 验证完成');
