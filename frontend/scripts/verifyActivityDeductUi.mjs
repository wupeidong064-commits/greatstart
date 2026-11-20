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
const output = path.resolve(root, process.env.ACTIVITY_UI_OUTPUT || '../docs/acceptance/2026-11-09-activity-ui');
const results = [];
const requests = [];
const unexpected = [];
const pageErrors = [];
let server, browser, page;
let base;
let mode = 'success';
let release;
let rosterStatus = 'late', rosterSource = 'gift';
const receipts = new Map();
const userA = { id: 'ui-admin-a', name: '隔离验收管理员甲', email: 'a@example.invalid', role: 'admin', organizationId: 'ui-org-a', campusId: 'ui-campus-a' };
const userB = { ...userA, id: 'ui-admin-b', name: '隔离验收管理员乙' };
const student = { id: 'ui-student', name: '幂等验收学员', organizationId: userA.organizationId, campusId: userA.campusId, status: 'active', remainingLessons: 50, purchasedLessons: 10, consumedLessons: 0, enrollments: [{ status: 'active', classId: 'mock-class', class: { name: 'Mock班' } }] };
const auth = user => ({ state: { user, token: `fake-token-${user.id}`, isAuthenticated: true, _hasHydrated: true }, version: 0 });
const pending = () => page.evaluate(() => Object.entries(sessionStorage).filter(([key]) => key.startsWith('pending-activity-deduct:')).map(([key, value]) => ({ key, ...JSON.parse(value) })));
const dialog = () => page.getByRole('dialog', { name: `划课 - ${student.name}` });
const addButton = () => page.locator('button').filter({ hasText: /^\s*划\s*课\s*$/ });
const open = async () => { await addButton().click(); await expect(dialog()).toBeVisible(); if (await dialog().getByText('活动划课', { exact: true }).isEnabled() && !(await dialog().getByRole('spinbutton').count())) { await dialog().getByText('活动划课', { exact: true }).click(); await dialog().getByPlaceholder('例如：万圣节主题活动课').fill('mock活动'); } };
const cancel = async () => { await dialog().getByRole('button', { name: /^取\s*消$/ }).click(); await expect(dialog()).not.toBeVisible(); };
const submit = () => dialog().getByRole('button', { name: /确认活动划课|重试并确认原划课/ }).click();
const waitIdle = () => expect(dialog().locator('.ant-btn-loading')).toHaveCount(0);
async function check(name, action) {
  try { await action(); results.push({ name, pass: true }); console.log(`PASS ${name}`); }
  catch (error) { results.push({ name, pass: false, error: String(error.stack || error) }); throw error; }
}

