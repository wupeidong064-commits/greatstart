"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.summarizeNewStudentAttendance = summarizeNewStudentAttendance;
exports.newStudentAttendance = newStudentAttendance;
const client_1 = require("@prisma/client");
const crypto_1 = require("crypto");
const database_1 = __importDefault(require("../config/database"));
const attendanceStatsService_1 = require("./attendanceStatsService");
const followupOccurrences_1 = require("./followupOccurrences");
const RENEWALS = ['续费', '续报', 'renewal'];
const LIMIT = 5000;
const startOfDay = (day) => new Date(day + 'T00:00:00+08:00');
/** Classify by saved student identity and occurrence eligibility, never by a matching name. */
function summarizeNewStudentAttendance(data, start, end, cutoff) {
    const first = new Map(data.firstSales.filter(r => r.studentId && r._min.conversionDate)
        .map(r => [r.studentId, r._min.conversionDate]));
    const students = new Map(data.students.map(s => [s.id, s]));
    const candidateIds = [...new Set(data.orders.map(o => o.studentId).filter((id) => Boolean(id)))];
    const rows = [];
    let attended = 0, notAttended = 0, excluded = 0;
    for (const id of candidateIds) {
        const student = students.get(id), signed = first.get(id);
        if (!student || !signed)
            continue;
        if (signed < start || signed > end) {
            excluded++;
            continue;
        }
        const enrollments = data.enrollments.filter(e => e.studentId === id);
        const schedules = data.schedules.filter(s => s.startTime >= startOfDay(signed) && s.startTime <= cutoff);
        const scheduleIds = new Set(schedules.map(s => s.id));
        const attendances = data.attendances.filter(a => a.studentId === id && scheduleIds.has(a.scheduleId));
        const facts = (0, attendanceStatsService_1.computeSessionAttendance)({ schedules, enrollments, attendances });
        const current = enrollments.filter(e => (0, attendanceStatsService_1.wasEnrolled)(e, cutoff));
        const state = facts.present > 0 ? '已到课' : '暂无到课记录';
        if (facts.present > 0)
            attended++;
        else
            notAttended++;
        rows.push({ 姓名: student.name, 学员标识: id.slice(-8), 首次新签日期: signed,
            到课状态: state, 已到课次数: facts.present, 应到次数: facts.expected,
            当前班级: [...new Set(current.map(e => e.class.name))].join('、') || '未入班',
            负责老师: [...new Set(current.map(e => e.class.teacher?.name).filter(Boolean))].join('、') || '待分配',
            跟进说明: facts.present > 0 ? '已有有效到课或迟到记录' : facts.expected > 0
                ? '已有应到场次，尚无到课记录；请核对请假、缺席或漏点名'
                : current.length ? '已入班，报名后尚无应到场次' : '尚未入班，单独跟进',
            学员状态: student.status });
    }
    const unknownOrders = data.orders.filter(o => !o.studentId || !students.has(o.studentId) || !first.has(o.studentId));
    for (const order of unknownOrders)
        rows.push({ 姓名: order.studentName || '未登记姓名', 学员标识: order.id.slice(-8),
            首次新签日期: order.conversionDate, 到课状态: '待核', 已到课次数: '未知', 应到次数: '未知',
            当前班级: '待核', 负责老师: '待核', 学员状态: '待核',
            跟进说明: !order.studentId ? '成单未关联学员档案，无法核对到课；不计入未到课人数'
                : '学员关联或授权范围待核，未推断到课情况' });
    return { rows, totals: { 期间新签订单数: data.orders.length, 首次新签可核学员数: attended + notAttended,
            已到课学员数: attended, 暂无到课记录学员数: notAttended,
            关联待核成单笔数: unknownOrders.length, 剔除非首次新签学员数: excluded } };
}
async function newStudentAttendance(ctx, params, now = new Date()) {
    if (!ctx.campusId)
        throw new Error('新报到课查询需要明确的授权校区');
    const start = String(params.startDate), end = String(params.endDate);
    const asOfDate = String(params.asOfDate || ctx.today);
    if (asOfDate > ctx.today || start > asOfDate)
        throw new Error('观察截止日期必须介于报名开始日和今天之间');
    const cutoff = new Date(Math.min(+now, +startOfDay(asOfDate) + 86400000 - 1));
    const cohortEnd = end < asOfDate ? end : asOfDate;
    const state = String(params.attendanceState || 'not_attended');
    const scope = { organizationId: ctx.organizationId, campusId: ctx.campusId };
    const data = await database_1.default.$transaction(async (tx) => {
        await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
        const orders = await tx.conversion.findMany({ where: {
                organizationId: ctx.organizationId, approvalStatus: 'confirmed',
                conversionDate: { gte: start, lte: cohortEnd },
                ...(params.classId ? { classId: String(params.classId) } : {}),
                AND: [
                    { OR: [{ courseType: null }, { courseType: { notIn: RENEWALS } }] },
                    { OR: [{ class: scope }, { classId: null, student: scope }, { classId: null, studentId: null, sales: scope }] },
                ],
            }, select: { id: true, studentId: true, studentName: true, conversionDate: true },
            orderBy: [{ conversionDate: 'asc' }, { id: 'asc' }], take: LIMIT + 1 });
        if (orders.length > LIMIT)
            throw new Error('新签订单超过5000笔，请缩小报名期间');
        const ids = [...new Set(orders.map(o => o.studentId).filter((id) => Boolean(id)))];
        const students = await tx.student.findMany({ where: { ...scope, id: { in: ids } }, select: { id: true, name: true, status: true } });
        const allowedIds = students.map(s => s.id);
        const firstSales = await tx.conversion.groupBy({ by: ['studentId'], where: {
                organizationId: ctx.organizationId, studentId: { in: allowedIds }, approvalStatus: 'confirmed',
                OR: [{ courseType: null }, { courseType: { notIn: RENEWALS } }],
            }, _min: { conversionDate: true } });
        const enrollments = await tx.enrollment.findMany({ where: {
                organizationId: ctx.organizationId, studentId: { in: allowedIds }, class: scope,
            }, select: { studentId: true, classId: true, enrolledAt: true, endedAt: true, status: true,
                class: { select: { name: true, teacher: { select: { name: true } } } } } });
        const attendances = await tx.attendance.findMany({ where: {
                organizationId: ctx.organizationId, studentId: { in: allowedIds }, class: scope,
                schedule: { ...scope, ...(0, followupOccurrences_1.followupOccurrenceWhere)(cutoff), startTime: { gte: startOfDay(start), lte: cutoff } },
            }, select: { studentId: true, classId: true, scheduleId: true, status: true, isTemporary: true }, take: LIMIT + 1 });
        const classIds = [...new Set([...enrollments.map(e => e.classId), ...attendances.map(a => a.classId)])];
        const schedules = await tx.schedule.findMany({ where: {
                ...scope, classId: { in: classIds }, ...(0, followupOccurrences_1.followupOccurrenceWhere)(cutoff),
                startTime: { gte: startOfDay(start), lte: cutoff },
            }, select: { id: true, classId: true, startTime: true, endTime: true }, take: LIMIT + 1 });
        if (attendances.length > LIMIT || schedules.length > LIMIT || enrollments.length > LIMIT)
            throw new Error('报名后课务记录超过5000条，请缩小报名期间');
        return { orders, firstSales, students, enrollments, attendances, schedules };
    }, { isolationLevel: client_1.Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 15000 });
    const result = summarizeNewStudentAttendance(data, start, cohortEnd, cutoff);
    const rows = result.rows.filter(r => r.到课状态 === '待核' || state === 'all'
        || (state === 'attended' ? r.到课状态 === '已到课' : r.到课状态 === '暂无到课记录'));
    const caliber = '按首次有效新签业务日期选学员，续费、续报、作废单不计，订单笔数和学员人数分开；'
        + '到课观察延伸到截止日，而非只看报名那周。仅统计本机构/校区已发生或已完成且不晚于观察时间的课次，'
        + '复用有效入班时段与已保存串课口径；present和late计到课，体验课、请假、缺席、补课安排及未来提前点名不当作已到课。'
        + '无课次、未入班与已有应到但未到分列；未关联学员的成单只列待核，不算未到课人数。';
    const missing = result.totals.关联待核成单笔数
        ? ['有成单未能关联本校区学员档案，已单列待核，不能把全部新签笔数称为学员人数。'] : [];
    return { tool: 'new_student_attendance', evidenceId: (0, crypto_1.randomUUID)(), generatedAt: new Date().toISOString(),
        title: '新报学员到课跟进', unit: '人/次', caliber, timeRange: { start, end },
        filters: { startDate: start, endDate: end, asOfDate, attendanceState: state, campusId: ctx.campusId, ...(params.classId ? { classId: params.classId } : {}) },
        columns: ['姓名', '首次新签日期', '到课状态', '已到课次数', '应到次数', '当前班级', '负责老师', '跟进说明']
            .map(key => ({ key, label: key })), rows, totals: result.totals, missing, error: null,
        modelText: JSON.stringify({ 报名期间: { start, end }, 到课观察截止: asOfDate, 汇总: result.totals,
            完整名单: rows.slice(0, 40), 未注入名单行数: Math.max(0, rows.length - 40), 口径: caliber, 提示: missing }).slice(0, 18000) };
}
//# sourceMappingURL=aiNewStudentAttendance.js.map