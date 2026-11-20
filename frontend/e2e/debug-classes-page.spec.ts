import { test, expect } from '@playwright/test';

/**
 * 深度分析班级管理页面加载问题
 */

const ADMIN_USER = {
  email: 'e2e-admin@test.com',
  password: 'test123',
};

async function login(page, user: { email: string; password: string }) {
  await page.goto('http://localhost:5173');
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.reload();
  await page.waitForTimeout(3000);

  const emailSelector = '#login_email';
  const passwordSelector = '#login_password';

  try {
    await page.waitForSelector(emailSelector, { timeout: 10000 });
    const emailInput = page.locator(emailSelector);
    await emailInput.click();
    await emailInput.fill(user.email);

    const passwordInput = page.locator(passwordSelector);
    await passwordInput.click();
    await passwordInput.fill(user.password);

    const loginButton = page.locator('button[type="submit"]').first();
    await loginButton.click();

    await page.waitForTimeout(6000);
  } catch (error) {
    console.log('登录错误:', error.message);
  }
}

test.describe('班级管理页面深度分析', () => {
  test('检查班级页面路由和加载', async ({ page }) => {
    console.log('🔍 深度分析班级管理页面');

    await login(page, ADMIN_USER);

    // 监听所有控制台消息
    const consoleMessages: string[] = [];
    page.on('console', (msg) => {
      const text = `[${msg.type()}] ${msg.text()}`;
      consoleMessages.push(text);
      if (msg.type() === 'error') {
        console.log('控制台错误:', msg.text());
      }
    });

    // 监听所有网络请求
    const networkRequests: any[] = [];
    page.on('request', (request) => {
      networkRequests.push({
        method: request.method(),
        url: request.url(),
        resourceType: request.resourceType()
      });
    });

    page.on('response', (response) => {
      const req = response.request();
      if (response.status() >= 400) {
        console.log(`API错误: ${req.method()} ${req.url()} -> ${response.status()}`);
      }
    });

    // 访问班级管理页面
    console.log('访问班级管理页面...');
    await page.goto('http://localhost:5173/operation/classes');

    // 等待更长时间让页面完全加载
    await page.waitForTimeout(5000);

    console.log('当前URL:', page.url());

    // 检查页面状态
    const pageState = await page.evaluate(() => {
      const result: any = {
        url: window.location.href,
        readyState: document.readyState,
        title: document.title,
        bodyHTML: '',
        reactRoot: null,
        hasContent: false,
        errorBoundary: false,
        loading: false
      };

      // 检查body内容
      result.bodyHTML = document.body.innerHTML.substring(0, 500);
      result.hasContent = document.body.innerText.trim().length > 0;

      // 检查React根节点
      const reactRoot = document.getElementById('root');
      if (reactRoot) {
        result.reactRoot = {
          id: reactRoot.id,
          children: reactRoot.children.length,
          innerHTML: reactRoot.innerHTML.substring(0, 200)
        };
      }

      // 检查是否有加载指示器
      const loadingElements = document.querySelectorAll('.ant-spin, .loading, [class*="loading"]');
      result.loading = loadingElements.length > 0;

      // 检查错误边界
      const errorElements = document.querySelectorAll('[class*="error"], [class*="Error"]');
      result.errorBoundary = errorElements.length > 0;

      // 检查是否有路由错误
      const notFound = document.body.innerText.includes('404') ||
                       document.body.innerText.includes('Not Found');
      result.notFound = notFound;

      return result;
    });

    console.log('=== 页面状态 ===');
    console.log('URL:', pageState.url);
    console.log('ReadyState:', pageState.readyState);
    console.log('Title:', pageState.title);
    console.log('有内容:', pageState.hasContent);
    console.log('React根节点:', pageState.reactRoot);
    console.log('加载中:', pageState.loading);
    console.log('错误边界:', pageState.errorBoundary);
    console.log('404错误:', pageState.notFound);
    console.log('');
    console.log('Body HTML (前500字符):');
    console.log(pageState.bodyHTML);

    // 截图
    await page.screenshot({ path: 'test-results/classes-page-deep-analysis.png' });

    // 总结控制台消息
    console.log('');
    console.log('=== 控制台消息摘要 ===');
    const errors = consoleMessages.filter(m => m.includes('[error]'));
    const warnings = consoleMessages.filter(m => m.includes('[warning]'));
    console.log(`错误数: ${errors.length}`);
    console.log(`警告数: ${warnings.length}`);

    if (errors.length > 0) {
      console.log('错误详情:');
      errors.slice(0, 5).forEach(e => console.log(`  ${e}`));
    }

    // 总结网络请求
    console.log('');
    console.log('=== 网络请求摘要 ===');
    const apiRequests = networkRequests.filter(r =>
      r.url.includes('/api/') || r.resourceType === 'fetch' || r.resourceType === 'xhr'
    );
    console.log(`API请求数: ${apiRequests.length}`);
    apiRequests.slice(0, 10).forEach(r => {
      console.log(`  ${r.method} ${r.url}`);
    });

    // 尝试访问其他页面对比
    console.log('');
    console.log('=== 对比测试 ===');

    // 访问鱼池管理（已知有数据）
    await page.goto('http://localhost:5173/cashflow/marketing');
    await page.waitForTimeout(3000);

    const marketingState = await page.evaluate(() => ({
      hasContent: document.body.innerText.trim().length > 0,
      hasTable: document.querySelectorAll('.ant-table, table').length > 0
    }));

    console.log('鱼池管理页面:');
    console.log('  有内容:', marketingState.hasContent);
    console.log('  有表格:', marketingState.hasTable);

    // 再次访问班级管理
    await page.goto('http://localhost:5173/operation/classes');
    await page.waitForTimeout(3000);

    const classesState2 = await page.evaluate(() => ({
      hasContent: document.body.innerText.trim().length > 0,
      bodyText: document.body.innerText.substring(0, 200)
    }));

    console.log('班级管理页面（第二次访问）:');
    console.log('  有内容:', classesState2.hasContent);
    console.log('  页面文本:', classesState2.bodyText);
  });

  test('检查前端构建和路由配置', async ({ page }) => {
    console.log('🔍 检查前端路由配置');

    await login(page, ADMIN_USER);

    // 尝试直接访问不同的路由路径
    const routes = [
      '/operation/classes',
      '/operation/students',
      '/operation/weekly-schedule',
      '/operation/daily-attendance',
      '/cashflow/marketing',
      '/cashflow/order-info'
    ];

    const results: any = {};

    for (const route of routes) {
      console.log(`测试路由: ${route}`);

      await page.goto(`http://localhost:5173${route}`);
      await page.waitForTimeout(3000);

      const routeInfo = await page.evaluate(() => {
        return {
          url: window.location.href,
          hasContent: document.body.innerText.trim().length > 100,
          hasTable: document.querySelectorAll('.ant-table, table').length > 0,
          hasCard: document.querySelectorAll('.ant-card').length > 0,
          bodyTextPreview: document.body.innerText.substring(0, 100)
        };
      });

      results[route] = routeInfo;
      console.log(`  有内容: ${routeInfo.hasContent}`);
      console.log(`  有表格: ${routeInfo.hasTable}`);
      console.log(`  预览: ${routeInfo.bodyTextPreview}`);
      console.log('');
    }

    console.log('=== 路由对比结果 ===');
    Object.entries(results).forEach(([route, info]: [string, any]) => {
      const status = info.hasContent ? '✅' : '❌';
      console.log(`${status} ${route}`);
    });
  });
});
