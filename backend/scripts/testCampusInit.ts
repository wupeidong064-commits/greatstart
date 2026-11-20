/**
 * 蜂鸣功能验收测试校区 —— 初始化 / 清理 / 预览脚本
 *
 * 用法（在 backend 目录下执行）：
 *   ACCEPT_TEST_PASSWORD=<测试密码> npx tsx scripts/testCampusInit.ts preview   # 预览（默认）
 *   ACCEPT_TEST_PASSWORD=<测试密码> npx tsx scripts/testCampusInit.ts init      # 清理后重建（单事务，失败整体回滚）
 *   ACCEPT_TEST_PASSWORD=<测试密码> npx tsx scripts/testCampusInit.ts clean     # 仅清理测试标识范围
 *
 * 隔离与安全：
 * - 测试标识：机构 code = BZ-ACCEPT / BZ-ISO，账号邮箱后缀 @accept.buzzer.test / @iso.buzzer.test，
 *   学员姓名前缀「验收学员」/「隔离」。清理只按这些精确标识删除，绝不触碰其他数据。
 * - 测试账号初始密码只从环境变量 ACCEPT_TEST_PASSWORD 读取，源码不落字面量。
 * - 不修改任何业务计算逻辑与数据库结构；数据全部经 Prisma 写入 DATABASE_URL 指向的库。
 * - 重复执行 init 幂等：先清理同标识数据再整体重建（单事务）。
 *
 * 基准日：执行当天（Asia/Shanghai 本机时区）。相对日期以 D=当天 00:00 计算；
 * 台账输出 docs/acceptance/expected-ledger.md，写明基准日与全部预期值。
 * 预期值由本脚本按后端业务口径从"将写入的明细"独立验算，不以接口回读为准。
 */
import { PrismaClient } from '@prisma/client';
import { seedPriceCatalog } from '../src/services/aiCreditService';
import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();

/* ==================== 常量与标识 ==================== */
const ACCEPT_ORG_CODE = 'BZ-ACCEPT';
const ISO_ORG_CODE = 'BZ-ISO';
const ACCEPT_EMAIL_SUFFIX = '@accept.buzzer.test';
const ISO_EMAIL_SUFFIX = '@iso.buzzer.test';
/** 测试账号初始密码：只从环境变量读取（长度≥8，含大小写字母与数字） */
const TEST_PASSWORD = process.env.ACCEPT_TEST_PASSWORD ?? '';
function assertPassword() {
  if (TEST_PASSWORD.length < 8 || !/[a-z]/.test(TEST_PASSWORD) || !/[A-Z]/.test(TEST_PASSWORD) || !/[0-9]/.test(TEST_PASSWORD)) {
    console.error('请先设置 ACCEPT_TEST_PASSWORD 环境变量（长度≥8，含大小写字母与数字）');
    process.exit(1);
  }
}
const CAMPUS_CODE = 'ACCEPT1';
const PARENT_PHONE = '13800009901';

/** 课包（两种）：幼儿体能 24 节 ¥2400 / 精英篮球 48 节 ¥4800 */
const PACKAGES = {
  tn: { name: '幼儿体能课包', lessons: 24, price: 2400, courseType: '幼儿体能', code: 'ACC-TN24' },
  lq: { name: '精英篮球课包', lessons: 48, price: 4800, courseType: '精英篮球', code: 'ACC-LQ48' },
} as const;
type PackageKey = keyof typeof PACKAGES;
const RENEWAL_TYPES = ['续费', 'renewal', '续报'];

/* ==================== 日期工具（Asia/Shanghai 本地时区） ==================== */
const pad = (n: number) => String(n).padStart(2, '0');
const fmtDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** 基准日 D = 今天 00:00（本地） */
const D = new Date();
D.setHours(0, 0, 0, 0);
/** D + offset 天，时间 hh:mm，分钟偏移 addMin */
function at(dayOffset: number, hhmm: string, addMin = 0): Date {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date(D);
  d.setDate(d.getDate() + dayOffset);
  d.setHours(h, m, 0, 0);
  return new Date(d.getTime() + addMin * 60000);
}
function sameDay(a: Date, b: Date) {
  return fmtDate(a) === fmtDate(b);
}
function weekStartOf(base: Date) {
  const d = new Date(base);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}
const NOW = new Date();

/* ==================== 班级配置（6 班 / 3 老师 / 工作日+周末+早晚） ====================
 * dow: 0=周日..6=周六
 * C6 为"新班"：仅未来排课（首课 D+16），用于 J2（窗口内无应上课次）与 E2/E3（尚未到首课）
 */
const CLASS_DEFS = [
  { idx: 1, name: '验收一班', code: 'ACC-C1', pkg: 'tn' as PackageKey, teacherIdx: 1, dow: [1, 3, 5], time: '18:00', historyFrom: -35, historyTo: 14 },
  { idx: 2, name: '验收二班', code: 'ACC-C2', pkg: 'tn' as PackageKey, teacherIdx: 1, dow: [2, 4, 5], time: '10:00', historyFrom: -35, historyTo: 14, cancelOn: -3 },
  { idx: 3, name: '验收三班', code: 'ACC-C3', pkg: 'tn' as PackageKey, teacherIdx: 2, dow: [6], time: '09:00', historyFrom: -35, historyTo: 14 },
  { idx: 4, name: '验收四班', code: 'ACC-C4', pkg: 'tn' as PackageKey, teacherIdx: 2, dow: [0], time: '15:00', historyFrom: -35, historyTo: 14 },
  { idx: 5, name: '验收五班', code: 'ACC-C5', pkg: 'lq' as PackageKey, teacherIdx: 3, dow: [3, 5], time: '19:00', historyFrom: -35, historyTo: 14 },
  { idx: 6, name: '验收六班', code: 'ACC-C6', pkg: 'tn' as PackageKey, teacherIdx: 3, dow: [6], time: '16:00', historyFrom: 16, historyTo: 30 },
];

/* ==================== 30 名学员场景分配 ==================== */
interface StuDef {
  no: number;
  group: string;
  classIdx: number;
  pkg: PackageKey;
  enrollOffset: number;
  pattern: string;
  remaining?: number;
  notes?: string;
}

