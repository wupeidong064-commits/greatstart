import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import { ApiError } from '../middleware/errorHandler';
import { sendSuccess, sendPaginated } from '../utils/response';
import { memfireAdmin } from '../config/memfire';

// 辅助函数：获取当前用户信息（兼容 req.user 和 req.memfireUser）
const getCurrentUser = (req: AuthRequest) => {
  return req.user || req.memfireUser;
};

export const scheduleController = {
  getSchedules: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const pageSize = parseInt(req.query.pageSize as string) || 10;
      const classId = req.query.classId as string;
      const startDate = req.query.startDate as string;
      const endDate = req.query.endDate as string;
      const status = req.query.status as string;
      const currentUser = getCurrentUser(req);

      // 数据隔离：使用用户自己的机构ID，admin可以看到所有数据
      const targetOrgId = currentUser?.organizationId;

      let query = memfireAdmin
        .from('schedules')
        .select('*')
        .order('startTime', { ascending: true });

      // Admin without orgId can see all schedules, otherwise filter by orgId
      if (targetOrgId) {
        query = query.eq('organizationId', targetOrgId);
      }

      // 班级过滤
      if (classId) {
        query = query.eq('classId', classId);
      }

      // 状态过滤
      if (status) {
        query = query.eq('status', status);
      }

      // 日期范围过滤 - 在数据库层面进行，而不是内存中
      if (startDate) {
        query = query.gte('startTime', startDate);
      }
      if (endDate) {
        query = query.lte('startTime', endDate);
      }

      // 获取总数（用于分页）- 在过滤后计算
      let countQuery = memfireAdmin
        .from('schedules')
        .select('*', { count: 'exact', head: true });

      if (targetOrgId) {
        countQuery = countQuery.eq('organizationId', targetOrgId);
      }

      if (classId) {
        countQuery = countQuery.eq('classId', classId);
      }

      if (status) {
        countQuery = countQuery.eq('status', status);
      }

      if (startDate) {
        countQuery = countQuery.gte('startTime', startDate);
      }
      if (endDate) {
        countQuery = countQuery.lte('startTime', endDate);
      }

      const { count } = await countQuery;

      // 分页 - 在所有过滤之后应用
      query = query.range((page - 1) * pageSize, (page - 1) * pageSize + pageSize - 1);

      const { data: schedules, error } = await query;

      if (error) {
        return next(new ApiError('获取排课列表失败', 500, 'QUERY_ERROR'));
      }

      sendPaginated(res, schedules || [], page, pageSize, count || 0);
    } catch (error) {
      next(error);
    }
  },

  getScheduleById: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const currentUser = getCurrentUser(req);

      const { data: schedule, error } = await memfireAdmin
        .from('schedules')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (error || !schedule) {
        return next(new ApiError('排课不存在', 404, 'SCHEDULE_NOT_FOUND'));
      }

      // 数据隔离检查
      if (currentUser?.role !== 'admin' && schedule.organizationId !== currentUser?.organizationId) {
        return next(new ApiError('无权访问', 403, 'FORBIDDEN'));
      }

      sendSuccess(res, schedule);
    } catch (error) {
      next(error);
    }
  },

  createSchedule: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const {
        classId,
        courseId,
        teacherId,
        startTime,
        endTime,
        classroom,
        campusId,
      } = req.body;

      const currentUser = getCurrentUser(req);
      const organizationId = req.body.organizationId || currentUser?.organizationId;
      const targetCampusId = campusId || currentUser?.campusId;

      if (!organizationId) {
        return next(new ApiError('必须指定机构', 400, 'MISSING_ORGANIZATION'));
      }

      // 验证班级
      const { data: classData } = await memfireAdmin
        .from('classes')
        .select('id, organizationId, campusId')
        .eq('id', classId)
        .maybeSingle();

      if (!classData || classData.organizationId !== organizationId) {
        return next(new ApiError('班级不存在或不属于该机构', 400, 'CLASS_NOT_FOUND'));
      }

      // 验证校区
      const finalCampusId = targetCampusId || classData.campusId;
      if (finalCampusId) {
        const { data: campus } = await memfireAdmin
          .from('campuses')
          .select('id, organizationId')
          .eq('id', finalCampusId)
          .maybeSingle();

        if (!campus || campus.organizationId !== organizationId) {
          return next(new ApiError('校区不存在或不属于该机构', 400, 'CAMPUS_NOT_FOUND'));
        }
      }

      const { data: schedule, error } = await memfireAdmin
        .from('schedules')
        .insert({
          organizationId,
          campusId: finalCampusId,
          classId,
          courseId,
          teacherId,
          startTime,
          endTime,
          classroom,
        })
        .select()
        .single();

      if (error) {
        return next(new ApiError('创建排课失败', 500, 'CREATE_ERROR'));
      }

      sendSuccess(res, schedule, '排课创建成功', 201);
    } catch (error) {
      next(error);
    }
  },

  updateSchedule: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const {
        teacherId,
        startTime,
        endTime,
        classroom,
        status,
        notes,
      } = req.body;
      const currentUser = getCurrentUser(req);

      const { data: schedule } = await memfireAdmin
        .from('schedules')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (!schedule) {
        return next(new ApiError('排课不存在', 404, 'SCHEDULE_NOT_FOUND'));
      }

      // 数据隔离检查
      if (currentUser?.role !== 'admin' && schedule.organizationId !== currentUser?.organizationId) {
        return next(new ApiError('无权修改该排课', 403, 'FORBIDDEN'));
      }

      const updateData: any = {};
      if (teacherId !== undefined) updateData.teacherId = teacherId;
      if (startTime) updateData.startTime = startTime;
      if (endTime) updateData.endTime = endTime;
      if (classroom !== undefined) updateData.classroom = classroom;
      if (status) updateData.status = status;
      if (notes !== undefined) updateData.notes = notes;

      const { data: updated, error } = await memfireAdmin
        .from('schedules')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        return next(new ApiError('更新排课失败', 500, 'UPDATE_ERROR'));
      }

      sendSuccess(res, updated, '排课更新成功');
    } catch (error) {
      next(error);
    }
  },

  deleteSchedule: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const currentUser = getCurrentUser(req);

      const { data: schedule } = await memfireAdmin
        .from('schedules')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (!schedule) {
        return next(new ApiError('排课不存在', 404, 'SCHEDULE_NOT_FOUND'));
      }

      // 数据隔离检查
      if (currentUser?.role !== 'admin' && schedule.organizationId !== currentUser?.organizationId) {
        return next(new ApiError('无权删除该排课', 403, 'FORBIDDEN'));
      }

      const { error } = await memfireAdmin
        .from('schedules')
        .delete()
        .eq('id', id);

      if (error) {
        return next(new ApiError('删除排课失败', 500, 'DELETE_ERROR'));
      }

      sendSuccess(res, null, '排课删除成功');
    } catch (error) {
      next(error);
    }
  },

  reschedule: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const { newStartTime, newEndTime, notes } = req.body;
      const currentUser = getCurrentUser(req);

      const { data: schedule } = await memfireAdmin
        .from('schedules')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (!schedule) {
        return next(new ApiError('排课不存在', 404, 'SCHEDULE_NOT_FOUND'));
      }

      // 数据隔离检查
      if (currentUser?.role !== 'admin' && schedule.organizationId !== currentUser?.organizationId) {
        return next(new ApiError('无权调课', 403, 'FORBIDDEN'));
      }

      // 创建新的排课记录，标记为调课
      const { data: newSchedule, error: insertError } = await memfireAdmin
        .from('schedules')
        .insert({
          organizationId: schedule.organizationId,
          campusId: schedule.campusId,
          classId: schedule.classId,
          courseId: schedule.courseId,
          teacherId: schedule.teacherId,
          startTime: newStartTime,
          endTime: newEndTime,
          classroom: schedule.classroom,
          status: 'rescheduled',
          originalScheduleId: schedule.id,
          notes: notes || `调课自 ${schedule.startTime}`,
        })
        .select()
        .single();

      if (insertError) {
        return next(new ApiError('调课失败', 500, 'CREATE_ERROR'));
      }

      // 更新原排课状态
      await memfireAdmin
        .from('schedules')
        .update({
          status: 'rescheduled',
          notes: `已调课至 ${newStartTime}`,
        })
        .eq('id', id);

      sendSuccess(res, newSchedule, '调课成功', 201);
    } catch (error) {
      next(error);
    }
  },

  createRecurringSchedules: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const {
        classId,
        organizationId,
        recurrenceType,
        startDate,
        endDate,
        weekDays,
        startTime,
        endTime,
        location,
        teacherId,
      } = req.body;

      const currentUser = getCurrentUser(req);
      const targetOrgId = organizationId || currentUser?.organizationId;

      if (!targetOrgId) {
        return next(new ApiError('必须指定机构', 400, 'MISSING_ORGANIZATION'));
      }

      if (!classId || !startDate || !endDate || !startTime || !endTime) {
        return next(new ApiError('缺少必要参数', 400, 'INVALID_PARAMS'));
      }

      // 验证班级
      const { data: classData } = await memfireAdmin
        .from('classes')
        .select('id, organizationId, campusId')
        .eq('id', classId)
        .maybeSingle();

      if (!classData || classData.organizationId !== targetOrgId) {
        return next(new ApiError('班级不存在或不属于该机构', 400, 'CLASS_NOT_FOUND'));
      }

      // 生成排课日期
      const schedules: any[] = [];
      const start = new Date(startDate);
      const end = new Date(endDate);
      const [startHour, startMinute] = startTime.split(':').map(Number);
      const [endHour, endMinute] = endTime.split(':').map(Number);

      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const dayOfWeek = d.getDay();

        // 检查是否在指定的星期几
        if (recurrenceType === 'weekly' && weekDays && weekDays.length > 0) {
          if (!weekDays.includes(dayOfWeek)) {
            continue;
          }
        }

        const scheduleStartTime = new Date(d);
        scheduleStartTime.setHours(startHour, startMinute, 0, 0);

        const scheduleEndTime = new Date(d);
        scheduleEndTime.setHours(endHour, endMinute, 0, 0);

        schedules.push({
          organizationId: targetOrgId,
          campusId: classData.campusId,
          classId,
          teacherId: teacherId || classData.teacherId,
          startTime: scheduleStartTime.toISOString(),
          endTime: scheduleEndTime.toISOString(),
          classroom: location,
          status: 'scheduled',
        });
      }

      if (schedules.length === 0) {
        return next(new ApiError('没有生成任何排课', 400, 'NO_SCHEDULES'));
      }

      // 批量插入排课
      const { data: createdSchedules, error } = await memfireAdmin
        .from('schedules')
        .insert(schedules)
        .select();

      if (error) {
        console.error('创建排课失败:', error);
        return next(new ApiError('创建排课失败', 500, 'CREATE_ERROR'));
      }

      sendSuccess(res, {
        count: createdSchedules?.length || 0,
        schedules: createdSchedules,
      }, '排课创建成功', 201);
    } catch (error) {
      next(error);
    }
  },

  // 取消班级的所有待上课排课
  cancelByClass: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { classId } = req.params;
      const currentUser = getCurrentUser(req);

      // 验证班级
      const { data: classData } = await memfireAdmin
        .from('classes')
        .select('id, organizationId')
        .eq('id', classId)
        .maybeSingle();

      if (!classData) {
        return next(new ApiError('班级不存在', 404, 'CLASS_NOT_FOUND'));
      }

      // 数据隔离检查
      if (currentUser?.role !== 'admin' && classData.organizationId !== currentUser?.organizationId) {
        return next(new ApiError('无权操作', 403, 'FORBIDDEN'));
      }

      // 取消所有待上课的排课
      const { error, count } = await memfireAdmin
        .from('schedules')
        .update({ status: 'cancelled' })
        .eq('classId', classId)
        .eq('status', 'scheduled');

      if (error) {
        return next(new ApiError('取消排课失败', 500, 'UPDATE_ERROR'));
      }

      sendSuccess(res, { cancelledCount: count }, '取消排课成功');
    } catch (error) {
      next(error);
    }
  },

  // 取消班级从指定日期起的所有未来排课
  cancelAllFuture: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { classId, fromDate } = req.body;
      const currentUser = getCurrentUser(req);

      if (!classId || !fromDate) {
        return next(new ApiError('缺少必要参数', 400, 'INVALID_PARAMS'));
      }

      // 验证班级
      const { data: classData } = await memfireAdmin
        .from('classes')
        .select('id, organizationId')
        .eq('id', classId)
        .maybeSingle();

      if (!classData) {
        return next(new ApiError('班级不存在', 404, 'CLASS_NOT_FOUND'));
      }

      // 数据隔离检查
      if (currentUser?.role !== 'admin' && classData.organizationId !== currentUser?.organizationId) {
        return next(new ApiError('无权操作', 403, 'FORBIDDEN'));
      }

      // 取消从指定日期起的待上课排课
      const startDate = new Date(fromDate);
      startDate.setHours(0, 0, 0, 0);

      const { error, count } = await memfireAdmin
        .from('schedules')
        .update({ status: 'cancelled' })
        .eq('classId', classId)
        .eq('status', 'scheduled')
        .gte('startTime', startDate.toISOString());

      if (error) {
        return next(new ApiError('取消排课失败', 500, 'UPDATE_ERROR'));
      }

      sendSuccess(res, { cancelledCount: count }, '取消未来排课成功');
    } catch (error) {
      next(error);
    }
  },
};
