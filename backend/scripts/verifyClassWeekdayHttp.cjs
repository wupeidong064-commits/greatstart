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
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'greatstart-class-weekday-'));
const database = 'class_weekday_' + randomBytes(8).toString('hex');
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
  assert.match(database, /^class_weekday_[0-9a-f]{16}$/);
  env.PGPORT = String(await availablePort());
  assert.notEqual(env.PGPORT, '5432');
  const passwordFile = path.join(scratch, 'pg-password');
  fs.writeFileSync(passwordFile, password + '\n', { mode: 0o600 });
  run('initdb', ['-D', cluster, '-U', user, '-A', 'scram-sha-256', '--pwfile', passwordFile, '--no-locale', '--encoding', 'UTF8']);
  fs.unlinkSync(passwordFile);
  fs.appendFileSync(path.join(cluster, 'postgresql.conf'), "\nshared_buffers = '8MB'\nmax_connections = 18\nmax_wal_senders = 0\nmax_worker_processes = 2\nautovacuum_max_workers = 1\ntimezone = 'America/Los_Angeles'\nlisten_addresses = '127.0.0.1'\nunix_socket_directories = ''\nport = " + env.PGPORT + '\n');
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
const checks = [];
const check = (name, observed) => { checks.push({ name, observed }); console.log('PASS ' + name); };
async function get(route, token) {
  const response = await fetch('http://127.0.0.1:' + port + '/api/classes' + route, {
    headers: { authorization: 'Bearer ' + token }, signal: AbortSignal.timeout(15000),
  });
  const result = await response.json();
  assert.equal(response.status, 200, JSON.stringify(result));
  return result;
}