const STU_DEFS: StuDef[] = [
  { no: 1, group: 'A', classIdx: 1, pkg: 'lq', enrollOffset: -60, pattern: 'all-present' },
  { no: 2, group: 'A', classIdx: 2, pkg: 'lq', enrollOffset: -60, pattern: 'all-present' },
  { no: 3, group: 'A', classIdx: 4, pkg: 'tn', enrollOffset: -55, pattern: 'all-present' },
  { no: 4, group: 'B', classIdx: 5, pkg: 'lq', enrollOffset: -60, pattern: 'low-30d' },
  { no: 5, group: 'B', classIdx: 5, pkg: 'lq', enrollOffset: -60, pattern: 'low-30d' },
  { no: 6, group: 'B', classIdx: 5, pkg: 'lq', enrollOffset: -60, pattern: 'low-30d' },
  { no: 7, group: 'C', classIdx: 3, pkg: 'tn', enrollOffset: -60, pattern: 'continuous-leave' },
  { no: 8, group: 'C', classIdx: 3, pkg: 'tn', enrollOffset: -60, pattern: 'continuous-leave' },
  { no: 9, group: 'C', classIdx: 3, pkg: 'tn', enrollOffset: -60, pattern: 'continuous-leave' },
  { no: 10, group: 'D', classIdx: 1, pkg: 'tn', enrollOffset: -8, pattern: 'all-present' },
  { no: 11, group: 'D', classIdx: 2, pkg: 'tn', enrollOffset: -8, pattern: 'all-present' },
  { no: 12, group: 'D', classIdx: 4, pkg: 'tn', enrollOffset: -9, pattern: 'all-present' },
  { no: 13, group: 'E', classIdx: 4, pkg: 'tn', enrollOffset: -5, pattern: 'absent-once' },
  { no: 14, group: 'E', classIdx: 6, pkg: 'tn', enrollOffset: -2, pattern: 'none' },
  { no: 15, group: 'E', classIdx: 6, pkg: 'tn', enrollOffset: -2, pattern: 'none' },
  { no: 16, group: 'F', classIdx: 2, pkg: 'tn', enrollOffset: -45, pattern: 'all-present' },
  { no: 17, group: 'F', classIdx: 2, pkg: 'tn', enrollOffset: -45, pattern: 'all-present' },
  { no: 18, group: 'F', classIdx: 1, pkg: 'tn', enrollOffset: -45, pattern: 'all-present' },
  { no: 19, group: 'G', classIdx: 2, pkg: 'tn', enrollOffset: -45, pattern: 'all-present', notes: 'renew-at:-10' },
  { no: 20, group: 'G', classIdx: 2, pkg: 'tn', enrollOffset: -45, pattern: 'all-present', notes: 'renew-at:-8' },
  { no: 21, group: 'G', classIdx: 3, pkg: 'tn', enrollOffset: -45, pattern: 'all-present', notes: 'renew-at:-32' },
  { no: 22, group: 'H', classIdx: 1, pkg: 'tn', enrollOffset: -50, pattern: 'all-present', remaining: 0 },
  { no: 23, group: 'H', classIdx: 2, pkg: 'tn', enrollOffset: -50, pattern: 'all-present', remaining: 0 },
  { no: 24, group: 'H', classIdx: 4, pkg: 'tn', enrollOffset: -50, pattern: 'all-present', remaining: 0 },
  { no: 25, group: 'I', classIdx: 1, pkg: 'tn', enrollOffset: -50, pattern: 'until', remaining: 0, notes: 'refunded' },
  { no: 26, group: 'I', classIdx: 2, pkg: 'tn', enrollOffset: -50, pattern: 'until', remaining: 0, notes: 'lost' },
  { no: 27, group: 'I', classIdx: 4, pkg: 'tn', enrollOffset: -50, pattern: 'until', remaining: 0, notes: 'no-renewal' },
  { no: 28, group: 'J', classIdx: 1, pkg: 'tn', enrollOffset: -50, pattern: 'transfer', notes: 'from-class:2,at:-20' },
  { no: 29, group: 'J', classIdx: 6, pkg: 'tn', enrollOffset: -2, pattern: 'none' },
  { no: 30, group: 'J', classIdx: 3, pkg: 'tn', enrollOffset: -60, pattern: 'mixed' },
];

/* ==================== 内存构建 ==================== */

interface BuiltSchedule { classIdx: number; start: Date; end: Date; status: string; cancelled: boolean }
interface BuiltAttendance { stuNo: number; classIdx: number; start: Date; status: string }

function buildClassSchedules(): BuiltSchedule[] {
  const out: BuiltSchedule[] = [];
  for (const c of CLASS_DEFS) {
    for (let off = c.historyFrom; off <= c.historyTo; off++) {
      const d = at(off, '00:00');
      if (!c.dow.includes(d.getDay())) continue;
      const start = at(off, c.time);
      const end = new Date(start.getTime() + 60 * 60000);
      let status: string;
      if (off < 0) status = 'completed';
      else if (off === 0) status = start < NOW ? 'completed' : 'scheduled'; // 今日：已过点的课视为已完成
      else status = 'scheduled';
      const cancelled = c.cancelOn !== undefined && off === c.cancelOn;
      if (cancelled) status = 'cancelled';
      out.push({ classIdx: c.idx, start, end, status, cancelled });
    }
  }
  return out;
}

function buildAttendanceFor(stu: StuDef, schedules: BuiltSchedule[]): BuiltAttendance[] {
  const enrollAt = at(stu.enrollOffset, '09:00');
  const relevant = schedules
    .filter((s) => s.classIdx === stu.classIdx && s.status === 'completed')
    .filter((s) => s.start >= enrollAt && s.start <= NOW)
    .sort((a, b) => a.start.getTime() - b.start.getTime());

  const rows: BuiltAttendance[] = [];
  const push = (s: BuiltSchedule, status: string, classIdx = stu.classIdx) =>
    rows.push({ stuNo: stu.no, classIdx, start: s.start, status });

  const winStart = at(-30, '00:00');
  const inWin = relevant.filter((s) => s.start >= winStart);
  const beforeWin = relevant.filter((s) => s.start < winStart);

  switch (stu.pattern) {
    case 'none':
      return rows;
    case 'all-present':
      relevant.forEach((s) => push(s, 'present'));
      break;
    case 'low-30d':
      beforeWin.forEach((s) => push(s, 'present'));
      inWin.forEach((s, i) => push(s, i === 0 ? 'present' : 'absent'));
      break;
    case 'continuous-leave': {
      // 最后 3 场（时间升序）依次 leave/leave/absent —— 倒序开头连续 3 次异常；更早场次全勤
      const tail = relevant.slice(-3);
      const earlier = relevant.slice(0, -3);
      earlier.forEach((s) => push(s, 'present'));
      const tailStatus = ['leave', 'leave', 'absent'];
      tail.forEach((s, i) => push(s, tailStatus[i] ?? 'leave'));
      break;
    }
    case 'absent-once':
      if (relevant.length) push(relevant[0], 'absent');
      break;
    case 'until': {
      const stop = at(-22, '00:00');
      relevant.filter((s) => s.start < stop).forEach((s) => push(s, 'present'));
      break;
    }
    case 'transfer': {
      const oldSched = schedules
        .filter((s) => s.classIdx === 2 && s.status === 'completed' && s.start >= enrollAt && s.start < at(-20, '00:00'))
        .sort((a, b) => a.start.getTime() - b.start.getTime())
        .slice(0, 3);
      oldSched.forEach((s) => push(s, 'present', 2));
      relevant.filter((s) => s.start >= at(-20, '00:00')).forEach((s) => push(s, 'present'));
      break;
    }
    case 'mixed':
      inWin.slice(0, 5).forEach((s, i) => push(s, ['present', 'present', 'late', 'leave', 'makeUp'][i] ?? 'present'));
      beforeWin.forEach((s) => push(s, 'present'));
      break;
    default:
      throw new Error(`未知出勤模式 ${stu.pattern}`);
  }
  return rows;
}

