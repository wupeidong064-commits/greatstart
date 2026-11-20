"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.courseController = void 0;
const crypto_1 = require("crypto");
const database_1 = __importDefault(require("../config/database"));
const errorHandler_1 = require("../middleware/errorHandler");
const response_1 = require("../utils/response");
const classCourseType_1 = require("../services/classCourseType");
const scheduleConflicts_1 = require("../services/scheduleConflicts");
function requireCourseActor(req, write = false) {
    const actor = req.user;
    if (!actor?.organizationId || (write && !['admin', 'manager'].includes(actor.role || '')))
        throw new errorHandler_1.ApiError('无权管理课程类型', 403, 'FORBIDDEN');
    if (req.body?.organizationId !== undefined && req.body.organizationId !== actor.organizationId)
        throw new errorHandler_1.ApiError('不能跨机构管理课程类型', 403, 'FORBIDDEN');
    return actor;
}
function textField(value, label, maxLength) {
    if (typeof value !== 'string' || !value.trim() || value.trim().length > maxLength)
        throw new errorHandler_1.ApiError(`${label}不能为空且不能超过${maxLength}字`, 400, 'INVALID_COURSE');
    return value.trim();
}
function courseFields(body, creating = false) {
    const fields = {};
    if (creating || body.name !== undefined)
        fields.name = textField(body.name, '课程名称', 100);
    if (body.code !== undefined)
        fields.code = textField(body.code, '课程编码', 100);
    if (body.description !== undefined) {
        if (body.description !== null && (typeof body.description !== 'string' || body.description.length > 2000))
            throw new errorHandler_1.ApiError('课程说明无效或超过2000字', 400, 'INVALID_COURSE');
        fields.description = body.description;
    }
    for (const key of ['duration', 'price']) {
        if (body[key] === undefined)
            continue;
        const raw = body[key];
        if ((typeof raw !== 'number' && typeof raw !== 'string') || String(raw).trim() === '')
            throw new errorHandler_1.ApiError(key === 'duration' ? '课时长度无效' : '价格无效', 400, 'INVALID_COURSE');
        const value = Number(raw);
        if (!Number.isFinite(value) || (key === 'duration' ? !Number.isInteger(value) || value <= 0 || value > 1440 : value < 0))
            throw new errorHandler_1.ApiError(key === 'duration' ? '课时长度须为1至1440分钟的整数' : '价格须为非负数', 400, 'INVALID_COURSE');
        fields[key] = value;
    }
    if (body.isActive !== undefined) {
        if (typeof body.isActive !== 'boolean')
            throw new errorHandler_1.ApiError('启用状态无效', 400, 'INVALID_COURSE');
        fields.isActive = body.isActive;
    }
    return fields;
}
async function scopedCourse(tx, organizationId, id) {
    const course = await tx.course.findUnique({ where: { id } });
    if (!course)
        throw new errorHandler_1.ApiError('课程类型不存在', 404, 'COURSE_NOT_FOUND');
    if (course.organizationId !== organizationId)
        throw new errorHandler_1.ApiError('无权访问该课程类型', 403, 'FORBIDDEN');
    return course;
}
// The institution lock serializes directory writes with schedule creation/deactivation.
async function ensureUnique(tx, organizationId, fields, excludeId) {
    const scope = { organizationId, ...(excludeId ? { id: { not: excludeId } } : {}) };
    if (fields.name !== undefined && await tx.course.findFirst({ where: { ...scope, name: { equals: fields.name, mode: 'insensitive' } } }))
        throw new errorHandler_1.ApiError('课程名称已存在（含已停用课程）', 400, 'NAME_EXISTS');
    if (fields.code !== undefined && await tx.course.findFirst({ where: { ...scope, code: { equals: fields.code, mode: 'insensitive' } } }))
        throw new errorHandler_1.ApiError('课程代码已存在（含已停用课程）', 400, 'CODE_EXISTS');
}
exports.courseController = {
    getCourses: async (req, res, next) => {
        try {
            const actor = requireCourseActor(req);
            if (req.query.capability === 'schedule_course_selection') {
                (0, response_1.sendSuccess)(res, { scheduleCourseSelection: true });
                return;
            }
            const page = Math.max(1, Math.floor(Number(req.query.page) || 1));
            const pageSize = Math.min(1000, Math.max(1, Math.floor(Number(req.query.pageSize) || 10)));
            const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
            const isActive = req.query.isActive === 'true' ? true : req.query.isActive === 'false' ? false : undefined;
            const where = { organizationId: actor.organizationId,
                ...(isActive !== undefined ? { isActive } : {}),
                ...(search ? { OR: [{ name: { contains: search, mode: 'insensitive' } }, { code: { contains: search, mode: 'insensitive' } }] } : {}),
            };
            const [courses, count] = await database_1.default.$transaction([
                database_1.default.course.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], skip: (page - 1) * pageSize, take: pageSize }),
                database_1.default.course.count({ where }),
            ]);
            (0, response_1.sendPaginated)(res, courses, page, pageSize, count);
        }
        catch (error) {
            next(error);
        }
    },
    getCourseById: async (req, res, next) => {
        try {
            const actor = requireCourseActor(req);
            (0, response_1.sendSuccess)(res, await scopedCourse(database_1.default, actor.organizationId, req.params.id));
        }
        catch (error) {
            next(error);
        }
    },
    createCourse: async (req, res, next) => {
        try {
            const actor = requireCourseActor(req, true);
            const fields = courseFields(req.body, true);
            const course = await database_1.default.$transaction(async (tx) => {
                await (0, scheduleConflicts_1.lockScheduleWrites)(tx, actor.organizationId);
                await ensureUnique(tx, actor.organizationId, fields);
                return tx.course.create({ data: { ...fields, organizationId: actor.organizationId, name: fields.name, code: fields.code ?? `COURSE-${(0, crypto_1.randomUUID)()}` } });
            });
            (0, response_1.sendSuccess)(res, course, '课程类型创建成功', 201);
        }
        catch (error) {
            next(error);
        }
    },
    updateCourse: async (req, res, next) => {
        try {
            const actor = requireCourseActor(req, true);
            const fields = courseFields(req.body);
            const course = await database_1.default.$transaction(async (tx) => {
                await (0, scheduleConflicts_1.lockScheduleWrites)(tx, actor.organizationId);
                const previous = await scopedCourse(tx, actor.organizationId, req.params.id);
                await ensureUnique(tx, actor.organizationId, fields, req.params.id);
                if (fields.name !== undefined && fields.name !== previous.name) {
                    await (0, classCourseType_1.renameClassCourseType)(tx, previous, fields.name);
                }
                return tx.course.update({ where: { id: req.params.id }, data: fields });
            });
            (0, response_1.sendSuccess)(res, course, '课程类型更新成功');
        }
        catch (error) {
            next(error);
        }
    },
    deleteCourse: async (req, res, next) => {
        try {
            const actor = requireCourseActor(req, true);
            await database_1.default.$transaction(async (tx) => {
                await (0, scheduleConflicts_1.lockScheduleWrites)(tx, actor.organizationId);
                await scopedCourse(tx, actor.organizationId, req.params.id);
                await tx.course.update({ where: { id: req.params.id }, data: { isActive: false } });
            });
            (0, response_1.sendSuccess)(res, null, '课程类型已停用，历史排课保留');
        }
        catch (error) {
            next(error);
        }
    },
};
//# sourceMappingURL=courseController.js.map