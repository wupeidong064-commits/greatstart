"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.classController = void 0;
const database_1 = __importDefault(require("../config/database"));
const errorHandler_1 = require("../middleware/errorHandler");
const response_1 = require("../utils/response");
const node_util_1 = require("node:util");
const client_1 = require("@prisma/client");
const classCourseType_1 = require("../services/classCourseType");
const classScheduleStatus_1 = require("../services/classScheduleStatus");
const scheduleConflicts_1 = require("../services/scheduleConflicts");
const cancelPendingOccurrences_1 = require("../services/cancelPendingOccurrences");
const classScheduleDays_1 = require("../services/classScheduleDays");
const classWeeklyRuleStore_1 = require("../services/classWeeklyRuleStore");
const getCurrentUser = (req) => {
    return req.user;
};
async function validateClassTeacher(tx, organizationId, campusId, teacherId) {
    const teacher = await tx.user.findFirst({ where: { id: teacherId, organizationId, campusId, isActive: true, OR: [{ role: { in: ['coach', 'teacher'] } }, { taughtClasses: { some: { organizationId, campusId, status: { not: 'deleted' } } } }] } });
    if (!teacher)
        throw new errorHandler_1.ApiError('请选择本校区在职老师', 400, 'TEACHER_NOT_FOUND');
}
function classDate(value) {
    return value == null ? value : new Date(value);
}
function classCapacity(value) {
    if (value === undefined)
        return undefined;
    const capacity = typeof value === 'string' && /^[+-]?\d+$/.test(value.trim()) ? Number(value) : value;
    // Zero represents an unlimited class in the enrollment service. Prisma Int maps to PostgreSQL integer.
    if (typeof capacity !== 'number' || !Number.isInteger(capacity) || capacity < 0 || capacity > 2147483647) {
        throw new errorHandler_1.ApiError('班级容量必须为 0 至 2147483647 的整数', 400, 'INVALID_CLASS_CAPACITY');
    }
    return capacity;
}
exports.classController = {
    getClasses: async (req, res, next) => {
        try {
            const actor = req.user, page = Math.max(1, Number(req.query.page) | 0), pageSize = Math.max(1, Math.min(Number(req.query.pageSize || 10) | 0, 1000));
            const search = String(req.query.search || '').trim(), campusId = actor.campusId || String(req.query.campusId || '');
            const where = { organizationId: actor.organizationId, ...(campusId ? { campusId } : {}), status: { not: 'deleted', ...(req.query.status ? { equals: String(req.query.status) } : {}) },
                ...(req.query.teacherId ? { teacherId: String(req.query.teacherId) } : {}), ...(search ? { OR: [{ name: { contains: search } }, { code: { contains: search } }] } : {}) };
            const [classes, count] = await database_1.default.$transaction([database_1.default.class.findMany({ where, skip: (page - 1) * pageSize, take: pageSize, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
                    include: { teacher: { select: { id: true, name: true } }, weeklyRules: { orderBy: [{ weekday: 'asc' }, { startTime: 'asc' }] }, _count: { select: { enrollments: { where: { status: 'active' } } } } } }), database_1.default.class.count({ where })]);
            (0, response_1.sendPaginated)(res, await (0, classScheduleDays_1.withUpcomingScheduleDays)(classes, actor.organizationId), page, pageSize, count);
        }
        catch (error) {
            console.error('获取班级列表异常:', error);
            next(error);
        }
    },
    getClassById: async (req, res, next) => {
        try {
            const { id } = req.params;
            const currentUser = getCurrentUser(req);
            const classData = await database_1.default.class.findUnique({ where: { id }, include: { weeklyRules: { orderBy: [{ weekday: 'asc' }, { startTime: 'asc' }] } } });
            if (!classData || classData.status === 'deleted') {
                return next(new errorHandler_1.ApiError('班级不存在', 404, 'CLASS_NOT_FOUND'));
            }
            // 数据隔离检查
            if (classData.organizationId !== currentUser?.organizationId || (currentUser?.campusId && currentUser.campusId !== classData.campusId)) {
                return next(new errorHandler_1.ApiError('无权访问', 403, 'FORBIDDEN'));
            }
            (0, response_1.sendSuccess)(res, classData);
        }
        catch (error) {
            next(error);
        }
    },
    createClass: async (req, res, next) => {
        try {
            const { name, code, courseType, level, capacity, teacherId, startDate, endDate, description, campusId, } = req.body;
            const currentUser = getCurrentUser(req);
            const organizationId = req.body.organizationId || currentUser?.organizationId;
            const targetCampusId = campusId || currentUser?.campusId;
            if (!organizationId) {
                return next(new errorHandler_1.ApiError('必须指定机构', 400, 'MISSING_ORGANIZATION'));
            }
            if (!currentUser || organizationId !== currentUser.organizationId || (currentUser.campusId && currentUser.campusId !== targetCampusId))
                throw new errorHandler_1.ApiError('无权创建该班级', 403, 'FORBIDDEN');
            if (!name || typeof name !== 'string' || !name.trim())
                throw new errorHandler_1.ApiError('请填写班级名称', 400, 'INVALID_NAME');
            if (code !== undefined && (typeof code !== 'string' || !code.trim()))
                throw new errorHandler_1.ApiError('班级代码无效', 400, 'INVALID_CODE');
            const newClass = await database_1.default.$transaction(async (tx) => {
                await (0, scheduleConflicts_1.lockScheduleWrites)(tx, organizationId);
                // 班级代码由服务端生成（机构内唯一）；兼容仍显式传 code 的导入/旧客户端。
                const finalCode = code === undefined || code === null || code === ''
                    ? await (0, classWeeklyRuleStore_1.generateClassCode)(tx, organizationId)
                    : (await (async () => {
                        if (await tx.class.findFirst({ where: { organizationId, code }, select: { id: true } }))
                            throw new errorHandler_1.ApiError('班级代码已存在', 400, 'CODE_EXISTS');
                        return code;
                    })());
                if (targetCampusId && !await tx.campus.findFirst({ where: { id: targetCampusId, organizationId } }))
                    throw new errorHandler_1.ApiError('校区不存在或不属于该机构', 400, 'CAMPUS_NOT_FOUND');
                if (teacherId)
                    await validateClassTeacher(tx, organizationId, targetCampusId, teacherId);
                const selectedType = await (0, classCourseType_1.selectClassCourseType)(tx, organizationId, courseType);
                const created = await tx.class.create({ data: {
                        organizationId, campusId: targetCampusId, name, code: finalCode, courseType: selectedType,
                        level, capacity: classCapacity(capacity), teacherId, startDate: classDate(startDate), endDate: classDate(endDate), description,
                    } });
                // 建班只保存班级时间规则（常规每周上课规则），从不生成排课、考勤或课时流水。
                await (0, classWeeklyRuleStore_1.replaceClassWeeklyRules)(tx, organizationId, created.id, req.body.weeklyRules);
                return tx.class.findUnique({ where: { id: created.id }, include: { weeklyRules: { orderBy: [{ weekday: 'asc' }, { startTime: 'asc' }] } } });
            });
            (0, response_1.sendSuccess)(res, newClass, '班级创建成功', 201);
        }
        catch (error) {
            next(error);
        }
    },
    updateClass: async (req, res, next) => {
        try {
            const { id } = req.params;
            const { name, code, courseType, level, capacity, teacherId, startDate, endDate, description, status, campusId, scheduleRule, } = req.body;
            const currentUser = getCurrentUser(req);
            if (!currentUser?.organizationId)
                throw new errorHandler_1.ApiError('无权修改该班级', 403, 'FORBIDDEN');
            const organizationId = currentUser.organizationId;
            const updated = await database_1.default.$transaction(async (tx) => {
                await (0, scheduleConflicts_1.lockScheduleWrites)(tx, organizationId);
                const classData = await tx.class.findUnique({ where: { id } });
                if (!classData || classData.status === 'deleted')
                    throw new errorHandler_1.ApiError('班级不存在', 404, 'CLASS_NOT_FOUND');
                if (classData.organizationId !== organizationId || (currentUser.campusId && currentUser.campusId !== classData.campusId))
                    throw new errorHandler_1.ApiError('无权修改该班级', 403, 'FORBIDDEN');
                if (status === 'deleted')
                    throw new errorHandler_1.ApiError('请使用删除班级操作', 400, 'USE_CLASS_DELETE');
                if (status !== undefined && !['active', 'inactive', 'completed'].includes(status))
                    throw new errorHandler_1.ApiError('班级状态无效', 400, 'INVALID_STATUS');
                if (scheduleRule !== undefined && !(0, node_util_1.isDeepStrictEqual)(scheduleRule, classData.scheduleRule ?? null))
                    throw new errorHandler_1.ApiError('排课规则请使用班级排课功能修改，以确保课表同步', 409, 'USE_SCHEDULE_OPERATION');
                if (campusId && (currentUser.campusId && currentUser.campusId !== campusId))
                    throw new errorHandler_1.ApiError('无权修改其他校区', 403, 'FORBIDDEN');
                if (campusId && !await tx.campus.findFirst({ where: { id: campusId, organizationId } }))
                    throw new errorHandler_1.ApiError('校区不存在或不属于该机构', 400, 'CAMPUS_NOT_FOUND');
                if (teacherId)
                    await validateClassTeacher(tx, organizationId, campusId || classData.campusId, teacherId);
                const selectedType = courseType === undefined ? undefined : await (0, classCourseType_1.selectClassCourseType)(tx, organizationId, courseType, classData.courseType);
                if (status !== undefined)
                    await (0, classScheduleStatus_1.syncClassScheduleStatus)(tx, classData, status);
                const updated = await tx.class.update({ where: { id }, data: {
                        name: name || undefined, code, courseType: selectedType, level, capacity: classCapacity(capacity),
                        teacherId, startDate: classDate(startDate), endDate: classDate(endDate), description,
                        status: status || undefined, campusId: campusId || undefined,
                    } });
                // 班级时间规则只写规则表，不动任何已有场次；重排未来课程由每周排课的重排入口显式处理。
                await (0, classWeeklyRuleStore_1.replaceClassWeeklyRules)(tx, organizationId, id, req.body.weeklyRules);
                return tx.class.findUnique({ where: { id }, include: { weeklyRules: { orderBy: [{ weekday: 'asc' }, { startTime: 'asc' }] } } }) ?? updated;
            }, { timeout: 30000 });
            (0, response_1.sendSuccess)(res, updated, '班级更新成功');
        }
        catch (error) {
            console.error('更新班级异常:', error);
            next(error);
        }
    },
    deleteClass: async (req, res, next) => {
        try {
            const { id } = req.params;
            const actor = getCurrentUser(req);
            if (!actor?.organizationId || !actor.campusId || !['manager', 'admin'].includes(actor.role || '')) {
                throw new errorHandler_1.ApiError('只有本校区机构管理员可以永久删除班级', 403, 'FORBIDDEN');
            }
            const { organizationId, campusId } = actor;
            await database_1.default.$transaction(async (tx) => {
                // Resource handovers and timetable changes take this lock first. The row
                // lock also serializes inserts into every table with a class foreign key.
                await (0, scheduleConflicts_1.lockScheduleWrites)(tx, organizationId);
                const scope = { organizationId, campusId };
                const cls = await tx.class.findFirst({ where: { ...scope, id, status: { not: 'deleted' } }, select: { id: true } });
                if (!cls)
                    throw new errorHandler_1.ApiError('班级不存在', 404, 'CLASS_NOT_FOUND');
                await (0, cancelPendingOccurrences_1.cancelPendingOccurrences)(tx, scope, id, { gt: new Date() });
                const rows = await tx.$queryRaw `
          SELECT id FROM classes
          WHERE id = ${id} AND "organizationId" = ${organizationId} AND "campusId" = ${campusId}
          FOR UPDATE
        `;
                if (!rows.length)
                    throw new errorHandler_1.ApiError('班级不存在', 404, 'CLASS_NOT_FOUND');
                const { _count } = await tx.class.findUniqueOrThrow({
                    where: { id },
                    select: { _count: { select: {
                                enrollments: true, schedules: true, attendances: true, conversions: true,
                                experienceLessons: true, transferFrom: true, transferTo: true, refunds: true,
                            } } },
                });
                // These two kinds of history carry class IDs without a class foreign key.
                const deductions = await tx.lessonDeductionRecord.count({ where: { classId: id } });
                const handovers = await tx.resourceTransfer.count({
                    where: { organizationId, transferDetails: { path: ['classes'], array_contains: [id] } },
                });
                if (Object.values(_count).some(count => count > 0) || deductions || handovers) {
                    await tx.class.update({ where: { id }, data: { status: 'deleted' } });
                }
                else {
                    await tx.class.delete({ where: { id } });
                }
            }, { isolationLevel: client_1.Prisma.TransactionIsolationLevel.ReadCommitted, timeout: 30000 });
            (0, response_1.sendSuccess)(res, null, '班级已永久删除');
        }
        catch (error) {
            next(error);
        }
    },
    getExperiencePriorityClasses: async (req, res, next) => {
        try {
            const currentUser = getCurrentUser(req);
            const targetOrgId = currentUser?.organizationId;
            if (!targetOrgId) {
                return next(new errorHandler_1.ApiError('未分配机构', 403, 'FORBIDDEN'));
            }
            // 获取所有活跃班级
            const allClasses = await database_1.default.class.findMany({
                where: { organizationId: targetOrgId, status: 'active', ...(currentUser?.campusId ? { campusId: currentUser.campusId } : {}) },
                include: { teacher: { select: { id: true, name: true } } },
                orderBy: { createdAt: 'desc' },
            });
            const classesWithCounts = await Promise.all(allClasses.map(async (cls) => {
                const currentStudents = await database_1.default.enrollment.count({ where: { organizationId: targetOrgId, classId: cls.id, status: 'active' } });
                const availableSlots = Math.max(0, (cls.capacity || 0) - currentStudents);
                const fillRate = cls.capacity > 0 ? Math.round((currentStudents / cls.capacity) * 100) : 0;
                return {
                    ...cls,
                    currentStudents,
                    availableSlots,
                    fillRate,
                    _count: {
                        enrollments: currentStudents,
                    },
                };
            }));
            // 按空位数排序（空位多的排前面）
            classesWithCounts.sort((a, b) => b.availableSlots - a.availableSlots);
            (0, response_1.sendSuccess)(res, await (0, classScheduleDays_1.withUpcomingScheduleDays)(classesWithCounts, targetOrgId));
        }
        catch (error) {
            next(error);
        }
    },
    // 获取班级学员列表
    getClassStudents: async (req, res, next) => {
        try {
            const actor = getCurrentUser(req);
            if (!actor?.organizationId || !actor.campusId)
                throw new errorHandler_1.ApiError('未分配校区', 403, 'FORBIDDEN');
            const cls = await database_1.default.class.findFirst({ where: { id: req.params.id, organizationId: actor.organizationId, campusId: actor.campusId, status: { not: 'deleted' } } });
            if (!cls)
                throw new errorHandler_1.ApiError('班级不属于当前校区', 403, 'FORBIDDEN');
            if (!['manager', 'admin'].includes(actor.role || '') && (!['teacher', 'coach'].includes(actor.role || '') || cls.teacherId !== actor.id))
                throw new errorHandler_1.ApiError('只能查看本人负责班级的名单', 403, 'FORBIDDEN');
            const enrollments = await database_1.default.enrollment.findMany({ where: { classId: cls.id, organizationId: actor.organizationId, status: 'active', endedAt: null, enrolledAt: { lte: new Date() } }, include: { student: true } });
            (0, response_1.sendSuccess)(res, enrollments.filter(e => e.student.campusId === actor.campusId).map(e => ({ id: e.student.id, name: e.student.name, gender: e.student.gender, phone: e.student.phone, parentPhone: e.student.parentPhone, parentName: e.student.parentName, status: e.student.status, remainingLessons: e.student.remainingLessons, enrollmentId: e.id, enrollmentDate: e.enrolledAt })));
        }
        catch (error) {
            next(error);
        }
    },
};
//# sourceMappingURL=classController.js.map