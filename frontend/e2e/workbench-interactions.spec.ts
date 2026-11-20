import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const artifacts = path.resolve('e2e/artifacts/workbench-interactions');
const mockUser = { id: 'focus-user-1', organizationId: 'focus-org', campusId: 'focus-campus', role: 'manager', name: '交互验收', email: 'focus@example.test' };

async function auth(page: Page, token: string, user: object) {
  await page.addInitScript(({ token, user }) => {
    if (!sessionStorage.getItem('focus-test-auth')) {
      localStorage.setItem('auth-storage', JSON.stringify({ state: { token, user, isAuthenticated: true }, version: 0 }));
      sessionStorage.setItem('focus-test-auth', 'yes');
    }
  }, { token, user });
}

async function mocked(page: Page, options: { failRenewal?: boolean; manyRenewals?: boolean } = {}) {
  let remaining = 8;
  await auth(page, 'ui-test-token', mockUser);
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    let data: unknown = [];
    if (url.pathname.includes('/organizations/')) data = { name: '交互验收校区' };
    if (url.pathname.endsWith('/consumption/statistics')) data = { baseCount: 27, totalAttendance: 29 };
    if (url.pathname.endsWith('/low-attendance-classes')) data = [{ class: { id: 'c1', name: '周五班' }, attendanceRate: 43 }];
    if (url.pathname.endsWith('/low-attendance-students')) data = [{ id: 'low1', classId: 'c1', studentName: '低出勤学员', attendanceRate: 40, scheduleCount: 10, presentCount: 4 }];
    if (url.pathname.endsWith('/students')) {
      if (options.failRenewal) return route.fulfill({ status: 503, json: { success: false, message: '测试数据源不可用' } });
      data = [{ id: 's1', name: '续费学员', remainingLessons: remaining, purchasedLessons: 24 }];
    }
    if (url.pathname.endsWith('/unconverted')) data = [{ id: 'e1', studentName: '体验学员', status: 'noshow' }];
    await route.fulfill({ json: { success: true, data, pagination: { total: url.pathname.endsWith('/students') && options.manyRenewals ? 105 : 1 } } });
  });
  await page.goto('/ai');
  await expect(page.getByRole('button', { name: /待续费学员/ })).toBeVisible();
  return { changeSignal: () => { remaining = 5; } };
}

