import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import { ApiError } from '../middleware/errorHandler';
import { sendSuccess, sendPaginated } from '../utils/response';
import { memfireAdmin } from '../config/memfire';

// 辅助函数：获取当前用户信息（兼容 req.user 和 req.memfireUser）
const getCurrentUser = (req: AuthRequest) => {
  return req.user || req.memfireUser;
};

export const enrollmentController = {
  getEnrollments: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const pageSize = parseInt(req.query.pageSize as string) || 10;
      const studentId = req.query.studentId as string;
      const classId = req.query.classId as string;
      const status = req.query.status as string;
      const currentUser = getCurrentUser(req);

      // 数据隔离：使用用户自己的机构ID，admin可以看到所有数据
      const targetOrgId = currentUser?.organizationId;

      let query = memfireAdmin
        .from('enrollments')
        .select('*')
        .order('enrolledAt', { ascending: false });

      // Admin without orgId can see all enrollments, otherwise filter by orgId
      if (targetOrgId) {
        query = query.eq('organizationId', targetOrgId);
      }

      // 过滤条件
      if (studentId) {
        query = query.eq('studentId', studentId);
      }

      if (classId) {
        query = query.eq('classId', classId);
      }

      if (status) {
        query = query.eq('status', status);
      }

      // 分页
      query = query.range((page - 1) * pageSize, (page - 1) * pageSize + pageSize - 1);

      const { data: enrollments, error } = await query;

      if (error) {
        return next(new ApiError('获取报名列表失败', 500, 'QUERY_ERROR'));
      }

      // 获取总数
      let countQuery = memfireAdmin
        .from('enrollments')
        .select('*', { count: 'exact', head: true });

      if (targetOrgId) {
        countQuery = countQuery.eq('organizationId', targetOrgId);
      }

      if (studentId) {
        countQuery = countQuery.eq('studentId', studentId);
      }

      if (classId) {
        countQuery = countQuery.eq('classId', classId);
      }

      if (status) {
        countQuery = countQuery.eq('status', status);
      }

      const { count } = await countQuery;

      sendPaginated(res, enrollments || [], page, pageSize, count || 0);
    } catch (error) {
      next(error);
    }
  },

  getEnrollmentById: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const currentUser = getCurrentUser(req);

      const { data: enrollment, error } = await memfireAdmin
        .from('enrollments')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (error || !enrollment) {
        return next(new ApiError('报名记录不存在', 404, 'ENROLLMENT_NOT_FOUND'));
      }

      // 数据隔离检查
      if (currentUser?.role !== 'admin' && enrollment.organizationId !== currentUser?.organizationId) {
        return next(new ApiError('无权访问', 403, 'FORBIDDEN'));
      }

      sendSuccess(res, enrollment);
    } catch (error) {
      next(error);
    }
  },

  createEnrollment: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { studentId, classId, notes } = req.body;

      const currentUser = getCurrentUser(req);
      const organizationId = req.body.organizationId || currentUser?.organizationId;

      if (!organizationId) {
        return next(new ApiError('必须指定机构', 400, 'MISSING_ORGANIZATION'));
      }

      // 验证学员
      const { data: student } = await memfireAdmin
        .from('students')
        .select('id, organizationId')
        .eq('id', studentId)
        .maybeSingle();

      if (!student || student.organizationId !== organizationId) {
        return next(new ApiError('学员不存在或不属于该机构', 400, 'STUDENT_NOT_FOUND'));
      }

      // 验证班级
      const { data: classData } = await memfireAdmin
        .from('classes')
        .select('id, organizationId')
        .eq('id', classId)
        .maybeSingle();

      if (!classData || classData.organizationId !== organizationId) {
        return next(new ApiError('班级不存在或不属于该机构', 400, 'CLASS_NOT_FOUND'));
      }

      // 检查是否已报名
      const { data: existing } = await memfireAdmin
        .from('enrollments')
        .select('id')
        .eq('studentId', studentId)
        .eq('classId', classId)
        .eq('status', 'active')
        .maybeSingle();

      if (existing) {
        return next(new ApiError('该学员已报名此班级', 400, 'ENROLLMENT_EXISTS'));
      }

      const { data: enrollment, error } = await memfireAdmin
        .from('enrollments')
        .insert({
          organizationId,
          studentId,
          classId,
          enrolledBy: currentUser?.id,
          notes,
        })
        .select()
        .single();

      if (error) {
        return next(new ApiError('创建报名失败', 500, 'CREATE_ERROR'));
      }

      sendSuccess(res, enrollment, '报名成功', 201);
    } catch (error) {
      next(error);
    }
  },

  updateEnrollment: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const { status, notes } = req.body;
      const currentUser = getCurrentUser(req);

      const { data: enrollment } = await memfireAdmin
        .from('enrollments')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (!enrollment) {
        return next(new ApiError('报名记录不存在', 404, 'ENROLLMENT_NOT_FOUND'));
      }

      // 数据隔离检查
      if (currentUser?.role !== 'admin' && enrollment.organizationId !== currentUser?.organizationId) {
        return next(new ApiError('无权修改该报名记录', 403, 'FORBIDDEN'));
      }

      const updateData: any = {};
      if (status) updateData.status = status;
      if (notes !== undefined) updateData.notes = notes;

      const { data: updated, error } = await memfireAdmin
        .from('enrollments')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        return next(new ApiError('更新报名记录失败', 500, 'UPDATE_ERROR'));
      }

      sendSuccess(res, updated, '报名记录更新成功');
    } catch (error) {
      next(error);
    }
  },

  deleteEnrollment: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const currentUser = getCurrentUser(req);

      const { data: enrollment } = await memfireAdmin
        .from('enrollments')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (!enrollment) {
        return next(new ApiError('报名记录不存在', 404, 'ENROLLMENT_NOT_FOUND'));
      }

      // 数据隔离检查
      if (currentUser?.role !== 'admin' && enrollment.organizationId !== currentUser?.organizationId) {
        return next(new ApiError('无权删除该报名记录', 403, 'FORBIDDEN'));
      }

      const { error } = await memfireAdmin
        .from('enrollments')
        .delete()
        .eq('id', id);

      if (error) {
        return next(new ApiError('删除报名记录失败', 500, 'DELETE_ERROR'));
      }

      sendSuccess(res, null, '报名记录删除成功');
    } catch (error) {
      next(error);
    }
  },

  transferStudent: async (_req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      // 简化版本：不支持调班功能
      sendSuccess(res, { message: '调班功能暂不支持' });
    } catch (error) {
      next(error);
    }
  },
};