async function verify() {
  const local = await scope('星期验收机构'), foreign = await scope('外机构');
  const campus = await db.campus.create({ data: { organizationId: local.organizationId, name: '同机构其他校区', code: 'SECOND' } });
  const neighbor = { organizationId: local.organizationId, campusId: campus.id };
  const manager = await account(local, 'manager'), teacher = await account(local, 'coach');
  const make = (name, extra) => klass(local, name, extra);
  const tuesday = await make('周一基础班', { teacherId: teacher.id });
  const sunday = await make('游泳初级', { teacherId: teacher.id });
  const multiple = await make('器械训练');
  const excluded = await make('旧排课班');
  const ruleOnly = await make('规则班', { scheduleRule: { recurrenceType: 'weekly', weekDays: [5] } });
  const ongoing = await make('进行中班');
  const neighborClass = await klass(neighbor, '其他校区班'), foreignClass = await klass(foreign, '外机构班');
  const schedule = (cls, start, status = 'scheduled', scope = local, end) => db.schedule.create({ data: {
    ...scope, classId: cls.id, status, startTime: new Date(start), endTime: end ? new Date(end) : new Date(+new Date(start) + 3600000),
  } });
  await schedule(tuesday, '2040-01-03T00:30:00+08:00');
  await schedule(sunday, '2040-01-01T00:30:00+08:00');
  await schedule(multiple, '2040-01-02T10:30:00+08:00');
  await schedule(multiple, '2040-01-04T11:30:00+08:00');
  await schedule(multiple, '2040-01-09T14:30:00+08:00');
  for (const [day, status] of [['05', 'cancelled'], ['06', 'rescheduled'], ['07', 'completed']]) {
    await schedule(excluded, '2040-01-' + day + 'T10:00:00+08:00', status);
  }
  await schedule(excluded, '2019-01-01T10:30:00+08:00');
  // The end time is still in the future, even though this lesson has already begun.
  const started = new Date(Date.now() - 10 * 60000);
  const activeDay = new Date(+started + 8 * 3600000).getUTCDay();
  await schedule(ongoing, started, 'scheduled', local, new Date(Date.now() + 3600000));
  await schedule(foreignClass, '2040-01-05T10:00:00+08:00', 'scheduled', foreign);
  await schedule(neighborClass, '2040-01-06T10:00:00+08:00', 'scheduled', neighbor);
  // Legacy imports may link an authorized class ID to a mismatched institution/campus.
  // Both rows are valid under the independent FKs, and neither should affect the class.
  await schedule(ruleOnly, '2040-01-05T10:00:00+08:00', 'scheduled', foreign);
  await schedule(ruleOnly, '2040-01-06T10:00:00+08:00', 'scheduled', neighbor);

  const initial = await get('?pageSize=100', manager.token);
  const priority = await get('/experience-priority', manager.token);
  const days = (data, cls) => data.find(row => row.id === cls.id)?.scheduleWeekDays;
  const endpoints = [initial.data, priority.data];
  for (const data of endpoints) {
    assert.deepEqual(days(data, tuesday), [2]);
    assert.deepEqual(days(data, sunday), [0]);
    assert.deepEqual(days(data, multiple), [1, 3]);
  }
  check('上海午夜跨日、真实场次优先于班名、多场星期去重', { tuesday: [2], sunday: [0], multiple: [1, 3], serverTimezone: 'America/Los_Angeles' });
  for (const data of endpoints) {
    assert.deepEqual(days(data, excluded), []);
    assert.deepEqual(days(data, ongoing), [activeDay]);
  }
  check('取消、已调走、已完成和已结束场次排除；进行中保留', { excluded: [], ongoing: [activeDay] });
  for (const data of endpoints) {
    assert.deepEqual(days(data, ruleOnly), [], '旧规则或错位的外校区/机构场次不能贡献星期');
    assert.equal(days(data, neighborClass), undefined);
    assert.equal(days(data, foreignClass), undefined);
  }
  check('两个接口均隔离其他校区、机构、错位排课；只有规则无有效场次为空', { ownClasses: initial.data.length, ruleOnly: [] });

  const paged = [];
  for (let page = 1; page <= 3; page++) {
    const result = await get('?page=' + page + '&pageSize=2', manager.token);
    assert.deepEqual(result.pagination, { page, pageSize: 2, total: 6, totalPages: 3 });
    assert.equal(result.data.length, 2);
    paged.push(...result.data);
  }
  assert.deepEqual(paged.map(row => [row.id, row.scheduleWeekDays]), initial.data.map(row => [row.id, row.scheduleWeekDays]));
  assert.deepEqual(priority.data.map(row => row.id).sort(), initial.data.map(row => row.id).sort());
  const teacherRows = await get('?teacherId=' + teacher.id, manager.token);
  assert.deepEqual(teacherRows.data.map(row => row.id).sort(), [tuesday.id, sunday.id].sort());
  const filtered = await get('?teacherId=' + teacher.id + '&search=' + encodeURIComponent('周一'), manager.token);
  assert.deepEqual(filtered.data.map(row => [row.id, row.scheduleWeekDays]), [[tuesday.id, [2]]]);
  const empty = await get('?search=' + encodeURIComponent('不存在的班级'), manager.token);
  assert.deepEqual(empty.data, []);
  assert.deepEqual(empty.pagination, { page: 1, pageSize: 10, total: 0, totalPages: 0 });
  check('分页、体验优先、教练及搜索组合筛选保留；零结果页成功', { total: 6, pages: 3, teacherResults: teacherRows.data.length, combinedResults: filtered.data.length, empty: empty.pagination });
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
  const beganAt = new Date().toISOString();
  let failure;
  let cleanupComplete = false;
  try { await start(); await verify(); }
  catch (error) { failure = error; }
  try { await cleanup(); cleanupComplete = true; }
  catch (error) { failure ||= error; }
  const evidence = { passed: !failure, beganAt, finishedAt: new Date().toISOString(), checks, database,
    databasePort: env.PGPORT, httpPort: port, cleanupComplete, businessDatabaseUsed: false, realModelRequests: 0,
    ...(failure ? { failure: failure.message } : {}) };
  const directory = path.join(backend, '../docs/acceptance/2026-11-07-class-weekday');
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, 'weekday-http.json'), JSON.stringify(evidence, null, 2) + '\n');
  if (failure) throw failure;
  console.log('PASS ' + checks.length + ' groups; private PostgreSQL and HTTP stopped and database removed: ' + database);
})().catch(error => { console.error(error); process.exitCode = 1; });
