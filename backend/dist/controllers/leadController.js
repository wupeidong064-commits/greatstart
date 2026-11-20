"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.leadController = void 0;
const errorHandler_1 = require("../middleware/errorHandler");
const response_1 = require("../utils/response");
const database_1 = __importDefault(require("../config/database"));
const leadScope_1 = require("../utils/leadScope");
const studentProfileFields_1 = require("../utils/studentProfileFields");
const registrationRequestService_1 = require("../services/registrationRequestService");
// 辅助函数：检查是否为管理员
const isAdminOrManager = (user) => {
    const role = user?.role;
    return role === 'admin' || role === 'manager';
};
exports.leadController = {
    // 获取线索列表
    getLeads: async (req, res, next) => {
        try {
            const page = parseInt(req.query.page) || 1;
            const pageSize = parseInt(req.query.pageSize) || 10;
            const assigneeId = req.query.assigneeId;
            const status = req.query.status;
            const followupState = req.query.followupState || 'all';
            if (!['all', 'pending', 'converted', 'lost'].includes(String(followupState)))
                throw new errorHandler_1.ApiError('线索查看范围无效', 400, 'INVALID_FOLLOWUP_STATE');
            const search = req.query.search;
            const lastContactAtStart = req.query.lastContactAtStart;
            const lastContactAtEnd = req.query.lastContactAtEnd;
            const currentUser = req.user;
            const targetOrgId = currentUser?.organizationId;
            if (!targetOrgId) {
                return next(new errorHandler_1.ApiError('未分配机构', 403, 'FORBIDDEN'));
            }
            const where = await (0, leadScope_1.leadCampusWhere)(targetOrgId, currentUser?.campusId);
            const conditions = [];
            if (followupState === 'pending')
                conditions.push({ status: { notIn: ['converted', 'lost'] } });
            else if (followupState === 'converted' || followupState === 'lost')
                conditions.push({ status: followupState });
            // 非管理人员只能看到自己负责的线索（防止翘单）
            if (!isAdminOrManager(currentUser) && currentUser?.id) {
                where.assigneeId = currentUser.id;
            }
            else if (assigneeId) {
                // 管理人员可以按负责人筛选
                where.assigneeId = assigneeId;
            }
            if (status) {
                where.status = status;
            }
            // 搜索关键词（姓名或联系方式）
            if (search) {
                conditions.push({ OR: [
                        { customerName: { contains: search, mode: 'insensitive' } },
                        { contact: { contains: search, mode: 'insensitive' } },
                    ] });
            }
            // 最近联系时间范围筛选
            if (lastContactAtStart || lastContactAtEnd) {
                where.lastContactAt = {};
                if (lastContactAtStart)
                    where.lastContactAt.gte = new Date(lastContactAtStart);
                if (lastContactAtEnd)
                    where.lastContactAt.lte = new Date(lastContactAtEnd);
            }
            if (conditions.length)
                where.AND = conditions;
            const [leads, count] = await Promise.all([
                database_1.default.lead.findMany({
                    where,
                    orderBy: { createdAt: 'desc' },
                    skip: (page - 1) * pageSize,
                    take: pageSize,
                }),
                database_1.default.lead.count({ where }),
            ]);
            (0, response_1.sendPaginated)(res, leads || [], page, pageSize, count || 0);
        }
        catch (error) {
            next(error);
        }
    },
    // 获取单条线索
    getLeadById: async (req, res, next) => {
        try {
            const { id } = req.params;
            const currentUser = req.user;
            const lead = await database_1.default.lead.findFirst({ where: { id, ...await (0, leadScope_1.leadCampusWhere)(currentUser?.organizationId, currentUser?.campusId) } });
            if (!lead) {
                return next(new errorHandler_1.ApiError('线索不存在', 404, 'NOT_FOUND'));
            }
            if (lead.organizationId !== currentUser?.organizationId) {
                return next(new errorHandler_1.ApiError('无权访问', 403, 'FORBIDDEN'));
            }
            if (!isAdminOrManager(currentUser) && lead.assigneeId !== currentUser?.id)
                throw new errorHandler_1.ApiError('无权访问其他人线索', 403, 'FORBIDDEN');
            (0, response_1.sendSuccess)(res, lead);
        }
        catch (error) {
            next(error);
        }
    },
    // 创建线索
    createLead: async (req, res, next) => {
        try {
            const actor = (0, registrationRequestService_1.registrationActor)(req);
            const body = req.body;
            const key = (0, registrationRequestService_1.requestKey)(req);
            const command = {
                customerName: (0, registrationRequestService_1.textValue)(body.customerName, '客户姓名', true), age: (0, studentProfileFields_1.validateRecordedAge)(body.age),
                contact: (0, registrationRequestService_1.textValue)(body.contact, '联系方式', true), source: (0, registrationRequestService_1.textValue)(body.source, '来源'),
                notes: (0, registrationRequestService_1.textValue)(body.notes, '备注'),
                assigneeId: (0, registrationRequestService_1.managesRegistrations)(actor) ? (0, registrationRequestService_1.textValue)(body.assigneeId, '负责人') || actor.id : actor.id,
            };
            const result = await (0, registrationRequestService_1.runRegistration)({ actor, key, operation: 'lead', command,
                authorizeReplay: (tx, id) => (0, registrationRequestService_1.accessibleLead)(tx, actor, id),
                create: async (tx) => {
                    const assignee = await (0, registrationRequestService_1.scopedStaff)(tx, actor, command.assigneeId);
                    return tx.lead.create({ data: { ...command, organizationId: actor.organizationId, createdById: actor.id,
                            assigneeName: assignee.name, status: 'new' } });
                },
            });
            res.set('Idempotency-Status', result.status);
            (0, response_1.sendSuccess)(res, result.data, '创建成功', result.status === 'replayed' ? 200 : 201);
        }
        catch (error) {
            next(error);
        }
    },
    // 更新线索
    updateLead: async (req, res, next) => {
        try {
            const { id } = req.params;
            const currentUser = req.user;
            const existing = await database_1.default.lead.findFirst({ where: { id, ...await (0, leadScope_1.leadCampusWhere)(currentUser?.organizationId, currentUser?.campusId) } });
            if (!existing) {
                return next(new errorHandler_1.ApiError('线索不存在', 404, 'NOT_FOUND'));
            }
            // 检查数据隔离权限
            if (existing.organizationId !== currentUser?.organizationId) {
                return next(new errorHandler_1.ApiError('无权修改', 403, 'FORBIDDEN'));
            }
            // 非管理人员只能修改自己负责的线索（防止翘单）
            if (!isAdminOrManager(currentUser) && existing.assigneeId !== currentUser?.id) {
                return next(new errorHandler_1.ApiError('您只能修改自己负责的线索', 403, 'FORBIDDEN'));
            }
            // 非管理人员不能修改负责人（防止翘单）
            const allowed = ['customerName', 'age', 'contact', 'source', 'assigneeId', 'status', 'starred', 'notes', 'lastContactAt'];
            let updateData = Object.fromEntries(allowed.filter(key => req.body[key] !== undefined).map(key => [key, req.body[key]]));
            if (!isAdminOrManager(currentUser)) {
                delete updateData.assigneeId;
                delete updateData.assigneeName;
            }
            const actor = (0, registrationRequestService_1.registrationActor)(req);
            const updated = await database_1.default.$transaction(async (tx) => {
                const nextAssignee = updateData.assigneeId !== undefined ? updateData.assigneeId : existing.assigneeId;
                const nextStatus = updateData.status !== undefined ? updateData.status : existing.status;
                if (nextAssignee && !['converted', 'lost'].includes(nextStatus)) {
                    const staff = await (0, registrationRequestService_1.scopedStaff)(tx, actor, nextAssignee);
                    if (updateData.assigneeId !== undefined)
                        updateData.assigneeName = staff.name;
                }
                const changed = await tx.lead.updateMany({ where: { id, organizationId: actor.organizationId, assigneeId: existing.assigneeId, updatedAt: existing.updatedAt }, data: updateData });
                if (!changed.count)
                    throw new errorHandler_1.ApiError('线索已变化，请刷新后重试', 409, 'RESOURCE_CHANGED');
                return tx.lead.findUniqueOrThrow({ where: { id } });
            });
            (0, response_1.sendSuccess)(res, updated, '更新成功');
        }
        catch (error) {
            next(error);
        }
    },
    // 更新最近联系时间
    updateLastContactTime: async (req, res, next) => {
        try {
            const { id } = req.params;
            const currentUser = req.user;
            const existing = await database_1.default.lead.findFirst({ where: { id, ...await (0, leadScope_1.leadCampusWhere)(currentUser?.organizationId, currentUser?.campusId) } });
            if (!existing) {
                return next(new errorHandler_1.ApiError('线索不存在', 404, 'NOT_FOUND'));
            }
            // 检查数据隔离权限
            if (existing.organizationId !== currentUser?.organizationId) {
                return next(new errorHandler_1.ApiError('无权修改', 403, 'FORBIDDEN'));
            }
            // 非管理人员只能更新自己负责的线索（防止翘单）
            if (!isAdminOrManager(currentUser) && existing.assigneeId !== currentUser?.id) {
                return next(new errorHandler_1.ApiError('您只能更新自己负责的线索', 403, 'FORBIDDEN'));
            }
            const updated = await database_1.default.$transaction(async (tx) => {
                const changed = await tx.lead.updateMany({
                    where: { id, organizationId: existing.organizationId, assigneeId: existing.assigneeId, updatedAt: existing.updatedAt },
                    data: { lastContactAt: new Date() },
                });
                if (changed.count !== 1)
                    throw new errorHandler_1.ApiError('线索已被修改或移交，请刷新后重试', 409, 'RESOURCE_CHANGED');
                return tx.lead.findUniqueOrThrow({ where: { id } });
            });
            (0, response_1.sendSuccess)(res, updated, '更新成功');
        }
        catch (error) {
            next(error);
        }
    },
    // 删除线索
    deleteLead: async (req, res, next) => {
        try {
            const { id } = req.params;
            const currentUser = req.user;
            const existing = await database_1.default.lead.findFirst({ where: { id, ...await (0, leadScope_1.leadCampusWhere)(currentUser?.organizationId, currentUser?.campusId) } });
            if (!existing) {
                return next(new errorHandler_1.ApiError('线索不存在', 404, 'NOT_FOUND'));
            }
            // 检查数据隔离权限
            if (existing.organizationId !== currentUser?.organizationId) {
                return next(new errorHandler_1.ApiError('无权删除', 403, 'FORBIDDEN'));
            }
            // 非管理人员只能删除自己负责的线索（防止翘单）
            if (!isAdminOrManager(currentUser) && existing.assigneeId !== currentUser?.id) {
                return next(new errorHandler_1.ApiError('您只能删除自己负责的线索', 403, 'FORBIDDEN'));
            }
            const deleted = await database_1.default.lead.deleteMany({ where: { id, organizationId: existing.organizationId, assigneeId: existing.assigneeId, updatedAt: existing.updatedAt } });
            if (deleted.count !== 1)
                throw new errorHandler_1.ApiError('线索已被修改或移交，请刷新后重试', 409, 'RESOURCE_CHANGED');
            (0, response_1.sendSuccess)(res, null, '删除成功');
        }
        catch (error) {
            next(error);
        }
    },
};
//# sourceMappingURL=leadController.js.map