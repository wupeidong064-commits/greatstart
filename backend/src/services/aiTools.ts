import { businessRecords, BUSINESS_DOMAINS } from './aiDataDictionary';
import { newStudentAttendance } from './aiNewStudentAttendance';
import { readConsumptionValuation } from './consumptionValuation';
import { refundSummary } from './refundSummary';
import { getCashflowSummary, orderScope } from './cashflowSummaryService';
import { attendanceFollowup, experienceOverview, classStudentChanges, teacherPerformance, studentAttendance } from './aiOperationalData';
import { comparablePeriods, evaluateMonthlyTarget } from './aiOperatingFacts';
import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import prisma from '../config/database';
import { buildOrgSnapshot, renderSnapshotText } from './aiService';
import { RequestScope } from '../utils/scope';
import { querySessionAttendance, SESSION_ATTENDANCE_CALIBER } from './attendanceStatsService';
import { teacherPerformanceComparison } from './aiTeacherComparison';
import { teacherPerformanceRanking } from './aiTeacherRanking';
import type { AuthRequest } from '../middleware/auth';

/**
 * AI 受控业务查询工具注册表（G2）
 *
 * 原则：
 * - 工具是白名单枚举；模型只能选择工具名与参数，不能生成 SQL/shell/直接写库。
 * - 所有查询经本注册表统一加范围（organizationId + 校区归属），复用与业务页一致的口径。
 * - 每次返回 evidence 信封：evidenceId、数据源、时间范围、生成时间、过滤条件、单位、
 *   口径说明、缺失字段；核心数字由代码计算（合计不由模型算）。
 * - 行级个人信息（电话）默认遮蔽；行数与发送给模型的体积受限。
 */

export const TOOL_LOOP_LIMIT = 4; // 每轮运行工具次数上限
const TOOL_TIMEOUT_MS = 8000;
const MAX_ROWS = 20;

export interface EvidenceCard {
  evidenceId: string;
  tool: string;
  title: string;
  unit: string;
  caliber: string; // 口径说明（对用户可见）
  timeRange: { start: string; end: string } | null;
  generatedAt: string;
  businessAsOf?: string;
  filters: Record<string, unknown>;
  missing: string[]; // 缺失/无法核算的字段
  columns: Array<{ key: string; label: string }>;
  rows: Array<Record<string, unknown>>;
  totals: Record<string, number | string | null>;
  error: string | null;
}

export interface Evidence extends EvidenceCard {
  /** 发送给模型的紧凑文本（≤证据预算） */
  modelText: string;
}

export interface ToolContext {
  organizationId: string;
  campusId: string | null;
  /** 上海时区今天（YYYY-MM-DD） */
  today: string;
  userId?: string;
  personnelActor?: AuthRequest['user'];
  signal?: AbortSignal;
}

// ==================== 参数校验（严格 schema 枚举，非模型自由生成） ====================

type ParamDef = { type: 'string' | 'date' | 'number'; required?: boolean; max?: number; enum?: readonly string[] };

function validateParams(schema: Record<string, ParamDef>, raw: unknown): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (raw !== null && (typeof raw !== 'object' || Array.isArray(raw))) {
    throw new Error('参数必须是对象');
  }
  const obj = (raw || {}) as Record<string, unknown>;
  for (const [key, def] of Object.entries(schema)) {
    const v = obj[key];
    if (v === undefined || v === null || v === '') {
      if (def.required) throw new Error(`缺少必填参数 ${key}`);
      continue;
    }
    if (def.type === 'string') {
      if (typeof v !== 'string') throw new Error(`参数 ${key} 必须是字符串`);
      if (def.enum && !def.enum.includes(v)) throw new Error(`参数 ${key} 不在允许范围`);
      out[key] = v.slice(0, def.max ?? 100);
    } else if (def.type === 'date') {
      const s = String(v);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new Error(`参数 ${key} 必须是 YYYY-MM-DD 日期`);
      const d = new Date(`${s}T00:00:00Z`);
      if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s) {
        throw new Error(`参数 ${key} 不是真实日期（如 2026-02-30）`);
      }
      out[key] = s;
    } else if (def.type === 'number') {
      const n = Number(v);
      if (!Number.isFinite(n)) throw new Error(`参数 ${key} 必须是数字`);
      out[key] = n;
    }
  }
  return out;
}

/** 上海时区月份边界（返回 YYYY-MM-DD） */
function shMonthRange(offset = 0): { start: string; end: string } {
  const shNow = new Date(Date.now() + 8 * 3600 * 1000);
  const d = new Date(Date.UTC(shNow.getUTCFullYear(), shNow.getUTCMonth() + offset, 1));
  const end = new Date(Date.UTC(shNow.getUTCFullYear(), shNow.getUTCMonth() + offset + 1, 0));
  const fmt = (x: Date) => x.toISOString().slice(0, 10);
  return { start: fmt(d), end: fmt(end) };
}

/** 遮蔽电话：保留前3后2 */
export function maskPhone(p?: string | null): string {
  if (!p) return '';
  const s = String(p);
  if (s.length < 5) return '***';
  return `${s.slice(0, 3)}****${s.slice(-2)}`;
}

// ==================== 工具实现 ====================

type ToolFn = (ctx: ToolContext, params: Record<string, unknown>) => Promise<Evidence>;

/** 组装证据信封 + 发给模型的紧凑文本 */
function envelope(
  ctx: ToolContext,
  base: Omit<Evidence, 'evidenceId' | 'modelText' | 'generatedAt'>,
  modelText: string
): Evidence {
  const evidenceId = randomUUID();
  const generatedAt = new Date().toISOString();
  const card: Evidence = {
    ...base,
    evidenceId,
    generatedAt,
    modelText: modelText.slice(0, 3000),
  };
  return card;
}

const OVERVIEW_TOOL: ToolFn = async (ctx) => {
  const snap = await buildOrgSnapshot(ctx.organizationId, { campusId: ctx.campusId, force: true });
  const title = ctx.campusId ? '校区经营概览' : '机构经营概览';
  const rows: Array<Record<string, unknown>> = [
    { 指标: '活跃班级数', 数值: snap.activeClasses, 单位: '个' },
    { 指标: '在册学员数', 数值: snap.activeStudents, 单位: '人' },
    { 指标: '本月成单数', 数值: snap.monthOrderCount, 单位: '单' },
    { 指标: '本月成单金额', 数值: snap.monthOrderAmount, 单位: '元' },
    { 指标: '其中新单', 数值: snap.monthNewOrderCount, 单位: '单' },
    { 指标: '其中续费单', 数值: snap.monthRenewalOrderCount, 单位: '单' },
    { 指标: '低出勤学员数', 数值: snap.lowAttendanceStudents, 单位: '人' },
  ];
  return envelope(
    ctx,
    {
      tool: 'campus_overview',
      title,
      unit: '个/人/单/元',
      caliber:
        '在册=活跃班级内活跃报名去重；本月成单与成单表一致，含本机构已建档但未分班的订单，作废不计；低出勤=近30天出勤率<60%',
      timeRange: null,
      filters: { campusId: ctx.campusId },
      missing: snap.errors.length > 0 ? snap.errors : [],
      columns: [
        { key: '指标', label: '指标' },
        { key: '数值', label: '数值' },
        { key: '单位', label: '单位' },
      ],
      rows,
      totals: {},
      error: null,
    },
    renderSnapshotText(snap)
  );
};

