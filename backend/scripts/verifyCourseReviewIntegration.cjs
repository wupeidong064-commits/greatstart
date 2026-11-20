'use strict';
const assert = require('node:assert/strict');
const { execFileSync, spawn } = require('node:child_process');
const { createHmac, randomBytes, randomUUID } = require('node:crypto');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { setTimeout: delay } = require('node:timers/promises');
const { PrismaClient } = require('@prisma/client');
const jwt = require('jsonwebtoken');

const backend = path.resolve(__dirname, '..');
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'greatstart-course-review-'));
const database = 'course_review_' + randomBytes(8).toString('hex');
const user = os.userInfo().username;
const cluster = path.join(fs.realpathSync(scratch), 'pgdata');
const password = randomBytes(24).toString('hex');
const env = {
  LC_ALL: 'C', LANG: 'C', PATH: process.env.PATH, HOME: os.homedir(), TMPDIR: scratch, PGHOST: '127.0.0.1', PGUSER: user, PGPASSWORD: password,
  JWT_SECRET: randomBytes(48).toString('hex'),
  NODE_ENV: 'test', AI_PROVIDER: 'mock', ENABLE_MCP: 'false', ARK_API_KEY: '', GLM_API_KEY: '',
  DOTENV_CONFIG_PATH: path.join(scratch, 'absent.env'),
};
const run = (cmd, args) => execFileSync(cmd, args, { cwd: scratch, env, stdio: 'pipe', timeout: 120000 });
let db, server, created = false, clusterStarted = false, port;

async function availablePort() {
  const socket = net.createServer();
  await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve));
  const port = socket.address().port;
  await new Promise(resolve => socket.close(resolve));
  return port;
}