interface Built {
  users: any[];
  students: any[];
  enrollments: any[];
  schedules: BuiltSchedule[];
  attendances: BuiltAttendance[];
  conversions: any[];
  leads: any[];
  experiences: any[];
  refund: { stuNo: number; lessons: number; amount: number; offset: number; reason: string };
  lessonTransfer: { stuNo: number; fromClassIdx: number; toClassIdx: number; offset: number };
}

const salesIdxOf = (no: number) => (no % 4 === 0 ? 2 : 1);
const dateBucket = (no: number) => {
  if (no <= 6) return -34 - (no % 3) * 3;
  if (no <= 18) return -22 - (no % 5) * 2;
  return -2 - (no % 3);
};

function build(): Built {
  const schedules = buildClassSchedules();
  const attendances: BuiltAttendance[] = [];
  for (const stu of STU_DEFS) attendances.push(...buildAttendanceFor(stu, schedules));

  const students = STU_DEFS.map((s) => {
    const pkg = PACKAGES[s.pkg];
    const consumed = attendances.filter(
      (a) => a.stuNo === s.no && ['present', 'late', 'makeUp'].includes(a.status)
    ).length;
    const renewAt = s.notes?.startsWith('renew-at:') ? Number(s.notes.split(':')[1]) : null;
    const purchased = pkg.lessons + (renewAt !== null ? pkg.lessons : 0);
    // 显式指定 remaining 时（F/H/I 组），consumed 以 purchased-remaining 的汇总口径表达
    // （这些场景的历史课耗早于排考窗口；出勤明细只覆盖近 5 周，见台账"日期分布自检"）
    const remaining = s.remaining !== undefined ? s.remaining : purchased - consumed;
    const consumedFinal = s.remaining !== undefined ? purchased - s.remaining : consumed;
    const status =
      s.group === 'I'
        ? s.notes === 'refunded' ? 'refunded' : s.notes === 'lost' ? 'lost' : 'inactive'
        : 'active';
    return { ...s, pkgName: pkg.name, price: pkg.price, purchased, consumed: consumedFinal, remaining, renewAt, status };
  });

  const enrollments = students.map((s) => {
    let status = 'active';
    if (s.group === 'I') status = s.notes === 'no-renewal' ? 'completed' : 'cancelled';
    return { stuNo: s.no, classIdx: s.classIdx, offset: s.enrollOffset, status };
  });

  const conversions = students.map((s) => {
    const pkg = PACKAGES[s.pkg];
    return {
      stuNo: s.no,
      kind: s.renewAt !== null ? '续费' : '新报名',
      courseType: s.renewAt !== null ? '续费' : pkg.courseType,
      lessons: pkg.lessons, price: pkg.price,
      offset: s.renewAt !== null ? s.renewAt : (s.no === 25 ? -40 : dateBucket(s.no)),
      salesIdx: salesIdxOf(s.no),
    };
  });

  const leads = [
    { name: '验收线索01', salesIdx: 1, status: 'contacted', offset: -12 },
    { name: '验收线索02', salesIdx: 1, status: 'visited', offset: -10 },
    { name: '验收线索03', salesIdx: 1, status: 'converted', offset: -9 },
    { name: '验收线索04', salesIdx: 1, status: 'new', offset: -5 },
    { name: '验收线索05', salesIdx: 1, status: 'lost', offset: -20 },
    { name: '验收线索06', salesIdx: 1, status: 'new', offset: -3 },
    { name: '验收线索07', salesIdx: 1, status: 'contacted', offset: -2 },
    { name: '验收线索08', salesIdx: 1, status: 'converted', offset: -6 },
    { name: '验收线索09', salesIdx: 2, status: 'new', offset: -8 },
    { name: '验收线索10', salesIdx: 2, status: 'contacted', offset: -7 },
    { name: '验收线索11', salesIdx: 2, status: 'lost', offset: -15 },
    { name: '验收线索12', salesIdx: 2, status: 'visited', offset: -4 },
    { name: '验收线索13', salesIdx: 2, status: 'new', offset: -1 },
  ];

  const experiences = [
    { name: '体验学员01', salesIdx: 1, status: 'converted', offset: -9, classIdx: 1, teacherIdx: 1, leadIdx: 3 },
    { name: '体验学员02', salesIdx: 1, status: 'converted', offset: -6, classIdx: 2, teacherIdx: 1, leadIdx: 8 },
    { name: '体验学员03', salesIdx: 1, status: 'completed', offset: -8, classIdx: 3, teacherIdx: 2 },
    { name: '体验学员04', salesIdx: 1, status: 'noshow', offset: -7, classIdx: 4, teacherIdx: 2 },
    { name: '体验学员05', salesIdx: 1, status: 'pending', offset: 3, classIdx: 1, teacherIdx: 1 },
    { name: '体验学员06', salesIdx: 1, status: 'pending', offset: 5, classIdx: 5, teacherIdx: 3 },
    { name: '体验学员07', salesIdx: 2, status: 'converted', offset: -5, classIdx: 4, teacherIdx: 2 },
    { name: '体验学员08', salesIdx: 2, status: 'completed', offset: -4, classIdx: 5, teacherIdx: 3 },
    { name: '体验学员09', salesIdx: 2, status: 'noshow', offset: -3, classIdx: 1, teacherIdx: 1 },
    { name: '体验学员10', salesIdx: 2, status: 'pending', offset: 2, classIdx: 3, teacherIdx: 2 },
  ];

  return {
    users: [
      { email: 'accept-admin', name: '验收校区管理员', role: 'manager', phone: '13800001000' },
      { email: 'accept-t1', name: '验收老师一', role: 'teacher', phone: '13800001001' },
      { email: 'accept-t2', name: '验收老师二', role: 'teacher', phone: '13800001002' },
      { email: 'accept-t3', name: '验收老师三', role: 'teacher', phone: '13800001003' },
      { email: 'accept-s1', name: '验收销售一', role: 'sales', phone: '13800001004' },
      { email: 'accept-s2', name: '验收销售二', role: 'sales', phone: '13800001005' },
      { email: 'accept-parent', name: '验收家长（学员01）', role: 'parent', phone: PARENT_PHONE },
    ],
    students, enrollments, schedules, attendances, conversions, leads, experiences,
    refund: { stuNo: 25, lessons: PACKAGES.tn.lessons, amount: PACKAGES.tn.price, offset: -12, reason: '验收测试退费-搬迁离京' },
    lessonTransfer: { stuNo: 28, fromClassIdx: 2, toClassIdx: 1, offset: -20 },
  };
}

