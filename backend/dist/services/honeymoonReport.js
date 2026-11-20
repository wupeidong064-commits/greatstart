"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.honeymoonReport = honeymoonReport;
const errorHandler_1 = require("../middleware/errorHandler");
const classAttendanceReport_1 = require("./classAttendanceReport");
const attendanceStatsService_1 = require("./attendanceStatsService");
const currentEnrollment_1 = require("./currentEnrollment");
const followupOccurrences_1 = require("./followupOccurrences");
const DAY = 86400000;
const renewals = ['renewal', '续费', '续报'];
const dateText = (date) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai' }).format(date);
const dayNumber = (day) => Date.parse(day + 'T00:00:00Z') / DAY;
const startOfDay = (day) => new Date(day + 'T00:00:00+08:00');
const classSelect = { id: true, name: true, code: true, teacherId: true,
    teacher: { select: { id: true, name: true, organizationId: true, campusId: true } } };
/** One student, one first confirmed new-sale date, one 30-calendar-day period. */
async function honeymoonReport(tx, scope, query, now = new Date()) {
    const { teacherId, maxAttendanceRate } = (0, classAttendanceReport_1.classAttendanceFilters)(query);
    if (query.unassignedOnly !== undefined && !['true', 'false'].includes(String(query.unassignedOnly)))
        throw new errorHandler_1.ApiError('未入班筛选值无效', 400, 'INVALID_UNASSIGNED_FILTER');
    const unassignedOnly = query.unassignedOnly === 'true';
    if (query.startDate !== undefined || query.endDate !== undefined)
        throw new errorHandler_1.ApiError('蜜月期按首次新签日起30天统计，不使用自选日期范围', 400, 'INVALID_PERIOD');
    const today = dateText(now), earliest = new Date((dayNumber(today) - 29) * DAY).toISOString().slice(0, 10);
    const newSale = { organizationId: scope.organizationId, approvalStatus: 'confirmed',
        student: { ...scope, status: 'active', OR: [{ renewalStatus: null }, { renewalStatus: { not: 'no_renewal' } }] },
        OR: [{ courseType: null }, { courseType: { notIn: renewals } }] };
    // A recent re-enrollment/new order is only a candidate. The all-time earliest
    // valid new-sale date below prevents renewal or transfer from restarting day 1.
    const candidates = await tx.conversion.findMany({ where: { ...newSale, conversionDate: { gte: earliest, lte: today } },
        distinct: ['studentId'], select: { studentId: true } });
    const candidateIds = candidates.map(c => c.studentId).filter((id) => id !== null);
    const first = candidateIds.length ? await tx.conversion.groupBy({ by: ['studentId'],
        where: { ...newSale, studentId: { in: candidateIds } }, _min: { conversionDate: true } }) : [];
    const starts = new Map(first.filter(r => r.studentId && r._min.conversionDate &&
        /^\d{4}-\d{2}-\d{2}$/.test(r._min.conversionDate) && Number.isFinite(dayNumber(r._min.conversionDate)) &&
        r._min.conversionDate >= earliest && r._min.conversionDate <= today)
        .map(r => [r.studentId, r._min.conversionDate]));
    const ids = [...starts.keys()];
    const period = { start: earliest, end: today };
    const caliberNote = '首次有效新签报名日起30个北京时间自然日，调班和续费不重置；未入班按学员管理的当前有效班级判定，按出勤率筛选时仍保留，单独跟进，不计算出勤率及高低出勤人数。已入班按课程日期和有效入班期间统计，出勤及迟到算实到；已结束但未点名、漏点名的场次计未到，补划后按最新结果更新；尚无课次不参与平均值。已确定不续费、流失及归档学员不列入本名单。';
    const empty = () => ({ students: [], stats: { total: 0, avgAttendanceRate: null, highAttendance: 0, lowAttendance: 0, unratedCount: 0, unassignedCount: 0 }, period, caliberNote });
    if (!ids.length)
        return empty();
    const windowStart = startOfDay(earliest);
    const [students, enrollments, guests] = await Promise.all([
        tx.student.findMany({ where: { ...scope, id: { in: ids }, status: 'active' }, select: { id: true, name: true, phone: true, parentPhone: true,
                enrollments: { where: (0, currentEnrollment_1.currentEnrollmentWhere)(scope, now), select: { id: true } } } }),
        tx.enrollment.findMany({ where: { organizationId: scope.organizationId, studentId: { in: ids }, class: scope },
            select: { classId: true, studentId: true, enrolledAt: true, endedAt: true, status: true, class: { select: classSelect } } }),
        tx.attendance.findMany({ where: { organizationId: scope.organizationId, studentId: { in: ids }, isTemporary: true, class: scope,
                schedule: { ...scope, ...(0, followupOccurrences_1.followupOccurrenceWhere)(now), startTime: { gte: windowStart, lte: now } } },
            select: { studentId: true, classId: true, schedule: { select: { startTime: true } }, class: { select: classSelect } } }),
    ]);
    const classes = new Map();
    for (const row of [...enrollments, ...guests]) {
        if (!teacherId || row.class.teacherId === teacherId)
            classes.set(row.classId, row.class);
    }
    const classIds = [...classes.keys()];
    const schedules = classIds.length ? await tx.schedule.findMany({ where: { ...scope, classId: { in: classIds }, ...(0, followupOccurrences_1.followupOccurrenceWhere)(now),
            startTime: { gte: windowStart, lte: now } }, select: { id: true, classId: true, startTime: true, endTime: true } }) : [];
    const attendances = schedules.length ? await tx.attendance.findMany({ where: { organizationId: scope.organizationId,
            studentId: { in: ids }, scheduleId: { in: schedules.map(s => s.id) }, classId: { in: classIds } },
        select: { studentId: true, classId: true, scheduleId: true, status: true, isTemporary: true } }) : [];
    const teacherOf = (c) => c.teacher?.organizationId === scope.organizationId && c.teacher.campusId === scope.campusId
        ? { id: c.teacher.id, name: c.teacher.name } : null;
    const rows = students.map(student => {
        const isUnassigned = student.enrollments.length === 0;
        if (unassignedOnly && !isUnassigned)
            return null;
        const registrationDate = starts.get(student.id), since = startOfDay(registrationDate);
        const owned = isUnassigned ? [] : enrollments.filter(e => e.studentId === student.id && classes.has(e.classId) && e.enrolledAt <= now &&
            (e.endedAt ? e.endedAt > since : e.status === 'active'));
        const ownClassIds = new Set(owned.map(e => e.classId));
        for (const guest of guests)
            if (!isUnassigned && guest.studentId === student.id && classes.has(guest.classId) && guest.schedule.startTime >= since)
                ownClassIds.add(guest.classId);
        if (teacherId && !ownClassIds.size)
            return null;
        const facts = (0, attendanceStatsService_1.computeStudentSessions)({ schedules: schedules.filter(s => ownClassIds.has(s.classId) && s.startTime >= since),
            enrollments: owned, attendances: attendances.filter(a => a.studentId === student.id && ownClassIds.has(a.classId)) });
        const byClass = new Map(facts.map(f => [f.classId, f]));
        const details = [...ownClassIds].map(id => {
            const c = classes.get(id), fact = byClass.get(id);
            const expectedAttendance = fact?.expected ?? 0, actualAttendance = fact?.present ?? 0;
            return { classId: c.id, className: c.name, classCode: c.code, teacher: teacherOf(c), expectedAttendance, actualAttendance,
                absentCount: Math.max(0, expectedAttendance - actualAttendance), attendanceRate: fact?.rate ?? null };
        }).sort((a, b) => a.className.localeCompare(b.className) || a.classId.localeCompare(b.classId));
        const expectedAttendance = details.reduce((n, d) => n + d.expectedAttendance, 0), actualAttendance = details.reduce((n, d) => n + d.actualAttendance, 0);
        const teachers = [...new Map(details.filter(d => d.teacher).map(d => [d.teacher.id, d.teacher])).values()];
        const daysPassed = dayNumber(today) - dayNumber(registrationDate);
        return { id: student.id, studentName: student.name, phone: student.phone || student.parentPhone, registrationDate, enrollmentDate: registrationDate, isUnassigned,
            daysPassed, daysRemaining: 30 - daysPassed, classId: details.length === 1 ? details[0].classId : null,
            className: details.map(d => d.className).join('、') || '未入班', classCode: details.length === 1 ? details[0].classCode : null,
            teacher: teachers.length === 1 ? teachers[0] : null, teachers, classes: details, expectedAttendance, actualAttendance,
            absentCount: Math.max(0, expectedAttendance - actualAttendance),
            attendanceRate: expectedAttendance > 0 ? Math.round(actualAttendance / expectedAttendance * 100) : null };
    }).filter((row) => row !== null)
        .filter(row => maxAttendanceRate === undefined || row.isUnassigned || row.attendanceRate !== null && row.attendanceRate <= maxAttendanceRate)
        .sort((a, b) => b.registrationDate.localeCompare(a.registrationDate) || a.id.localeCompare(b.id));
    const rated = rows.filter(r => r.attendanceRate !== null);
    return { students: rows, stats: { total: rows.length,
            avgAttendanceRate: rated.length ? Math.round(rated.reduce((n, r) => n + r.attendanceRate, 0) / rated.length) : null,
            highAttendance: rated.filter(r => r.attendanceRate >= 80).length, lowAttendance: rated.filter(r => r.attendanceRate < 60).length,
            unratedCount: rows.length - rated.length, unassignedCount: rows.filter(r => r.isUnassigned).length }, period, caliberNote };
}
//# sourceMappingURL=honeymoonReport.js.map