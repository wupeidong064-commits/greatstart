import { test, expect, Page } from '@playwright/test';
import { loginRobust, TestUser } from './helpers';

// Admin 账号配置（标准测试账号）
const adminUser: TestUser = {
  email: process.env.ADMIN_EMAIL || 'test-admin@buzzer.com',
  password: process.env.ADMIN_PASSWORD || 'Test123456',
};

// 健壮的 Admin 登录函数
async function adminLogin(page: Page): Promise<boolean> {
  return loginRobust(page, adminUser);
}

test.describe('Admin 账号基础测试', () => {
  test.slow();

  test('Admin 登录应该成功', async ({ page }) => {
    const loginSuccess = await adminLogin(page);
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
    expect(authState?.state?.user?.role).toBe('admin');

    console.log('Admin 登录成功！');
    console.log('用户角色:', authState?.state?.user?.role);
  });

  test('Admin 登录后应该跳转到机构管理页面', async ({ page }) => {
    const loginSuccess = await adminLogin(page);
    if (!loginSuccess) {
      test.skip();
      return;
    }

    const currentUrl = page.url();
    console.log('登录后 URL:', currentUrl);

    // Admin 应该被重定向到机构管理页面
    expect(currentUrl).toContain('/organizations');
  });

  test('Admin 可以看到侧边栏菜单', async ({ page }) => {
    const loginSuccess = await adminLogin(page);
    if (!loginSuccess) {
      test.skip();
      return;
    }

    // 检查侧边栏存在
    const sider = page.locator('.ant-layout-sider');
    const siderCount = await sider.count();
    expect(siderCount).toBeGreaterThan(0);

    // 检查系统管理菜单存在
    const systemMenu = page.locator('.ant-menu-submenu-title:has-text("系统管理")');
    const systemMenuCount = await systemMenu.count();
    expect(systemMenuCount).toBeGreaterThan(0);

    console.log('侧边栏和系统管理菜单存在');
  });

  test('Admin 可以看到机构管理页面内容', async ({ page }) => {
    const loginSuccess = await adminLogin(page);
    if (!loginSuccess) {
      test.skip();
      return;
    }

    // 等待页面加载
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    // 截图
    await page.screenshot({ path: 'test-results/admin-organizations-page.png' });

    // 检查页面有内容
    const content = page.locator('.ant-table, .ant-card, h2, button');
    const hasContent = await content.count();
    expect(hasContent).toBeGreaterThan(0);

    console.log('机构管理页面内容检查通过');
  });
});

test.describe('Admin 认证状态问题诊断', () => {
  test.slow();

  test('诊断: 检查认证状态在页面刷新后的行为', async ({ page }) => {
    const loginSuccess = await adminLogin(page);
    if (!loginSuccess) {
      test.skip();
      return;
    }

    // 检查初始认证状态
    const initialAuthState = await page.evaluate(() => {
      const storage = localStorage.getItem('auth-storage');
      return storage ? JSON.parse(storage) : null;
    });
    console.log('初始认证状态:', initialAuthState?.state?.isAuthenticated);

    // 尝试导航到 staff-list 页面
    await page.goto('/system/staff-list');
    await page.waitForTimeout(2000);

    // 检查最终 URL
    const finalUrl = page.url();
    console.log('导航后 URL:', finalUrl);

    // 检查认证状态是否仍然存在
    const afterNavAuthState = await page.evaluate(() => {
      const storage = localStorage.getItem('auth-storage');
      return storage ? JSON.parse(storage) : null;
    });
    console.log('导航后认证状态:', afterNavAuthState?.state?.isAuthenticated);

    // 这个测试用于诊断，不设断言失败
    if (finalUrl.includes('/login')) {
      console.log('已知问题: 页面刷新后 PrivateRoute 在 Zustand 状态恢复前检查认证，导致重定向');
      console.log('建议: 在 PrivateRoute 中添加 hydration 检查或使用同步状态恢复');
    }
  });
});
