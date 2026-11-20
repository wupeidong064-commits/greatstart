import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { requireOrganizationAccess } from '../middleware/rbac';
import { lessonPricingController } from '../controllers/lessonPricingController';
import { lessonLogController } from '../controllers/lessonLogController';

export const lessonLogRoutes = Router();

// 使用后端 JWT 认证
lessonLogRoutes.use(authenticate);
lessonLogRoutes.use(requireOrganizationAccess());

// 获取课时日志列表
lessonLogRoutes.get('/pricing',lessonPricingController.get);
lessonLogRoutes.post('/pricing',lessonPricingController.confirm);
lessonLogRoutes.get('/balance', lessonLogController.getBalance);
lessonLogRoutes.get('/', lessonLogController.getLessonLogs);

// 创建课时日志
lessonLogRoutes.post('/', lessonLogController.createLessonLog);

// 增课
lessonLogRoutes.post('/add', lessonLogController.addLessons);

// 划课（扣减课时）
lessonLogRoutes.post('/deduct', lessonLogController.deductLessons);

// 2026-11-08 用户拍板（⑫）：活动划课——不选班级/场次，直接扣课时（备注必填）
lessonLogRoutes.post('/activity-deduct', lessonLogController.activityDeduct);
