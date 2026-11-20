"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.orgProfileRoutes = void 0;
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const rbac_1 = require("../middleware/rbac");
const orgProfileController_1 = require("../controllers/orgProfileController");
exports.orgProfileRoutes = (0, express_1.Router)();
// 机构数据说明：仅机构数据管理权限（manager 及以上）可访问；
// 范围（机构/授权校区）由登录身份在服务端确定，不接收任何范围参数
exports.orgProfileRoutes.use(auth_1.authenticate);
exports.orgProfileRoutes.use((0, rbac_1.requireOrganizationAccess)());
exports.orgProfileRoutes.get('/', (0, rbac_1.requireMinRole)('manager'), orgProfileController_1.orgProfileController.getProfile);
//# sourceMappingURL=orgProfile.js.map