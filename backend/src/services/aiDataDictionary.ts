import { currentEnrollmentWhere } from './currentEnrollment';
import { Prisma } from '@prisma/client';
import prisma from '../config/database';
import { leadCampusWhere } from '../utils/leadScope';
import { randomUUID } from 'crypto';
import type { Evidence, ToolContext } from './aiTools';
import { computeSessionAttendance } from './attendanceStatsService';

/** Explicit scalar allowlists. Model/field names never come from an LLM or an upload. */
export const BUSINESS_DOMAINS = {
  organization: {
    label: '机构设置',
    model: 'Organization',
    delegate: 'organization',
    fields: ['id', 'name', 'code', 'isActive', 'updatedAt'],
    source: '/settings',
    date: '',
    aliases: '机构设置 机构名称',
    example: '机构名称和启用状态是什么？',
  },
  classes: {
    label: '班级资料',
    model: 'Class',
    delegate: 'class',
    fields: [
      'id',
      'name',
      'code',
      'courseType',
      'capacity',
      'teacherId',
      'status',
      'createdAt',
      'updatedAt',
    ],
    source: '/classes',
    date: '',
    aliases: '班级 班级名单',
    example: '列出所有班级与容量',
  },
  campus: {
    label: '校区资料',
    model: 'Campus',
    delegate: 'campus',
    fields: ['id', 'name', 'code', 'isActive', 'updatedAt'],
    source: '/settings',
    date: '',
    aliases: '校区资料',
    example: '当前校区资料是什么？',
  },
  staff: {
    label: '人员职责',
    model: 'User',
    delegate: 'user',
    fields: ['id', 'name', 'role', 'managementLevel', 'isActive', 'updatedAt'],
    source: '/staff',
    date: '',
    aliases: '人员 员工 工作人员 岗位 老师名单',
    example: '列出工作人员的岗位和管理身份',
  },
  leads: {
    label: '招生鱼池',
    model: 'Lead',
    delegate: 'lead',
    fields: ['id', 'customerName', 'source', 'status', 'lastContactAt', 'createdAt'],
    source: '/marketing',
    date: 'createdAt',
    aliases: '鱼池 线索 潜客',
    example: '本月新增鱼池线索有哪些？',
  },
  students: {
    label: '学员状态与课时',
    model: 'Student',
    delegate: 'student',
    fields: [
      'id',
      'name',
      'status',
      'remainingLessons',
      'purchasedLessons',
      'consumedLessons',
      'frozenLessons',
      'renewalStatus',
      'createdAt',
      'updatedAt',
    ],
    source: '/students',
    date: '',
    aliases: '学员 学生 未分班 召回 归档 流失',
    example: '当前未分班学员剩余多少课时？',
  },
  enrollments: {
    label: '报名与退班',
    model: 'Enrollment',
    delegate: 'enrollment',
    fields: ['id', 'studentId', 'classId', 'status', 'enrolledAt', 'endedAt'],
    source: '/classes',
    date: 'enrolledAt',
    aliases: '报名份数 入班 退班',
    example: '本月新增多少份报名？',
  },
  schedules: {
    label: '排课与代课',
    model: 'Schedule',
    delegate: 'schedule',
    fields: [
      'id',
      'classId',
      'teacherId',
      'startTime',
      'endTime',
      'status',
      'classroom',
      'originalScheduleId',
    ],
    source: '/schedules',
    date: 'startTime',
    aliases: '排课 课表 代课 场次',
    example: '本月有哪些排课场次？',
  },
  weekly_rules: {
    label: '班级每周规则',
    model: 'ClassWeeklyRule',
    delegate: 'classWeeklyRule',
    fields: ['id', 'classId', 'weekday', 'startTime', 'endTime', 'classroom', 'updatedAt'],
    source: '/classes',
    date: '',
    aliases: '每周规则 班级时间',
    example: '班级每周规则是什么？',
  },
  courses: {
    label: '课程目录（历史兼容）',
    model: 'Course',
    delegate: 'course',
    fields: ['id', 'name', 'code', 'duration', 'isActive'],
    source: '/classes',
    date: '',
    aliases: '课程目录',
    example: '历史课程目录有哪些？',
  },
  ledger: {
    label: '购买赠送与划课流水',
    model: 'LessonLog',
    delegate: 'lessonLog',
    fields: [
      'id',
      'studentId',
      'studentName',
      'type',
      'lessons',
      'lessonSource',
      'businessDate',
      'reversalOfId',
      'conversionId',
      'createdAt',
    ],
    source: '/lesson-logs',
    date: 'createdAt',
    aliases: '赠课 购买 批次 流水 返还',
    example: '本月购买和赠课流水分别多少条？',
  },
  transfers: {
    label: '学员调班',
    model: 'LessonTransfer',
    delegate: 'lessonTransfer',
    fields: [
      'id',
      'studentId',
      'fromClassId',
      'toClassId',
      'transferredLessons',
      'priceDifference',
      'refundAmount',
      'status',
      'createdAt',
    ],
    source: '/classes',
    date: 'createdAt',
    aliases: '调班 转班',
    example: '本月有哪些调班记录？',
  },
  handovers: {
    label: '人员资源交接',
    model: 'ResourceTransfer',
    delegate: 'resourceTransfer',
    fields: ['id', 'fromTeacherId', 'toTeacherId', 'status', 'createdAt'],
    source: '/class-handover',
    date: 'createdAt',
    aliases: '交接 移交',
    example: '本月有哪些人员资源交接？',
  },
  followups: {
    label: '跟进完成记录',
    model: 'FollowUpCompletion',
    delegate: 'followUpCompletion',
    fields: ['id', 'userId', 'day', 'done', 'updatedAt'],
    source: '/my-work',
    date: 'day',
    aliases: '跟进 待办 完成进度',
    example: '本月跟进完成记录有多少？',
  },
  parent_links: {
    label: '家长孩子绑定',
    model: 'ParentStudentLink',
    delegate: 'parentStudentLink',
    fields: ['parentId', 'studentId', 'createdAt'],
    source: '/students',
    date: '',
    aliases: '家长 绑定',
    example: '当前有哪些家长孩子绑定关系？',
  },
  notices: {
    label: '家长通知记录',
    model: 'ParentNotice',
    delegate: 'parentNotice',
    fields: ['id', 'studentId', 'title', 'occurredAt'],
    source: '/students',
    date: 'occurredAt',
    aliases: '通知',
    example: '本月产生哪些家长通知？',
  },
  payments: {
    label: '历史缴费',
    model: 'Payment',
    delegate: 'payment',
    fields: ['id', 'studentId', 'amount', 'paymentType', 'paymentMethod', 'paidAt'],
    source: '/order-info',
    date: 'paidAt',
    aliases: '历史缴费 payments',
    example: '本月历史缴费记录是多少？',
  },
  refunds: {
    label: '退费状态明细',
    model: 'Refund',
    delegate: 'refund',
    fields: [
      'id',
      'studentId',
      'studentName',
      'status',
      'lessonsToRefund',
      'amountToRefund',
      'reviewedAt',
      'createdAt',
    ],
    source: '/students/refunds',
    date: 'reviewedAt',
    aliases: '退费明细 退费状态',
    example: '本月确认的退费明细有哪些？',
  },
  credit_account: {
    label: '机构积分余额',
    model: 'AiCreditAccount',
    delegate: 'aiCreditAccount',
    fields: ['id', 'status', 'balanceMicros', 'reservedMicros', 'updatedAt'],
    source: '/ai-credits',
    date: '',
    aliases: '积分余额 钱包',
    example: '当前可用积分是多少？',
  },
  credit_bills: {
    label: '机构AI任务账单汇总明细',
    model: 'AiTaskBill',
    delegate: 'aiTaskBill',
    fields: [
      'id',
      'taskType',
      'status',
      'reservedMicros',
      'settledMicros',
      'releasedMicros',
      'estimateMicros',
      'createdAt',
      'settledAt',
    ],
    source: '/ai-credits',
    date: 'createdAt',
    aliases: '积分账单 任务账单',
    example: '本月AI任务结算与释放各是多少？',
  },
  credit_ledger: {
    label: '机构积分流水',
    model: 'AiCreditLedger',
    delegate: 'aiCreditLedger',
    fields: ['id', 'type', 'source', 'micros', 'balanceAfter', 'billId', 'createdAt'],
    source: '/ai-credits',
    date: 'createdAt',
    aliases: '积分流水 充值记录',
    example: '本月积分流水有哪些？',
  },
  management_events: {
    label: '管理身份变更',
    model: 'UserManagementEvent',
    delegate: 'userManagementEvent',
    fields: ['id', 'actorId', 'userId', 'fromLevel', 'toLevel', 'jobRole', 'origin', 'createdAt'],
    source: '/staff',
    date: 'createdAt',
    aliases: '管理身份变更 任免',
    example: '本月管理身份发生哪些变更？',
  },
  batch_pricing: {
    label: '课时购买批次计价',
    model: 'LessonBatchPricing',
    delegate: 'lessonBatchPricing',
    fields: [
      'id',
      'studentId',
      'creditLogId',
      'originalLessons',
      'amountCents',
      'basisType',
      'orderId',
      'createdAt',
    ],
    source: '/students',
    date: 'createdAt',
    aliases: '批次计价 购买批次',
    example: '本月课时购买批次计价情况？',
  },
} as const;
export type BusinessDomain = keyof typeof BUSINESS_DOMAINS;
export const FIELD_LABELS: Record<string, string> = {
  id: '记录编号',
  courseType: '课程类型',
  capacity: '容量',
  name: '名称',
  code: '代码',
  isActive: '是否启用',
  updatedAt: '更新时间',
  createdAt: '建档时间',
  role: '岗位',
  managementLevel: '管理身份',
  customerName: '客户姓名',
  source: '来源',
  status: '状态',
  lastContactAt: '最近联系时间',
  remainingLessons: '剩余课时',
  purchasedLessons: '购买课时',
  consumedLessons: '已用课时',
  frozenLessons: '冻结课时',
  renewalStatus: '续费状态',
  studentId: '学员编号',
  classId: '班级编号',
  enrolledAt: '入班时间',
  endedAt: '离班时间',
  teacherId: '授课老师编号',
  startTime: '开始时间',
  endTime: '结束时间',
  classroom: '教室',
  originalScheduleId: '原场次编号',
  weekday: '星期（1至7）',
  duration: '时长（分钟）',
  studentName: '学员姓名',
  type: '类型',
  lessons: '课时数',
  lessonSource: '课时来源',
  businessDate: '业务日期',
  reversalOfId: '原扣课编号',
  conversionId: '成单编号',
  fromClassId: '原班编号',
  toClassId: '新班编号',
  transferredLessons: '转班课时',
  priceDifference: '差价（元）',
  refundAmount: '退费（元）',
  fromTeacherId: '交出人编号',
  toTeacherId: '接手人编号',
  userId: '人员编号',
  day: '跟进日期',
  done: '是否完成',
  parentId: '家长编号',
  title: '通知标题',
  occurredAt: '发生时间',
  amount: '金额（元）',
  paymentType: '缴费类型',
  paymentMethod: '付款方式',
  paidAt: '缴费日期',
  lessonsToRefund: '退还课时',
  amountToRefund: '退费金额（元）',
  reviewedAt: '确认时间',
  balanceMicros: '余额（微积分）',
  reservedMicros: '预留（微积分）',
  settledMicros: '结算（微积分）',
  releasedMicros: '释放（微积分）',
  estimateMicros: '待核估算（微积分）',
  taskType: '任务类型',
  settledAt: '结算时间',
  micros: '变动（微积分）',
  balanceAfter: '变动后余额（微积分）',
  billId: '任务账单号',
  actorId: '操作人编号',
  fromLevel: '原管理身份',
  toLevel: '新管理身份',
  jobRole: '岗位',
  origin: '操作来源',
  creditLogId: '入账流水编号',
  originalLessons: '原批次课时',
  amountCents: '批次金额（分）',
  basisType: '计价依据',
  orderId: '原成单编号',
};
const DOMAIN_KEYS = Object.keys(BUSINESS_DOMAINS) as BusinessDomain[];
const TOOL_MODELS: Record<string, string> = {
  Class: 'search_classes / class_student_changes',
  Attendance: 'class_attendance / low_attendance_students',
  Conversion: 'signup_renewal / cost_and_income',
  ExperienceLesson: 'experience_overview',
  LessonBatchPricing: '课消计价服务（仅汇总，单独批次明细待接入）',
};
const DENIED = new Set([
  'IntegrationKey',
  'AiEmployeeAuthorization',
  'CampusApplication',
  'AiModelPrice',
  'KnowledgeChunk',
  'Setting',
]);
const PRIVATE = new Set(['AiConversation', 'AiMessage', 'AiReportFile']);
export function runtimeDictionary() {
  return {
    version: '2026-11-14-v1',
    scope: '当前机构与获准校区；管理员；个人会话与附件仅本人',
    domains: DOMAIN_KEYS.map((key) => ({
      key,
      ...BUSINESS_DOMAINS[key],
      tool: 'business_records',
      unit: key === 'credit_account' ? '微积分（10000=1积分）' : '记录；金额元，课时节',
      grain: '单记录（关联ID可追溯）',
      dateField: BUSINESS_DOMAINS[key].date || '当前快照，不以创建日期充当业务日期',
      nullRule: '缺失保留null；金额保留原精度；计数不将空值填零',
      status:
        key === 'students'
          ? '保留状态，unassigned仅当前有效报名为空'
          : '原状态明示，状态筛选单独传入',
      updatedAt: '每次请求实时读取，无跨用户缓存',
    })),
    metrics: [
      {
        name: '净成单额',
        aliases: ['净收入', '现金流'],
        tool: 'cost_and_income',
        formula: '已确认新签金额+已确认续费金额-已确认退费金额',
        dates: 'conversionDate / reviewedAt，上海业务日',
        unit: '元',
        source: '/cashflow-summary',
        missing: '不等同利润，不包含历史缴费，不计作废单',
      },
      {
        name: '出勤率',
        aliases: ['到课率'],
        tool: 'class_attendance',
        formula: '(到课+迟到)/逐场次有效报名应到',
        dates: 'schedule.startTime',
        unit: '%',
        source: '/class-attendance',
        missing: '零分母为null；未入班不计；临时串课仅对应场次',
      },
      {
        name: '净扣课',
        aliases: ['课时消耗'],
        tool: 'net_deduction',
        formula: '扣课-更正返还',
        dates: '场次/业务日期（见证据口径）',
        unit: '节',
        source: '/lesson-logs',
        missing: '不是金额；实际课消金额须用FIFO计价服务',
      },
    ],
    models: Prisma.dmmf.datamodel.models.map((model) => {
      const domain = DOMAIN_KEYS.find((key) => BUSINESS_DOMAINS[key].model === model.name);
      const classification = domain
        ? '可查明细'
        : TOOL_MODELS[model.name]
          ? '可查汇总/专用工具'
          : PRIVATE.has(model.name)
            ? '本人专属接口'
            : DENIED.has(model.name)
              ? '权限排除'
              : '技术内部/历史兼容（不检索）';
      const allowed = domain ? ([...BUSINESS_DOMAINS[domain].fields] as string[]) : [];
      return {
        model: model.name,
        classification,
        entry: domain ? `business_records:${domain}` : TOOL_MODELS[model.name] || '',
        reason: domain
          ? '显式标量白名单与服务端范围过滤'
          : '不将任意JSON、认证秘密、平台资料或他人私有内容送入模型',
        fields: model.fields.map((f) => ({
          name: f.name,
          type: f.type,
          access: allowed.includes(f.name)
            ? '明细'
            : f.kind === 'object'
              ? '关系键/专用查询'
              : TOOL_MODELS[model.name]
                ? '专用工具按白名单裁剪'
                : '不返回',
        })),
      };
    }),
  };
}
export function dictionaryIntentText() {
  return DOMAIN_KEYS.map(
    (key) =>
      `${key}：${BUSINESS_DOMAINS[key].aliases}；${BUSINESS_DOMAINS[key].date || '当前快照'}；business_records(domain=${key})` +
      (key === 'enrollments' ? '；当前有效报名必须view="current"，不按入班日期筛选' : '') +
      (key === 'students' ? '；未分班必须unassigned="true"，不是status="未分班"' : '')
  ).join('\n');
}

