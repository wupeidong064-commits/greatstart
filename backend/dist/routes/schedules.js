"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.scheduleRoutes = void 0;
const database_1 = __importDefault(require("../config/database"));
const errorHandler_1 = require("../middleware/errorHandler");
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const rbac_1 = require("../middleware/rbac");
const scheduleController_1 = require("../controllers/scheduleController");
exports.scheduleRoutes = (0, express_1.Router)();
exports.scheduleRoutes.use(auth_1.authenticate);
exports.scheduleRoutes.use((0, rbac_1.requireOrganizationAccess)());
exports.scheduleRoutes.use(async (req, _res, next) => {
    try {
        const actor = req.user;
        if (!actor?.organizationId || !actor.campusId)
            throw new errorHandler_1.ApiError('未分配校区', 403, 'FORBIDDEN');
        if (!['admin', 'manager', 'teacher', 'coach'].includes(actor.role))
            throw new errorHandler_1.ApiError('无权查看排课', 403, 'FORBIDDEN');
        if (req.method !== 'GET' && !['admin', 'manager'].includes(actor.role))
            throw new errorHandler_1.ApiError('无权修改排课', 403, 'FORBIDDEN');
        if (req.body.organizationId && req.body.organizationId !== actor.organizationId || req.body.campusId && req.body.campusId !== actor.campusId)
            throw new errorHandler_1.ApiError('不能跨校区排课', 403, 'FORBIDDEN');
        const id = req.path.split('/')[1];
        const groupAction = ['recurring', 'replace-recurring', 'cancel-by-class', 'cancel-future', 'class-rules'].includes(id);
        const schedule = id && !groupAction ? await database_1.default.schedule.findUnique({ where: { id } }) : null;
        if (id && !groupAction && (!schedule || schedule.organizationId !== actor.organizationId || schedule.campusId !== actor.campusId))
            throw new errorHandler_1.ApiError('排课不属于当前校区', 403, 'FORBIDDEN');
        if (schedule && ['teacher', 'coach'].includes(actor.role) && schedule.teacherId !== actor.id)
            throw new errorHandler_1.ApiError('只能查看本人授课场次', 403, 'FORBIDDEN');
        const classId = req.body.classId || (id === 'cancel-by-class' ? req.path.split('/')[2] : null);
        if (classId && !await database_1.default.class.findFirst({ where: { id: classId, organizationId: actor.organizationId, campusId: actor.campusId } }))
            throw new errorHandler_1.ApiError('班级不属于当前校区', 403, 'FORBIDDEN');
        next();
    }
    catch (e) {
        next(e);
    }
});
exports.scheduleRoutes.get('/', scheduleController_1.scheduleController.getSchedules);
exports.scheduleRoutes.get('/:id/temporary-students', scheduleController_1.scheduleController.searchTemporaryStudents);
exports.scheduleRoutes.get('/:id/roster', scheduleController_1.scheduleController.getScheduleRoster);
exports.scheduleRoutes.get('/:id', scheduleController_1.scheduleController.getScheduleById);
exports.scheduleRoutes.post('/', scheduleController_1.scheduleController.createSchedule);
exports.scheduleRoutes.post('/recurring', scheduleController_1.scheduleController.createRecurringSchedules);
exports.scheduleRoutes.post('/replace-recurring', scheduleController_1.scheduleController.replaceRecurringSchedules);
exports.scheduleRoutes.post('/class-rules/preview', scheduleController_1.scheduleController.previewFromClassRules);
exports.scheduleRoutes.post('/class-rules/generate', scheduleController_1.scheduleController.generateFromClassRules);
exports.scheduleRoutes.post('/class-rules/slot-status', scheduleController_1.scheduleController.setClassRuleSlotStatus);
exports.scheduleRoutes.post('/cancel-by-class/:classId', scheduleController_1.scheduleController.cancelByClass);
exports.scheduleRoutes.post('/cancel-future', scheduleController_1.scheduleController.cancelAllFuture);
exports.scheduleRoutes.put('/:id', scheduleController_1.scheduleController.updateSchedule);
exports.scheduleRoutes.delete('/:id', scheduleController_1.scheduleController.deleteSchedule);
exports.scheduleRoutes.post('/:id/reschedule', scheduleController_1.scheduleController.reschedule);
//# sourceMappingURL=schedules.js.map