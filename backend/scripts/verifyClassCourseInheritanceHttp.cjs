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
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'greatstart-class-course-'));
const database = 'class_course_' + randomBytes(8).toString('hex');
const user = os.userInfo().username;
const url = 'postgresql://' + encodeURIComponent(user) + '@127.0.0.1:5432/' + database;
const env = {
  PATH: process.env.PATH, HOME: os.homedir(), TMPDIR: scratch, PGHOST: '127.0.0.1', PGPORT: '5432', PGUSER: user,
  DATABASE_URL: url, DATABASE_DIRECT_URL: url, JWT_SECRET: randomBytes(48).toString('hex'),
  NODE_ENV: 'test', AI_PROVIDER: 'mock', ENABLE_MCP: 'false', ARK_API_KEY: '', GLM_API_KEY: '',
  DOTENV_CONFIG_PATH: path.join(scratch, 'absent.env'),
};
const db = new PrismaClient({ datasources: { db: { url } } });
const run = (cmd, args) => execFileSync(cmd, args, { cwd: scratch, env, stdio: 'pipe', timeout: 120000 });
let server, created = false, port;

async function start() {
  assert.match(database, /^class_course_[0-9a-f]{16}$/);
  run('createdb', [database]);
  created = true;
  fs.cpSync(path.join(backend, 'prisma'), path.join(scratch, 'prisma'), { recursive: true });
  run(process.execPath, [path.join(backend, 'node_modules/prisma/build/index.js'), 'migrate', 'deploy', '--schema', path.join(scratch, 'prisma/schema.prisma')]);
  assert.equal((await db.$queryRaw`SELECT current_database() AS name`)[0].name, database);
  const socket = net.createServer();
  await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve));
  port = socket.address().port;
  await new Promise(resolve => socket.close(resolve));
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

const legacyClass = (scope, courseType, extra = {}) => db.class.create({ data: { ...scope, name: '旧班', code: randomUUID(), courseType, ...extra } });
const classForm = courseType => ({ name: '新班', code: randomUUID(), courseType });
const slot = (cls, day) => ({ classId: cls.id, startTime: day + 'T10:00:00+08:00', endTime: day + 'T11:00:00+08:00' });
const recurring = (cls, startDate, endDate) => ({ classId: cls.id, recurrenceType: 'daily', startDate, endDate, startTime: '10:00', endTime: '11:00' });

