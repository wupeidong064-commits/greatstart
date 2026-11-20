"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.settingsRoutes = void 0;
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const rbac_1 = require("../middleware/rbac");
const settingsController_1 = require("../controllers/settingsController");
exports.settingsRoutes = (0, express_1.Router)();
exports.settingsRoutes.use(auth_1.authenticate);
exports.settingsRoutes.use((0, rbac_1.requireOrganizationAccess)());
// 获取设置项
exports.settingsRoutes.get('/:key', settingsController_1.settingsController.getSetting);
// 更新设置项
exports.settingsRoutes.put('/:key', (0, rbac_1.requireMinRole)('manager'), settingsController_1.settingsController.updateSetting);
//# sourceMappingURL=settings.js.map