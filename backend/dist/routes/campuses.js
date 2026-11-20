"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.campusRoutes = void 0;
const express_1 = require("express");
const rbac_1 = require("../middleware/rbac");
const auth_1 = require("../middleware/auth");
const errorHandler_1 = require("../middleware/errorHandler");
const campusController_1 = require("../controllers/campusController");
exports.campusRoutes = (0, express_1.Router)();
exports.campusRoutes.use(auth_1.authenticate);
exports.campusRoutes.get('/', campusController_1.campusController.getCampuses);
exports.campusRoutes.get('/:id', campusController_1.campusController.getCampusById);
exports.campusRoutes.post('/', (_req, _res, next) => next(new errorHandler_1.ApiError('每个机构仅使用一个默认业务范围，不支持新增校区', 409, 'SINGLE_ORGANIZATION_SCOPE')));
exports.campusRoutes.put('/:id', rbac_1.platformOnly, campusController_1.campusController.updateCampus);
exports.campusRoutes.delete('/:id', (_req, _res, next) => next(new errorHandler_1.ApiError('机构默认业务范围不可删除', 409, 'SINGLE_ORGANIZATION_SCOPE')));
//# sourceMappingURL=campuses.js.map