const SEARCH_CLASSES_TOOL: ToolFn = async (ctx, params) => {
  const keyword = String(params.keyword ?? '').trim();
  const where: any = { organizationId: ctx.organizationId, status: { not: 'deleted' } };
  if (ctx.campusId) where.campusId = ctx.campusId;
  if (keyword) where.OR = [{ name: { contains: keyword } }, { code: { contains: keyword } }];
  const classes = await prisma.class.findMany({
    where,
    take: MAX_ROWS,
    orderBy: { createdAt: 'desc' },
    select: { id: true, name: true, courseType: true, status: true, campusId: true },
  });
  const campusIds = Array.from(new Set(classes.map((c) => c.campusId).filter(Boolean))) as string[];
  const campuses = campusIds.length
    ? await prisma.campus.findMany({
        where: { id: { in: campusIds } },
        select: { id: true, name: true },
      })
    : [];
  const campusName = new Map(campuses.map((c) => [c.id, c.name]));
  return envelope(
    ctx,
    {
      tool: 'search_classes',
      title: keyword ? `班级检索「${keyword}」` : '班级列表',
      unit: '个',
      caliber: '仅当前授权校区（机构级=本机构全部校区）；模糊匹配班级名',
      timeRange: null,
      filters: { keyword, campusId: ctx.campusId },
      missing: classes.length >= MAX_ROWS ? [`仅显示前 ${MAX_ROWS} 条，可能不全`] : [],
      columns: [
        { key: 'name', label: '班级名' },
        { key: 'courseType', label: '课程类型' },
        { key: 'status', label: '状态' },
        { key: 'campus', label: '校区' },
      ],
      rows: classes.map((c) => ({
        id: c.id,
        name: c.name,
        courseType: c.courseType,
        status: c.status,
        campus: campusName.get(c.campusId ?? '') ?? '',
      })),
      totals: { count: classes.length },
      error: null,
    },
    classes.length
      ? classes.map((c) => `- ${c.name}（${c.courseType ?? '未分类'}，${c.status}）`).join('\n')
      : '（无匹配班级）'
  );
};

const SEARCH_STUDENTS_TOOL: ToolFn = async (ctx, params) => {
  const keyword = String(params.keyword ?? '').trim();
  const classId = typeof params.classId === 'string' ? params.classId : null;
  const where: any = { organizationId: ctx.organizationId, status: 'active' };
  if (ctx.campusId) where.campusId = ctx.campusId;
  if (keyword) where.name = { contains: keyword };
  if (classId) where.enrollments = { some: { classId, status: 'active' } };
  const students = await prisma.student.findMany({
    where,
    take: MAX_ROWS,
    orderBy: { createdAt: 'desc' },
    select: { id: true, name: true, status: true, phone: true, remainingLessons: true },
  });
  return envelope(
    ctx,
    {
      tool: 'search_students',
      title: keyword ? `学员检索「${keyword}」` : '在册学员列表',
      unit: '人',
      caliber: '在册（status=active）；电话默认遮蔽（前3后2）',
      timeRange: null,
      filters: { keyword, classId },
      missing: students.length >= MAX_ROWS ? [`仅显示前 ${MAX_ROWS} 条，可能不全`] : [],
      columns: [
        { key: 'name', label: '姓名' },
        { key: 'remainingLessons', label: '剩余课时' },
        { key: 'phone', label: '电话（遮蔽）' },
      ],
      rows: students.map((s) => ({
        id: s.id,
        name: s.name,
        remainingLessons: s.remainingLessons,
        phone: maskPhone(s.phone),
      })),
      totals: { count: students.length },
      error: null,
    },
    students.length
      ? students.map((s) => `- ${s.name}，剩余 ${s.remainingLessons} 课时`).join('\n')
      : '（无匹配学员）'
  );
};

/** 出勤率：复用统一逐场次应到服务（R2：口径单点，见 attendanceStatsService） */
const CLASS_ATTENDANCE_TOOL: ToolFn = async (ctx, params) => {
  const start = (params.startDate as string) || shMonthRange().start;
  const end = (params.endDate as string) || shMonthRange().end;
  const classId = typeof params.classId === 'string' ? params.classId : null;
  const classWhere: Prisma.ClassWhereInput = { organizationId: ctx.organizationId };
  if (ctx.campusId) classWhere.campusId = ctx.campusId;
  if (classId) classWhere.id = classId;
  const classes = await prisma.class.findMany({
    where: classWhere,
    select: { id: true, name: true },
  });
  const classIds = classes.map((c) => c.id);
  const nameOf = new Map(classes.map((c) => [c.id, c.name]));
  if (classIds.length === 0) {
    return envelope(
      ctx,
      {
        tool: 'class_attendance',
        title: `班级出勤（${start} ~ ${end}）`,
        unit: '%',
        caliber: SESSION_ATTENDANCE_CALIBER,
        timeRange: { start, end },
        filters: { campusId: ctx.campusId, classId },
        missing: [classId ? '该班级不存在或不在当前授权范围' : '本范围无班级'],
        columns: [],
        rows: [],
        totals: {},
        error: null,
      },
      '（无授权范围内的班级，无出勤数据——若指定了班级ID，可能不存在或不在本校区）'
    );
  }
  // 窗口按上海时区整天边界（startTime 为时间戳字段）
  const result = await querySessionAttendance({
    organizationId: ctx.organizationId,
    campusId: ctx.campusId,
    classIds,
    startISO: `${start}T00:00:00+08:00`,
    endISO: `${end}T23:59:59.999+08:00`,
  });
  const rows = result.perClass.map((r) => ({
    id: r.classId,
    name: nameOf.get(r.classId) || r.classId,
    场次: r.sessions,
    应到: r.expected,
    实到: r.present,
    出勤率: r.rate === null ? '不可计算' : `${r.rate}%`,
  }));
  return envelope(
    ctx,
    {
      tool: 'class_attendance',
      title: `班级出勤（${start} ~ ${end}）`,
      unit: '%',
      caliber: SESSION_ATTENDANCE_CALIBER,
      timeRange: { start, end },
      filters: { campusId: ctx.campusId, classId },
      missing: result.rate === null ? ['窗口内无已完成场次或无有效报名，出勤率不可计算'] : [],
      columns: [
        { key: 'name', label: '班级' },
        { key: '场次', label: '场次' },
        { key: '应到', label: '应到' },
        { key: '实到', label: '实到' },
        { key: '出勤率', label: '出勤率' },
      ],
      rows,
      totals: {
        应到: result.expected,
        实到: result.present,
        出勤率: result.rate === null ? '不可计算' : `${result.rate}%`,
      },
      error: null,
    },
    rows.length
      ? [
          ...rows.map(
            (r) => `- ${r.name}：${r.场次}场，应到${r.应到}，实到${r.实到}，出勤率${r.出勤率}`
          ),
          `合计：应到${result.expected}，实到${result.present}，出勤率${result.rate === null ? '不可计算' : result.rate + '%'}`,
        ].join('\n')
      : '（窗口内无已完成排课数据）'
  );
};