async function start() {
  assert.match(database, /^course_review_[0-9a-f]{16}$/);
  env.PGPORT = String(await availablePort());
  assert.notEqual(env.PGPORT, '5432');
  const passwordFile = path.join(scratch, 'pg-password');
  fs.writeFileSync(passwordFile, password + '\n', { mode: 0o600 });
  run('initdb', ['-D', cluster, '-U', user, '-A', 'scram-sha-256', '--pwfile', passwordFile, '--no-locale', '--encoding', 'UTF8']);
  fs.unlinkSync(passwordFile);
  fs.appendFileSync(path.join(cluster, 'postgresql.conf'), "\nshared_buffers = '8MB'\nmax_connections = 18\nmax_wal_senders = 0\nmax_worker_processes = 2\nautovacuum_max_workers = 1\nlisten_addresses = '127.0.0.1'\nunix_socket_directories = ''\nport = " + env.PGPORT + '\n');
  const clusterLog = path.join(scratch, 'postgres.log');
  try {
    run('pg_ctl', ['start', '-w', '-D', cluster, '-l', clusterLog]);
  } catch (error) {
    throw Error('Private PostgreSQL startup failed: ' + (fs.existsSync(clusterLog) ? fs.readFileSync(clusterLog, 'utf8') : error.message));
  }
  clusterStarted = true;
  assert.equal(fs.realpathSync(run('psql', ['-d', 'postgres', '-Atc', 'SHOW data_directory']).toString().trim()), cluster);
  const url = 'postgresql://' + encodeURIComponent(user) + ':' + password + '@127.0.0.1:' + env.PGPORT + '/' + database;
  env.DATABASE_URL = url + '?connection_limit=8';
  env.DATABASE_DIRECT_URL = url;
  db = new PrismaClient({ datasources: { db: { url: url + '?connection_limit=2' } } });
  run('createdb', [database]);
  created = true;
  const originalSchema = fs.realpathSync(path.join(backend, 'prisma'));
  const copiedSchema = path.join(fs.realpathSync(scratch), 'prisma');
  fs.cpSync(originalSchema, copiedSchema, { recursive: true, dereference: true });
  for (const rel of ['.', 'schema.prisma', 'migrations']) {
    assert.equal(fs.realpathSync(path.join(copiedSchema, rel)), path.join(copiedSchema, rel));
    assert.notEqual(fs.realpathSync(path.join(originalSchema, rel)), fs.realpathSync(path.join(copiedSchema, rel)));
  }
  run(process.execPath, [path.join(backend, 'node_modules/prisma/build/index.js'), 'migrate', 'deploy', '--schema', path.join(scratch, 'prisma/schema.prisma')]);
  assert.equal((await db.$queryRaw`SELECT current_database() AS name`)[0].name, database);
  port = await availablePort();
  server = spawn(process.execPath, ['--import', path.join(backend, 'node_modules/tsx/dist/loader.mjs'), path.join(backend, 'src/index.ts')], {
    cwd: scratch, env: { ...env, PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  for (const stream of [server.stdout, server.stderr]) stream.on('data', chunk => { output = (output + chunk).slice(-3000); });
  for (let i = 0; i < 200; i++) {
    if (server.exitCode !== null) break;
    try {
      if ((await fetch('http://127.0.0.1:' + port + '/health', { signal: AbortSignal.timeout(500) })).ok) return;
    } catch {}
    await delay(100);
  }
  throw Error('Isolated HTTP service did not start: ' + output);
}

async function request(method, route, token, body, expected = 200) {
  const response = await fetch('http://127.0.0.1:' + port + '/api' + route, {
    method, headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token },
    body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(30000),
  });
  const json = await response.json();
  assert.equal(response.status, expected, method + ' ' + route + ' ' + JSON.stringify(json).slice(0, 600));
  return json.data ?? json.error;
}

async function scope(name) {
  const org = await db.organization.create({ data: { name, code: randomUUID() } });
  const campus = await db.campus.create({ data: { name: '校区', code: 'MAIN', organizationId: org.id } });
  return { organizationId: org.id, campusId: campus.id };
}

async function account(tenant, role) {
  const person = await db.user.create({ data: { ...tenant, role, email: randomUUID() + '@isolated.test', name: role, password: 'test-only-hash' } });
  const sessionTag = createHmac('sha256', env.JWT_SECRET).update(person.password).digest('base64url');
  return { ...person, token: jwt.sign({ userId: person.id, sessionTag }, env.JWT_SECRET, { expiresIn: '1h' }) };
}

const klass = (scope, name, extra = {}) => db.class.create({ data: { ...scope, name, code: randomUUID(), courseType: '训练', ...extra } });
const pupil = (scope, name) => db.student.create({ data: { ...scope, name, remainingLessons: 9, consumedLessons: 3, purchasedLessons: 12, totalPayment: 1999 } });
const enroll = (student, cls) => db.enrollment.create({ data: { organizationId: student.organizationId, studentId: student.id, classId: cls.id, enrolledAt: new Date('2020-01-01T00:00:00Z') } });
const transferBody = (student, sources, target) => ({ studentId: student.id, fromEnrollmentIds: sources.map(row => row.id), toClassId: target.id, notes: '上课时间调整' });
const rows = student => db.enrollment.findMany({ where: { studentId: student.id }, orderBy: { id: 'asc' } });
const receipts = student => db.lessonTransfer.findMany({ where: { studentId: student.id }, orderBy: { id: 'asc' } });

async function verify() {
  const own = await scope('事务验收'), external = await scope('外机构');
  const manager = await account(own, 'manager'), outsider = await account(external, 'manager'), teacher = await account(own, 'coach');
  const cls = await klass(own, '移除测试'), other = await klass(own, '未选班');
  const input = { deleteReason: '时间调整', expectedRecallDate: '2099-12-01' };
  const remove = (e, body = input, expected = 200, actor = manager) => request('POST', '/enrollments/' + e.id + '/remove-as-lost', actor.token, body, expected);
  const protectedStudent = await pupil(own, '保护样例'), protectedEnrollment = await enroll(protectedStudent, cls);
  const future = await db.schedule.create({ data: { ...own, classId: cls.id, startTime: new Date('2099-11-01T10:00:00+08:00'), endTime: new Date('2099-11-01T11:00:00+08:00') } });
  await db.attendance.create({ data: { organizationId: own.organizationId, studentId: protectedStudent.id, classId: cls.id, scheduleId: future.id, status: 'present' } });
  assert.equal((await remove(protectedEnrollment, input, 409)).code, 'ENROLLMENT_HAS_FUTURE_ATTENDANCE');
  assert.deepEqual(await db.student.findUnique({ where: { id: protectedStudent.id } }), protectedStudent);
  assert.deepEqual(await db.enrollment.findUnique({ where: { id: protectedEnrollment.id } }), protectedEnrollment);
  console.log('PASS C02 protected rejection leaves student, enrollment and notes unchanged');

  const rollbackStudent = await pupil(own, 'RollbackProbe'), rollbackEnrollment = await enroll(rollbackStudent, cls);
  await db.$executeRawUnsafe(`CREATE FUNCTION reject_loss() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.name = 'RollbackProbe' AND NEW.status = 'lost' THEN RAISE EXCEPTION 'injected after enrollment update'; END IF; RETURN NEW; END $$`);
  await db.$executeRawUnsafe('CREATE TRIGGER reject_loss BEFORE UPDATE ON students FOR EACH ROW EXECUTE FUNCTION reject_loss()');
  await remove(rollbackEnrollment, input, 500);
  assert.deepEqual(await db.enrollment.findUnique({ where: { id: rollbackEnrollment.id } }), rollbackEnrollment);
  assert.deepEqual(await db.student.findUnique({ where: { id: rollbackStudent.id } }), rollbackStudent);
  await db.$executeRawUnsafe('DROP TRIGGER reject_loss ON students'); await db.$executeRawUnsafe('DROP FUNCTION reject_loss()');
  console.log('PASS C02 failure after enrollment closure rolls back closure and receipt');

  const student = await pupil(own, '并发移除'), e = await enroll(student, cls), untouched = await enroll(student, other);
  const results = await Promise.all(Array.from({ length: 4 }, () => remove(e)));
  assert.equal(results.filter(r => !r.replayed).length, 1);
  const savedStudent = await db.student.findUnique({ where: { id: student.id } });
  const savedEnrollment = await db.enrollment.findUnique({ where: { id: e.id } });
  assert.equal(savedStudent.status, 'lost'); assert.equal(savedStudent.remainingLessons, student.remainingLessons);
  assert.equal(savedEnrollment.status, 'cancelled'); assert.ok(savedEnrollment.endedAt); assert.ok(savedEnrollment.removalReceipt);
  assert.deepEqual(await db.enrollment.findUnique({ where: { id: untouched.id } }), untouched);
  await request('PUT', '/enrollments/' + e.id, manager.token, { notes: '普通备注修改' });
  assert.equal((await remove(e)).replayed, true);
  await db.student.update({ where: { id: student.id }, data: { status: 'active' } });
  assert.equal((await remove(e)).replayed, true);
  assert.equal((await db.student.findUnique({ where: { id: student.id } })).status, 'active');
  await remove(e, { ...input, deleteReason: '不同意图' }, 409);
  await remove(e, input, 404, outsider); await remove(e, input, 403, teacher);
  await remove(untouched, { ...input, expectedRecallDate: '2026-02-30' }, 400);
  const forged = await enroll(await pupil(own, '伪造备注'), cls);
  await db.enrollment.update({ where: { id: forged.id }, data: { status: 'cancelled', endedAt: new Date(), notes: '[remove-as-lost:v1]' + JSON.stringify({ reason: input.deleteReason, recall: input.expectedRecallDate }) } });
  await remove(forged, input, 409);
  console.log('PASS C02 concurrency, immutable replay after note edit/recall, intent conflict and tenant/role validation');

  const reports = await scope('历史统计'), reader = await account(reports, 'manager');
  const historicalClass = await klass(reports, '已停课历史班', { status: 'inactive' }), historicalStudent = await pupil(reports, '退后重报');
  await db.enrollment.create({ data: { organizationId: reports.organizationId, classId: historicalClass.id, studentId: historicalStudent.id, enrolledAt: new Date('2026-10-01'), endedAt: new Date('2026-11-03'), status: 'cancelled' } });
  await db.enrollment.create({ data: { organizationId: reports.organizationId, classId: historicalClass.id, studentId: historicalStudent.id, enrolledAt: new Date('2026-11-04'), status: 'active' } });
  const statsUrl = '/consumption/statistics?startDate=2026-11-01&endDate=2026-11-08';
  const stats = await request('GET', statsUrl, reader.token);
  assert.equal(stats.baseFlow.startCount, 1); assert.equal(stats.baseFlow.added, 1); assert.equal(stats.baseFlow.removedTotal, 1); assert.equal(stats.baseFlow.endCount, 1); assert.equal(stats.baseFlow.removedByStatus, 0); assert.equal(stats.baseCount, 0);
  assert.equal(stats.baseFlow.startCount + stats.baseFlow.added - stats.baseFlow.removedTotal, stats.baseFlow.endCount);
  assert.equal(stats.classFlow.startCount, 1); assert.equal(stats.classFlow.endCount, 1); assert.equal(stats.classCount, 0);
  await klass(reports, '从未有报名空班');
  const emptyStats = await request('GET', statsUrl, reader.token);
  assert.equal(emptyStats.classFlow.added, stats.classFlow.added); assert.equal(emptyStats.classFlow.removed, stats.classFlow.removed);
  await db.enrollment.create({ data: { organizationId: reports.organizationId, classId: historicalClass.id, studentId: historicalStudent.id, enrolledAt: new Date('2026-09-01'), status: 'completed' } });
  const unknown = await request('GET', statsUrl, reader.token);
  assert.equal(unknown.baseFlow.historyAvailable, false); assert.equal(unknown.baseFlow.startCount, null); assert.equal(unknown.classFlow.endCount, null);
  console.log('PASS C03/C04 real HTTP re-enrollment, inactive class history, empty classes and unknown legacy end date');

  await request('PUT', '/settings/maxClasses', manager.token, { value: '24' });
  assert.equal((await request('GET', '/settings/maxClasses', manager.token)).value, '24');
  assert.notEqual((await request('GET', '/settings/maxClasses', outsider.token)).value, '24');
  assert.equal((await request('GET', '/campuses', manager.token)).length, 1);
  assert.equal((await request('GET', '/organizations', manager.token))[0].id, own.organizationId);
  const priorities = await request('GET', '/classes/experience-priority', manager.token);
  assert.ok(priorities.some(c => c.id === cls.id));
  const logs = await request('GET', '/lesson-logs?studentName=' + encodeURIComponent(student.name), manager.token); assert.deepEqual(logs, []);
  const money = await request('GET', '/cashflow-summary', manager.token); assert.equal(money.renewal.amount, 0);
  console.log('PASS migrated Prisma settings isolation, campuses, organizations, class counts, lesson logs and cashflow endpoints');
  // Real XLSX upload -> parser/normalizer -> preview -> direct Prisma import -> PostgreSQL.
  const XLSX = require('xlsx'), workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ['学员姓名', '年龄', '家长姓名', '家长电话', '备注'],
    ['Prisma日期导入', '9', '导入监护人', '13912345678', '日期迁移回归'],
  ]), '学生');
  const xlsx = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  const previewBody = new FormData();
  previewBody.set('type', 'students');
  previewBody.set('file', new Blob([xlsx], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), 'students.xlsx');
  const previewResponse = await fetch('http://127.0.0.1:' + port + '/api/import/preview', {
    method: 'POST', headers: { authorization: 'Bearer ' + manager.token }, body: previewBody,
  });
  const previewJson = await previewResponse.json();
  assert.equal(previewResponse.status, 200, JSON.stringify(previewJson));
  const preview = previewJson.data;
  assert.equal(preview.valid, 1, JSON.stringify(preview));
  assert.equal(preview.preview[0].data.birthDate, (new Date().getFullYear() - 9) + '-01-01');
  const imported = await request('POST', '/import/execute', manager.token, {
    type: 'students', data: preview.preview.map(row => row.data), duplicateStrategy: 'skip', duplicates: preview.duplicates,
  });
  assert.equal(imported.success, true, JSON.stringify(imported));
  assert.equal(imported.summary.created, 1); assert.equal(imported.summary.failed, 0);
  const importedStudent = await db.student.findFirstOrThrow({ where: { ...own, name: 'Prisma日期导入' } });
  assert.equal(importedStudent.birthDate.toISOString(), preview.preview[0].data.birthDate + 'T00:00:00.000Z');
  const shanghaiDay = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
  assert.equal(importedStudent.cardOpenDate.toISOString(), new Date(shanghaiDay + 'T00:00:00+08:00').toISOString());
  assert.equal(importedStudent.parentPhone, '13912345678');
  console.log('PASS real XLSX student preview/execute preserves normalized birth date and creates valid Prisma card-open DateTime');
  const salesAdmin = await account(own, 'admin'), externalAdmin = await account(external, 'admin');
  for (const [admin, tenant] of [[salesAdmin, own], [externalAdmin, external]]) {
    await db.conversion.create({ data: { organizationId: tenant.organizationId, studentName: '管理员成交', contact: '13912345679', salesId: admin.id, courseType: '新报', conversionDate: '2026-11-08', approvalStatus: 'confirmed', price: '123.45' } });
  }
  const adminSales = await request('GET', '/users/sales-statistics?startDate=2026-11-08&endDate=2026-11-08', manager.token);
  const adminStat = adminSales.find(row => row.teacherId === salesAdmin.id);
  assert.ok(adminStat, 'local admin must appear in sales statistics');
  assert.equal(adminStat.orderCount, 1); assert.equal(adminStat.orderAmount, 123.45);
  assert.ok(!adminSales.some(row => row.teacherId === externalAdmin.id));
  console.log('PASS sales statistics includes local admin confirmed conversion, Decimal sum and tenant isolation');


  const browserScope = await scope('浏览器隔离'), browserManager = await account(browserScope, 'manager');
  const browserClass = await klass(browserScope, '浏览器课务班'), browserStudent = await pupil(browserScope, '浏览器学员');
  const browserEnrollment = await enroll(browserStudent, browserClass);
  const weekday = new Date('2099-11-03T12:00:00+08:00').getUTCDay();
  await db.classWeeklyRule.create({ data: { organizationId: browserScope.organizationId, classId: browserClass.id, weekday, startTime: '18:00', endTime: '19:00' } });
  const frontend = path.resolve(backend, '../frontend');
  const browserOutput = execFileSync(process.execPath, [path.join(frontend, 'scripts/verifyCourseReviewLiveUi.mjs')], {
    cwd: frontend, env: { PATH: process.env.PATH, HOME: os.homedir(), TMPDIR: scratch, COURSE_REVIEW_BACKEND_URL: 'http://127.0.0.1:' + port, COURSE_REVIEW_ACTOR: JSON.stringify(browserManager) },
    stdio: 'pipe', timeout: 120000,
  });
  console.log(browserOutput.toString().trim());
  const generated = await db.schedule.findMany({ where: { classId: browserClass.id }, orderBy: { startTime: 'asc' } });
  assert.equal(generated.length, 3);
  assert.equal(generated[0].startTime.toISOString(), '2099-11-03T10:00:00.000Z');
  assert.equal(generated[2].startTime.toISOString(), '2099-11-17T10:00:00.000Z');
  assert.equal((await db.enrollment.findUnique({ where: { id: browserEnrollment.id } })).status, 'cancelled');
  assert.equal((await db.student.findUnique({ where: { id: browserStudent.id } })).status, 'lost');
  console.log('PASS real browser -> real API -> database: three exact schedule dates and atomic lost/ended enrollment');

}

async function cleanup() {
  if (server && server.exitCode === null && server.signalCode === null) {
    const exited = new Promise(resolve => server.once('exit', resolve));
    server.kill('SIGTERM');
    await Promise.race([exited, delay(3000)]);
    if (server.exitCode === null && server.signalCode === null) {
      server.kill('SIGKILL');
      await exited;
    }
  }
  try {
    await db?.$disconnect();
    if (created) run('dropdb', [database]);
  } finally {
    if (clusterStarted) run('pg_ctl', ['stop', '-w', '-m', 'fast', '-D', cluster]);
  }
  fs.rmSync(scratch, { recursive: true, force: true });
}
(async () => {
  try {
    await start();
    await verify();
  } finally {
    await cleanup();
  }
  console.log('PASS isolated HTTP server/PG cluster stopped and scratch/database removed: ' + database);
})().catch(error => { console.error(error); process.exitCode = 1; });
