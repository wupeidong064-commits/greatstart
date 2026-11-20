'use strict';
// Real Chromium UI -> isolated real HTTP -> disposable PostgreSQL; no API response mocking.
// Only fixture setup writes directly to Prisma. Business mutations must originate in the UI.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const net = require('node:net');
const { pathToFileURL } = require('node:url');
const { randomUUID, randomBytes } = require('node:crypto');
const { spawn, execFileSync } = require('node:child_process');
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const backend = path.resolve(__dirname, '..');
const root = path.dirname(backend), frontend = path.join(root, 'frontend');
const { chromium, expect } = require(require.resolve('@playwright/test', { paths: [frontend] }));
const runId = new Date().toISOString().replace(/[:.]/g, '-') + '-' + randomBytes(3).toString('hex');
const output = path.join(root, 'docs/acceptance/2026-11-07-class-course-type');
fs.mkdirSync(output, { recursive: true });
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'class-course-browser-'));
const database = 'class_course_browser_' + randomBytes(8).toString('hex');
assert.match(database, /^class_course_browser_[0-9a-f]{16}$/);
const pgUser = process.env.CORE_TEST_PGUSER || os.userInfo().username;
const pgPort = process.env.CORE_TEST_PGPORT || '5432';
assert.match(pgPort, /^\d+$/);
const pgPassword = process.env.CORE_TEST_PGPASSWORD || '';
const databaseUrl = `postgresql://${encodeURIComponent(pgUser)}${pgPassword ? ':' + encodeURIComponent(pgPassword) : ''}@127.0.0.1:${pgPort}/${database}`;
const env = {
  PATH: process.env.PATH, HOME: os.homedir(), TMPDIR: os.tmpdir(),
  PGHOST: '127.0.0.1', PGPORT: pgPort, PGUSER: pgUser, PGPASSWORD: pgPassword,
  DATABASE_URL: databaseUrl, DATABASE_DIRECT_URL: databaseUrl,
  JWT_SECRET: randomBytes(48).toString('hex'), NODE_ENV: 'test', AI_PROVIDER: 'mock',
  ENABLE_MCP: 'false', ENABLE_SWAGGER: 'false', DOTENV_CONFIG_PATH: path.join(scratch, 'no-business-env'),
  ARK_API_KEY: '', GLM_API_KEY: '', };
const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
const report = { runId, startedAt: new Date().toISOString(), status: 'running', isolatedDatabase: database,
  isolation: { disposablePostgres: true, sterileBackendCwd: true, whitelistEnvironment: true, aiProvider: 'mock', apiResponsesMocked: false, realUiLogin: true },
  checks: [], requests: [], responses: [], capabilityProbes: [], screenshots: [], pageErrors: [], blockedExternalRequests: [], cleanup: {} };
