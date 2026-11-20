import assert from 'node:assert/strict';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { chromium, expect } from '@playwright/test';

// Only the disposable integration harness supplies this actor and backend.
const backend = process.env.COURSE_REVIEW_BACKEND_URL;
assert(backend, 'COURSE_REVIEW_BACKEND_URL is required');
const backendUrl = new URL(backend);
assert(['127.0.0.1', 'localhost', '[::1]'].includes(backendUrl.hostname), 'Backend must be local');
const actor = JSON.parse(process.env.COURSE_REVIEW_ACTOR || '{}');
assert(actor.id && actor.organizationId && actor.token, 'Harness actor and real token are required');
const { token, ...user } = actor;
const className = process.env.CLASS_NAME || '浏览器课务班';
const studentName = process.env.STUDENT_NAME || '浏览器学员';
const errors = [], external = [], writes = [];
let server, browser;
try {
  server = await createServer({
    root: process.cwd(), configFile: false, envFile: false, plugins: [react()],
    define: { 'import.meta.env.VITE_API_BASE': JSON.stringify('/api') },
    server: { host: '127.0.0.1', port: 0, hmr: false, proxy: { '/api': { target: backendUrl.origin, changeOrigin: true } } },
    logLevel: 'error',
  });
  await server.listen();
  const base = `http://127.0.0.1:${server.httpServer.address().port}`;
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ serviceWorkers: 'block', timezoneId: 'Asia/Shanghai' });
  await context.addInitScript(({ user, token }) => localStorage.setItem('auth-storage', JSON.stringify({ state: { user, token, isAuthenticated: true }, version: 0 })), { user, token });
  await context.route('**/*', route => {
    const req = route.request(), url = new URL(req.url());
    if (url.origin !== base) { external.push(url.origin); return route.abort(); }
    if (url.pathname.startsWith('/api/') && !['GET', 'HEAD', 'OPTIONS'].includes(req.method())) writes.push({ method: req.method(), path: url.pathname });
    return route.continue();
  });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  page.on('pageerror', error => errors.push(String(error)));
  await page.goto(`${base}/classes`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: className, exact: true }).click();
  const dialog = page.getByRole('dialog', { name: `按班级时间重排 · ${className}`, exact: true });
  const setDate = async (scope, id, value) => {
    const input = scope.locator(`#${id}`);
    await input.fill(value);
    await input.press('Enter');
    await input.blur();
    await expect(input).toHaveValue(value);
  };
  await setDate(dialog, 'startDate', '2099-11-03');
  await setDate(dialog, 'endDate', '2099-11-10');
  const confirm = dialog.getByRole('button', { name: '确认重排', exact: true });
  await dialog.getByRole('button', { name: /生成预览/ }).click();
  await expect(confirm).toBeEnabled();
  await setDate(dialog, 'endDate', '2099-11-17');
  await expect(confirm).toBeDisabled();
  await expect(dialog.getByRole('button', { name: /生成预览/ })).toBeVisible();
  assert.equal(writes.filter(row => row.path.endsWith('/generate')).length, 0);
  await dialog.getByRole('button', { name: /生成预览/ }).click();
  await expect(confirm).toBeEnabled();
  const generatedResponse = page.waitForResponse(response => new URL(response.url()).pathname === '/api/schedules/class-rules/generate' && response.request().method() === 'POST');
  await confirm.click();
  const generated = await generatedResponse;
  assert(generated.ok(), `Real generation failed: ${generated.status()}`);
  const generatedPayload = generated.request().postDataJSON();
  assert.equal(generatedPayload.startDate, '2099-11-03');
  assert.equal(generatedPayload.endDate, '2099-11-17');
  assert(generatedPayload.expectedClassUpdatedAt, 'Class version must be bound to preview');
  await expect(dialog).not.toBeVisible();
  const classRow = page.getByRole('row').filter({ has: page.getByRole('button', { name: className, exact: true }) });
  await classRow.getByRole('button', { name: /学员名单/ }).click();
  const list = page.getByRole('dialog', { name: new RegExp(`${className}.*学员名单`) });
  await list.getByRole('row').filter({ hasText: studentName }).getByRole('button', { name: '移除', exact: true }).click();
  const remove = page.getByRole('dialog', { name: `移除学员 · ${studentName}`, exact: true });
  await setDate(remove, 'expectedRecallDate', '2099-12-01');
  const removedResponse = page.waitForResponse(response => /\/api\/enrollments\/[^/]+\/remove-as-lost$/.test(new URL(response.url()).pathname) && response.request().method() === 'POST');
  await remove.getByRole('button', { name: /确认移除/ }).click();
  const removed = await removedResponse;
  assert(removed.ok(), `Real removal failed: ${removed.status()}`);
  assert.deepEqual(removed.request().postDataJSON(), { deleteReason: '时间问题', expectedRecallDate: '2099-12-01' });
  await expect(remove).not.toBeVisible();
  assert.equal(writes.filter(row => row.path.endsWith('/generate')).length, 1);
  assert.equal(writes.filter(row => row.path.endsWith('/remove-as-lost')).length, 1);
  assert.equal(writes.filter(row => row.method === 'PUT' && /^\/api\/(students|enrollments)\//.test(row.path)).length, 0);
  assert.deepEqual(external, []);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ status: 'PASS', realBackend: true, generatedRange: { startDate: generatedPayload.startDate, endDate: generatedPayload.endDate }, atomicRemovalPosts: 1, externalRequests: 0, browserErrors: 0 }));
} finally {
  await browser?.close();
  await server?.close();
}
