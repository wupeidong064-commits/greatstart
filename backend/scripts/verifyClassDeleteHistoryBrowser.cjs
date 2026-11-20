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
const output = path.join(root, 'docs/acceptance/2026-11-07-class-delete-history');
fs.mkdirSync(output, { recursive: true });
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'class-delete-browser-'));
const database = 'class_course_browser_' + randomBytes(8).toString('hex');
assert.match(database, /^class_course_browser_[0-9a-f]{16}$/);
const pgUser = process.env.CORE_TEST_PGUSER || os.userInfo().username;
let pgPort;

const pgPassword = process.env.CORE_TEST_PGPASSWORD || '';
let databaseUrl = `postgresql://${encodeURIComponent(pgUser)}${pgPassword ? ':' + encodeURIComponent(pgPassword) : ''}@127.0.0.1:${pgPort}/${database}`;
const env = {
  LC_ALL: 'C', LANG: 'C', PATH: process.env.PATH, HOME: os.homedir(), TMPDIR: os.tmpdir(),
  PGHOST: '127.0.0.1', PGPORT: pgPort, PGUSER: pgUser, PGPASSWORD: pgPassword,
  DATABASE_URL: databaseUrl, DATABASE_DIRECT_URL: databaseUrl,
  JWT_SECRET: randomBytes(48).toString('hex'), NODE_ENV: 'test', AI_PROVIDER: 'mock',
  ENABLE_MCP: 'false', ENABLE_SWAGGER: 'false', DOTENV_CONFIG_PATH: path.join(scratch, 'no-business-env'),
  ARK_API_KEY: '', GLM_API_KEY: '', };
