const http = require('http');

async function checkService() {
    console.log('🔍 检查前端服务状态...');

    return new Promise((resolve) => {
        const req = http.get('http://localhost:3000', (res) => {
            console.log(`✅ 服务响应状态码: ${res.statusCode}`);
            console.log(`📋 响应头:`, res.headers);
            resolve(true);
        });

        req.on('error', (err) => {
            console.log(`❌ 服务连接失败: ${err.message}`);
            resolve(false);
        });

        req.setTimeout(5000, () => {
            console.log('⏰ 请求超时');
            req.destroy();
            resolve(false);
        });
    });
}

checkService().then((isRunning) => {
    if (isRunning) {
        console.log('🚀 前端服务正在运行，可以开始测试');
    } else {
        console.log('❌ 前端服务未运行，请先启动服务');
    }
});
