/**
 * 课消验收校区（QA）两期演示数据补全 —— 只增不删，可重复执行（已存在则跳过）。
 * 目的：让「老师员数据/变化查看」与「课消收入总结·基本盘变化分析」在本期/上期都有真实可看的数字。
 * 口径对齐页面默认窗口：变化弹窗默认最近7天（本期）vs 其前一等长区间（上期）；主表默认本月。
 * 所有签到一律走 submitScheduleAttendance（账实一致），不做 SQL 直改余额。
 */
import 'dotenv/config';
import p from '../src/config/database';
import bcrypt from 'bcryptjs';
import fs from 'node:fs';
import { submitScheduleAttendance } from '../src/services/scheduleAttendanceService';

const ORG = 'c3011f06-a1bb-4b64-8de3-78ce26d42be0';
const CAMPUS = 'ea971897-58ea-443f-ac00-4a9dbe510190';
const DAY = 86400000;

const at = (base: Date, addDays: number, hour: number, minute = 0) => {
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + addDays, hour, minute);
  return d;
};

async function main() {
  const existing = await p.user.findFirst({ where: { organizationId: ORG, email: 'chen.qa@accept.buzzer.test' } });
  if (existing) { console.log('QA 演示数据已存在，跳过'); return; }

  const today = new Date();
  const t9 = at(today, 0, 9);

  // 1) 两位老师（coach）
  const pwd = await bcrypt.hash('Coach-QA-2026!', 10);
  const chen = await p.user.create({ data: { organizationId: ORG, campusId: CAMPUS, email: 'chen.qa@accept.buzzer.test', password: pwd, name: '陈教练', role: 'coach', phone: '13901001001' } });
  const li = await p.user.create({ data: { organizationId: ORG, campusId: CAMPUS, email: 'li.qa@accept.buzzer.test', password: pwd, name: '李教练', role: 'coach', phone: '13901001002' } });

  // 2) 两个班（level 用自定义值，验证班级水平新口径）
  const classA = await p.class.create({ data: { organizationId: ORG, campusId: CAMPUS, code: 'QA-A', name: '启蒙A班', courseType: '篮球启蒙', level: '初级(自定)', capacity: 12, teacherId: chen.id } });
  const classB = await p.class.create({ data: { organizationId: ORG, campusId: CAMPUS, code: 'QA-B', name: '精英B班', courseType: '篮球精英', level: '高级(自定)', capacity: 12, teacherId: li.id } });

  // 3) 学员：上期入班（10月上旬）+ 本期新增（今天）+ 本期流失/不续费标记
  const mkStudent = (name: string, phone: string, createdAt: Date, status = 'active') =>
    p.student.create({ data: { organizationId: ORG, campusId: CAMPUS, name, phone, purchasedLessons: 40, remainingLessons: 40, status, createdAt, updatedAt: createdAt } });
  const oct10 = at(today, -22, 10), oct12 = at(today, -20, 10), todayAm = at(today, 0, 8);
  const sA1 = await mkStudent('启蒙学员1', '13902001001', oct12);
  const sA2 = await mkStudent('启蒙学员2', '13902001002', oct12);
  const sA3 = await mkStudent('启蒙学员3', '13902001003', oct12);           // 本期流失（今天标记）
  const sA4 = await mkStudent('启蒙学员4', '13902001004', oct12);
  const sA5 = await mkStudent('启蒙学员5', '13902001005', todayAm);          // 本期新增
  const sA6 = await mkStudent('启蒙学员6', '13902001006', todayAm);          // 本期新增
  const sB1 = await mkStudent('精英学员1', '13902002001', oct10);
  const sB2 = await mkStudent('精英学员2', '13902002002', oct10, 'inactive'); // 本期不续费（今天标记 updatedAt）
  const sB3 = await mkStudent('精英学员3', '13902002003', oct10);
  const sB4 = await mkStudent('精英学员4', '13902002004', oct10);
  const sB5 = await mkStudent('精英学员5', '13902002005', todayAm);          // 本期新增

  await p.student.update({ where: { id: sA3.id }, data: { status: 'lost', updatedAt: today } });
  await p.student.update({ where: { id: sB2.id }, data: { status: 'inactive', updatedAt: today } });

  const enroll = (studentId: string, classId: string, enrolledAt: Date, status = 'active') =>
    p.enrollment.create({ data: { organizationId: ORG, studentId, classId, enrolledAt, status, createdAt: enrolledAt, updatedAt: enrolledAt } });
  await enroll(sA1.id, classA.id, oct12); await enroll(sA2.id, classA.id, oct12);
  await enroll(sA3.id, classA.id, oct12, 'cancelled'); await enroll(sA4.id, classA.id, oct12);
  await enroll(sA5.id, classA.id, todayAm); await enroll(sA6.id, classA.id, todayAm);
  await enroll(sB1.id, classB.id, oct10); await enroll(sB2.id, classB.id, oct10);
  await enroll(sB3.id, classB.id, oct10); await enroll(sB4.id, classB.id, oct10);
  await enroll(sB5.id, classB.id, todayAm);

  // 4) 排课：上期窗口(≈-14~-8天)与本期窗口(≈-6~-1天+今天)各有场次
  const mkSched = (classId: string, start: Date) =>
    p.schedule.create({ data: { organizationId: ORG, campusId: CAMPUS, classId, startTime: start, endTime: new Date(+start + 3600000) } });
  const aDates = [-13, -11, -9, -6, -4, -2, 0].map(d => at(today, d, 15));
  const bDates = [-12, -10, -8, -5, -3, 0].map(d => at(today, d, 17));
  const schedsA = await Promise.all(aDates.map(d => mkSched(classA.id, d)));
  const schedsB = await Promise.all(bDates.map(d => mkSched(classB.id, d)));

  // 5) 成单（salesId 归属老师）：上期/本期各有新招与续费 → 新招数/续费率/成单金额两期不同
  const conv = (studentId: string, studentName: string, salesId: string, courseType: string, price: number, totalLessons: number, date: string) =>
    p.conversion.create({ data: { organizationId: ORG, studentId, studentName, contact: '13900000000', courseType, price, totalLessons, salesId, salesName: salesId === chen.id ? '陈教练' : '李教练', conversionDate: date, paymentStatus: 'paid' } });
  const d = (dd: number) => new Date(+t9 + dd * DAY).toISOString().slice(0, 10);
  await conv(sA1.id, '启蒙学员1', chen.id, '新单', 3000, 30, d(-11));
  await conv(sB1.id, '精英学员1', li.id, '续费', 2800, 28, d(-11));
  await conv(sA2.id, '启蒙学员2', chen.id, '新单', 3200, 32, d(-4));
  await conv(sA5.id, '启蒙学员5', chen.id, '新单', 3200, 32, d(0));
  await conv(sB5.id, '精英学员5', li.id, '新单', 3600, 36, d(-3));
  await conv(sB3.id, '精英学员3', li.id, '续费', 3000, 30, d(-2));

  // 6) 签到（走统一服务，账实一致）
  const actor = { id: (await p.user.findFirstOrThrow({ where: { organizationId: ORG, role: 'admin' } })).id, role: 'admin', organizationId: ORG, campusId: CAMPUS };
  const sign = (scheduleId: string, entries: [string, string][]) => submitScheduleAttendance(actor, scheduleId, entries.map(([studentId, status]) => ({ studentId, status })));
  const A = [sA1.id, sA2.id, sA4.id], B = [sB1.id, sB3.id, sB4.id];
  await sign(schedsA[0].id, [[A[0], 'present'], [A[1], 'present'], [A[2], 'late']]);      // -13
  await sign(schedsA[1].id, [[A[0], 'present'], [A[1], 'leave'], [A[2], 'present']]);    // -11
  await sign(schedsA[2].id, [[A[0], 'late'], [A[1], 'present'], [A[2], 'present']]);     // -9
  await sign(schedsA[3].id, [[A[0], 'present'], [A[1], 'present'], [A[2], 'present']]);  // -6
  await sign(schedsA[4].id, [[A[0], 'present'], [A[1], 'late'], [A[2], 'present']]);     // -4
  await sign(schedsA[5].id, [[A[0], 'present'], [A[1], 'present'], [A[2], 'leave']]);    // -2
  await sign(schedsA[6].id, [[A[0], 'present'], [A[1], 'present'], [A[2], 'present'], [sA5.id, 'present'], [sA6.id, 'present']]); // 今天
  await sign(schedsB[0].id, [[B[0], 'present'], [B[1], 'late'], [B[2], 'present']]);     // -12
  await sign(schedsB[1].id, [[B[0], 'present'], [B[1], 'present'], [B[2], 'absent']]);   // -10
  await sign(schedsB[2].id, [[B[0], 'late'], [B[1], 'present'], [B[2], 'present']]);     // -8
  await sign(schedsB[3].id, [[B[0], 'present'], [B[1], 'present'], [B[2], 'late']]);     // -5
  await sign(schedsB[4].id, [[B[0], 'present'], [B[1], 'present'], [B[2], 'present']]);  // -3
  await sign(schedsB[5].id, [[B[0], 'present'], [B[1], 'present'], [B[2], 'present'], [sB5.id, 'present'], [sB2.id, 'present']]); // 今天

  const summary = {
    seededAt: new Date().toISOString(),
    teachers: [chen.name, li.name],
    classes: [classA.name, classB.name],
    studentsAdded: 11,
    schedulesAdded: aDates.length + bDates.length,
    conversionsAdded: 6,
    note: '上期窗口≈D-14..D-8、本期窗口≈D-7..今天；成单与签到在两期分布不同，变化列有真实数值',
  };
  fs.mkdirSync('../docs/schedule-ledger', { recursive: true });
  fs.writeFileSync('../docs/schedule-ledger/qa-rich-seed.json', JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary));
}

main().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => p.$disconnect());
