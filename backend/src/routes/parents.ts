import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { parentController } from '../controllers/parentController';

const router = Router();

// 所有路由都需要认证（使用后端 JWT 验证）
router.use(authenticate);

/**
 * @route   GET /api/parent/students
 * @desc    获取与当前家长用户关联的学员列表
 * @access  Parent
 */
router.get('/students', parentController.getLinkedStudents);

/**
 * @route   GET /api/parent/schedules/:studentId
 * @desc    获取指定学员的课表（已报名班级的课时安排）
 * @access  Parent
 */
router.get('/schedules/:studentId', parentController.getStudentSchedules);

/**
 * @route   GET /api/parent/attendances/:studentId
 * @desc    获取指定学员的出勤记录
 * @access  Parent
 */
router.get('/attendances/:studentId', parentController.getStudentAttendances);

/**
 * @route   GET /api/parent/payments/:studentId
 * @desc    获取指定学员的缴费记录
 * @access  Parent
 */
router.get('/payments/:studentId', parentController.getStudentPayments);

export default router;
