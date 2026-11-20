'use strict';
// Real Chromium UI -> isolated real HTTP -> disposable PostgreSQL; no API response mocking.
// Fixture setup writes directly to Prisma. Class transitions use UI; adversarial probes use real HTTP.
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
const output = path.join(root, 'docs/acceptance/2026-11-07-class-suspension');
fs.mkdirSync(output, { recursive: true });
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'class-suspension-browser-'));
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
async function shot(label) { await expect(page.locator('.ant-picker-dropdown:visible, .ant-select-dropdown:visible')).toHaveCount(0); const file = `browser-${runId}-${label}.png`; await page.screenshot({ path: path.join(output, file), fullPage: false }); report.screenshots.push(file); }
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
  const toggle = await makeClass('停复课联动验证班'), occupying = await makeClass('占用释放时段班');
  const student = await db.student.create({data:{organizationId:org.id,campusId:campus.id,name:'停课测试学员',purchasedLessons:10,remainingLessons:10}});
  await db.enrollment.create({data:{organizationId:org.id,classId:toggle.id,studentId:student.id,enrolledAt:new Date('2020-01-01')}});
  const now = new Date(); const day = new Date(now); day.setUTCDate(day.getUTCDate()+8); day.setUTCHours(1,0,0,0);
  const slot = async (offset,status='scheduled') => db.schedule.create({data:{organizationId:org.id,campusId:campus.id,classId:toggle.id,teacherId:coach.id,classroom:'联动场地',startTime:new Date(+day+offset*3600000),endTime:new Date(+day+(offset+1)*3600000),status}});
  // Ordered IDs make the conflict happen after an earlier successful restoration, proving full rollback.
  const first=await slot(0), second=await slot(2), cancelled=await slot(4,'cancelled'), completed=await slot(6,'completed'), withHistory=await slot(8);
  const ordered=[first,second].sort((a,b)=>a.id.localeCompare(b.id)); const conflictTarget=ordered[1];
  const past=await db.schedule.create({data:{organizationId:org.id,campusId:campus.id,classId:toggle.id,teacherId:coach.id,startTime:new Date(+now-172800000),endTime:new Date(+now-169200000),status:'scheduled'}});
  const history=await db.attendance.create({data:{organizationId:org.id,classId:toggle.id,scheduleId:withHistory.id,studentId:student.id,status:'leave'}});
  const protectedSnapshot=async()=>JSON.stringify(await Promise.all([db.schedule.findUnique({where:{id:cancelled.id}}),db.schedule.findUnique({where:{id:completed.id}}),db.schedule.findUnique({where:{id:withHistory.id}}),db.schedule.findUnique({where:{id:past.id}}),db.attendance.findUnique({where:{id:history.id}}),db.student.findUnique({where:{id:student.id}})]));
  const beforeProtected=await protectedSnapshot();
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
  const login=await http('POST','/auth/login',null,{account:manager.email,email:manager.email,password});
  const token=login.data.data.token || login.data.data.accessToken; sensitiveValues.push(token);
  const row = name => page.getByRole('row').filter({has:page.getByText(name,{exact:true})});
  async function transition(action, expected=200) {
    await page.goto(base+'/classes',{waitUntil:'networkidle'});
    await row(toggle.name).getByRole('button',{name:action,exact:true}).click();
    const dialog=page.getByRole('dialog',{name:'确认'+action,exact:true});
    const waiting=page.waitForResponse(r=>r.request().method()==='PUT' && new URL(r.url()).pathname==='/api/classes/'+toggle.id);
    await dialog.getByRole('button',{name:'确认'+action,exact:true}).click();
    const response=await waiting; const body=await response.json();
    report.responses.push({action,status:response.status(),body}); assert.equal(response.status(),expected,JSON.stringify(body));
    if(expected===200) await expect(dialog).not.toBeVisible();
    return body;
  }
  for(const user of [coach,outsider]) {
    const result=await http('POST','/auth/login',null,{account:user.email,email:user.email,password});
    const t=result.data.data.token || result.data.data.accessToken; sensitiveValues.push(t);
    const denied=await http('PUT','/classes/'+toggle.id,t,{status:'inactive'});
    assert.ok([403,404].includes(denied.response.status));
  }
  assert.equal((await http('PUT','/classes/'+toggle.id,null,{status:'inactive'})).response.status,401);
  check('Anonymous, coach and foreign organization cannot pause another class',{});
  await transition('停课');
  assert.equal((await db.class.findUniqueOrThrow({where:{id:toggle.id}})).status,'inactive');
  for(const x of [first,second]) assert.equal((await db.schedule.findUniqueOrThrow({where:{id:x.id}})).status,'class_paused');
  assert.equal(await protectedSnapshot(),beforeProtected);
  check('Pause marks only untouched future scheduled lessons; completed, cancelled, past and attendance history unchanged',{});
  const date=x=>new Date(x).toISOString().slice(0,10);
  const listRoute='/schedules?startDate='+date(day)+'&endDate='+date(day)+'&pageSize=100';
  let result=await http('GET',listRoute,token); assert.equal(result.response.status,200);
  for(const x of [first,second,withHistory]) assert.ok(!JSON.stringify(result.data).includes(x.id));
  await page.goto(base+'/operation/weekly-schedule',{waitUntil:'networkidle'});
  // Fixture occurs eight days ahead; select its actual week using the same next-week UI.
  const startMonday=new Date(now); const weekday=(startMonday.getDay()+6)%7; startMonday.setDate(startMonday.getDate()-weekday);
  const weeks=Math.floor((+day-+startMonday)/604800000);
  for(let n=0;n<weeks;n++) await page.getByRole('button',{name:'下一周',exact:true}).click();
  await page.waitForLoadState('networkidle');
  await expect(page.getByText(toggle.name,{exact:true})).toHaveCount(0); await shot('paused-week-empty');
  check('Actual-date HTTP and weekly browser view hide paused future lessons including preserved attendance row',{date:date(day)});
  const balanceBefore=await protectedSnapshot(); const attendanceBefore=await db.attendance.count(); const logsBefore=await db.lessonLog.count();
  for(const x of [first,withHistory]) {
    assert.equal((await http('GET','/schedules/'+x.id+'/roster',token)).response.status,409);
    assert.equal((await http('POST','/attendances/batch',token,{scheduleId:x.id,entries:[{studentId:student.id,status:'present'}]})).response.status,409);
    assert.equal((await http('POST','/attendances',token,{scheduleId:x.id,studentId:student.id,status:'present'})).response.status,409);
  }
  assert.equal(await protectedSnapshot(),balanceBefore); assert.equal(await db.attendance.count(),attendanceBefore); assert.equal(await db.lessonLog.count(),logsBefore);
  check('Paused lessons reject roster, single and batch attendance with zero lesson-balance or ledger mutation',{});
  const occupied=await http('POST','/schedules',token,{classId:occupying.id,teacherId:coach.id,classroom:'联动场地',startTime:conflictTarget.startTime,endTime:conflictTarget.endTime});
  assert.equal(occupied.response.status,201,JSON.stringify(occupied.data)); const occupiedId=occupied.data.data.id;
  const beforeConflict=JSON.stringify(await db.schedule.findMany({orderBy:{id:'asc'}}));
  const conflict=await transition('复课',409); assert.equal(conflict.error.code,'SCHEDULE_CONFLICT');
  assert.ok(conflict.error.message.includes(occupying.name)); assert.ok(conflict.error.message.includes('北京时间'));
  assert.equal((await db.class.findUniqueOrThrow({where:{id:toggle.id}})).status,'inactive');
  assert.equal(JSON.stringify(await db.schedule.findMany({orderBy:{id:'asc'}})),beforeConflict);
  await shot('resume-conflict');
  check('Released teacher/room can be occupied; resume reports named timed conflict and rolls back all rows',{message:conflict.error.message});
  assert.equal((await http('DELETE','/schedules/'+occupiedId,token)).response.status,200);
  await transition('复课');
  for(const x of [first,second]) assert.equal((await db.schedule.findUniqueOrThrow({where:{id:x.id}})).status,'scheduled');
  assert.equal(await protectedSnapshot(),beforeProtected);
  result=await http('GET',listRoute,token); for(const x of [first,second,withHistory]) assert.ok(JSON.stringify(result.data).includes(x.id));
  check('Conflict removal permits resume; only class_paused rows restore, preserved histories remain identical',{});
  await transition('停课');
  await page.goto(base+'/classes',{waitUntil:'networkidle'});
  await row(toggle.name).getByRole('button',{name:'永久删除',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'确认永久删除',exact:true});
  const deleted=page.waitForResponse(r=>r.request().method()==='DELETE' && new URL(r.url()).pathname==='/api/classes/'+toggle.id);
  await dialog.getByRole('button',{name:'确认永久删除',exact:true}).click(); assert.equal((await deleted).status(),200); await expect(dialog).not.toBeVisible();
  result=await http('GET',listRoute,token); report.deletedClassTimetable=result.data; for(const x of [first,second,withHistory]) assert.ok(!JSON.stringify(result.data).includes(x.id), 'Deleted future occurrence leaked: '+x.id);
  assert.equal(await protectedSnapshot(),beforeProtected);
  assert.equal((await http('PUT','/classes/'+toggle.id,token,{status:'active'})).response.status,404);
  check('Deleting paused class cannot leak future lessons or restore deleted class; historical records retained',{});
  await shot('deleted-paused-class'); assert.deepEqual(report.pageErrors,[]); assert.deepEqual(report.blockedExternalRequests,[]);
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
}).finally(async () => { await cleanup(); process.exit(process.exitCode || 0); });
