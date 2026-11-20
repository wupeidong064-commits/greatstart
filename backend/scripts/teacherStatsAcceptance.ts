/**
 * 老师统计与基本盘独立验收（对应 review-2026-11-02 必修项）
 * 场景：一师多班100%、同学跨班分母、跨校区隔离、无当期成单(null+估)、更正返还、
 *       中途入班不应计入早场分母、真实不续费事件(noRenewalDate)、inactive 不冒充不续费、班级水平持久化。
 * 全部走真实链路：HTTP(3000) 验接口 + submitScheduleAttendance 验账；独立机构，finally 按 ID 清理。
 */
import 'dotenv/config';
import p from '../src/config/database';
import bcrypt from 'bcryptjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { submitScheduleAttendance } from '../src/services/scheduleAttendanceService';

const API = 'http://localhost:3000/api';
const results: string[] = [];
const ok = (name: string) => { results.push(name); console.log('✅', name); };

const day = (n: number, h = 10, m = 0) => { const d = new Date(); d.setHours(h, m, 0, 0); d.setDate(d.getDate() + n); return d; };
const ymd = (d: Date) => d.toISOString().slice(0, 10);

async function login(email: string, password: string) {
  const r = await fetch(`${API}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
  const j: any = await r.json();
  return j.data?.token as string;
}
const get = async (token: string, path: string) => { const r = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` } }); return { status: r.status, body: await r.json() as any }; };
const post = async (token: string, path: string, body: any) => { const r = await fetch(`${API}${path}`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); return { status: r.status, body: await r.json() as any }; };

