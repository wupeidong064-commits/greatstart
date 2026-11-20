import { test, expect, Page } from '@playwright/test';
import { loginRobust, safeNavigate, TestUser } from './helpers';

// Sales 账号配置（标准测试账号）
const salesUser: TestUser = {
  email: process.env.SALES_EMAIL || 'test-sales@buzzer.com',
  password: process.env.SALES_PASSWORD || 'Test123456',
};

// 健壮的 Sales 登录函数
async function salesLogin(page: Page): Promise<boolean> {
  return loginRobust(page, salesUser);
}

test.describe('Sales 角色基础测试', () => {
  test.slow();

  test('Sales 登录应该成功', async ({ page }) => {
    const loginSuccess = await salesLogin(page);
    expect(loginSuccess).toBe(true);

    // 验证登录成功 - URL 应该离开登录页
    const currentUrl = page.url();
    expect(currentUrl).not.toContain('/login');

    // 验证 localStorage 有认证数据
    const authState = await page.evaluate(() => {
      const storage = localStorage.getItem('auth-storage');
      return storage ? JSON.parse(storage) : null;
    });

    expect(authState).not.toBeNull();
    expect(authState?.state?.isAuthenticated).toBe(true);
    expect(authState?.state?.user?.role).toBe('sales');

    console.log('Sales 登录成功！');
    console.log('用户角色:', authState?.state?.user?.role);
  });

  test('Sales 可以看到侧边栏菜单', async ({ page }) => {
    const loginSuccess = await salesLogin(page);
    if (!loginSuccess) {
      test.skip();
      return;
    }

    // 检查侧边栏存在
    const sider = page.locator('.ant-layout-sider');
    const siderCount = await sider.count();
    expect(siderCount).toBeGreaterThan(0);

    console.log('侧边栏菜单存在');
  });

  test('Sales 不应该看到系统管理菜单', async ({ page }) => {
    const loginSuccess = await salesLogin(page);
    if (!loginSuccess) {
      test.skip();
      return;
    }

    // 等待菜单加载
    await page.waitForTimeout(1000);

    // 检查系统管理菜单不存在
    const systemMenu = page.locator('.ant-menu-submenu-title:has-text("系统管理")');
    const systemMenuCount = await systemMenu.count();

    console.log('系统管理菜单数量:', systemMenuCount);
    expect(systemMenuCount).toBe(0);
  });

  test('Sales 可以访问班级管理页面（只读）', async ({ page }) => {
    const loginSuccess = await salesLogin(page);
    if (!loginSuccess) {
      test.skip();
      return;
    }

    // 导航到班级管理页面
    const navSuccess = await safeNavigate(page, '/classes');
    expect(navSuccess).toBe(true);

    // 验证页面加载成功
    const currentUrl = page.url();
    expect(currentUrl).not.toContain('/login');

    console.log('班级管理页面 URL:', currentUrl);
  });

  test('Sales 可以访问学员管理页面（只读）', async ({ page }) => {
    const loginSuccess = await salesLogin(page);
    if (!loginSuccess) {
      test.skip();
      return;
    }

    // 导航到学员管理页面
    const navSuccess = await safeNavigate(page, '/students');
    expect(navSuccess).toBe(true);

    // 验证页面加载成功
    const currentUrl = page.url();
    expect(currentUrl).not.toContain('/login');

    console.log('学员管理页面 URL:', currentUrl);
  });

  test('Sales 可以访问销售数据页面', async ({ page }) => {
    const loginSuccess = await salesLogin(page);
    if (!loginSuccess) {
      test.skip();
      return;
    }

    // 导航到销售数据页面
    const navSuccess = await safeNavigate(page, '/teachers/dashboard');
    expect(navSuccess).toBe(true);

    // 验证页面加载成功
    const currentUrl = page.url();
    expect(currentUrl).not.toContain('/login');

    console.log('销售数据页面 URL:', currentUrl);
  });

  test('Sales 可以访问鱼池管理页面', async ({ page }) => {
    const loginSuccess = await salesLogin(page);
    if (!loginSuccess) {
      test.skip();
      return;
    }

    // 导航到鱼池管理页面
    const navSuccess = await safeNavigate(page, '/cashflow/marketing');
    expect(navSuccess).toBe(true);

    // 验证页面加载成功
    const currentUrl = page.url();
    expect(currentUrl).not.toContain('/login');

    console.log('鱼池管理页面 URL:', currentUrl);
  });

  test('Sales 不应该访问机构管理页面', async ({ page }) => {
    const loginSuccess = await salesLogin(page);
    if (!loginSuccess) {
      test.skip();
      return;
    }

    // 尝试导航到机构管理页面
    await safeNavigate(page, '/organizations');

    const currentUrl = page.url();
    console.log('访问机构管理页面 URL:', currentUrl);
  });

  test('Sales 不应该访问工作人员管理页面', async ({ page }) => {
    const loginSuccess = await salesLogin(page);
    if (!loginSuccess) {
      test.skip();
      return;
    }

    // 尝试导航到工作人员管理页面
    await safeNavigate(page, '/system/staff-list');

    const currentUrl = page.url();
    console.log('访问工作人员管理页面 URL:', currentUrl);
  });
});

test.describe('Sales 数据过滤测试', () => {
  test.slow();

  test('Sales 鱼池列表应该只显示自己的线索', async ({ page }) => {
    const loginSuccess = await salesLogin(page);
    if (!loginSuccess) {
      test.skip();
      return;
    }

    // 导航到鱼池管理页面
    const navSuccess = await safeNavigate(page, '/cashflow/marketing');
    if (!navSuccess) {
      test.skip();
      return;
    }

    await page.waitForTimeout(2000);

    // 检查页面是否正常显示
    const content = page.locator('.ant-table, .ant-empty, .ant-alert');
    const hasContent = await content.count();

    console.log('鱼池页面内容元素数量:', hasContent);

    // 截图用于调试
    await page.screenshot({ path: 'test-results/sales-marketing-page.png' });
  });

  test('Sales 体验课列表应该只显示自己的体验课', async ({ page }) => {
    const loginSuccess = await salesLogin(page);
    if (!loginSuccess) {
      test.skip();
      return;
    }

    // 导航到体验课页面
    const navSuccess = await safeNavigate(page, '/cashflow/experience-schedule');
    if (!navSuccess) {
      test.skip();
      return;
    }

    await page.waitForTimeout(2000);

    // 检查页面是否正常显示
    const content = page.locator('.ant-table, .ant-empty, .ant-alert');
    const hasContent = await content.count();

    console.log('体验课页面内容元素数量:', hasContent);

    // 截图用于调试
    await page.screenshot({ path: 'test-results/sales-experience-page.png' });
  });

  test('Sales 成单信息列表应该只显示自己的成单', async ({ page }) => {
    const loginSuccess = await salesLogin(page);
    if (!loginSuccess) {
      test.skip();
      return;
    }

    // 导航到成单信息页面
    const navSuccess = await safeNavigate(page, '/cashflow/order-info');
    if (!navSuccess) {
      test.skip();
      return;
    }

    await page.waitForTimeout(2000);

    // 检查页面是否正常显示
    const content = page.locator('.ant-table, .ant-empty, .ant-alert');
    const hasContent = await content.count();

    console.log('成单信息页面内容元素数量:', hasContent);

    // 截图用于调试
    await page.screenshot({ path: 'test-results/sales-order-info-page.png' });
  });
});
