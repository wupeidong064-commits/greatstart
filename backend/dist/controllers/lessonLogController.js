"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.lessonLogController = void 0;
const lessonLedger_1 = require("../services/lessonLedger");
const studentAccess_1 = require("../utils/studentAccess");
const database_1 = __importDefault(require("../config/database"));
const scheduleAttendanceService_1 = require("../services/scheduleAttendanceService");
const errorHandler_1 = require("../middleware/errorHandler");
const response_1 = require("../utils/response");
const activityDeductService_1 = require("../services/activityDeductService");
const lessonAddService_1 = require("../services/lessonAddService");
// 辅助函数：获取当前用户信息
const getCurrentUser = (req) => {
    return req.user;
};
exports.lessonLogController = {
    getBalance: async (req, res, next) => {
        try {
            const id = req.query.studentId;
            if (typeof id !== 'string' || !id)
                throw new errorHandler_1.ApiError('请选择学员', 400, 'INVALID_STUDENT');
            const access = (0, studentAccess_1.studentAccess)(req);
            const data = await database_1.default.$transaction(async (tx) => {
                const student = await tx.student.findFirst({ where: { id, AND: [access.where] }, select: { id: true, remainingLessons: true } });
                if (!student)
                    throw new errorHandler_1.ApiError('学员不在当前负责范围', 403, 'FORBIDDEN');
                const ledger = (await (0, lessonLedger_1.readLessonLedgers)(tx, [student], access.campus.organizationId)).get(id);
                return { studentId: id, remainingLessons: student.remainingLessons, ...ledger.balance };
            }, { isolationLevel: 'RepeatableRead' });
            res.set('Cache-Control', 'no-store');
            (0, response_1.sendSuccess)(res, data);
        }
        catch (error) {
            next(error);
        }
    },
    // 获取课时日志列表
    getLessonLogs: async (req, res, next) => {
        try {
            const page = parseInt(req.query.page) || 1;
            const pageSize = parseInt(req.query.pageSize) || 10;
            const type = req.query.type;
            const studentId = req.query.studentId;
            const studentName = typeof req.query.studentName === 'string' ? req.query.studentName.trim() : '';
            const startDate = req.query.startDate;
            const endDate = req.query.endDate;
            const currentUser = getCurrentUser(req);
            const targetOrgId = currentUser?.organizationId;
            if (!targetOrgId) {
                return next(new errorHandler_1.ApiError('未分配机构', 403, 'FORBIDDEN'));
            }
            if (!currentUser?.campusId)
                throw new errorHandler_1.ApiError('未分配校区', 403, 'FORBIDDEN');
            const scopedStudents = await database_1.default.student.findMany({
                where: { AND: [(0, studentAccess_1.studentAccess)(req).where, ...(studentName ? [{ name: { contains: studentName, mode: 'insensitive' } }] : [])] },
                select: { id: true },
            });
            // 日期参数先校验再进查询：非法日期给 400 而不是 500
            const dateOf = (v, label) => {
                if (v == null || v === '')
                    return undefined;
                const d = new Date(String(v));
                if (!Number.isFinite(+d))
                    throw new errorHandler_1.ApiError(`${label}格式无效`, 400, 'INVALID_DATE');
                return d;
            };
            const startAt = dateOf(startDate, '开始日期'), endAt = dateOf(endDate, '结束日期');
            const where = {
                organizationId: targetOrgId,
                AND: [{ studentId: { in: scopedStudents.map(s => s.id) } }, ...(studentId ? [{ studentId }] : [])],
                ...(type ? { type } : {}),
                // 2026-11-08 用户拍板（⑪修订）：增减课台账只看学员管理页的手动增减课——
                // 赠课/手动增课 + 划课（含签到更正返还）；成单入账、退费扣/返、建档初始一律不出现。
                ...(req.query.source === 'manual' ? {
                    OR: [
                        {
                            type: 'add',
                            NOT: [
                                { notes: { startsWith: '新签入账' } },
                                { notes: { startsWith: '续费入账' } },
                                { notes: { startsWith: '退费取消返还' } },
                                { notes: { in: ['建档初始课时'] } },
                            ],
                        },
                        { type: 'deduct' },
                    ],
                } : {}),
                ...((startAt || endAt) ? { createdAt: { ...(startAt ? { gte: startAt } : {}), ...(endAt ? { lte: endAt } : {}) } } : {}),
            };
            const [logs, count] = await database_1.default.$transaction([
                database_1.default.lessonLog.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
                database_1.default.lessonLog.count({ where }),
            ]);
            const scheduleIds = [...new Set((logs || []).map((log) => log.scheduleId).filter(Boolean))];
            const schedules = scheduleIds.length ? await database_1.default.schedule.findMany({
                where: { id: { in: scheduleIds }, organizationId: targetOrgId, campusId: currentUser.campusId },
                select: { id: true, class: { select: { name: true } } },
            }) : [];
            const classNames = new Map(schedules.map(schedule => [schedule.id, schedule.class.name]));
            (0, response_1.sendPaginated)(res, (logs || []).map((log) => ({ ...log, className: classNames.get(log.scheduleId) || null })), page, pageSize, count || 0);
        }
        catch (error) {
            next(error);
        }
    },
    // 创建课时日志
    createLessonLog: async (req, res, next) => {
        next(new errorHandler_1.ApiError('课时流水必须随业务事务生成，请使用增课或场次签到', 409, 'USE_LESSON_TRANSACTION'));
    },
    // 增课
    addLessons: async (req, res, next) => {
        try {
            const actor = getCurrentUser(req);
            if (!actor)
                throw new errorHandler_1.ApiError('未认证', 401, 'UNAUTHORIZED');
            res.status(200).json(await (0, lessonAddService_1.addLessonsIdempotently)(actor, req.body));
        }
        catch (error) {
            next(error);
        }
    },
    // 划课（扣减课时）——统一场次签到（单学员固定 1 课时；更正返还由服务处理）
    deductLessons: async (req, res, next) => {
        try {
            const actor = getCurrentUser(req);
            if (!actor)
                throw new errorHandler_1.ApiError('未认证', 401, 'UNAUTHORIZED');
            const lessons = req.body.lessons ?? 1; // 新前端不再传 lessons：单学员场次签到固定 1
            if (Number(lessons) !== 1)
                throw new errorHandler_1.ApiError('场次签到每次仅支持1课时', 400, 'INVALID_PARAMS');
            (0, response_1.sendSuccess)(res, await (0, scheduleAttendanceService_1.submitScheduleAttendance)(actor, req.body.scheduleId, [{ studentId: req.body.studentId, status: req.body.attendanceStatus || 'present', lessonSource: req.body.lessonSource }]));
        }
        catch (error) {
            next(error);
        }
    },
    // 2026-11-08 用户拍板（⑫）：活动划课——不依赖班级/排课场次的活动课直接扣课时（备注必填，进增减课台账）。
    // 与场次签到分流：不产生考勤、不推进最后上课日期；课消口径按 deduct 计入。
    activityDeduct: async (req, res, next) => {
        try {
            const actor = getCurrentUser(req);
            if (!actor)
                throw new errorHandler_1.ApiError('未认证', 401, 'UNAUTHORIZED');
            res.status(200).json(await (0, activityDeductService_1.deductActivityLessons)(actor, req.body, req.get('Idempotency-Key')));
        }
        catch (error) {
            next(error);
        }
    },
};
//# sourceMappingURL=lessonLogController.js.map