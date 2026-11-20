"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.parentController = void 0;
const scheduleConflicts_1 = require("../services/scheduleConflicts");
const errorHandler_1 = require("../middleware/errorHandler");
const database_1 = __importDefault(require("../config/database"));
const response_1 = require("../utils/response");
const klass = { id: true, name: true, code: true, courseType: true };
const person = { id: true, name: true };
function owned(req) {
    const u = req.user;
    if (u.role !== 'parent' || !u.organizationId)
        throw new errorHandler_1.ApiError('未绑定校区', 403);
    return {
        organizationId: u.organizationId,
        ...(u.campusId ? { campusId: u.campusId } : {}),
        parentLinks: { some: { parentId: u.id } },
    };
}
async function child(req) {
    const s = await database_1.default.student.findFirst({
        where: { ...owned(req), id: req.params.studentId },
        select: { id: true, organizationId: true, campusId: true },
    });
    if (!s)
        throw new errorHandler_1.ApiError('未绑定该学员', 403, 'CHILD_NOT_BOUND');
    return s;
}
const paging = (req) => {
    const page = Math.max(1, Number(req.query.page) | 0), pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize || 20) | 0));
    return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
};
function windowOf(req) {
    const date = (v, end) => {
        if (!v)
            return undefined;
        const str = String(v), d = new Date(str.length === 10 ? str + (end ? 'T23:59:59.999+08:00' : 'T00:00:00+08:00') : str);
        if (isNaN(+d))
            throw new errorHandler_1.ApiError('日期无效', 400);
        return d;
    };
    const gte = date(req.query.startDate, false), lte = date(req.query.endDate, true);
    if (gte && lte && gte > lte)
        throw new errorHandler_1.ApiError('日期顺序无效', 400);
    return { gte, lte };
}
const run = (fn) => (req, res, next) => fn(req, res).catch(next);
exports.parentController = {
    getLinkedStudents: run(async (req, res) => (0, response_1.sendSuccess)(res, await database_1.default.student.findMany({
        where: owned(req),
        orderBy: { name: 'asc' },
        select: {
            id: true,
            name: true,
            campusId: true,
            remainingLessons: true,
            purchasedLessons: true,
            consumedLessons: true,
            enrollments: {
                where: { status: 'active', class: { status: { not: 'deleted' } } },
                select: {
                    id: true,
                    status: true,
                    class: { select: { ...klass, teacher: { select: person } } },
                },
            },
        },
    }))),
    getStudentSchedules: run(async (req, res) => {
        const s = await child(req), { page, pageSize, skip, take } = paging(req), dates = windowOf(req), status = typeof req.query.status === 'string' ? req.query.status : undefined;
        const enrolled = await database_1.default.enrollment.findMany({
            where: { studentId: s.id, organizationId: s.organizationId, status: 'active' },
            select: { classId: true, enrolledAt: true },
        });
        const where = {
            organizationId: s.organizationId,
            campusId: s.campusId,
            NOT: (0, scheduleConflicts_1.hiddenTimetableOccurrence)(),
            OR: enrolled.map((e) => ({ classId: e.classId, endTime: { gte: e.enrolledAt } })),
            startTime: { ...dates, gte: dates.gte ?? (!status && !dates.lte ? new Date() : undefined) },
            status,
        };
        const [rows, total] = await database_1.default.$transaction([
            database_1.default.schedule.findMany({
                where,
                select: {
                    id: true,
                    status: true,
                    classroom: true,
                    startTime: true,
                    endTime: true,
                    class: { select: klass },
                    teacher: { select: person },
                    campus: { select: person },
                },
                orderBy: [{ startTime: 'asc' }, { id: 'asc' }],
                skip,
                take,
            }),
            database_1.default.schedule.count({ where }),
        ]);
        (0, response_1.sendPaginated)(res, rows, page, pageSize, total);
    }),
    getStudentAttendances: run(async (req, res) => {
        const s = await child(req), { page, pageSize, skip, take } = paging(req), where = {
            studentId: s.id,
            organizationId: s.organizationId,
            schedule: { campusId: s.campusId, startTime: windowOf(req) },
            status: typeof req.query.status === 'string' ? req.query.status : undefined,
        };
        const [rows, counts] = await Promise.all([
            database_1.default.attendance.findMany({
                where,
                select: {
                    id: true,
                    status: true,
                    checkInTime: true,
                    class: { select: klass },
                    schedule: { select: { id: true, startTime: true, endTime: true, classroom: true } },
                },
                orderBy: [{ schedule: { startTime: 'desc' } }, { id: 'asc' }],
                skip,
                take,
            }),
            database_1.default.attendance.groupBy({ by: ['status'], where, _count: true }),
        ]);
        const stats = {
            present: 0,
            late: 0,
            absent: 0,
            leave: 0,
            ...Object.fromEntries(counts.map((v) => [v.status, v._count])),
        };
        const total = counts.reduce((n, r) => n + r._count, 0);
        (0, response_1.sendSuccess)(res, {
            data: rows,
            pagination: { page, pageSize, total },
            stats: {
                ...stats,
                attendanceRate: total ? Math.round(((stats.present + stats.late) / total) * 10000) / 100 : null,
            },
        });
    }),
    // 2026-11-08 用户拍板：家长端「缴费记录」改读成单表（新签+续费成交记录，与经营侧口径一致）。
    // 收款登记（Payment）不再是家长账目来源；只展示已确认成单，不暴露内部备注与支付状态。
    getStudentPayments: run(async (req, res) => {
        const s = await child(req), { page, pageSize, skip, take } = paging(req);
        // conversionDate 为 YYYY-MM-DD 业务日字符串，窗口按字符串比较（词序即日期序）
        const dateParam = (v, label) => {
            if (v == null || v === '')
                return undefined;
            const str = String(v);
            if (!/^\d{4}-\d{2}-\d{2}$/.test(str))
                throw new errorHandler_1.ApiError(`${label}格式应为 YYYY-MM-DD`, 400, 'INVALID_DATE');
            return str;
        };
        const startDate = dateParam(req.query.startDate, '开始日期'), endDate = dateParam(req.query.endDate, '结束日期');
        if (startDate && endDate && startDate > endDate)
            throw new errorHandler_1.ApiError('日期顺序无效', 400, 'INVALID_DATE');
        const where = {
            studentId: s.id,
            organizationId: s.organizationId,
            approvalStatus: 'confirmed',
            conversionDate: { ...(startDate ? { gte: startDate } : {}), ...(endDate ? { lte: endDate } : {}) },
        };
        // 家长名下学员的成单量级小：一次取回全量，分页与汇总都在内存计算（避开 groupBy 的类型/往返成本）
        const all = await database_1.default.conversion.findMany({
            where,
            orderBy: [{ conversionDate: 'desc' }, { id: 'asc' }],
            select: { id: true, price: true, totalLessons: true, courseType: true, conversionDate: true, className: true },
        });
        const RENEWAL = ['续费', 'renewal', '续报'];
        const byType = {};
        let totalAmount = 0, totalLessonsSum = 0;
        for (const c of all) {
            const key = c.courseType && RENEWAL.includes(c.courseType) ? '续费' : '新签';
            const bucket = (byType[key] || (byType[key] = { amount: 0, count: 0 }));
            bucket.amount += Number(c.price) || 0;
            bucket.count += 1;
            totalAmount += Number(c.price) || 0;
            totalLessonsSum += c.totalLessons || 0;
        }
        (0, response_1.sendSuccess)(res, {
            data: all.slice(skip, skip + take),
            pagination: { page, pageSize, total: all.length },
            summary: {
                totalAmount,
                totalLessons: totalLessonsSum,
                paymentByType: Object.fromEntries(Object.entries(byType).map(([k, v]) => [k, v.amount])),
                countByType: Object.fromEntries(Object.entries(byType).map(([k, v]) => [k, v.count])),
            },
        });
    }),
    getStudentLessonLogs: run(async (req, res) => {
        const s = await child(req), { page, pageSize, skip, take } = paging(req), where = { studentId: s.id, organizationId: s.organizationId };
        const [rows, total] = await database_1.default.$transaction([
            database_1.default.lessonLog.findMany({
                where,
                select: {
                    id: true,
                    type: true,
                    lessons: true,
                    businessDate: true,
                    createdAt: true,
                    reversalOfId: true,
                    scheduleId: true,
                },
                orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
                skip,
                take,
            }),
            database_1.default.lessonLog.count({ where }),
        ]);
        (0, response_1.sendPaginated)(res, rows, page, pageSize, total);
    }),
    getStudentNotices: run(async (req, res) => {
        const s = await child(req), { page, pageSize, skip, take } = paging(req), where = { studentId: s.id };
        const [rows, total] = await database_1.default.$transaction([
            database_1.default.parentNotice.findMany({
                where,
                select: { id: true, title: true, body: true, occurredAt: true },
                orderBy: [{ occurredAt: 'desc' }, { id: 'asc' }],
                skip,
                take,
            }),
            database_1.default.parentNotice.count({ where }),
        ]);
        (0, response_1.sendPaginated)(res, rows, page, pageSize, total);
    }),
};
//# sourceMappingURL=parentController.js.map