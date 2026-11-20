// Isolated real React UI, mock APIs only; no .env, database, or original project access.
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { chromium, expect } from '@playwright/test';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let server, browser;
const original = { id: 'course-1', name: '篮球', code: 'EXISTING_CODE', duration: 90, price: 888, isActive: true };
const courses = [{ ...original }];
const mutations = [];
let fail = false;
try {
  server = await createServer({ root, configFile: false, envFile: false, plugins: [react(), {
    name: 'course-settings-test', configureServer(s) { s.middlewares.use('/__course-test', async (_req, res) => {
      res.setHeader('Content-Type', 'text/html');
      res.end(await s.transformIndexHtml('/__course-test', `<div id="root"></div><script type="module">
import React from 'react';
import { createRoot } from 'react-dom/client';
import CourseTypeSettings from '/src/components/CourseTypeSettings.tsx';
import { useAuthStore } from '/src/store/authStore.ts';
useAuthStore.setState({ user: { role: 'admin' } });
window.changed = 0;
createRoot(document.getElementById('root')).render(React.createElement(CourseTypeSettings, {onChanged: () => {window.changed++}}));
</script>`));
    }); }
  }], define: { 'import.meta.env.VITE_API_BASE': JSON.stringify('/api') }, server: { host: '127.0.0.1', port: 0, hmr: false, proxy: {} }, logLevel: 'error' });
  await server.listen();
  const base = `http://127.0.0.1:${server.httpServer.address().port}`;
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage();
  page.setDefaultTimeout(15000);
  // Reproduce the browser capability missing in insecure LAN contexts.
  await page.addInitScript(() => Object.defineProperty(crypto, 'randomUUID', { value: undefined, configurable: true }));
  page.on("pageerror", error => console.error("PAGEERROR", error));
  page.on("console", msg => { if (msg.type() === "error") console.error(msg.text()); });
  await page.route('**/*', async route => {
    const req = route.request(), url = new URL(req.url());
    if (url.origin !== base) return route.abort();
    if (!url.pathname.startsWith('/api')) return route.continue();
    assert(url.pathname.startsWith('/api/courses'));
    const reply = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (req.method() === 'GET') {
      assert.equal(url.searchParams.get('pageSize'), '20');
      return reply({ success: true, data: courses, pagination: { total: courses.length } });
    }
    const body = req.postDataJSON(); mutations.push(body);
    if (fail) { fail = false; return reply({ success: false, error: {message: '隔离模拟保存失败'} }, 500); }
    if (req.method() === 'POST') courses.push({ ...body, code: 'SERVER_GENERATED_CODE', duration: 60, price: 0, id: 'course-2', isActive: true });
    else Object.assign(courses.find(c => c.id === url.pathname.split('/').pop()), body);
    return reply({ success: true, data: courses[0] });
  });
  await page.goto(`${base}/__course-test`);
  await page.getByRole('button', { name: '课程类型设置', exact: true }).click();
  const settings = page.getByRole('dialog', { name: '课程类型设置', exact: true });
  const row = () => settings.getByRole('row').filter({ hasText: courses[0].name });
  await row().getByRole('button', { name: /改\s*名/ }).click();
  let editor = page.getByRole('dialog', { name: '课程类型改名' });
  await editor.getByLabel('课程类型名称').fill('篮球进阶');
  await editor.getByRole('button', { name: /保\s*存/ }).click();
  await expect(editor).not.toBeVisible();
  assert.deepEqual(mutations.at(-1), { name: '篮球进阶' });
  assert.equal(courses[0].code, original.code); assert.equal(courses[0].duration, 90); assert.equal(courses[0].price, 888);
  await row().getByRole('button', { name: /停\s*用/, exact: true }).click();
  await expect(row().getByRole('button', { name: /启\s*用/, exact: true })).toBeVisible();
  assert.equal(courses.length, 1); assert.equal(courses[0].isActive, false);
  await row().getByRole('button', { name: /启\s*用/, exact: true }).click();
  await expect(row().getByRole('button', { name: /停\s*用/, exact: true })).toBeVisible();
  await settings.getByRole('button', { name: '新建课程类型' }).click();
  editor = page.getByRole('dialog', { name: '新建课程类型', exact: true });
  await editor.getByLabel('课程类型名称').fill('体适能');
  await editor.getByRole('button', { name: /保\s*存/ }).click();
  await expect(editor).not.toBeVisible();
  assert.equal(await page.evaluate(() => typeof crypto.randomUUID), 'undefined');
  assert.deepEqual(mutations.at(-1), { name: '体适能' });
  assert.equal(courses[1].code, 'SERVER_GENERATED_CODE'); assert.notEqual(courses[1].code, original.code);
  await row().getByRole('button', { name: /改\s*名/ }).click();
  editor = page.getByRole('dialog', { name: '课程类型改名' });
  await editor.getByLabel('课程类型名称').fill('失败改名'); fail = true;
  await editor.getByRole('button', { name: /保\s*存/ }).click();
  await expect(page.getByText('隔离模拟保存失败', { exact: true })).toBeVisible();
  await expect(editor).toBeVisible();
  assert.equal(courses[0].name, '篮球进阶'); assert.equal(await page.evaluate(() => window.changed), 4);
  console.log('PASS: create via server code generation with crypto.randomUUID unavailable; rename preserves code/price/duration; disable and enable preserve record; failed save keeps editor and does not refresh success.');
} finally { await browser?.close(); await server?.close(); }
