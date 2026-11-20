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
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'greatstart-class-deletion-'));
const database = 'class_deletion_' + randomBytes(8).toString('hex');
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
  assert.match(database, /^class_deletion_[0-9a-f]{16}$/);
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
  db = new PrismaClient({ datasources: { db: { url: url + '?connection_limit=4' } } });
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
function passed(label) { checks.push(label); console.log('PASS ' + label); }

async function request(method, suffix, token, body, resource='classes') {
  const res = await fetch('http://127.0.0.1:' + port + '/api/' + resource + suffix, {
    method, headers: { 'Content-Type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(20000),
  });
  return { status: res.status, json: await res.json() };
}

function expect(result, status, code) {
  assert.equal(result.status, status, JSON.stringify(result));
  if (code) assert.equal(result.json.error.code, code, JSON.stringify(result));
  return result.json;
}

async function waitForLock(fragment) {
  // Observe the actual PostgreSQL wait before releasing the other transaction.
  for (let i = 0; i < 100; i++) {
    const rows = await db.$queryRaw`
      SELECT 1 FROM pg_stat_activity WHERE pid <> pg_backend_pid() AND datname = current_database()
        AND wait_event_type = 'Lock' AND query ILIKE ${'%' + fragment + '%'} LIMIT 1`;
    if (rows.length) return;
    await delay(20);
  }
  throw Error('Expected a waiting transaction: ' + fragment);
}

async function verify() {
  const home = await scope('本机构'), foreign = await scope('外机构');
  const otherCampus = await db.campus.create({ data: { organizationId: home.organizationId, name: '另一校区', code: 'OTHER' } });
  const manager = await account(home, 'manager'), admin = await account(home, 'admin');
  const coach = await account(home, 'coach'), outside = await account(foreign, 'admin');
  const across = await account({ ...home, campusId: otherCampus.id }, 'manager');
  const student = await db.student.create({ data: { ...home, name: '隔离学员' } });
  const remove = (cls, person = manager) => request('DELETE', '/' + cls.id, person.token);
  const row = cls => db.class.findUnique({ where: { id: cls.id } });
  const changeStatus = (cls, status, person = manager) => request('PUT', '/' + cls.id, person.token, { status });

  await db.course.create({ data: { organizationId: home.organizationId, name: '篮球', code: randomUUID() } });
  const form = { name: '误建班', courseType: '篮球', code: randomUUID() };
  const fresh = expect(await request('POST', '', manager.token, form), 201).data;
  const missing = expect(await remove({ id: randomUUID() }), 404, 'CLASS_NOT_FOUND').error;
  assert.deepEqual(expect(await remove(fresh, outside), 404).error, missing);
  assert.deepEqual(expect(await remove(fresh, across), 404).error, missing);
  expect(await remove(fresh, coach), 403, 'FORBIDDEN');
  expect(await request('DELETE', '/' + fresh.id), 401);
  assert(await row(fresh));
  passed('无凭证及教练被拒，跨机构、跨校区与不存在返回相同错误');
  expect(await remove(fresh), 200);
  assert.equal(await row(fresh), null);
  expect(await remove(fresh), 404, 'CLASS_NOT_FOUND');
  expect(await changeStatus(fresh, 'active'), 404, 'CLASS_NOT_FOUND');
  expect(await request('GET', '/' + fresh.id, admin.token), 404, 'CLASS_NOT_FOUND');
  assert.equal(expect(await request('GET', '?search=' + encodeURIComponent(form.name), admin.token), 200).data.length, 0);
  const recreated = expect(await request('POST', '', admin.token, form), 201).data;
  assert.notEqual(recreated.id, fresh.id);
  expect(await changeStatus(recreated, 'inactive', admin), 200);
  expect(await remove(recreated, admin), 200);
  assert.equal(await row(recreated), null);
  passed('空班永久删除、详情和列表无记录、重复删除与尝试复课均 404；同码重建使用新 ID，停课空班亦可删');

  const org = { organizationId: home.organizationId };
  const transferPeer = await klass(home, '转班另一端');
  const schedData = classId => ({ ...home, classId, startTime: new Date('2020-02-01T03:00Z'), endTime: new Date('2020-02-01T04:00Z'), status: 'completed' });
  const conversion = classId => ({ ...org, classId, studentId: student.id, studentName: student.name, contact: '隔离', conversionDate: '2020-02-01', approvalStatus: 'rejected' });
  const transfer = (fromClassId, toClassId) => ({ ...org, studentId: student.id, fromClassId, toClassId, transferredLessons: 1, status: 'cancelled' });
  const specs = [
    ['报名', 'enrollment', classId => ({ ...org, classId, studentId: student.id, status: 'transferred', endedAt: new Date() })],
    ['排课', 'schedule', schedData],
    ['考勤', 'attendance', async classId => ({
      ...org, classId, studentId: student.id, status: 'leave', scheduleId: (await db.schedule.create({ data: schedData(classId) })).id,
    })],
    ['成单', 'conversion', conversion],
    ['体验课', 'experienceLesson', classId => ({ ...org, classId, studentName: student.name, contact: '隔离', scheduleDate: '2020-02-01', status: 'cancelled' })],
    ['转出', 'lessonTransfer', classId => transfer(classId, transferPeer.id)],
    ['转入', 'lessonTransfer', classId => transfer(transferPeer.id, classId)],
    ['退款', 'refund', classId => ({
      ...org, classId, studentId: student.id, studentName: student.name, lessonsToRefund: 1,
      amountToRefund: 1, reason: '隔离退款', submittedById: manager.id, status: 'rejected',
    })],
    ['划课', 'lessonDeductionRecord', classId => ({ ...org, classId, deductionDate: '2020-02-01' })],
    ['资源交接', 'resourceTransfer', classId => ({
      ...org, fromTeacherId: manager.id, toTeacherId: coach.id, transferDetails: { classes: [classId] },
    })],
  ];

  for (const [label, model, fixture] of specs) {
    const cls = await klass(home, label);
    const record = await db[model].create({ data: await fixture(cls.id) });
    expect(await remove(cls), 200);
    const deleted = await row(cls);
    assert.deepEqual(deleted, {...cls, status:'deleted', updatedAt:deleted.updatedAt});
    expect(await changeStatus(cls, 'active'), 404);
    assert.deepEqual(await db[model].findUnique({ where: { id: record.id } }), record);
  }
  passed('10 个关联类别逐项删除，原始业务记录逐字段保留，不能恢复');

  const history = await klass(home, '综合历史班', { scheduleRule: { weekDays: [2, 4] } });
  const records = [];
  for (const [label, model, fixture] of specs) {
    const record = await db[model].create({ data: await fixture(history.id) });
    records.push({ model, record, label });
  }
  for (const status of ['inactive', 'active']) {
    expect(await changeStatus(history, status), 200);
    const current = await row(history);
    assert.deepEqual(current, { ...history, status, updatedAt: current.updatedAt });
  }
  const api=(method,resource,suffix,body)=>request(method,suffix,admin.token,body,resource);
  const summary=()=>api('GET','cashflow-summary','');
  const cashBefore=expect(await summary(),200).data;
  const upcoming = { ...home, classId:history.id, startTime:new Date(Date.now()+86400000), endTime:new Date(Date.now()+90000000),status:'scheduled' };
  const pending = await db.schedule.create({data:upcoming});
  const protectedRow = await db.schedule.create({data:{...upcoming,classroom:'一教室'}});
  const attendance = await db.attendance.create({data:{...org,scheduleId:protectedRow.id,classId:history.id,studentId:student.id,status:'leave'}});
  const enrollment = await db.enrollment.create({data:{...org,classId:history.id,studentId:student.id,status:'active'}});
  const before = await db.student.findUnique({where:{id:student.id}});
  expect(await remove(history),200);
  expect(await remove(history),404);
  expect(await changeStatus(history,'active'),404);
  expect(await request('GET','/'+history.id,admin.token),404);
  for(const query of ['', '&status=active', '&status=inactive', '&status=deleted']){
    assert.equal(expect(await request('GET','?search='+encodeURIComponent(history.name)+query,admin.token),200).data.length,0);
  }
  for (const {model,record} of records) assert.deepEqual(await db[model].findUnique({where:{id:record.id}}),record);
  assert.deepEqual(await db.enrollment.findUnique({where:{id:enrollment.id}}),enrollment);
  assert.deepEqual(await db.student.findUnique({where:{id:student.id}}),before);
  assert.deepEqual(await db.attendance.findUnique({where:{id:attendance.id}}),attendance);
  assert.deepEqual(await db.schedule.findUnique({where:{id:protectedRow.id}}),protectedRow);
  assert.equal((await db.schedule.findUnique({where:{id:pending.id}})).status,'cancelled');
  passed('已删班从详情及所有班级筛选消失；报名、学生余课及历史记录不变；未来无人点名场次取消，已有点名原样保留');
  // A report read has a new generation timestamp; its business figures must stay unchanged.
  const cashAfter=expect(await summary(),200).data;
  assert.deepEqual({...cashAfter,generatedAt:cashBefore.generatedAt},cashBefore);
  assert(cashBefore.newSignup.conversions > 0);
  const enrollRows=expect(await api('GET','enrollments','?classId='+history.id),200).data;
  assert(enrollRows.some(e=>e.class.name===history.name));
  const convRows=expect(await api('GET','conversions','?classId='+history.id),200).data;
  assert(convRows.some(c=>c.id===records.find(r=>r.model==='conversion').record.id));
  passed('历史报名、成单查询可见，删除前后本校区现金流汇总逐字段完全相同');
  const present=expect(await api('GET','schedules','/'+protectedRow.id),200).data;
  assert.equal(present.class.name,history.name);
  const pendingRows=expect(await api('GET','schedules','?classId='+history.id+'&status=scheduled'),200).data;
  assert(!pendingRows.some(r=>r.id===protectedRow.id));
  const deletedList = expect(await api('GET','schedules','?classId='+history.id),200).data;
  assert(!deletedList.some(r=>[pending.id,protectedRow.id].includes(r.id)));
  expect(await api('POST','schedules','',upcoming),403);
  const day=upcoming.startTime.toISOString().slice(0,10);
  const recurring={classId:history.id,recurrenceType:'daily',startDate:day,endDate:day,startTime:'09:00',endTime:'10:00'};
  expect(await api('POST','schedules','/recurring',recurring),403);
  expect(await api('POST','schedules','/replace-recurring',{...recurring,requestId:randomUUID(),expectedClassUpdatedAt:history.updatedAt.toISOString()}),403);
  expect(await api('PUT','schedules','/'+protectedRow.id,{notes:'修改'}),403);
  expect(await api('POST','schedules','/'+protectedRow.id+'/reschedule',{newStartTime:upcoming.startTime,newEndTime:upcoming.endTime}),403);
  expect(await api('POST','attendances','/batch',{scheduleId:protectedRow.id,studentIds:[student.id],status:'present'}),409,'CLASS_UNAVAILABLE');
  expect(await api('POST','enrollments','',{classId:history.id,studentId:student.id}),409,'CLASS_UNAVAILABLE');
  const basketball=await db.course.findFirstOrThrow({where:{...org,name:'篮球'}});
  expect(await api('POST','schedules','',{...upcoming,classId:transferPeer.id,courseId:basketball.id,classroom:protectedRow.classroom}),201);
  const profile=expect(await api('GET','students','/'+student.id),200).data;
  assert(!profile.enrollments.some(e=>e.class.id===history.id));
  passed('直接创建、循环排课、更换规则、调课、编辑、签到、报名均拒绝；历史课表详情仍解析班名，学员当前班级排除已删班');

  const invalidImport={type:'classes',duplicateStrategy:'update',data:[{name:history.name,courseType:'篮球',status:'active'}],duplicates:[{existingRecord:{id:history.id}}]};
  expect(await api('POST','import','/execute',invalidImport),403);
  expect(await changeStatus(transferPeer,'deleted'),400,'USE_CLASS_DELETE');
  assert.equal((await row(history)).status,'deleted');
  passed('导入显式覆盖已删ID和绕过 DELETE 的普通状态更新均被拒绝');

  const double = await klass(home, '并发删除');
  const responses = await Promise.all([remove(double), remove(double)]);
  assert.deepEqual(responses.map(r => r.status).sort(), [200, 404]);
  assert.equal(await row(double), null);
  passed('同时删除同一空班只成功一次');

  const writerFirst = await klass(home, '先写成单');
  let deletion;
  const committed = await db.$transaction(async tx => {
    const record = await tx.conversion.create({ data: conversion(writerFirst.id) });
    deletion = remove(writerFirst);
    await waitForLock('SELECT id FROM classes');
    return record;
  }, { timeout: 10000 });
  expect(await deletion,200);
  assert.equal((await row(writerFirst)).status,'deleted');
  assert.deepEqual(await db.conversion.findUnique({ where: { id: committed.id } }), committed);
  passed('未提交的成单先占外键锁，DELETE 等待后成功，历史引用完整');

  // Hold the real attendance request just before commit. Deletion must wait on the
  // occurrence before taking the class lock, then see the committed attendance.
  const racingClass=await klass(home,'点名与删除同时进行');
  const racingOccurrence=await db.schedule.create({data:{...upcoming,classId:racingClass.id}});
  await db.enrollment.create({data:{...org,classId:racingClass.id,studentId:student.id,status:'active'}});
  await db.$executeRawUnsafe("CREATE FUNCTION hold_test_attendance() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.status='completed' THEN PERFORM pg_advisory_xact_lock(991234); END IF; RETURN NEW; END $$");
  await db.$executeRawUnsafe("CREATE TRIGGER hold_test_attendance BEFORE UPDATE ON schedules FOR EACH ROW EXECUTE FUNCTION hold_test_attendance()");
  let mark, removeAfterMark;
  await db.$transaction(async tx=>{
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(991234)`;
    mark=api('POST','attendances','/batch',{scheduleId:racingOccurrence.id,studentIds:[student.id],status:'leave'});
    await waitForLock('UPDATE');
    removeAfterMark=remove(racingClass);
    await waitForLock('SELECT pg_advisory_xact_lock(hashtext');
  },{timeout:10000});
  expect(await mark,200);
  expect(await removeAfterMark,200);
  assert.equal((await row(racingClass)).status,'deleted');
  assert.equal((await db.schedule.findUnique({where:{id:racingOccurrence.id}})).status,'completed');
  assert.equal(await db.attendance.count({where:{scheduleId:racingOccurrence.id,status:'leave'}}),1);
  passed('真实签到事务先持场次锁，删除等待其提交；签到历史、已完成场次与删除结果一致');

  // Hold DELETE after its checks so a simultaneous foreign-key insert must wait
  // for the class row lock. The trigger exists only in this private database.
  const deleteFirst = await klass(home, '先永久删除');
  await db.$executeRawUnsafe('CREATE FUNCTION hold_test_delete() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_advisory_xact_lock(991233); RETURN OLD; END $$');
  await db.$executeRawUnsafe('CREATE TRIGGER hold_test_delete BEFORE DELETE ON classes FOR EACH ROW EXECUTE FUNCTION hold_test_delete()');
  let winningDelete, losingInsert;
  await db.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(991233)`;
    winningDelete = remove(deleteFirst);
    await waitForLock('DELETE FROM');
    losingInsert = db.conversion.create({ data: conversion(deleteFirst.id) }).then(() => null, err => err.code);
    await waitForLock('INSERT INTO');
  }, { timeout: 10000 });
  expect(await winningDelete, 200);
  assert.equal(await losingInsert, 'P2003');
  assert.equal(await row(deleteFirst), null);
  assert.equal(await db.conversion.count({ where: { classId: deleteFirst.id } }), 0);
  passed('DELETE 已锁行时，迟到的成单等待并被外键拒绝，未产生悬空或被置空的历史');
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
  try {
    await start();
    await verify();
    await require('./verifyClassPauseCases.cjs')({ db, scope, account, klass, request, expect, passed });
  }
  catch (error) { failure = error; }
  try { await cleanup(); cleanupComplete = true; }
  catch (error) { failure ||= error; }
  const evidence = { passed: !failure, beganAt, finishedAt: new Date().toISOString(), checks, database,
    databasePort: env.PGPORT, httpPort: port, cleanupComplete, businessDatabaseUsed: false, realModelRequests: 0,
    ...(failure ? { failure: failure.message } : {}) };
  console.log(JSON.stringify(evidence));
  if (failure) throw failure;
})().catch(error => { console.error(error); process.exitCode = 1; });
