/** Real Students UI, isolated Vite, mocked APIs only. No .env or business service access. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { chromium, expect } from '@playwright/test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.resolve(root, '../docs/acceptance/2026-11-09-refund-ui');
const results = [];
const requests = [];
const unexpected = [];
const pageErrors = [];
let server, browser, page;
let base;
const listQueries = [];
let mode = 'success';
let release;
const receipts = new Map();
const userA = { id: 'ui-admin-a', name: '隔离验收管理员甲', email: 'a@example.invalid', role: 'admin', organizationId: 'ui-org-a', campusId: 'ui-campus-a' };
const userB = { ...userA, id: 'ui-admin-b', name: '隔离验收管理员乙' };
const student = { id: 'ui-student', name: '幂等验收学员', organizationId: userA.organizationId, campusId: userA.campusId, status: 'active', remainingLessons: 50, purchasedLessons: 10, consumedLessons: 0, enrollments: [{ status: 'active', classId: 'mock-class', class: { name: 'Mock班' } }] };
const auth = user => ({ state: { user, token: `fake-token-${user.id}`, isAuthenticated: true, _hasHydrated: true }, version: 0 });
const pending = () => page.evaluate(() => Object.entries(sessionStorage).filter(([key]) => key.startsWith('pending-refund-confirm:')).map(([key, value]) => ({ key, ...JSON.parse(value) })));
const dialog = () => page.getByRole('dialog', { name: '登记退费（确认即通过）' });
const confirmation = () => page.getByRole('dialog').filter({ hasText: '确认通过「' });
const open = async () => { await page.getByRole('button', { name: /登记退费/ }).click(); await expect(dialog()).toBeVisible(); };
const cancel = async () => { await dialog().getByRole('button', { name: /^取\s*消$/ }).click(); await expect(dialog()).not.toBeVisible(); };
const submit = async () => {
  await dialog().getByRole('button', { name: /提交并确认|重试并确认原退费/ }).evaluate(button => { button.click(); button.click(); });
  await expect(confirmation()).toBeVisible();
  await confirmation().getByRole('button', { name: '确认通过', exact: true }).click();
  await expect(confirmation()).not.toBeVisible();
  await page.waitForTimeout(350);
};
const fill = async () => {
  await dialog().locator('#studentId').click();
  await page.locator('.ant-select-item-option-content').filter({ hasText: student.name }).click();
  await expect(dialog().locator('#lessonsToRefund')).toHaveValue('50');
  await dialog().locator('#lessonsToRefund').fill('2');
  await dialog().locator('#amountToRefund').fill('100');
  await dialog().getByPlaceholder('线下流程的退费原因 / 凭据摘要').fill('mock凭据');
};
async function check(name, action) {
  try { await action(); results.push({ name, pass: true }); console.log(`PASS ${name}`); }
  catch (error) { results.push({ name, pass: false, error: String(error.stack || error) }); throw error; }
}

await fs.mkdir(output, { recursive: true });
await fs.rm(path.join(output, 'refund-confirm-ui-failure.png'), { force: true });
try {
  const probe = net.createServer();
  await new Promise((resolve, reject) => { probe.once('error', reject); probe.listen(0, '127.0.0.1', resolve); });
  const isolatedPort = probe.address().port;
  await new Promise((resolve, reject) => probe.close(error => error ? reject(error) : resolve()));
  assert(![3000, 5173].includes(isolatedPort));
  // Ignore both repository Vite config and .env files, and explicitly omit its /api proxy.
  server = await createServer({ root, configFile: false, envFile: false, plugins: [react()],
    define: { 'import.meta.env.VITE_API_BASE': JSON.stringify('/api') },
    server: { host: '127.0.0.1', port: isolatedPort, strictPort: true, hmr: false, proxy: {} },
    clearScreen: false, logLevel: 'error' });
  await server.listen();
  const port = server.httpServer.address().port;
  assert(![3000, 5173].includes(port));
  base = `http://127.0.0.1:${port}`;
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' });
  await context.addInitScript(value => { if (!localStorage.getItem('auth-storage')) localStorage.setItem('auth-storage', JSON.stringify(value)); }, auth(userA));
  await context.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== base) { unexpected.push({ method: request.method(), url: request.url() }); return route.abort('blockedbyclient'); }
    if (!url.pathname.startsWith('/api')) return route.continue();
    const reply = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (url.pathname === '/api/auth/me') return reply({ success: true, data: request.headers().authorization?.includes(userB.id) ? userB : userA });
    if (url.pathname === '/api/refunds' && request.method() === 'GET') {
      listQueries.push(Object.fromEntries(url.searchParams));
      return reply({ success: true, data: { data: [{ id: 'old-cancelled', studentName: '原有已取消', amountToRefund: 20, lessonsToRefund: 1, reason: '旧记录', status: 'cancelled', createdAt: '2026-11-02' }], summary: { approvedCount: 0, approvedAmount: 0, approvedLessons: 0, cancelledCount: 1, cancelledAmount: 20 } } });
    }
    if (url.pathname === '/api/students') return reply({ success: true, data: [student] });
    if (url.pathname === '/api/refunds/confirm' && request.method() === 'POST') {
      const body = request.postDataJSON(); requests.push(body);
      const action = mode; mode = 'success';
      if (action === 'invalid') return reply({ success: false, error: { code: 'INVALID_REFUND', message: '无效参数' } }, 400);
      if (!receipts.has(body.requestId)) receipts.set(body.requestId, { success: true, data: { id: `refund-${body.requestId}`, ...body, status: 'approved' } });
      if (action === 'lost-response') return route.abort('failed');
      return reply(receipts.get(body.requestId));
    }
    if (request.method() !== 'GET') unexpected.push({ method: request.method(), url: request.url() });
    return reply({ success: true, data: [] });
  });
  page = await context.newPage();
  page.setDefaultTimeout(10000);
  page.on('pageerror', error => pageErrors.push(String(error)));
  await page.goto(`${base}/students/refunds`);
  await expect(page.getByRole('button', { name: /登记退费/ })).toBeVisible({ timeout: 60000 });

  let original;
  await check('response loss preserves original refund UUID and payload', async () => {
    await open(); await fill(); mode = 'lost-response'; await submit();
    assert.equal(requests.length, 1); original = requests[0];
    assert.equal((await pending())[0].payload.requestId, original.requestId);
    await expect(dialog().locator('#lessonsToRefund')).toBeDisabled();
    await expect(dialog().getByText('已有退费操作待确认')).toBeVisible();
  });
  await check('closing and refreshing restore original refund despite changed student status', async () => {
    student.status = 'refunded';
    await cancel(); await open();
    await expect(dialog().locator('#amountToRefund')).toHaveValue('100.00');
    await page.reload(); await open();
    await expect(dialog().locator('#lessonsToRefund')).toHaveValue('2');
    assert.deepEqual((await pending())[0].payload, original);
  });
  await check('changed parameters never mix with an unresolved refund key', async () => {
    const saved = (await pending())[0];
    await page.evaluate(({ key, ...value }) => sessionStorage.setItem(key, JSON.stringify({ ...value, payload: { ...value.payload, reason: '恢复的原原因' } })), saved);
    await dialog().getByRole('button', { name: '重试并确认原退费' }).click();
    await expect(dialog().getByPlaceholder('线下流程的退费原因 / 凭据摘要')).toHaveValue('恢复的原原因');
    assert.equal(requests.length, 1); await expect(confirmation()).not.toBeVisible();
    await page.evaluate(({ key, ...value }) => sessionStorage.setItem(key, JSON.stringify(value)), saved);
    await dialog().getByRole('button', { name: '重试并确认原退费' }).click();
    await expect(dialog().getByPlaceholder('线下流程的退费原因 / 凭据摘要')).toHaveValue(original.reason);
    assert.equal(requests.length, 1);
  });
  await check('retry confirms original refund without duplicate execution', async () => {
    await submit(); await expect(dialog()).not.toBeVisible();
    assert.deepEqual(requests[1], original); assert.equal(receipts.size, 1); assert.equal((await pending()).length, 0);
  });
  await check('new refund after success uses a fresh UUID', async () => {
    student.status = 'active'; await open(); await fill(); await submit();
    await expect(dialog()).not.toBeVisible(); assert.notEqual(requests[2].requestId, original.requestId); assert.equal(receipts.size, 2);
  });
  await check('definitive invalid refund releases draft for correction', async () => {
    await open(); await fill(); mode = 'invalid'; await submit();
    assert.equal((await pending()).length, 0);
    await expect(dialog().locator('#amountToRefund')).toBeEnabled();
    await submit(); await expect(dialog()).not.toBeVisible(); assert.notEqual(requests[3].requestId, requests[4].requestId);
  });
  await check('existing date filter and record state remain unchanged', async () => {
    assert(listQueries.length >= 2); assert(listQueries[0].startDate); assert(listQueries[0].endDate);
    for (const query of listQueries) assert.deepEqual(query, listQueries[0]);
    await expect(page.getByText('原有已取消', { exact: true })).toBeVisible();
    await expect(page.locator('.ant-table-tbody .ant-tag').filter({ hasText: '已取消' })).toBeVisible();
    assert.deepEqual(unexpected, []); assert.deepEqual(pageErrors, []);
  });
  await page.screenshot({ path: path.join(output, 'refund-confirm-ui-success.png'), fullPage: false, animations: 'disabled' });
} catch (error) {
  if (!results.some(result => !result.pass)) results.push({ name: 'setup or script', pass: false, error: String(error.stack || error) });
  if (page) await page.screenshot({ path: path.join(output, 'refund-confirm-ui-failure.png') }).catch(() => {});
  process.exitCode = 1;
} finally {
  if (release) release();
  await browser?.close();
  server?.httpServer?.closeAllConnections();
  await server?.close();
  const report = { generatedAt: new Date().toISOString(), isolation: { base, envFilesLoaded: false, businessApiAccess: false, allApisMocked: true, serverClosed: true, browserClosed: true }, results, requests, unexpected, pageErrors };
  await fs.writeFile(path.join(output, 'refund-confirm-ui.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ passed: results.filter(result => result.pass).length, failed: results.filter(result => !result.pass).length, report: path.join(output, 'refund-confirm-ui.json') }));
}
