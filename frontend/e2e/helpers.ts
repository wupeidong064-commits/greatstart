import { Page } from '@playwright/test';

// 导入新的辅助函数模块
export { DataHelpers } from './utils/data-helpers';
export { AssertionHelpers } from './utils/assertion-helpers';
export { NavigationHelpers } from './utils/navigation-helpers';
export { TestDataFactory } from './setup/test-data-factory';
export { CONSTANTS, TEST_USERS } from './setup/test-constants';
export type { TestUserType } from './setup/test-constants';

export interface TestUser {
  email: string;
  password: string;
}

/**
 * 默认测试用户 - 使用标准测试账号
 */
export const defaultTestUser: TestUser = {
  email: process.env.TEST_EMAIL || 'test-admin@buzzer.com',
  password: process.env.TEST_PASSWORD || 'Test123456',
};

/**
 * 检查当前是否在登录页面
 */
async function isOnLoginPage(page: Page): Promise<boolean> {
  const currentUrl = page.url();
  return currentUrl.includes('/login');
}

/**
 * 检查认证状态是否有效
 */
async function isAuthenticated(page: Page): Promise<boolean> {
  return await page.evaluate(() => {
    const authStorage = localStorage.getItem('auth-storage');
    if (authStorage) {
      try {
        const parsed = JSON.parse(authStorage);
        return parsed?.state?.isAuthenticated === true && !!parsed?.state?.token;
      } catch {
        return false;
      }
    }
    return false;
  });
}

/**
 * 健壮的登录辅助函数 - 包含重试机制和完整的状态验证
 * 优化版本：增加超时时间、移除不必要的刷新、优化等待逻辑
 */
export async function loginRobust(page: Page, user: TestUser = defaultTestUser, maxRetries = 5): Promise<boolean> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    console.log(`[登录] 尝试 ${attempt}/${maxRetries}: ${user.email}`);

    try {
      // 先访问登录页面
      await page.goto('/login', { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForSelector('.ant-card', { timeout: 20000 });

      // 清理认证状态（在页面加载后执行）
      try {
        await page.evaluate(() => {
          localStorage.clear();
          sessionStorage.clear();
        });
      } catch {
        // 忽略清理错误
      }

      // 等待表单可交互
      await page.waitForTimeout(500);

      // 填写登录表单
      const emailInput = page.locator('input[placeholder="邮箱"]');
      const passwordInput = page.locator('input[placeholder="密码"]');

      await emailInput.waitFor({ state: 'visible', timeout: 10000 });
      await emailInput.fill(user.email);
      await passwordInput.fill(user.password);

      // 点击登录按钮
      const loginButton = page.locator('.ant-card button.ant-btn-primary');
      await loginButton.waitFor({ state: 'visible', timeout: 10000 });

      // 设置登录请求监听
      const loginPromise = page.waitForResponse(
        (response) => response.url().includes('/api/auth/login'),
        { timeout: 30000 }
      );

      await loginButton.click();

      // 等待登录请求完成
      const loginResponse = await loginPromise.catch(() => null);

      if (loginResponse && loginResponse.status() === 200) {
        console.log('[登录] 登录 API 请求成功');
      } else {
        const status = loginResponse?.status() || '无响应';
        console.log(`[登录] 登录 API 请求失败: ${status}`);
        continue;
      }

      // 等待认证状态更新到 localStorage
      const authSuccess = await page.waitForFunction(
        () => {
          const authStorage = localStorage.getItem('auth-storage');
          if (authStorage) {
            try {
              const parsed = JSON.parse(authStorage);
              return parsed?.state?.isAuthenticated === true;
            } catch {
              return false;
            }
          }
          return false;
        },
        { timeout: 20000 }
      ).catch(() => false);

      if (!authSuccess) {
        console.log('[登录] 认证状态更新超时');
        continue;
      }

      console.log('[登录] 认证状态已更新');

      // 等待页面跳转
      await page.waitForTimeout(2000);

      // 等待 URL 变化
      const urlChanged = await page.waitForURL(
        (url) => !url.pathname.includes('/login'),
        { timeout: 20000 }
      ).catch(() => false);

      if (!urlChanged) {
        console.log('[登录] URL 变化等待超时，但继续验证');
      }

      // 最终验证
      await page.waitForLoadState('networkidle').catch(() => {});
      await page.waitForTimeout(1000);

      const onLoginPage = await isOnLoginPage(page);
      const hasAuth = await isAuthenticated(page);

      if (!onLoginPage && hasAuth) {
        console.log('[登录] 登录成功！');

        // 再次等待确保状态稳定
        await page.waitForTimeout(500);
        return true;
      }

      console.log(`[登录] 登录验证失败 - 在登录页: ${onLoginPage}, 有认证: ${hasAuth}`);

    } catch (error) {
      console.error(`[登录] 尝试 ${attempt} 失败:`, error);
    }

    // 等待一段时间再重试（指数退避）
    if (attempt < maxRetries) {
      const waitTime = attempt * 1000; // 1s, 2s, 3s, 4s
      console.log(`[登录] 等待 ${waitTime}ms 后重试...`);
      await page.waitForTimeout(waitTime);
    }
  }

  console.error(`[登录] 所有 ${maxRetries} 次尝试都失败`);
  return false;
}

