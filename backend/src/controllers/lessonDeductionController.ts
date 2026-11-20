import prisma from '../config/database';
import { lockScheduleWrites } from '../services/scheduleConflicts';
import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import { ApiError } from '../middleware/errorHandler';
import { sendSuccess } from '../utils/response';

// 辅助函数：获取当前用户信息
const getCurrentUser = (req: AuthRequest) => {
  return req.user;
};

export const lessonDeductionController = {
  /**
   * 检查班级在某天是否已划课（用于非管理员限制一天只能划一次）
   * GET /api/lesson-deductions/check/:classId?date=YYYY-MM-DD
   */
  checkDailyDeduction: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { classId } = req.params;
      const { date } = req.query; // 格式: YYYY-MM-DD
      const currentUser = getCurrentUser(req);

      if (!classId || !date || typeof date !== 'string') {
        return next(new ApiError('缺少必要参数', 400, 'INVALID_PARAMS'));
      }

      const targetOrgId = currentUser?.organizationId;
      if (!targetOrgId) {
        return next(new ApiError('未分配机构', 403, 'FORBIDDEN'));
      }

      if (!await prisma.class.findFirst({where:{id:classId,organizationId:targetOrgId,...(currentUser?.campusId?{campusId:currentUser.campusId}:{})}})) throw new ApiError('班级不存在',404);
      // 查询当天是否已有划课记录
      const existingRecord = await prisma.lessonDeductionRecord.findFirst({ where: { organizationId: targetOrgId, classId, operatorId: currentUser?.id, deductionDate: date } });

      sendSuccess(res, {
        hasDeducted: !!existingRecord,
        record: existingRecord,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * 创建划课记录（内部方法，供其他控制器调用）
   */
  createDeductionRecord: async (
    classId: string,
    organizationId: string,
    operatorId: string,
    operatorName: string,
    deductionCount: number,
    deductionDate: string
  ) => {
    return prisma.$transaction(async tx => {
      await lockScheduleWrites(tx, organizationId);
      const operator = await tx.user.findFirst({ where: { id: operatorId, organizationId }, select: { campusId: true } });
      if (!operator?.campusId) throw new ApiError('未分配校区', 403, 'FORBIDDEN');
      const targetClass = await tx.class.findFirst({ where: { id: classId, organizationId, campusId: operator.campusId } });
      if (!targetClass) throw new ApiError('班级不存在或无权访问', 403, 'FORBIDDEN');
      if (targetClass.status === 'deleted') throw new ApiError('已删除班级不能划课', 409, 'CLASS_DELETED');
      if (targetClass.status === 'inactive') throw new ApiError('停课班级不能划课', 409, 'CLASS_UNAVAILABLE');
      return tx.lessonDeductionRecord.create({ data: { organizationId, classId, operatorId, operatorName, deductionDate, deductionCount } });
    });
  },

  /**
   * 获取班级的划课记录列表
   * GET /api/lesson-deductions/records/:classId?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
   */
  getClassDeductionRecords: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { classId } = req.params;
      const { startDate, endDate } = req.query;
      const currentUser = getCurrentUser(req);

      const targetOrgId = currentUser?.organizationId;
      if (!targetOrgId) {
        return next(new ApiError('未分配机构', 403, 'FORBIDDEN'));
      }

      if (!await prisma.class.findFirst({where:{id:classId,organizationId:targetOrgId,...(currentUser?.campusId?{campusId:currentUser.campusId}:{})}})) throw new ApiError('班级不存在',404);
      const records = await prisma.lessonDeductionRecord.findMany({
        where: { organizationId: targetOrgId, classId, ...((startDate || endDate) ? { deductionDate: { ...(typeof startDate === 'string' ? { gte: startDate } : {}), ...(typeof endDate === 'string' ? { lte: endDate } : {}) } } : {}) },
        orderBy: { deductionDate: 'desc' },
      });

      sendSuccess(res, records || []);
    } catch (error) {
      next(error);
    }
  },
};