/**
 * 净扣课（R2-1 统一口径）：真实签到课时流水 = LessonLog
 * - deduct = 签到扣课；add 且 reversalOfId 非空 = 冲正返还（只冲减对应原扣课）
 * - add 且无 reversalOfId = 后台增课/购买/赠课/期初——独立呈现，不计入返还
 * - 日期按 businessDate（业务日 YYYY-MM-DD 字符串）归集；无 businessDate 的历史流水
 *   列为"无法归集"，不擅自按录入日归月
 */
const NET_DEDUCTION_TOOL: ToolFn = async (ctx, params) => {
  const start = (params.startDate as string) || shMonthRange().start;
  const end = (params.endDate as string) || shMonthRange().end;
  const logs = await prisma.lessonLog.findMany({
    where: {
      organizationId: ctx.organizationId,
      type: { in: ['add', 'deduct'] },
      ...(ctx.campusId ? { student: { campusId: ctx.campusId } } : {}),
    },
    select: { type: true, lessons: true, businessDate: true, reversalOfId: true, scheduleId: true },
    take: 5001,
  });
  if (logs.length > 5000) throw new Error('课时流水超过5000条，请使用限定范围的流水明细查询');
  const inWindow = logs.filter(
    (l) => typeof l.businessDate === 'string' && l.businessDate >= start && l.businessDate <= end
  );
  const undated = logs.length - logs.filter((l) => typeof l.businessDate === 'string').length;
  const deducted = inWindow.filter((l) => l.type === 'deduct').reduce((s2, l) => s2 + l.lessons, 0);
  const reversalAdds = inWindow
    .filter((l) => l.type === 'add' && l.reversalOfId)
    .reduce((s2, l) => s2 + l.lessons, 0);
  const grantAdds = inWindow
    .filter((l) => l.type === 'add' && !l.reversalOfId)
    .reduce((s2, l) => s2 + l.lessons, 0);
  const net = deducted - reversalAdds;
  const missing: string[] = [];
  if (inWindow.length === 0) missing.push('窗口内无课时流水记录（净扣课 0 = 无记录，非查询失败）');
  if (undated > 0)
    missing.push(`${undated} 条历史流水无业务日期，未纳入任何月份（无法归集，非缺失隐藏）`);
  return envelope(
    ctx,
    {
      tool: 'net_deduction',
      title: `净扣课（${start} ~ ${end}，按业务日）`,
      unit: '课时',
      caliber:
        '净扣课=签到扣课−冲正返还（LessonLog：deduct 为扣课；add 且带 reversalOfId 为冲正返还；add 无 reversalOfId 为增课/购买/赠课，单独呈现不计返还）。日期按业务日（businessDate）归集，补录历史课程计入原业务月。',
      timeRange: { start, end },
      filters: { campusId: ctx.campusId },
      missing,
      columns: [
        { key: 'type', label: '类型' },
        { key: 'lessons', label: '课时' },
      ],
      rows: [
        { type: '签到扣课', lessons: deducted },
        { type: '冲正返还', lessons: reversalAdds },
        { type: '增课/购买/赠课（非返还）', lessons: grantAdds },
      ],
      totals: { 净扣课: net },
      error: null,
    },
    `签到扣课 ${deducted} 课时；冲正返还 ${reversalAdds} 课时；净扣课 ${net} 课时；另有增课/购买/赠课 ${grantAdds} 课时（非返还，单独计）${undated > 0 ? `；${undated} 条无业务日期流水未归集` : ''}`
  );
};

/** 成单/续费：复用现金流及成单表归属，包含未分班订单，按courseType区分新签/续费。 */
const SIGNUP_RENEWAL_TOOL: ToolFn = async (ctx, params) => {
  const { start, end } = shMonthRange();
  const startD = (params.startDate as string) || start;
  const endD = (params.endDate as string) || end;
  const x = await getCashflowSummary(ctx, { startDate: startD, endDate: endD });
  const details = params.includeDetails === 'true' ? await prisma.conversion.findMany({
    where: { ...orderScope(ctx), approvalStatus:'confirmed', conversionDate:{gte:startD,lte:endD},
      ...(params.orderType === 'renewal' ? {courseType:{in:['续费','续报','renewal']}} : {}) },
    select:{studentName:true,totalLessons:true,price:true,conversionDate:true,courseType:true},
    orderBy:[{conversionDate:'asc'},{id:'asc'}],
  }) : null;
  return envelope(
    ctx,
    {
      tool: 'signup_renewal',
      title: `报名/续费（${startD} ~ ${endD}）`,
      unit: '单/元',
      caliber: x.caliber.orders,
      timeRange: { start: startD, end: endD },
      filters: { campusId: ctx.campusId },
      missing: x.scopeNotes,
      columns: details ? [{key:'学员',label:'学员'},{key:'日期',label:'日期'},{key:'类型',label:'类型'},{key:'课时',label:'课时'},{key:'金额',label:'金额'}] : [
        { key: 'type', label: '类型' },
        { key: 'count', label: '单数' },
        { key: 'amount', label: '金额' },
      ],
      rows: details ? details.map(r=>({学员:r.studentName,日期:r.conversionDate,类型:r.courseType,课时:r.totalLessons,金额:r.price===null?null:Number(r.price)})) : [
        { type: '新签', count: x.newSignup.conversions, amount: x.newSignup.amount },
        { type: '续费', count: x.renewal.count, amount: x.renewal.amount },
      ],
      totals: {
        新单数: x.newSignup.conversions,
        新签金额: x.newSignup.amount,
        续费单数: x.renewal.count,
        续费金额: x.renewal.amount,
        金额合计: x.totals.grossAmount,
      },
      error: null,
    },
    `新签 ${x.newSignup.conversions} 单，${x.newSignup.amount} 元；续费 ${x.renewal.count} 单，${x.renewal.amount} 元。`
  );
};