/**
 * 登录辅助函数（简化版，兼容旧代码）
 */
export async function login(page: Page, user: TestUser = defaultTestUser): Promise<boolean> {
  return loginRobust(page, user);
}

/**
 * 登出辅助函数
 */
export async function logout(page: Page): Promise<void> {
  try {
    // 查找登出按钮或用户菜单
    const userMenu = page.locator('.ant-dropdown-trigger, [class*="user-menu"]');
    const menuCount = await userMenu.count();

    if (menuCount > 0) {
      await userMenu.first().click();
      await page.locator('text=退出登录, text=登出, text=Logout').first().click();
    } else {
      // 直接清除存储
      await page.evaluate(() => {
        localStorage.clear();
        sessionStorage.clear();
      });
      await page.goto('/login');
    }
  } catch (error) {
    console.error('登出失败:', error);
  }
}

/**
 * 等待表格加载
 */
export async function waitForTable(page: Page, timeout = 5000): Promise<boolean> {
  try {
    await page.locator('.ant-table').waitFor({ state: 'visible', timeout });
    await page.waitForTimeout(500); // 额外等待数据加载
    return true;
  } catch {
    return false;
  }
}

/**
 * 检查是否有权限访问
 */
export async function hasAccess(page: Page): Promise<boolean> {
  const alert = page.locator('.ant-alert-warning, .ant-alert-error');
  const alertCount = await alert.count();
  return alertCount === 0;
}

/**
 * 安全导航到页面 - 导航后检查是否被重定向到登录页
 */
export async function safeNavigate(page: Page, path: string, timeout = 10000): Promise<boolean> {
  console.log(`[导航] 正在导航到 ${path}`);

  await page.goto(path, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  const currentUrl = page.url();
  console.log(`[导航] 当前 URL: ${currentUrl}`);

  // 检查是否被重定向到登录页
  if (currentUrl.includes('/login')) {
    console.log('[导航] 被重定向到登录页，认证状态可能丢失');
    return false;
  }

  // 检查页面是否是白屏
  const bodyContent = await page.locator('body').innerHTML();
  if (!bodyContent || bodyContent.trim().length < 100) {
    console.log('[导航] 页面内容为空或白屏');
    await page.waitForTimeout(2000); // 等待更多时间
  }

  return true;
}

/**
 * 等待页面内容加载 - 等待表格、空状态或警告出现
 */
export async function waitForPageContent(page: Page, timeout = 10000): Promise<'table' | 'empty' | 'alert' | 'none'> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    const table = page.locator('.ant-table');
    const empty = page.locator('.ant-empty');
    const alert = page.locator('.ant-alert-warning, .ant-alert-error');
    const loginForm = page.locator('.ant-card:has(input[placeholder="邮箱"])');

    const tableCount = await table.count();
    const emptyCount = await empty.count();
    const alertCount = await alert.count();
    const loginCount = await loginForm.count();

    if (loginCount > 0) {
      console.log('[等待内容] 检测到登录页面');
      return 'none';
    }

    if (tableCount > 0) {
      console.log('[等待内容] 检测到表格');
      return 'table';
    }

    if (emptyCount > 0) {
      console.log('[等待内容] 检测到空状态');
      return 'empty';
    }

    if (alertCount > 0) {
      console.log('[等待内容] 检测到警告');
      return 'alert';
    }

    await page.waitForTimeout(500);
  }

  console.log('[等待内容] 超时，未检测到内容');
  return 'none';
}
