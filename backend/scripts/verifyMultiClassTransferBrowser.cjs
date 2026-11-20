'use strict';
// Multi-source class transfers: real Chromium -> isolated real HTTP -> disposable PostgreSQL; no API mocks.
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
const output = path.join(root, 'docs/acceptance/2026-11-07-multi-class-transfer');
fs.mkdirSync(output, { recursive: true });
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'multi-transfer-browser-'));
const database = 'multi_transfer_browser_' + randomBytes(8).toString('hex');
assert.match(database, /^multi_transfer_browser_[0-9a-f]{16}$/);
const pgUser = os.userInfo().username;
const pgPassword = randomBytes(24).toString('hex');
const cluster = path.join(fs.realpathSync(scratch), 'pgdata');
const env = {
  LC_ALL: 'C', LANG: 'C', PATH: process.env.PATH, HOME: os.homedir(), TMPDIR: scratch,
  PGHOST: '127.0.0.1', PGUSER: pgUser, PGPASSWORD: pgPassword,
  JWT_SECRET: randomBytes(48).toString('hex'), NODE_ENV: 'test', AI_PROVIDER: 'mock',
  ENABLE_MCP: 'false', ENABLE_SWAGGER: 'false', DOTENV_CONFIG_PATH: path.join(scratch, 'no-business-env'),
  ARK_API_KEY: '', GLM_API_KEY: '', };
let db;
const report = { runId, startedAt: new Date().toISOString(), status: 'running', isolatedDatabase: database,
  isolation: { disposablePostgres: true, privatePostgresCluster: true, sterileBackendCwd: true, whitelistEnvironment: true, aiProvider: 'mock', apiResponsesMocked: false, realUiLogin: true },
  checks: [], requests: [], responses: [], screenshots: [], pageErrors: [], blockedExternalRequests: [], cleanup: {} };