await fs.mkdir(output, { recursive: true });
await fs.rm(path.join(output, 'activity-deduct-ui-failure.png'), { force: true });
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
    if (url.pathname === '/api/lesson-logs/balance') return reply({ success: true, data: { studentId: student.id, remainingLessons: student.remainingLessons, paidRemainingLessons: student.remainingLessons - 5, giftRemainingLessons: 4, unpricedRemainingLessons: 1 } });
    if (url.pathname === '/api/schedules/mock-schedule/roster') return reply({ success: true, data: { students: [{ id: student.id, attendanceStatus: rosterStatus, lessonSource: rosterSource }] } });
    if (url.pathname === '/api/schedules') return reply({ success: true, data: [{ id: 'mock-schedule', status: 'scheduled', startTime: '2026-11-09T01:00:00Z', endTime: '2026-11-09T02:00:00Z' }] });
    if (url.pathname === '/api/lesson-logs/deduct') { requests.push(request.postDataJSON()); return reply({ success: true, data: { results: [{ deducted: 1, status: 'present', remainingLessons: student.remainingLessons - 1 }] } }); }
    if (url.pathname === '/api/students/ui-student') return reply({ success: true, data: student });
    if (url.pathname === '/api/students' && request.method() === 'GET') return reply({ success: true, data: [student], pagination: { page: 1, pageSize: 10, total: 1 } });
    if (url.pathname === '/api/lesson-logs/activity-deduct' && request.method() === 'POST') {
      const body = request.postDataJSON();
      requests.push({ ...body, actor: request.headers().authorization?.includes(userB.id) ? userB.id : userA.id });
      const action = mode;
      mode = 'success';
      if (action === 'invalid') return reply({ success: false, error: { code: 'INVALID_PARAMS', message: '活动划课后课时超出允许范围' } }, 400);
      if (action === 'hold') await new Promise(resolve => { release = resolve; });
      if (!receipts.has(body.requestId)) {
        const previousRemaining = student.remainingLessons;
        student.remainingLessons -= body.lessons;
        receipts.set(body.requestId, { success: true, data: { studentId: body.studentId, previousRemaining, added: body.lessons, remainingLessons: student.remainingLessons, log: { id: `log-${body.requestId}` } }, message: '活动划课成功' });
      }
      if (action === 'lost-response') return route.abort('failed');
      return reply(receipts.get(body.requestId));
    }
    if (request.method() !== 'GET') unexpected.push({ method: request.method(), url: request.url() });
    return reply({ success: true, data: [] });
  });
  page = await context.newPage();
  page.on('pageerror', error => pageErrors.push(String(error)));
  await page.goto(`${base}/students`);
  await expect(addButton()).toBeVisible({ timeout: 60000 });

  await check('double click submits once and shows loading', async () => {
    await open();
    await dialog().getByRole('spinbutton').fill('2');
    mode = 'hold';
    await dialog().getByRole('button', { name: '确认活动划课', exact: true }).evaluate(button => { button.click(); button.click(); });
    await expect.poll(() => requests.length).toBe(1);
    await expect(dialog().locator('.ant-btn-loading')).toHaveCount(1);
    await expect(dialog().getByRole('spinbutton')).toBeDisabled();
    await page.waitForTimeout(150);
    assert.equal(requests.length, 1);
    release();
    await expect(dialog()).not.toBeVisible();
    assert.equal((await pending()).length, 0);
  });

  let lostKey;
  await check('lost response retains original key and freezes parameters', async () => {
    await open();
    await dialog().getByRole('spinbutton').fill('3');
    await dialog().getByText('赠课', { exact: true }).click();
    mode = 'lost-response';
    await submit();
    await expect.poll(() => requests.length).toBe(2);
    await waitIdle();
    lostKey = requests.at(-1).requestId;
    assert.equal((await pending())[0].requestId, lostKey);
    assert.equal((await pending())[0].lessonSource, 'gift');
    await expect(dialog().getByRole('spinbutton')).toBeDisabled();
    await expect(dialog().getByPlaceholder('例如：万圣节主题活动课')).toBeDisabled();
    await expect(dialog().getByText('已有活动划课操作待确认')).toBeVisible();
  });
  await check('close reopen and refresh restore pending operation', async () => {
    await cancel(); await open();
    await expect(dialog().getByRole('spinbutton')).toHaveValue('3');
    await expect(dialog().getByRole('spinbutton')).toBeDisabled();
    await page.reload();
    await open();
    await expect(dialog().getByRole('spinbutton')).toHaveValue('3');
    await expect(dialog().getByRole('spinbutton')).toBeDisabled();
    assert.equal((await pending())[0].requestId, lostKey);
    // rc-motion starts CSS animation on a later frame than the DOM visibility check.
    await page.waitForTimeout(450);
    await expect(dialog()).toBeVisible();
    await page.screenshot({ path: path.join(output, 'activity-deduct-pending-restored.png'), fullPage: false, animations: 'disabled' });
  });
  await check('changed parameters cannot reuse an unresolved operation', async () => {
    const original = (await pending())[0];
    await page.evaluate(({ key, ...value }) => sessionStorage.setItem(key, JSON.stringify({ ...value, notes: '原请求保留说明' })), original);
    const before = requests.length;
    await submit(); await waitIdle();
    assert.equal(requests.length, before);
    await expect(dialog().getByPlaceholder('例如：万圣节主题活动课')).toHaveValue('原请求保留说明');
    // Restore the actual original payload; retry must never mix a new payload with its ID.
    await page.evaluate(({ key, ...value }) => sessionStorage.setItem(key, JSON.stringify(value)), original);
    await submit(); await waitIdle();
    assert.equal(requests.length, before);
    await expect(dialog().getByPlaceholder('例如：万圣节主题活动课')).toHaveValue(original.notes);
  });
  await check('retry reuses key after server success with lost response', async () => {
    const remaining = student.remainingLessons;
    await submit();
    await expect(dialog()).not.toBeVisible();
    assert.equal(requests.length, 3);
    assert.equal(requests[2].requestId, lostKey);
    assert.equal(requests[2].lessonSource, 'gift');
    assert.equal(student.remainingLessons, remaining);
    assert.equal((await pending()).length, 0);
  });
  await check('success clears pending and next operation creates a new key', async () => {
    await open(); await dialog().getByRole('spinbutton').fill('3'); await submit();
    await expect(dialog()).not.toBeVisible();
    assert.notEqual(requests.at(-1).requestId, lostKey);
    assert.equal((await pending()).length, 0);
  });
  await check('definitive 400 unlocks correction and next submission gets a new key', async () => {
    await open(); await dialog().getByRole('spinbutton').fill('9'); mode = 'invalid'; await submit();
    await expect.poll(() => requests.length).toBe(5);
    await waitIdle();
    const invalidKey = requests.at(-1).requestId;
    await expect(dialog().getByRole('spinbutton')).toBeEnabled();
    assert.equal((await pending()).length, 0);
    await dialog().getByRole('spinbutton').fill('1'); await submit();
    await expect(dialog()).not.toBeVisible();
    assert.notEqual(requests.at(-1).requestId, invalidKey);
  });
  await check('pending operations remain isolated when switching users', async () => {
    await open(); await dialog().getByRole('spinbutton').fill('4'); mode = 'lost-response'; await submit();
    await expect.poll(() => requests.length).toBe(7); await waitIdle();
    const userAKey = requests.at(-1).requestId;
    await page.evaluate(value => localStorage.setItem('auth-storage', JSON.stringify(value)), auth(userB));
    await page.reload(); await open();
    await expect(dialog().getByRole('spinbutton')).toBeEnabled();
    await expect(dialog().getByRole('spinbutton')).toHaveValue('1');
    await submit(); await expect(dialog()).not.toBeVisible();
    assert.equal(requests.at(-1).actor, userB.id);
    assert.notEqual(requests.at(-1).requestId, userAKey);
    assert.equal((await pending())[0].requestId, userAKey);
    await page.evaluate(value => localStorage.setItem('auth-storage', JSON.stringify(value)), auth(userA));
    await page.reload(); await open();
    await expect(dialog().getByRole('spinbutton')).toBeDisabled();
    await expect(dialog().getByRole('spinbutton')).toHaveValue('4');
    await submit(); await expect(dialog()).not.toBeVisible();
    assert.equal(requests.at(-1).requestId, userAKey);
    assert.equal((await pending()).length, 0);
  });
  await check('schedule attendance restores saved gift source and late status', async () => {
    await addButton().click(); await expect(dialog()).toBeVisible();
    await dialog().getByRole('combobox', { name: '选择课程场次' }).click();
    await page.locator('.ant-select-item-option-content').filter({ hasText: /\d{2}:\d{2} - \d{2}:\d{2}/ }).click();
    await dialog().getByRole('button', { name: /^确\s*定$/ }).click();
    await expect(dialog()).not.toBeVisible();
    assert.deepEqual(requests.at(-1), { studentId: student.id, scheduleId: 'mock-schedule', attendanceStatus: 'late', notes: '场次签到', lessonSource: 'gift' });
    assert.equal((await pending()).length, 0);
  });
  await check('legacy pending receipt without a source replays as paid using its original id', async () => {
    const legacy = { requestId: '71743850-d3f3-47b0-8e1d-166034f5bb0e', lessons: 1, studentId: student.id, notes: '历史请求' };
    await page.evaluate(({ userA, legacy }) => sessionStorage.setItem('pending-activity-deduct:v1:' + JSON.stringify([userA.organizationId, userA.id, legacy.studentId]), JSON.stringify(legacy)), { userA, legacy });
    await open(); await submit(); await expect(dialog()).not.toBeVisible();
    assert.equal(requests.at(-1).requestId, legacy.requestId); assert.equal(requests.at(-1).lessonSource, 'paid');
  });
  await check('insufficient gift credit preserves source and lets user correct the amount', async () => {
    await open(); await dialog().getByText('赠课', { exact: true }).click();
    await dialog().getByRole('spinbutton').fill('5');
    const before = requests.length;
    await submit(); await expect(page.getByText('赠课余额不足，请调整课时或选择付费课')).toBeVisible();
    assert.equal(requests.length, before); await expect(dialog().getByRole('radio', {name:'赠课', exact:true})).toBeChecked();
    await dialog().getByRole('spinbutton').fill('1'); await submit(); await expect(dialog()).not.toBeVisible();
    assert.equal(requests.at(-1).lessonSource, 'gift');
  });
  await check('immediate confirmation after choosing gift on a new attendance uses the selected source', async () => {
    rosterStatus = 'none'; rosterSource = null;
    await addButton().click(); await expect(dialog()).toBeVisible();
    await dialog().getByRole('combobox', { name: '选择课程场次' }).click();
    await page.locator('.ant-select-item-option-content').filter({ hasText: /\d{2}:\d{2} - \d{2}:\d{2}/ }).click();
    await expect(dialog().getByRole('button', { name: /^确\s*定$/ })).toBeEnabled();
    await dialog().evaluate(el => {
      el.querySelector('input[value="gift"]').click();
      el.querySelector('.ant-modal-footer .ant-btn-primary').click();
    });
    await expect(dialog()).not.toBeVisible();
    assert.equal(requests.at(-1).lessonSource, 'gift'); assert.equal(requests.at(-1).attendanceStatus, 'present');
  });
  await check('no external traffic or page runtime errors', async () => {
    assert.deepEqual(unexpected, []); assert.deepEqual(pageErrors, []);
  });
  await page.screenshot({ path: path.join(output, 'activity-deduct-ui-success.png'), fullPage: false, animations: 'disabled' });
} catch (error) {
  if (!results.some(result => !result.pass)) results.push({ name: 'setup or script', pass: false, error: String(error.stack || error) });
  if (page) await page.screenshot({ path: path.join(output, 'activity-deduct-ui-failure.png') }).catch(() => {});
  process.exitCode = 1;
} finally {
  if (release) release();
  await browser?.close();
  server?.httpServer?.closeAllConnections();
  await server?.close();
  const report = { generatedAt: new Date().toISOString(), isolation: { base, envFilesLoaded: false, businessApiAccess: false, allApisMocked: true, serverClosed: true, browserClosed: true }, results, requests, unexpected, pageErrors };
  await fs.writeFile(path.join(output, 'activity-deduct-ui.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ passed: results.filter(result => result.pass).length, failed: results.filter(result => !result.pass).length, report: path.join(output, 'activity-deduct-ui.json') }));
}
