'use strict';

// Isolated PostgreSQL acceptance. Exercise the TS controllers and the actual attendance transaction.
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { randomBytes, randomUUID } = require('node:crypto');
const os = require('node:os');
const path = require('node:path');
const { Client } = require('pg');
const { setTimeout: wait } = require('node:timers/promises');

const backend = path.resolve(__dirname, '..');
const database = 'course_review_schedule_' + randomBytes(8).toString('hex');
const user = process.env.CORE_TEST_PGUSER || os.userInfo().username;
const password = process.env.CORE_TEST_PGPASSWORD || '';
const port = String(Number(process.env.CORE_TEST_PGPORT || 5432));
const url = new URL('postgresql://127.0.0.1:' + port + '/' + database);
url.username = user;
url.password = password;
Object.assign(process.env, {
  DATABASE_URL: url.href, DATABASE_DIRECT_URL: url.href, NODE_ENV: 'test',
  PGHOST: '127.0.0.1', PGPORT: port, PGUSER: user, PGPASSWORD: password,
});
require('tsx/cjs');
const db = require('../src/config/database').default;
const { scheduleController } = require('../src/controllers/scheduleController');
const { submitScheduleAttendance } = require('../src/services/scheduleAttendanceService');

const run = (binary, args) => execFileSync(binary, args, { cwd: backend, timeout: 120000, stdio: 'pipe' });
const day = offset => new Date(Date.now() + (offset * 24 + 8) * 3600000).toISOString().slice(0, 10);
const at = (date, time) => new Date(date + 'T' + time + '+08:00');
let created = false;
async function main() {
  run('createdb', [database]);
  created = true;
  run(process.execPath, [require.resolve('prisma/build/index.js'), 'migrate', 'deploy']);
  assert.equal((await db.$queryRaw`SELECT current_database() AS name`)[0].name, database);
  const org = await db.organization.create({ data: { code: 'TEST', name: '课程审查' } });
  const campus = await db.campus.create({ data: { organizationId: org.id, name: '测试校区', code: 'CAMPUS' } });
  const scope = { organizationId: org.id, campusId: campus.id };
  const makeUser = (role, name) => db.user.create({ data: { ...scope, role, name, email: name + '@test.invalid', password: 'test-only' } });
  const actor = await makeUser('admin', 'admin'), teacher = await makeUser('coach', 'teacher');
  const cls = await db.class.create({ data: { ...scope, name: '篮球班', code: 'BB', courseType: '篮球', teacherId: teacher.id } });
  const classId = cls.id, firstDay = day(8), secondDay = day(15);
  const rule = { weekday: new Date(firstDay).getUTCDay(), startTime: '18:00', endTime: '19:00' };
  await db.classWeeklyRule.create({ data: { organizationId: org.id, classId, ...rule } });
  const slot = (date, end = '19:00') => ({ ...scope, classId, teacherId: teacher.id, startTime: at(date, '18:00'), endTime: at(date, end) });
  const makeRow = data => db.schedule.create({ data });
  const row = await makeRow(slot(firstDay));
  const status = async id => (await db.schedule.findUniqueOrThrow({ where: { id } })).status;
  const student = await db.student.create({ data: { ...scope, name: '测试学员', remainingLessons: 5 } });
  async function call(method, body, id) {
    let result;
    const res = { status() { return this; }, json(value) { result = JSON.parse(JSON.stringify(value.data)); } };
    await scheduleController[method]({ user: actor, body, params: { id } }, res, error => { throw error; });
    return result;
  }
  const change = action => call('setClassRuleSlotStatus', { classId, action, ...rule });
  const attendance = status => submitScheduleAttendance(actor, row.id, [{ studentId: student.id, temporary: true, status }]);
  const stats = async () => ({
    status: await status(row.id),
    remaining: (await db.student.findUniqueOrThrow({ where: { id: student.id } })).remainingLessons,
    logs: await db.lessonLog.count({ where: { scheduleId: row.id } }),
    attendance: await db.attendance.count({ where: { scheduleId: row.id } }),
    net: (await db.lessonDeductionRecord.findUnique({ where: { scheduleId: row.id } }))?.deductionCount,
  });

  // Queue both production transactions behind a third connection's occurrence lock.
  // pg_locks confirms the second caller is actually waiting before either can proceed.
  async function race(first, second) {
    const gate = new Client({ connectionString: url.href });
    await gate.connect();
    try {
      await gate.query('SELECT pg_advisory_lock(hashtext($1))', [row.id]);
      async function waiters(count) {
        const until = Date.now() + 6000;
        do {
          const { rows } = await gate.query(`SELECT count(*)::int AS n FROM pg_locks waiting JOIN pg_locks held
            USING (database, classid, objid, objsubid, locktype)
            WHERE held.pid = pg_backend_pid() AND held.granted AND NOT waiting.granted AND held.locktype = 'advisory'`);
          if (rows[0].n === count) return;
          await wait(20);
        } while (Date.now() < until);
        throw new Error('Did not observe ' + count + ' blocked occurrence writer(s)');
      }
      const a = Promise.allSettled([first()]);
      await waiters(1);
      const b = Promise.allSettled([second()]);
      await waiters(2);
      await gate.query('SELECT pg_advisory_unlock(hashtext($1))', [row.id]);
      return [(await a)[0], (await b)[0]];
    } finally { await gate.end(); }
  }
  const [paused, blocked] = await race(() => change('pause'), () => attendance('present'));
  assert.equal(paused.value?.changed, 1);
  assert.equal(blocked.reason?.code, 'CLASS_UNAVAILABLE');
  assert.deepEqual(await stats(), { status: 'class_paused', remaining: 5, logs: 0, attendance: 0, net: undefined });
  assert.equal((await change('resume')).changed, 1);
  const [attended, skipped] = await race(() => attendance('present'), () => change('pause'));
  assert.equal(attended.value?.success, 1);
  assert.deepEqual(skipped.value, { changed: 0, matched: 1, skippedHistory: 1 });
  assert.deepEqual(await stats(), { status: 'completed', remaining: 4, logs: 1, attendance: 1, net: 1 });
  await attendance('leave');
  assert.deepEqual(await stats(), { status: 'completed', remaining: 5, logs: 2, attendance: 1, net: 0 });
  console.log('PASS C01 two PostgreSQL lock orderings, correction, balance, ledger and deduction count');

  const exact = await makeRow(slot(secondDay));
  const adjusted = await makeRow(slot(day(22), '20:00'));
  const overnight = await makeRow({ ...slot(day(29)), endTime: at(day(30), '19:00') });
  const withLedger = await makeRow(slot(day(36)));
  await db.lessonDeductionRecord.create({ data: { organizationId: org.id, classId, scheduleId: withLedger.id, deductionCount: 0, deductionDate: day(36) } });
  assert.deepEqual(await change('pause'), { changed: 1, matched: 2, skippedHistory: 1 });
  assert.equal(await status(adjusted.id), 'scheduled');
  assert.equal(await status(overnight.id), 'scheduled');
  for (const id of [adjusted.id, overnight.id, withLedger.id]) {
    await db.schedule.update({ where: { id }, data: { status: 'class_paused' } });
  }
  assert.deepEqual(await change('resume'), { changed: 1, matched: 2, skippedHistory: 1 });
  for (const id of [adjusted.id, overnight.id, withLedger.id]) assert.equal(await status(id), 'class_paused');
  console.log('PASS C07 exact Shanghai interval on pause and resume, including next-day end');

  const generate = (opts = {}) => ({ classId, startDate: secondDay, endDate: day(22), requestId: randomUUID(), expectedClassUpdatedAt: cls.updatedAt.toISOString(), ...opts });
  const body = generate();
  const generateCall = body => call('generateFromClassRules', body);
  const racing = await Promise.all([generateCall(body), generateCall(body)]);
  const first = racing.find(result => !result.replayed);
  const sameRequest = racing.filter(result => result.replayed);
  assert.equal(sameRequest.length, 1);
  assert.deepEqual(sameRequest[0], { ...first, replayed: true });
  assert.equal(first.createdCount, 1);
  assert.equal(first.reusedCount, 1);
  assert.equal(first.schedules[0].id, exact.id);
  async function replay(input, original) {
    assert.deepEqual(await generateCall(input), { ...original, replayed: true });
  }
  const allBody = generate();
  const all = await generateCall(allBody);
  assert.deepEqual([all.createdCount, all.reusedCount], [0, 2]);
  await db.schedule.update({ where: { id: exact.id }, data: { notes: 'generation snapshot must stay immutable' } });
  await replay(body, first);
  await replay(allBody, all);
  await assert.rejects(generateCall({ ...allBody, endDate: day(29) }), { code: 'SCHEDULE_REQUEST_CONFLICT' });
  await assert.rejects(generateCall(generate({ selectedRules: [rule], replaceFuture: true })), { code: 'INVALID_PARAMS' });
  assert.equal(await status(exact.id), 'scheduled');
  console.log('PASS mixed/all reuse durable replay, changed payload conflict and protected subset replacement');

  const failingBody = generate({ startDate: day(43), endDate: day(43) });
  const before = await db.schedule.count({ where: { classId } });
  // A failing final receipt insert rolls back the preceding occurrence insert.
  await db.$executeRawUnsafe(`CREATE FUNCTION reject_receipt() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 'receipt test failure'; END; $$`);
  await db.$executeRawUnsafe('CREATE TRIGGER reject_receipt BEFORE INSERT ON schedule_generation_receipts FOR EACH ROW EXECUTE FUNCTION reject_receipt()');
  await assert.rejects(generateCall(failingBody), /receipt test failure/);
  await db.$executeRawUnsafe('DROP TRIGGER reject_receipt ON schedule_generation_receipts');
  assert.equal(await db.schedule.count({ where: { classId } }), before);
  assert.equal(await db.scheduleGenerationReceipt.count({ where: { requestId: failingBody.requestId } }), 0);
  console.log('PASS failed receipt insert rolls back the occurrence');

  await db.user.update({ where: { id: teacher.id }, data: { isActive: false } });
  await assert.rejects(call('createSchedule', { classId, startTime: at(day(43), '18:00'), endTime: at(day(43), '19:00') }), { code: 'FORBIDDEN' });
  await assert.rejects(generateCall(generate()), { code: 'FORBIDDEN' });
  await assert.rejects(call('reschedule', { newStartTime: at(day(50), '18:00'), newEndTime: at(day(50), '19:00') }, exact.id), { code: 'FORBIDDEN' });
  assert.equal((await change('pause')).changed, 2);
  await assert.rejects(change('resume'), { code: 'FORBIDDEN' });
  assert.equal(await status(exact.id), 'class_paused');
  assert.equal((await db.schedule.findUniqueOrThrow({ where: { id: row.id } })).teacherId, teacher.id);
  await replay(allBody, all);
  console.log('PASS C06 inactive teacher rejection, historical owner and previously committed replay preserved');

  await db.user.update({ where: { id: teacher.id }, data: { isActive: true } });
  const offRule = await makeRow({ ...slot(day(44)), endTime: at(day(44), '20:00') });
  const replacement = generate({ replaceFuture: true, startDate: day(50), endDate: day(50) });
  const replaced = await generateCall(replacement);
  assert.equal(await status(offRule.id), 'cancelled');
  assert.equal(await status(row.id), 'completed');
  assert.equal(replaced.createdCount, 1);
  await replay(replacement, replaced);
  console.log('PASS whole-class replacement cancels scheduled future rows beyond the generation range');
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  await db.$disconnect();
  if (created) run('dropdb', [database]);
});
