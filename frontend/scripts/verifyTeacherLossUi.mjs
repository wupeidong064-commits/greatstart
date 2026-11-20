import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';

const config = JSON.parse(process.env.TEACHER_LOSS_QA || '{}');
assert(config.baseApi?.startsWith('http://127.0.0.1:'));
const base = 'http://127.0.0.1:5199';
const evidence = '../docs/acceptance/2026-11-13-teacher-loss';
mkdirSync(evidence, { recursive: true });
const checks = [], writes = [], errors = [], unexpected = [];
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1050 }, serviceWorkers: 'block' });
  await context.addInitScript(({ user, token }) => localStorage.setItem('auth-storage', JSON.stringify({ state: { user, token, isAuthenticated: true }, version: 0 })), config);
  await context.route('**/*', async route => {
    const req = route.request(), url = new URL(req.url());
    if (url.origin !== base) { unexpected.push(req.url()); return route.abort(); }
    if (!url.pathname.startsWith('/api/')) return route.continue();
    if (url.pathname === '/api/auth/me' || url.pathname.startsWith('/api/students') || url.pathname.startsWith('/api/enrollments')) {
      if (req.method() !== 'GET') writes.push({ path: url.pathname, body: req.postDataJSON() });
      const response = await route.fetch({ url: config.baseApi + url.pathname + url.search });
      return route.fulfill({ response });
    }
    if (req.method() !== 'GET') { unexpected.push(`${req.method()} ${url.pathname}`); return route.abort(); }
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ success: true, data: url.pathname.startsWith('/api/organizations/') ? { name: '独立退班验收' } : [] }) });
  });
  const page = await context.newPage(); page.setDefaultTimeout(10000); page.on('pageerror', e => errors.push(String(e)));
  const dialog = () => page.getByRole('dialog');
  const open = async () => { await page.getByRole('button', { name: '添加流失学员' }).first().click(); await expect(dialog().getByRole('combobox', { name: '选择学员（本人负责）' })).toBeEnabled(); };
  const selectStudent = async name => {
    await dialog().getByRole('combobox', { name: '选择学员（本人负责）' }).click();
    await page.locator('.ant-select-dropdown:visible:not(.ant-slide-up-leave)').last().getByText(new RegExp(`^${name} -`)).click();
  };
  const date = async () => { const input = dialog().locator('#expectedRecallDate'); await input.fill('2026-12-22'); await input.press('Enter'); await input.blur(); await dialog().getByText('学员信息：', { exact: true }).click(); await expect(page.locator('.ant-picker-dropdown:visible')).toHaveCount(0); };
  await page.goto(base + '/students/lost'); await open();
  await expect(dialog()).toContainText('可直接选择自己负责的在读学员');
  await dialog().getByRole('combobox', { name: '选择学员（本人负责）' }).click();
  await expect(page.locator('.ant-select-dropdown:visible:not(.ant-slide-up-leave)').last()).toContainText('页面单班孩子');
  await expect(page.locator('.ant-select-dropdown:visible:not(.ant-slide-up-leave)').last()).toContainText('页面多班孩子');
  await expect(page.locator('.ant-select-dropdown:visible:not(.ant-slide-up-leave)').last()).toContainText('页面本人多班');
  await expect(page.locator('.ant-select-dropdown:visible:not(.ant-slide-up-leave)').last()).toContainText('页面提前点名孩子');
  await expect(page.locator('.ant-select-dropdown:visible:not(.ant-slide-up-leave)').last()).not.toContainText('他班学员');
  await page.keyboard.press('Escape'); checks.push('5199选人显示本人在班孩子及多班孩子，隐藏他班孩子');
  await selectStudent('页面单班孩子');
  await expect(dialog().locator('.ant-form-item').filter({ hasText: '退出班级' }).first()).toContainText('本人甲班');
  await date(); await page.screenshot({ path: evidence + '/老师直接选择在班学员.png', fullPage: true });
  await dialog().getByRole('button', { name: '确认', exact: true }).click();
  await expect(dialog()).not.toBeVisible(); await expect(page.locator('tr').filter({ hasText: '页面单班孩子' })).toBeVisible();
  assert.equal(writes[0].path, `/api/enrollments/${config.uiSingle.enrollments[0].id}/remove-as-lost`);
  assert.deepEqual(writes[0].body, { deleteReason: '时间问题', expectedRecallDate: '2026-12-22' }); checks.push('单班自动带出班级，正式退班后同老师流失名单立即显示');
  await open(); await selectStudent('页面多班孩子');
  await expect(dialog()).toContainText('其他在读班级保留');
  await dialog().getByRole('combobox', { name: '退出班级' }).press('ArrowDown');
  await expect(page.locator('.ant-select-dropdown:visible:not(.ant-slide-up-leave)').last()).toContainText('本人甲班');
  await expect(page.locator('.ant-select-dropdown:visible:not(.ant-slide-up-leave)').last()).not.toContainText('其他老师班');
  await page.keyboard.press('Escape'); await date();
  await page.screenshot({ path: evidence + '/多班只退出本人班级.png', fullPage: true });
  await dialog().getByRole('button', { name: '确认', exact: true }).click(); await expect(dialog()).not.toBeVisible();
  await expect(page.getByText('已退出所选班级，学员仍在其他班级在读', { exact: true })).toBeVisible();
  await expect(page.locator('tr').filter({ hasText: '页面多班孩子' })).toHaveCount(0); checks.push('跨老师多班仅允许退出本人班级，并明确仍在其他班在读');
  await open(); await selectStudent('页面本人多班'); await date();
  await dialog().getByRole('button', { name: '确认', exact: true }).click();
  await expect(dialog().locator('#enrollmentId_help').getByText('请选择要退出的班级', { exact: true })).toBeVisible(); assert.equal(writes.length, 2);
  await dialog().getByRole('combobox', { name: '退出班级' }).press('ArrowDown');
  await page.locator('.ant-select-dropdown:visible:not(.ant-slide-up-leave)').last().getByText('本人乙班', { exact: true }).click();
  await expect(dialog()).toContainText('其他在读班级保留'); checks.push('本人多个班级时必须明确选择退出班级，空选不会提交');
  await dialog().getByRole('button', { name: '取消', exact: true }).click();
  await open(); await selectStudent('页面提前点名孩子'); await date();
  await dialog().getByRole('button', { name: '确认', exact: true }).click();
  await expect(dialog()).not.toBeVisible(); await expect(page.locator('tr').filter({ hasText: '页面提前点名孩子' })).toBeVisible();
  checks.push('提前点名的孩子从流失登记直接退班成功，无需先到班级处理');
  assert.equal(writes.length, 3); assert(writes.every(w => /^\/api\/enrollments\/[^/]+\/remove-as-lost$/.test(w.path))); assert.deepEqual(errors, []); assert.deepEqual(unexpected, []);
  checks.push('全部写入仅到独立HTTP数据库，无通用改状态请求，无未捕获异常或外部请求');
  await page.route('**/api/students?*', async route => {
    if (!new URL(route.request().url()).searchParams.has('lossCandidates')) return route.fallback();
    const data = Array.from({ length: 80 }, (_, i) => ({ id: `scroll-${i}`, name: `滚动学员${String(i + 1).padStart(2, '0')}`, enrollments: [{ id: `scroll-e-${i}`, status: 'active', class: { id: config.c1.id, name: '本人甲班', teacherId: config.user.id } }] }));
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ success: true, data, pagination: { page: 1, pageSize: 1000, total: data.length } }) });
  });
  const scrollMeasurements = [];
  for (const size of [100, 125, 150]) for (const theme of ['dark', 'light']) for (const viewport of [{ width: 1440, height: 900 }, { width: 1000, height: 700 }, { width: 375, height: 740 }]) {
    await page.setViewportSize(viewport);
    await page.evaluate(({ size, theme }) => localStorage.setItem('buzzer-ui-v1', JSON.stringify({ state: { interfaceSize: size, theme, favorites: ['lost'], siderCollapsed: false }, version: 0 })), { size, theme });
    await page.reload(); await open();
    await dialog().getByRole('combobox', { name: '选择学员（本人负责）' }).click();
    const popup = page.locator('.ant-select-dropdown:visible:not(.ant-slide-up-leave)').last(), holder = popup.locator('.rc-virtual-list-holder');
    const measure = async position => {
      await holder.evaluate((el, position) => { el.scrollTop = position === 'bottom' ? el.scrollHeight : position; el.dispatchEvent(new Event('scroll', { bubbles: true })); }, position);
      await expect.poll(() => holder.evaluate(el => { const rect = el.getBoundingClientRect(), items = [...el.querySelectorAll('.ant-select-item-option')].map(n => n.getBoundingClientRect()).filter(r => r.bottom > rect.top && r.top < rect.bottom); return items.length ? Math.max(0, rect.bottom - Math.max(...items.map(r => r.bottom))) : rect.height; })).toBeLessThan(5);
      return holder.evaluate(el => ({ height: el.clientHeight, scrollTop: el.scrollTop, scrollHeight: el.scrollHeight }));
    };
    await expect(holder).toBeVisible(); const top = await measure(0); assert(top.height <= 256, 'virtual viewport must retain Select listHeight');
    if (size === 125 && theme === 'dark' && viewport.width === 1440) {
      const oldStyle = await page.addStyleTag({ content: 'html[data-ui-size] .ant-select-dropdown .rc-virtual-list-holder { max-height: calc(100dvh - 32px) !important; }' });
      const expandedHeight = await holder.evaluate(el => el.clientHeight); assert(expandedHeight > 256, 'old CSS must reproduce expanded virtual viewport');
      await oldStyle.evaluate(el => el.remove());
    }
    await holder.hover(); await page.mouse.wheel(0, 640); await measure(640); const bottom = await measure('bottom');
    await expect(popup.getByText('滚动学员80 - 本人甲班', { exact: true })).toBeVisible();
    await popup.getByText('滚动学员80 - 本人甲班', { exact: true }).click();
    const modalBody = dialog().locator('.ant-modal-body');
    await modalBody.hover(); await page.mouse.wheel(0, 2000);
    await modalBody.evaluate(el => { el.scrollTop = el.scrollHeight; });
    const bodyMeasurement = await modalBody.evaluate(el => {
      const rect = el.getBoundingClientRect(), lastField = el.querySelector('.ant-picker').getBoundingClientRect();
      return { height: el.clientHeight, scrollTop: el.scrollTop, scrollHeight: el.scrollHeight, trailingGap: rect.bottom - lastField.bottom };
    });
    assert(bodyMeasurement.trailingGap >= 0 && bodyMeasurement.trailingGap < 100, 'modal must end at its last field without a blank scroll tail');
    scrollMeasurements.push({ size, theme, ...viewport, top, bottom, modalBody: bodyMeasurement });
    await dialog().getByRole('button', { name: '取消', exact: true }).click();
  }
  checks.push('80名学员在三档缩放、深浅主题及三种视口共18种状态滚动到底均无空白，旧样式可复现错误高度');
  assert.equal(writes.length, 3); assert.deepEqual(errors, []); assert.deepEqual(unexpected, []);
  writeFileSync(evidence + '/scroll-results.json', JSON.stringify({ date: new Date().toISOString(), states: scrollMeasurements.length, measurements: scrollMeasurements }, null, 2));
  writeFileSync(evidence + '/browser-results.json', JSON.stringify({ date: new Date().toISOString(), frontend: base, api: 'isolated HTTP server', checks, passed: checks.length }, null, 2));
  console.log(`PASS: ${checks.length} browser checks on 5199 with isolated API`);
} finally { await browser.close(); }
