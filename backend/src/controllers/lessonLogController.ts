import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import { ApiError } from '../middleware/errorHandler';
import { sendSuccess, sendPaginated } from '../utils/response';
import { memfireAdmin } from '../config/memfire';

// 辅助函数：获取当前用户信息
const getCurrentUser = (req: AuthRequest) => {
  return req.user || req.memfireUser;
};

export const lessonLogController = {
  // 获取课时日志列表
  getLessonLogs: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const pageSize = parseInt(req.query.pageSize as string) || 10;
      const type = req.query.type as string;
      const studentId = req.query.studentId as string;
      const startDate = req.query.startDate as string;
      const endDate = req.query.endDate as string;

      const currentUser = getCurrentUser(req);
      const targetOrgId = currentUser?.organizationId;

      if (!targetOrgId) {
        return next(new ApiError('未分配机构', 403, 'FORBIDDEN'));
      }

      let query = memfireAdmin
        .from('lesson_logs')
        .select('*')
        .eq('organizationId', targetOrgId)
        .order('createdAt', { ascending: false });

      // 按类型过滤
      if (type) {
        query = query.eq('type', type);
      }

      // 按学员过滤
      if (studentId) {
        query = query.eq('studentId', studentId);
      }

      // 日期范围过滤
      if (startDate) {
        query = query.gte('createdAt', startDate);
      }
      if (endDate) {
        query = query.lte('createdAt', endDate);
      }

      // 分页
      query = query.range((page - 1) * pageSize, (page - 1) * pageSize + pageSize - 1);

      const { data: logs, error } = await query;

      if (error) {
        return next(new ApiError('获取课时日志失败', 500, 'QUERY_ERROR'));
      }

      // 获取总数
      let countQuery = memfireAdmin
        .from('lesson_logs')
        .select('*', { count: 'exact', head: true })
        .eq('organizationId', targetOrgId);

      if (type) countQuery = countQuery.eq('type', type);
      if (studentId) countQuery = countQuery.eq('studentId', studentId);
      if (startDate) countQuery = countQuery.gte('createdAt', startDate);
      if (endDate) countQuery = countQuery.lte('createdAt', endDate);

      const { count } = await countQuery;

      sendPaginated(res, logs || [], page, pageSize, count || 0);
    } catch (error) {
      next(error);
    }
  },

  // 创建课时日志
  createLessonLog: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { studentId, studentName, type, lessons, notes, operatorId, operatorName } = req.body;
      const currentUser = getCurrentUser(req);
      const targetOrgId = currentUser?.organizationId;

      if (!targetOrgId) {
        return next(new ApiError('未分配机构', 403, 'FORBIDDEN'));
      }

      // 验证学员存在
      const { data: student } = await memfireAdmin
        .from('students')
        .select('id, name, organizationId')
        .eq('id', studentId)
        .maybeSingle();

      if (!student) {
        return next(new ApiError('学员不存在', 404, 'STUDENT_NOT_FOUND'));
      }

      // 验证数据隔离
      if (student.organizationId !== targetOrgId) {
        return next(new ApiError('无权操作该学员', 403, 'FORBIDDEN'));
      }

      const { data: log, error } = await memfireAdmin
        .from('lesson_logs')
        .insert({
          studentId,
          studentName: studentName || student.name,
          type,
          lessons,
          notes,
          operatorId: operatorId || currentUser?.id,
          operatorName: operatorName || (currentUser as any)?.name,
          organizationId: targetOrgId,
        })
        .select()
        .single();

      if (error) {
        return next(new ApiError('创建课时日志失败', 500, 'CREATE_ERROR'));
      }

      sendSuccess(res, log, '课时日志创建成功', 201);
    } catch (error) {
      next(error);
    }
  },

  // 增课
  addLessons: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { studentId, lessons, notes } = req.body;
      const currentUser = getCurrentUser(req);
      const targetOrgId = currentUser?.organizationId;

      if (!targetOrgId) {
        return next(new ApiError('未分配机构', 403, 'FORBIDDEN'));
      }

      if (!studentId || !lessons || lessons <= 0) {
        return next(new ApiError('参数错误', 400, 'INVALID_PARAMS'));
      }

      // 获取学员信息
      const { data: student, error: studentError } = await memfireAdmin
        .from('students')
        .select('*')
        .eq('id', studentId)
        .maybeSingle();

      if (studentError || !student) {
        return next(new ApiError('学员不存在', 404, 'STUDENT_NOT_FOUND'));
      }

      // 验证数据隔离
      if (student.organizationId !== targetOrgId) {
        return next(new ApiError('无权操作该学员', 403, 'FORBIDDEN'));
      }

      // 更新学员剩余课时
      const currentRemaining = student.remainingLessons || 0;
      const newRemaining = currentRemaining + lessons;

      const { error: updateError } = await memfireAdmin
        .from('students')
        .update({ remainingLessons: newRemaining })
        .eq('id', studentId);

      if (updateError) {
        return next(new ApiError('更新学员课时失败', 500, 'UPDATE_ERROR'));
      }

      // 创建课时日志
      const { data: log, error: logError } = await memfireAdmin
        .from('lesson_logs')
        .insert({
          studentId,
          studentName: student.name,
          type: 'add',
          lessons,
          notes: notes || '后台增课',
          operatorId: currentUser?.id,
          operatorName: (currentUser as any)?.name,
          organizationId: targetOrgId,
        })
        .select()
        .single();

      if (logError) {
        console.error('创建课时日志失败:', logError);
        // 日志创建失败不影响主流程
      }

      sendSuccess(res, {
        studentId,
        previousRemaining: currentRemaining,
        added: lessons,
        currentRemaining: newRemaining,
        log,
      }, `增课成功，当前剩余 ${newRemaining} 节`);
    } catch (error) {
      next(error);
    }
  },

  // 划课（扣减课时）
  deductLessons: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { studentId, lessons, classId, scheduleId, attendanceStatus, notes } = req.body;
      const currentUser = getCurrentUser(req);
      const targetOrgId = currentUser?.organizationId;

      if (!targetOrgId) {
        return next(new ApiError('未分配机构', 403, 'FORBIDDEN'));
      }

      if (!studentId || !lessons || lessons <= 0) {
        return next(new ApiError('参数错误', 400, 'INVALID_PARAMS'));
      }

      // 获取学员信息
      const { data: student, error: studentError } = await memfireAdmin
        .from('students')
        .select('*')
        .eq('id', studentId)
        .maybeSingle();

      if (studentError || !student) {
        return next(new ApiError('学员不存在', 404, 'STUDENT_NOT_FOUND'));
      }

      // 验证数据隔离
      if (student.organizationId !== targetOrgId) {
        return next(new ApiError('无权操作该学员', 403, 'FORBIDDEN'));
      }

      const currentRemaining = student.remainingLessons || 0;
      const actualDeduct = Math.min(lessons, currentRemaining);
      const newRemaining = Math.max(currentRemaining - lessons, 0);

      // 如果提供了班级和排课信息，创建考勤记录
      if (classId && scheduleId) {
        const { error: attendanceError } = await memfireAdmin
          .from('attendances')
          .insert({
            studentId,
            classId,
            scheduleId,
            status: attendanceStatus || 'present',
            notes: notes || '手动划课',
            organizationId: targetOrgId,
          });

        if (attendanceError) {
          console.error('创建考勤记录失败:', attendanceError);
          // 考勤记录创建失败不影响主流程
        }
      }

      // 更新学员剩余课时
      const { error: updateError } = await memfireAdmin
        .from('students')
        .update({ remainingLessons: newRemaining })
        .eq('id', studentId);

      if (updateError) {
        return next(new ApiError('更新学员课时失败', 500, 'UPDATE_ERROR'));
      }

      // 创建课时日志
      const { data: log, error: logError } = await memfireAdmin
        .from('lesson_logs')
        .insert({
          studentId,
          studentName: student.name,
          type: 'deduct',
          lessons: actualDeduct,
          notes: `${attendanceStatus === 'present' ? '出勤' : attendanceStatus === 'absent' ? '缺勤' : '请假'} - ${notes || ''}`,
          operatorId: currentUser?.id,
          operatorName: (currentUser as any)?.name,
          organizationId: targetOrgId,
        })
        .select()
        .single();

      if (logError) {
        console.error('创建课时日志失败:', logError);
      }

      sendSuccess(res, {
        studentId,
        previousRemaining: currentRemaining,
        deducted: actualDeduct,
        currentRemaining: newRemaining,
        log,
      }, `划课成功，扣除 ${actualDeduct} 节，剩余 ${newRemaining} 节`);
    } catch (error) {
      next(error);
    }
  },
};
