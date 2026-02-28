import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import { ApiError } from '../middleware/errorHandler';
import { sendSuccess, sendPaginated } from '../utils/response';
import { memfireAdmin } from '../config/memfire';

// 辅助函数：获取当前用户信息
const getCurrentUser = (req: AuthRequest) => {
  return req.user || req.memfireUser;
};

export const resourceTransferController = {
  /**
   * 获取教练的资源统计
   * GET /api/resource-transfers/teacher-resources/:teacherId
   */
  getTeacherResources: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { teacherId } = req.params;
      const currentUser = getCurrentUser(req);
      const targetOrgId = currentUser?.organizationId;

      if (!targetOrgId) {
        return next(new ApiError('未分配机构', 403, 'FORBIDDEN'));
      }

      // 验证教练属于当前机构
      const { data: teacher, error: teacherError } = await memfireAdmin
        .from('users')
        .select('id, name, email, role, isActive')
        .eq('id', teacherId)
        .eq('organizationId', targetOrgId)
        .maybeSingle();

      if (teacherError || !teacher) {
        return next(new ApiError('教练不存在或无权访问', 404, 'TEACHER_NOT_FOUND'));
      }

      // 获取班级列表
      const { data: classes, error: classesError } = await memfireAdmin
        .from('classes')
        .select('id, name, code, courseType, level, capacity, status, createdAt')
        .eq('teacherId', teacherId)
        .eq('organizationId', targetOrgId)
        .order('createdAt', { ascending: false });

      if (classesError) {
        console.error('获取班级失败:', classesError);
        return next(new ApiError('获取班级失败', 500, 'QUERY_ERROR'));
      }

      // 获取每个班级的学员数量
      const classesWithStudentCount = await Promise.all(
        (classes || []).map(async (cls: any) => {
          const { count } = await memfireAdmin
            .from('enrollments')
            .select('*', { count: 'exact', head: true })
            .eq('classId', cls.id)
            .eq('status', 'active');
          return { ...cls, studentCount: count || 0 };
        })
      );

      // 获取排课记录统计
      const { count: totalSchedules } = await memfireAdmin
        .from('schedules')
        .select('*', { count: 'exact', head: true })
        .eq('teacherId', teacherId)
        .eq('organizationId', targetOrgId);

      const { count: upcomingSchedules } = await memfireAdmin
        .from('schedules')
        .select('*', { count: 'exact', head: true })
        .eq('teacherId', teacherId)
        .eq('organizationId', targetOrgId)
        .eq('status', 'scheduled');

      const { count: completedSchedules } = await memfireAdmin
        .from('schedules')
        .select('*', { count: 'exact', head: true })
        .eq('teacherId', teacherId)
        .eq('organizationId', targetOrgId)
        .eq('status', 'completed');

      // 获取排课详情（最近50条）
      const { data: schedules, error: schedulesError } = await memfireAdmin
        .from('schedules')
        .select('id, startTime, endTime, status, classroom, class:classes(id, name)')
        .eq('teacherId', teacherId)
        .eq('organizationId', targetOrgId)
        .order('startTime', { ascending: false })
        .range(0, 49);

      if (schedulesError) {
        console.error('获取排课失败:', schedulesError);
        return next(new ApiError('获取排课失败', 500, 'QUERY_ERROR'));
      }

      // 汇总数据
      const totalStudents = classesWithStudentCount.reduce((sum, c) => sum + c.studentCount, 0);

      sendSuccess(res, {
        teacher: {
          id: teacher.id,
          name: teacher.name,
          email: teacher.email,
          role: teacher.role,
          isActive: teacher.isActive,
        },
        summary: {
          classCount: classes?.length || 0,
          studentCount: totalStudents,
          totalScheduleCount: totalSchedules || 0,
          upcomingScheduleCount: upcomingSchedules || 0,
          completedScheduleCount: completedSchedules || 0,
        },
        classes: classesWithStudentCount,
        schedules: schedules || [],
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * 执行资源交接
   * POST /api/resource-transfers/execute
   */
  executeTransfer: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { fromTeacherId, toTeacherId, classIds, notes } = req.body;
      const currentUser = getCurrentUser(req);
      const targetOrgId = currentUser?.organizationId;

      if (!targetOrgId) {
        return next(new ApiError('未分配机构', 403, 'FORBIDDEN'));
      }

      if (!fromTeacherId || !toTeacherId) {
        return next(new ApiError('必须指定离职教练和接手教练', 400, 'MISSING_TEACHERS'));
      }

      if (fromTeacherId === toTeacherId) {
        return next(new ApiError('不能将资源交接给自己', 400, 'SAME_TEACHER'));
      }

      // 验证两个教练都存在且属于当前机构
      const { data: fromTeacher } = await memfireAdmin
        .from('users')
        .select('id, name, role')
        .eq('id', fromTeacherId)
        .eq('organizationId', targetOrgId)
        .maybeSingle();

      const { data: toTeacher } = await memfireAdmin
        .from('users')
        .select('id, name, role')
        .eq('id', toTeacherId)
        .eq('organizationId', targetOrgId)
        .maybeSingle();

      if (!fromTeacher || !toTeacher) {
        return next(new ApiError('教练不存在或无权访问', 404, 'TEACHER_NOT_FOUND'));
      }

      // 获取要交接的班级
      let targetClassIds = classIds;
      if (!targetClassIds || targetClassIds.length === 0) {
        // 如果没有指定，交接所有班级
        const { data: allClasses } = await memfireAdmin
          .from('classes')
          .select('id')
          .eq('teacherId', fromTeacherId)
          .eq('organizationId', targetOrgId);
        targetClassIds = (allClasses || []).map((c: any) => c.id);
      }

      const transferDetails: any = {
        classes: targetClassIds,
        schedules: [],
        classCount: targetClassIds.length,
        scheduleCount: 0,
        studentCount: 0,
      };

      // 1. 更新班级的 teacherId
      if (targetClassIds.length > 0) {
        const { error: updateClassesError } = await memfireAdmin
          .from('classes')
          .update({ teacherId: toTeacherId })
          .in('id', targetClassIds);

        if (updateClassesError) {
          console.error('更新班级失败:', updateClassesError);
          return next(new ApiError('更新班级失败: ' + updateClassesError.message, 500, 'UPDATE_ERROR'));
        }

        // 2. 更新这些班级相关排课的 teacherId
        const { data: updatedSchedules, error: updateSchedulesError } = await memfireAdmin
          .from('schedules')
          .update({ teacherId: toTeacherId })
          .in('classId', targetClassIds)
          .select('id');

        if (updateSchedulesError) {
          console.error('更新排课失败:', updateSchedulesError);
          // 不回滚班级更新，记录错误但继续
        }

        transferDetails.schedules = (updatedSchedules || []).map((s: any) => s.id);
        transferDetails.scheduleCount = updatedSchedules?.length || 0;

        // 3. 统计涉及学员数
        const { count: studentCount } = await memfireAdmin
          .from('enrollments')
          .select('*', { count: 'exact', head: true })
          .in('classId', targetClassIds)
          .eq('status', 'active');
        transferDetails.studentCount = studentCount || 0;
      }

      // 4. 创建交接日志
      const { data: transferLog, error: logError } = await memfireAdmin
        .from('resource_transfers')
        .insert({
          organization_id: targetOrgId,
          from_teacher_id: fromTeacherId,
          from_teacher_name: fromTeacher.name,
          to_teacher_id: toTeacherId,
          to_teacher_name: toTeacher.name,
          transfer_details: transferDetails,
          status: 'completed',
          operated_by: currentUser?.id,
          operated_by_name: currentUser?.name || currentUser?.email,
          notes,
        })
        .select()
        .single();

      if (logError) {
        console.error('创建交接日志失败:', logError);
        // 交接已完成，仅日志记录失败
      }

      sendSuccess(res, {
        transferId: transferLog?.id,
        fromTeacher: { id: fromTeacherId, name: fromTeacher.name },
        toTeacher: { id: toTeacherId, name: toTeacher.name },
        details: transferDetails,
      }, '资源交接成功');
    } catch (error) {
      next(error);
    }
  },

  /**
   * 获取交接历史记录
   * GET /api/resource-transfers/history
   */
  getTransferHistory: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const pageSize = parseInt(req.query.pageSize as string) || 20;
      const currentUser = getCurrentUser(req);
      const targetOrgId = currentUser?.organizationId;

      if (!targetOrgId) {
        return next(new ApiError('未分配机构', 403, 'FORBIDDEN'));
      }

      // 查询交接历史
      const { data: transfers, error } = await memfireAdmin
        .from('resource_transfers')
        .select('*')
        .eq('organization_id', targetOrgId)
        .order('created_at', { ascending: false })
        .range((page - 1) * pageSize, (page - 1) * pageSize + pageSize - 1);

      if (error) {
        console.error('获取交接历史失败:', error);
        return next(new ApiError('获取交接历史失败', 500, 'QUERY_ERROR'));
      }

      // 获取总数
      const { count } = await memfireAdmin
        .from('resource_transfers')
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', targetOrgId);

      sendPaginated(res, transfers || [], page, pageSize, count || 0);
    } catch (error) {
      next(error);
    }
  },

  /**
   * 获取交接详情
   * GET /api/resource-transfers/:id
   */
  getTransferById: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const currentUser = getCurrentUser(req);
      const targetOrgId = currentUser?.organizationId;

      const { data: transfer, error } = await memfireAdmin
        .from('resource_transfers')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (error || !transfer) {
        return next(new ApiError('交接记录不存在', 404, 'TRANSFER_NOT_FOUND'));
      }

      // 数据隔离检查
      if (targetOrgId && transfer.organization_id !== targetOrgId) {
        return next(new ApiError('无权访问', 403, 'FORBIDDEN'));
      }

      sendSuccess(res, transfer);
    } catch (error) {
      next(error);
    }
  },
};
