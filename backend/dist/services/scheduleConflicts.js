"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CLASS_PAUSED = void 0;
exports.lockScheduleWrites = lockScheduleWrites;
exports.hiddenTimetableOccurrence = hiddenTimetableOccurrence;
exports.normalizeClassroom = normalizeClassroom;
exports.validateScheduleTime = validateScheduleTime;
exports.parseScheduleTime = parseScheduleTime;
exports.assertScheduleAvailable = assertScheduleAvailable;
exports.findCoexistingSessions = findCoexistingSessions;
const errorHandler_1 = require("../middleware/errorHandler");
const studentProfileFields_1 = require("../utils/studentProfileFields");
/** One lock for all timetable mutations in an institution. Always acquire before
 * occurrence locks. Attendance only acquires occurrence -> student locks, never
 * this lock. The two-int advisory namespace is separate from existing bigint locks. */
async function lockScheduleWrites(tx, organizationId) {
    await tx.$executeRaw `SELECT pg_advisory_xact_lock(1735352947, hashtext(${organizationId}))`;
}
exports.CLASS_PAUSED = 'class_paused';
// Inactive/deleted classes can retain scheduled rows carrying attendance or ledger history.
function hiddenTimetableOccurrence() {
    const future = { gt: new Date() };
    return { OR: [
            { status: exports.CLASS_PAUSED },
            { startTime: future, class: { status: 'deleted' } },
            { startTime: future, status: { in: ['scheduled', 'cancelled', 'rescheduled'] }, class: { status: 'inactive' } },
        ] };
}
function normalizeClassroom(value) {
    if (value === undefined || value === null)
        return null;
    if (typeof value !== 'string')
        throw new errorHandler_1.ApiError('教室名称无效', 400, 'INVALID_CLASSROOM');
    return value.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLocaleLowerCase('en-US') || null;
}
function validateScheduleTime(start, end) {
    if (!Number.isFinite(+start) || !Number.isFinite(+end) || end <= start) {
        throw new errorHandler_1.ApiError('排课时间无效', 400, 'INVALID_TIME');
    }
}
function parseScheduleTime(value) {
    try {
        const parsed = (0, studentProfileFields_1.parseProfileDate)(value);
        if (parsed)
            return parsed;
    }
    catch (error) {
        if (!(error instanceof errorHandler_1.ApiError))
            throw error;
    }
    throw new errorHandler_1.ApiError('排课时间无效', 400, 'INVALID_TIME');
}
const localClock = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
    weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});
function describeInterval(start, end) {
    return `${localClock.format(start)} 至 ${localClock.format(end)}`;
}
/** Caller must hold lockScheduleWrites in the same transaction through the write.
 * Returns a reusable occurrence only for an explicitly allowed exact create retry.
 * Existing rooms are normalized at comparison time, without rewriting history. */
async function assertScheduleAvailable(tx, slot, options = {}) {
    validateScheduleTime(slot.startTime, slot.endTime);
    const room = normalizeClassroom(slot.classroom);
    const overlaps = await tx.schedule.findMany({
        where: {
            organizationId: slot.organizationId,
            status: { notIn: ['cancelled', 'rescheduled'] },
            NOT: hiddenTimetableOccurrence(),
            startTime: { lt: slot.endTime },
            endTime: { gt: slot.startTime },
            ...(options.excludeIds?.length ? { id: { notIn: options.excludeIds } } : {}),
        },
        orderBy: [{ startTime: 'asc' }, { id: 'asc' }],
    });
    let reusable;
    for (const row of overlaps) {
        const sameClass = row.classId === slot.classId;
        const sameTeacher = !!slot.teacherId && row.teacherId === slot.teacherId;
        const sameRoom = !!room && row.campusId === slot.campusId && normalizeClassroom(row.classroom) === room;
        if (!sameClass && !sameTeacher && !sameRoom)
            continue;
        if (options.allowExactReuse && !reusable && row.status === 'scheduled' && sameClass &&
            row.campusId === slot.campusId && row.teacherId === slot.teacherId &&
            (options.inheritCourse || row.courseId === (slot.courseId ?? null)) &&
            +row.startTime === +slot.startTime && +row.endTime === +slot.endTime &&
            normalizeClassroom(row.classroom) === room) {
            reusable = row;
            continue;
        }
        const resource = sameClass ? '班级' : sameTeacher ? '教师' : '教室';
        const details = row.campusId === slot.campusId
            ? await tx.schedule.findUnique({ where: { id: row.id }, select: {
                    class: { select: { name: true } }, teacher: { select: { name: true } },
                } })
            : null;
        const className = details ? `「${details.class.name}」` : '其他校区班级';
        const resourceName = sameTeacher && !sameClass && details?.teacher ? `教师「${details.teacher.name}」`
            : sameRoom && !sameClass && !sameTeacher ? `教室「${row.classroom}」` : resource;
        const existing = describeInterval(row.startTime, row.endTime);
        const requested = describeInterval(slot.startTime, slot.endTime);
        throw new errorHandler_1.ApiError(`重复排课：该时间已有班级——拟排 ${requested} 与${className}已有场次 ${existing} 的${resourceName}时间重叠（北京时间）`, 409, 'SCHEDULE_CONFLICT');
    }
    return reusable;
}
async function findCoexistingSessions(tx, slot, options = {}) {
    const overlaps = await tx.schedule.findMany({
        where: {
            organizationId: slot.organizationId,
            status: { notIn: ['cancelled', 'rescheduled'] },
            startTime: { lt: slot.endTime },
            endTime: { gt: slot.startTime },
            ...(options.excludeIds?.length ? { id: { notIn: options.excludeIds } } : {}),
        },
        include: { class: { select: { name: true, status: true } }, teacher: { select: { name: true } } },
        orderBy: [{ startTime: 'asc' }, { id: 'asc' }],
    });
    const notes = [];
    for (const row of overlaps) {
        // 本班 scheduled 重叠=完全相同场次复用对象本身；class_paused 的本班场次仍提醒（该时段停着课）。
        if (row.classId === slot.classId && row.status === 'scheduled')
            continue;
        notes.push({
            scheduleId: row.id, startTime: row.startTime, endTime: row.endTime,
            className: row.class.name, teacherName: row.teacher?.name ?? null,
            sessionStatus: row.status, classStatus: row.class.status,
        });
    }
    return notes;
}
//# sourceMappingURL=scheduleConflicts.js.map