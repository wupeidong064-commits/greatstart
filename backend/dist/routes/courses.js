"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.courseRoutes = void 0;
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const rbac_1 = require("../middleware/rbac");
const courseController_1 = require("../controllers/courseController");
exports.courseRoutes = (0, express_1.Router)();
exports.courseRoutes.use(auth_1.authenticate);
exports.courseRoutes.use((0, rbac_1.requireOrganizationAccess)());
exports.courseRoutes.get('/', courseController_1.courseController.getCourses);
exports.courseRoutes.get('/:id', courseController_1.courseController.getCourseById);
exports.courseRoutes.post('/', (0, rbac_1.requireMinRole)('manager'), courseController_1.courseController.createCourse);
exports.courseRoutes.put('/:id', (0, rbac_1.requireMinRole)('manager'), courseController_1.courseController.updateCourse);
exports.courseRoutes.delete('/:id', (0, rbac_1.requireMinRole)('manager'), courseController_1.courseController.deleteCourse);
//# sourceMappingURL=courses.js.map