const sensitiveValues = [pgPassword];
const safe = value => sensitiveValues.reduce((text, secret) => text.split(secret).join('[REDACTED_FIXTURE_SECRET]'), String(value));
let server, ui, browser, page, created = false, clusterStarted = false, loggedIn = false, serverOutput = '';
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const check = (name, evidence) => { report.checks.push({ name, passed: true, evidence }); console.log('PASS: ' + name); };
const run = (command, args) => execFileSync(command, args, { cwd: scratch, env, stdio: 'pipe', timeout: 120000 });
async function freePort() { const socket = net.createServer(); await new Promise(r => socket.listen(0, '127.0.0.1', r)); const port = socket.address().port; await new Promise(r => socket.close(r)); return [3000, 5173].includes(port) ? freePort() : port; }
async function shot(label) { const title = page.locator('.ant-modal:visible .ant-modal-title').last(); if (await title.count()) await title.click(); await expect(page.locator('.ant-picker-dropdown:visible, .ant-select-dropdown:visible')).toHaveCount(0); const file = `browser-${runId}-${label}.png`; await page.screenshot({ path: path.join(output, file), fullPage: false }); report.screenshots.push(file); }
async function choose(dialog, id, names, multiple = false) {
  const select = dialog.locator('.ant-select').filter({ has: page.locator('#' + id) });
  await select.locator('.ant-select-selector').click();
  for (const name of names) {
    const option = page.locator('.ant-select-dropdown:visible .ant-select-item-option-content').getByText(name, { exact: typeof name === 'string' });
    await expect(option).toBeVisible(); await option.click();
  }
  if (multiple) await dialog.locator('#' + id).press('Escape');
  await dialog.locator('.ant-modal-title').click();
  await expect(page.locator('.ant-select-dropdown:visible')).toHaveCount(0);
}
async function transferMode(dialog) {
  const radio = dialog.getByLabel(/^调班/);
  await radio.focus(); await radio.press('Space'); await expect(radio).toBeChecked();
  await expect(dialog.locator('#fromEnrollmentIds')).toBeVisible();
}
async function submitTransfer(dialog, expectedRequestCount) {
  await expect(dialog.getByRole('button', { name: '确认调班', exact: true })).toBeEnabled();
  const responsePromise = page.waitForResponse(response => new URL(response.url()).pathname === '/api/enrollments/transfer' && response.request().method() === 'POST');
  await dialog.getByRole('button', { name: '确认调班', exact: true }).click();
  const response = await responsePromise, body = await response.json();
  report.responses.push({ pathname: '/api/enrollments/transfer', status: response.status(), success: body.success });
  assert.equal(response.status(), 200, JSON.stringify(body)); assert.equal(body.success, true, JSON.stringify(body));
  await expect(dialog).not.toBeVisible();
  assert.equal(report.requests.length, expectedRequestCount, 'One atomic transfer POST per UI submission');
  return body.data;
}
function serial(value) { return JSON.parse(JSON.stringify(value)); }
async function financialSnapshot(studentId) {
  const student = await db.student.findUniqueOrThrow({ where: { id: studentId }, select: { purchasedLessons: true, consumedLessons: true, remainingLessons: true, frozenLessons: true, totalPayment: true } });
  return serial({ student, lessonLogs: await db.lessonLog.findMany({ where: { studentId }, orderBy: { id: 'asc' } }), payments: await db.payment.findMany({ where: { studentId }, orderBy: { id: 'asc' } }), refunds: await db.refund.findMany({ where: { studentId }, orderBy: { id: 'asc' } }) });
}
function assertPayload(index, student, sources, target) {
  const request = report.requests[index];
  assert.equal(request.pathname, '/api/enrollments/transfer'); assert.equal(request.method, 'POST');
  assert.equal(request.body.studentId, student.id); assert.equal(request.body.toClassId, target.id);
  assert.deepEqual([...request.body.fromEnrollmentIds].sort(), sources.map(source => source.id).sort());
  assert.equal(Object.prototype.hasOwnProperty.call(request.body, 'fromEnrollmentId'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(request.body, 'fromClassId'), false);
}
async function assertClosedSources(student, sources, target, manager) {
  const after = await db.enrollment.findMany({ where: { id: { in: sources.map(source => source.id) } }, orderBy: { id: 'asc' } });
  assert.equal(after.length, sources.length);
  assert.ok(after.every(enrollment => enrollment.status === 'transferred' && enrollment.endedAt !== null));
  assert.equal(new Set(after.map(enrollment => enrollment.endedAt.toISOString())).size, 1, 'Selected sources close at the same transaction boundary');
  for (const original of sources) {
    const closed = after.find(enrollment => enrollment.id === original.id);
    assert.equal(closed.enrolledAt.toISOString(), original.enrolledAt.toISOString());
  }
  const transfers = await db.lessonTransfer.findMany({ where: { studentId: student.id }, orderBy: { fromClassId: 'asc' } });
  assert.equal(transfers.length, sources.length, 'One transfer receipt per source');
  assert.deepEqual(transfers.map(transfer => transfer.fromClassId).sort(), sources.map(source => source.classId).sort());
  for (const transfer of transfers) {
    assert.equal(transfer.toClassId, target.id); assert.equal(transfer.transferredLessons, 0);
    assert.equal(transfer.priceDifference.toString(), '0'); assert.equal(transfer.refundAmount.toString(), '0');
    assert.equal(transfer.operatedBy, manager.id);
  }
  return serial({ sources: after, transfers });
}
async function main() {
  env.PGPORT = String(await freePort()); assert.notEqual(env.PGPORT, '5432');
  const passwordFile = path.join(scratch, 'pg-password');
  fs.writeFileSync(passwordFile, pgPassword + '\n', { mode: 0o600 });
  run('initdb', ['-D', cluster, '-U', pgUser, '-A', 'scram-sha-256', '--pwfile', passwordFile, '--no-locale', '--encoding', 'UTF8']);
  fs.unlinkSync(passwordFile);
  fs.appendFileSync(path.join(cluster, 'postgresql.conf'), "\nshared_buffers = '8MB'\nmax_connections = 18\nmax_wal_senders = 0\nmax_worker_processes = 2\nautovacuum_max_workers = 1\nlisten_addresses = '127.0.0.1'\nunix_socket_directories = ''\nport = " + env.PGPORT + '\n');
  const clusterLog = path.join(scratch, 'postgres.log');
  try { run('pg_ctl', ['start', '-w', '-D', cluster, '-l', clusterLog]); clusterStarted = true; }
  catch (error) { clusterStarted = fs.existsSync(path.join(cluster, 'postmaster.pid')); throw Error('Private PostgreSQL startup failed: ' + safe(error.message)); }
  assert.equal(fs.realpathSync(run('psql', ['-d', 'postgres', '-Atc', 'SHOW data_directory']).toString().trim()), cluster);
  const databaseUrl = `postgresql://${encodeURIComponent(pgUser)}:${pgPassword}@127.0.0.1:${env.PGPORT}/${database}`;
  env.DATABASE_URL = databaseUrl + '?connection_limit=8'; env.DATABASE_DIRECT_URL = databaseUrl;
  db = new PrismaClient({ datasources: { db: { url: databaseUrl + '?connection_limit=2' } } });
  report.privatePostgresPort = Number(env.PGPORT);
  run('createdb', [database]); created = true;
  // Dereference every symlink: migration commands and cleanup cannot reach source Prisma files.
  const originalSchema = fs.realpathSync(path.join(backend, 'prisma')), copiedSchema = path.join(fs.realpathSync(scratch), 'prisma');
  fs.cpSync(originalSchema, copiedSchema, { recursive: true, dereference: true });
  for (const relative of ['.', 'schema.prisma', 'migrations']) {
    assert.equal(fs.realpathSync(path.join(copiedSchema, relative)), path.join(copiedSchema, relative));
    assert.notEqual(fs.realpathSync(path.join(originalSchema, relative)), fs.realpathSync(path.join(copiedSchema, relative)));
  }
  run(process.execPath, [path.join(backend, 'node_modules/prisma/build/index.js'), 'migrate', 'deploy', '--schema', path.join(scratch, 'prisma/schema.prisma')]);
  assert.equal((await db.$queryRaw`SELECT current_database() AS name`)[0].name, database);
  const org = await db.organization.create({ data: { name: '多班调班浏览器隔离机构', code: database } });
  const campus = await db.campus.create({ data: { organizationId: org.id, name: '隔离校区', code: 'MAIN' } });
  const password = randomUUID(); sensitiveValues.push(password);
  const manager = await db.user.create({ data: { name: '隔离调班管理员', email: randomUUID() + '@isolated.test', password: await bcrypt.hash(password, 10), role: 'manager', organizationId: org.id, campusId: campus.id } });
  const classes = {};
  for (const key of ['A', 'B', 'C', 'D', 'E']) classes[key] = await db.class.create({ data: { organizationId: org.id, campusId: campus.id, name: (['A', 'B', 'C'].includes(key) ? '原班' : '目标班') + key, code: key, courseType: '绘画', capacity: key === 'E' ? 1 : 10 } });
  async function student(name, lessons, amount, joined) {
    const pupil = await db.student.create({ data: { name, organizationId: org.id, campusId: campus.id, purchasedLessons: lessons, remainingLessons: lessons, totalPayment: amount } });
    const enrollments = {};
    for (const key of joined) enrollments[key] = await db.enrollment.create({ data: { organizationId: org.id, studentId: pupil.id, classId: classes[key].id, enrolledAt: new Date('2026-10-01T01:00:00.000Z'), enrolledBy: manager.id, notes: '独立浏览器前置报名' } });
    await db.lessonLog.create({ data: { organizationId: org.id, studentId: pupil.id, studentName: name, type: 'add', lessons, notes: '独立浏览器前置已购课时', operatorId: manager.id } });
    await db.payment.create({ data: { organizationId: org.id, studentId: pupil.id, enrollmentId: enrollments.A.id, amount, paymentType: 'tuition', paymentMethod: 'transfer', paidBy: manager.id, notes: '独立浏览器前置缴费' } });
    return { pupil, enrollments, financial: await financialSnapshot(pupil.id) };
  }
  const first = await student('多班合并学员', 24, 2400, ['A', 'B', 'C']);
  const second = await student('保留目标学员', 18, 1800, ['A', 'B', 'E']);
  assert.equal(await db.enrollment.count({ where: { classId: classes.E.id, status: 'active' } }), 1);
  assert.equal(await db.lessonTransfer.count(), 0);
  report.fixture = { studentOne: { id: first.pupil.id, sourceClasses: ['A', 'B', 'C'], financial: first.financial }, studentTwo: { id: second.pupil.id, sourceClasses: ['A', 'B', 'E'], financial: second.financial }, existingTargetCapacity: 1, existingTargetActiveCount: 1 };
  const apiPort = await freePort(), webPort = await freePort(), base = `http://127.0.0.1:${webPort}`;
  report.ports = { backend: apiPort, frontend: webPort }; env.PORT = String(apiPort); env.ALLOWED_ORIGINS = base;
  server = spawn(process.execPath, ['--import', path.join(backend, 'node_modules/tsx/dist/loader.mjs'), path.join(backend, 'src/index.ts')], { cwd: scratch, env, stdio: ['ignore', 'pipe', 'pipe'] });
  for (const pipe of [server.stdout, server.stderr]) pipe.on('data', value => { serverOutput = (serverOutput + value).slice(-10000); });
  let ready = false;
  for (let n = 0; n < 200; n++) { try { if ((await fetch(`http://127.0.0.1:${apiPort}/health`, { signal: AbortSignal.timeout(300) })).ok) { ready = true; break; } } catch {} if (server.exitCode !== null) break; await pause(100); }
  assert.ok(ready, 'Isolated backend failed to start');
  const viteModule = await import(pathToFileURL(require.resolve('vite', { paths: [frontend] })).href), vite = viteModule.createServer ? viteModule : viteModule.default;
  const reactModule = await import(pathToFileURL(require.resolve('@vitejs/plugin-react', { paths: [frontend] })).href), react = typeof reactModule.default === 'function' ? reactModule.default : reactModule.default.default;
  for (const key of Object.keys(process.env)) if (key.startsWith('VITE_')) delete process.env[key];
  ui = await vite.createServer({ root: frontend, configFile: false, envFile: false, envDir: scratch, cacheDir: path.join(scratch, 'vite-cache'), plugins: [react()], define: { 'import.meta.env.VITE_API_BASE': JSON.stringify('/api') }, logLevel: 'error', server: { host: '127.0.0.1', port: webPort, strictPort: true, hmr: false, proxy: { '/api': `http://127.0.0.1:${apiPort}` } } });
  await ui.listen(); browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ serviceWorkers: 'block', timezoneId: 'Asia/Shanghai', viewport: { width: 1540, height: 1100 } });
  await context.route('**/*', route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== base) { report.blockedExternalRequests.push(url.origin + url.pathname); return route.abort(); }
    if (url.pathname.startsWith('/api/') && !['GET', 'HEAD', 'OPTIONS'].includes(request.method()) && url.pathname !== '/api/auth/login') report.requests.push({ pathname: url.pathname, method: request.method(), body: request.postDataJSON() });
    return route.continue();
  });
  page = await context.newPage(); page.setDefaultTimeout(20000);
  page.on('pageerror', error => report.pageErrors.push(safe(error.message)));
  page.on('response', response => { if (response.status() >= 400) report.httpErrors = [...(report.httpErrors || []), { pathname: new URL(response.url()).pathname, status: response.status() }]; });
  await page.goto(base + '/login', { waitUntil: 'networkidle' });
  await page.getByLabel('手机号或邮箱', { exact: true }).fill(manager.email); await page.getByLabel('密码', { exact: true }).fill(password);
  const loginResponse = page.waitForResponse(response => new URL(response.url()).pathname === '/api/auth/login' && response.request().method() === 'POST');
  await page.getByRole('button', { name: '登录', exact: true }).click(); assert.equal((await loginResponse).status(), 200);
  await expect(page).not.toHaveURL(/\/login$/); loggedIn = true;
  report.login = { realUi: true, role: 'manager', httpStatus: 200 };

  await page.goto(base + '/students', { waitUntil: 'domcontentloaded' });
  const studentRow = page.locator(`tr[data-row-key="${first.pupil.id}"]`);
  await expect(studentRow).toContainText(first.pupil.name);
  await studentRow.getByRole('button', { name: /班级调整/ }).click();
  let dialog = page.getByRole('dialog', { name: '班级调整', exact: true }); await expect(dialog).toBeVisible();
  await expect(dialog.locator('.ant-select').filter({ has: page.locator('#studentId') })).toContainText(first.pupil.name);
  await transferMode(dialog); await choose(dialog, 'fromEnrollmentIds', ['原班A (A)', '原班B (B)'], true);
  await choose(dialog, 'toClassId', [/^目标班D \(D\)/]);
  await expect(dialog).toContainText('已选2个原班');
  await dialog.getByLabel('备注（可选）', { exact: true }).fill('原A和B合并至D，保留C');
  await shot('student-two-sources-to-new-target');
  await submitTransfer(dialog, 1); assertPayload(0, first.pupil, [first.enrollments.A, first.enrollments.B], classes.D);
  const firstResult = await assertClosedSources(first.pupil, [first.enrollments.A, first.enrollments.B], classes.D, manager);
  assert.deepEqual(await db.enrollment.findUniqueOrThrow({ where: { id: first.enrollments.C.id } }), first.enrollments.C, 'Unselected enrollment C must be wholly unchanged');
  const destinationD = await db.enrollment.findMany({ where: { studentId: first.pupil.id, classId: classes.D.id } });
  assert.equal(destinationD.length, 1); assert.equal(destinationD[0].status, 'active'); assert.equal(destinationD[0].endedAt, null);
  assert.deepEqual(await financialSnapshot(first.pupil.id), first.financial, 'Lesson balances, paid amounts, payment rows and lesson logs must remain unchanged');
  check('Student row transfers A+B to D atomically, preserves C and all lesson/financial records', { requestCount: 1, ...firstResult, untouchedEnrollment: serial(first.enrollments.C), destination: serial(destinationD[0]), financesUnchanged: true });

  await page.goto(base + '/classes', { waitUntil: 'domcontentloaded' });
  const targetRow = page.locator(`tr[data-row-key="${classes.E.id}"]`); await expect(targetRow).toContainText(classes.E.name);
  await targetRow.getByRole('button', { name: /添加学员\s*\/\s*调班/ }).click();
  dialog = page.getByRole('dialog', { name: '班级调整', exact: true }); await expect(dialog).toBeVisible();
  await choose(dialog, 'studentId', [second.pupil.name]);
  await transferMode(dialog); await choose(dialog, 'fromEnrollmentIds', ['原班A (A)', '原班B (B)'], true);
  await expect(dialog.locator('.ant-select').filter({ has: page.locator('#toClassId') })).toContainText('目标班E');
  await expect(dialog).toContainText('目标班已在读，将保留');
  await dialog.getByLabel('备注（可选）', { exact: true }).fill('原A和B并入已在读且满额的E');
  await shot('class-two-sources-keep-existing-target');
  await submitTransfer(dialog, 2); assertPayload(1, second.pupil, [second.enrollments.A, second.enrollments.B], classes.E);
  const secondResult = await assertClosedSources(second.pupil, [second.enrollments.A, second.enrollments.B], classes.E, manager);
  const destinationE = await db.enrollment.findMany({ where: { studentId: second.pupil.id, classId: classes.E.id } });
  assert.equal(destinationE.length, 1); assert.deepEqual(destinationE[0], second.enrollments.E, 'Existing target membership including ID/enrolledAt remains unchanged');
  assert.equal(await db.enrollment.count({ where: { classId: classes.E.id, status: 'active' } }), 1, 'Full capacity-1 target gains no extra seat');
  assert.deepEqual(await financialSnapshot(second.pupil.id), second.financial);
  check('Class entry merges A+B into already-enrolled full E without duplicate membership or financial changes', { requestCount: 1, ...secondResult, retainedTargetEnrollment: serial(destinationE[0]), targetCapacity: 1, targetActiveCount: 1, financesUnchanged: true });
  assert.equal(report.requests.length, 2); assert.equal(await db.lessonTransfer.count(), 4);
  assert.deepEqual(report.pageErrors, []); assert.deepEqual(report.blockedExternalRequests, []);
  report.apiCounts = { transfers: report.requests.filter(request => request.pathname === '/api/enrollments/transfer').length, otherBusinessMutations: report.requests.filter(request => request.pathname !== '/api/enrollments/transfer').length };
  assert.deepEqual(report.apiCounts, { transfers: 2, otherBusinessMutations: 0 });
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
  await db?.$disconnect();
  try { if (created) run('dropdb', ['--if-exists', '--force', database]); report.cleanup.databaseDropped = true; } catch (e) { report.cleanup.databaseError = e.message; }
  try { if (clusterStarted) { run('pg_ctl', ['stop', '-m', 'fast', '-w', '-D', cluster]); clusterStarted = false; } report.cleanup.clusterStopped = !clusterStarted; } catch (e) { report.cleanup.clusterError = safe(e.message); }
  try { if (!clusterStarted) fs.rmSync(scratch, { recursive: true, force: true }); report.cleanup.scratchRemoved = !fs.existsSync(scratch); } catch (e) { report.cleanup.scratchError = safe(e.message); }
  if (Object.keys(report.cleanup).some(key => key.endsWith('Error')) || report.cleanup.backendClosed !== true) { report.status = 'failed'; process.exitCode = 1; }
  report.finishedAt = new Date().toISOString();
  const destination = path.join(output, `browser-${runId}-report.json`); fs.writeFileSync(destination, safe(JSON.stringify(report, null, 2)) + '\n'); console.log('REPORT ' + destination);
}
main().catch(async error => {
  report.status = 'failed'; report.failure = { message: safe(error.message), stack: safe(error.stack) }; process.exitCode = 1;
  console.error(safe(error.message));
  if (loggedIn && page) { try { await shot('failure'); } catch {} }
}).finally(cleanup);
