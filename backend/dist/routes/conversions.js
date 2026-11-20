"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.conversionRoutes = void 0;
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const rbac_1 = require("../middleware/rbac");
const conversionController_1 = require("../controllers/conversionController");
exports.conversionRoutes = (0, express_1.Router)();
// 使用后端 JWT 认证
exports.conversionRoutes.use(auth_1.authenticate);
exports.conversionRoutes.use((0, rbac_1.requireOrganizationAccess)());
// 获取成单信息列表
exports.conversionRoutes.get('/', conversionController_1.conversionController.getConversions);
exports.conversionRoutes.get('/summary', conversionController_1.conversionController.getConversionSummary);
exports.conversionRoutes.get('/voided', conversionController_1.conversionController.getVoidedConversions);
exports.conversionRoutes.get('/registration-schedules', conversionController_1.conversionController.getRegistrationSchedules);
// 创建成单记录
exports.conversionRoutes.post('/', conversionController_1.conversionController.createConversion);
// 续费（事务化：成单+课时应增+换班，同日同学员幂等，P1-06；须注册在 /:id 之前）
exports.conversionRoutes.post('/renewal', conversionController_1.conversionController.renewStudent);
// 获取单条成单信息
exports.conversionRoutes.get('/:id', conversionController_1.conversionController.getConversionById);
// 更新成单信息
exports.conversionRoutes.put('/:id', conversionController_1.conversionController.updateConversion);
// 删除成单记录
exports.conversionRoutes.delete('/:id', conversionController_1.conversionController.deleteConversion);
// 2026-11-08 用户拍板：成单作废（红冲）——保留记录、课时冲回、退出全部统计口径
exports.conversionRoutes.post('/:id/void', conversionController_1.conversionController.voidConversion);
// 关联学员到成单信息
exports.conversionRoutes.post('/link-student', conversionController_1.conversionController.linkStudent);
//# sourceMappingURL=conversions.js.map