/* ==================== 预期值独立验算（按后端口径） ==================== */
function computeExpected(b: Built) {
  const win30 = at(-30, '00:00');
  const win14 = at(-14, '00:00');
  const weekStart = weekStartOf(D);
  const monthStart = new Date(D.getFullYear(), D.getMonth(), 1);

  const lowClasses: { classIdx: number; rate: number }[] = [];
  for (const c of CLASS_DEFS) {
    const activeStudents = b.students.filter(
      (s) => s.classIdx === c.idx && b.enrollments.find((e) => e.stuNo === s.no)?.status === 'active'
    );
    if (!activeStudents.length) continue;
    const sched14 = b.schedules.filter((s) => s.classIdx === c.idx && s.start >= win14 && s.start <= NOW).length;
    const expectedTotal = sched14 * activeStudents.length;
    const actual = b.attendances.filter(
      (a) => a.classIdx === c.idx && a.start >= win14 && a.start <= NOW && ['present', 'late'].includes(a.status)
    ).length;
    const rate = expectedTotal > 0 ? Math.round((actual / expectedTotal) * 100) : 100;
    if (expectedTotal > 0 && rate < 60) lowClasses.push({ classIdx: c.idx, rate });
  }

  const lowStudents: { no: number; rate: number; schedules: number; present: number }[] = [];
  for (const s of b.students) {
    const enr = b.enrollments.find((e) => e.stuNo === s.no)!;
    if (enr.status !== 'active') continue;
    const enrollTime = at(s.enrollOffset, '09:00').getTime();
    // 分母/分子均只计入报名（入班）之后的课次与出勤——与后端接口裁剪口径一致
    const scheds = b.schedules.filter(
      (x) => x.classIdx === s.classIdx && x.status === 'completed' && x.start >= win30 && x.start <= NOW && x.start.getTime() >= enrollTime
    ).length;
    if (scheds === 0) continue;
    const present = b.attendances.filter(
      (a) => a.stuNo === s.no && a.classIdx === s.classIdx && a.start >= win30 && a.start <= NOW && a.start.getTime() >= enrollTime && ['present', 'late'].includes(a.status)
    ).length;
    const rate = Math.round((present / scheds) * 100);
    if (rate < 60) lowStudents.push({ no: s.no, rate, schedules: scheds, present });
  }
  lowStudents.sort((a, x) => a.rate - x.rate);

  const continuousLeave: { no: number; count: number }[] = [];
  for (const s of b.students) {
    const enr = b.enrollments.find((e) => e.stuNo === s.no)!;
    if (enr.status !== 'active') continue;
    const recs = b.attendances
      .filter((a) => a.stuNo === s.no && a.classIdx === s.classIdx)
      .sort((a, x) => x.start.getTime() - a.start.getTime());
    let run = 0;
    for (const r of recs) {
      if (r.status === 'absent' || r.status === 'leave') run++;
      else break;
    }
    if (run >= 2) continuousLeave.push({ no: s.no, count: run });
  }

  // 待续费统一口径（P1-04）：在读 active + 未标记不续费 + 剩余课时 ≤10 —— 首页与续费页同口径
  const renewalCount = b.students.filter(
    (s) => s.remaining <= 10 && s.status === 'active' && s.notes !== 'no-renewal'
  ).length;
  const experienceUnconverted = b.experiences.filter((e) => ['completed', 'noshow'].includes(e.status)).length;
  const todaySchedules = b.schedules.filter((s) => sameDay(s.start, D)).length;
  const activeStudents = b.students.length - 3; // I 组 3 人非 active
  const rosterCount = new Set(b.enrollments.filter((e) => e.status === 'active').map((e) => e.stuNo)).size;
  const weekConsumption = b.attendances.filter(
    (a) => a.start >= weekStart && a.start <= NOW && ['present', 'late'].includes(a.status)
  ).length;

  let monthNewCount = 0, monthNewAmount = 0, monthRenewalCount = 0, monthRenewalAmount = 0;
  for (const c of b.conversions) {
    const dt = at(c.offset, '12:00');
    if (dt < monthStart || dt > NOW) continue;
    if (RENEWAL_TYPES.includes(c.courseType)) { monthRenewalCount++; monthRenewalAmount += c.price; }
    else { monthNewCount++; monthNewAmount += c.price; }
  }

  const honeymoon: { no: number; rate: number }[] = [];
  for (const e of b.enrollments) {
    if (e.status !== 'active') continue;
    const stu = b.students.find((s) => s.no === e.stuNo)!;
    const enrollAt = at(stu.enrollOffset, '09:00');
    if (enrollAt < win30) continue;
    const scheds = b.schedules.filter(
      (s) => s.classIdx === e.classIdx && s.status === 'completed' && s.start >= enrollAt && s.start <= NOW
    ).length;
    const present = b.attendances.filter(
      (a) => a.stuNo === e.stuNo && a.start >= enrollAt && a.start <= NOW && ['present', 'late'].includes(a.status)
    ).length;
    honeymoon.push({ no: e.stuNo, rate: scheds > 0 ? Math.round((present / scheds) * 100) : 100 });
  }

  const perStudent = b.students.map((s) => {
    const enrollTime = at(s.enrollOffset, '09:00').getTime();
    const inWin = b.attendances.filter((a) => a.stuNo === s.no && a.start >= win30);
    const cls = CLASS_DEFS.find((c) => c.idx === s.classIdx)!;
    // 30 天应出勤 = 窗口内已完成排课 ∩ 报名之后（入班前课次不计，P1-05）
    const scheds30 = b.schedules.filter(
      (x) => x.classIdx === s.classIdx && x.status === 'completed' && x.start >= win30 && x.start <= NOW && x.start.getTime() >= enrollTime
    ).length;
    return {
      no: s.no, name: `验收学员${pad(s.no)}`, group: s.group, className: cls.name,
      teacher: `验收老师${'一二三'[cls.teacherIdx - 1]}`,
      enroll: fmtDate(at(s.enrollOffset, '09:00')),
      pkg: `${PACKAGES[s.pkg].name}(${PACKAGES[s.pkg].lessons}节/¥${PACKAGES[s.pkg].price})`,
      purchased: s.purchased, consumed: s.consumed, remaining: s.remaining,
      scheds30,
      present30: inWin.filter((a) => a.status === 'present').length,
      late30: inWin.filter((a) => a.status === 'late').length,
      leave30: inWin.filter((a) => a.status === 'leave').length,
      absent30: inWin.filter((a) => a.status === 'absent').length,
      makeUp30: inWin.filter((a) => a.status === 'makeUp').length,
      rate30: scheds30 > 0
        ? Math.round((inWin.filter((a) => ['present', 'late'].includes(a.status) && a.start.getTime() >= enrollTime).length / scheds30) * 100)
        : null,
      inLowStudents: lowStudents.some((l) => l.no === s.no),
      inContinuous: continuousLeave.some((l) => l.no === s.no),
      inRenewal: s.remaining <= 10 && s.status === 'active' && s.notes !== 'no-renewal',
    };
  });

  return {
    lowClasses, lowStudents, continuousLeave, renewalCount, experienceUnconverted,
    todaySchedules, activeStudents, rosterCount, weekConsumption,
    monthNewCount, monthNewAmount, monthRenewalCount, monthRenewalAmount, honeymoon, perStudent,
  };
}

