import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { chromium, expect } from '@playwright/test';
const config = JSON.parse(process.env.TEACHER_ORDER_QA || '{}');
assert(config.baseApi?.startsWith('http://127.0.0.1:'));
const base = 'http://127.0.0.1:5199', evidence = '../docs/acceptance/2026-11-13-teacher-order-source';
const browser = await chromium.launch({ headless: true });
const checks = [], writes = [], errors = [], unexpected = [], candidatePages = [];
let page, failCandidates = false;
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, serviceWorkers: 'block' });
  await context.addInitScript(({ user, token }) => localStorage.setItem('auth-storage', JSON.stringify({ state: { user, token, isAuthenticated: true }, version: 0 })), config);
  await context.route('**/*', async route => {
    const req = route.request(), url = new URL(req.url());
    if (url.origin !== base) { unexpected.push(req.url()); return route.abort(); }
    if (!url.pathname.startsWith('/api/')) return route.continue();
    if (url.pathname.includes('/conversion-candidates')) { candidatePages.push(url.search); if (failCandidates) return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { message: '验收模拟列表暂不可用' } }) }); }
    if (url.pathname === '/api/auth/me' || /^\/api\/(students|classes|conversions|experience-lessons|users\/teachers)(\/|$)/.test(url.pathname)) {
      if (req.method() !== 'GET') writes.push({ path: url.pathname, body: req.postDataJSON() });
      return route.fulfill({ response: await route.fetch({ url: config.baseApi + url.pathname + url.search }) });
    }
    if (req.method() !== 'GET') { unexpected.push(`${req.method()} ${url.pathname}`); return route.abort(); }
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ success: true, data: url.pathname.startsWith('/api/organizations/') ? { name: '教师成单独立验收' } : [] }) });
  });
  page = await context.newPage(); page.setDefaultTimeout(15000); page.on('pageerror', e => errors.push(String(e)));
  await page.goto(base + '/cashflow/order-info');
  const dialog = () => page.getByRole('dialog', { name: '新增成单', exact: true });
  const open = async () => { await page.getByRole('button', { name: '新增成单', exact: true }).click(); await expect(dialog()).toBeVisible(); await dialog().getByText('从体验课转化', { exact: true }).click(); };
  const choose = async name => { const input = dialog().locator('.ant-form-item').filter({ has: page.locator('label', { hasText: '选择体验课' }) }).getByRole('combobox'); await expect(input).toBeEnabled(); await input.fill(name); await page.locator('.ant-select-item-option').filter({ hasText: name }).click(); await expect(dialog().locator('#studentName')).toHaveValue(name); };
  const fill = async () => { await dialog().locator('#totalLessons').fill('10'); await dialog().locator('#price').fill('1000'); };
  await open(); await choose('页面预约他班');
  assert(candidatePages.some(q => q.includes('page=2')));
  await expect(dialog().locator('#contact')).toHaveValue('13900000001');
  await expect(dialog().locator('#salesId').locator('xpath=ancestor::div[contains(@class,"ant-select")]').first()).toContainText('test1');
  checks.push('教师可选本人负责但由其他老师授课的待体验预约；第2页数据自动读取，姓名/电话/销售负责人正确带入');
  await dialog().getByRole('combobox', { name: '班级与上课时间' }).click();
  await page.locator('.ant-select-item-option').filter({ hasText: 'teacher2' }).click(); await fill();
  await page.screenshot({ path: evidence + '/教师选择他班预约成单.png', fullPage: true });
  await dialog().getByRole('button', { name: '确认成单', exact: true }).click(); await expect(dialog()).not.toBeVisible();
  assert.equal(writes.length, 1); assert.equal(writes[0].body.experienceLessonId, config.ui.id); assert.equal(writes[0].body.salesId, config.user.id); assert.equal(writes[0].body.scheduleId, config.slot.id);
  checks.push('真实表单可选其他老师未来场次并提交成单，销售负责人与排课授课老师分离');
  await open(); await choose('页面暂不定班'); await fill(); await dialog().getByRole('button', { name: '确认成单', exact: true }).click(); await expect(dialog()).not.toBeVisible();
  assert.equal(writes.length, 2); assert.equal(writes[1].body.scheduleId, null); checks.push('同一教师也可将预约登记成单暂不定班');
  failCandidates = true; await open(); await expect(dialog()).toContainText('验收模拟列表暂不可用'); await expect(dialog()).not.toContainText('暂无可转化的体验课');
  failCandidates = false; await dialog().getByRole('button', { name: '重试', exact: true }).click(); await choose('分页预约000');
  checks.push('候选加载失败显示错误和重试，恢复后可正常选择，不伪装为空列表');
  assert.deepEqual(errors, []); assert.deepEqual(unexpected, []); assert(writes.every(w => w.path === '/api/conversions'));
  writeFileSync(evidence + '/browser-results.json', JSON.stringify({ at: new Date().toISOString(), passed: checks.length, checks, candidatePages }, null, 2));
  console.log(`PASS ${checks.length} browser checks`);
} catch (error) { if (page) { console.error('UI context', JSON.stringify({ url: page.url(), text: (await page.locator('body').innerText()).slice(-2000), errors })); await page.screenshot({ path: evidence + '/browser-failure.png', fullPage: true }); } throw error; }
finally { await browser.close(); }