/** All dates for the same scope as the conversion register. */
const ALL_CONFIRMED_ORDERS_TOOL: ToolFn = async (ctx) => {
  const result = await prisma.conversion.aggregate({
    where: { ...orderScope(ctx), approvalStatus: 'confirmed' },
    _count: { _all: true, price: true }, _sum: { price: true },
  });
  const count = result._count._all;
  const amount = Number(result._sum.price ?? 0);
  const unpriced = count - result._count.price;
  return envelope(ctx, {
    tool: 'all_confirmed_orders', title: '全部有效成单（不限日期）', unit: '单/元',
    caliber: '同成单表，统计当前授权范围内已确认成单，包含新签和续费，排除作废，不扣退费。',
    timeRange: null, filters: { campusId: ctx.campusId },
    missing: unpriced ? [`${unpriced} 笔未填写成交金额，金额合计为可核实部分`] : [],
    columns: [{ key: 'count', label: '有效成单数' }, { key: 'amount', label: '成交总额' }],
    rows: [{ count, amount }], totals: { 有效成单数: count, 成交总额: amount }, error: null,
  }, `全部有效成单 ${count} 单，成交总额 ${amount} 元。`);
};

/** 已确认成单减已通过退费，复用现金流业务页口径。 */
const CASHFLOW_TOOL: ToolFn = async (ctx, params) => {
  const start = (params.startDate as string) || shMonthRange().start;
  const end = (params.endDate as string) || shMonthRange().end;
  const x = await getCashflowSummary(ctx, { startDate: start, endDate: end });
  return envelope(
    ctx,
    {
      tool: 'cost_and_income',
      title: `成单与退费（${start} ~ ${end}）`,
      unit: '元',
      caliber: `${x.caliber.orders}；${x.caliber.refund}；未采集成本，不计算利润。`,
      timeRange: { start, end },
      filters: { campusId: ctx.campusId },
      missing: x.scopeNotes,
      columns: [
        { key: 'type', label: '类型' },
        { key: 'amount', label: '金额' },
      ],
      rows: [
        { type: '新签', amount: x.newSignup.amount },
        { type: '续费', amount: x.renewal.amount },
        { type: '已通过退费', amount: x.refund.amount },
      ],
      totals: {
        新签金额: x.newSignup.amount,
        续费金额: x.renewal.amount,
        总成单额: x.totals.grossAmount,
        已通过退费金额: x.refund.amount,
        净成单额: x.totals.netAmount,
      },
      error: null,
    },
    `新签 ${x.newSignup.amount} 元，续费 ${x.renewal.amount} 元，总成单额 ${x.totals.grossAmount} 元，已通过退费 ${x.refund.amount} 元，净成单额 ${x.totals.netAmount} 元。`
  );
};

// ==================== 注册表 ====================

// ==================== G3 周报数据工具（Excel 链路数据源；全量无预览截断） ====================