/* ==================== 台账输出 ==================== */
function writeLedger(b: Built, exp: ReturnType<typeof computeExpected>): string {
  const L: string[] = [];
  L.push(`# 蜂鸣功能验收测试校区 · 预期结果台账`);
  L.push('');
  L.push(`- 基准日 D：**${fmtDate(D)}**（Asia/Shanghai，脚本执行当天生成）`);
  L.push(`- 测试标识：机构 code \`${ACCEPT_ORG_CODE}\`，校区 code \`${CAMPUS_CODE}\`，账号后缀 \`${ACCEPT_EMAIL_SUFFIX}\`，学员前缀「验收学员」`);
  L.push(`- 隔离机构：code \`${ISO_ORG_CODE}\`（最小隔离校验用）`);
  L.push(`- 账号初始密码：由执行时环境变量 ACCEPT_TEST_PASSWORD 提供（见交付说明）。`);
  L.push(`- 预期值由初始化脚本按后端业务口径从**将写入的业务明细**独立验算，非接口回读。`);
  L.push('');
  L.push(`## 一、账号`);
  L.push('');
  L.push(`| 角色 | 邮箱 | 姓名 | 说明 |`);
  L.push(`|---|---|---|---|`);
  L.push(`| 校区管理员(manager) | accept-admin${ACCEPT_EMAIL_SUFFIX} | 验收校区管理员 | 绑定测试校区 |`);
  L.push(`| 老师(teacher) | accept-t1${ACCEPT_EMAIL_SUFFIX} | 验收老师一 | 班1/班2 |`);
  L.push(`| 老师(teacher) | accept-t2${ACCEPT_EMAIL_SUFFIX} | 验收老师二 | 班3/班4 |`);
  L.push(`| 老师(teacher) | accept-t3${ACCEPT_EMAIL_SUFFIX} | 验收老师三 | 班5/班6 |`);
  L.push(`| 销售(sales) | accept-s1${ACCEPT_EMAIL_SUFFIX} | 验收销售一 | 线索8/体验6 |`);
  L.push(`| 销售(sales) | accept-s2${ACCEPT_EMAIL_SUFFIX} | 验收销售二 | 线索5/体验4 |`);
  L.push(`| 家长(parent) | accept-parent${ACCEPT_EMAIL_SUFFIX} | 验收家长 | 手机 ${PARENT_PHONE}，关联 验收学员01 |`);
  L.push(`| 隔离机构管理员 | iso-admin${ISO_EMAIL_SUFFIX} | 隔离测试管理员 | 机构 ${ISO_ORG_CODE} |`);
  L.push('');
  L.push(`## 二、班级与课包`);
  L.push('');
  L.push(`| 班级 | 编码 | 课包/类型 | 老师 | 周时段 | 排课范围 |`);
  L.push(`|---|---|---|---|---|---|`);
  for (const c of CLASS_DEFS) {
    const dowName = c.dow.map((d) => '日一二三四五六'[d]).join('/');
    L.push(`| ${c.name} | ${c.code} | ${PACKAGES[c.pkg].name} | 验收老师${'一二三'[c.teacherIdx - 1]} | 周${dowName} ${c.time} | D${c.historyFrom} ~ D+${c.historyTo}${c.cancelOn !== undefined ? `（D${c.cancelOn} 一节取消）` : ''} |`);
  }
  L.push('');
  L.push(`> 班6 为新班（首课 D+16，无历史排课）：用于「窗口内无应上课次」与「尚未到首课时间」。`);
  L.push('');
  L.push(`## 三、30 名学员台账`);
  L.push('');
  L.push(`| 编号 | 场景 | 班级 | 老师 | 报名日 | 课包 | 已购/已耗/剩余 | 30天应出勤 | 出/迟/请/缺/补 | 预期出勤率 | 低出勤 | 连续异常 | 待续费 |`);
  L.push(`|---|---|---|---|---|---|---|---|---|---|---|---|---|`);
  for (const p of exp.perStudent) {
    L.push(`| ${p.name} | ${p.group} | ${p.className} | ${p.teacher} | ${p.enroll} | ${p.pkg} | ${p.purchased}/${p.consumed}/${p.remaining} | ${p.scheds30} | ${p.present30}/${p.late30}/${p.leave30}/${p.absent30}/${p.makeUp30} | ${p.rate30 === null ? '—' : p.rate30 + '%'} | ${p.inLowStudents ? '✅' : ''} | ${p.inContinuous ? '✅' : ''} | ${p.inRenewal ? '✅' : ''} |`);
  }
  L.push('');
  L.push(`### 场景覆盖`);
  L.push(`- A(01-03) 正常在读；B(04-06) 低出勤（30 天窗口仅首节出勤）；C(07-09) 连续请假（末 3 场 leave/leave/absent）；`);
  L.push(`- D(10-12) 新报名已上首课（入班前课次不计入低出勤分母）；E(13 应上未到 / 14-15 尚未到首课时间)；F(16-18) 待续费（剩余=购-耗，约 8 节）；`);
  L.push(`- G(19-21) 已续费（D-10/D-8 本月 + D-32 上月，各 +24 节）；H(22-24) 课时耗尽（剩余 0）；`);
  L.push(`- I(25 退费已审批 ¥2400 / 26 流失 lost / 27 不续费 inactive)；J(28 转班 C2→C1 / 29 窗口无应上课次 / 30 迟到+请假+补课混合)。`);
  L.push('');
  L.push(`## 四、首页四类待处理提醒 · 预期`);
  L.push('');
  L.push(`| 类别 | 口径（后端实现） | 预期 |`);
  L.push(`|---|---|---|`);
  L.push(`| 低出勤班级 | 近 14 天排课×学员数为分母，present+late 为分子，率<60% | **${exp.lowClasses.length}**（${exp.lowClasses.map((c) => `班${c.idx}@${c.rate}%`).join('、') || '无'}）|`);
  L.push(`| 低出勤学员 | 近 30 天该班 completed 排课数（**入班前课次已剔除**）为分母，present+late 为分子，率<60% | **${exp.lowStudents.length}**（${exp.lowStudents.map((s) => `学员${pad(s.no)}@${s.rate}%`).join('、')}）|`);
  L.push(`| 待续费学员 | 在读 active + 未标记不续费 + 剩余课时不足 10 节（首页与续费页同口径） | **${exp.renewalCount}** |`);
  L.push(`| 体验课未成单回访 | status ∈ {completed, noshow} | **${exp.experienceUnconverted}** |`);
  L.push('');
  L.push(`## 五、汇总预期`);
  L.push('');
  L.push(`| 指标 | 口径 | 预期 |`);
  L.push(`|---|---|---|`);
  L.push(`| 在册学员(consumption baseCount) | 活跃报名去重学员 | ${exp.rosterCount} |`);
  L.push(`| 学员表 active 数(dashboard) | students.status=active | ${exp.activeStudents} |`);
  L.push(`| 今日排课 | startTime 在今天（不限状态） | ${exp.todaySchedules} |`);
  L.push(`| 本周课消(present+late, 周一起) | attendance 记录时间在本周 | ${exp.weekConsumption} |`);
  L.push(`| 本月新签 | conversion 本月且非续费 | ${exp.monthNewCount} 单 / ¥${exp.monthNewAmount} |`);
  L.push(`| 本月续费 | courseType ∈ {续费,renewal,续报} 本月 | ${exp.monthRenewalCount} 单 / ¥${exp.monthRenewalAmount} |`);
  L.push(`| 蜜月期学员(30 天内报名) | — | ${exp.honeymoon.length} 人（${exp.honeymoon.map((h) => `${pad(h.no)}@${h.rate}%`).join('、')}）|`);
  L.push(`| 连续请假名单 | 最近记录开头连续≥2 次 absent/leave | ${exp.continuousLeave.map((s) => `学员${pad(s.no)}(连续${s.count})`).join('、') || '无'} |`);
  L.push('');
  L.push(`## 六、销售与体验漏斗（s1 / s2）`);
  L.push('');
  L.push(`| 销售 | 线索 | 体验预约(未来) | 到场未成单 | 未到场 | 已成单 |`);
  L.push(`|---|---|---|---|---|---|`);
  for (const si of [1, 2]) {
    L.push(`| 验收销售${'一二'[si - 1]} | ${b.leads.filter((l) => l.salesIdx === si).length} | ${b.experiences.filter((e) => e.salesIdx === si && e.status === 'pending').length} | ${b.experiences.filter((e) => e.salesIdx === si && e.status === 'completed').length} | ${b.experiences.filter((e) => e.salesIdx === si && e.status === 'noshow').length} | ${b.experiences.filter((e) => e.salesIdx === si && e.status === 'converted').length} |`);
  }
  L.push('');
  L.push(`## 七、日期分布自检`);
  L.push('');
  L.push(`- 排课：D-35 ~ D+14（班6 D+16~D+30）；近 7/14/30 天、本月、上月与更早均有 completed 排课与出勤明细。`);
  L.push(`- 成单：上月 ${b.conversions.filter((c) => at(c.offset, '12:00') < monthStartOf(D)).length} 单；本周（周一起）${b.conversions.filter((c) => at(c.offset, '12:00') >= weekStartOf(D)).length} 单。`);
  L.push(`- 退费：学员25，¥${b.refund.amount}，D-12 提交并已审批。`);
  L.push(`- 转班：学员28，验收二班→验收一班（D-20），旧报名 transferred、新报名 active。`);
  L.push('');
  return L.join('\n');
}
function monthStartOf(base: Date) {
  return new Date(base.getFullYear(), base.getMonth(), 1);
}

