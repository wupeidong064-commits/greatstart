"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.importRoutes = void 0;
/** Customer self-service business import has been retired. */
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const rbac_1 = require("../middleware/rbac");
const errorHandler_1 = require("../middleware/errorHandler");
exports.importRoutes = (0, express_1.Router)();
exports.importRoutes.use(auth_1.authenticate, (0, rbac_1.requireOrganizationAccess)());
exports.importRoutes.use((_req, _res, next) => next(new errorHandler_1.ApiError('自助批量导入已关闭，请联系工作人员协助迁移数据', 410, 'IMPORT_RETIRED')));
//# sourceMappingURL=import.js.map