async function verify() {
  const own = await scope('测试机构'), external = await scope('外部机构');
  const admin = await account(own, 'manager'), teacher = await account(own, 'coach'), substitute = await account(own, 'coach');
  const foreignAdmin = await account(external, 'manager');
  const cls = await legacyClass(own, '游泳', { teacherId: teacher.id });
  const other = await legacyClass(external, '游泳');
  const post = (route, body, status = 201) => request('POST', route, admin.token, body, status);
  const edit = (cls, fields, status = 200) => request('PUT', '/classes/' + cls.id, admin.token, fields, status);
  const detail = id => request('GET', '/schedules/' + id, admin.token);
  assert.equal(await db.course.count(), 0);

  const firstPayload = slot(cls, '2040-01-01'), rule = recurring(cls, '2040-01-02', '2040-01-04');
  const [singles, batches] = await Promise.all([
    Promise.all(Array.from({ length: 4 }, () => post('/schedules', firstPayload))),
    Promise.all(Array.from({ length: 2 }, () => post('/schedules/recurring', rule))),
  ]);
  assert.equal(new Set(singles.map(row => row.id)).size, 1);
  assert.deepEqual(batches[0].schedules.map(row => row.id), batches[1].schedules.map(row => row.id));
  const first = await detail(singles[0].id), original = first.course;
  assert.equal(first.teacherId, teacher.id);
  assert.equal(original.name, '游泳');
  assert.ok(batches[0].schedules.every(row => row.courseId === original.id && row.teacherId === teacher.id));
  assert.equal(await db.course.count(), 1);
  assert.equal(await db.schedule.count(), 4);
  console.log('PASS empty directory, concurrent single and recurring creation, class teacher and one catalog entry');

  const replacementType = await post('/courses', { name: '救生' });
  await edit(cls, { courseType: replacementType.name });
  assert.equal((await detail(first.id)).course.id, original.id);
  assert.equal((await detail(first.id)).class.courseType, replacementType.name);
  assert.equal((await post('/schedules', firstPayload)).id, first.id);
  const newSlot = await post('/schedules', { ...slot(cls, '2040-01-05'), teacherId: substitute.id });
  assert.equal(newSlot.courseId, replacementType.id);
  assert.equal(newSlot.teacherId, substitute.id);
  const originalBatch = await post('/schedules/recurring', rule);
  assert.deepEqual(originalBatch.schedules.map(row => row.id), batches[0].schedules.map(row => row.id));
  const list = await request('GET', '/schedules?classId=' + cls.id, admin.token);
  assert.equal(list.find(row => row.id === first.id).course.name, original.name);
  console.log('PASS class type changes affect new slots only; old creation retries and substitute teacher hold');

  const activeSibling = await post('/classes', classForm(original.name));
  assert.equal(activeSibling.capacity, 20);
  const sized = await post('/classes', { ...classForm(original.name), capacity: '12' });
  assert.equal(sized.capacity, 12);
  assert.equal((await edit(sized, { capacity: '18' })).capacity, 18);
  assert.equal((await edit(sized, { name: '保留容量' })).capacity, 18);
  assert.equal((await edit(sized, { capacity: 0 })).capacity, 0);
  assert.equal((await post('/classes', { ...classForm(original.name), capacity: '0' })).capacity, 0);
  assert.equal((await edit(sized, { capacity: 2147483647 })).capacity, 2147483647);
  for (const invalid of ['', ' ', '12.5', -1, 'invalid', '2147483648', null, true]) {
    const form = { ...classForm(original.name), capacity: invalid };
    assert.equal((await post('/classes', form, 400)).code, 'INVALID_CLASS_CAPACITY');
    assert.equal((await edit(sized, { capacity: invalid }, 400)).code, 'INVALID_CLASS_CAPACITY');
    assert.equal(await db.class.count({ where: { code: form.code } }), 0);
  }
  assert.equal((await db.class.findUniqueOrThrow({ where: { id: sized.id } })).capacity, 2147483647);
  console.log('PASS class capacity accepts form strings, preserves default and zero, rejects invalid creates/edits with 400');
  const caseAlias = await legacyClass(own, ' 游泳 ');
  const rename = await request('PUT', '/courses/' + original.id, admin.token, { name: '水上训练' });
  assert.equal(rename.id, original.id);
  assert.equal((await db.class.findUniqueOrThrow({ where: { id: activeSibling.id } })).courseType, rename.name);
  assert.equal((await db.class.findUniqueOrThrow({ where: { id: caseAlias.id } })).courseType, rename.name);
  assert.equal((await db.class.findUniqueOrThrow({ where: { id: other.id } })).courseType, '游泳');
  assert.equal((await detail(first.id)).course.id, original.id);
  await request('DELETE', '/courses/' + original.id, admin.token);
  assert.equal((await post('/classes', classForm(rename.name), 400)).code, 'COURSE_INACTIVE');
  assert.equal((await edit(cls, { courseType: rename.name }, 400)).code, 'COURSE_INACTIVE');
  assert.equal((await edit(activeSibling, { name: '保留停用类型', courseType: rename.name })).courseType, rename.name);
  const inactiveSlot = await post('/schedules', slot(activeSibling, '2041-03-01'));
  assert.equal(inactiveSlot.courseId, original.id);
  assert.equal((await detail(inactiveSlot.id)).course.isActive, false);
  assert.equal((await post('/schedules', { ...slot(activeSibling, '2041-03-02'), courseId: original.id }, 400)).code, 'COURSE_INACTIVE');
  console.log('PASS directory rename across local bindings, stable historical ID, inactive class continuation and new-class guard');

  const legacy = await legacyClass(own, '拳击');
  const foreignOnly = await legacyClass(external, '仅外机构名称');
  const fromLegacy = await post('/classes', classForm(legacy.courseType));
  const legacyCourse = await db.course.findFirstOrThrow({ where: { organizationId: own.organizationId, name: legacy.courseType } });
  assert.equal((await post('/schedules', slot(fromLegacy, '2041-04-01'))).courseId, legacyCourse.id);
  assert.equal((await post('/classes', classForm(foreignOnly.courseType), 400)).code, 'COURSE_NOT_FOUND');
  assert.equal((await post('/classes', classForm('不存在'), 400)).code, 'COURSE_NOT_FOUND');
  const foreignCourse = await request('POST', '/courses', foreignAdmin.token, { name: '跨机构课程' }, 201);
  await post('/schedules', { ...slot(cls, '2041-05-01'), courseId: foreignCourse.id }, 403);
  await post('/schedules', slot(other, '2041-05-01'), 403);
  await request('POST', '/schedules', teacher.token, slot(cls, '2041-05-01'), 403);
  await request('PUT', '/classes/' + cls.id, foreignAdmin.token, { courseType: foreignCourse.name }, 403);
  const explicit = await post('/schedules', { ...slot(cls, '2041-06-01'), courseId: legacyCourse.id });
  assert.equal(explicit.courseId, legacyCourse.id);
  await post('/schedules', { ...slot(cls, '2041-06-01'), courseId: replacementType.id }, 409);
  console.log('PASS class selection from local legacy names only, cross-tenant/role rejection, explicit caller compatibility');

  const unchanged = await db.schedule.create({ data: { ...own, classId: legacy.id, teacherId: null, startTime: new Date('2043-01-01T02:00:00Z'), endTime: new Date('2043-01-01T03:00:00Z') } });
  const retry = await post('/schedules', slot(legacy, '2043-01-01'));
  assert.equal(retry.id, unchanged.id);
  assert.equal(retry.courseId, null);
  const version = await request('GET', '/classes/' + activeSibling.id, admin.token);
  const replace = { ...recurring(activeSibling, '2042-01-01', '2042-01-02'), requestId: randomUUID(), expectedClassUpdatedAt: version.updatedAt };
  const rebuilt = await post('/schedules/replace-recurring', replace);
  assert.ok(rebuilt.schedules.every(row => row.courseId === original.id));
  assert.equal((await post('/schedules/replace-recurring', replace)).replayed, true);

  const rollbackClass = await legacyClass(own, '排课回滚类型', { teacherId: teacher.id });
  const conflict = await post('/schedules/recurring', recurring(rollbackClass, '2039-12-31', '2040-01-01'), 409);
  assert.equal(conflict.code, 'SCHEDULE_CONFLICT');
  assert.equal(await db.schedule.count({ where: { classId: rollbackClass.id } }), 0);
  assert.equal(await db.course.count({ where: { organizationId: own.organizationId, name: rollbackClass.courseType } }), 0);
  console.log('PASS old unclassified retry, preserved inactive type on atomic replacement/replay, conflict fully rolls back directory and slots');
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
  await db.$disconnect();
  if (created) run('dropdb', [database]);
  fs.rmSync(scratch, { recursive: true, force: true });
}
(async () => {
  try {
    await start();
    await verify();
  } finally {
    await cleanup();
  }
  console.log('PASS isolated service stopped and database removed: ' + database);
})().catch(error => { console.error(error); process.exitCode = 1; });