/* ==================== 数据库操作 ==================== */
async function previewScope(print: boolean): Promise<string[]> {
  const lines: string[] = [];
  const users = await prisma.user.count({
    where: { OR: [{ email: { endsWith: ACCEPT_EMAIL_SUFFIX } }, { email: { endsWith: ISO_EMAIL_SUFFIX } }] },
  });
  lines.push(`账号（邮箱后缀匹配）：${users} 个`);
  const org = await prisma.organization.findUnique({ where: { code: ACCEPT_ORG_CODE } });
  if (org) {
    const [st, cl, sc, at2, cv, ld, ex] = await Promise.all([
      prisma.student.count({ where: { organizationId: org.id } }),
      prisma.class.count({ where: { organizationId: org.id } }),
      prisma.schedule.count({ where: { organizationId: org.id } }),
      prisma.attendance.count({ where: { organizationId: org.id } }),
      prisma.conversion.count({ where: { organizationId: org.id } }),
      prisma.lead.count({ where: { organizationId: org.id } }),
      prisma.experienceLesson.count({ where: { organizationId: org.id } }),
    ]);
    lines.push(`机构 ${ACCEPT_ORG_CODE}「${org.name}」：学员${st} 班级${cl} 排课${sc} 出勤${at2} 成单${cv} 线索${ld} 体验${ex}（级联删除）`);
  } else {
    lines.push(`机构 ${ACCEPT_ORG_CODE}：不存在`);
  }
  const iso = await prisma.organization.findUnique({ where: { code: ISO_ORG_CODE } });
  lines.push(`隔离机构 ${ISO_ORG_CODE}：${iso ? '存在（将删除）' : '不存在'}`);
  if (print) {
    console.log('=== 清理范围预览（仅限上述精确标识） ===');
    lines.forEach((l) => console.log('  ' + l));
  }
  return lines;
}

async function doClean() {
  await prisma.user.deleteMany({
    where: { OR: [{ email: { endsWith: ACCEPT_EMAIL_SUFFIX } }, { email: { endsWith: ISO_EMAIL_SUFFIX } }] },
  });
  await prisma.organization.deleteMany({ where: { code: { in: [ACCEPT_ORG_CODE, ISO_ORG_CODE] } } });
}