const WEEKLY_REPORT_TOOL: ToolFn = async (ctx, params) => {
  const def = shMonthRange();
  const startD = (params.startDate as string) || def.start;
  const endD = (params.endDate as string) || def.end;
  const t0 = new Date(startD + 'T00:00:00+08:00');
  const t1 = new Date(endD + 'T23:59:59.999+08:00');
  const campusWhere = ctx.campusId ? { campusId: ctx.campusId } : {};
  const classes = await prisma.class.findMany({
    where: { organizationId: ctx.organizationId, ...campusWhere },
    select: { id: true, name: true, courseType: true, teacher: { select: { name: true, organizationId:true, campusId:true } } },
    orderBy: { name: 'asc' },
  });
  const title = 'AI 周报数据（按班）';
  const refunds = await refundSummary(ctx, t0, t1);
  const cashSummary = await getCashflowSummary(ctx, { startDate: startD, endDate: endD });
  const isRenewal = (t?: string | null) => ['续费', 'renewal', '续报'].includes(String(t || ''));
  const rows: Array<Record<string, unknown>> = [];
  let T = {
    sessions: 0,
    expected: 0,
    attended: 0,
    netDed: 0,
    newCnt: 0,
    newAmt: 0,
    renCnt: 0,
    renAmt: 0,
    pay: 0,
  };
  for (const c of classes) {
    const scheds = await prisma.schedule.findMany({
      where: { organizationId:ctx.organizationId, ...campusWhere, classId: c.id, status: 'completed', startTime: { gte: t0, lte: t1 } },
      select: { id: true, startTime: true, endTime: true },
    });
    const attendance = await querySessionAttendance({
      organizationId: ctx.organizationId,
      campusId: ctx.campusId,
      classIds: [c.id],
      startISO: t0.toISOString(),
      endISO: t1.toISOString(),
    });
    const expected = attendance.expected;
    const attended = attendance.present;
    const schedIds = scheds.map((x) => x.id);
    const logs =
      schedIds.length > 0
        ? await prisma.lessonLog.findMany({
            where: {
              organizationId: ctx.organizationId,
              scheduleId: { in: schedIds },
              OR: [{ type: 'deduct' }, { type: 'add', reversalOfId: { not: null } }],
            },
            select: { type: true, lessons: true },
          })
        : [];
    const netDed = logs.reduce((n, l) => n + (l.type === 'deduct' ? l.lessons : -l.lessons), 0);
    const convs = await prisma.conversion.findMany({
      where: {
        organizationId: ctx.organizationId,
        approvalStatus: 'confirmed',
        classId: c.id,
        conversionDate: { gte: startD, lte: endD },
      },
      select: { courseType: true, price: true },
    });
    const ren = convs.filter((x) => isRenewal(x.courseType));
    const newOnes = convs.filter((x) => !isRenewal(x.courseType));
    const pays = await prisma.payment.findMany({
      where: {
        organizationId: ctx.organizationId,
        paidAt: { gte: t0, lte: t1 },
        enrollment: { classId: c.id },
      },
      select: { amount: true },
    });
    const paySum = pays.reduce((n, p) => n + Number(p.amount || 0), 0);
    const rate = expected > 0 ? Math.round((attended / expected) * 100) : null;
    rows.push({
      班级: c.name,
      类型: c.courseType || '-',
      负责老师: c.teacher?.organizationId===ctx.organizationId && (!ctx.campusId || c.teacher.campusId===ctx.campusId) ? c.teacher.name : '待分配',
      场次: scheds.length,
      应到: expected,
      实到: attended,
      出勤率: rate,
      净扣课: netDed,
      新签单: newOnes.length,
      新签金额: newOnes.reduce((n, x) => n + Number(x.price || 0), 0),
      续费单: ren.length,
      续费金额: ren.reduce((n, x) => n + Number(x.price || 0), 0),
      实收: paySum,
    });
    T.sessions += scheds.length;
    T.expected += expected;
    T.attended += attended;
    T.netDed += netDed;
    T.newCnt += newOnes.length;
    T.newAmt += newOnes.reduce((n, x) => n + Number(x.price || 0), 0);
    T.renCnt += ren.length;
    T.renAmt += ren.reduce((n, x) => n + Number(x.price || 0), 0);
    T.pay += paySum;
  }
  const unassigned = {
    count: cashSummary.newSignup.conversions - T.newCnt,
    amount: cashSummary.newSignup.amount - T.newAmt,
    renewals: cashSummary.renewal.count - T.renCnt,
    renewalAmount: cashSummary.renewal.amount - T.renAmt,
  };
  if (unassigned.count || unassigned.amount || unassigned.renewals || unassigned.renewalAmount) {
    rows.push({
      班级: '未分班',
      类型: '-',
      负责老师: '-',
      场次: 0,
      应到: 0,
      实到: 0,
      出勤率: null,
      净扣课: 0,
      新签单: unassigned.count,
      新签金额: Number(unassigned.amount.toFixed(2)),
      续费单: unassigned.renewals,
      续费金额: Number(unassigned.renewalAmount.toFixed(2)),
      实收: 0,
    });
  }
  const caliber = [
    '出勤率分母=逐场次有效报名（按场次结束时有效的入班区间去重），分子=到课+迟到；分母为零留空',
    '净扣课=签到扣课-更正返还（lesson_logs，按场次归属班级）',
    '新签=非续费类成单；续费=courseType∈{续费,renewal,续报}；金额=成单价格',
    '实收=payments.paidAt 在窗口内、按报名班级归属；成本未采集不计算利润',
    '新签续费为已确认订单；未分班订单单列；实收为按班归属的历史缴费记录，不等同成单额',
    '本表按班全量输出，无预览条数截断',
    refunds.caliber,
  ].join('；');
  const totalRate = T.expected > 0 ? Math.round((T.attended / T.expected) * 100) : null;
  return envelope(
    ctx,
    {
      tool: 'weekly_report_data',
      title: title,
      unit: '人次/节/元',
      caliber: caliber,
      timeRange: { start: startD, end: endD },
      filters: { campusId: ctx.campusId },
      missing: [
        ...(rows.every((r) => r.场次 === 0) ? ['窗口内无已完成场次'] : []),
        ...cashSummary.scopeNotes,
      ],
      columns: [
        { key: '班级', label: '班级' },
        { key: '类型', label: '类型' },
        { key: '负责老师', label: '负责老师' },
        { key: '场次', label: '场次' },
        { key: '应到', label: '应到' },
        { key: '实到', label: '实到' },
        { key: '出勤率', label: '出勤率' },
        { key: '净扣课', label: '净扣课' },
        { key: '新签单', label: '新签单' },
        { key: '新签金额', label: '新签金额' },
        { key: '续费单', label: '续费单' },
        { key: '续费金额', label: '续费金额' },
        { key: '实收', label: '实收' },
      ],
      rows: rows,
      totals: {
        场次: T.sessions,
        应到: T.expected,
        实到: T.attended,
        出勤率: totalRate,
        净扣课: T.netDed,
        新签单: cashSummary.newSignup.conversions,
        新签金额: cashSummary.newSignup.amount,
        续费单: cashSummary.renewal.count,
        续费金额: cashSummary.renewal.amount,
        实收: T.pay,
        已通过退费金额: refunds.approvedAmount,
        总成单额: cashSummary.totals.grossAmount,
        净成单额: cashSummary.totals.netAmount,
      },
      error: null,
    },
    JSON.stringify({
      期间: { start: startD, end: endD },
      汇总: {
        场次: T.sessions,
        应到: T.expected,
        实到: T.attended,
        出勤率: totalRate,
        净扣课: T.netDed,
        新签单: cashSummary.newSignup.conversions,
        新签金额: cashSummary.newSignup.amount,
        续费单: cashSummary.renewal.count,
        续费金额: cashSummary.renewal.amount,
        实收: T.pay,
        已通过退费金额: refunds.approvedAmount,
        总成单额: cashSummary.totals.grossAmount,
        净成单额: cashSummary.totals.netAmount,
      },
      口径: caliber,
      班级预览: rows.slice(0, 5),
      预览说明: '完整班级明细在证据卡和附件中，未列出的班级不能推测',
    })
  );
};

/** 两个完整、等长周期的环比，零基数明确不可计算。 */
const WEEKLY_COMPARISON_TOOL: ToolFn = async (ctx, params) => {
  const start = String(params.startDate || ctx.today);
  const end = String(params.endDate || ctx.today);
  const days = Math.round((Date.parse(end) - Date.parse(start)) / 86400000) + 1;
  const shift = (d: string) => new Date(Date.parse(d) - days * 86400000).toISOString().slice(0, 10);
  const explicit = Boolean(params.comparisonStartDate && params.comparisonEndDate);
  const prev = { startDate: String(params.comparisonStartDate || shift(start)), endDate: String(params.comparisonEndDate || shift(end)) };
  const comparable = comparablePeriods({start,end},{start:prev.startDate,end:prev.endDate});
  const [current, previous, experiences, previousExperiences] = await Promise.all([
    WEEKLY_REPORT_TOOL(ctx, { startDate: start, endDate: end }),
    WEEKLY_REPORT_TOOL(ctx, prev),
    experienceOverview(ctx, { startDate: start, endDate: end }),
    experienceOverview(ctx, prev),
  ]);
  const metrics = [
    '场次',
    '应到',
    '实到',
    '出勤率',
    '净扣课',
    '新签单',
    '新签金额',
    '续费单',
    '续费金额',
    '总成单额', '已通过退费金额', '净成单额',
    '实收',
  ];
  const compare = (key: string, a: unknown, b: unknown) => {
    const value = a == null ? null : Number(a);
    const before = b == null ? null : Number(b);
    const incomplete = /成单额|新签金额|续费金额/.test(key) && [...current.missing,...previous.missing].some(note=>note.includes('未登记价格'));
    return {
      指标: key,
      本期: value,
      上期: before,
      覆盖: incomplete ? '仅已登记价格' : '完整',
      变化: incomplete || !comparable || value === null || before === null ? null : Number((value - before).toFixed(2)),
      环比百分比:
        incomplete || !comparable || value === null || before === null || before === 0
          ? null
          : Number((((value - before) / before) * 100).toFixed(2)),
      说明:
        incomplete ? '有成单价格未登记，暂不评价变化' : !comparable ? '期间不具可比性，仅列原值' : key === '出勤率'
          ? '变化为百分点，不用百分比增幅评价'
          : before === 0
            ? '上期为零，环比不可计算'
            : '',
    };
  };
  const rows = metrics.map((key) => compare(key, current.totals[key], previous.totals[key]));
  for (const key of ['登记数', '到场数', '成单数', '未到场数'])
    rows.push(compare('体验课' + key, experiences.totals[key], previousExperiences.totals[key]));
  rows.find((r) => r.指标 === '出勤率')!.环比百分比 = null;
  return envelope(
    ctx,
    {
      tool: 'weekly_comparison',
      title: explicit ? '指定期间经营比较' : '经营周环比',
      unit: '',
      timeRange: { start, end },
      filters: { campusId: ctx.campusId, previousStart: prev.startDate, previousEnd: prev.endDate },
      caliber:
        (explicit ? '比较期按指定日期' : '上期为紧邻且等长的前一周期') + '；变化=本期减上期，出勤率变化为百分点；上期为零不计算增幅；实收与成单金额分别统计',
      missing: [],
      columns: ['指标', '本期', '上期', '变化', '环比百分比', '说明'].map((key) => ({
        key,
        label: key,
      })),
      rows,
      totals: {},
      error: null,
    },
    JSON.stringify({ 本期: { start, end }, 上期: prev, 指标: rows })
  );
};

