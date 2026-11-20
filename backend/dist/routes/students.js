"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.studentRoutes = void 0;
const attendanceController_1 = require("../controllers/attendanceController");
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const rbac_1 = require("../middleware/rbac");
const studentController_1 = require("../controllers/studentController");
exports.studentRoutes = (0, express_1.Router)();
// 使用后端 JWT 认证
exports.studentRoutes.use(auth_1.authenticate);
exports.studentRoutes.use((0, rbac_1.requireOrganizationAccess)());
exports.studentRoutes.get('/', studentController_1.studentController.getStudents);
exports.studentRoutes.get('/renewal', studentController_1.studentController.getStudents);
exports.studentRoutes.get('/lost', studentController_1.studentController.getStudents);
exports.studentRoutes.get('/low-attendance', (0, rbac_1.requireMinRole)('manager'), attendanceController_1.attendanceController.getLowAttendanceStudents);
exports.studentRoutes.get('/continuous-leave', (0, rbac_1.requireMinRole)('manager'), attendanceController_1.attendanceController.getContinuousLeaveStudents);
exports.studentRoutes.get('/:id', studentController_1.studentController.getStudentById);
// 安全修复：学员档案写入需 staff 及以上角色（此前家长角色也能创建，真实联调发现）
exports.studentRoutes.post('/', (0, rbac_1.requireMinRole)('staff'), studentController_1.studentController.createStudent);
exports.studentRoutes.post('/:id/archive', (0, rbac_1.requireMinRole)('manager'), studentController_1.studentController.archiveStudent);
exports.studentRoutes.post('/:id/restore', (0, rbac_1.requireMinRole)('manager'), studentController_1.studentController.restoreStudent);
exports.studentRoutes.put('/:id', (0, rbac_1.requireMinRole)('staff'), studentController_1.studentController.updateStudent);
exports.studentRoutes.delete('/:id', (0, rbac_1.requireMinRole)('manager'), studentController_1.studentController.deleteStudent);
// The legacy full-roster export is not a public endpoint.
//# sourceMappingURL=students.js.map