"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.campusController = void 0;
const database_1 = __importDefault(require("../config/database"));
const errorHandler_1 = require("../middleware/errorHandler");
const response_1 = require("../utils/response");
const getCurrentUser = (req) => {
    return req.user;
};
exports.campusController = {
    getCampuses: async (req, res, next) => {
        try {
            const organizationId = req.query.organizationId;
            const currentUser = getCurrentUser(req);
            // 使用用户自己的机构ID（如果没有指定）
            const targetOrgId = organizationId || currentUser?.organizationId;
            if (!targetOrgId) {
                return next(new errorHandler_1.ApiError('必须指定机构', 400, 'MISSING_ORGANIZATION'));
            }
            // 数据隔离检查
            if (!currentUser?.isPlatformAdmin && targetOrgId !== currentUser?.organizationId) {
                return next(new errorHandler_1.ApiError('无权访问该机构数据', 403, 'FORBIDDEN'));
            }
            const campuses = await database_1.default.campus.findMany({
                where: { organizationId: targetOrgId, isActive: true, ...(!currentUser?.isPlatformAdmin && currentUser?.campusId ? { id: currentUser.campusId } : {}) },
                orderBy: { createdAt: 'desc' },
            });
            (0, response_1.sendSuccess)(res, campuses || []);
        }
        catch (error) {
            next(error);
        }
    },
    getCampusById: async (req, res, next) => {
        try {
            const { id } = req.params;
            const currentUser = getCurrentUser(req);
            const campus = await database_1.default.campus.findUnique({ where: { id } });
            if (!campus) {
                return next(new errorHandler_1.ApiError('校区不存在', 404, 'CAMPUS_NOT_FOUND'));
            }
            // 数据隔离检查
            if (!currentUser?.isPlatformAdmin && (campus.organizationId !== currentUser?.organizationId || (currentUser?.campusId && campus.id !== currentUser.campusId))) {
                return next(new errorHandler_1.ApiError('无权访问', 403, 'FORBIDDEN'));
            }
            // 获取关联的机构信息
            const organization = await database_1.default.organization.findUnique({ where: { id: campus.organizationId }, select: { id: true, name: true, code: true } });
            const result = {
                ...campus,
                organization,
            };
            (0, response_1.sendSuccess)(res, result);
        }
        catch (error) {
            next(error);
        }
    },
    createCampus: async (req, res, next) => {
        try {
            const { name, code, address, phone, organizationId } = req.body;
            const currentUser = getCurrentUser(req);
            const targetOrgId = organizationId || currentUser?.organizationId;
            if (!targetOrgId) {
                return next(new errorHandler_1.ApiError('必须指定机构', 400, 'MISSING_ORGANIZATION'));
            }
            // 数据隔离检查
            if (!currentUser?.isPlatformAdmin && targetOrgId !== currentUser?.organizationId) {
                return next(new errorHandler_1.ApiError('无权在该机构创建校区', 403, 'FORBIDDEN'));
            }
            // 检查代码是否已存在（在同一机构内）
            const existing = await database_1.default.campus.findFirst({ where: { organizationId: targetOrgId, code } });
            if (existing) {
                return next(new errorHandler_1.ApiError('校区代码在该机构内已存在', 400, 'CODE_EXISTS'));
            }
            const campus = await database_1.default.campus.create({ data: { name, code, address, phone, organizationId: targetOrgId } });
            (0, response_1.sendSuccess)(res, campus, '校区创建成功', 201);
        }
        catch (error) {
            next(error);
        }
    },
    updateCampus: async (req, res, next) => {
        try {
            const { id } = req.params;
            const { name, address, phone, isActive } = req.body;
            const currentUser = getCurrentUser(req);
            const campus = await database_1.default.campus.findUnique({ where: { id } });
            if (!campus) {
                return next(new errorHandler_1.ApiError('校区不存在', 404, 'CAMPUS_NOT_FOUND'));
            }
            // 数据隔离检查
            if (!currentUser?.isPlatformAdmin && (campus.organizationId !== currentUser?.organizationId || (currentUser?.campusId && campus.id !== currentUser.campusId))) {
                return next(new errorHandler_1.ApiError('无权修改该校区', 403, 'FORBIDDEN'));
            }
            const updateData = {};
            if (name)
                updateData.name = name;
            if (address !== undefined)
                updateData.address = address;
            if (phone !== undefined)
                updateData.phone = phone;
            if (isActive !== undefined)
                updateData.isActive = isActive;
            const updated = await database_1.default.campus.update({ where: { id }, data: updateData });
            (0, response_1.sendSuccess)(res, updated, '校区更新成功');
        }
        catch (error) {
            next(error);
        }
    },
    deleteCampus: async (req, res, next) => {
        try {
            const { id } = req.params;
            const currentUser = getCurrentUser(req);
            const campus = await database_1.default.campus.findUnique({ where: { id } });
            if (!campus) {
                return next(new errorHandler_1.ApiError('校区不存在', 404, 'CAMPUS_NOT_FOUND'));
            }
            // 数据隔离检查
            if (!currentUser?.isPlatformAdmin && (campus.organizationId !== currentUser?.organizationId || (currentUser?.campusId && campus.id !== currentUser.campusId))) {
                return next(new errorHandler_1.ApiError('无权删除该校区', 403, 'FORBIDDEN'));
            }
            await database_1.default.campus.update({ where: { id }, data: { isActive: false } });
            (0, response_1.sendSuccess)(res, null, '校区已停用');
        }
        catch (error) {
            next(error);
        }
    },
};
//# sourceMappingURL=campusController.js.map