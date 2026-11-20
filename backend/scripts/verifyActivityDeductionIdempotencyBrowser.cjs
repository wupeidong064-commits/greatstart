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
const output = path.join(root, 'docs/acceptance/2026-11-09-activity-deduction');
fs.mkdirSync(output, { recursive: true });
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'activity-deduction-browser-'));
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
  fs.cpSync(path.join(backend, 'prisma'), path.join(scratch, 'prisma'), { recursive: true, dereference: true });
  assert.equal(env.DATABASE_URL,env.DATABASE_DIRECT_URL);assert.notEqual(pgPort,'5432');assert.ok(env.DATABASE_URL.includes(database));
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
  const student = await db.student.create({data:{organizationId:org.id,campusId:campus.id,name:'幂等活动测试学员',purchasedLessons:10,remainingLessons:10,consumedLessons:0,lastClassDate:new Date('2026-01-02T03:00:00Z')}});
  const initialLastClassDate=student.lastClassDate.toISOString();
  const balance=async(expected,logs)=>{
    const current=await db.student.findUniqueOrThrow({where:{id:student.id}});
    assert.equal(current.remainingLessons,expected); assert.equal(current.consumedLessons,10-expected);
    assert.equal(current.lastClassDate.toISOString(),initialLastClassDate);
    assert.equal(await db.lessonLog.count({where:{studentId:student.id}}),logs);
    assert.equal(await db.attendance.count({where:{studentId:student.id}}),0);
  };
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
  const activityPath='/api/lesson-logs/activity-deduct';
  const open=async()=>{
    await page.goto(base+'/students',{waitUntil:'networkidle'});
    await page.getByRole('row').filter({has:page.getByText(student.name,{exact:true})}).locator('button').filter({hasText:/划\s*课/}).click();
    const modal=page.getByRole('dialog',{name:'划课 - '+student.name,exact:true});
    await expect(modal).toBeVisible(); return modal;
  };
  let lostBody;
  let dropNext=true;
  await page.route('**'+activityPath,async route=>{
    if(dropNext){dropNext=false;lostBody=route.request().postDataJSON();report.requests.push({pathname:activityPath,body:lostBody});
      const response=await route.fetch();assert.equal(response.status(),200);await balance(8,1);await route.abort('failed');
    }else{report.requests.push({pathname:activityPath,body:route.request().postDataJSON()});await route.continue();}
  });
  let modal=await open();
  await modal.getByText('活动划课',{exact:true}).click();
  await modal.locator('#activityLessons').fill('2');
  await modal.locator('#activityNotes').fill('隔离活动重试验证');
  await modal.getByRole('button',{name:/确.*定|确认活动划课/}).click();
  await expect.poll(()=>Boolean(lostBody)).toBe(true);
  await expect(modal.getByRole('button',{name:/重试/})).toBeEnabled();
  await balance(8,1); await shot('committed-response-lost');
  check('UI request commits 10→8 despite lost response; no attendance/date change',{body:lostBody});
  await page.reload({waitUntil:'networkidle'}); modal=await open();
  await expect(modal.getByRole('button',{name:/重试/})).toBeVisible();
  const recovered=page.waitForResponse(r=>new URL(r.url()).pathname===activityPath && r.request().method()==='POST');
  await modal.getByRole('button',{name:/重试/}).click();assert.equal((await recovered).status(),200);
  await expect(modal).not.toBeVisible(); await balance(8,1);
  assert.deepEqual(report.requests.at(-1).body,lostBody);
  check('Reload and reopen restore pending operation; retry reuses identical body and keeps balance/log',{remaining:8,logs:1});
  await shot('recovered-once');
  // The browser fetch below crosses the actual Vite proxy and HTTP server; no response is stubbed.
  const login=await http('POST','/auth/login',null,{account:manager.email,email:manager.email,password});
  const token=login.data.data.token||login.data.data.accessToken;sensitiveValues.push(token);
  const browserPost=async(body,auth=token)=>page.evaluate(async({body,auth})=>{
    const response=await fetch('/api/lesson-logs/activity-deduct',{method:'POST',headers:{'Content-Type':'application/json',...(auth?{Authorization:'Bearer '+auth}:{})},body:JSON.stringify(body)});
    return {status:response.status,body:await response.json()};
  },{body,auth});
  const keyField=Object.keys(lostBody).find(k=>!['studentId','lessons','notes'].includes(k));assert.ok(keyField,'request must contain idempotency key');
  const concurrentStudent=await db.student.create({data:{organizationId:org.id,campusId:campus.id,name:'并发首写学员',purchasedLessons:10,remainingLessons:10}});
  const concurrentBody={...lostBody,studentId:concurrentStudent.id,[keyField]:randomUUID()};
  const parallel=await Promise.all(Array.from({length:5},()=>browserPost(concurrentBody)));
  assert.ok(parallel.every(r=>r.status===200),JSON.stringify(parallel));
  const concurrentBalance=await db.student.findUniqueOrThrow({where:{id:concurrentStudent.id}});
  assert.equal(concurrentBalance.remainingLessons,8);assert.equal(concurrentBalance.consumedLessons,2);
  assert.equal(await db.lessonLog.count({where:{studentId:concurrentStudent.id}}),1);
  assert.equal(await db.attendance.count({where:{studentId:concurrentStudent.id}}),0);assert.equal(concurrentBalance.lastClassDate,null);
  check('Five concurrent fresh-key requests all succeed and deduct once',{statuses:parallel.map(r=>r.status),remaining:8,logs:1});
  const conflict=await browserPost({...lostBody,lessons:3});assert.equal(conflict.status,409);await balance(8,1);
  check('Same key with different lessons conflicts without mutation',conflict);
  modal=await open();await modal.getByText('活动划课',{exact:true}).click();await modal.locator('#activityLessons').fill('2');await modal.locator('#activityNotes').fill('隔离活动第二笔');
  const second=page.waitForResponse(r=>new URL(r.url()).pathname===activityPath && r.request().method()==='POST');
  await modal.getByRole('button',{name:/确.*定|确认活动划课/}).click();assert.equal((await second).status(),200);await expect(modal).not.toBeVisible();await balance(6,2);
  const secondBody=report.requests.at(-1).body;assert.notEqual(JSON.stringify(secondBody),JSON.stringify(lostBody));
  assert.notEqual(secondBody[keyField],lostBody[keyField]);
  check('New UI operation obtains a new key and deducts another two lessons',{firstKey:lostBody[keyField],secondKey:secondBody[keyField],remaining:6,logs:2});
  const insufficientBody={...secondBody,[keyField]:randomUUID(),lessons:7};
  const insufficient=await browserPost(insufficientBody);assert.equal(insufficient.status,409);await balance(6,2);
  check('Insufficient balance rolls back balances and log',insufficient);
  const anonymous=await browserPost({...secondBody,[keyField]:randomUUID()},null);assert.equal(anonymous.status,401);
  for(const user of [coach,outsider]){
    const auth=await http('POST','/auth/login',null,{account:user.email,email:user.email,password});const deniedToken=auth.data.data.token||auth.data.data.accessToken;sensitiveValues.push(deniedToken);
    const denied=await browserPost({...secondBody,[keyField]:randomUUID()},deniedToken);assert.equal(denied.status,403);await balance(6,2);
  }
  check('Anonymous, coach and foreign organization writes denied; no mutation',{remaining:6,logs:2});
  await shot('final-balances');assert.deepEqual(report.pageErrors,[]);assert.deepEqual(report.blockedExternalRequests,[]);
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