/** Only explicit monthly financial targets attached to the same campus can be a benchmark. */
const MONTHLY_TARGET_TOOL: ToolFn = async (ctx,params) => {
  const period = {start:String(params.startDate),end:String(params.endDate)};
  const [cash,targets] = await Promise.all([
    getCashflowSummary(ctx,{startDate:period.start,endDate:period.end}),
    prisma.orgReportContext.findMany({
      where:{organizationId:ctx.organizationId,campusId:ctx.campusId,kind:'report_targets',status:'confirmed_fact',
        payload:{path:['month'],equals:period.start.slice(0,7)}},
      select:{id:true,payload:true,sourceLabel:true},orderBy:[{createdAt:'desc'},{id:'asc'}]
    })
  ]);
  const rows = ([['newSign','新签金额',cash.newSignup.amount],['renewal','续费金额',cash.renewal.amount]] as const).map(([key,label,actual])=>{
    const target = period.start.slice(0,7) === period.end.slice(0,7) && targets.find(t=>{
      const payload=t.payload as Record<string,unknown>;
      return payload && typeof payload[key]==='number' && (!payload.effectiveDate || typeof payload.effectiveDate==='string' && payload.effectiveDate<=period.end);
    });
    const configured = target ? (target.payload as Record<string,unknown>)[key] : null;
    const goal = typeof configured==='number' && Number.isFinite(configured) && configured>=0 ? configured : null;
    const calculation = evaluateMonthlyTarget(actual,goal,period,ctx.today,!cash.scopeNotes.some(note=>note.includes('未登记价格')));
    return {指标:label,实际金额:actual,目标金额:goal,差额:calculation.difference,目标完成率:calculation.percent,目标来源:target ? target.sourceLabel : null,目标记录:target ? target.id : null,说明:calculation.note};
  });
  return envelope(ctx,{tool:'monthly_target_comparison',title:'月度目标比较',timeRange:period,filters:{campusId:ctx.campusId},
    unit:'元/%',caliber:'实际金额按已确认订单成单日。目标取同机构、同校区、同月且已生效的确认目标配置；差额为实际减去目标。',
    columns:['指标','实际金额','目标金额','差额','目标完成率','目标来源','说明'].map(key=>({key,label:key})),
    rows,totals:{},missing:cash.scopeNotes,error:null},JSON.stringify(rows));
};

export interface ToolDef {
  name: string;
  description: string;
  paramsSchema: Record<string, ParamDef>;
  run: ToolFn;
}