async function doInit() {
  assertPassword();
  const b = build();
  const exp = computeExpected(b);
  const hashed = await bcrypt.hash(TEST_PASSWORD, 10);

  await prisma.$transaction(async (tx) => {
    const org = await tx.organization.create({
      data: { name: '蜂鸣功能验收测试校区', code: ACCEPT_ORG_CODE, phone: '13800000000', startdate: at(-60, '09:00') },
    });
    const campus = await tx.campus.create({
      data: { organizationId: org.id, name: '蜂鸣功能验收测试校区', code: CAMPUS_CODE, phone: '13800000001' },
    });

    const mk = (local: string, name: string, role: string, phone?: string) =>
      tx.user.create({
        data: {
          email: `${local}${ACCEPT_EMAIL_SUFFIX}`, password: hashed, name, role,
          organizationId: org.id, campusId: campus.id, phone: phone ?? null,
        },
      });
    const admin = await mk('accept-admin', '验收校区管理员', 'manager', '13800001000');
    const teachers: Record<number, any> = {
      1: await mk('accept-t1', '验收老师一', 'teacher', '13800001001'),
      2: await mk('accept-t2', '验收老师二', 'teacher', '13800001002'),
      3: await mk('accept-t3', '验收老师三', 'teacher', '13800001003'),
    };
    const sales: Record<number, any> = {
      1: await mk('accept-s1', '验收销售一', 'sales', '13800001004'),
      2: await mk('accept-s2', '验收销售二', 'sales', '13800001005'),
    };
    await mk('accept-parent', '验收家长（学员01）', 'parent', PARENT_PHONE);

    for (const p of Object.values(PACKAGES)) {
      await tx.course.create({
        data: { organizationId: org.id, name: p.name, code: p.code, price: p.price, duration: 60, description: `验收测试课包 ${p.name}` },
      });
    }

    const classIds: Record<number, string> = {};
    for (const c of CLASS_DEFS) {
      const cls = await tx.class.create({
        data: {
          organizationId: org.id, campusId: campus.id,
          name: c.name, code: c.code, courseType: PACKAGES[c.pkg].courseType,
          capacity: 12, teacherId: teachers[c.teacherIdx].id,
          startDate: at(c.historyFrom, '00:00'), status: 'active',
        },
      });
      classIds[c.idx] = cls.id;
    }

    await tx.schedule.createMany({
      data: b.schedules.map((s) => ({
        organizationId: org.id, campusId: campus.id, classId: classIds[s.classIdx],
        teacherId: teachers[CLASS_DEFS.find((c) => c.idx === s.classIdx)!.teacherIdx].id,
        startTime: s.start, endTime: s.end, status: s.status,
        isRecurring: true, recurrenceRule: 'weekly',
        notes: s.cancelled ? '验收-取消场次（不计应出勤）' : null,
      })),
    });

    const studentIds: Record<number, string> = {};
    for (const s of b.students) {
      const status =
        s.group === 'I'
          ? s.notes === 'refunded' ? 'refunded' : s.notes === 'lost' ? 'lost' : 'inactive'
          : 'active';
      const stu = await tx.student.create({
        data: {
          organizationId: org.id, campusId: campus.id,
          name: `验收学员${pad(s.no)}`,
          gender: s.no % 2 === 0 ? 'F' : 'M',
          phone: `1380000${pad(s.no)}${pad(s.no)}`,
          parentName: `验收家长${pad(s.no)}`,
          parentPhone: s.no === 1 ? PARENT_PHONE : `1390000${pad(s.no)}${pad(s.no)}`,
          parentEmail: `parent${pad(s.no)}${ACCEPT_EMAIL_SUFFIX}`,
          status,
          cardOpenDate: at(s.enrollOffset, '09:00'),
          purchasedLessons: s.purchased, consumedLessons: s.consumed, remainingLessons: s.remaining,
          totalPayment: s.price * (s.renewAt !== null ? 2 : 1),
          salesId: sales[salesIdxOf(s.no)].id,
          lastClassDate: b.attendances.filter((a) => a.stuNo === s.no).length
            ? new Date(Math.max(...b.attendances.filter((a) => a.stuNo === s.no).map((a) => a.start.getTime())))
            : null,
          renewalStatus: s.group === 'H' ? 'pending' : s.group === 'I' && s.notes === 'no-renewal' ? 'no_renewal' : null,
          noRenewalReason: s.group === 'I' && s.notes === 'no-renewal' ? '验收测试-不续费' : null,
          noRenewalDate: s.group === 'I' && s.notes === 'no-renewal' ? at(-20, '10:00') : null,
          refundReason: s.notes === 'refunded' ? b.refund.reason : null,
          refundDate: s.notes === 'refunded' ? at(-12, '10:00') : null,
          createdAt: at(s.enrollOffset, '08:00'),
        },
      });
      studentIds[s.no] = stu.id;

      if (s.no !== 28) {
        await tx.enrollment.create({
          data: {
            organizationId: org.id, studentId: stu.id, classId: classIds[s.classIdx],
            enrolledBy: admin.id, enrolledAt: at(s.enrollOffset, '09:00'),
            status: b.enrollments.find((e) => e.stuNo === s.no)!.status,
          },
        });
      } else {
        await tx.enrollment.create({
          data: { organizationId: org.id, studentId: stu.id, classId: classIds[2], enrolledBy: admin.id, enrolledAt: at(-50, '09:00'), status: 'transferred' },
        });
        await tx.enrollment.create({
          data: { organizationId: org.id, studentId: stu.id, classId: classIds[1], enrolledBy: admin.id, enrolledAt: at(-20, '09:00'), status: 'active' },
        });
      }
    }

    const allSchedules = await tx.schedule.findMany({
      where: { organizationId: org.id }, select: { id: true, classId: true, startTime: true },
    });
    await tx.attendance.createMany({
      data: b.attendances.map((a) => {
        const cls = CLASS_DEFS.find((c) => c.idx === a.classIdx)!;
        const sched = allSchedules.find(
          (s) => s.classId === classIds[a.classIdx] && s.startTime.getTime() === a.start.getTime()
        );
        if (!sched) throw new Error(`排课缺失: 学员${a.stuNo} 班${a.classIdx} ${a.start.toISOString()}`);
        return {
          organizationId: org.id,
          studentId: studentIds[a.stuNo],
          scheduleId: sched.id,
          classId: classIds[a.classIdx],
          checkedInBy: teachers[cls.teacherIdx].id,
          status: a.status,
          checkInTime: new Date(a.start.getTime() + 10 * 60000),
          checkOutTime: a.status === 'present' || a.status === 'late' ? new Date(a.start.getTime() + 70 * 60000) : null,
          createdAt: new Date(a.start.getTime() + 10 * 60000),
          notes: a.status === 'leave' ? '验收-请假' : null,
        };
      }),
    });

    for (const c of b.conversions) {
      const s = b.students.find((x) => x.no === c.stuNo)!;
      const cls = CLASS_DEFS.find((x) => x.idx === s.classIdx)!;
      await tx.conversion.create({
        data: {
          organizationId: org.id, studentId: studentIds[c.stuNo],
          studentName: `验收学员${pad(c.stuNo)}`,
          contact: `1380000${pad(c.stuNo)}${pad(c.stuNo)}`,
          classId: classIds[s.classIdx], className: cls.name,
          courseType: c.courseType, totalLessons: c.lessons, price: c.price,
          paymentMethod: c.stuNo % 2 ? 'wechat' : 'cash', paymentStatus: 'paid',
          salesId: sales[c.salesIdx].id, salesName: `验收销售${'一二'[c.salesIdx - 1]}`,
          conversionDate: fmtDate(at(c.offset, '12:00')),
          approvalStatus: 'confirmed',
          notes: `验收-${c.kind}`,
        },
      });
      const enrollment = await tx.enrollment.findFirst({
        where: { studentId: studentIds[c.stuNo] },
        orderBy: { enrolledAt: 'desc' },
      });
      if (enrollment) {
        await tx.payment.create({
          data: {
            organizationId: org.id, enrollmentId: enrollment.id, studentId: studentIds[c.stuNo],
            amount: c.price, paymentType: 'tuition', paymentMethod: c.stuNo % 2 ? 'wechat' : 'cash',
            paidBy: sales[c.salesIdx].id, paidAt: at(c.offset, '13:00'),
            notes: `验收-${c.kind}-收款`,
          },
        });
      }
    }

    const leadIds: Record<number, string> = {};
    for (let i = 0; i < b.leads.length; i++) {
      const l = b.leads[i];
      const lead = await tx.lead.create({
        data: {
          organizationId: org.id,
          customerName: l.name, contact: `137${pad(i + 1)}0000${pad(i + 1)}`,
          source: '验收-地推',
          assigneeId: sales[l.salesIdx].id, assigneeName: `验收销售${'一二'[l.salesIdx - 1]}`,
          createdById: sales[l.salesIdx].id, createdByName: `验收销售${'一二'[l.salesIdx - 1]}`,
          status: l.status, starred: i === 2,
          lastContactAt: l.status === 'new' ? null : at(l.offset + 1, '11:00'),
          createdAt: at(l.offset, '10:00'), notes: '验收线索',
        },
      });
      leadIds[i + 1] = lead.id;
    }

    for (let i = 0; i < b.experiences.length; i++) {
      const e = b.experiences[i];
      const cls = CLASS_DEFS.find((x) => x.idx === e.classIdx)!;
      await tx.experienceLesson.create({
        data: {
          organizationId: org.id,
          studentName: e.name, contact: `136${pad(i + 1)}0000${pad(i + 1)}`,
          source: '验收-线索转化',
          leadId: e.leadIdx ? leadIds[e.leadIdx] : null,
          classId: classIds[e.classIdx], className: cls.name,
          scheduleDate: fmtDate(at(e.offset, '10:00')),
          startTime: e.offset >= 0 ? '10:00' : cls.time, endTime: '11:00',
          classroom: '验收馆1',
          teachingTeacherId: teachers[e.teacherIdx].id, teachingTeacherName: `验收老师${'一二三'[e.teacherIdx - 1]}`,
          assigneeId: sales[e.salesIdx].id, assigneeName: `验收销售${'一二'[e.salesIdx - 1]}`,
          createdById: sales[e.salesIdx].id, createdByName: `验收销售${'一二'[e.salesIdx - 1]}`,
          status: e.status,
          convertedAt: e.status === 'converted' ? `${fmtDate(at(e.offset, '12:00'))} 12:00:00` : null,
          createdAt: at(Math.min(e.offset - 2, -1), '09:00'),
          notes: `验收体验-${e.status}`,
        },
      });
    }

    const r = b.refund;
    await tx.refund.create({
      data: {
        organizationId: org.id, studentId: studentIds[r.stuNo],
        studentName: `验收学员${pad(r.stuNo)}`,
        classId: classIds[b.students.find((x) => x.no === r.stuNo)!.classIdx],
        className: CLASS_DEFS.find((x) => x.idx === b.students.find((x) => x.no === r.stuNo)!.classIdx)!.name,
        lessonsToRefund: r.lessons, amountToRefund: r.amount,
        reason: r.reason, status: 'approved',
        submittedById: sales[1].id, submittedByName: '验收销售一',
        reviewedById: admin.id, reviewedByName: '验收校区管理员',
        reviewedAt: at(r.offset + 1, '10:00'), createdAt: at(r.offset, '10:00'),
      },
    });

    const lt = b.lessonTransfer;
    await tx.lessonTransfer.create({
      data: {
        organizationId: org.id, studentId: studentIds[lt.stuNo],
        fromClassId: classIds[lt.fromClassIdx], toClassId: classIds[lt.toClassIdx],
        transferredLessons: b.students.find((x) => x.no === lt.stuNo)!.remaining,
        priceDifference: 0, status: 'completed',
        operatedBy: admin.id, operatedByName: '验收校区管理员',
        notes: '验收-转班（enrollments/transfer 接口为空壳，脚本直接落库以验证展示）',
        createdAt: at(lt.offset, '09:00'),
      },
    });

    /* ---- 隔离机构（最小集） ---- */
    const isoOrg = await tx.organization.create({
      data: { name: '隔离测试机构（勿动）', code: ISO_ORG_CODE, phone: '13800000002' },
    });
    const isoCampus = await tx.campus.create({
      data: { organizationId: isoOrg.id, name: '隔离测试校区', code: 'ISO1' },
    });
    await tx.user.create({
      data: { email: `iso-admin${ISO_EMAIL_SUFFIX}`, password: hashed, name: '隔离测试管理员', role: 'manager', organizationId: isoOrg.id, campusId: isoCampus.id, phone: '13800002000' },
    });
    const isoStu = await tx.student.create({
      data: { organizationId: isoOrg.id, campusId: isoCampus.id, name: '隔离学员01', phone: '13800002999', parentPhone: '13900002999', status: 'active', purchasedLessons: 24, consumedLessons: 2, remainingLessons: 22, totalPayment: 2400 },
    });
    const isoCls = await tx.class.create({
      data: { organizationId: isoOrg.id, campusId: isoCampus.id, name: '隔离一班', code: 'ISO-C1', courseType: '幼儿体能', capacity: 10, status: 'active' },
    });
    await tx.enrollment.create({
      data: { organizationId: isoOrg.id, studentId: isoStu.id, classId: isoCls.id, status: 'active' },
    });
  }, { timeout: 120000 });

  const md = writeLedger(b, exp);
  const outDir = path.resolve(__dirname, '../../docs/acceptance');
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, 'expected-ledger.md');
  fs.writeFileSync(outFile, md, 'utf-8');

  await seedPriceCatalog();
  console.log('=== 初始化完成 ===');
  console.log(`基准日: ${fmtDate(D)}  台账: ${outFile}`);
  console.log(`四类提醒预期: 低出勤班级=${exp.lowClasses.length} 低出勤学员=${exp.lowStudents.length} 待续费=${exp.renewalCount} 体验未成单=${exp.experienceUnconverted}`);
  console.log(`汇总: 花名册=${exp.rosterCount} active=${exp.activeStudents} 今日排课=${exp.todaySchedules} 本周课消=${exp.weekConsumption} 本月新签=${exp.monthNewCount}单/¥${exp.monthNewAmount} 续费=${exp.monthRenewalCount}单/¥${exp.monthRenewalAmount}`);
}

