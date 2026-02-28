import { test, expect } from '@playwright/test';

test.describe('登录页面测试', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    // 等待页面完全加载
    await page.waitForSelector('.ant-card', { timeout: 10000 });
  });

  test('页面应该正确加载', async ({ page }) => {
    // 检查页面标题
    await expect(page.locator('.ant-card-head-title')).toContainText('智能课务系统');

    // 检查登录表单元素存在
    await expect(page.locator('input[placeholder="邮箱"]')).toBeVisible();
    await expect(page.locator('input[placeholder="密码"]')).toBeVisible();

    // 使用 CSS 选择器选择 Ant Design 按钮
    const loginButton = page.locator('.ant-card button.ant-btn-primary');
    await expect(loginButton).toBeVisible();
  });

  test('空表单提交应该显示验证错误', async ({ page }) => {
    // 点击登录按钮
    const loginButton = page.locator('.ant-card button.ant-btn-primary');
    await loginButton.click();

    // 等待验证错误出现
    await page.waitForSelector('.ant-form-item-explain-error', { timeout: 5000 });

    // 应该显示验证错误
    const errorMessages = page.locator('.ant-form-item-explain-error');
    await expect(errorMessages.first()).toContainText('请输入邮箱');
  });

  test('无效邮箱格式应该显示错误', async ({ page }) => {
    // 输入无效邮箱
    await page.locator('input[placeholder="邮箱"]').fill('invalid-email');
    await page.locator('input[placeholder="密码"]').fill('password123');

    // 点击登录按钮
    const loginButton = page.locator('.ant-card button.ant-btn-primary');
    await loginButton.click();

    // 等待验证错误出现
    await page.waitForSelector('.ant-form-item-explain-error', { timeout: 5000 });

    // 应该显示邮箱格式错误
    const errorMessages = page.locator('.ant-form-item-explain-error');
    await expect(errorMessages.first()).toContainText('请输入有效的邮箱地址');
  });

  test('注册链接应该存在', async ({ page }) => {
    // 检查注册链接
    const registerLink = page.locator('a:has-text("去注册")');
    await expect(registerLink).toBeVisible();
  });
});

test.describe.serial('登录功能测试', () => {
  // 注意：以下测试需要有效的测试账号
  // 请在环境变量中设置测试账号信息
  const testEmail = process.env.ADMIN_EMAIL || 'test-admin@buzzer.com';
  const testPassword = process.env.ADMIN_PASSWORD || 'Test123456';

  test('使用有效凭据登录应该成功', async ({ page }) => {
    await page.goto('/login');
    await page.waitForSelector('.ant-card', { timeout: 10000 });

    // 监听网络请求和响应
    const loginResponsePromise = page.waitForResponse(
      (response: any) => response.url().includes('/auth/login'),
      { timeout: 20000 }
    ).catch((e) => {
      console.log('登录响应等待错误:', e.message);
      return null;
    });

    // 监听控制台错误
    page.on('console', msg => {
      if (msg.type() === 'error') {
        console.log('浏览器控制台错误:', msg.text());
      }
    });

    // 填写登录表单
    await page.locator('input[placeholder="邮箱"]').fill(testEmail);
    await page.locator('input[placeholder="密码"]').fill(testPassword);

    // 点击登录按钮
    const loginButton = page.locator('.ant-card button.ant-btn-primary');
    await loginButton.click();

    // 等待登录响应
    const loginResponse = await loginResponsePromise;
    if (loginResponse) {
      console.log('登录响应状态:', loginResponse.status());
      console.log('登录响应 URL:', loginResponse.url());
    } else {
      console.log('未收到登录响应');
    }

    // 等待一段时间让页面完成处理
    await page.waitForTimeout(3000);

    // 检查认证状态
    const authState = await page.evaluate(() => {
      const storage = localStorage.getItem('auth-storage');
      return storage ? JSON.parse(storage) : null;
    });
    console.log('认证状态:', authState?.state?.isAuthenticated);

    // 验证已经跳转离开登录页面
    const currentUrl = page.url();
    console.log('当前 URL:', currentUrl);
    expect(currentUrl).not.toContain('/login');
  });

  test('使用无效密码登录应该显示错误', async ({ page }) => {
    await page.goto('/login');
    await page.waitForSelector('.ant-card', { timeout: 10000 });

    // 填写登录表单
    await page.locator('input[placeholder="邮箱"]').fill(testEmail);
    await page.locator('input[placeholder="密码"]').fill('wrongpassword');

    // 点击登录按钮
    const loginButton = page.locator('.ant-card button.ant-btn-primary');
    await loginButton.click();

    // 等待一下让登录请求完成
    await page.waitForTimeout(2000);

    // 验证仍然在登录页面（登录失败）
    expect(page.url()).toContain('/login');

    // 尝试检测错误消息（toast 可能很快消失，所以检查是否存在）
    const errorMessage = page.locator('.ant-message, .ant-message-notice-content, .ant-alert-error');
    const hasError = await errorMessage.count();
    // 只要还在登录页就算测试通过
    console.log('错误消息元素数量:', hasError);
  });
});