let db, pgStarted = false;
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
  pgPort = String(await freePort());
  env.PGPORT = pgPort;
  databaseUrl = `postgresql://${encodeURIComponent(pgUser)}@127.0.0.1:${pgPort}/${database}`;
  env.DATABASE_URL = env.DATABASE_DIRECT_URL = databaseUrl;
  const pgData = path.join(scratch, 'pgdata');
  run('initdb', ['-D', pgData, '-A', 'trust', '--no-locale', '-E', 'UTF8']);
  try { run('pg_ctl', ['-D', pgData, '-l', path.join(scratch, 'postgres.log'), '-o', `-h 127.0.0.1 -p ${pgPort} -k /tmp`, '-w', 'start']); pgStarted = true; } catch (e) { throw new Error(e.message+' '+fs.readFileSync(path.join(scratch, 'postgres.log'), 'utf8')); }
  run('createdb', [database]); created = true;
  db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  fs.cpSync(path.join(backend, 'prisma'), path.join(scratch, 'prisma'), { recursive: true });
  run(process.execPath, [path.join(backend, 'node_modules/prisma/build/index.js'), 'migrate', 'deploy', '--schema', path.join(scratch, 'prisma/schema.prisma')]);
  assert.equal((await db.$queryRaw`SELECT current_database() AS name`)[0].name, database);
  report.ports = { postgres: pgPort };
  const org = await db.organization.create({ data: { name: '永久删除隔离机构', code: database } });
  const campus = await db.campus.create({ data: { organizationId: org.id, name: '隔离校区', code: 'MAIN' } });
  const password = randomUUID(); sensitiveValues.push(password);
  const hash = await bcrypt.hash(password, 10);
  const account = (role, organizationId=org.id, campusId=campus.id) => db.user.create({ data: { name: role, email: randomUUID()+'@isolated.test', password: hash, role, organizationId, campusId } });
  const manager = await account('manager'), coach = await account('coach');
  const otherOrg = await db.organization.create({ data: { name: '外部隔离机构', code: randomUUID() } });
  const otherCampus = await db.campus.create({ data: { organizationId: otherOrg.id, name: '外部校区', code: 'MAIN' } });
  const outsider = await account('manager', otherOrg.id, otherCampus.id);
  const makeClass = name => db.class.create({ data: { organizationId: org.id, campusId: campus.id, name, code: randomUUID(), courseType: '篮球', teacherId: coach.id } });
  const empty = await makeClass('可永久删除空班'), linked = await makeClass('关联记录保护班'), toggle = await makeClass('停复课验证班');
  const student = await db.student.create({ data: { organizationId: org.id, campusId: campus.id, name: '隔离测试学员' } });
  const enrollment = await db.enrollment.create({ data: { organizationId: org.id, studentId: student.id, classId: linked.id, status: 'active' } });
  const schedule = await db.schedule.create({ data: { organizationId: org.id, campusId: campus.id, classId: linked.id, teacherId: coach.id, startTime: new Date('2026-01-01T01:00:00Z'), endTime: new Date('2026-01-01T02:00:00Z'), status: 'completed' } });
  const attendance = await db.attendance.create({ data: { organizationId: org.id, studentId: student.id, classId: linked.id, scheduleId: schedule.id, status: 'absent' } });
  const future = await db.schedule.create({data:{organizationId:org.id,campusId:campus.id,classId:linked.id,teacherId:coach.id,startTime:new Date('2030-01-01T01:00:00Z'),endTime:new Date('2030-01-01T02:00:00Z'),status:'scheduled'}});
  const payment = await db.payment.create({data:{organizationId:org.id,enrollmentId:enrollment.id,studentId:student.id,amount:1000,paymentType:'tuition',paymentMethod:'cash'}});
  const conversion = await db.conversion.create({data:{organizationId:org.id,studentId:student.id,studentName:student.name,contact:'13800000000',classId:linked.id,className:linked.name,conversionDate:'2026-01-01',approvalStatus:'confirmed',price:1000,totalLessons:10}});
  await db.student.update({where:{id:student.id},data:{purchasedLessons:10,consumedLessons:1,remainingLessons:9,totalPayment:1000}});
  const deduction=await db.lessonDeductionRecord.create({data:{organizationId:org.id,classId:linked.id,scheduleId:schedule.id,deductionDate:'2026-01-01'}});
  const snapshot=async()=>JSON.stringify(await Promise.all([db.enrollment.findUnique({where:{id:enrollment.id}}),db.schedule.findUnique({where:{id:schedule.id}}),db.attendance.findUnique({where:{id:attendance.id}}),db.payment.findUnique({where:{id:payment.id}}),db.conversion.findUnique({where:{id:conversion.id}}),db.student.findUnique({where:{id:student.id}}),db.lessonDeductionRecord.findUnique({where:{id:deduction.id}})]));
  const beforeLinked=await snapshot();
  const apiPort = await freePort(), webPort = await freePort();
  const base = `http://127.0.0.1:${webPort}`;
  Object.assign(report.ports, { backend: apiPort, frontend: webPort });
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

  const http = async (method, route, token, body) => {
    const response = await fetch(`http://127.0.0.1:${apiPort}/api${route}`, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer '+token } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const data = await response.json(); report.responses.push({ method, route, status: response.status, code: data?.error?.code }); return { response, data };
  };
  for (const user of [coach, outsider]) {
    const login = await http('POST', '/auth/login', null, { account: user.email, email: user.email, password });
    const token = login.data.data?.token || login.data.data?.accessToken;
    assert.ok(token, JSON.stringify(login.data)); sensitiveValues.push(token);
    const denied = (await http('DELETE', '/classes/'+empty.id, token)).response.status; assert.ok(user === coach ? denied === 403 : [403,404].includes(denied));
    assert.ok(await db.class.findUnique({ where: { id: empty.id } }));
  }
  assert.equal((await http('DELETE', '/classes/'+empty.id)).response.status, 401);
  check('Anonymous, coach and foreign organization cannot delete', { responses: report.responses.filter(r => r.method === 'DELETE') });
  await page.goto(base+'/classes', { waitUntil: 'networkidle' });
  const row = name => page.getByRole('row').filter({ has: page.getByText(name, { exact: true }) });
  await row(empty.name).getByRole('button', { name: '永久删除', exact: true }).click();
  let dialog = page.getByRole('dialog', { name: '确认永久删除', exact: true });
  await expect(dialog).toBeVisible(); await shot('delete-confirmation');
  await dialog.getByRole('button', { name: /^取\s*消$/ }).click();
  await expect(dialog).not.toBeVisible(); assert.ok(await db.class.findUnique({ where: { id: empty.id } }));
  check('Cancel permanent delete preserves empty class', { classId: empty.id });
  await row(empty.name).getByRole('button', { name: '永久删除', exact: true }).click();
  const deleted = page.waitForResponse(r => r.request().method()==='DELETE' && new URL(r.url()).pathname==='/api/classes/'+empty.id);
  await dialog.getByRole('button', { name: '确认永久删除', exact: true }).click(); assert.equal((await deleted).status(), 200);
  await expect(dialog).not.toBeVisible(); assert.equal(await db.class.findUnique({ where: { id: empty.id } }), null);
  await page.reload({ waitUntil: 'networkidle' }); await expect(row(empty.name)).toHaveCount(0);
  check('Confirmed permanent delete physically removes class and survives reload', { classId: empty.id });
  await row(linked.name).getByRole('button', { name: '永久删除', exact: true }).click();
  dialog = page.getByRole('dialog', { name: '确认永久删除', exact: true });
  await expect(dialog).toContainText('历史报名、考勤、课消和账务记录保留');
  const removed = page.waitForResponse(r => r.request().method()==='DELETE' && new URL(r.url()).pathname==='/api/classes/'+linked.id);
  await dialog.getByRole('button', { name: '确认永久删除', exact: true }).click(); assert.equal((await removed).status(),200);
  await expect(dialog).not.toBeVisible();
  await page.reload({waitUntil:'networkidle'}); await expect(row(linked.name)).toHaveCount(0);
  assert.equal((await db.class.findUniqueOrThrow({where:{id:linked.id}})).status,'deleted');
  assert.equal(await snapshot(),beforeLinked);
  assert.equal((await db.schedule.findUniqueOrThrow({where:{id:future.id}})).status,'cancelled');
  check('Browser deletion hides linked class; historical enrollment, attendance, payment, conversion, deduction and lesson balances remain byte-identical',{classId:linked.id,futureStatus:'cancelled'});
  const managerLogin=await http('POST','/auth/login',null,{account:manager.email,email:manager.email,password});
  const managerToken=managerLogin.data.data.token || managerLogin.data.data.accessToken; sensitiveValues.push(managerToken);
  const viaBrowser=async(route)=>{const response=await page.request.get(base+'/api'+route,{headers:{authorization:'Bearer '+managerToken}});assert.equal(response.status(),200,route);return response.json();};
  for(const route of ['/enrollments/'+enrollment.id,'/conversions/'+conversion.id]){const data=await viaBrowser(route);assert.ok(JSON.stringify(data).includes(linked.id),route);}
  const studentView=await viaBrowser('/students/'+student.id);assert.equal(studentView.data.enrollments.length,0);
  const filtered=await viaBrowser('/students?classId='+linked.id);assert.ok(!JSON.stringify(filtered).includes(student.id));
  for(const route of ['/classes?status=deleted','/classes?status=all']){const data=await viaBrowser(route);assert.ok(!JSON.stringify(data).includes(linked.id));}
  assert.equal((await http('GET','/classes/'+linked.id,managerToken)).response.status,404);
  assert.equal((await http('PUT','/classes/'+linked.id,managerToken,{status:'active'})).response.status,404);
  assert.equal((await http('DELETE','/classes/'+linked.id,managerToken)).response.status,404);
  assert.equal(await snapshot(),beforeLinked);
  check('Historical enrollment/conversion remain readable; student current class and deleted-class filter exclude class; direct restore and repeated deletion fail',{historicalReadStatus:200,restoreStatus:404});
  await shot('history-preserved');
  for (const [action, status] of [['停课', 'inactive'], ['复课', 'active']]) {
    await row(toggle.name).getByRole('button', { name: action, exact: true }).click();
    dialog = page.getByRole('dialog', { name: '确认'+action, exact: true });
    const saved = page.waitForResponse(r => r.request().method()==='PUT' && new URL(r.url()).pathname==='/api/classes/'+toggle.id);
    await dialog.getByRole('button', { name: '确认'+action, exact: true }).click(); assert.equal((await saved).status(), 200);
    await expect(dialog).not.toBeVisible(); assert.equal((await db.class.findUniqueOrThrow({ where: { id: toggle.id } })).status, status);
    await page.reload({ waitUntil: 'networkidle' }); await expect(row(toggle.name).getByRole('button', { name: action==='停课' ? '复课' : '停课', exact: true })).toBeVisible();
    check(action+' persists through actual HTTP, database and reload', { status });
  }
  await shot('final-classes'); assert.deepEqual(report.pageErrors, []); assert.deepEqual(report.blockedExternalRequests, []);
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
  if (db) await db.$disconnect();
  try { if (created) run('dropdb', ['--if-exists', '--force', database]); report.cleanup.databaseDropped = true; } catch (e) { report.cleanup.databaseError = e.message; }
  try { if (pgStarted) run('pg_ctl', ['-D', path.join(scratch, 'pgdata'), '-m', 'fast', '-w', 'stop']); report.cleanup.postgresStopped = true; } catch (e) { report.cleanup.postgresError = e.message; }
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
