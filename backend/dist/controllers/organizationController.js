"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.organizationController = void 0;
const errorHandler_1 = require("../middleware/errorHandler");
const response_1 = require("../utils/response");
const database_1 = __importDefault(require("../config/database"));
const client_1 = require("@prisma/client");
const organizationScope_1 = require("../services/organizationScope");
const managedUsers_1 = require("../services/managedUsers");
const getCurrentUser = (req) => {
    return req.user;
};
exports.organizationController = {
    getOrganizations: async (req, res, next) => {
        try {
            const page = parseInt(req.query.page) || 1;
            const pageSize = parseInt(req.query.pageSize) || 10;
            const search = req.query.search;
            const currentUser = getCurrentUser(req);
            if (!currentUser?.isPlatformAdmin && !currentUser?.organizationId)
                return (0, response_1.sendPaginated)(res, [], page, pageSize, 0);
            const where = {
                ...(!currentUser?.isPlatformAdmin ? { id: currentUser.organizationId } : {}),
                ...(search ? { OR: [{ name: { contains: search, mode: 'insensitive' } }, { code: { contains: search, mode: 'insensitive' } }] } : {}),
            };
            const [organizations, count] = await database_1.default.$transaction([
                database_1.default.organization.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
                database_1.default.organization.count({ where }),
            ]);
            (0, response_1.sendPaginated)(res, organizations, page, pageSize, count);
        }
        catch (error) {
            next(error);
        }
    },
    getOrganizationById: async (req, res, next) => {
        try {
            const { id } = req.params;
            const currentUser = getCurrentUser(req);
            const organization = await database_1.default.organization.findUnique({ where: { id } });
            if (!organization) {
                return next(new errorHandler_1.ApiError('机构不存在', 404, 'ORGANIZATION_NOT_FOUND'));
            }
            // 数据隔离：非admin只能查看自己机构
            if (!currentUser?.isPlatformAdmin && organization.id !== currentUser?.organizationId) {
                return next(new errorHandler_1.ApiError('无权访问', 403, 'FORBIDDEN'));
            }
            // 获取校区的数量
            const campuses = await database_1.default.campus.findMany({ where: { organizationId: id }, select: { id: true } });
            // 获取关联数据统计（简化版本）
            const result = {
                ...organization,
                campuses: campuses || [],
                _count: {
                    campuses: campuses?.length || 0,
                },
            };
            (0, response_1.sendSuccess)(res, result);
        }
        catch (error) {
            next(error);
        }
    },
    createOrganization: async (req, res, next) => {
        try {
            const { address, phone } = req.body;
            const name = (0, managedUsers_1.textField)(req.body.name, '机构名称');
            const code = (0, managedUsers_1.textField)(req.body.code, '机构代码');
            const email = req.body.email ? (0, managedUsers_1.validEmail)(req.body.email) : null;
            const currentUser = getCurrentUser(req);
            // 只有 admin 可以创建机构
            if (!currentUser?.isPlatformAdmin) {
                return next(new errorHandler_1.ApiError('无权创建机构', 403, 'FORBIDDEN'));
            }
            // 检查代码是否已存在
            const existing = await database_1.default.organization.findUnique({ where: { code } });
            if (existing) {
                return next(new errorHandler_1.ApiError('机构代码已存在', 400, 'CODE_EXISTS'));
            }
            const organization = await database_1.default.$transaction(async (tx) => {
                const created = await tx.organization.create({ data: { name, code, address, phone, email } });
                await (0, organizationScope_1.createDefaultCampus)(tx, created.id);
                return created;
            });
            (0, response_1.sendSuccess)(res, organization, '机构创建成功', 201);
        }
        catch (error) {
            if (error instanceof client_1.Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
                return next(new errorHandler_1.ApiError('机构代码已存在', 409, 'CODE_EXISTS'));
            next(error);
        }
    },
    updateOrganization: async (req, res, next) => {
        try {
            const { id } = req.params;
            const { name, address, phone, email, isActive } = req.body;
            const currentUser = getCurrentUser(req);
            // 检查机构是否存在
            const existing = await database_1.default.organization.findUnique({ where: { id } });
            if (!existing) {
                return next(new errorHandler_1.ApiError('机构不存在', 404, 'ORGANIZATION_NOT_FOUND'));
            }
            // 数据隔离检查
            if (!currentUser?.isPlatformAdmin && existing.id !== currentUser?.organizationId) {
                return next(new errorHandler_1.ApiError('无权修改该机构', 403, 'FORBIDDEN'));
            }
            const updateData = {};
            if (name)
                updateData.name = name;
            if (address !== undefined)
                updateData.address = address;
            if (phone !== undefined)
                updateData.phone = phone;
            if (email !== undefined)
                updateData.email = email;
            if (isActive !== undefined)
                updateData.isActive = isActive;
            const updated = await database_1.default.organization.update({ where: { id }, data: updateData });
            (0, response_1.sendSuccess)(res, updated, '机构更新成功');
        }
        catch (error) {
            next(error);
        }
    },
    deleteOrganization: async (req, res, next) => {
        try {
            const { id } = req.params;
            const currentUser = getCurrentUser(req);
            // 只有 admin 可以删除机构
            if (!currentUser?.isPlatformAdmin) {
                return next(new errorHandler_1.ApiError('无权删除机构', 403, 'FORBIDDEN'));
            }
            // 检查机构是否存在
            const existing = await database_1.default.organization.findUnique({ where: { id } });
            if (!existing) {
                return next(new errorHandler_1.ApiError('机构不存在', 404, 'ORGANIZATION_NOT_FOUND'));
            }
            await database_1.default.organization.update({ where: { id }, data: { isActive: false } });
            (0, response_1.sendSuccess)(res, null, '机构已停用');
        }
        catch (error) {
            next(error);
        }
    },
};
//# sourceMappingURL=organizationController.js.map