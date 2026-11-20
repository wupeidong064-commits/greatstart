"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.classRoutes = void 0;
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const rbac_1 = require("../middleware/rbac");
const classController_1 = require("../controllers/classController");
exports.classRoutes = (0, express_1.Router)();
exports.classRoutes.use(auth_1.authenticate);
exports.classRoutes.use((0, rbac_1.requireOrganizationAccess)());
exports.classRoutes.get('/', classController_1.classController.getClasses);
exports.classRoutes.get('/experience-priority', classController_1.classController.getExperiencePriorityClasses);
exports.classRoutes.get('/:id', classController_1.classController.getClassById);
exports.classRoutes.get('/:id/students', classController_1.classController.getClassStudents);
exports.classRoutes.post('/', (0, rbac_1.requireMinRole)('manager'), classController_1.classController.createClass);
exports.classRoutes.put('/:id', (0, rbac_1.requireMinRole)('manager'), classController_1.classController.updateClass);
exports.classRoutes.delete('/:id', (0, rbac_1.requireMinRole)('manager'), classController_1.classController.deleteClass);
//# sourceMappingURL=classes.js.map