async function main() {
  assert.ok(process.env.DATABASE_URL, '需要 .env');
  const code = 'TS-ACC-' + Date.now(), PWD = 'Ts-Acc-2026!';
  const org = await p.organization.create({ data: { code, name: '老师统计验收' } });
  const cA = await p.campus.create({ data: { organizationId: org.id, code: 'A', name: '验收校区A' } });
  const cB = await p.campus.create({ data: { organizationId: org.id, code: 'B', name: '验收校区B' } });
  const hash = await bcrypt.hash(PWD, 10);
  const mkUser = (name: string, role: string, campusId: string, suffix: string) =>
    p.user.create({ data: { organizationId: org.id, campusId, email: `${suffix}.ts-acc@accept.buzzer.test`, password: hash, name, role } });
  const adminA = await mkUser('验收管理员A', 'admin', cA.id, 'admin-a');
  const adminB = await mkUser('验收管理员B', 'admin', cB.id, 'admin-b');
  const t1 = await mkUser('多班老师', 'coach', cA.id, 't1');       // 一师多班+同学跨班+中途入班
  const t2 = await mkUser('双班老师', 'coach', cA.id, 't2');       // 纯一师多班 100%
  const tB = await mkUser('B区老师', 'coach', cB.id, 'tb');        // 跨校区隔离

  const mkClass = (name: string, code: string, teacherId: string, campusId: string) =>
    p.class.create({ data: { organizationId: org.id, campusId, code, name, courseType: '篮球', teacherId } });
  const C1 = await mkClass('多班一班', 'M1', t1.id, cA.id);
  const C2 = await mkClass('多班二班', 'M2', t1.id, cA.id);
  const C3 = await mkClass('双班三班', 'M3', t2.id, cA.id);
  const C4 = await mkClass('双班四班', 'M4', t2.id, cA.id);
  const CB = await mkClass('B区班', 'B1', tB.id, cB.id);

  let phoneSeq = 30000000;
  const mkStudent = (name: string, campusId: string, extra: any = {}) =>
    p.student.create({ data: { organizationId: org.id, campusId, name, phone: '139' + String(++phoneSeq), purchasedLessons: 30, remainingLessons: 30, ...extra } });
  const sX = await mkStudent('甲班学员X', cA.id, { createdAt: day(-5), updatedAt: day(-5) });
  const sZ = await mkStudent('跨班学员Z', cA.id, { createdAt: day(-5), updatedAt: day(-5) });
  const sLate = await mkStudent('中途入班L', cA.id, { createdAt: day(-2), updatedAt: day(-2) });
  const sNoRenew = await mkStudent('不续费N', cA.id, { createdAt: day(-5), updatedAt: day(-5) });
  const sInactive = await mkStudent('停用I', cA.id, { createdAt: day(-5), updatedAt: day(0) });
  const sY = await mkStudent('乙班学员Y', cA.id, { createdAt: day(-5), updatedAt: day(-5) });
  const sNoRenewOld = await mkStudent('上月不续费O', cA.id, { createdAt: day(-5), updatedAt: day(-5) });
  const sP = await mkStudent('双班P', cA.id, { createdAt: day(-5), updatedAt: day(-5) });
  const sQ = await mkStudent('双班Q', cA.id, { createdAt: day(-5), updatedAt: day(-5) });
  const sB = await mkStudent('B区学员', cB.id, { createdAt: day(-5), updatedAt: day(-5) });

  const enr = (studentId: string, classId: string, enrolledAt: Date, status = 'active') =>
    p.enrollment.create({ data: { organizationId: org.id, studentId, classId, enrolledAt, status, createdAt: enrolledAt, updatedAt: enrolledAt } });
  await enr(sX.id, C1.id, day(-5)); await enr(sZ.id, C1.id, day(-5)); await enr(sLate.id, C1.id, day(-2)); await enr(sNoRenew.id, C1.id, day(-5));
  await enr(sInactive.id, C1.id, day(-5), 'cancelled');
  await enr(sY.id, C2.id, day(-5)); await enr(sZ.id, C2.id, day(-5)); await enr(sNoRenewOld.id, C2.id, day(-5));
  await enr(sP.id, C3.id, day(-5)); await enr(sQ.id, C4.id, day(-5));
  await enr(sB.id, CB.id, day(-5));

  const mkSched = (classId: string, start: Date) =>
    p.schedule.create({ data: { organizationId: org.id, campusId: cA.id, classId, startTime: start, endTime: new Date(+start + 3600000) } });
  const S_3d = await mkSched(C1.id, day(-3, 10));      // 中途入班 L 不在分母
  const S_today = await mkSched(C1.id, day(0, 10));
  const S2_today = await mkSched(C2.id, day(0, 11));
  const S3_today = await mkSched(C3.id, day(0, 12));
  const S4_today = await mkSched(C4.id, day(0, 13));
  const SB_today = await p.schedule.create({ data: { organizationId: org.id, campusId: cB.id, classId: CB.id, startTime: day(0, 10), endTime: new Date(+day(0, 10) + 3600000) } });

  // 真实业务事件：不续费（真实字段），停用（inactive 不冒充不续费）
  await p.student.update({ where: { id: sNoRenew.id }, data: { renewalStatus: 'no_renewal', noRenewalDate: day(0), noRenewalReason: '验收-不续费' } });
  await p.student.update({ where: { id: sNoRenewOld.id }, data: { renewalStatus: 'no_renewal', noRenewalDate: day(-35) } });
  await p.student.update({ where: { id: sInactive.id }, data: { status: 'inactive' } });

  const actorA = { id: adminA.id, role: 'admin', organizationId: org.id, campusId: cA.id };
  const sign = (sid: string, arr: [string, string][]) => submitScheduleAttendance(actorA, sid, arr.map(([studentId, status]) => ({ studentId, status })));
  // 返还场景：Z 先出勤再更正请假（净 0、有返还流水）
  await sign(S_today.id, [[sX.id, 'present'], [sZ.id, 'present'], [sLate.id, 'present'], [sNoRenew.id, 'absent']]);
  await sign(S_today.id, [[sZ.id, 'leave']]);
  await sign(S_3d.id, [[sX.id, 'present'], [sZ.id, 'present'], [sNoRenew.id, 'late']]);
  await sign(S2_today.id, [[sY.id, 'present'], [sZ.id, 'present'], [sNoRenewOld.id, 'absent']]);
  await sign(S3_today.id, [[sP.id, 'present']]);
  await sign(S4_today.id, [[sQ.id, 'present']]);
  await submitScheduleAttendance({ id: adminB.id, role: 'admin', organizationId: org.id, campusId: cB.id }, SB_today.id, [{ studentId: sB.id, status: 'present' }]);

  const z0 = 30;
  const zNow = (await p.student.findUniqueOrThrow({ where: { id: sZ.id } })).remainingLessons;
  const reversal = await p.lessonLog.count({ where: { scheduleId: S_today.id, studentId: sZ.id, reversalOfId: { not: null } } });
  // Z 在 3天前(C1) 与 今日(C2) 各出勤扣 1；今日(C1) 出勤后更正请假净 0 → 30-2=28
  assert.equal(zNow, z0 - 2);
  assert.equal(reversal, 1);
  ok(`更正返还：出勤→请假后本场净0（余额${z0 - 2}=跨班两次真实出勤扣2），返还流水${reversal}条`);

  const tokA = await login(adminA.email, PWD);
  const tokB = await login(adminB.email, PWD);
  const W = `startDate=${ymd(day(-4))}&endDate=${ymd(day(0))}`;

  // —— 无当期成单：null + estimated=false，不得伪造 0 ——
  let r = await get(tokA, `/users/coach-statistics?${W}`);
  const noConv = r.body.data.find((x: any) => x.teacherName === '多班老师');
  assert.equal(noConv.consumptionAmount, null);
  assert.equal(noConv.consumptionEstimated, false);
  ok('无当期成单：课消金额=null（不伪造0），estimated=false');

  // —— 一师多班 100%（旧公式会得 50%）——
  const t2row = r.body.data.find((x: any) => x.teacherName === '双班老师');
  assert.equal(t2row.attendanceRate, 100);
  ok(`一师多班 100%：双班各1人各1节全勤，出勤率=${t2row.attendanceRate}%（旧公式为50%）`);

  // —— 同学跨班 + 中途入班分母：多班老师 expected=10 actual=7 → 70%（旧公式 3场×6人=18 → 39%）——
  assert.equal(noConv.attendanceRate, 70);
  ok(`同学跨班/中途入班逐场次分母：多班老师=${noConv.attendanceRate}%（应到10/实到7；旧公式39%）`);

  // —— 跨校区隔离 ——
  const namesA = r.body.data.map((x: any) => x.teacherName);
  assert.ok(!namesA.includes('B区老师'), 'A区不应看到B区老师');
  const r2 = await get(tokA, `/users/coach-statistics?${W}&teacherId=${tB.id}`);
  assert.equal(r2.body.data.length, 0);
  const rb = await get(tokB, `/users/coach-statistics?${W}`);
  assert.deepEqual(rb.body.data.map((x: any) => x.teacherName), ['B区老师']);
  assert.equal(rb.body.data[0].attendanceRate, 100);
  ok('跨校区隔离：A区不见B区老师；伪造 teacherId=B区老师 返回空；B区只见本区');

  // —— 有成单后：估算金额 + estimated=true（校区内平均价，不跨校区）——
  await p.conversion.create({ data: { organizationId: org.id, studentId: sX.id, studentName: '甲班学员X', contact: '139', courseType: '新单', price: 1000, totalLessons: 10, salesId: t1.id, salesName: '多班老师', conversionDate: ymd(day(0)), paymentStatus: 'paid' } });
  await p.conversion.create({ data: { organizationId: org.id, studentId: sB.id, studentName: 'B区学员', contact: '139', courseType: '新单', price: 9999, totalLessons: 1, salesId: tB.id, salesName: 'B区老师', conversionDate: ymd(day(0)), paymentStatus: 'paid' } });
  r = await get(tokA, `/users/coach-statistics?${W}`);
  const withConv = r.body.data.find((x: any) => x.teacherName === '多班老师');
  assert.equal(withConv.consumptionAmount, 700); // 7实到 × 校区A均价100（B区9999不污染）
  assert.equal(withConv.consumptionEstimated, true);
  ok(`有成单：课消金额=7×100=¥700（估）；B区天价成单不污染A区均价`);

  // —— 基本盘：真实不续费事件按窗口计；inactive 不冒充 ——
  const cs = (await get(tokA, `/consumption/statistics?startDate=${ymd(day(-4))}T00:00:00%2B08:00&endDate=${ymd(day(0))}T23:59:59.999%2B08:00`)).body.data;
  assert.equal(cs.nonRenewals, 1); // N(今日)计入；O(上月)不在窗口；I(inactive)不算
  assert.equal(cs.recalled, null);
  assert.equal(cs.recalledAvailable, false);
  assert.equal(cs.deletedRoster, 0);
  ok(`基本盘：本期不续费=1（真实noRenewalDate）；上月标记不计入本期；inactive不冒充；召回=null不可用`);
  const csLastMonth = (await get(tokA, `/consumption/statistics?startDate=${ymd(day(-35))}T00:00:00%2B08:00&endDate=${ymd(day(-30))}T23:59:59.999%2B08:00`)).body.data;
  assert.equal(csLastMonth.nonRenewals, 1); // O 在上月窗口
  ok('基本盘：上月窗口不续费=1（跨月对账）');

  // —— 班级水平持久化：空值 + 自定义 ——
  const cEmpty = await post(tokA, '/classes', { name: '水平空班', code: 'LV0', courseType: '篮球', capacity: 12 });
  const cCustom = await post(tokA, '/classes', { name: '水平自定义班', code: 'LV9', courseType: '篮球', capacity: 12, level: '启蒙进阶A(自定)' });
  assert.ok(cEmpty.body.data?.id && cCustom.body.data?.id, JSON.stringify(cEmpty.body).slice(0, 120));
  const list = (await get(tokA, '/classes?pageSize=100')).body.data;
  assert.equal(list.find((c: any) => c.code === 'LV0')?.level ?? null, null);
  assert.equal(list.find((c: any) => c.code === 'LV9')?.level, '启蒙进阶A(自定)');
  ok('班级水平持久化：空值可建（null）；自定义值建后可查');

  fs.mkdirSync('../docs/acceptance/review-2026-11-02-fix', { recursive: true });
  fs.writeFileSync('../docs/acceptance/review-2026-11-02-fix/teacher-stats-acceptance.json', JSON.stringify({ code, organizationId: org.id, at: new Date().toISOString(), results }, null, 2));
  console.log(`\n===== ${results.length}/${results.length} 通过 =====`);
}

