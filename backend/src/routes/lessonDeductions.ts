import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { lessonDeductionController } from '../controllers/lessonDeductionController';

export const lessonDeductionRoutes = Router();

// 使用认证中间件
lessonDeductionRoutes.use(authenticate);

// 检查班级在某天是否已划课
lessonDeductionRoutes.get('/check/:classId', lessonDeductionController.checkDailyDeduction);

// 获取班级的划课记录
lessonDeductionRoutes.get('/records/:classId', lessonDeductionController.getClassDeductionRecords);
