// Legacy route shares authorization, first-new-sale date and attendance calculation.
import { attendanceController } from './attendanceController';

export const honeymoonController = {
  getHoneymoonStudents: attendanceController.getHoneymoonAttendance,
};
