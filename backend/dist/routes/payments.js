"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.paymentRoutes = void 0;
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const rbac_1 = require("../middleware/rbac");
const paymentController_1 = require("../controllers/paymentController");
exports.paymentRoutes = (0, express_1.Router)();
exports.paymentRoutes.use(auth_1.authenticate);
exports.paymentRoutes.use((0, rbac_1.requireOrganizationAccess)());
exports.paymentRoutes.use((0, rbac_1.requireMinRole)('staff'));
exports.paymentRoutes.get('/', paymentController_1.paymentController.getPayments);
exports.paymentRoutes.get('/:id', paymentController_1.paymentController.getPaymentById);
exports.paymentRoutes.post('/', paymentController_1.paymentController.createPayment);
exports.paymentRoutes.put('/:id', paymentController_1.paymentController.updatePayment);
exports.paymentRoutes.delete('/:id', paymentController_1.paymentController.deletePayment);
//# sourceMappingURL=payments.js.map