export const AI_TOOLS: ToolDef[] = [
  {
    name: 'new_student_attendance',
    description: '关联首次有效新签学员与报名后的实际到课记录，回答新报/新签/新生哪些没来上过课。报名期间与到课观察截止日分开；未关联学员的成单单列待核，不按姓名猜。',
    paramsSchema: {
      startDate: { type: 'date', required: true }, endDate: { type: 'date', required: true },
      asOfDate: { type: 'date' }, classId: { type: 'string', max: 64 },
      attendanceState: { type: 'string', enum: ['not_attended', 'attended', 'all'] },
    },
    run: newStudentAttendance,
  },
  {
    name: 'business_records',
    description:
      '按运行时字典查本机构业务明细，domain必填；snapshot域为当前快照，dated域按业务日期筛选。全量最多5000条。',
    paramsSchema: {
      domain: { type: 'string', required: true, max: 40, enum: Object.keys(BUSINESS_DOMAINS) },
      startDate: { type: 'date' },
      endDate: { type: 'date' },
      keyword: { type: 'string', max: 50 },
      status: { type: 'string', max: 30 },
      unassigned: { type: 'string', max: 5 },
      view: { type: 'string', max: 12 },
      classId: { type: 'string', max: 64 },
    },
    run: businessRecords,
  },
  {
    name: 'actual_consumption',
    description:
      '实际课消金额：复用FIFO原批次计价与原额更正，缺价部分默认0；非均价，不是净扣课节数',
    paramsSchema: { startDate: { type: 'date' }, endDate: { type: 'date' } },
    run: async (ctx, p) => {
      if (!ctx.campusId) throw new Error('缺少授权校区');
      const start = String(p.startDate || ctx.today.slice(0, 7) + '-01'),
        end = String(p.endDate || ctx.today);
      const from = new Date(start + 'T00:00:00+08:00'),
        to = new Date(end + 'T23:59:59.999+08:00');
      const scope = { organizationId: ctx.organizationId, campusId: ctx.campusId };
      const schedules = await prisma.schedule.findMany({
        where: {
          ...scope,
          startTime: { gte: from, lte: to },
          status: { notIn: ['cancelled', 'canceled'] },
        },
        select: { id: true },
      });
      const result = await readConsumptionValuation(
        prisma,
        scope,
        schedules.map((s) => s.id),
        { start: from, end: to }
      );
      const rows = [{ 指标: '实际课消金额', 金额: result.actualConsumptionAmount }];
      return envelope(
        ctx,
        {
          tool: 'actual_consumption',
          title: '实际课消金额',
          unit: '元',
          timeRange: { start, end },
          filters: { campusId: ctx.campusId },
          columns: [
            { key: '指标', label: '指标' },
            { key: '金额', label: '金额（元）' },
          ],
          rows,
          totals: { 实际课消金额: result.actualConsumptionAmount },
          caliber:
            'FIFO按原批次实际计价；更正返还原额，归属原扣课业务日期；缺价部分按0元；来源课消与收入页面',
          missing: [],
          error: null,
        },
        JSON.stringify(rows)
      );
    },
  },
  {
    name: 'low_attendance_students',
    description: '低出勤学员名单，默认近30天、低于60%，可制作名单文件',
    paramsSchema: {
      startDate: { type: 'date' },
      endDate: { type: 'date' },
      threshold: { type: 'number' },
      thresholdMode: { type: 'string', enum:['lt','lte'] },
    },
    run: (ctx, params) => attendanceFollowup(ctx, params, false),
  },
  {
    name: 'low_attendance_classes',
    description: '低出勤班级名单，默认近14天、低于60%，可制作名单文件',
    paramsSchema: {
      startDate: { type: 'date' },
      endDate: { type: 'date' },
      threshold: { type: 'number' },
      thresholdMode: { type: 'string', enum:['lt','lte'] },
    },
    run: (ctx, params) => attendanceFollowup(ctx, params, true),
  },
  {
    name: 'experience_overview',
    description:
      '体验课情况及待跟进名单，可按日期查询，unconvertedOnly=true查询到场未成单/未到场名单',
    paramsSchema: {
      startDate: { type: 'date' },
      endDate: { type: 'date' },
      unconvertedOnly: { type: 'string', max: 5 },
    },
    run: experienceOverview,
  },
  {
    name: 'class_student_changes',
    description:
      '班级学员变化监测：各活跃班级当前在读/容量/满班率与区间入班人数；期初/流失/净变化不可核定时留空，可按日期查询',
    paramsSchema: { startDate: { type: 'date' }, endDate: { type: 'date' } },
    run: classStudentChanges,
  },
  {
    name:'student_attendance', description:'历史学员出勤：可按准确姓名、学员编号、班级筛选，跨班按学员编号汇总已完成场次。有同名者分别列出；排序按实到次数或显示出勤率，可选四种最高/最低。',
    paramsSchema:{startDate:{type:'date',required:true},endDate:{type:'date',required:true},
      studentName:{type:'string',max:80},studentId:{type:'string',max:64},classId:{type:'string',max:64},className:{type:'string',max:80},
      ranking:{type:'string',enum:['lowest_present','highest_present','lowest_rate','highest_rate','none']}},run:studentAttendance
  },
  {
    name:'renewal_rate', description:'查询期间到期学员续费率是否达到同口径目标；已确认订单按业务日，缺历史到期队列时说明分母缺口；续费笔数不是续费率。',
    paramsSchema:{startDate:{type:'date',required:true},endDate:{type:'date',required:true},userTargetPercent:{type:'number'}},
    run:async(ctx,params)=>{
      const period={start:String(params.startDate),end:String(params.endDate)};
      const target=typeof params.userTargetPercent==='number' ? params.userTargetPercent : null;
      if(target!==null && (target<0 || target>100)) throw new Error('续费率目标应在 0% 至 100% 之间');
      const cash=await getCashflowSummary(ctx,{startDate:period.start,endDate:period.end});
      const totals:Evidence['totals']={续费单数:cash.renewal.count,已关联续费学员人数:cash.renewal.renewedStudents,本期到期学员人数:null,本期到期学员续费率:null};
      if(target!==null) totals.用户给定续费率目标=target;
      return envelope(ctx,{tool:'renewal_rate',title:'到期学员续费率',timeRange:period,unit:'人/单/%',
        filters:{campusId:ctx.campusId},caliber:'续费单按有效成单业务日统计，已关联学员按编号去重。到期续费率需要同一批到期学员中已续费人数除以该批到期人数。',
        columns:[],rows:[],totals,missing:['缺少本期到期学员名单及对应续费记录，续费率及是否达标无法核定；当前待续费名单不还原历史到期分母。',
        ...(target===null ? ['缺少同范围、同期间已确认的续费率目标。'] : [])],error:null},JSON.stringify(totals));
    }
  },
  {
    name:'monthly_target_comparison',
    description:'将本月或指定月的新签、续费成单金额与同校区已确认月度目标比较；只用真实配置，不把建议充当基准。',
    paramsSchema:{startDate:{type:'date',required:true},endDate:{type:'date',required:true}},run:MONTHLY_TARGET_TOOL
  },
  {
    name: 'teacher_performance',
    description: '按稳定老师 ID 核算已完成授课场次、应到实到及出勤率；当前负责班级单列。用于教师表现及下月目标。',
    paramsSchema: {startDate:{type:'date',required:true},endDate:{type:'date',required:true},teacherId:{type:'string',max:64},teacherName:{type:'string',max:80},classId:{type:'string',max:64},className:{type:'string',max:80}},
    run: teacherPerformance,
  },
  {
    name: 'teacher_performance_comparison',
    description: '比较两个期间老师表现，按老师列出出勤率或实际课消下降的名单。用户说哪些老师下滑、变差时用此工具，不能用全校经营环比。',
    paramsSchema: {
      startDate: { type:'date', required:true }, endDate: { type:'date', required:true },
      comparisonStartDate: { type:'date', required:true }, comparisonEndDate: { type:'date', required:true },
      teacherName: { type:'string', max:80 }, metric: { type:'string', enum:['attendance','consumption'] },
      breakdown: { type:'string', enum:['true'] },
    },
    run: teacherPerformanceComparison,
  },
  {
    name: 'teacher_performance_ranking',
    description: '按指定期间比较老师，给出表现最好或指标最高的人。支持出勤率、实际课消金额、个人成单额和个人新招人数。',
    paramsSchema: {
      startDate: { type:'date', required:true }, endDate: { type:'date', required:true },
      metric: { type:'string', enum:['attendance','consumption','sales','signup'] },
    },
    run: teacherPerformanceRanking,
  },
  {
    name: 'weekly_comparison',
    description: '经营周环比，传本期起止日期，上期自动取等长前一周期，含课消/实收/成单/体验课',
    paramsSchema: {
      startDate: { type: 'date', required: true },
      endDate: { type: 'date', required: true },
      comparisonStartDate: { type: 'date' }, comparisonEndDate: { type: 'date' },
    },
    run: WEEKLY_COMPARISON_TOOL,
  },

  {
    name: 'campus_overview',
    description: '校区/机构经营概览：活跃班级、在册学员、本月成单、低出勤学员等汇总指标',
    paramsSchema: {},
    run: OVERVIEW_TOOL,
  },
  {
    name: 'search_classes',
    description: '按名称模糊检索班级（返回名称/类型/状态）',
    paramsSchema: { keyword: { type: 'string', max: 50 } },
    run: SEARCH_CLASSES_TOOL,
  },
  {
    name: 'search_students',
    description: '检索在册学员（姓名模糊、可按班级过滤；电话遮蔽）',
    paramsSchema: { keyword: { type: 'string', max: 50 }, classId: { type: 'string', max: 64 } },
    run: SEARCH_STUDENTS_TOOL,
  },
  {
    name: 'class_attendance',
    description: '班级出勤统计（应到/实到/出勤率，日期范围默认本月）',
    paramsSchema: {
      classId: { type: 'string', max: 64 },
      startDate: { type: 'date' },
      endDate: { type: 'date' },
    },
    run: CLASS_ATTENDANCE_TOOL,
  },
  {
    name: 'net_deduction',
    description: '净扣课（扣课-返还，日期范围默认本月）',
    paramsSchema: { startDate: { type: 'date' }, endDate: { type: 'date' } },
    run: NET_DEDUCTION_TOOL,
  },
  {
    name: 'signup_renewal',
    description: '报名/续费成单统计及逐笔学员课时金额；明细使用includeDetails=true，续费明细可选orderType=renewal',
    paramsSchema: { startDate: { type: 'date' }, endDate: { type: 'date' }, includeDetails:{type:'string',enum:['true','false']}, orderType:{type:'string',enum:['renewal','all']} },
    run: SIGNUP_RENEWAL_TOOL,
  },
  {
    name: 'all_confirmed_orders',
    description: '仅用于明确询问不限期间的全部有效成单数量和成交总额，不扣退费',
    paramsSchema: {},
    run: ALL_CONFIRMED_ORDERS_TOOL,
  },
  {
    name: 'cost_and_income',
    description: '成单与退费汇总：已确认新签、续费、已通过退费及净成单额；不计算利润',
    paramsSchema: { startDate: { type: 'date' }, endDate: { type: 'date' } },
    run: CASHFLOW_TOOL,
  },
  {
    name: 'weekly_report_data',
    description: 'AI 周报数据（按班全量：场次/出勤/净扣课/新签/续费/实收；供报告文件使用）',
    paramsSchema: { startDate: { type: 'date' }, endDate: { type: 'date' } },
    run: WEEKLY_REPORT_TOOL,
  },
];