const sensitiveValues = [];
const safe = value => sensitiveValues.reduce((text, secret) => text.split(secret).join('[REDACTED_FIXTURE_SECRET]'), String(value));
let server, ui, browser, page, created = false, loggedIn = false, serverOutput = '';
let weeklyCourseReads = 0, weeklyWatching = false;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const check = (name, evidence) => { report.checks.push({ name, passed: true, evidence }); console.log('PASS: ' + name); };
const run = (command, args) => execFileSync(command, args, { cwd: scratch, env, stdio: 'pipe', timeout: 120000 });
async function freePort() { const socket = net.createServer(); await new Promise(r => socket.listen(0, '127.0.0.1', r)); const port = socket.address().port; await new Promise(r => socket.close(r)); return [3000, 5173].includes(port) ? freePort() : port; }
async function shot(label) { const title = page.locator('.ant-modal:visible .ant-modal-title').last(); if (await title.count()) await title.click(); await expect(page.locator('.ant-picker-dropdown:visible, .ant-select-dropdown:visible')).toHaveCount(0); const file = `browser-${runId}-${label}.png`; await page.screenshot({ path: path.join(output, file), fullPage: false }); report.screenshots.push(file); }
async function choose(dialog, id, text) {
  await dialog.locator('.ant-select').filter({ has: page.locator('#' + id) }).locator('.ant-select-selector').click();
  const option = page.locator('.ant-select-dropdown:visible .ant-select-item-option-content').getByText(text, { exact: true });
  await expect(option).toBeVisible(); await option.click();
}
async function fillRange(dialog, id, first, second) {
  const inputs = dialog.locator('.ant-picker').filter({ has: page.locator('#' + id) }).locator('input');
  await inputs.nth(0).fill(first); await inputs.nth(0).press('Enter');
  await inputs.nth(1).fill(second); await inputs.nth(1).press('Enter');
  await dialog.locator('.ant-modal-title').click();
  await expect(page.locator('.ant-picker-dropdown:visible')).toHaveCount(0);
}
async function save(dialog, pathname) {
  const waiting = page.waitForResponse(r => new URL(r.url()).pathname === '/api' + pathname && r.request().method() === 'POST');
  await dialog.getByRole('button', { name: /^确\s*定$|^保\s*存$/ }).click();
  const response = await waiting;
  const body = await response.json();
  report.responses.push({ pathname: '/api' + pathname, status: response.status(), success: body.success });
  assert.equal(response.status(), 201, JSON.stringify(body));
  assert.equal(body.success, true, JSON.stringify(body));
  await expect(dialog).not.toBeVisible();
  return body.data;
}
function assertNoCourseId(body) { assert.ok(!Object.prototype.hasOwnProperty.call(body, 'courseId'), 'Browser POST must omit courseId'); }
async function openWeekly(base, className, defaultTeacherName) {
  weeklyWatching = true;
  await page.goto(base + '/operation/weekly-schedule', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: '新增排课', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '新增排课', exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('#courseId')).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: '课程类型设置' })).toHaveCount(0);
  await expect(dialog.getByText(/暂无可用课程/)).toHaveCount(0);
  await choose(dialog, 'classId', className);
  await expect(dialog.locator('.ant-select').filter({ has: page.locator('#teacherId') })).toContainText(defaultTeacherName);
  return dialog;
}
async function main() {
  run('createdb', [database]); created = true;
  fs.cpSync(path.join(backend, 'prisma'), path.join(scratch, 'prisma'), { recursive: true });
  run(process.execPath, [path.join(backend, 'node_modules/prisma/build/index.js'), 'migrate', 'deploy', '--schema', path.join(scratch, 'prisma/schema.prisma')]);
  assert.equal((await db.$queryRaw`SELECT current_database() AS name`)[0].name, database);
  const org = await db.organization.create({ data: { name: '班级类型浏览器隔离机构', code: database } });
  const campus = await db.campus.create({ data: { organizationId: org.id, name: '隔离校区', code: 'MAIN' } });
  const password = randomUUID(); sensitiveValues.push(password);
  const manager = await db.user.create({ data: { name: '隔离管理员', email: randomUUID() + '@isolated.test', password: await bcrypt.hash(password, 10), role: 'manager', organizationId: org.id, campusId: campus.id } });
  const teacher = await db.user.create({ data: { name: '隔离负责老师', email: randomUUID() + '@isolated.test', password: 'fixture-only-no-login', role: 'coach', organizationId: org.id, campusId: campus.id } });
  const substitute = await db.user.create({ data: { name: '隔离代课老师', email: randomUUID() + '@isolated.test', password: 'fixture-only-no-login', role: 'coach', organizationId: org.id, campusId: campus.id } });
  const legacy = await db.class.create({ data: { organizationId: org.id, campusId: campus.id, name: '旧绘画班', code: 'LEGACY', courseType: '绘画', teacherId: teacher.id, capacity: 20 } });
  assert.equal(await db.course.count(), 0);
  check('Fixture starts with legacy class and empty Course directory', { legacyCourseType: legacy.courseType, courseCount: 0 });
  const apiPort = await freePort(), webPort = await freePort();
  const base = `http://127.0.0.1:${webPort}`;
  report.ports = { backend: apiPort, frontend: webPort };
  env.PORT = String(apiPort); env.ALLOWED_ORIGINS = base;
  server = spawn(process.execPath, ['--import', path.join(backend, 'node_modules/tsx/dist/loader.mjs'), path.join(backend, 'src/index.ts')], { cwd: scratch, env, stdio: ['ignore', 'pipe', 'pipe'] });
  for (const pipe of [server.stdout, server.stderr]) pipe.on('data', value => { serverOutput = (serverOutput + value).slice(-10000); });
  let ready = false;
  for (let n = 0; n < 200; n++) { try { if ((await fetch(`http://127.0.0.1:${apiPort}/health`, { signal: AbortSignal.timeout(300) })).ok) { ready = true; break; } } catch {} if (server.exitCode !== null) break; await pause(100); }
  assert.ok(ready, 'Isolated backend failed to start');
  const viteModule = await import(pathToFileURL(require.resolve('vite', { paths: [frontend] })).href);
  const vite = viteModule.createServer ? viteModule : viteModule.default;
  const reactModule = await import(pathToFileURL(require.resolve('@vitejs/plugin-react', { paths: [frontend] })).href);
  const react = typeof reactModule.default === 'function' ? reactModule.default : reactModule.default.default;
  // No inherited frontend env or project Vite config. All browser API calls go to this run's backend.
  for (const key of Object.keys(process.env)) if (key.startsWith('VITE_')) delete process.env[key];
  ui = await vite.createServer({ root: frontend, configFile: false, envFile: false, envDir: scratch, cacheDir: path.join(scratch, 'vite-cache'), plugins: [react()],
    define: { 'import.meta.env.VITE_API_BASE': JSON.stringify('/api') }, logLevel: 'error',
    server: { host: '127.0.0.1', port: webPort, strictPort: true, hmr: false, proxy: { '/api': `http://127.0.0.1:${apiPort}` } } });
  await ui.listen();
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ serviceWorkers: 'block', timezoneId: 'Asia/Shanghai', viewport: { width: 1440, height: 1050 } });
  await context.route('**/*', route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== base) { report.blockedExternalRequests.push(url.origin + url.pathname); return route.abort(); }
    if (weeklyWatching && url.pathname === '/api/courses' && request.method() === 'GET') {
      if (url.searchParams.get('capability') === 'schedule_course_selection') report.capabilityProbes.push({ pathname: url.pathname, capability: url.searchParams.get('capability') });
      else weeklyCourseReads++;
    }
    if (request.method() === 'POST' && ['/api/courses', '/api/classes', '/api/schedules', '/api/schedules/recurring'].includes(url.pathname)) {
      report.requests.push({ pathname: url.pathname, method: request.method(), body: request.postDataJSON() });
    }
    return route.continue();
  });
  page = await context.newPage(); page.setDefaultTimeout(20000);
  page.on('pageerror', error => report.pageErrors.push(safe(error.message)));
  page.on('response', response => { if (response.status() >= 400) report.httpErrors = [...(report.httpErrors || []), { pathname: new URL(response.url()).pathname, status: response.status() }]; });
  await page.goto(base + '/login', { waitUntil: 'networkidle' });
  await page.getByLabel('手机号或邮箱', { exact: true }).fill(manager.email);
  await page.getByLabel('密码', { exact: true }).fill(password);
  const loginResponse = page.waitForResponse(r => new URL(r.url()).pathname === '/api/auth/login' && r.request().method() === 'POST');
  await page.getByRole('button', { name: '登录', exact: true }).click();
  assert.equal((await loginResponse).status(), 200);
  await expect(page).not.toHaveURL(/\/login$/); loggedIn = true;
  check('Manager logs in through the real login page', { role: 'manager', httpStatus: 200 });

  assert.equal(await db.course.count(), 0, 'No Course fixture or UI side effect may prepopulate the legacy scheduling prerequisite');
  let dialog = await openWeekly(base, legacy.name, teacher.name);
  await expect(dialog).toContainText('课程类型：绘画');
  await dialog.locator('#lessonDate').fill('2027-02-24'); await dialog.locator('#lessonDate').press('Enter');
  await fillRange(dialog, 'lessonTime', '09:00', '10:30');
  await dialog.getByLabel('教室', { exact: true }).fill('隔离绘画教室');
  await shot('legacy-single-form');
  const singleData = await save(dialog, '/schedules');
  const single = await db.schedule.findUniqueOrThrow({ where: { id: singleData.id }, include: { course: true } });
  assert.equal(single.classId, legacy.id); assert.equal(single.teacherId, teacher.id);
  assert.equal(single.startTime.toISOString(), '2027-02-24T01:00:00.000Z'); assert.equal(single.endTime.toISOString(), '2027-02-24T02:30:00.000Z');
  assert.equal(single.classroom, '隔离绘画教室'); assert.equal(single.course?.name, '绘画'); assert.equal(single.course?.organizationId, org.id);
  assert.equal(await db.course.count(), 1); assert.equal(await db.schedule.count({ where: { classId: legacy.id } }), 1);
  const singlePost = report.requests.find(r => r.pathname === '/api/schedules'); assert.ok(singlePost); assertNoCourseId(singlePost.body);
  assert.equal(weeklyCourseReads, 0); weeklyWatching = false;
  check('Legacy class schedules once with default teacher and inherited Course despite empty directory', { request: singlePost.body, courseName: single.course.name, startsAt: single.startTime.toISOString(), endsAt: single.endTime.toISOString(), weeklyCourseListApiReads: weeklyCourseReads });

  await page.goto(base + '/classes', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: '课程类型设置', exact: true }).click();
  const settings = page.getByRole('dialog', { name: '课程类型设置', exact: true });
  await settings.getByRole('button', { name: '新建课程类型', exact: true }).click();
  const createType = page.getByRole('dialog', { name: '新建课程类型', exact: true });
  await createType.getByLabel('课程类型名称', { exact: true }).fill('书法');
  await save(createType, '/courses');
  await expect(settings.getByRole('cell', { name: '书法', exact: true })).toBeVisible();
  const savedType = await db.course.findFirstOrThrow({ where: { organizationId: org.id, name: '书法' } });
  await shot('course-type-settings');
  await settings.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: /新增班级/ }).click();
  dialog = page.getByRole('dialog', { name: '新增班级', exact: true });
  await dialog.getByLabel('班级名称', { exact: true }).fill('书法新班');
  await dialog.getByLabel('班级代码', { exact: true }).fill('CALLIGRAPHY');
  await choose(dialog, 'teacherId', teacher.name); await choose(dialog, 'courseType', '书法');
  await dialog.getByLabel('容量', { exact: true }).fill('12');
  await shot('new-class-form');
  const newClassData = await save(dialog, '/classes');
  const newClass = await db.class.findUniqueOrThrow({ where: { id: newClassData.id } });
  assert.equal(newClass.name, '书法新班'); assert.equal(newClass.courseType, '书法'); assert.equal(newClass.teacherId, teacher.id); assert.equal(newClass.capacity, 12);
  assert.equal(await db.schedule.count({ where: { classId: newClass.id } }), 0);
  check('Classes settings saves new course type and class selects its name', { courseId: savedType.id, classId: newClass.id, courseType: newClass.courseType, scheduleCountAfterClassSave: 0 });

  dialog = await openWeekly(base, newClass.name, teacher.name);
  await expect(dialog).toContainText('课程类型：书法');
  await choose(dialog, 'teacherId', substitute.name);
  await dialog.getByLabel('每周重复', { exact: true }).check();
  await fillRange(dialog, 'dateRange', '2027-03-03', '2027-03-10');
  await dialog.getByLabel('周三', { exact: true }).focus();
  await dialog.getByLabel('周三', { exact: true }).press('Space');
  await expect(dialog.getByLabel('周三', { exact: true })).toBeChecked();
  await fillRange(dialog, 'lessonTime', '18:00', '19:30');
  await dialog.getByLabel('教室', { exact: true }).fill('隔离书法教室');
  await shot('weekly-substitute-form');
  await save(dialog, '/schedules/recurring');
  const weekly = await db.schedule.findMany({ where: { classId: newClass.id }, include: { course: true }, orderBy: { startTime: 'asc' } });
  report.persistedWeekly = weekly.map(s => ({ id: s.id, classId: s.classId, teacherId: s.teacherId, courseId: s.courseId, courseName: s.course?.name, classroom: s.classroom, startTime: s.startTime.toISOString(), endTime: s.endTime.toISOString(), isRecurring: s.isRecurring }));
  assert.equal(weekly.length, 2);
  assert.deepEqual(weekly.map(s => s.startTime.toISOString()), ['2027-03-03T10:00:00.000Z', '2027-03-10T10:00:00.000Z']);
  assert.deepEqual(weekly.map(s => s.endTime.toISOString()), ['2027-03-03T11:30:00.000Z', '2027-03-10T11:30:00.000Z']);
  // Existing recurring endpoint persists concrete occurrences; isRecurring metadata is observed above, not a new contract.
  for (const occurrence of weekly) {
    assert.equal(occurrence.teacherId, substitute.id, 'Recurring occurrence substitute teacher');
    assert.equal(occurrence.courseId, savedType.id, 'Recurring occurrence uses the selected class type Course');
    assert.equal(occurrence.course?.name, '书法', 'Recurring occurrence course name');
    assert.equal(occurrence.classroom, '隔离书法教室', 'Recurring occurrence classroom');
  }
  assert.equal((await db.class.findUniqueOrThrow({ where: { id: newClass.id } })).teacherId, teacher.id, 'Substitute must not change class responsible teacher');
  assert.equal(await db.course.count({ where: { organizationId: org.id, name: '书法' } }), 1);
  const weeklyPost = report.requests.find(r => r.pathname === '/api/schedules/recurring'); assert.ok(weeklyPost); assertNoCourseId(weeklyPost.body);
  assert.equal(weeklyCourseReads, 0); weeklyWatching = false;
  await shot('weekly-saved');
  check('Weekly UI generates exactly two Shanghai-time lessons with inherited type and substitute teacher', { request: weeklyPost.body, courseName: '书法', startsAt: weekly.map(s => s.startTime.toISOString()), endsAt: weekly.map(s => s.endTime.toISOString()), classTeacherUnchanged: true, weeklyCourseListApiReads: weeklyCourseReads });
  assert.deepEqual(report.pageErrors, []); assert.deepEqual(report.blockedExternalRequests, []);
  assert.equal(report.requests.length, 4, 'Exactly one course, one class, one single schedule and one recurring mutation');
  report.status = 'passed';
}
async function cleanup() {
  try { if (browser) await browser.close(); report.cleanup.browserClosed = true; } catch (e) { report.cleanup.browserError = e.message; }
  try { if (ui) { ui.httpServer?.closeAllConnections?.(); await ui.close(); } report.cleanup.frontendClosed = true; } catch (e) { report.cleanup.frontendError = e.message; }
  try {
    if (server && server.exitCode === null && server.signalCode === null) {
      const exited = new Promise(resolve => server.once('exit', resolve)); server.kill('SIGTERM'); await Promise.race([exited, pause(3000)]);
      if (server.exitCode === null && server.signalCode === null) { server.kill('SIGKILL'); await exited; }
    }
    report.cleanup.backendClosed = !server || server.exitCode !== null || server.signalCode !== null;
  } catch (e) { report.cleanup.backendError = e.message; }
  await db.$disconnect();
  try { if (created) run('dropdb', ['--if-exists', '--force', database]); report.cleanup.databaseDropped = true; } catch (e) { report.cleanup.databaseError = e.message; }
  try { fs.rmSync(scratch, { recursive: true, force: true }); report.cleanup.scratchRemoved = !fs.existsSync(scratch); } catch (e) { report.cleanup.scratchError = e.message; }
  if (Object.keys(report.cleanup).some(key => key.endsWith('Error')) || report.cleanup.backendClosed !== true) { report.status = 'failed'; process.exitCode = 1; }
  report.finishedAt = new Date().toISOString();
  const destination = path.join(output, `browser-${runId}-report.json`); fs.writeFileSync(destination, safe(JSON.stringify(report, null, 2)) + '\n'); console.log('REPORT ' + destination);
}
main().catch(async error => {
  report.status = 'failed'; report.failure = { message: safe(error.message), stack: safe(error.stack) }; process.exitCode = 1;
  console.error(safe(error.message));
  if (loggedIn && page) { try { await shot('failure'); } catch {} }
}).finally(cleanup);
