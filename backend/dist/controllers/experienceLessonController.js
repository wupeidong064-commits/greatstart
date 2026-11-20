"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.experienceLessonController = void 0;
const errorHandler_1 = require("../middleware/errorHandler");
const response_1 = require("../utils/response");
const database_1 = __importDefault(require("../config/database"));
const registrationRequestService_1 = require("../services/registrationRequestService");
const experienceRegistrationService_1 = require("../services/experienceRegistrationService");
function withSignupFlag({ _count, ...lesson }) {
    return { ...lesson, hasConfirmedSignup: _count.conversions > 0 };
}
exports.experienceLessonController = {
    // 获取体验课列表
    getExperienceLessons: async (req, res, next) => {
        try {
            const page = parseInt(req.query.page) || 1;
            const pageSize = parseInt(req.query.pageSize) || 10;
            const teachingTeacherId = req.query.teachingTeacherId;
            const assigneeId = req.query.assigneeId;
            const status = req.query.status;
            const unconvertedOnly = req.query.unconvertedOnly === 'true';
            const studentName = req.query.studentName;
            const actor = (0, registrationRequestService_1.registrationActor)(req);
            const filters = {};
            if (teachingTeacherId)
                filters.teachingTeacherId = teachingTeacherId;
            if (assigneeId)
                filters.assigneeId = assigneeId;
            if (studentName)
                filters.studentName = { contains: studentName, mode: 'insensitive' };
            if (unconvertedOnly) {
                // Legacy callers sent status=completed as a tab label; include all attended states.
                Object.assign(filters, (0, experienceRegistrationService_1.unconvertedWhere)(actor));
                const requested = status?.split(',').map(value => value.trim());
                if (requested && !(requested.includes('completed') && requested.every(value => ['completed', 'unconverted'].includes(value)))) {
                    filters.status = { in: requested.filter(value => experienceRegistrationService_1.attendedStatuses.includes(value)) };
                }
            }
            else if (status) {
                filters.status = { in: status.split(',').map(value => value.trim()) };
            }
            const where = { AND: [(0, experienceRegistrationService_1.experienceAccess)(actor), filters] };
            const [lessons, count] = await Promise.all([
                database_1.default.experienceLesson.findMany({
                    where,
                    include: { _count: { select: { conversions: { where: (0, experienceRegistrationService_1.confirmedSignup)(actor) } } } },
                    orderBy: { scheduleDate: 'desc' },
                    skip: (page - 1) * pageSize,
                    take: pageSize,
                }),
                database_1.default.experienceLesson.count({ where }),
            ]);
            (0, response_1.sendPaginated)(res, lessons.map(withSignupFlag), page, pageSize, count);
        }
        catch (error) {
            next(error);
        }
    },
    getAvailableSchedules: async (req, res, next) => {
        try {
            (0, response_1.sendSuccess)(res, await (0, experienceRegistrationService_1.availableSchedules)((0, registrationRequestService_1.registrationActor)(req), req.query.classId));
        }
        catch (error) {
            next(error);
        }
    },
    // 获取单条体验课
    getExperienceLessonById: async (req, res, next) => {
        try {
            const { id } = req.params;
            const actor = (0, registrationRequestService_1.registrationActor)(req);
            const lesson = await database_1.default.experienceLesson.findFirst({ where: { id, ...(0, experienceRegistrationService_1.experienceAccess)(actor) },
                include: { _count: { select: { conversions: { where: (0, experienceRegistrationService_1.confirmedSignup)(actor) } } } } });
            if (!lesson)
                throw new errorHandler_1.ApiError('体验课不存在或不在当前负责范围', 404, 'NOT_FOUND');
            (0, response_1.sendSuccess)(res, withSignupFlag(lesson));
        }
        catch (error) {
            next(error);
        }
    },
    // 创建体验课
    createExperienceLesson: async (req, res, next) => {
        try {
            const result = await (0, experienceRegistrationService_1.registerExperience)(req);
            res.set('Idempotency-Status', result.status);
            (0, response_1.sendSuccess)(res, result.data, '创建成功', result.status === 'replayed' ? 200 : 201);
        }
        catch (error) {
            next(error);
        }
    },
    // 更新体验课
    updateExperienceLesson: async (req, res, next) => {
        try {
            const updated = await (0, experienceRegistrationService_1.editExperience)((0, registrationRequestService_1.registrationActor)(req), req.params.id, req.body);
            (0, response_1.sendSuccess)(res, updated, '更新成功');
        }
        catch (error) {
            next(error);
        }
    },
    // 更新体验课状态
    updateStatus: async (req, res, next) => {
        try {
            if (!req.body.status)
                throw new errorHandler_1.ApiError('请选择体验课状态', 400, 'INVALID_STATUS');
            const updated = await (0, experienceRegistrationService_1.editExperience)((0, registrationRequestService_1.registrationActor)(req), req.params.id, { status: req.body.status });
            (0, response_1.sendSuccess)(res, updated, '状态更新成功');
        }
        catch (error) {
            next(error);
        }
    },
    // 删除体验课
    deleteExperienceLesson: async (req, res, next) => {
        try {
            const { id } = req.params;
            const actor = (0, registrationRequestService_1.registrationActor)(req);
            await database_1.default.$transaction(async (tx) => {
                // The order creation path takes the same row lock before linking a signup.
                await tx.$queryRaw `SELECT id FROM experience_lessons WHERE id = ${id} AND "organizationId" = ${actor.organizationId} FOR UPDATE`;
                const existing = await tx.experienceLesson.findFirst({ where: { id, ...(0, experienceRegistrationService_1.experienceAccess)(actor) }, select: { id: true } });
                if (!existing)
                    throw new errorHandler_1.ApiError('体验课不存在或不在当前负责范围', 404, 'NOT_FOUND');
                if (await tx.conversion.findFirst({ where: { experienceLessonId: id } })) {
                    throw new errorHandler_1.ApiError('体验课已关联成单，请保留转化记录', 409, 'LINKED_CONVERSION');
                }
                await tx.experienceLesson.delete({ where: { id } });
            });
            (0, response_1.sendSuccess)(res, null, '删除成功');
        }
        catch (error) {
            next(error);
        }
    },
    // Order entry includes pending bookings. Keep marketing's attended-only definition separate.
    getConversionCandidates: async (req, res, next) => {
        try {
            const actor = (0, registrationRequestService_1.registrationActor)(req);
            const page = Math.max(1, parseInt(String(req.query.page)) || 1);
            const pageSize = Math.min(100, Math.max(1, parseInt(String(req.query.pageSize)) || 100));
            const where = { AND: [(0, experienceRegistrationService_1.experienceAccess)(actor), {
                        status: { in: experienceRegistrationService_1.signupExperienceStatuses },
                        // Any prior order must be reconciled through the existing order/correction flow.
                        conversions: { none: {} },
                    }] };
            const [lessons, total] = await Promise.all([
                database_1.default.experienceLesson.findMany({ where, orderBy: [{ scheduleDate: 'desc' }, { id: 'asc' }],
                    skip: (page - 1) * pageSize, take: pageSize }),
                database_1.default.experienceLesson.count({ where }),
            ]);
            (0, response_1.sendPaginated)(res, lessons, page, pageSize, total);
        }
        catch (error) {
            next(error);
        }
    },
    // 获取未成单列表（到场但未成单的体验课 + 未到场的体验课）
    getUnconverted: async (req, res, next) => {
        try {
            const actor = (0, registrationRequestService_1.registrationActor)(req);
            // Order entry and AI follow-up also need no-shows. The paginated marketing tab counts attended lessons only.
            const lessons = await database_1.default.experienceLesson.findMany({
                where: { AND: [(0, experienceRegistrationService_1.experienceAccess)(actor), (0, experienceRegistrationService_1.unconvertedWhere)(actor, true)] },
                orderBy: { scheduleDate: 'desc' }, take: 50,
            });
            (0, response_1.sendSuccess)(res, lessons);
        }
        catch (error) {
            next(error);
        }
    },
    // 获取教练转化率统计
    getTeacherConversionStats: async (req, res, next) => {
        try {
            const actor = (0, registrationRequestService_1.registrationActor)(req);
            const teachingTeacherId = req.query.teachingTeacherId;
            const assigneeId = req.query.assigneeId;
            const startDate = req.query.startDate;
            const endDate = req.query.endDate;
            const where = { AND: [(0, experienceRegistrationService_1.experienceAccess)(actor)] };
            // 按上课教练筛选
            if (teachingTeacherId) {
                where.teachingTeacherId = teachingTeacherId;
            }
            // 按负责人筛选
            if (assigneeId) {
                where.assigneeId = assigneeId;
            }
            // 按日期范围筛选（按 scheduleDate）
            if (startDate || endDate) {
                where.scheduleDate = { ...(startDate ? { gte: startDate } : {}), ...(endDate ? { lte: endDate } : {}) };
            }
            const lessons = await database_1.default.experienceLesson.findMany({
                where,
                select: {
                    teachingTeacherId: true,
                    teachingTeacherName: true,
                    status: true,
                    _count: { select: { conversions: { where: (0, experienceRegistrationService_1.confirmedSignup)(actor) } } },
                },
            });
            // 按教练分组统计
            const statsMap = new Map();
            for (const lesson of lessons) {
                const teacherId = lesson.teachingTeacherId;
                const teacherName = lesson.teachingTeacherName || '未知教练';
                if (!teacherId)
                    continue; // 跳过没有教练的记录
                if (!statsMap.has(teacherId)) {
                    statsMap.set(teacherId, {
                        teacherId,
                        teacherName,
                        total: 0,
                        converted: 0,
                    });
                }
                const stats = statsMap.get(teacherId);
                stats.total++;
                if (experienceRegistrationService_1.attendedStatuses.includes(lesson.status) && lesson._count.conversions) {
                    stats.converted++;
                }
            }
            // 转换为数组并计算转化率
            const result = Array.from(statsMap.values()).map(stats => ({
                teacherId: stats.teacherId,
                teacherName: stats.teacherName,
                total: stats.total,
                converted: stats.converted,
                conversionRate: stats.total > 0 ? Math.round((stats.converted / stats.total) * 100) : 0,
            }));
            // 按转化率降序排序
            result.sort((a, b) => b.conversionRate - a.conversionRate);
            (0, response_1.sendSuccess)(res, result);
        }
        catch (error) {
            next(error);
        }
    },
};
//# sourceMappingURL=experienceLessonController.js.map