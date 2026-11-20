import { Prisma } from '@prisma/client';
import prisma from '../config/database';
import { ApiError } from '../middleware/errorHandler';
import { businessPeriod } from '../utils/businessPeriod';
import { experienceScopeWhere } from '../utils/experienceScope';
import { RequestScope } from '../utils/scope';
import { refundSummary } from './refundSummary';

const RENEWAL_TYPES = ['续费', 'renewal', '续报'];
const ATTENDED_STATUSES = ['completed', 'unconverted', 'converted'];
const STAFF_ROLES = ['sales', 'staff', 'teacher', 'coach', 'manager', 'admin'];
const RENEWAL_THRESHOLD = 10;
const DAY = 86400000;
const businessDay = (date: Date) => new Date(date.getTime() + 8 * 3600000).toISOString().slice(0, 10);
const percentage = (n: number, d: number) => d ? Math.round(1000 * n / d) / 10 : null;
const zero = () => new Prisma.Decimal(0);

export function orderScope({ organizationId, campusId }: RequestScope): Prisma.ConversionWhereInput {
  if (!campusId) return { organizationId };
  const owner = { organizationId, campusId };
  // Same precedence as the order register. A class at another campus takes precedence over the buyer or salesperson.
  return { organizationId, OR: [
    { class: owner }, { classId: null, student: owner }, { classId: null, studentId: null, sales: owner },
  ] };
}

// reviewedAt is a UTC value stored in a PostgreSQL timestamp(3) without time zone.
// Grouping sets count distinct students once across the interval, including students on multiple days.
async function refundByDay(tx: Prisma.TransactionClient, scope: RequestScope, start: Date, end: Date) {
  return tx.$queryRaw<{ day: string | null; amount: Prisma.Decimal | null; people: bigint }[]>`
    WITH approved AS (
      SELECT to_char(r."reviewedAt" + interval '8 hours', 'YYYY-MM-DD') AS day,
             r."studentId", r."amountToRefund"
      FROM refunds r
      WHERE r."organizationId" = ${scope.organizationId} AND r.status = 'approved'
        AND r."reviewedAt" BETWEEN ${start.toISOString()}::timestamp AND ${end.toISOString()}::timestamp
        ${scope.campusId ? Prisma.sql`AND EXISTS (
          SELECT 1 FROM students s WHERE s.id = r."studentId" AND s."campusId" = ${scope.campusId}
        )` : Prisma.empty}
    )
    SELECT day, SUM("amountToRefund") AS amount, COUNT(DISTINCT "studentId") AS people
    FROM approved GROUP BY GROUPING SETS ((day), ())`;
}

