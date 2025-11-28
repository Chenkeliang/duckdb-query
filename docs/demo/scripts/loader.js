// 组件加载器
const ComponentLoader = {
  // 加载单个组件
  async loadComponent(url, targetId) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to load ${url}: ${response.statusText}`);
      }
      const html = await response.text();
      const target = document.getElementById(targetId);
      if (target) {
        target.innerHTML = html;
      }
      return true;
    } catch (error) {
      console.error(`Error loading component from ${url}:`, error);
      return false;
    }
  },

  // 批量加载组件
  async loadComponents(components) {
    const promises = components.map(({ url, targetId }) =>
      this.loadComponent(url, targetId)
    );
    return Promise.all(promises);
  },

  // 初始化所有组件
  async init() {
    console.log('Loading components...');
    
    // 定义需要加载的组件
    const components = [
      { url: 'components/sidebar.html', targetId: 'sidebar' },
      { url: 'components/header.html', targetId: 'header' },
      { url: 'components/datasource-panel.html', targetId: 'datasource-panel' }
    ];

    // 加载基础组件
    await this.loadComponents(components);

    // 加载Tab内容（默认加载可视化查询）
    await this.loadComponent('components/tabs/visual-query.html', 'tab-content-container');

    // 重新初始化Lucide图标
    if (typeof lucide !== 'undefined') {
      lucide.createIcons();
    }

    console.log('All components loaded successfully');
  }
};

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', () => {
  ComponentLoader.init();
});
