"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.enrollmentRoutes = void 0;
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const rbac_1 = require("../middleware/rbac");
const enrollmentController_1 = require("../controllers/enrollmentController");
exports.enrollmentRoutes = (0, express_1.Router)();
exports.enrollmentRoutes.use(auth_1.authenticate);
exports.enrollmentRoutes.use((0, rbac_1.requireOrganizationAccess)());
exports.enrollmentRoutes.get('/', enrollmentController_1.enrollmentController.getEnrollments);
exports.enrollmentRoutes.get('/:id', enrollmentController_1.enrollmentController.getEnrollmentById);
exports.enrollmentRoutes.post('/', enrollmentController_1.enrollmentController.createEnrollment);
exports.enrollmentRoutes.post('/transfer', enrollmentController_1.enrollmentController.transferStudent);
exports.enrollmentRoutes.post('/:id/remove-as-lost', (0, rbac_1.requireRole)('admin', 'manager', 'coach'), enrollmentController_1.enrollmentController.removeAsLost);
exports.enrollmentRoutes.put('/:id', (0, rbac_1.requireRole)('admin', 'manager'), enrollmentController_1.enrollmentController.updateEnrollment);
exports.enrollmentRoutes.delete('/:id', (0, rbac_1.requireRole)('admin', 'manager'), enrollmentController_1.enrollmentController.deleteEnrollment);
//# sourceMappingURL=enrollments.js.map