export const toolCatalogText = (): string =>
  AI_TOOLS.map((t) => `- ${t.name}: ${t.description}；参数=${JSON.stringify(t.paramsSchema)}`).join(
    '\n'
  );

// ==================== 编排：校验→执行→限流 ====================

export interface PlannedToolCall {
  name: string;
  params: Record<string, unknown>;
}

/** Validate the complete plan before the first query; identical calls run once. */
export function validateToolPlan(planned: PlannedToolCall[]) {
  const errors: Array<{ index: number; tool: string; message: string }> = [];
  const tools: PlannedToolCall[] = [];
  const seen = new Set<string>();
  if (planned.length > TOOL_LOOP_LIMIT) errors.push({ index: TOOL_LOOP_LIMIT, tool: '', message: '查询数量超过上限' });
  planned.slice(0, TOOL_LOOP_LIMIT).forEach((call, index) => {
    try {
      const def = AI_TOOLS.find(t => t.name === call.name);
      if (!def) throw new Error('未知或无权限工具');
      const params = validateParams(def.paramsSchema, call.params);
      if (typeof params.startDate === 'string' && typeof params.endDate === 'string' && params.startDate > params.endDate)
        throw new Error('查询日期区间倒置');
      if (call.name === 'weekly_comparison') {
        if (Boolean(params.comparisonStartDate) !== Boolean(params.comparisonEndDate)) throw new Error('比较期起止日期必须同时提供');
        if (typeof params.comparisonStartDate === 'string' && typeof params.comparisonEndDate === 'string' && params.comparisonStartDate > params.comparisonEndDate) throw new Error('比较期日期倒置');
      }
      const key = JSON.stringify([call.name, Object.keys(params).sort().map(k => [k, params[k]])]);
      if (!seen.has(key)) { seen.add(key); tools.push({ name: call.name, params }); }
    } catch (e: any) { errors.push({ index, tool: call.name, message: e.message }); }
  });
  return { tools: errors.length ? [] : tools, errors };
}

/** 执行模型计划的工具调用（≤TOOL_LOOP_LIMIT；未知工具/坏参数跳过并记录） */
export async function runPlannedTools(
  ctx: ToolContext,
  planned: PlannedToolCall[]
): Promise<Evidence[]> {
  const evidences: Evidence[] = [];
  const checked = validateToolPlan(planned);
  if (checked.errors.length) throw new Error('查询计划不完整：' + checked.errors.map(e => e.message).join('；'));
  for (const call of checked.tools) {
    if (ctx.signal?.aborted) break;

    const def = AI_TOOLS.find((t) => t.name === call.name);
    if (!def) {
      evidences.push(
        envelope(
          ctx,
          {
            tool: call.name,
            title: '查询工具不可用',
            unit: '',
            caliber: '工具白名单',
            timeRange: null,
            filters: {},
            missing: [],
            columns: [],
            rows: [],
            totals: {},
            error: '未知或无权限工具',
          },
          '查询工具不可用，不得猜测结果'
        )
      );
      continue;
    } // 未知工具直接跳过（白名单外不执行任何东西）
    try {
      if (ctx.userId) {
        const live = await prisma.user.findFirst({
          where: {
            id: ctx.userId,
            organizationId: ctx.organizationId,
            campusId: ctx.campusId,
            isActive: true,
            isPlatformAdmin: false,
          },
          select: { role: true, managementLevel: true },
        });
        if (
          !live ||
          !(
            ['admin', 'manager'].includes(live.role) ||
            ['super', 'manager'].includes(live.managementLevel)
          )
        )
          throw new Error('当前AI管理权限已变更，请刷新页面后重试');
      }
      const params = validateParams(def.paramsSchema, call.params);
      // R2-3：日期区间真实有序（跨参数校验统一在此，不散在各工具）
      if (
        typeof params.startDate === 'string' &&
        typeof params.endDate === 'string' &&
        params.startDate > params.endDate
      ) {
        throw new Error(
          `日期区间倒置（startDate ${params.startDate} > endDate ${params.endDate}）`
        );
      }
      const ev = await withTimeout(def.run(ctx, params), TOOL_TIMEOUT_MS);
      ev.businessAsOf = ctx.today;
      ev.filters = { ...params, ...ev.filters, organizationId: ctx.organizationId, campusId: ctx.campusId };
      evidences.push(ev);
    } catch (err: any) {
      evidences.push(
        envelope(
          ctx,
          {
            tool: call.name,
            title: `工具 ${call.name} 执行失败`,
            unit: '-',
            caliber: '-',
            timeRange: null,
            filters: call.params || {},
            missing: [],
            columns: [],
            rows: [],
            totals: {},
            error: err?.message || '执行失败',
          },
          `工具 ${call.name} 失败：${err?.message || 'unknown'}（不编造数据）`
        )
      );
    }
  }
  return evidences;
}

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      p,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`工具执行超时（${ms}ms）`)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
