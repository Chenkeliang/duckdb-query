/**
 * 字体优化验证脚本
 * 在浏览器控制台运行此脚本，检查字体和字重优化是否生效
 */

export const checkFontOptimization = () => {
    const results = {
        fontFamily: {},
        fontWeight: {},
        textRendering: {},
        cssVariables: {}
    };

    // 1. 检查字体栈
    const body = document.body;
    const computedStyle = window.getComputedStyle(body);
    const fontFamily = computedStyle.fontFamily;
    results.fontFamily = {
        computed: fontFamily,
        isSystemFont: fontFamily.includes('-apple-system') || fontFamily.includes('Segoe UI'),
        status: fontFamily.includes('-apple-system') || fontFamily.includes('Segoe UI')
            ? '✅ 系统字体优先已应用'
            : '❌ 仍在使用 Web 字体'
    };

    // 2. 检查 text-rendering
    const textRendering = computedStyle.textRendering;
    results.textRendering = {
        computed: textRendering,
        status: textRendering === 'optimizelegibility'
            ? '✅ text-rendering 优化已应用'
            : '❌ text-rendering 未应用'
    };

    // 3. 检查 CSS 变量
    const root = document.documentElement;
    const rootStyle = window.getComputedStyle(root);

    const cssVars = {
        '--dq-tab-font-weight-primary': rootStyle.getPropertyValue('--dq-tab-font-weight-primary').trim(),
        '--dq-tab-font-weight-primary-inactive': rootStyle.getPropertyValue('--dq-tab-font-weight-primary-inactive').trim(),
        '--dq-tab-font-weight-secondary': rootStyle.getPropertyValue('--dq-tab-font-weight-secondary').trim(),
        '--dq-tab-font-weight-secondary-inactive': rootStyle.getPropertyValue('--dq-tab-font-weight-secondary-inactive').trim(),
        '--dq-font-sans': rootStyle.getPropertyValue('--dq-font-sans').trim()
    };

    results.cssVariables = cssVars;
    results.cssVariables.status =
        cssVars['--dq-tab-font-weight-primary-inactive'] === '500' &&
            cssVars['--dq-tab-font-weight-primary'] === '700'
            ? '✅ 字重变量已正确设置'
            : '❌ 字重变量未正确设置';

    // 4. 检查 Tab 字重
    const tabs = document.querySelectorAll('.MuiTab-root');
    if (tabs.length > 0) {
        const firstTab = tabs[0];
        const selectedTab = document.querySelector('.MuiTab-root.Mui-selected');

        if (firstTab && selectedTab) {
            const inactiveWeight = window.getComputedStyle(firstTab).fontWeight;
            const activeWeight = window.getComputedStyle(selectedTab).fontWeight;

            results.fontWeight = {
                inactiveTab: inactiveWeight,
                activeTab: activeWeight,
                status: parseInt(inactiveWeight) === 500 && parseInt(activeWeight) === 700
                    ? '✅ Tab 字重动态变化已应用'
                    : `⚠️ Tab 字重: 未选中=${inactiveWeight}, 选中=${activeWeight}`
            };
        }
    }

    // 输出结果
    console.log('🎨 字体优化检查结果:', results);
    console.table(results);

    return results;
};

// 如果在浏览器控制台直接运行
if (typeof window !== 'undefined') {
    window.checkFontOptimization = checkFontOptimization;
}




