"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.honeymoonController = void 0;
// Legacy route shares authorization, first-new-sale date and attendance calculation.
const attendanceController_1 = require("./attendanceController");
exports.honeymoonController = {
    getHoneymoonStudents: attendanceController_1.attendanceController.getHoneymoonAttendance,
};
//# sourceMappingURL=honeymoonController.js.map