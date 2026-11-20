/** Real HTTP + PostgreSQL regression; creates and drops only its random private database.
 * cd backend && TZ=America/Los_Angeles npx tsx scripts/verifyLowAttendanceEnrollment.ts
 * AI data functions run locally; no provider or model invocation.
 */
import assert from 'node:assert/strict';
import { Client } from 'pg';
import { execFileSync } from 'node:child_process';
import { userInfo } from 'node:os';
import { randomBytes } from 'node:crypto';
import express from 'express';
import jwt from 'jsonwebtoken';

async function main() {
  const database = 'low_enrollment_' + randomBytes(6).toString('hex');
  assert.match(database, /^low_enrollment_[0-9a-f]{12}$/);
  const admin = new Client({ connectionString: `postgresql://${encodeURIComponent(userInfo().username)}@127.0.0.1:5432/postgres` });
  let created = false, prisma: any, server: any;
  const OriginalDate = Date, now = +new Date('2026-11-10T08:30:00Z'), day = 86400000;
  const checks: string[] = [];
  await admin.connect();
  try {
    await admin.query(`CREATE DATABASE "${database}"`); created = true;
    process.env.DATABASE_URL = `postgresql://${encodeURIComponent(userInfo().username)}@127.0.0.1:5432/${database}`;
    process.env.DATABASE_DIRECT_URL = process.env.DATABASE_URL;
    process.env.JWT_SECRET = randomBytes(48).toString('hex');
    process.env.NODE_ENV = 'test'; process.env.AI_PROVIDER = 'mock';
    process.env.ARK_API_KEY = ''; process.env.GLM_API_KEY = '';
    execFileSync('./node_modules/.bin/prisma', ['migrate', 'deploy'], { env: process.env, stdio: 'pipe' });
    prisma = (await import('../src/config/database')).default;
    const { sessionTag } = await import('../src/middleware/auth');
    const { attendanceRoutes } = await import('../src/routes/attendances');
    const { errorHandler } = await import('../src/middleware/errorHandler');
    const { buildOrgSnapshot } = await import('../src/services/aiService');
    const { attendanceFollowup } = await import('../src/services/aiOperationalData');
    const org = await prisma.organization.create({ data: { code: database, name: '低出勤在班口径验收' } });
    const foreignOrg = await prisma.organization.create({ data: { code: database + '-foreign', name: '外机构' } });
    const campus = await prisma.campus.create({ data: { organizationId: org.id, code: 'A', name: 'A' } });
    const otherCampus = await prisma.campus.create({ data: { organizationId: org.id, code: 'B', name: 'B' } });
    const foreignCampus = await prisma.campus.create({ data: { organizationId: foreignOrg.id, code: 'F', name: 'F' } });
    const scope = { organizationId: org.id, campusId: campus.id };
    const otherScope = { organizationId: org.id, campusId: otherCampus.id };
    const foreignScope = { organizationId: foreignOrg.id, campusId: foreignCampus.id };
    const user = (s: typeof scope, name: string) => prisma.user.create({ data: { ...s, name, email: name + '@' + database + '.invalid', role: 'manager', password: 'private-test-only' } });
    const manager = await user(scope, 'manager'), otherManager = await user(otherScope, 'other'), foreignManager = await user(foreignScope, 'foreign');
    let sequence = 0;
    const cls = (s = scope, extra = {}) => prisma.class.create({ data: { ...s, code: 'C' + ++sequence, name: '验收班' + sequence, courseType: '阅读', ...extra } });
    const mainClass = await cls(), destination = await cls(), closed = await cls(scope, { status: 'inactive' }), otherClass = await cls(otherScope), foreignClass = await cls(foreignScope);
    const student = (name: string, s = scope, extra = {}) => prisma.student.create({ data: { ...s, name, ...extra } });
    const enroll = (s: any, c: any, extra = {}) => prisma.enrollment.create({ data: { organizationId: c.organizationId, studentId: s.id, classId: c.id, enrolledAt: new Date(now - 10 * day), ...extra } });
    const schedule = (c: any) => prisma.schedule.create({ data: { organizationId: c.organizationId, campusId: c.campusId, classId: c.id, startTime: new Date(now - 2 * day), endTime: new Date(now - 2 * day + 3600000), status: 'completed' } });
    const lesson = await schedule(mainClass), otherLesson = await schedule(otherClass), foreignLesson = await schedule(foreignClass);
    const absent = (s: any, sc = lesson, extra = {}) => prisma.attendance.create({ data: { organizationId: sc.organizationId, studentId: s.id, classId: sc.classId, scheduleId: sc.id, status: 'absent', ...extra } });
    const history = (s: any) => enroll(s, mainClass, { status: 'completed', endedAt: new Date(now - day) });
    const retained = new Set<string>(), excluded = new Set<string>();
    const active = await student('当前在班真实零出勤'); retained.add(active.id); const activeEnrollment = await enroll(active, mainClass); await absent(active);
    const transferred = await student('离开原班但仍在其他班'); retained.add(transferred.id); await history(transferred); await enroll(transferred, destination, { enrolledAt: new Date(now - day / 2) }); await absent(transferred);
    const endLater = await student('报名稍后才结束'); retained.add(endLater.id); await enroll(endLater, mainClass, { endedAt: new Date(now + 1) }); await absent(endLater);
    const noLessons = await student('已入班尚无课次'); excluded.add(noLessons.id); await enroll(noLessons, destination);
    const noMembership = await student('无班无历史'); excluded.add(noMembership.id);
    const left = await student('历史已离班'); excluded.add(left.id); await history(left); await absent(left);
    const endNow = await student('报名恰在现在结束'); excluded.add(endNow.id); await enroll(endNow, mainClass, { endedAt: new Date(now) }); await absent(endNow);
    const closedOnly = await student('当前只在停课班'); excluded.add(closedOnly.id); await history(closedOnly); await enroll(closedOnly, closed); await absent(closedOnly);
    const future = await student('尚未生效的未来入班'); excluded.add(future.id); await history(future); await enroll(future, destination, { enrolledAt: new Date(now + day) }); await absent(future);
    const guest = await student('仅临时串课没有正式入班'); excluded.add(guest.id); await absent(guest, lesson, { isTemporary: true });
    const foreignMembership = await student('仅外校区入班'); excluded.add(foreignMembership.id); await history(foreignMembership); await enroll(foreignMembership, otherClass); await absent(foreignMembership);
    const foreignOrgMembership = await student('仅外机构入班'); excluded.add(foreignOrgMembership.id); await history(foreignOrgMembership); await enroll(foreignOrgMembership, foreignClass); await absent(foreignOrgMembership);
    for (const status of ['lost', 'archived', 'inactive']) { const s = await student('已' + status, scope, { status }); excluded.add(s.id); await enroll(s, mainClass); await absent(s); }
    const noRenewal = await student('已确认不续费', scope, { renewalStatus: 'no_renewal' }); excluded.add(noRenewal.id); await enroll(noRenewal, mainClass); await absent(noRenewal);
    const otherStudent = await student('外校区学员', otherScope); await enroll(otherStudent, otherClass); await absent(otherStudent, otherLesson);
    const foreignStudent = await student('外机构学员', foreignScope); await enroll(foreignStudent, foreignClass); await absent(foreignStudent, foreignLesson);
    // Freeze only this isolated process; the host and human acceptance services are untouched.
    global.Date = new Proxy(OriginalDate, { construct(target, args) { return Reflect.construct(target, args.length ? args : [now]); }, get(target, key) { return key === 'now' ? () => now : Reflect.get(target, key); } });
    const app = express(); app.use(express.json()); app.use('/api/attendances', attendanceRoutes); app.use(errorHandler);
    await new Promise<void>(resolve => { server = app.listen(0, '127.0.0.1', resolve); });
    const base = 'http://127.0.0.1:' + server.address().port + '/api/attendances';
    const tokens = new Map<string, string>();
    for (const actor of [manager, otherManager, foreignManager]) tokens.set(actor.id, jwt.sign({ userId: actor.id, sessionTag: sessionTag(actor.password) }, process.env.JWT_SECRET!, { algorithm: 'HS256', expiresIn: '10m' }));
    const get = async (route = 'low-attendance-students', actor = manager, extra = '') => { const response = await fetch(base + '/' + route + '?threshold=60' + extra, { headers: { authorization: 'Bearer ' + tokens.get(actor.id) } }); const body = await response.json() as any; assert.equal(response.status, 200, JSON.stringify(body)); return body.data; };
    const initial = await get();
    assert.deepEqual(new Set(initial.map((r: any) => r.id)), retained); assert.ok(initial.every((r: any) => r.attendanceRate === 0 && r.scheduleCount === 1));
    checks.push('真实HTTP保留当前在班0%，保留转入其他班的有效历史；排除无应到课次');
    assert.ok(initial.every((r: any) => !excluded.has(r.id)));
    checks.push('未入班、离班、停课班、未来报名、结束边界、纯临时串课及无效跨范围入班全部排除');
    assert.ok(initial.every((r: any) => ![noRenewal.id].includes(r.id)));
    checks.push('已确认不续费、流失、归档和非在读学员不进入跟进名单');
    assert.deepEqual((await get('low-attendance-students', otherManager)).map((r: any) => r.id), [otherStudent.id]);
    assert.deepEqual((await get('low-attendance-students', foreignManager)).map((r: any) => r.id), [foreignStudent.id]);
    assert.deepEqual(new Set((await get('low-attendance-students', manager, '&startDate=2026-11-08&endDate=2026-11-08')).map((r: any) => r.id)), retained);
    checks.push('真实HTTP校区/机构隔离，历史日期查询仍按当前在班状态决定跟进对象');
    const classBefore = (await get('low-attendance-classes')).find((r: any) => r.class.id === mainClass.id);
    assert.equal(classBefore.lowAttendanceCount, retained.size); assert.equal(classBefore.attendanceRate, 0);
    checks.push('低出勤班级的低出勤人数同口径；班级历史应到及出勤率不因名单过滤缩减');
    const snapshot = await buildOrgSnapshot(org.id, { force: true, campusId: campus.id });
    assert.equal(snapshot.lowAttendanceStudents, retained.size);
    checks.push('AI经营快照本地查询与低出勤HTTP名单去重人数一致，零模型调用');
    const ctx = { ...scope, today: '2026-11-10' };
    const aiStudents = await attendanceFollowup(ctx, {}, false);
    assert.deepEqual(new Set(aiStudents.rows.map(r => r.姓名)), new Set([active.name, transferred.name, endLater.name]));
    const aiClasses = await attendanceFollowup(ctx, {}, true), aiMain = aiClasses.rows.find(r => r.班级 === mainClass.name)!;
    assert.equal(aiMain.低出勤学员数, retained.size); assert.equal(aiMain.应到, 14); assert.equal(aiMain.实到, 0);
    checks.push('AI导出数据工具同口径；班级报告保留14人次历史分母，低出勤跟进仅3人');
    await prisma.enrollment.update({ where: { id: activeEnrollment.id }, data: { status: 'completed', endedAt: new Date(now - 3600000) } });
    const after = await get(); assert.equal(after.length, retained.size - 1); assert.ok(after.every((r: any) => r.id !== active.id));
    const classAfter = (await get('low-attendance-classes')).find((r: any) => r.class.id === mainClass.id);
    assert.equal(classAfter.lowAttendanceCount, retained.size - 1); assert.equal(classAfter.attendanceRate, classBefore.attendanceRate);
    const aiAfter = await attendanceFollowup(ctx, {}, true), aiMainAfter = aiAfter.rows.find(r => r.班级 === mainClass.name)!;
    assert.equal(aiMainAfter.应到, aiMain.应到); assert.equal(aiMainAfter.低出勤学员数, retained.size - 1);
    checks.push('真实移出班级后名单及低出勤数立即减少；班级历史应到与出勤率保持原值');
    // Compatibility endpoint keeps its existing consecutive-record behavior,
    // while the current enrollment/scope guard is identical to the modern API.
    await prisma.enrollment.update({ where: { id: activeEnrollment.id }, data: { status: 'active', endedAt: null } });
    const laterLesson = async (c: any) => {
      const sc = await schedule(c);
      return prisma.schedule.update({ where: { id: sc.id }, data: { startTime: new Date(now - 36 * 3600000), endTime: new Date(now - 35 * 3600000) } });
    };
    const secondMain = await laterLesson(mainClass);
    const originalAttendance = await prisma.attendance.findMany({ where: { scheduleId: lesson.id }, select: { studentId: true, isTemporary: true } });
    for (const a of originalAttendance) await absent({ id: a.studentId }, secondMain, { isTemporary: a.isTemporary });
    await absent(otherStudent, await laterLesson(otherClass));
    await absent(foreignStudent, await laterLesson(foreignClass));
    const legacy = await get('continuous-leave');
    assert.deepEqual(new Set(legacy.map((r: any) => r.id)), new Set([active.id, endLater.id]));
    assert.ok(legacy.every((r: any) => r.continuousAbsentCount === 2));
    assert.deepEqual((await get('continuous-leave', otherManager)).map((r: any) => r.id), [otherStudent.id]);
    assert.deepEqual((await get('continuous-leave', foreignManager)).map((r: any) => r.id), [foreignStudent.id]);
    const mismatch = await fetch(base + '/continuous-leave?campusId=' + otherCampus.id, { headers: { authorization: 'Bearer ' + tokens.get(manager.id) } });
    assert.equal(mismatch.status, 403);
    checks.push('兼容连续请假接口也排除过期/关闭班/未入班及不续费，真实两次缺勤保留，跨校区机构隔离且拒绝伪造范围');
    console.log(JSON.stringify({ passed: checks.length, checks, realHttp: true, isolatedDatabase: database, humanDatabaseWrites: 0, realModelRequests: 0 }, null, 2));
  } finally {
    global.Date = OriginalDate;
    if (server) await new Promise<void>((resolve, reject) => server.close((error: any) => error ? reject(error) : resolve()));
    if (prisma) await prisma.$disconnect();
    if (created) await admin.query(`DROP DATABASE "${database}" WITH (FORCE)`);
    await admin.end();
    if (created) console.log('Temporary low-attendance acceptance database dropped.');
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