main().catch(e => { console.error('❌', e); process.exitCode = 1; })
  .finally(async () => {
    // 只清本轮创建的独立机构数据（按 ID，不动共享校区）
    const code = undefined; // 由上方 org 定义的机构已写入证据文件；这里通过唯一邮箱前缀定位
    const emails = await p.user.findMany({ where: { email: { endsWith: '.ts-acc@accept.buzzer.test' } }, select: { organizationId: true } });
    const orgIds = [...new Set(emails.map((u: any) => u.organizationId).filter(Boolean))] as string[];
    for (const orgId of orgIds) {
      await p.lessonLog.deleteMany({ where: { organizationId: orgId } });
      await p.attendance.deleteMany({ where: { organizationId: orgId } });
      await p.lessonDeductionRecord.deleteMany({ where: { organizationId: orgId } });
      await p.conversion.deleteMany({ where: { organizationId: orgId } });
      await p.enrollment.deleteMany({ where: { organizationId: orgId } });
      await p.schedule.deleteMany({ where: { organizationId: orgId } });
      await p.student.deleteMany({ where: { organizationId: orgId } });
      await p.class.deleteMany({ where: { organizationId: orgId } });
      await p.campus.deleteMany({ where: { organizationId: orgId } });
      await p.user.deleteMany({ where: { organizationId: orgId } });
      await p.organization.delete({ where: { id: orgId } });
    }
    await p.$disconnect();
  });
