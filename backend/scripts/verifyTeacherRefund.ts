// Requires a disposable local database. All browser writes are redirected here.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import express from 'express';
import jwt from 'jsonwebtoken';
import p from '../src/config/database';
import { refundRoutes } from '../src/routes/refunds';
import { studentRoutes } from '../src/routes/students';
import { classRoutes } from '../src/routes/classes';
import { authenticate, sessionTag } from '../src/middleware/auth';
import { securityConfig } from '../src/config/security';
import { errorHandler } from '../src/middleware/errorHandler';
import { lockManagement, sessionUser } from '../src/services/managementAccess';

const evidence = '../docs/acceptance/2026-11-13-teacher-refund';
const checks: string[] = [];
async function main() {
  const url = new URL(process.env.DATABASE_URL!);
  assert.match(url.pathname, /^\/buzzer_teacher_refund_\d+$/);
  assert.equal(process.env.DATABASE_URL, process.env.DATABASE_DIRECT_URL);
  const org = await p.organization.create({ data: { name: '独立老师退费验收', code: 'TEACHER-REFUND-QA' } });
  const campus = await p.campus.create({ data: { organizationId: org.id, name: 'A', code: 'A' } });
  const scope = { organizationId: org.id, campusId: campus.id };
  const user = (name: string, role: string, extra = {}) => p.user.create({ data: { ...scope, name, role, email: name + '@qa.invalid', password: 'unused-isolated', ...extra } });
  const t1 = await user('本人老师', 'teacher'), t2 = await user('其他教练', 'coach');
  const admin = await user('管理员', 'staff', { managementLevel: 'super' });
  const sales = await user('销售', 'sales'), staff = await user('员工', 'staff'), parent = await user('家长', 'parent');
  const cls = (name: string, teacherId = t1.id, status = 'active') => p.class.create({ data: { ...scope, name, code: name, courseType: '篮球', teacherId, status } });
  const a = await cls('本人班'), b = await cls('他人班', t2.id), paused = await cls('停课班', t1.id, 'inactive');
  const fixture = async (name: string, classIds = [a.id], extra = {}) => {
    const student = await p.student.create({ data: { ...scope, name, salesId: sales.id, purchasedLessons: 10, remainingLessons: 10, totalPayment: 1000, notes: '保留原备注', ...extra } });
    const order = await p.conversion.create({ data: { organizationId: org.id, studentId: student.id, studentName: name, contact: '13900000000', conversionDate: '2026-11-13', approvalStatus: 'confirmed', salesId: sales.id, totalLessons: 10, price: 1000, classId: classIds[0] } });
    const credit = await p.lessonLog.create({ data: { organizationId: org.id, studentId: student.id, studentName: name, operatorId: admin.id, type: 'add', lessons: 10, lessonSource: 'paid', creditAmountCents: 100000, conversionId: order.id, notes: '新签入账：' + order.id } });
    const enrollments = [];
    for (const classId of classIds) enrollments.push(await p.enrollment.create({ data: { organizationId: org.id, studentId: student.id, classId, enrolledAt: new Date('2020-01-01') } }));
    return { student, order, credit, enrollments };
  };
  const own = await fixture('本人退费孩子'), other = await fixture('他人孩子', [b.id]);
  const mixed = await fixture('多班退费孩子', [a.id, b.id]), unknown = await fixture('待核价格孩子');
  await p.conversion.update({ where: { id: unknown.order.id }, data: { price: null } });
  await p.lessonLog.update({ where: { id: unknown.credit.id }, data: { creditAmountCents: null } });
  const dormant = await fixture('仅回访孩子', [], { recallTeacherId: t1.id });
  const frozen = await fixture('冻结课时孩子', [a.id], { frozenLessons: 1 });
  const pausedChild = await fixture('停课班退费', [paused.id]);
  const ui = await fixture('页面退费孩子'), uiRetry = await fixture('页面丢响应孩子');
  const makeToken = (actor: typeof t1) => jwt.sign({ userId: actor.id, sessionTag: sessionTag(actor.password) }, securityConfig.jwt.secret, { expiresIn: '1h' });
  const app = express(); app.use(express.json());
  app.get('/api/auth/me', authenticate, (req: any, res) => res.json({ success: true, data: req.user }));
  app.use('/api/refunds', refundRoutes); app.use('/api/students', studentRoutes); app.use('/api/classes', classRoutes); app.use(errorHandler);
  const server = await new Promise<ReturnType<typeof app.listen>>(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const base = `http://127.0.0.1:${(server.address() as any).port}`;
  const request = async (actor: typeof t1, path: string, body?: object) => {
    const response = await fetch(base + '/api' + path, { method: body ? 'POST' : 'GET', headers: { Authorization: 'Bearer ' + makeToken(actor), 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, ...(await response.json() as any) };
  };
  const payload = (studentId: string, extra = {}) => ({ requestId: randomUUID(), studentId, amountToRefund: 1000, lessonsToRefund: 10, refundDate: '2026-11-13', reason: '线下退费办结', ...extra });
  const confirm = (actor: typeof t1, body: object) => request(actor, '/refunds/confirm', body);
  const quote = (actor: typeof t1, studentId: string) => request(actor, '/refunds/quote?studentId=' + studentId);
  try {
    assert.equal((await quote(t1, own.student.id)).data.maxAmount, 1000);
    assert.equal((await quote(t2, other.student.id)).data.maxAmount, 1000); checks.push('teacher与coach均能核对本人孩子真实购课批次和可退上限');
    assert.equal((await quote(t1, other.student.id)).status, 404);
    assert.equal((await confirm(t1, payload(other.student.id))).status, 403);
    assert.equal((await quote(t1, dormant.student.id)).status, 404);
    assert.equal((await confirm(t1, payload(dormant.student.id))).status, 403); checks.push('他人学员、无在班且仅回访的学员不能报价或确认退费');
    for (const actor of [sales, staff, parent]) { assert.equal((await quote(actor, own.student.id)).status, 403); assert.equal((await confirm(actor, payload(own.student.id))).status, 403); }
    checks.push('销售、普通员工、家长不可办理确认退费');
    const foreignOrg = await p.organization.create({ data: { name: '外机构', code: 'REFUND-FOREIGN' } });
    const foreignCampus = await p.campus.create({ data: { organizationId: foreignOrg.id, name: 'B', code: 'B' } });
    const foreign = await p.user.create({ data: { organizationId: foreignOrg.id, campusId: foreignCampus.id, name: '外机构老师', role: 'teacher', email: 'foreign@qa.invalid', password: 'unused' } });
    assert.equal((await quote(foreign, own.student.id)).status, 404); assert.equal((await confirm(foreign, payload(own.student.id))).status, 404); checks.push('跨机构老师无法报价或退费');
    assert.equal((await confirm(t1, payload(own.student.id, { amountToRefund: 1000.01 }))).status, 409);
    assert.equal((await confirm(t1, payload(own.student.id, { lessonsToRefund: 11 }))).status, 409);
    assert.equal((await confirm(t1, payload(unknown.student.id))).status, 409);
    assert.equal((await confirm(t1, payload(frozen.student.id))).status, 409);
    assert.equal(await p.refund.count(), 0); checks.push('超金额、超课时、历史待核、冻结课时拒绝且整笔不落退费');
    const body = payload(own.student.id);
    const result = await confirm(t1, body); assert.equal(result.status, 200, JSON.stringify(result));
    assert.equal(result.data.status, 'approved'); assert.equal(result.data.submittedById, t1.id); assert.equal(result.data.submittedByName, t1.name);
    assert.equal(result.data.reviewedById, t1.id); assert.equal(Number(result.data.amountToRefund), 1000);
    const refunded = await p.student.findUniqueOrThrow({ where: { id: own.student.id } });
    assert.equal(refunded.status, 'refunded'); assert.equal(refunded.remainingLessons, 0); assert.equal(refunded.purchasedLessons, 0); assert.equal(refunded.salesId, sales.id); assert.equal(refunded.notes, '保留原备注');
    assert.equal(await p.enrollment.count({ where: { studentId: own.student.id, status: 'active' } }), 0);
    assert.equal(await p.lessonLog.count({ where: { studentId: own.student.id, type: 'refund' } }), 1);
    assert.equal((await p.conversion.findUniqueOrThrow({ where: { id: own.order.id } })).approvalStatus, 'confirmed'); checks.push('老师确认即完成退费、扣回课时、退出班级并保留记录和原销售成单');
    let records = await request(t1, '/refunds'); assert(records.data.data.some((r: any) => r.id === body.requestId)); assert.equal(records.data.summary.approvedAmount, 1000);
    assert(!(await request(t2, '/refunds')).data.data.some((r: any) => r.id === body.requestId)); checks.push('退班失去在班责任后，本人历史退费仍可查看与汇总，他人不可查看');
    assert.equal((await confirm(t1, body)).status, 200); assert.equal(await p.refund.count({ where: { studentId: own.student.id } }), 1);
    assert.equal((await confirm(t1, { ...body, amountToRefund: 999 })).status, 409);
    assert.equal((await confirm(t2, body)).status, 403); checks.push('失去在班关系后同本人原回执仍可重放，同号改内容及他人冒用被拒');
    assert.equal((await request(t1, '/refunds/' + body.requestId + '/cancel', {})).status, 403);
    assert.equal((await request(admin, '/refunds/' + body.requestId + '/cancel', {})).status, 200);
    const restored = await p.student.findUniqueOrThrow({ where: { id: own.student.id } }); assert.equal(restored.status, 'active'); assert.equal(restored.remainingLessons, 10);
    assert.equal(await p.enrollment.count({ where: { studentId: own.student.id, status: 'active' } }), 1);
    assert.equal((await confirm(t1, body)).data.status, 'approved'); assert.equal((await p.refund.findUniqueOrThrow({ where: { id: body.requestId } })).status, 'cancelled'); checks.push('老师不能取消，管理员取消可恢复课时和原班级；原回执重试不重新退费');
    assert.equal((await confirm(t1, payload(mixed.student.id))).status, 200); assert.equal(await p.enrollment.count({ where: { studentId: mixed.student.id, status: 'active' } }), 0); checks.push('明确确认全档案退费后，多班报名在同一事务内全部结束');
    assert.equal((await quote(t1, pausedChild.student.id)).data.maxAmount, 1000); assert.equal((await confirm(t1, payload(pausedChild.student.id))).status, 200); checks.push('停课班仍由负责老师办理退费');
    assert.equal((await confirm(t2, payload(other.student.id))).status, 200); checks.push('coach老师独立完成本人学员退费');
    const repeated = await fixture('并发退费孩子'), repeatBody = payload(repeated.student.id);
    const concurrent = await Promise.all([confirm(t1, repeatBody), confirm(t1, repeatBody), confirm(t1, repeatBody)]);
    assert(concurrent.every(r => r.status === 200)); assert.equal(await p.refund.count({ where: { studentId: repeated.student.id } }), 1); assert.equal(await p.lessonLog.count({ where: { studentId: repeated.student.id, type: 'refund' } }), 1); checks.push('三次并发同请求仅一条退费及一条退课流水');
    const handClass = await cls('即将交接班'), hand = await fixture('报价后被交接', [handClass.id]); await quote(t1, hand.student.id);
    let pending: Promise<any> | undefined;
    await p.$transaction(async tx => {
      await lockManagement(tx, org.id); pending = confirm(t1, payload(hand.student.id));
      for (let i = 0; i < 60; i++) {
        const rows = await tx.$queryRaw<Array<{ n: bigint }>>`SELECT count(*) AS n FROM pg_locks WHERE locktype='advisory' AND NOT granted AND database=(SELECT oid FROM pg_database WHERE datname=current_database())`;
        if (Number(rows[0].n)) break;
        if (i === 59) throw new Error('Expected waiting refund transaction');
        await new Promise(resolve => setTimeout(resolve, 20));
      }
      await tx.class.update({ where: { id: handClass.id }, data: { teacherId: t2.id } });
    });
    assert.equal((await pending!).status, 403); assert.equal(await p.refund.count({ where: { studentId: hand.student.id } }), 0); checks.push('班级交接锁等待后重新核验归属，旧老师不能依赖已打开弹窗退费');
    const roleTeacher = await user('将变岗老师', 'teacher'), roleClass = await cls('变岗班', roleTeacher.id), roleChild = await fixture('变岗后禁止退费', [roleClass.id]);
    await p.$transaction(async tx => {
      await lockManagement(tx, org.id); pending = confirm(roleTeacher, payload(roleChild.student.id));
      for (let i = 0; i < 60; i++) {
        const rows = await tx.$queryRaw<Array<{ n: bigint }>>`SELECT count(*) AS n FROM pg_locks WHERE locktype='advisory' AND NOT granted AND database=(SELECT oid FROM pg_database WHERE datname=current_database())`;
        if (Number(rows[0].n)) break;
        if (i === 59) throw new Error('Expected waiting role check');
        await new Promise(resolve => setTimeout(resolve, 20));
      }
      await tx.user.update({ where: { id: roleTeacher.id }, data: { role: 'sales' } });
    });
    assert.equal((await pending!).status, 403); assert.equal(await p.refund.count({ where: { studentId: roleChild.student.id } }), 0); checks.push('确认请求等待期间岗位降权，锁内实时身份校验拦截');
    const adminCase = await fixture('管理员原入口'); assert.equal((await confirm(admin, payload(adminCase.student.id))).status, 200); checks.push('管理员原确认退费入口保持可用');
    const config = { baseApi: base, token: makeToken(t1), user: { ...sessionUser(t1), password: undefined }, ui, uiRetry };
    await new Promise<void>((resolve, reject) => {
      const child = spawn(process.execPath, ['scripts/verifyTeacherRefundUi.mjs'], { cwd: '../frontend', env: { ...process.env, TEACHER_REFUND_QA: JSON.stringify(config) }, stdio: ['ignore', 'inherit', 'inherit'] });
      child.once('error', reject); child.once('exit', code => code === 0 ? resolve() : reject(new Error('Teacher refund browser verification failed')));
    });
    for (const item of [ui, uiRetry]) { assert.equal((await p.student.findUniqueOrThrow({ where: { id: item.student.id } })).status, 'refunded'); assert.equal(await p.refund.count({ where: { studentId: item.student.id } }), 1); }
    checks.push('5199学员页直接办理和丢响应恢复后数据库均仅一次退费');
    mkdirSync(evidence, { recursive: true }); writeFileSync(evidence + '/backend-results.json', JSON.stringify({ at: new Date().toISOString(), passed: checks.length, checks }, null, 2));
    console.log(`PASS: ${checks.length} isolated teacher refund HTTP/database checks`);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => p.$disconnect());
