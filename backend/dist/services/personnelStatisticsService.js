"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.personnelOptions = personnelOptions;
exports.salesPerformance = salesPerformance;
exports.teachingPerformance = teachingPerformance;
const client_1 = require("@prisma/client");
const database_1 = __importDefault(require("../config/database"));
const errorHandler_1 = require("../middleware/errorHandler");
const scope_1 = require("../utils/scope");
const businessPeriod_1 = require("../utils/businessPeriod");
const experienceScope_1 = require("../utils/experienceScope");
const registrationRequestService_1 = require("./registrationRequestService");
const experienceRegistrationService_1 = require("./experienceRegistrationService");
const attendanceStatsService_1 = require("./attendanceStatsService");
const enrollmentFlow_1 = require("./enrollmentFlow");
const consumptionValuation_1 = require("./consumptionValuation");
const isRenewal = (value) => ['renewal', '续费', '续报'].includes(value?.trim().toLowerCase() || '');
function personnelScope(req) {
    const scope = (0, scope_1.resolveScope)(req);
    if (!scope.campusId || req.user?.isPlatformAdmin || !registrationRequestService_1.registrationRoles.includes(req.user?.role || ''))
        throw new errorHandler_1.ApiError('无权查询校区人员统计', 403, 'FORBIDDEN');
    return { organizationId: scope.organizationId, campusId: scope.campusId };
}
function period(req) {
    for (const field of ['startDate', 'endDate']) {
        const value = req.query[field];
        if (value !== undefined && (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)))
            throw new errorHandler_1.ApiError('日期须为有效的 YYYY-MM-DD', 400, 'INVALID_DATE');
    }
    const { start, end } = (0, businessPeriod_1.businessPeriod)(req.query);
    const day = (date) => new Date(+date + 8 * 3600000).toISOString().slice(0, 10);
    return { start, end, dates: { gte: day(start), lte: day(end) } };
}
async function subjects(db, req, campus, kind) {
    const actor = req.user;
    const requested = req.query[kind === 'sales' ? 'salesId' : 'teacherId'];
    if (requested !== undefined && (typeof requested !== 'string' || !requested.trim()))
        throw new errorHandler_1.ApiError('人员筛选无效', 400, 'INVALID_STAFF');
    const manager = ['manager', 'admin'].includes(actor.role);
    if (!manager && requested && requested !== actor.id)
        throw new errorHandler_1.ApiError('只能查看本人的统计', 403, 'FORBIDDEN');
    const users = await db.user.findMany({
        where: { ...campus, id: manager ? requested : actor.id, isActive: true, isPlatformAdmin: false,
            role: { in: registrationRequestService_1.registrationRoles },
            ...(['teaching', 'instructor'].includes(kind) ? { OR: [{ role: { in: ['teacher', 'coach'] } },
                    { taughtClasses: { some: campus } }] } : {}) },
        select: { id: true, name: true, email: true, phone: true, role: true, organizationId: true, campusId: true },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });
    if (requested && !users.length)
        throw new errorHandler_1.ApiError('人员不在当前统计范围', 404, 'STAFF_NOT_FOUND');
    return users.map(u => ({ ...u, name: u.name || u.email?.split('@')[0] || '未知用户' }));
}
function personnelOptions(req) {
    const scope = personnelScope(req);
    if (req.query.kind === 'staff')
        return subjects(database_1.default, req, scope, 'sales');
    if (req.query.kind === 'teaching')
        return subjects(database_1.default, req, scope, 'teaching');
    return subjects(database_1.default, req, scope, 'instructor');
}
function confirmedOrders(campus, dates) {
    return { organizationId: campus.organizationId, approvalStatus: 'confirmed', conversionDate: dates,
        OR: [{ class: campus }, { classId: null, student: campus }, { classId: null, studentId: null, sales: campus }] };
}
function knownAmount(rows) {
    const sum = rows.reduce((total, row) => row.price ? total.plus(row.price) : total, new client_1.Prisma.Decimal(0));
    return { amount: sum.toNumber(), missing: rows.filter(row => row.price === null).length };
}
async function salesPerformance(req) {
    const campus = personnelScope(req), range = period(req);
    return database_1.default.$transaction(async (tx) => {
        const people = await subjects(tx, req, campus, 'sales');
        if (!people.length)
            return [];
        const ids = people.map(p => p.id);
        const ownership = { assigneeId: { in: ids } };
        const createdAt = { gte: range.start, lte: range.end };
        const experience = { ...(0, experienceScope_1.experienceScopeWhere)(campus.organizationId, campus.campusId), ...ownership };
        const [leads, invitations, arrivals, orders] = await Promise.all([
            tx.lead.groupBy({ by: ['assigneeId'], where: { organizationId: campus.organizationId, ...ownership, createdAt }, _count: { _all: true } }),
            tx.experienceLesson.groupBy({ by: ['assigneeId'], where: { ...experience, createdAt }, _count: { _all: true } }),
            tx.experienceLesson.groupBy({ by: ['assigneeId'], where: { ...experience, scheduleDate: range.dates, status: { in: experienceRegistrationService_1.attendedStatuses } }, _count: { _all: true } }),
            tx.conversion.groupBy({ by: ['salesId', 'courseType'], where: { ...confirmedOrders(campus, range.dates), salesId: { in: ids } },
                _count: { _all: true, price: true }, _sum: { price: true } }),
        ]);
        return people.map(person => {
            const own = orders.filter(order => order.salesId === person.id);
            function summarize(groups) {
                const count = groups.reduce((n, row) => n + row._count._all, 0);
                const missing = groups.reduce((n, row) => n + row._count._all - row._count.price, 0);
                const amount = groups.reduce((n, row) => n.plus(row._sum.price ?? 0), new client_1.Prisma.Decimal(0)).toNumber();
                return { count, missing, amount };
            }
            const signed = summarize(own.filter(group => !isRenewal(group.courseType)));
            const renewed = summarize(own.filter(group => isRenewal(group.courseType)));
            const total = summarize(own);
            return { teacherId: person.id, teacherName: person.name, role: person.role,
                addedCount: leads.find(row => row.assigneeId === person.id)?._count._all ?? 0,
                invitationCount: invitations.find(row => row.assigneeId === person.id)?._count._all ?? 0,
                attendanceCount: arrivals.find(row => row.assigneeId === person.id)?._count._all ?? 0,
                orderCount: total.count, orderAmount: total.amount, missingPriceCount: total.missing,
                newOrderCount: signed.count, newOrderAmount: signed.amount, newMissingPriceCount: signed.missing,
                renewalOrderCount: renewed.count, renewalOrderAmount: renewed.amount, renewalMissingPriceCount: renewed.missing };
        });
    }, { isolationLevel: client_1.Prisma.TransactionIsolationLevel.RepeatableRead });
}
async function teachingPerformance(req) {
    const campus = personnelScope(req), range = period(req), now = new Date();
    return database_1.default.$transaction(async (tx) => {
        const people = await subjects(tx, req, campus, 'teaching');
        if (!people.length)
            return [];
        const ids = people.map(p => p.id);
        const orders = confirmedOrders(campus, range.dates);
        const [classes, personalOrders] = await Promise.all([
            tx.class.findMany({ where: { ...campus, teacherId: { in: ids } }, select: {
                    id: true, teacherId: true, status: true,
                    enrollments: { where: { organizationId: campus.organizationId, student: campus }, select: {
                            classId: true, studentId: true, status: true, enrolledAt: true, endedAt: true,
                            student: { select: { status: true, renewalStatus: true, noRenewalDate: true } },
                        } },
                    schedules: { where: { ...campus, status: 'completed', startTime: { gte: range.start, lte: range.end } }, select: {
                            id: true, classId: true, startTime: true, endTime: true, attendances: {
                                where: { organizationId: campus.organizationId, student: campus, class: campus }, select: {
                                    studentId: true, scheduleId: true, classId: true, status: true, isTemporary: true
                                },
                            },
                        } },
                } }),
            tx.conversion.findMany({ where: { ...orders, salesId: { in: ids } },
                select: { salesId: true, price: true, courseType: true, studentId: true, student: { select: { organizationId: true, campusId: true } } } }),
        ]);
        const valuation = await (0, consumptionValuation_1.readConsumptionValuation)(tx, campus, classes.flatMap(cls => cls.schedules.map(s => s.id)));
        return people.map(person => {
            const responsible = classes.filter(cls => cls.teacherId === person.id);
            const activeClasses = responsible.filter(cls => cls.status === 'active');
            const enrollments = responsible.flatMap(cls => cls.enrollments);
            const current = activeClasses.flatMap(cls => cls.enrollments).filter(row => row.status === 'active' && row.enrolledAt <= now && (!row.endedAt || row.endedAt > now));
            const studentCount = new Set(current.map(row => row.studentId)).size;
            const baseCount = new Set(current.filter(row => row.student.status === 'active').map(row => row.studentId)).size;
            const nonRenewals = new Set(current.filter(row => row.student.renewalStatus === 'no_renewal' &&
                row.student.noRenewalDate && row.student.noRenewalDate >= range.start && row.student.noRenewalDate <= range.end).map(row => row.studentId)).size;
            const flow = (0, enrollmentFlow_1.enrollmentFlow)(enrollments, range.start, range.end);
            const net = flow.added === null || flow.removedTotal === null ? null : flow.added - flow.removedTotal;
            const schedules = responsible.flatMap(cls => cls.schedules);
            const attendance = (0, attendanceStatsService_1.computeSessionAttendance)({ schedules, enrollments, attendances: schedules.flatMap(s => s.attendances) });
            const own = personalOrders.filter(order => order.salesId === person.id), total = knownAmount(own);
            const localPeople = own.filter(order => order.student?.organizationId === campus.organizationId && order.student.campusId === campus.campusId);
            const renewalPeople = new Set(localPeople.filter(order => isRenewal(order.courseType)).map(order => order.studentId)).size;
            const monetary = (0, consumptionValuation_1.consumptionMoney)(schedules.reduce((sum, schedule) => {
                const amount = valuation.bySchedule.get(schedule.id);
                return { cents: sum.cents + (amount?.cents ?? 0), unpricedLessons: sum.unpricedLessons + (amount?.unpricedLessons ?? 0) };
            }, { cents: 0, unpricedLessons: 0 }));
            return { teacherId: person.id, teacherName: person.name, role: person.role, classCount: activeClasses.length,
                studentCount, baseCount, attendanceRate: attendance.rate, expectedAttendance: attendance.expected, actualAttendance: attendance.present,
                enrollmentStart: flow.startCount, enrollmentAdded: flow.added, enrollmentEnded: flow.removedTotal,
                enrollmentEnd: flow.endCount, enrollmentNet: net, historyAvailable: flow.historyAvailable,
                historyNote: flow.historyAvailable ? '按当前主责班级的实际报名期间计，每班每学员分别统计。' :
                    '按当前主责班级归属，有 ' + flow.unknownPeriods + ' 条历史报名缺少有效起止时间，无法核定区间流转。',
                baseCountChange: net, newRecruits: flow.added, deletedRoster: flow.removedTotal, recalled: null, recalledAvailable: false, nonRenewals,
                personalNewRecruits: new Set(localPeople.filter(order => !isRenewal(order.courseType)).map(order => order.studentId)).size,
                unlinkedNewOrderCount: own.filter(order => !order.studentId && !isRenewal(order.courseType)).length,
                renewalRate: baseCount ? Math.round(renewalPeople / baseCount * 100) : null,
                ...monetary, consumptionAmount: monetary.actualConsumptionAmount, consumptionEstimated: false,
                consumptionNote: '当前主责班级内场次的实际净核销金额，含代课场次；不含无场次活动。购买批次先买先用，赠课0元，取消按原金额返还。',
                totalOrderAmount: total.amount, missingPriceCount: total.missing };
        });
    }, { isolationLevel: client_1.Prisma.TransactionIsolationLevel.RepeatableRead });
}
//# sourceMappingURL=personnelStatisticsService.js.map