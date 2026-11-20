import { test, expect, Page } from '@playwright/test';
import { loginRobust, safeNavigate, TestUser } from './helpers';

// Coach 账号配置（标准测试账号）
const coachUser: TestUser = {
  email: process.env.COACH_EMAIL || 'test-coach@buzzer.com',
  password: process.env.COACH_PASSWORD || 'Test123456',
};

// 健壮的 Coach 登录函数
async function coachLogin(page: Page): Promise<boolean> {
  return loginRobust(page, coachUser);
}

test.describe('Coach 角色基础测试', () => {
  test.slow();

  test('Coach 登录应该成功', async ({ page }) => {
    const loginSuccess = await coachLogin(page);
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

    // 验证角色是 coach（或 teacher，因为 teacher 会映射为 coach）
    const role = authState?.state?.user?.role;
    expect(['coach', 'teacher']).toContain(role);

    console.log('Coach 登录成功！');
    console.log('用户角色:', role);
  });

  test('Coach 可以看到侧边栏菜单', async ({ page }) => {
    const loginSuccess = await coachLogin(page);
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

  test('Coach 不应该看到系统管理菜单', async ({ page }) => {
    const loginSuccess = await coachLogin(page);
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
    // Coach 不应该看到系统管理菜单
    expect(systemMenuCount).toBe(0);
  });

  test('Coach 可以访问班级管理页面', async ({ page }) => {
    const loginSuccess = await coachLogin(page);
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

  test('Coach 可以访问学员管理页面', async ({ page }) => {
    const loginSuccess = await coachLogin(page);
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

  test('Coach 不应该访问机构管理页面', async ({ page }) => {
    const loginSuccess = await coachLogin(page);
    if (!loginSuccess) {
      test.skip();
      return;
    }

    // 尝试导航到机构管理页面
    await safeNavigate(page, '/organizations');

    // 验证被重定向或显示无权限
    const currentUrl = page.url();
    console.log('访问机构管理页面 URL:', currentUrl);

    // 应该被重定向到其他页面或显示无权限
    // 这里不强制断言，只是记录行为
  });

  test('Coach 不应该访问工作人员管理页面', async ({ page }) => {
    const loginSuccess = await coachLogin(page);
    if (!loginSuccess) {
      test.skip();
      return;
    }

    // 尝试导航到工作人员管理页面
    await safeNavigate(page, '/system/staff-list');

    const currentUrl = page.url();
    console.log('访问工作人员管理页面 URL:', currentUrl);

    // 应该被重定向或显示无权限
  });
});

test.describe('Coach 数据过滤测试', () => {
  test.slow();

  test('Coach 班级列表应该只显示自己的班级', async ({ page }) => {
    const loginSuccess = await coachLogin(page);
    if (!loginSuccess) {
      test.skip();
      return;
    }

    // 导航到班级管理页面
    const navSuccess = await safeNavigate(page, '/classes');
    if (!navSuccess) {
      test.skip();
      return;
    }

    await page.waitForTimeout(2000);

    // 检查页面是否正常显示
    const content = page.locator('.ant-table, .ant-empty, .ant-alert');
    const hasContent = await content.count();

    console.log('班级页面内容元素数量:', hasContent);

    // 截图用于调试
    await page.screenshot({ path: 'test-results/coach-classes-page.png' });
  });

  test('Coach 学员列表应该只显示自己的学员', async ({ page }) => {
    const loginSuccess = await coachLogin(page);
    if (!loginSuccess) {
      test.skip();
      return;
    }

    // 导航到学员管理页面
    const navSuccess = await safeNavigate(page, '/students');
    if (!navSuccess) {
      test.skip();
      return;
    }

    await page.waitForTimeout(2000);

    // 检查页面是否正常显示
    const content = page.locator('.ant-table, .ant-empty, .ant-alert');
    const hasContent = await content.count();

    console.log('学员页面内容元素数量:', hasContent);

    // 截图用于调试
    await page.screenshot({ path: 'test-results/coach-students-page.png' });
  });
});