/* ==================== CLI ==================== */
async function main() {
  const mode = process.argv[2] || 'preview';
  console.log(`模式: ${mode}   基准日 D = ${fmtDate(D)}（本地时区）`);
  if (mode === 'preview') {
    await previewScope(true);
    const b = build();
    const exp = computeExpected(b);
    console.log('=== 将创建（两个机构，单事务） ===');
    console.log(`  ${ACCEPT_ORG_CODE}: 账号7 班级6 课包2 排课${b.schedules.length} 学员30 报名31 出勤明细${b.attendances.length} 成单${b.conversions.length} 收款${b.conversions.length} 线索${b.leads.length} 体验${b.experiences.length} 退费1 转班1`);
    console.log(`  ${ISO_ORG_CODE}: 账号1 班级1 学员1 报名1`);
    console.log('=== 预期值预览 ===');
    console.log(`  低出勤班级=${exp.lowClasses.length}(${exp.lowClasses.map((c) => '班' + c.classIdx).join(',')}) 低出勤学员=${exp.lowStudents.length}(${exp.lowStudents.map((s) => s.no).join(',')})`);
    console.log(`  连续请假=${exp.continuousLeave.length}(${exp.continuousLeave.map((s) => s.no).join(',')}) 待续费=${exp.renewalCount} 体验未成单=${exp.experienceUnconverted}`);
    console.log(`  花名册=${exp.rosterCount} active=${exp.activeStudents} 今日排课=${exp.todaySchedules} 本周课消=${exp.weekConsumption}`);
    console.log(`  本月新签=${exp.monthNewCount}单/¥${exp.monthNewAmount} 本月续费=${exp.monthRenewalCount}单/¥${exp.monthRenewalAmount}`);
  } else if (mode === 'clean') {
    assertPassword();
    await previewScope(true);
    await doClean();
    console.log('清理完成（仅限测试标识范围）。');
  } else if (mode === 'init') {
    assertPassword();
    await previewScope(true);
    await doClean();
    await doInit();
  } else {
    console.error('用法: ACCEPT_TEST_PASSWORD=<密码> npx tsx scripts/testCampusInit.ts [preview|init|clean]');
    process.exit(1);
  }
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error('执行失败:', e);
  await prisma.$disconnect();
  process.exit(1);
});
