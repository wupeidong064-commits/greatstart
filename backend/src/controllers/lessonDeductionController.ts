import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import { ApiError } from '../middleware/errorHandler';
import { sendSuccess } from '../utils/response';
import { memfireAdmin } from '../config/memfire';

// 辅助函数：获取当前用户信息
const getCurrentUser = (req: AuthRequest) => {
  return req.user || req.memfireUser;
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

      // 查询当天是否已有划课记录
      const { data: existingRecord, error } = await memfireAdmin
        .from('lesson_deduction_records')
        .select('*')
        .eq('organizationId', targetOrgId)
        .eq('classId', classId)
        .eq('operatorId', currentUser?.id)
        .eq('deductionDate', date)
        .maybeSingle();

      if (error) {
        console.error('查询划课记录失败:', error);
        return next(new ApiError('查询划课记录失败', 500, 'QUERY_ERROR'));
      }

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
    const { data, error } = await memfireAdmin
      .from('lesson_deduction_records')
      .insert({
        organizationId,
        classId,
        operatorId,
        operatorName,
        deductionDate,
        deductionCount,
      })
      .select()
      .maybeSingle();

    if (error) {
      console.error('创建划课记录失败:', error);
      throw new Error('创建划课记录失败');
    }

    return data;
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

      let query = memfireAdmin
        .from('lesson_deduction_records')
        .select('*')
        .eq('organizationId', targetOrgId)
        .eq('classId', classId)
        .order('deductionDate', { ascending: false });

      if (startDate) {
        query = query.gte('deductionDate', startDate);
      }
      if (endDate) {
        query = query.lte('deductionDate', endDate);
      }

      const { data: records, error } = await query;

      if (error) {
        return next(new ApiError('获取划课记录失败', 500, 'QUERY_ERROR'));
      }

      sendSuccess(res, records || []);
    } catch (error) {
      next(error);
    }
  },
};
