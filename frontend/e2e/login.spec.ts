import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const artifacts = path.resolve('e2e/artifacts/login-production');
const readme = fs.readFileSync(path.resolve('../docs/acceptance/README.md'), 'utf8');
const password = readme.match(/初始密码统一：`([^`]+)`/)?.[1];

async function realLogin(page: Page, email: string) {
  expect(password).toBeTruthy();
  await page.getByRole('textbox', { name: '邮箱或手机号', exact: true }).fill(email);
  await page.locator('#secret').fill(password!);
  await page.getByRole('button', { name: '登录', exact: true }).click();
}

test('默认入口与旧预览地址均进入正式新版登录页', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('heading', { name: '把时间，留给好课。' })).toBeVisible();
  await expect(page.locator('.bz-login')).toBeVisible();
  await page.goto('/design-preview/login-directions.html?v=imprint');
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.locator('#login-form')).toBeVisible();
});

test('真实管理员登录、鉴权持久化与样式清理', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/login');
  await realLogin(page, 'accept-admin@accept.buzzer.test');
  await expect(page).toHaveURL(/\/ai$/);
  await expect(page.getByRole('heading', { name: '今日待处理', exact: true })).toBeVisible();
  await expect(page.locator('body')).not.toHaveClass(/bz-login-active/);
  expect(await page.evaluate(() => getComputedStyle(document.querySelector('h3')!).color)).not.toBe('rgb(37, 40, 51)');
  await page.reload();
  await expect(page).toHaveURL(/\/ai$/);
  await expect(page.getByRole('heading', { name: '今日课表', exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test('真实家长登录与根地址按角色进入我的课表', async ({ page }) => {
  await page.goto('/login');
  await realLogin(page, 'accept-parent@accept.buzzer.test');
  await expect(page).toHaveURL(/\/student\/schedules$/);
  await page.goto('/');
  await expect(page).toHaveURL(/\/student\/schedules$/);
  await expect(page.locator('body')).not.toHaveClass(/bz-login-active/);
});

test('真实错误密码保留在登录页并显示服务端错误', async ({ page }) => {
  await page.goto('/login');
  await page.getByRole('textbox', { name: '邮箱或手机号', exact: true }).fill('accept-admin@accept.buzzer.test');
  await page.locator('#secret').fill('IntentionallyWrongForLoginTest');
  const response = page.waitForResponse((value) => value.url().endsWith('/api/auth/login') && value.request().method() === 'POST');
  await page.getByRole('button', { name: '登录', exact: true }).click();
  expect((await response).status()).toBeGreaterThanOrEqual(400);
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.locator('.form-status')).not.toBeEmpty();
  await expect(page.getByRole('button', { name: '登录', exact: true })).toBeEnabled();
});

test('客户端校验与手机号密码登录调用现有接口', async ({ page }) => {
  const requests: unknown[] = [];
  await page.route('**/api/auth/login-phone', async (route) => {
    requests.push(route.request().postDataJSON());
    await route.fulfill({ status: 401, json: { success: false, message: '测试手机号密码错误' } });
  });
  await page.goto('/login');
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('请输入邮箱或手机号');
  await page.getByRole('textbox', { name: '邮箱或手机号', exact: true }).fill('not-a-phone');
  await page.locator('#secret').fill('PhonePreviewPassword');
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('请输入有效的手机号');
  expect(requests).toHaveLength(0);
  await page.getByRole('textbox', { name: '邮箱或手机号', exact: true }).fill('13800000000');
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('测试手机号密码错误');
  expect(requests).toEqual([{ phone: '13800000000', password: 'PhonePreviewPassword' }]);
});

test('验证码发送、倒计时与登录参数正确（短信接口使用夹具）', async ({ page }) => {
  const sent: unknown[] = [], verified: unknown[] = [];
  await page.route('**/api/auth/send-otp', async (route) => {
    sent.push(route.request().postDataJSON());
    await route.fulfill({ json: { success: true } });
  });
  await page.route('**/api/auth/verify-otp', async (route) => {
    verified.push(route.request().postDataJSON());
    await route.fulfill({ status: 401, json: { success: false, message: '测试验证码错误' } });
  });
  await page.goto('/login');
  await page.locator('#secret').fill('DoNotReusePasswordAsOtp');
  await page.getByRole('button', { name: '验证码登录', exact: true }).click();
  await expect(page.locator('#secret')).toHaveValue('');
  await page.getByRole('textbox', { name: '手机号', exact: true }).fill('13800000000');
  await page.getByRole('button', { name: '获取验证码', exact: true }).click();
  await expect(page.getByRole('button', { name: /秒后重发/ })).toBeDisabled();
  expect(sent).toEqual([{ phone: '13800000000' }]);
  await page.getByRole('textbox', { name: '短信验证码', exact: true }).fill('123456');
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('测试验证码错误');
  expect(verified).toEqual([{ phone: '13800000000', token: '123456' }]);
});

test('找回密码验证与接口契约（不修改真实用户密码）', async ({ page }) => {
  const reset: unknown[] = [];
  await page.route('**/api/auth/send-otp', (route) => route.fulfill({ json: { success: true } }));
  await page.route('**/api/auth/reset-password', async (route) => {
    reset.push(route.request().postDataJSON());
    await route.fulfill({ json: { success: true } });
  });
  await page.goto('/login');
  await page.getByRole('button', { name: '忘记密码？' }).click();
  const modal = page.getByRole('dialog');
  await expect(modal).toBeVisible();
  await modal.getByRole('textbox', { name: '重置手机号' }).fill('13800000000');
  await modal.getByRole('button', { name: '获取验证码', exact: true }).click();
  await modal.getByRole('textbox', { name: '重置验证码' }).fill('123456');
  await modal.getByLabel('新密码', { exact: true }).fill('NewPreviewPassword');
  await modal.getByLabel('确认密码', { exact: true }).fill('MismatchPassword');
  await modal.getByRole('button', { name: '重置密码', exact: true }).click();
  await expect(modal.getByRole('status')).toHaveText('两次输入的密码不一致');
  expect(reset).toHaveLength(0);
  await modal.getByLabel('确认密码', { exact: true }).fill('NewPreviewPassword');
  await modal.getByRole('button', { name: '重置密码', exact: true }).click();
  await expect(modal).toBeHidden();
  await expect(page.locator('.form-status')).toHaveText('密码重置成功，请使用新密码登录');
  expect(reset).toEqual([{ phone: '13800000000', token: '123456', newPassword: 'NewPreviewPassword' }]);
});

test('正式页面一屏布局、卡片交互、背景定格和注册入口', async ({ page }) => {
  fs.mkdirSync(artifacts, { recursive: true });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/login');
  await expect(page.locator('[data-imprint-state="settled"]')).toBeVisible({ timeout: 15000 });
  await expect(page.locator('.__remotion-player')).toHaveCount(0);
  await expect(page.locator('blockquote')).not.toContainText('\\n');
  await page.getByRole('button', { name: '角色权限', exact: true }).click();
  await expect(page.locator('#faq-copy')).toContainText('家长查看关联学员');
  await page.getByRole('button', { name: '下一条评价' }).click();
  await expect(page.locator('#review-copy')).toContainText('每天先看待办');
  await page.getByRole('button', { name: '学员跟进', exact: true }).click();
  await expect(page.locator('#feature-copy')).toContainText('续费');
  for (const [width, height] of [[1440, 900], [1280, 720], [1366, 600], [768, 600], [390, 844], [375, 667], [320, 568], [844, 390]]) {
    await page.setViewportSize({ width, height });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    expect(await page.evaluate(() => document.documentElement.scrollHeight - innerHeight)).toBeLessThanOrEqual(1);
    const boxes = await page.locator('.login-panel,.info-card,.page-footer').evaluateAll((elements) => elements.filter((element) => getComputedStyle(element).display !== 'none').map((element) => {
      const bounds = element.getBoundingClientRect();
      return { bottom: bounds.bottom, right: bounds.right, client: element.clientHeight, scroll: element.scrollHeight };
    }));
    for (const box of boxes) { expect(box.bottom).toBeLessThanOrEqual(height + 2); expect(box.right).toBeLessThanOrEqual(width + 2); expect(box.scroll).toBeLessThanOrEqual(box.client + 1); }
    await page.screenshot({ path: path.join(artifacts, `${width}x${height}.png`), animations: 'disabled' });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: '使用反馈', exact: true }).click();
  await expect(page.locator('#card-reviews')).toBeVisible();
  await page.getByRole('button', { name: '使用帮助', exact: true }).click();
  await expect(page.locator('#card-faq')).toBeVisible();
  await expect(page.locator('[data-faq="0"]')).toBeFocused();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.locator('#slogan')).toHaveCSS('animation-name', 'none');
  await page.getByRole('link', { name: '注册', exact: true }).click();
  await expect(page).toHaveURL(/\/register$/);
  await expect(page.locator('body')).not.toHaveClass(/bz-login-active/);
  expect(errors).toEqual([]);
});
