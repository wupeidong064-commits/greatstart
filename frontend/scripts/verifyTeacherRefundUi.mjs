import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium, expect } from '@playwright/test';

const config = JSON.parse(process.env.TEACHER_REFUND_QA || '{}');
assert(config.baseApi?.startsWith('http://127.0.0.1:'));
const base = 'http://127.0.0.1:5199', evidence = '../docs/acceptance/2026-11-13-teacher-refund';
mkdirSync(evidence, { recursive: true });
const checks = [], writes = [], errors = [], unexpected = [];
let loseNextResponse = false;
const browser = await chromium.launch({ channel: 'chrome', headless: true });
let page;
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1050 }, serviceWorkers: 'block' });
  await context.addInitScript(({ user, token }) => localStorage.setItem('auth-storage', JSON.stringify({ state: { user, token, isAuthenticated: true }, version: 0 })), config);
  await context.route('**/*', async route => {
    const req = route.request(), url = new URL(req.url());
    if (url.origin !== base) { unexpected.push(req.url()); return route.abort(); }
    if (!url.pathname.startsWith('/api/')) return route.continue();
    if (url.pathname === '/api/auth/me' || /^\/api\/(students|refunds|classes)(\/|$)/.test(url.pathname)) {
      if (req.method() !== 'GET') writes.push({ path: url.pathname, body: req.postDataJSON() });
      const response = await route.fetch({ url: config.baseApi + url.pathname + url.search });
      if (url.pathname === '/api/refunds/confirm' && loseNextResponse) { loseNextResponse = false; return route.abort('failed'); }
      return route.fulfill({ response });
    }
    if (req.method() !== 'GET') { unexpected.push(`${req.method()} ${url.pathname}`); return route.abort(); }
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ success: true, data: url.pathname.startsWith('/api/organizations/') ? { name: '独立老师退费验收' } : [] }) });
  });
  page = await context.newPage(); page.setDefaultTimeout(12000); page.on('pageerror', e => errors.push(String(e)));
  const entry = () => page.getByRole('dialog', { name: '登记退费（确认即通过）' });
  const confirmation = () => page.getByRole('dialog').filter({ hasText: '确认通过「' });
  const openChild = async name => {
    const row = page.locator('tr').filter({ hasText: name });
    await row.getByRole('button', { name: '退费', exact: true }).click();
    await expect(entry()).toBeVisible(); await expect(entry().locator('.ant-select').first()).toHaveClass(/ant-select-disabled/);
    await expect.poll(async () => Number((await entry().locator('#amountToRefund').inputValue()).replaceAll(',', ''))).toBe(1000);
  };
  const submit = async () => {
    await entry().getByRole('button', { name: /提交并确认|重试并确认原退费/ }).evaluate(el => { el.click(); el.click(); });
    await expect(confirmation()).toBeVisible();
    await confirmation().getByRole('button', { name: '确认通过', exact: true }).click();
    await expect(confirmation()).not.toBeVisible();
  };
  await page.goto(base + '/students');
  await expect(page.getByRole('button', { name: /退费记录/ })).toBeVisible();
  await expect(page.locator('tr').filter({ hasText: '页面退费孩子' }).getByRole('button', { name: '退费', exact: true })).toBeVisible();
  await expect(page.locator('tr').filter({ hasText: '仅回访孩子' }).getByRole('button', { name: '退费', exact: true })).toHaveCount(0);
  checks.push('老师学员管理页显示本人在班学员退费按钮及退费记录入口，仅回访无班学员无退费按钮');
  await openChild('页面退费孩子');
  await expect(entry()).toContainText('页面退费孩子'); await expect(entry()).toContainText('本次可退上限 ¥1000.00');
  await expect(entry().locator('#lessonsToRefund')).toHaveValue('10');
  await entry().getByPlaceholder('线下流程的退费原因 / 凭据摘要').fill('老师线下办理并登记');
  await expect(entry()).toHaveCSS('transform', 'none');
  await page.screenshot({ path: evidence + '/老师学员页退费.png', fullPage: true });
  await submit(); await expect(entry()).not.toBeVisible(); await expect(page.locator('tr').filter({ hasText: '页面退费孩子' })).toHaveCount(0);
  assert.equal(writes.length, 1); assert.equal(writes[0].path, '/api/refunds/confirm'); assert.equal(writes[0].body.studentId, config.ui.student.id);
  checks.push('行内退费自动带入学员和批次金额，确认直接生效并从在读名单刷新移除');
  await page.getByRole('button', { name: /退费记录/ }).click(); await page.waitForURL('**/students/refunds');
  const record = page.locator('tr').filter({ hasText: '页面退费孩子' });
  await expect(record).toBeVisible(); await expect(record).toContainText('已通过'); await expect(record).toContainText('本人老师');
  await expect(record.getByRole('button', { name: '取消', exact: true })).toHaveCount(0);
  await page.screenshot({ path: evidence + '/老师查看退费记录.png', fullPage: true });
  checks.push('退费后本人记录仍可查看，显示操作人和已通过状态，老师没有管理员取消权限');
  await page.goto(base + '/students'); await openChild('页面丢响应孩子');
  await entry().getByPlaceholder('线下流程的退费原因 / 凭据摘要').fill('模拟网络丢响应'); loseNextResponse = true;
  await submit(); await expect(entry()).toContainText('已有退费操作待确认');
  await expect(entry().locator('#amountToRefund')).toBeDisabled();
  assert.equal(writes.length, 2); const original = writes[1].body;
  await page.reload(); await expect(page.locator('tr').filter({ hasText: '页面丢响应孩子' })).toHaveCount(0);
  await page.getByRole('button', { name: /退费记录/ }).click(); await page.waitForURL('**/students/refunds');
  await page.getByRole('button', { name: /登记退费/ }).click();
  await expect(entry()).toContainText('已有退费操作待确认'); await expect(entry()).toContainText('页面丢响应孩子');
  await submit(); await expect(entry()).not.toBeVisible();
  assert.equal(writes.length, 3); assert.deepEqual(writes[2].body, original);
  await expect(page.locator('tr').filter({ hasText: '页面丢响应孩子' })).toHaveCount(1);
  checks.push('退费成功但丢响应后，刷新可从退费记录恢复同编号原参数并重试，不重复退费');
  assert(writes.every(w => w.path === '/api/refunds/confirm')); assert.deepEqual(errors, []); assert.deepEqual(unexpected, []);
  checks.push('页面写入全部直达独立退费确认接口，无旧申请审批链，无外部请求和未捕获异常');
  writeFileSync(evidence + '/browser-results.json', JSON.stringify({ at: new Date().toISOString(), frontend: base, api: 'isolated HTTP server', passed: checks.length, checks }, null, 2));
  console.log(`PASS: ${checks.length} teacher refund browser checks`);
} catch (error) {
  if (page) { console.error('UI failure context:', JSON.stringify({ url: page.url(), errors, text: (await page.locator('body').innerText()).slice(-1800) })); await page.screenshot({ path: evidence + '/browser-failure.png', fullPage: true }); }
  throw error;
} finally { await browser.close(); }