export async function businessRecords(
  ctx: ToolContext,
  params: Record<string, unknown>
): Promise<Evidence> {
  const key = String(params.domain || '') as BusinessDomain;
  if (!DOMAIN_KEYS.includes(key)) throw new Error('业务域无效，请从数据字典选择');
  const def = BUSINESS_DOMAINS[key];
  const base = {
    organizationId: ctx.organizationId,
    ...(ctx.campusId ? { campusId: ctx.campusId } : {}),
  };
  const studentScope = { ...base };
  let where: any = { ...base };
  if (key === 'classes') where.status = { not: 'deleted' };
  if (key === 'staff') Object.assign(where, { role: { not: 'parent' }, isPlatformAdmin: false });
  if (key === 'management_events')
    where = {
      organizationId: ctx.organizationId,
      userId: {
        in: (await prisma.user.findMany({ where: base, select: { id: true } })).map((u) => u.id),
      },
    };
  if (key === 'credit_ledger') {
    const accounts = await prisma.aiCreditAccount.findMany({ where: base, select: { id: true } });
    where = { accountId: { in: accounts.map((a) => a.id) } };
  }
  if (key === 'leads' && ctx.campusId)
    where = await leadCampusWhere(ctx.organizationId, ctx.campusId);
  if (key === 'organization') where = { id: ctx.organizationId };
  if (key === 'campus')
    where = { organizationId: ctx.organizationId, ...(ctx.campusId ? { id: ctx.campusId } : {}) };
  if (['handovers'].includes(key))
    where = {
      organizationId: ctx.organizationId,
      ...(ctx.campusId
        ? key === 'leads'
          ? { assignee: base }
          : {
              fromTeacherId: {
                in: (await prisma.user.findMany({ where: base, select: { id: true } })).map(
                  (u) => u.id
                ),
              },
              toTeacherId: {
                in: (await prisma.user.findMany({ where: base, select: { id: true } })).map(
                  (u) => u.id
                ),
              },
            }
        : {}),
    };
  if (['ledger', 'refunds', 'payments', 'transfers'].includes(key))
    where = { organizationId: ctx.organizationId, student: studentScope };
  if (key === 'enrollments')
    where = { organizationId: ctx.organizationId, student: studentScope, class: base };
  if (key === 'weekly_rules') where = { organizationId: ctx.organizationId, class: base };
  if (key === 'courses') where = { organizationId: ctx.organizationId };
  if (key === 'parent_links')
    where = {
      student: studentScope,
      parent: {
        organizationId: ctx.organizationId,
        ...(ctx.campusId ? { campusId: ctx.campusId } : {}),
        role: 'parent',
      },
    };
  if (key === 'notices') where = { student: studentScope };
  if (key === 'students' && params.unassigned === 'true')
    Object.assign(where, {
      status: 'active',
      enrollments: {
        none: currentEnrollmentWhere(ctx),
      },
    });
  if (params.status && (def.fields as readonly string[]).includes('status'))
    where.status = String(params.status);
  if (params.keyword) {
    const field =
      key === 'leads'
        ? 'customerName'
        : (def.fields as readonly string[]).includes('name')
          ? 'name'
          : null;
    if (!field) throw new Error('该业务域不支持按名称筛选');
    where[field] = { contains: String(params.keyword) };
  }
  if (params.classId) {
    const belongs = await prisma.class.findFirst({
      where: { ...base, id: String(params.classId) },
      select: { id: true },
    });
    if (!belongs) throw new Error('班级不在授权范围');
    if ((def.fields as readonly string[]).includes('classId')) where.classId = belongs.id;
    else if (key === 'students')
      where.enrollments = { some: { ...currentEnrollmentWhere(ctx), classId: belongs.id } };
    else throw new Error('该业务域不支持按班级筛选');
  }
  const start = String(params.startDate || ctx.today.slice(0, 7) + '-01');
  const end = String(params.endDate || ctx.today);
  if (key === 'enrollments' && params.view === 'current')
    where = {
      ...where,
      ...currentEnrollmentWhere(ctx),
      student: { ...studentScope, status: 'active' },
    };
  if (def.date && params.view !== 'current')
    where[def.date] = ['day', 'businessDate'].includes(def.date)
      ? { gte: start, lte: end }
      : {
          gte: new Date(start + 'T00:00:00+08:00'),
          lt: new Date(Date.parse(end + 'T00:00:00+08:00') + 86400000),
        };
  const raw = await (prisma as any)[def.delegate].findMany({
    where,
    select: Object.fromEntries(def.fields.map((f) => [f, true])),
    orderBy: Object.fromEntries([[def.fields.includes('id' as never) ? 'id' : 'studentId', 'asc']]),
    take: 5001,
  });
  if (raw.length > 5000) throw new Error('结果超过5000条，请缩小范围；未返回截断名单');
  const rows = raw.map((r: Record<string, unknown>) =>
    Object.fromEntries(
      Object.entries(r).map(([k, v]) => [
        k,
        v instanceof Date ? v.toISOString() : v instanceof Prisma.Decimal ? Number(v) : v,
      ])
    )
  );
  const totals: Record<string, number | string | null> = { 记录数: rows.length };
  const extraFields: Array<{key:string;label:string}> = [];
  if (key === 'schedules') {
    // Planned attendance is a roster at the occurrence's end time, not the
    // completed-session attendance rate. The latter deliberately excludes
    // tomorrow's scheduled lessons.
    const classIds = [...new Set(raw.map((r:any) => r.classId))] as string[];
    const teacherIds = [...new Set(raw.map((r:any) => r.teacherId).filter(Boolean))] as string[];
    const [classes, teachers, enrollments, attendances] = await Promise.all([
      prisma.class.findMany({where:{...base,id:{in:classIds}},select:{id:true,name:true}}),
      prisma.user.findMany({where:{...base,id:{in:teacherIds}},select:{id:true,name:true}}),
      prisma.enrollment.findMany({where:{organizationId:ctx.organizationId,classId:{in:classIds},class:base,student:studentScope},select:{classId:true,studentId:true,enrolledAt:true,endedAt:true,status:true}}),
      prisma.attendance.findMany({where:{organizationId:ctx.organizationId,scheduleId:{in:raw.map((r:any)=>r.id)},student:studentScope},select:{studentId:true,scheduleId:true,classId:true,status:true,isTemporary:true}}),
    ]);
    const classNames = new Map(classes.map(c=>[c.id,c.name])), teacherNames = new Map(teachers.map(t=>[t.id,t.name]));
    const enrollmentsByClass = new Map<string,typeof enrollments>(), attendancesBySchedule = new Map<string,typeof attendances>();
    for (const e of enrollments) { if (!enrollmentsByClass.has(e.classId)) enrollmentsByClass.set(e.classId,[]); enrollmentsByClass.get(e.classId)!.push(e); }
    for (const a of attendances) { if (!attendancesBySchedule.has(a.scheduleId)) attendancesBySchedule.set(a.scheduleId,[]); attendancesBySchedule.get(a.scheduleId)!.push(a); }
    raw.forEach((schedule:any,index:number)=>{
      Object.assign(rows[index],{className:classNames.get(schedule.classId)||null,teacherName:teacherNames.get(schedule.teacherId)||null,
        plannedExpected:schedule.status==='cancelled'?null:computeSessionAttendance({schedules:[schedule],enrollments:enrollmentsByClass.get(schedule.classId)||[],attendances:attendancesBySchedule.get(schedule.id)||[]}).expected});
    });
    totals.排课应到人次 = rows.reduce((n:number,r:Record<string,unknown>)=>n+Number(r.plannedExpected||0),0);
    extraFields.push({key:'className',label:'班级'},{key:'teacherName',label:'授课老师'},{key:'plannedExpected',label:'排课应到（人）'});
  }
  if (key === 'students') {
    totals.学员人数 = rows.length;
    totals.剩余课时 = rows.reduce((n: number, r: any) => n + r.remainingLessons, 0);
  }
  if (key === 'payments') {
    totals['金额合计（元）'] = rows.reduce((n: number, r: any) => n + Number(r.amount ?? 0), 0);
  }
  if (key === 'refunds') {
    totals['退费金额合计（元）'] = rows.reduce((n: number, r: any) => n + Number(r.amountToRefund ?? 0), 0);
  }
  if (key === 'credit_account') {
    totals.可用积分 = rows.reduce(
      (n: number, r: any) => n + (r.balanceMicros - r.reservedMicros) / 10000,
      0
    );
  }
  if (key === 'enrollments') {
    totals.报名份数 = rows.length;
    totals.学员人数 = new Set(rows.map((r: any) => r.studentId)).size;
  }
  if (key === 'credit_bills') {
    totals.结算积分 = rows.reduce((n: number, r: any) => n + r.settledMicros / 10000, 0);
    totals.释放积分 = rows.reduce((n: number, r: any) => n + r.releasedMicros / 10000, 0);
    totals.待核对任务 = rows.filter((r: any) => r.status === 'pending_review').length;
  }
  const selectionRule = key === 'schedules'
    ? '排课应到按该场次结束时有效报名去重，并包含已保存的本场临时串课；未完成场次也有排课应到，取消场次不计。授课老师仅用场次老师，不用当前班主任倒推。出勤率另按已完成场次核算；'
    : key === 'students' && params.unassigned === 'true'
    ? '本结果全部为未分班学员：在册且无当前有效报名，已由服务端关联筛选，不依赖单行是否存在分班字段；'
    : key === 'enrollments' && params.view === 'current'
      ? '当前有效报名快照，包含以前月份入班后仍有效的报名；报名份数与去重学员人数分别统计；'
      : '';
  const caliber = `${selectionRule}${def.label}；来源${def.source}；${def.date && params.view !== 'current' ? '业务日期字段=' + def.date : '当前快照，非区间流量'}；保留原状态，金额不推定为利润；全量最多5000条，超限拒绝`;
  const card = {
    evidenceId: randomUUID(),
    tool: 'business_records',
    title: def.label,
    unit: key === 'credit_account' ? '微积分/积分' : '条/人/节/元',
    timeRange: def.date && params.view !== 'current' ? { start, end } : null,
    generatedAt: new Date().toISOString(),
    filters: { domain: key, ...params, campusId: ctx.campusId },
    columns: [...def.fields.map((f) => ({ key: f, label: FIELD_LABELS[f] || f })), ...extraFields],
    rows,
    totals,
    caliber,
    missing: [],
    error: null,
  };
  return {
    ...card,
    modelText: JSON.stringify({
      来源: def.source,
      口径: caliber,
      期间: card.timeRange,
      汇总: totals,
      预览: rows.slice(0, 8),
      总记录: rows.length,
    }).slice(0, 5000),
  };
}
