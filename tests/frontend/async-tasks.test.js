/**
 * 异步任务系统前端测试
 * 测试异步任务功能的前端界面和交互
 */

const { test, expect } = require('@playwright/test');

test.describe('异步任务系统', () => {
  test.beforeEach(async ({ page }) => {
    // 访问应用
    await page.goto('http://localhost:3000');
  });

  test('应该显示异步任务标签页', async ({ page }) => {
    // 等待页面加载
    await page.waitForTimeout(2000);
    
    // 检查异步任务标签页是否存在
    const asyncTab = page.locator('button:has-text("异步任务")');
    await expect(asyncTab).toBeVisible();
  });

  test('应该能够导航到异步任务页面', async ({ page }) => {
    // 点击异步任务标签页
    await page.click('button:has-text("异步任务")');
    
    // 等待页面切换
    await page.waitForTimeout(1000);
    
    // 检查页面标题
    const pageTitle = page.locator('h2:has-text("异步任务列表")');
    await expect(pageTitle).toBeVisible();
    
    // 检查页面介绍
    const pageIntro = page.locator('div:has-text("异步任务管理：")');
    await expect(pageIntro).toBeVisible();
  });

  test('应该显示任务列表', async ({ page }) => {
    // 导航到异步任务页面
    await page.click('button:has-text("异步任务")');
    await page.waitForTimeout(1000);
    
    // 检查任务列表容器
    const taskListContainer = page.locator('div:has-text("异步任务列表")').first();
    await expect(taskListContainer).toBeVisible();
    
    // 检查表格是否存在
    const table = page.locator('table');
    await expect(table).toBeVisible();
  });

  test('应该有SQL执行器中的异步任务按钮', async ({ page }) => {
    // 导航到SQL执行器页面
    await page.click('button:has-text("SQL执行器")');
    await page.waitForTimeout(1000);
    
    // 检查SQL编辑器是否存在
    const sqlEditor = page.locator('textarea[aria-label="SQL查询"]');
    await expect(sqlEditor).toBeVisible();
    
    // 检查"执行预览"按钮
    const previewButton = page.locator('button:has-text("执行预览")');
    await expect(previewButton).toBeVisible();
    
    // 检查"作为异步任务运行"按钮
    const asyncButton = page.locator('button:has-text("作为异步任务运行")');
    await expect(asyncButton).toBeVisible();
  });

  test('提交异步任务应该显示成功消息', async ({ page }) => {
    // 导航到SQL执行器页面
    await page.click('button:has-text("SQL执行器")');
    await page.waitForTimeout(1000);
    
    // 输入测试SQL
    await page.fill('textarea[aria-label="SQL查询"]', 'SELECT 1 as id, "test" as name');
    
    // 点击异步任务按钮
    await page.click('button:has-text("作为异步任务运行")');
    
    // 等待响应
    await page.waitForTimeout(2000);
    
    // 检查是否显示成功消息
    const successMessage = page.locator('div[role="alert"]:has-text("异步任务已提交")');
    await expect(successMessage).toBeVisible();
  });

  test('异步任务页面应该能刷新任务列表', async ({ page }) => {
    // 导航到异步任务页面
    await page.click('button:has-text("异步任务")');
    await page.waitForTimeout(1000);
    
    // 点击刷新按钮
    const refreshButton = page.locator('button:has-text("refresh")').first(); // 使用图标按钮
    await refreshButton.click();
    
    // 等待刷新
    await page.waitForTimeout(2000);
    
    // 检查页面是否仍然正常
    const taskListContainer = page.locator('div:has-text("异步任务列表")').first();
    await expect(taskListContainer).toBeVisible();
  });
});