export async function getCashflowSummary(scope: RequestScope, query: Record<string, unknown>) {
  for (const field of ['startDate', 'endDate']) {
    if (query[field] !== undefined && (typeof query[field] !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(query[field] as string))) {
      throw new ApiError('日期格式应为 YYYY-MM-DD', 400, 'INVALID_DATE');
    }
  }
  const { start, end } = businessPeriod(query);
  const startDate = businessDay(start), endDate = businessDay(end);
  if (+end - +start >= 366 * DAY) throw new ApiError('请最多选择 366 个自然日', 400, 'INVALID_DATE');
  const staffId = query.staffId;
  if (staffId !== undefined && (typeof staffId !== 'string' || !staffId.trim())) {
    throw new ApiError('人员筛选值无效', 400, 'INVALID_STAFF');
  }
  const { organizationId, campusId } = scope;
  const tenant = { organizationId, ...(campusId ? { campusId } : {}) };
  const dates = { gte: startDate, lte: endDate };
  const owner = staffId ? { assigneeId: staffId } : {};
  const sales = staffId ? { salesId: staffId } : {};
  const orders = orderScope(scope);
  const signed: Prisma.ConversionWhereInput = { ...orders, ...sales, approvalStatus: 'confirmed', conversionDate: dates };
  const lessons: Prisma.ExperienceLessonWhereInput = {
    ...experienceScopeWhere(organizationId, campusId), ...owner, scheduleDate: dates,
  };
  const attended: Prisma.ExperienceLessonWhereInput = { ...lessons, status: { in: ATTENDED_STATUSES } };
  const linkedSignup: Prisma.ConversionWhereInput = {
    AND: [orders, { approvalStatus: 'confirmed', OR: [{ courseType: null }, { courseType: { notIn: RENEWAL_TYPES } }] }],
  };

  return prisma.$transaction(async tx => {
    const staffOptions = await tx.user.findMany({
      where: { ...tenant, role: { in: STAFF_ROLES }, isPlatformAdmin: false },
      select: { id: true, name: true }, orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });
    if (staffId && !staffOptions.some(person => person.id === staffId)) {
      throw new ApiError('人员不属于当前统计范围', 400, 'INVALID_STAFF');
    }
    // Same attribution as the lead register, including the creator of legacy unassigned leads.
    const campusUsers = campusId ? await tx.user.findMany({ where: tenant, select: { id: true } }) : [];
    const campusUserIds = campusUsers.map(user => user.id);
    const leadScope: Prisma.LeadWhereInput = campusId ? { OR: [
      { assigneeId: { in: campusUserIds } }, { assigneeId: null, createdById: { in: campusUserIds } },
    ] } : {};
    const [totalLeads, invitedExperience, scheduledExperience, attendedExperience, convertedExperience, orderGroups,
      renewed, pending, approvals, refunds] = await Promise.all([
      tx.lead.count({ where: { organizationId, ...leadScope, ...owner, createdAt: { gte: start, lte: end } } }),
      tx.experienceLesson.count({ where: { ...experienceScopeWhere(organizationId, campusId), ...owner, createdAt: { gte: start, lte: end } } }),
      tx.experienceLesson.count({ where: lessons }),
      tx.experienceLesson.count({ where: attended }),
      tx.experienceLesson.count({ where: { ...attended, conversions: { some: linkedSignup } } }),
      tx.conversion.groupBy({
        by: ['conversionDate', 'courseType'], where: signed, _count: { _all: true, price: true, studentId: true }, _sum: { price: true },
      }),
      tx.conversion.groupBy({ by: ['studentId'], where: { ...signed, courseType: { in: RENEWAL_TYPES }, studentId: { not: null } } }),
      tx.student.findMany({ where: { ...tenant, ...sales, status: 'active', remainingLessons: { lte: RENEWAL_THRESHOLD },
        OR: [{ renewalStatus: null }, { renewalStatus: { not: 'no_renewal' } }],
      }, select: { id: true } }),
      refundSummary(scope, start, end, tx),
      refundByDay(tx, scope, start, end),
    ]);
    const days = new Map<string, { signup: Prisma.Decimal; renewal: Prisma.Decimal; refund: Prisma.Decimal }>();
    for (let tick = +start; tick <= +end; tick += DAY) {
      days.set(businessDay(new Date(tick)), { signup: zero(), renewal: zero(), refund: zero() });
    }
    let signupCount = 0, renewalCount = 0, missingPriceCount = 0, unlinkedRenewals = 0;
    let signupTotal = zero(), renewalTotal = zero();
    for (const group of orderGroups) {
      const day = days.get(group.conversionDate);
      if (!day) throw new ApiError('区间内有无效的成单业务日期，无法生成趋势', 422, 'INVALID_ORDER_DAY');
      const amount = group._sum.price ?? zero();
      missingPriceCount += group._count._all - group._count.price;
      if (RENEWAL_TYPES.includes(group.courseType || '')) {
        renewalCount += group._count._all;
        unlinkedRenewals += group._count._all - group._count.studentId;
        renewalTotal = renewalTotal.plus(amount);
        day.renewal = day.renewal.plus(amount);
      } else {
        signupCount += group._count._all;
        signupTotal = signupTotal.plus(amount);
        day.signup = day.signup.plus(amount);
      }
    }
    let refundedStudents = 0;
    for (const row of refunds) {
      if (row.day === null) refundedStudents = Number(row.people);
      else days.get(row.day)!.refund = row.amount ?? zero();
    }
    const renewedIds = new Set(renewed.flatMap(row => row.studentId ? [row.studentId] : []));
    const outstandingStudents = pending.filter(student => !renewedIds.has(student.id)).length;
    const totalEligible = renewedIds.size + outstandingStudents;
    const gross = signupTotal.plus(renewalTotal);
    const scopeNotes = [
      campusId ? '当前校区：订单按班级、学员、销售依次归属；体验按班级或未分班时的负责人归属；线索按负责人或未分配时的创建人归属。无法确定校区的记录未计入。'
        : '本机构全部校区，含待分班和未确定校区的记录。',
    ];
    if (staffId) scopeNotes.push('人员筛选按订单销售、线索和体验负责人、待续费学员销售归属。退费展示当前校区或机构全员数据，个人净成单额不适用。');
    if (missingPriceCount) scopeNotes.push(`有 ${missingPriceCount} 笔已确认成单未登记价格，计入笔数，金额仅合计已登记价格。`);
    if (unlinkedRenewals) scopeNotes.push(`有 ${unlinkedRenewals} 笔续费单无关联学员，仅计订单笔数和已登记金额。`);

    return {
      version: 2, period: { startDate, endDate, timezone: 'Asia/Shanghai' }, generatedAt: new Date().toISOString(),
      staffOptions, scopeNotes,
      caliber: {
        orders: '按成单业务日期汇总已确认订单；续费、续报、renewal 归为续费。总成单额为新签加续费，净成单额扣除已通过退费。',
        experience: '按体验排课日期统计，到场包括已到课、未成单和已成单状态。到场成单率为关联已确认新签的到场体验数除以到场体验数；每次体验计一次，含其后确认的成单。人员筛选按体验负责人归属。本期邀约按统计区间内登记（createdAt）的体验记录条数统计，含已取消状态，不按上课日期或人数去重，与上课转化队列分别计算。',
        renewal: '本期已续费去重学员数 ÷（本期已续费学员与当前待续费学员的去重并集）。本表待续费指当前在读、剩余不超过10课时且未标记不续费，与续费列表一致。尚待跟进为当前待续费名单中本期尚未续费的人数；已续费加尚待跟进等于跟进总人数。历史区间使用查询时的待续费名单。',
        refund: '已通过按确认时间和学员当前校区统计，人数按学员去重，笔数按记录。已取消按取消时间计数，金额不计入通过退费。',
      },
      totals: { grossAmount: gross.toNumber(), netAmount: staffId ? null : gross.minus(approvals.approvedAmount).toNumber(), orderCount: signupCount + renewalCount },
      newSignup: { conversions: signupCount, amount: signupTotal.toNumber(), totalLeads, invitedExperience, scheduledExperience,
        attendedExperience, convertedExperience, conversionRate: percentage(convertedExperience, attendedExperience) },
      renewal: { threshold: RENEWAL_THRESHOLD, count: renewalCount, amount: renewalTotal.toNumber(), renewedStudents: renewedIds.size,
        pendingStudents: pending.length, outstandingStudents, totalEligible, renewalRate: percentage(renewedIds.size, totalEligible) },
      refund: { ...approvals, count: refundedStudents, amount: approvals.approvedAmount },
      daily: [...days].map(([date, row]) => ({ date, newSignupAmount: row.signup.toNumber(), renewalAmount: row.renewal.toNumber(),
        refundAmount: row.refund.toNumber(), netAmount: staffId ? null : row.signup.plus(row.renewal).minus(row.refund).toNumber() })),
    };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 20000 });
}
