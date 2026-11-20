/**
 * 蜂鸣功能验收 · 写链路测试（点名→课消 / 续费 / 成单 / 转老师）
 *
 * 前置：后端(3000) 运行中、测试数据已 init。本测试会写入新数据——
 * 执行后应运行 `ACCEPT_TEST_PASSWORD=… npx tsx scripts/testCampusInit.ts init` 重建基线。
 *
 * 用法：ACCEPT_TEST_PASSWORD=<密码> npx tsx scripts/acceptanceWriteFlow.ts
 * 结果写入 docs/acceptance/write-flow-evidence.md
 */
import fs from 'fs';
import { randomUUID } from 'node:crypto';
import path from 'path';
import { PrismaClient } from '@prisma/client';

const BASE = 'http://localhost:3000';
const PW = process.env.ACCEPT_TEST_PASSWORD ?? '';
const prisma = new PrismaClient();
if (!PW) { console.error('请设置 ACCEPT_TEST_PASSWORD'); process.exit(1); }

interface Row { name: string; expected: string; actual: string; pass: boolean; note?: string }
const results: Row[] = [];
function rec(name: string, expected: string, actual: string, pass: boolean, note?: string) {
  results.push({ name, expected, actual, pass, note });
  console.log(`${pass ? '✅' : '❌'} ${name} | 预期 ${expected} | 实际 ${actual}${note ? ' | ' + note : ''}`);
}
async function login(email: string) {
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PW }),
  });
  return (await r.json()).data.token as string;
}
const H = (t: string) => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${t}` });
async function get(t: string, url: string) {
  const r = await fetch(`${BASE}${url}`, { headers: { Authorization: `Bearer ${t}` } });
  return { status: r.status, json: await r.json().catch(() => null) };
}
const pad = (n: number) => String(n).padStart(2, '0');
const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

async function main() {
  const adminT = await login('accept-admin@accept.buzzer.test');
  const t3T = await login('accept-t3@accept.buzzer.test');
  const s1T = await login('accept-s1@accept.buzzer.test');
  const org = await prisma.organization.findUnique({ where: { code: 'BZ-ACCEPT' } });
  const today = fmt(new Date());

  /* ================= 1. 点名 → 课消（老师 t3 对补课场次点名 2 人） =================
   * 自建一节"昨日补课"：场景数据在 C5 既有场次上均有出勤明细（present/absent），
   * 直接点名会撞 (studentId, scheduleId) 唯一键；且晚间运行时"今日课已过点变 completed"
   * 会造成时间漂移。补课场次与场景解耦，任何时刻可重复执行。 */
  const cls5 = await prisma.class.findFirst({ where: { organizationId: org.id, code: 'ACC-C5' } });
  const sched = await prisma.schedule.create({
    data: {
      organizationId: org.id, campusId: cls5.campusId, classId: cls5.id, teacherId: cls5.teacherId,
      startTime: new Date(Date.now() - 26 * 3600 * 1000), endTime: new Date(Date.now() - 25 * 3600 * 1000),
      status: 'completed', notes: '验收-补课点名链路（脚本自建）',
    },
  });
  const stu04 = await prisma.student.findFirst({ where: { organizationId: org.id, name: '验收学员04' } });
  const stu05 = await prisma.student.findFirst({ where: { organizationId: org.id, name: '验收学员05' } });
  const beforeCnt = await prisma.attendance.count({ where: { organizationId: org.id } });
  const checkin = await fetch(`${BASE}/api/attendances/batch`, {
    method: 'POST', headers: H(t3T),
    body: JSON.stringify({ scheduleId: sched.id, studentIds: [stu04.id, stu05.id], status: 'present', notes: '验收点名' }),
  });
  const checkinJ = await checkin.json().catch(() => null);
  rec('老师点名（batch 2 人 present）', '201/200', String(checkin.status), checkin.status < 300 && checkinJ?.data?.success === 2,
    `success=${checkinJ?.data?.success}`);
  const afterCnt = await prisma.attendance.count({ where: { organizationId: org.id } });
  rec('点名落库（出勤明细 +2）', String(beforeCnt + 2), String(afterCnt), afterCnt === beforeCnt + 2);
  const deduction = await prisma.lessonDeductionRecord.findFirst({
    where: { organizationId: org.id, classId: cls5.id },
    orderBy: { createdAt: 'desc' },
  });
  rec('划课记录生成（非管理员按课程日期限一次）', '生成', deduction ? `deductionCount=${deduction.deductionCount}, date=${deduction.deductionDate}` : '未生成',
    !!deduction, '业务日期取课程时刻的本地日期（P2 修复后无午夜偏移）');
  // 课消统计（今日口径）：present|late 记录数应包含刚才 2 条
  const cs = await get(adminT, `/api/consumption/statistics?startDate=${today}&endDate=${today}`);
  rec('课消统计（今日划课）', `>=2`, String(cs.json?.data?.totalAttendance), (cs.json?.data?.totalAttendance ?? 0) >= 2);
  // 同日重复点名被拒（非管理员防重复划课）
  const again = await fetch(`${BASE}/api/attendances/batch`, {
    method: 'POST', headers: H(t3T),
    body: JSON.stringify({ scheduleId: sched.id, studentIds: [stu04.id], status: 'present' }),
  });
  rec('同日重复划课被拒', '400', String(again.status), again.status === 400);

  /* ================= 2. 待续费 → 完成续费（事务端点，P1-06） =================
   * 与页面同款：POST /api/conversions/renewal 一步原子完成（成单+课时应增+换班）。
   * 预期从执行前余额动态计算（不再手工 PUT 最终字段）。 */
  const stu18 = await prisma.student.findFirst({ where: { organizationId: org.id, name: '验收学员18' } });
  const before = await prisma.student.findUnique({ where: { id: stu18.id } });
  const convCountBefore = await prisma.conversion.count({ where: { organizationId: org.id } });
  const renewalBody = {
    requestId: randomUUID(),
    existingStudentId: stu18.id, studentName: '验收学员18', contact: stu18.phone,
    classId: cls5.id, className: '验收五班',
    totalLessons: 24, price: 2400, paymentMethod: 'wechat', paymentStatus: 'paid',
    salesId: null, salesName: null, conversionDate: today, notes: '验收-续费流程',
  };
  const renew = await fetch(`${BASE}/api/conversions/renewal`, {
    method: 'POST', headers: H(adminT), body: JSON.stringify(renewalBody),
  });
  const renewJ = await renew.json().catch(() => null);
  rec('续费（事务端点 201）', '201', String(renew.status), renew.status === 201);
  const after = await prisma.student.findUnique({ where: { id: stu18.id } });
  rec(`续费后课时 剩余 ${before.remainingLessons}→${before.remainingLessons + 24}`, String(before.remainingLessons + 24),
    String(after.remainingLessons), after.remainingLessons === before.remainingLessons + 24);
  rec(`续费后已购 ${before.purchasedLessons}→${before.purchasedLessons + 24}`, String(before.purchasedLessons + 24),
    String(after.purchasedLessons), after.purchasedLessons === before.purchasedLessons + 24);
  const convCountMid = await prisma.conversion.count({ where: { organizationId: org.id } });
  rec('成单记录 +1', String(convCountBefore + 1), String(convCountMid), convCountMid === convCountBefore + 1);
  const rnAfter = await get(adminT, '/api/students?page=1&pageSize=1&status=active&maxRemainingLessons=10&excludeNoRenewal=true');
  rec('待续费名单 6→5（学员18 退出）', '5', String(rnAfter.json?.pagination?.total), rnAfter.json?.pagination?.total === 5);
  const cf = await get(adminT, `/api/cashflow-summary?startDate=${today.slice(0, 7)}-01&endDate=${today}`);
  rec('现金流续费金额 4800→7200', '7200', String(cf.json?.data?.renewal?.amount), Number(cf.json?.data?.renewal?.amount) === 7200);
  // 同UUID重放返回原回执201，不产生第二条成单，课时不再变化
  const dup = await fetch(`${BASE}/api/conversions/renewal`, {
    method: 'POST', headers: H(adminT), body: JSON.stringify(renewalBody),
  });
  const afterDup = await prisma.student.findUnique({ where: { id: stu18.id } });
  const convCountAfterDup = await prisma.conversion.count({ where: { organizationId: org.id } });
  const dupJson = await dup.json();
  rec('原UUID重放返回原成单(201)', '201', String(dup.status),
    dup.status === 201 && dupJson.data?.conversion?.id === renewJ?.data?.conversion?.id && convCountAfterDup === convCountMid && afterDup.remainingLessons === after.remainingLessons,
    `成单数仍=${convCountAfterDup}，剩余仍=${afterDup.remainingLessons}`);
  const { requestId: omittedId, ...withoutId } = renewalBody;
  const noId = await fetch(`${BASE}/api/conversions/renewal`, { method: 'POST', headers: H(adminT), body: JSON.stringify(withoutId) });
  const noIdJson = await noId.json();
  rec('缺UUID续费拒绝且无新增', '400 INVALID_REQUEST_ID', `${noId.status} ${noIdJson.error?.code}`, noId.status === 400 && noIdJson.error?.code === 'INVALID_REQUEST_ID' && await prisma.conversion.count({ where: { organizationId: org.id } }) === convCountMid);
  void omittedId;

  /* ================= 3. 线索 → 体验课（已成单） → 成单关联 ================= */
  // 体验学员03（到场未成单）由 s1 转成单
  const exp03 = await prisma.experienceLesson.findFirst({
    where: { organizationId: org.id, studentName: '体验学员03' },
  });
  const cls1 = await prisma.class.findFirst({ where: { organizationId: org.id, code: 'ACC-C1' } });
  const studentsBefore = await prisma.student.count({ where: { organizationId: org.id } });
  const newConv = await fetch(`${BASE}/api/conversions`, {
    method: 'POST', headers: H(s1T),
    body: JSON.stringify({
      studentName: '体验学员03', contact: '13603000000', classId: cls1.id, className: '验收一班',
      courseType: '幼儿体能', totalLessons: 24, price: 2400, paymentMethod: 'cash', paymentStatus: 'paid',
      conversionDate: today, experienceLessonId: exp03.id, notes: '验收-体验转成单',
    }),
  });
  const newConvJ = await newConv.json().catch(() => null);
  rec('销售创建成单（新学员+体验课关联）', '201', String(newConv.status), newConv.status === 201);
  const studentsAfter = await prisma.student.count({ where: { organizationId: org.id } });
  rec('成单自动创建学员', String(studentsBefore + 1), String(studentsAfter), studentsAfter === studentsBefore + 1);
  const enroll = await prisma.enrollment.findFirst({
    where: { organizationId: org.id, studentId: newConvJ?.data?.studentId, classId: cls1.id, status: 'active' },
  });
  rec('成单自动创建报名（enrollment）', '已创建', enroll ? '已创建' : '未创建', !!enroll);
  const exp03After = await prisma.experienceLesson.findUnique({ where: { id: exp03.id } });
  rec('体验课状态 completed→converted', 'converted', exp03After.status, exp03After.status === 'converted');
  const uncAfter = await get(adminT, '/api/experience-lessons/unconverted');
  rec('未成单回访 4→3', '3', String(uncAfter.json?.data?.length ?? uncAfter.json?.data?.items?.length), (uncAfter.json?.data?.length ?? uncAfter.json?.data?.items?.length ?? -1) === 3);
  // 非管理员替他人成单被拒（防翘单）
  const t3u = await prisma.user.findFirst({ where: { email: 'accept-s2@accept.buzzer.test' } });
  const hijack = await fetch(`${BASE}/api/conversions`, {
    method: 'POST', headers: H(s1T),
    body: JSON.stringify({
      studentName: '验收防翘单', contact: '13500009999', salesId: t3u.id, salesName: '验收销售二',
      classId: cls1.id, courseType: '幼儿体能', totalLessons: 24, price: 2400, conversionDate: today,
    }),
  });
  rec('销售替他人成单被拒（防翘单）', '403', String(hijack.status), hijack.status === 403);

  /* ================= 4. 转老师（资源交接：班6 老师 t3 → t1） ================= */
  const t1 = await prisma.user.findFirst({ where: { email: 'accept-t1@accept.buzzer.test' } });
  const t3 = await prisma.user.findFirst({ where: { email: 'accept-t3@accept.buzzer.test' } });
  const cls6 = await prisma.class.findFirst({ where: { organizationId: org.id, code: 'ACC-C6' } });
  const transfer = await fetch(`${BASE}/api/resource-transfers/execute`, {
    method: 'POST', headers: H(adminT),
    body: JSON.stringify({ fromTeacherId: t3.id, toTeacherId: t1.id, classIds: [cls6.id], notes: '验收-转老师' }),
  });
  const transferJ = await transfer.json().catch(() => null);
  rec('资源交接执行（班6 → 老师一）', '200', String(transfer.status), transfer.status === 200, JSON.stringify(transferJ?.data ?? '').slice(0, 60));
  const cls6After = await prisma.class.findUnique({ where: { id: cls6.id } });
  rec('班级 teacherId 已变更', '老师一', cls6After.teacherId === t1.id ? '老师一' : cls6After.teacherId, cls6After.teacherId === t1.id);
  const sched6 = await prisma.schedule.findFirst({ where: { classId: cls6.id }, orderBy: { startTime: 'desc' } });
  rec('未来排课 teacherId 同步变更', '同步', sched6.teacherId === t1.id ? '同步' : '未同步', sched6.teacherId === t1.id);
  const transferLog = await prisma.resourceTransfer.findFirst({
    where: { organizationId: org.id, toTeacherId: t1.id }, orderBy: { createdAt: 'desc' },
  });
  rec('交接历史记录生成', '已生成', transferLog ? '已生成' : '未生成', !!transferLog);

  /* ---------- 落盘 ---------- */
  const pass = results.filter((r) => r.pass).length;
  const L = [
    `# 写链路证据（真实接口 · 会改变数据，执行后需 init 重建基线）`,
    ``,
    `- 执行时间：${new Date().toISOString()}`,
    `- 链路：点名→课消 / 待续费→续费 / 体验课→成单 / 转老师`,
    `- 结果：**${pass}/${results.length} 通过**`,
    ``,
    `| # | 步骤 | 预期 | 实际 | 结果 | 备注 |`,
    `|---|---|---|---|---|---|`,
    ...results.map((r, i) => `| ${i + 1} | ${r.name} | ${r.expected} | ${r.actual} | ${r.pass ? '✅' : '❌'} | ${r.note ?? ''} |`),
  ];
  const outDir = path.resolve(__dirname, '../../docs/acceptance');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'write-flow-evidence.md'), L.join('\n'), 'utf-8');
  console.log(`\n=== 写链路 ${pass}/${results.length}，证据 docs/acceptance/write-flow-evidence.md ===`);
  await prisma.$disconnect();
  process.exit(pass === results.length ? 0 : 2);
}

main().catch(async (e) => { console.error('执行异常:', e); await prisma.$disconnect(); process.exit(1); });
