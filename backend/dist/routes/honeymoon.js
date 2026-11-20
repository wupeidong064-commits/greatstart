"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.honeymoonRoutes = void 0;
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const rbac_1 = require("../middleware/rbac");
const honeymoonController_1 = require("../controllers/honeymoonController");
exports.honeymoonRoutes = (0, express_1.Router)();
exports.honeymoonRoutes.use(auth_1.authenticate);
exports.honeymoonRoutes.use((0, rbac_1.requireOrganizationAccess)());
// 获取蜜月期学员
exports.honeymoonRoutes.get('/students', (0, rbac_1.requireRole)('admin', 'manager'), honeymoonController_1.honeymoonController.getHoneymoonStudents);
//# sourceMappingURL=honeymoon.js.map