test('真实验收账号：侧栏勾选、已完成列表、刷新持久化、撤销，业务接口零写入', async ({ page }) => {
  fs.mkdirSync(artifacts, { recursive: true });
  const readme = fs.readFileSync(path.resolve('../docs/acceptance/README.md'), 'utf8');
  const password = readme.match(/初始密码统一：`([^`]+)`/)?.[1];
  expect(password).toBeTruthy();
  const login = await page.request.post('/api/auth/login', { data: { email: 'accept-admin@accept.buzzer.test', password } });
  expect(login.ok()).toBeTruthy();
  const session = await login.json();
  await auth(page, session.data.token, session.data.user);
  const writes: string[] = [];
  const errors: string[] = [];
  page.on('request', (request) => { if (request.url().includes('/api/') && !['GET', 'HEAD', 'OPTIONS'].includes(request.method())) writes.push(request.method() + ' ' + new URL(request.url()).pathname); });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/ai');
  const progress = page.getByRole('progressbar', { name: '今日跟进进度' });
  await expect(progress).toHaveAttribute('aria-valuemax', '19');
  await page.getByRole('button', { name: /待续费学员/ }).click();
  const first = page.getByRole('checkbox').first();
  const label = await first.getAttribute('aria-label');
  await first.check();
  await expect(progress).toHaveAttribute('aria-valuenow', '1');
  await expect(page.getByRole('status')).toContainText('已记录今日跟进');
  await expect(page.locator('.focus-completion-motion')).toBeVisible();
  await page.getByRole('button', { name: '已跟进 1', exact: true }).click();
  await expect(page.getByRole('checkbox', { name: label!, exact: true })).toBeChecked();
  await page.screenshot({ path: path.join(artifacts, 'desktop-dark.png'), fullPage: true });
  await page.reload();
  await expect(progress).toHaveAttribute('aria-valuenow', '1');
  await page.getByRole('button', { name: /待续费学员/ }).click();
  await page.getByRole('button', { name: '已跟进 1', exact: true }).click();
  await page.getByRole('checkbox', { name: label!, exact: true }).uncheck();
  await expect(progress).toHaveAttribute('aria-valuenow', '0');
  await expect(page.getByRole('status')).toBeEmpty();
  await page.getByRole('button', { name: /切换到日间模式/ }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.evaluate(() => Promise.all(document.getAnimations().filter((animation) => animation.effect?.getTiming().iterations !== Infinity).map((animation) => animation.finished.catch(() => undefined))));
  await page.screenshot({ path: path.join(artifacts, 'desktop-light.png'), fullPage: true });
  for (const width of [1024, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(page.getByRole('heading', { name: '今日课表', exact: true })).toBeVisible();
    // Resize and the root View Transition settle asynchronously; allow subpixel rounding.
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: path.join(artifacts, `light-${width}.png`), fullPage: true });
  }
  expect(writes).toEqual([]);
  expect(errors).toEqual([]);
});

test('勾选有完成反馈和撤销，源数据变化后重新待办', async ({ page }) => {
  const fixture = await mocked(page);
  await page.getByRole('button', { name: /待续费学员/ }).click();
  await page.getByRole('checkbox', { name: '续费学员今日已跟进' }).click();
  await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '1');
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
  await page.getByRole('checkbox', { name: '续费学员今日已跟进' }).click();
  await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '1');
  fixture.changeSignal();
  await page.getByRole('button', { name: '刷新今日待处理' }).click();
  await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
  await expect(page.getByText('剩余 5 课时 · 续费回访')).toBeVisible();
});

test('个人跟进记录按账号、机构、校区和日期隔离', async ({ page }) => {
  await mocked(page);
  await page.getByRole('button', { name: /待续费学员/ }).click();
  await page.getByRole('checkbox', { name: '续费学员今日已跟进' }).check();
  await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '1');
  for (const field of ['id', 'organizationId', 'campusId']) {
    await page.evaluate(({ user, field }) => {
      localStorage.setItem('auth-storage', JSON.stringify({ state: { token: 'ui-test-token', user: { ...user, [field]: 'another-scope' }, isAuthenticated: true }, version: 0 }));
    }, { user: mockUser, field });
    await page.reload();
    await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
  }
  await page.evaluate((user) => {
    localStorage.setItem('auth-storage', JSON.stringify({ state: { token: 'ui-test-token', user, isAuthenticated: true }, version: 0 }));
    const stored = JSON.parse(localStorage.getItem('buzzer-followups-v1')!);
    stored.state.records = Object.fromEntries(Object.entries(stored.state.records).map(([key, value]) => {
      const parts = JSON.parse(key); parts[3] = '2000-01-01'; return [JSON.stringify(parts), value];
    }));
    localStorage.setItem('buzzer-followups-v1', JSON.stringify(stored));
  }, mockUser);
  await page.reload();
  await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
});

test('部分数据源失败和名单截断均明确提示', async ({ page }) => {
  await mocked(page, { failRenewal: true });
  await page.getByRole('button', { name: /待续费学员/ }).click();
  await expect(page.getByText('暂时无法加载，请刷新重试')).toBeVisible();
  await expect(page.getByRole('checkbox')).toHaveCount(0);
});

test('分页总数保留，勾选只针对已加载的真实名单', async ({ page }) => {
  await mocked(page, { manyRenewals: true });
  await page.getByRole('button', { name: /待续费学员/ }).click();
  await expect(page.getByText('已载入 1 / 105 项，完整名单见业务页')).toBeVisible();
  await expect(page.getByRole('checkbox')).toHaveCount(1);
});

test('减少动态效果时不挂载 Remotion，键盘仍能勾选', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await mocked(page);
  await page.getByRole('button', { name: /待续费学员/ }).focus();
  await page.keyboard.press('Enter');
  const checkbox = page.getByRole('checkbox', { name: '续费学员今日已跟进' });
  await checkbox.focus();
  await page.keyboard.press('Space');
  await expect(page.getByRole('status')).toContainText('已记录今日跟进');
  await expect(page.locator('.focus-completion-motion')).toHaveCount(0);
});
