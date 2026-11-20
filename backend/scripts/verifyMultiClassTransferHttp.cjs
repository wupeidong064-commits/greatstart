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
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'greatstart-multi-transfer-'));
const database = 'multi_transfer_' + randomBytes(8).toString('hex');
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
  assert.match(database, /^multi_transfer_[0-9a-f]{16}$/);
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
  const own = await scope('本机构'), external = await scope('其他机构');
  const campus = await db.campus.create({ data: { organizationId: own.organizationId, name: '其他校区', code: 'SECOND' } });
  const otherCampus = { organizationId: own.organizationId, campusId: campus.id };
  const manager = await account(own, 'manager'), coach = await account(own, 'coach');
  const foreignManager = await account(external, 'admin'), otherManager = await account(otherCampus, 'manager');
  const post = (body, expected = 200, actor = manager) => request('POST', '/enrollments/transfer', actor.token, body, expected);
  const alpha = await klass(own, '甲班'), beta = await klass(own, '乙班'), gamma = await klass(own, '丙班');
  const target = await klass(own, '合并目标班'), alternate = await klass(own, '另一目标班');
  const outside = await klass(external, '外机构班'), neighbor = await klass(otherCampus, '外校区班');

  const student = await pupil(own, '三选二');
  const memberships = await Promise.all([alpha, beta, gamma].map(cls => enroll(student, cls)));
  const [one, two, unselected] = memberships;
  const payment = await db.payment.create({ data: { organizationId: own.organizationId, studentId: student.id, enrollmentId: one.id, amount: 1999, paymentType: 'tuition', paymentMethod: 'cash' } });
  const body = transferBody(student, [one, two], target);
  const results = await Promise.all(Array.from({ length: 5 }, (_, i) => post({ ...body, fromEnrollmentIds: i % 2 ? [two.id, one.id] : [one.id, two.id] })));
  assert.equal(results.filter(result => !result.replayed).length, 1);
  for (const result of results) assert.deepEqual(result.transfers, results[0].transfers);
  const all = await rows(student);
  assert.equal(all.length, 4);
  assert.deepEqual(all.filter(row => row.status === 'active').map(row => row.classId).sort(), [gamma.id, target.id].sort());
  assert.deepEqual(all.find(row => row.id === unselected.id), unselected);
  const opened = all.find(row => row.classId === target.id);
  const closed = all.filter(row => [one.id, two.id].includes(row.id));
  assert.ok(closed.every(row => row.status === 'transferred' && +row.endedAt === +opened.enrolledAt));
  const audit = await receipts(student);
  assert.deepEqual(audit.map(row => row.id).sort(), ['transfer:' + one.id, 'transfer:' + two.id].sort());
  assert.ok(audit.every(row => row.toClassId === target.id && row.transferredLessons === 0 && +row.priceDifference === 0 && +row.refundAmount === 0));
  assert.deepEqual(await db.student.findUniqueOrThrow({ where: { id: student.id } }), student);
  assert.deepEqual(await db.payment.findUniqueOrThrow({ where: { id: payment.id } }), payment);
  assert.equal(await db.lessonLog.count({ where: { studentId: student.id } }), 0);
  console.log('PASS 3 choose 2, common enrollment boundary, unselected class and original payment/balances preserved; five parallel attempts create one target and two receipts');

  assert.equal((await post(transferBody(student, [one, two], alternate), 409)).code, 'TRANSFER_CONFLICT');
  assert.equal((await post(transferBody(student, [one, unselected], target), 409)).code, 'TRANSFER_CONFLICT');
  assert.deepEqual(await rows(student), all);
  await request('PUT', '/enrollments/' + opened.id, manager.token, { status: 'completed' });
  await db.class.update({ where: { id: target.id }, data: { status: 'inactive' } });
  assert.deepEqual((await post(body)).transfers, results[0].transfers);
  assert.equal(await db.enrollment.count({ where: { studentId: student.id, classId: target.id, status: 'active' } }), 0);
  assert.equal(await db.enrollment.count({ where: { studentId: student.id, classId: target.id } }), 1);
  await db.class.update({ where: { id: target.id }, data: { status: 'active' } });
  console.log('PASS mismatched target/partially completed receipt sets rejected, replay never recreates a closed target');

  const main = await pupil(own, '已在目标');
  const full = await klass(own, '仅一席', { capacity: 1 });
  const current = await enroll(main, full);
  const sources = await Promise.all([alpha, beta].map(cls => enroll(main, cls)));
  const merge = await post(transferBody(main, sources, full));
  assert.equal(merge.replayed, false);
  assert.deepEqual((await rows(main)).filter(row => row.status === 'active'), [current]);
  assert.equal(await db.enrollment.count({ where: { classId: full.id } }), 1);
  assert.equal((await receipts(main)).length, 2);
  console.log('PASS two source classes merge into an existing full target; original target enrollment is byte-for-byte unchanged');

  const protectedStudent = await pupil(own, '整批失败');
  const originals = await Promise.all([alpha, beta].map(cls => enroll(protectedStudent, cls)));
  const before = await rows(protectedStudent);
  const normal = transferBody(protectedStudent, originals, target);
  async function noChange() {
    assert.deepEqual(await rows(protectedStudent), before);
    assert.equal((await receipts(protectedStudent)).length, 0);
    assert.deepEqual(await db.student.findUniqueOrThrow({ where: { id: protectedStudent.id } }), protectedStudent);
  }
  assert.equal((await post({ ...normal, toClassId: full.id }, 409)).code, 'CLASS_FULL');
  await noChange();
  const occurrence = await db.schedule.create({ data: { ...own, classId: beta.id, startTime: new Date('2045-01-01T10:00:00Z'), endTime: new Date('2045-01-01T11:00:00Z') } });
  const attendance = await db.attendance.create({ data: { organizationId: own.organizationId, studentId: protectedStudent.id, classId: beta.id, scheduleId: occurrence.id, status: 'present' } });
  assert.equal((await post(normal, 409)).code, 'ENROLLMENT_HAS_FUTURE_ATTENDANCE');
  await noChange();
  assert.deepEqual(await db.attendance.findUniqueOrThrow({ where: { id: attendance.id } }), attendance);
  await db.attendance.delete({ where: { id: attendance.id } });
  await db.enrollment.update({ where: { id: originals[1].id }, data: { status: 'completed', endedAt: new Date() } });
  const terminal = await rows(protectedStudent);
  assert.equal((await post(normal, 409)).code, 'ENROLLMENT_ALREADY_ENDED');
  assert.deepEqual(await rows(protectedStudent), terminal);
  assert.equal((await receipts(protectedStudent)).length, 0);
  console.log('PASS capacity, future attendance or one already-ended source abort the whole operation');

  const injectionStudent = await pupil(own, '注入故障');
  const injectionSources = await Promise.all([alpha, beta].map(cls => enroll(injectionStudent, cls)));
  const injectionBefore = await rows(injectionStudent);
  const injection = transferBody(injectionStudent, injectionSources, target);
  const lastId = [...injection.fromEnrollmentIds].sort().at(-1);
  assert.match(lastId, /^[a-f0-9-]{36}$/);
  await db.$executeRawUnsafe(`CREATE FUNCTION fail_second_receipt() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.id = 'transfer:${lastId}' THEN RAISE EXCEPTION 'test injection'; END IF; RETURN NEW; END $$`);
  await db.$executeRawUnsafe('CREATE TRIGGER fail_second_receipt BEFORE INSERT ON lesson_transfers FOR EACH ROW EXECUTE FUNCTION fail_second_receipt()');
  await post(injection, 500);
  assert.deepEqual(await rows(injectionStudent), injectionBefore);
  assert.equal((await receipts(injectionStudent)).length, 0);
  await db.$executeRawUnsafe('DROP TRIGGER fail_second_receipt ON lesson_transfers');
  await db.$executeRawUnsafe('DROP FUNCTION fail_second_receipt()');
  assert.equal((await post(injection)).replayed, false);
  console.log('PASS injected failure on the second receipt rolls back closed sources, target creation and the first receipt; clean retry succeeds');

  const local = await pupil(own, '权限与接口');
  const localSources = await Promise.all([alpha, beta].map(cls => enroll(local, cls)));
  const localBefore = await rows(local);
  const scoped = transferBody(local, localSources, target);
  await post(scoped, 403, coach);
  await post(scoped, 404, foreignManager);
  await post(scoped, 404, otherManager);
  await post({ ...scoped, toClassId: outside.id }, 404);
  await post({ ...scoped, toClassId: neighbor.id }, 404);
  const foreignStudent = await pupil(external, '外机构学员'), foreignRow = await enroll(foreignStudent, outside);
  const neighborStudent = await pupil(otherCampus, '外校区学员'), neighborRow = await enroll(neighborStudent, neighbor);
  await post({ ...scoped, fromEnrollmentIds: [localSources[0].id, foreignRow.id] }, 404);
  await post({ ...scoped, fromEnrollmentIds: [localSources[0].id, neighborRow.id] }, 404);
  await post({ ...scoped, fromEnrollmentIds: [localSources[0].id, one.id] }, 404);
  await post({ ...scoped, toClassId: beta.id }, 400);
  await post({ ...scoped, fromEnrollmentIds: [localSources[0].id, localSources[0].id] }, 400);
  await post({ ...scoped, fromEnrollmentIds: [] }, 400);
  await post({ ...scoped, fromClassId: alpha.id }, 400);
  await db.class.update({ where: { id: target.id }, data: { status: 'inactive' } });
  await post(scoped, 409);
  await db.class.update({ where: { id: target.id }, data: { status: 'active' } });
  assert.deepEqual(await rows(local), localBefore);
  assert.equal((await receipts(local)).length, 0);
  const single = { studentId: local.id, fromClassId: alpha.id, fromEnrollmentId: localSources[0].id, toClassId: target.id };
  await post({ ...single, fromClassId: gamma.id }, 404);
  const receipt = await post(single);
  assert.equal(receipt.id, 'transfer:' + localSources[0].id);
  assert.deepEqual(await post(single), receipt);
  await post(single, 403, coach);
  assert.equal((await rows(local)).find(row => row.id === localSources[1].id).status, 'active');
  console.log('PASS campus/organization/role/student isolation, invalid requests and inactive targets; legacy single transfer and replay preserve response shape');
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
