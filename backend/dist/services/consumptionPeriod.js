"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.readConsumptionData = readConsumptionData;
exports.periodCourseTypes = periodCourseTypes;
const client_1 = require("@prisma/client");
const database_1 = __importDefault(require("../config/database"));
const scheduleAttendanceService_1 = require("./scheduleAttendanceService");
const consumptionValuation_1 = require("./consumptionValuation");
// A later correction belongs to the original activity's business date. Refund restoration,
// free lessons and order credits have their own ledger meanings and do not reverse a deduction.
async function activityNet(tx, scope, start, end) {
    const [row] = await tx.$queryRaw `
    WITH debits AS (
      SELECT l.id, l."studentId", l.lessons FROM lesson_logs l
      JOIN students s ON s.id = l."studentId" AND s."organizationId" = ${scope.organizationId} AND s."campusId" = ${scope.campusId}
      WHERE l."organizationId" = ${scope.organizationId} AND l."scheduleId" IS NULL AND l.type = 'deduct'
        AND (l."businessDate" BETWEEN ${(0, scheduleAttendanceService_1.businessDate)(start)} AND ${(0, scheduleAttendanceService_1.businessDate)(end)}
          OR (l."businessDate" IS NULL AND l."createdAt" BETWEEN ${start.toISOString()}::timestamp AND ${end.toISOString()}::timestamp))
    )
    SELECT COALESCE((SELECT SUM(lessons) FROM debits),0) - COALESCE((
      SELECT SUM(r.lessons) FROM lesson_logs r JOIN debits d ON r."reversalOfId" = d.id AND r."studentId" = d."studentId"
      WHERE r."organizationId" = ${scope.organizationId} AND r."scheduleId" IS NULL AND r.type = 'add'
    ),0) AS net`;
    return Number(row.net);
}
async function readConsumptionData(scope, start, end) {
    return database_1.default.$transaction(async (tx) => {
        const [allClasses, catalog, students, schedules, enrollments, activity] = await Promise.all([
            tx.class.findMany({ where: scope, select: { id: true, status: true, courseType: true, capacity: true } }),
            tx.course.findMany({ where: { organizationId: scope.organizationId, isActive: true }, select: { name: true } }),
            tx.student.findMany({ where: scope, select: { id: true, status: true, archivedAt: true, createdAt: true, renewalStatus: true, noRenewalDate: true } }),
            tx.schedule.findMany({ where: { ...scope, class: scope, status: 'completed', startTime: { gte: start, lte: end } },
                select: { id: true, classId: true, startTime: true, endTime: true, attendances: {
                        where: { organizationId: scope.organizationId, student: scope, class: scope },
                        select: { studentId: true, scheduleId: true, classId: true, status: true, isTemporary: true },
                    } } }),
            tx.enrollment.findMany({ where: { organizationId: scope.organizationId, class: scope, student: scope },
                select: { classId: true, studentId: true, enrolledAt: true, endedAt: true, status: true } }),
            activityNet(tx, scope, start, end),
        ]);
        const sessionLogs = await tx.lessonLog.groupBy({ by: ['type'], where: { organizationId: scope.organizationId,
                student: scope, scheduleId: { in: schedules.map(s => s.id) }, type: { in: ['deduct', 'add'] } }, _sum: { lessons: true } });
        const sessionNet = sessionLogs.reduce((n, row) => n + (row.type === 'deduct' ? 1 : -1) * (row._sum.lessons ?? 0), 0);
        const valuation = await (0, consumptionValuation_1.readConsumptionValuation)(tx, scope, schedules.map(s => s.id), { start, end });
        return { allClasses, catalog, students, schedules, enrollments, sessionNet, activityLessons: activity, valuation };
    }, { isolationLevel: client_1.Prisma.TransactionIsolationLevel.RepeatableRead });
}
function periodCourseTypes(classes, catalog, enrollments, start, end) {
    const confirmed = new Set(), uncertain = new Set();
    for (const row of enrollments) {
        if (row.enrolledAt > end)
            continue;
        if (row.endedAt && row.endedAt < row.enrolledAt) {
            uncertain.add(row.classId);
        }
        else if (!row.endedAt && row.status !== 'active' && row.enrolledAt < start) {
            uncertain.add(row.classId);
        }
        else if (!row.endedAt || (row.endedAt > start && row.endedAt > row.enrolledAt)) {
            confirmed.add(row.classId);
        }
    }
    const counts = new Map(catalog.map(course => [course.name.trim(), 0]));
    const unknownTypes = new Set();
    for (const cls of classes) {
        const type = cls.courseType.trim() || '未分类';
        if (confirmed.has(cls.id))
            counts.set(type, (counts.get(type) || 0) + 1);
        else if (uncertain.has(cls.id)) {
            unknownTypes.add(type);
            if (!counts.has(type))
                counts.set(type, 0);
        }
    }
    const rows = [...counts].map(([name, count]) => ({ name, count: unknownTypes.has(name) ? null : count }))
        .sort((a, b) => (b.count ?? -1) - (a.count ?? -1) || a.name.localeCompare(b.name, 'zh-CN'));
    return { rows, totalClasses: unknownTypes.size ? null : confirmed.size, historyAvailable: !unknownTypes.size,
        note: '按所选区间有有效报名的不同班级计，同班只计一次。停课及已删除班级保留历史；分类使用班级当前留存的课程类型。' +
            (unknownTypes.size ? '部分历史报名缺少有效结束日期，受影响类型及合计待核对。' : '') };
}
//# sourceMappingURL=consumptionPeriod.js.map