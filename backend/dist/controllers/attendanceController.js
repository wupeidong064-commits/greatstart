"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.attendanceController = void 0;
const database_1 = __importDefault(require("../config/database"));
const scheduleAttendanceService_1 = require("../services/scheduleAttendanceService");
const attendanceStatsService_1 = require("../services/attendanceStatsService");
const scope_1 = require("../utils/scope");
const errorHandler_1 = require("../middleware/errorHandler");
const response_1 = require("../utils/response");
const classAttendanceReport_1 = require("../services/classAttendanceReport");
const honeymoonReport_1 = require("../services/honeymoonReport");
const currentEnrollment_1 = require("../services/currentEnrollment");
const followupOccurrences_1 = require("../services/followupOccurrences");
// 辅助函数：获取当前用户信息
const getCurrentUser = (req) => {
    return req.user;
};
exports.attendanceController = {
    getAttendances: async (req, res, next) => {
        try {
            const page = parseInt(req.query.page) || 1;
            const pageSize = parseInt(req.query.pageSize) || 10;
            const studentId = req.query.studentId;
            const scheduleId = req.query.scheduleId;
            const classId = req.query.classId;
            const status = req.query.status;
            const date = req.query.date;
            const currentUser = getCurrentUser(req);
            const targetOrgId = currentUser?.organizationId;
            if (!currentUser?.campusId)
                throw new errorHandler_1.ApiError('未分配校区', 403, 'FORBIDDEN');
            if (date && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(+new Date(date))))
                throw new errorHandler_1.ApiError('日期无效', 400, 'INVALID_DATE');
            const scopedSchedules = await database_1.default.schedule.findMany({
                where: {
                    organizationId: targetOrgId,
                    campusId: currentUser.campusId,
                    ...(['teacher', 'coach'].includes(currentUser.role || '')
                        ? { teacherId: currentUser.id }
                        : {}),
                    ...(date
                        ? {
                            startTime: {
                                gte: new Date(date + 'T00:00:00+08:00'),
                                lte: new Date(date + 'T23:59:59.999+08:00'),
                            },
                        }
                        : {}),
                },
                select: { id: true },
            });
            const where = {
                organizationId: targetOrgId,
                scheduleId: {
                    in: scopedSchedules.map((s) => s.id),
                    ...(scheduleId ? { equals: scheduleId } : {}),
                },
                ...(studentId ? { studentId } : {}),
                ...(classId ? { classId } : {}),
                ...(status ? { status } : {}),
            };
            const [attendances, count] = await database_1.default.$transaction([
                database_1.default.attendance.findMany({
                    where,
                    orderBy: { checkInTime: 'desc' },
                    skip: (page - 1) * pageSize,
                    take: pageSize,
                }),
                database_1.default.attendance.count({ where }),
            ]);
            (0, response_1.sendPaginated)(res, attendances || [], page, pageSize, count || 0);
        }
        catch (error) {
            next(error);
        }
    },
    getAttendanceById: async (req, res, next) => {
        try {
            const { id } = req.params;
            const currentUser = getCurrentUser(req);
            const attendance = await database_1.default.attendance.findUnique({ where: { id } });
            if (!attendance) {
                return next(new errorHandler_1.ApiError('出勤记录不存在', 404, 'ATTENDANCE_NOT_FOUND'));
            }
            const schedule = await database_1.default.schedule.findFirst({
                where: {
                    id: attendance.scheduleId,
                    organizationId: currentUser?.organizationId,
                    campusId: currentUser?.campusId,
                    ...(['teacher', 'coach'].includes(currentUser?.role || '')
                        ? { teacherId: currentUser?.id }
                        : {}),
                },
            });
            if (!currentUser?.organizationId ||
                !currentUser.campusId ||
                !schedule ||
                attendance.organizationId !== currentUser.organizationId) {
                return next(new errorHandler_1.ApiError('无权访问', 403, 'FORBIDDEN'));
            }
            (0, response_1.sendSuccess)(res, attendance);
        }
        catch (error) {
            next(error);
        }
    },
    createAttendance: async (req, res, next) => {
        try {
            const actor = getCurrentUser(req);
            if (!actor)
                throw new errorHandler_1.ApiError('未认证', 401, 'UNAUTHORIZED');
            const result = await (0, scheduleAttendanceService_1.submitScheduleAttendance)(actor, req.body.scheduleId, [
                { studentId: req.body.studentId, status: req.body.status || 'present', lessonSource: req.body.lessonSource },
            ]);
            (0, response_1.sendSuccess)(res, result);
        }
        catch (error) {
            next(error);
        }
    },
    batchCheckIn: async (req, res, next) => {
        try {
            const actor = getCurrentUser(req);
            if (!actor)
                throw new errorHandler_1.ApiError('未认证', 401, 'UNAUTHORIZED');
            const entries = req.body.entries ||
                (req.body.studentIds || []).map((studentId) => ({
                    studentId,
                    status: req.body.status || 'present', lessonSource: req.body.lessonSource,
                }));
            (0, response_1.sendSuccess)(res, await (0, scheduleAttendanceService_1.submitScheduleAttendance)(actor, req.body.scheduleId, entries), '签到与课时已同步保存');
        }
        catch (error) {
            next(error);
        }
    },
    updateAttendance: async (req, res, next) => {
        try {
            const actor = getCurrentUser(req);
            if (!actor)
                throw new errorHandler_1.ApiError('未认证', 401, 'UNAUTHORIZED');
            const record = await database_1.default.attendance.findUnique({ where: { id: req.params.id } });
            if (!record)
                throw new errorHandler_1.ApiError('考勤不存在', 404, 'NOT_FOUND');
            const result = await (0, scheduleAttendanceService_1.submitScheduleAttendance)(actor, record.scheduleId, [
                { studentId: record.studentId, status: req.body.status || record.status, lessonSource: req.body.lessonSource },
            ]);
            (0, response_1.sendSuccess)(res, result);
        }
        catch (error) {
            next(error);
        }
    },
    deleteAttendance: async (req, res, next) => {
        next(new errorHandler_1.ApiError('请更正签到状态，保留考勤和课时流水审计记录', 409, 'USE_ATTENDANCE_CORRECTION'));
    },
    getStatistics: async (req, res, next) => {
        try {
            const currentUser = getCurrentUser(req);
            const targetOrgId = currentUser?.organizationId;
            if (!targetOrgId) {
                return next(new errorHandler_1.ApiError('未分配机构', 403, 'FORBIDDEN'));
            }
            if (!currentUser?.campusId)
                throw new errorHandler_1.ApiError('未分配校区', 403, 'FORBIDDEN');
            const schedules = await database_1.default.schedule.findMany({
                where: { organizationId: targetOrgId, campusId: currentUser.campusId },
                select: { id: true },
            });
            const scheduleIds = schedules.map((s) => s.id);
            const where = { organizationId: targetOrgId, scheduleId: { in: scheduleIds } };
            const [total, present, absent, late, leave] = await Promise.all([
                database_1.default.attendance.count({ where }),
                database_1.default.attendance.count({ where: { ...where, status: 'present' } }),
                database_1.default.attendance.count({ where: { ...where, status: 'absent' } }),
                database_1.default.attendance.count({ where: { ...where, status: 'late' } }),
                database_1.default.attendance.count({ where: { ...where, status: 'leave' } }),
            ]);
            const attendanceRate = total > 0 ? Math.round(((present + late) / total) * 100) : 0;
            (0, response_1.sendSuccess)(res, { total, present, absent, late, leave, attendanceRate });
        }
        catch (error) {
            next(error);
        }
    },
    getContinuousLeaveStudents: async (req, res, next) => {
        try {
            const scope = (0, scope_1.resolveScope)(req);
            const { organizationId: targetOrgId, campusId } = scope;
            if (!campusId)
                throw new errorHandler_1.ApiError('未分配校区', 403, 'FORBIDDEN');
            const currentMembership = (0, currentEnrollment_1.currentEnrollmentWhere)(scope);
            // 获取所有活跃学员
            const students = await database_1.default.student.findMany({
                where: {
                    organizationId: targetOrgId, campusId, status: 'active',
                    OR: [{ renewalStatus: null }, { renewalStatus: { not: 'no_renewal' } }],
                    enrollments: { some: currentMembership },
                },
                select: { id: true, name: true, phone: true },
            });
            const continuousLeaveStudents = [];
            for (const student of students || []) {
                // 获取学员的报名信息
                const enrollments = await database_1.default.enrollment.findMany({
                    where: { ...currentMembership, studentId: student.id },
                    select: {
                        classId: true, studentId: true, enrolledAt: true, endedAt: true, status: true,
                        class: { select: { id: true, name: true, code: true, teacherId: true } },
                    },
                });
                if (!enrollments || enrollments.length === 0)
                    continue;
                for (const enrollment of enrollments) {
                    const classInfo = enrollment.class;
                    // 按真实课程顺序计算，补录时间不能改变连续性；整场未点名也计未到。
                    const schedules = await database_1.default.schedule.findMany({
                        where: { organizationId: targetOrgId, campusId, classId: enrollment.classId,
                            ...(0, followupOccurrences_1.followupOccurrenceWhere)() },
                        select: { id: true, classId: true, startTime: true, endTime: true },
                    });
                    const recentAttendances = await database_1.default.attendance.findMany({
                        where: { organizationId: targetOrgId, studentId: student.id, classId: enrollment.classId,
                            scheduleId: { in: schedules.map(s => s.id) } },
                        select: { studentId: true, scheduleId: true, classId: true, status: true, isTemporary: true },
                    });
                    const continuousAbsentCount = (0, attendanceStatsService_1.computeStudentSessions)({ schedules,
                        enrollments: [enrollment], attendances: recentAttendances })
                        .find(row => row.studentId === student.id)?.continuousAbsentCount ?? 0;
                    if (continuousAbsentCount >= 2) {
                        let teacher = null;
                        if (classInfo?.teacherId) {
                            const teacherData = await database_1.default.user.findFirst({
                                where: { id: classInfo.teacherId, organizationId: targetOrgId, campusId },
                                select: { id: true, name: true },
                            });
                            teacher = teacherData;
                        }
                        continuousLeaveStudents.push({
                            id: student.id,
                            studentName: student.name,
                            phone: student.phone,
                            classId: enrollment.classId,
                            className: classInfo?.name,
                            classCode: classInfo?.code,
                            teacher,
                            continuousAbsentCount,
                        });
                    }
                }
            }
            (0, response_1.sendSuccess)(res, continuousLeaveStudents);
        }
        catch (error) {
            console.error('获取连续请假学员错误:', error);
            next(error);
        }
    },
    getHoneymoonAttendance: async (req, res, next) => {
        try {
            const { organizationId, campusId } = (0, scope_1.resolveScope)(req);
            if (!campusId)
                throw new errorHandler_1.ApiError('未分配校区', 403, 'FORBIDDEN');
            const result = await database_1.default.$transaction(tx => (0, honeymoonReport_1.honeymoonReport)(tx, { organizationId, campusId }, req.query), { isolationLevel: 'RepeatableRead', timeout: 20000 });
            (0, response_1.sendSuccess)(res, result);
        }
        catch (error) {
            next(error);
        }
    },
    getLowAttendanceClasses: async (req, res, next) => {
        try {
            const scope = (0, scope_1.resolveScope)(req);
            const orgId = scope.organizationId;
            const threshold = parseInt(req.query.threshold) || 60;
            const campusFilter = (0, scope_1.campusWhere)(scope);
            // 本校区（或机构全部校区）的活跃班级；身份无机构一律拒绝（resolveScope 已保证）
            const classes = await database_1.default.class.findMany({
                where: { organizationId: orgId, status: 'active', ...campusFilter },
                select: {
                    id: true,
                    name: true,
                    code: true,
                    capacity: true,
                    teacherId: true,
                    teacher: { select: { id: true, name: true } },
                },
            });
            const now = new Date();
            const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 3600 * 1000);
            const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 3600 * 1000);
            const classIds = classes.map((c) => c.id);
            const safeClassIds = classIds.length > 0 ? classIds : ['__none__'];
            // 统计窗口内已完成场次（与 attendanceStatsService/AI 工具口径一致：status='completed'）。
            // 原实现把未完成/取消的排课也计入分母，属统计口径失真。
            const schedules = await database_1.default.schedule.findMany({
                where: {
                    organizationId: orgId,
                    classId: { in: safeClassIds },
                    status: 'completed',
                    startTime: { gte: twoWeeksAgo, lte: now },
                },
                select: { id: true, classId: true, startTime: true, endTime: true },
            });
            const scheduleIds = schedules.map((s) => s.id);
            const safeScheduleIds = scheduleIds.length > 0 ? scheduleIds : ['__none__'];
            // 有效报名：未取消/转班（口径同 attendanceStatsService）
            const enrollments = await database_1.default.enrollment.findMany({
                where: { organizationId: orgId, classId: { in: safeClassIds } },
                select: { classId: true, studentId: true, enrolledAt: true, endedAt: true, status: true },
            });
            // 出勤经 scheduleId 归到具体场次，再按场次业务日期分周
            const attendances = await database_1.default.attendance.findMany({
                where: { organizationId: orgId, scheduleId: { in: safeScheduleIds } },
                select: {
                    scheduleId: true,
                    classId: true,
                    studentId: true,
                    status: true,
                    isTemporary: true,
                },
            });
            // 班级历史出勤仍包含当时有效的报名；当前跟进人数只认可仍在读、
            // 未明确不续费且至少在一个有效班级内的学员。
            const currentStudents = await database_1.default.student.findMany({
                where: {
                    organizationId: orgId,
                    ...campusFilter,
                    status: 'active',
                    OR: [{ renewalStatus: null }, { renewalStatus: { not: 'no_renewal' } }],
                    enrollments: { some: (0, currentEnrollment_1.currentEnrollmentWhere)(scope, now) },
                },
                select: { id: true },
            });
            const currentStudentIds = new Set(currentStudents.map((student) => student.id));
            const schedulesByClass = new Map();
            const enrollmentsByClass = new Map();
            const attendancesByClass = new Map();
            for (const s of schedules) {
                const arr = schedulesByClass.get(s.classId) || [];
                arr.push(s);
                schedulesByClass.set(s.classId, arr);
            }
            for (const e of enrollments) {
                const arr = enrollmentsByClass.get(e.classId) || [];
                arr.push(e);
                enrollmentsByClass.set(e.classId, arr);
            }
            for (const a of attendances) {
                const arr = attendancesByClass.get(a.classId) || [];
                arr.push(a);
                attendancesByClass.set(a.classId, arr);
            }
            const lowAttendanceClasses = classes.map((cls) => {
                const clsEnrollments = enrollmentsByClass.get(cls.id) || [];
                const clsSchedules = schedulesByClass.get(cls.id) || [];
                const clsAttendances = attendancesByClass.get(cls.id) || [];
                // 分周桶：场次按业务日期（startTime）分周；出勤经 scheduleId 归场后按场次日期归周。
                // 原“排课数 ÷ 2 假拆分 + 过滤未 select 的 checkInTime”产生的假分周率整体移除。
                const bucketOf = (from, to) => {
                    const sess = clsSchedules.filter((s) => s.startTime >= from && (to === null || s.startTime < to));
                    const sessIds = new Set(sess.map((s) => s.id));
                    return (0, attendanceStatsService_1.computeSessionAttendance)({
                        schedules: sess.map((s) => ({
                            id: s.id,
                            classId: cls.id,
                            startTime: s.startTime,
                            endTime: s.endTime,
                        })),
                        enrollments: clsEnrollments,
                        attendances: clsAttendances.filter((a) => sessIds.has(a.scheduleId)),
                    });
                };
                const overall = bucketOf(twoWeeksAgo, null);
                if (overall.expected === 0)
                    return null; // 两周内无已完成场次 = 无法判断，不进低出勤列表（不伪装 100%）
                const attendanceRate = Math.round((overall.present / overall.expected) * 100);
                if (attendanceRate < threshold) {
                    const week1 = bucketOf(twoWeeksAgo, oneWeekAgo);
                    const week2 = bucketOf(oneWeekAgo, null);
                    const week1Rate = week1.expected > 0 ? Math.round((week1.present / week1.expected) * 100) : null; // 该周无已完成场次=不可计算
                    const week2Rate = week2.expected > 0 ? Math.round((week2.present / week2.expected) * 100) : null;
                    // 低出勤学员数：花名册内应到>0 且出勤率低于阈值的人数。
                    // 口径与「低出勤学员」页一致（已完成场次、入班时间裁剪、相同阈值），班级页人数可在学员明细页逐人复核。
                    const lowAttendanceCount = (0, attendanceStatsService_1.computeStudentSessions)({
                        schedules: clsSchedules,
                        enrollments: clsEnrollments,
                        attendances: clsAttendances,
                    }).filter((f) => currentStudentIds.has(f.studentId) && f.rate !== null && f.rate < threshold).length;
                    return {
                        class: {
                            ...cls,
                            _count: {
                                enrollments: new Set(clsEnrollments
                                    .filter((e) => e.status === 'active' && !e.endedAt)
                                    .map((e) => e.studentId)).size,
                            },
                        },
                        attendanceRate,
                        week1Rate,
                        week2Rate,
                        totalStudents: new Set(clsEnrollments
                            .filter((e) => e.status === 'active' && !e.endedAt)
                            .map((e) => e.studentId)).size,
                        temporaryAttendanceCount: clsAttendances.filter((a) => a.isTemporary).length,
                        lowAttendanceCount,
                    };
                }
                return null;
            });
            // 过滤掉null值
            const result = lowAttendanceClasses.filter(Boolean);
            (0, response_1.sendSuccess)(res, result);
        }
        catch (error) {
            next(error); // 查询失败必须报错，不再返回假空列表
        }
    },
    getClassAttendanceStats: async (req, res, next) => {
        try {
            const { organizationId, campusId } = (0, scope_1.resolveScope)(req);
            if (!campusId)
                throw new errorHandler_1.ApiError('未分配校区', 403, 'FORBIDDEN');
            const { start, end, teacherId, maxAttendanceRate } = (0, classAttendanceReport_1.classAttendanceFilters)(req.query);
            const classId = req.params.classId;
            const rows = await database_1.default.$transaction(async (tx) => {
                const classes = await tx.class.findMany({
                    where: {
                        organizationId,
                        campusId,
                        // Completed occurrences remain reportable after a class pauses or ends.
                        ...(classId ? { id: classId } : {}),
                        ...(teacherId ? { teacherId } : {}),
                    },
                    select: {
                        id: true,
                        name: true,
                        code: true,
                        level: true,
                        teacher: { select: { id: true, name: true } },
                        enrollments: {
                            where: {
                                organizationId,
                                status: 'active',
                                endedAt: null,
                                enrolledAt: { lte: new Date() },
                                student: { organizationId, campusId },
                            },
                            select: { studentId: true },
                        },
                    },
                    orderBy: [{ name: 'asc' }, { id: 'asc' }],
                });
                if (classId && !classes.length)
                    throw new errorHandler_1.ApiError('班级不存在', 404);
                const attendance = await (0, attendanceStatsService_1.querySessionAttendance)({
                    organizationId,
                    campusId,
                    classIds: classes.map((c) => c.id),
                    startISO: start?.toISOString(),
                    endISO: end?.toISOString(),
                }, tx);
                const byClass = new Map(attendance.perClass.map((row) => [row.classId, row]));
                return classes.map((cls) => {
                    const row = byClass.get(cls.id), count = new Set(cls.enrollments.map((e) => e.studentId)).size;
                    return {
                        id: cls.id,
                        name: cls.name,
                        code: cls.code,
                        classId: cls.id,
                        className: cls.name,
                        classCode: cls.code,
                        level: cls.level,
                        teacher: cls.teacher,
                        totalStudents: count,
                        studentCount: count,
                        scheduleCount: row?.sessions ?? 0,
                        totalSchedules: row?.sessions ?? 0,
                        expectedAttendance: row?.expected ?? 0,
                        actualAttendance: row?.present ?? 0,
                        presentCount: row?.present ?? 0,
                        attendanceRate: row?.rate ?? null,
                    };
                }).filter(row => row.expectedAttendance > 0 &&
                    (maxAttendanceRate === undefined || row.attendanceRate !== null && row.attendanceRate <= maxAttendanceRate));
            }, { isolationLevel: 'RepeatableRead', timeout: 20000 });
            (0, response_1.sendSuccess)(res, classId ? rows[0] ?? null : rows);
        }
        catch (error) {
            next(error);
        }
    },
    getClassAttendanceSessions: async (req, res, next) => {
        try {
            const { organizationId, campusId } = (0, scope_1.resolveScope)(req);
            if (!campusId)
                throw new errorHandler_1.ApiError('未分配校区', 403, 'FORBIDDEN');
            const result = await database_1.default.$transaction(tx => (0, classAttendanceReport_1.classAttendanceSessions)(tx, { organizationId, campusId }, req.params.classId, req.query), { isolationLevel: 'RepeatableRead', timeout: 20000 });
            (0, response_1.sendSuccess)(res, result);
        }
        catch (error) {
            next(error);
        }
    },
    // 获取低出勤学员 - 优化版（批量查询）
    getLowAttendanceStudents: async (req, res, next) => {
        try {
            const scope = (0, scope_1.resolveScope)(req), organizationId = scope.organizationId;
            const threshold = Number(req.query.threshold ?? 60);
            if (!Number.isFinite(threshold) || threshold < 0 || threshold > 100)
                throw new errorHandler_1.ApiError('出勤率阈值无效', 400, 'INVALID_THRESHOLD');
            // New pages send Shanghai calendar dates; compatibility pages send an ISO
            // instant. Preserve its timezone instead of cutting off the UTC day.
            const period = (0, classAttendanceReport_1.classAttendanceFilters)(req.query);
            const start = period.start ?? new Date(Date.now() - 30 * 86400000);
            const end = period.end ?? new Date();
            if (!Number.isFinite(+start) || !Number.isFinite(+end) || start > end)
                throw new errorHandler_1.ApiError('日期无效', 400, 'INVALID_DATE');
            const classes = await database_1.default.class.findMany({
                where: {
                    organizationId,
                    ...(0, scope_1.campusWhere)(scope),
                    status: 'active',
                    ...(req.query.teacherId ? { teacherId: String(req.query.teacherId) } : {}),
                },
                select: { id: true, name: true, code: true, teacher: { select: { id: true, name: true } } },
            });
            const ids = classes.map((c) => c.id);
            const schedules = await database_1.default.schedule.findMany({
                where: {
                    organizationId,
                    classId: { in: ids },
                    ...(0, followupOccurrences_1.followupOccurrenceWhere)(),
                    startTime: { gte: start, lte: end },
                },
                select: { id: true, classId: true, startTime: true, endTime: true },
            });
            const [enrollments, attendances] = await Promise.all([
                database_1.default.enrollment.findMany({
                    where: { organizationId, classId: { in: ids } },
                    select: { studentId: true, classId: true, enrolledAt: true, endedAt: true, status: true },
                }),
                database_1.default.attendance.findMany({
                    where: { organizationId, scheduleId: { in: schedules.map((s) => s.id) } },
                    select: {
                        studentId: true,
                        classId: true,
                        scheduleId: true,
                        status: true,
                        isTemporary: true,
                    },
                }),
            ]);
            const facts = (0, attendanceStatsService_1.computeStudentSessions)({ schedules, enrollments, attendances });
            const students = await database_1.default.student.findMany({
                // 历史考勤仍按发生时的有效入班期间计算；跟进名单只保留当前
                // 仍在读且至少有一个有效在班关系的学员，与学员管理「未入班」互斥。
                where: {
                    organizationId,
                    ...(0, scope_1.campusWhere)(scope),
                    status: 'active',
                    OR: [{ renewalStatus: null }, { renewalStatus: { not: 'no_renewal' } }],
                    id: { in: [...new Set(facts.map((f) => f.studentId))] },
                    enrollments: { some: (0, currentEnrollment_1.currentEnrollmentWhere)(scope) },
                },
                select: { id: true, name: true, phone: true },
            });
            const studentMap = new Map(students.map((s) => [s.id, s])), classMap = new Map(classes.map((c) => [c.id, c]));
            const rows = facts
                .filter((f) => f.rate !== null &&
                f.rate < threshold &&
                (req.query.continuousAbsentOnly !== 'true' || f.continuousAbsentCount >= 2))
                .flatMap((f) => {
                const student = studentMap.get(f.studentId), cls = classMap.get(f.classId);
                if (!student || !cls)
                    return [];
                return [
                    {
                        id: student.id,
                        studentName: student.name,
                        phone: student.phone,
                        enrollmentDate: enrollments
                            .filter((e) => e.classId === f.classId && e.studentId === f.studentId)
                            .sort((a, b) => +a.enrolledAt - +b.enrolledAt)[0]?.enrolledAt ?? null,
                        classId: cls.id,
                        className: cls.name,
                        classCode: cls.code,
                        teacher: cls.teacher,
                        scheduleCount: f.expected,
                        presentCount: f.present,
                        absentCount: f.expected - f.present,
                        continuousAbsentCount: f.continuousAbsentCount,
                        attendanceRate: f.rate,
                        isContinuousAbsent: f.continuousAbsentCount >= 2,
                        isTemporary: f.isTemporary,
                    },
                ];
            })
                .sort((a, b) => (a.attendanceRate ?? 0) - (b.attendanceRate ?? 0));
            (0, response_1.sendSuccess)(res, rows);
        }
        catch (error) {
            next(error);
        }
    },
};
//# sourceMappingURL=attendanceController.js.map