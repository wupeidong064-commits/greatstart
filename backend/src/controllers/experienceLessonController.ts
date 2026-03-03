import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import { ApiError } from '../middleware/errorHandler';
import { sendSuccess, sendPaginated } from '../utils/response';
import { memfireAdmin } from '../config/memfire';

// 辅助函数：获取当前用户信息
const getCurrentUser = (req: AuthRequest) => {
  return req.user || req.memfireUser;
};

export const experienceLessonController = {
  // 获取体验课列表
  getExperienceLessons: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const pageSize = parseInt(req.query.pageSize as string) || 10;
      const teachingTeacherId = req.query.teachingTeacherId as string;
      const assigneeId = req.query.assigneeId as string;
      const status = req.query.status as string;
      const unconvertedOnly = req.query.unconvertedOnly === 'true';
      const studentName = req.query.studentName as string;

      const currentUser = getCurrentUser(req);
      const targetOrgId = currentUser?.organizationId;

      if (!targetOrgId) {
        return next(new ApiError('未分配机构', 403, 'FORBIDDEN'));
      }

      let query = memfireAdmin
        .from('experience_lessons')
        .select('*')
        .eq('organizationId', targetOrgId)
        .order('scheduleDate', { ascending: false });

      // 筛选条件
      if (teachingTeacherId) {
        query = query.eq('teachingTeacherId', teachingTeacherId);
      }
      if (assigneeId) {
        query = query.eq('assigneeId', assigneeId);
      }
      // 学员名称筛选（模糊匹配）
      if (studentName) {
        query = query.ilike('studentName', `%${studentName}%`);
      }

      // 支持多状态筛选（逗号分隔）
      if (status) {
        const statusList = status.split(',').map(s => s.trim());
        if (statusList.length === 1) {
          query = query.eq('status', statusList[0]);
        } else {
          query = query.in('status', statusList);
        }
      }

      // 未成单筛选：状态为 completed 但不是 converted
      // 注意：这个逻辑会在 status 筛选之后应用
      // 如果 unconvertedOnly 为 true，需要筛选 status=completed 且 convertedAt 为空的记录
      // 由于我们使用 status 来表示，所以这里只需要确保 status 不是 converted
      // 实际上，如果 unconvertedOnly=true，前端应该同时传 status=completed

      // 分页
      query = query.range((page - 1) * pageSize, (page - 1) * pageSize + pageSize - 1);

      const { data: lessons, error } = await query;

      if (error) {
        return next(new ApiError('获取体验课列表失败', 500, 'QUERY_ERROR'));
      }

      // 如果需要未成单筛选，在内存中过滤
      let filteredLessons = lessons || [];
      if (unconvertedOnly) {
        filteredLessons = filteredLessons.filter(
          (lesson: any) => lesson.status !== 'converted'
        );
      }

      // 获取总数
      let countQuery = memfireAdmin
        .from('experience_lessons')
        .select('*', { count: 'exact', head: true })
        .eq('organizationId', targetOrgId);

      if (teachingTeacherId) countQuery = countQuery.eq('teachingTeacherId', teachingTeacherId);
      if (assigneeId) countQuery = countQuery.eq('assigneeId', assigneeId);
      if (status) {
        const statusList = status.split(',').map(s => s.trim());
        if (statusList.length === 1) {
          countQuery = countQuery.eq('status', statusList[0]);
        } else {
          countQuery = countQuery.in('status', statusList);
        }
      }

      const { count } = await countQuery;

      // 如果有未成单筛选，需要重新计算 count
      let finalCount = count || 0;
      if (unconvertedOnly) {
        // 获取所有符合条件的记录来计算准确的 count
        let countAllQuery = memfireAdmin
          .from('experience_lessons')
          .select('status')
          .eq('organizationId', targetOrgId);

        if (teachingTeacherId) countAllQuery = countAllQuery.eq('teachingTeacherId', teachingTeacherId);
        if (assigneeId) countAllQuery = countAllQuery.eq('assigneeId', assigneeId);
        if (status) {
          const statusList = status.split(',').map(s => s.trim());
          if (statusList.length === 1) {
            countAllQuery = countAllQuery.eq('status', statusList[0]);
          } else {
            countAllQuery = countAllQuery.in('status', statusList);
          }
        }

        const { data: allData } = await countAllQuery;
        finalCount = (allData || []).filter((item: any) => item.status !== 'converted').length;
      }

      sendPaginated(res, filteredLessons, page, pageSize, finalCount);
    } catch (error) {
      next(error);
    }
  },

  // 创建体验课
  createExperienceLesson: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const currentUser = getCurrentUser(req);
      const targetOrgId = currentUser?.organizationId;

      if (!targetOrgId) {
        return next(new ApiError('未分配机构', 403, 'FORBIDDEN'));
      }

      const {
        studentName, age, contact, source, leadId,
        classId, className, scheduleDate, startTime, endTime,
        teachingTeacherId, teachingTeacherName, assigneeId, assigneeName,
        status, notes
      } = req.body;

      // 销售角色创建体验课时，如果没有指定负责人，默认设置为当前用户
      let finalAssigneeId = assigneeId;
      let finalAssigneeName = assigneeName;
      if (!assigneeId && currentUser?.role === 'sales') {
        finalAssigneeId = currentUser.id;
        finalAssigneeName = currentUser.email?.split('@')[0] || currentUser.email || '未知';
      }

      const { data: lesson, error } = await memfireAdmin
        .from('experience_lessons')
        .insert({
          organizationId: targetOrgId,
          studentName,
          age,
          contact,
          source,
          leadId,
          classId,
          className,
          scheduleDate,
          startTime,
          endTime,
          teachingTeacherId,
          teachingTeacherName,
          assigneeId: finalAssigneeId,
          assigneeName: finalAssigneeName,
          status: status || 'pending',
          notes,
        })
        .select()
        .single();

      if (error) {
        console.error('创建体验课失败:', error);
        return next(new ApiError('创建体验课失败', 500, 'CREATE_ERROR'));
      }

      sendSuccess(res, lesson, '创建成功', 201);
    } catch (error) {
      next(error);
    }
  },

  // 更新体验课
  updateExperienceLesson: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const currentUser = getCurrentUser(req);

      const { data: existing } = await memfireAdmin
        .from('experience_lessons')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (!existing) {
        return next(new ApiError('体验课不存在', 404, 'NOT_FOUND'));
      }

      // 数据隔离检查
      if (currentUser?.role !== 'admin' && existing.organizationId !== currentUser?.organizationId) {
        return next(new ApiError('无权修改', 403, 'FORBIDDEN'));
      }

      const { data: updated, error } = await memfireAdmin
        .from('experience_lessons')
        .update(req.body)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        return next(new ApiError('更新失败', 500, 'UPDATE_ERROR'));
      }

      sendSuccess(res, updated, '更新成功');
    } catch (error) {
      next(error);
    }
  },

  // 更新体验课状态
  updateStatus: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const { status } = req.body;
      const currentUser = getCurrentUser(req);

      const { data: existing } = await memfireAdmin
        .from('experience_lessons')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (!existing) {
        return next(new ApiError('体验课不存在', 404, 'NOT_FOUND'));
      }

      if (currentUser?.role !== 'admin' && existing.organizationId !== currentUser?.organizationId) {
        return next(new ApiError('无权修改', 403, 'FORBIDDEN'));
      }

      const { data: updated, error } = await memfireAdmin
        .from('experience_lessons')
        .update({ status })
        .eq('id', id)
        .select()
        .single();

      if (error) {
        return next(new ApiError('更新状态失败', 500, 'UPDATE_ERROR'));
      }

      sendSuccess(res, updated, '状态更新成功');
    } catch (error) {
      next(error);
    }
  },

  // 删除体验课
  deleteExperienceLesson: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const currentUser = getCurrentUser(req);

      const { data: existing } = await memfireAdmin
        .from('experience_lessons')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (!existing) {
        return next(new ApiError('体验课不存在', 404, 'NOT_FOUND'));
      }

      if (currentUser?.role !== 'admin' && existing.organizationId !== currentUser?.organizationId) {
        return next(new ApiError('无权删除', 403, 'FORBIDDEN'));
      }

      const { error } = await memfireAdmin
        .from('experience_lessons')
        .delete()
        .eq('id', id);

      if (error) {
        return next(new ApiError('删除失败', 500, 'DELETE_ERROR'));
      }

      sendSuccess(res, null, '删除成功');
    } catch (error) {
      next(error);
    }
  },

  // 获取未成单列表（到场但未成单的体验课 + 未到场的体验课）
  getUnconverted: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const currentUser = getCurrentUser(req);
      const targetOrgId = currentUser?.organizationId;

      console.log('[DEBUG getUnconverted] currentUser:', { id: currentUser?.id, role: currentUser?.role });
      console.log('[DEBUG getUnconverted] targetOrgId:', targetOrgId);

      if (!targetOrgId) {
        return next(new ApiError('未分配机构', 403, 'FORBIDDEN'));
      }

      // 辅助函数：检查是否为管理员
      const isAdminOrManager = (user: any) => {
        const role = user?.role;
        return role === 'admin' || role === 'manager';
      };

      // 筛选条件：到场（completed）或未到场（noshow/no-show）但未成单的记录
      // 体验课状态：pending(待上课) -> completed(到场)/noshow(未到场) -> converted(已成单)
      // 待回访 = 已到场或未到场，但状态不是 converted 的记录
      let query = memfireAdmin
        .from('experience_lessons')
        .select('*')
        .eq('organizationId', targetOrgId)
        .in('status', ['completed', 'noshow', 'no-show']);  // 已到场或未到场

      // 非管理人员只能看到自己负责的体验课（防止翘单）
      const isManager = isAdminOrManager(currentUser);
      console.log('[DEBUG getUnconverted] isManager:', isManager);

      if (!isManager && currentUser?.id) {
        query = query.eq('assigneeId', currentUser.id);
        console.log('[DEBUG getUnconverted] Filtering by assigneeId:', currentUser.id);
      }

      query = query.order('scheduleDate', { ascending: false }).limit(50);

      const { data: lessons, error } = await query;

      console.log('[DEBUG getUnconverted] results count:', lessons?.length || 0);
      console.log('[DEBUG getUnconverted] error:', error);

      if (error) {
        return next(new ApiError('获取未成单列表失败', 500, 'QUERY_ERROR'));
      }

      sendSuccess(res, lessons || []);
    } catch (error) {
      console.error('[ERROR getUnconverted]', error);
      next(error);
    }
  },

  // 获取教练转化率统计
  getTeacherConversionStats: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const currentUser = getCurrentUser(req);
      const targetOrgId = currentUser?.organizationId;
      const teachingTeacherId = req.query.teachingTeacherId as string;
      const assigneeId = req.query.assigneeId as string;
      const startDate = req.query.startDate as string;
      const endDate = req.query.endDate as string;

      if (!targetOrgId) {
        return next(new ApiError('未分配机构', 403, 'FORBIDDEN'));
      }

      // 构建查询：获取所有体验课
      let query = memfireAdmin
        .from('experience_lessons')
        .select('teachingTeacherId, teachingTeacherName, status')
        .eq('organizationId', targetOrgId);

      // 按上课教练筛选
      if (teachingTeacherId) {
        query = query.eq('teachingTeacherId', teachingTeacherId);
      }

      // 按负责人筛选
      if (assigneeId) {
        query = query.eq('assigneeId', assigneeId);
      }

      // 按日期范围筛选（按 scheduleDate）
      if (startDate) {
        query = query.gte('scheduleDate', startDate);
      }
      if (endDate) {
        query = query.lte('scheduleDate', endDate);
      }

      const { data: lessons, error } = await query;

      if (error) {
        console.error('获取教练转化率数据失败:', error);
        return next(new ApiError('获取教练转化率失败', 500, 'QUERY_ERROR'));
      }

      // 按教练分组统计
      const statsMap = new Map<string, { teacherId: string; teacherName: string; total: number; converted: number }>();

      for (const lesson of lessons || []) {
        const teacherId = lesson.teachingTeacherId;
        const teacherName = lesson.teachingTeacherName || '未知教练';

        if (!teacherId) continue; // 跳过没有教练的记录

        if (!statsMap.has(teacherId)) {
          statsMap.set(teacherId, {
            teacherId,
            teacherName,
            total: 0,
            converted: 0,
          });
        }

        const stats = statsMap.get(teacherId)!;
        stats.total++;
        if (lesson.status === 'converted') {
          stats.converted++;
        }
      }

      // 转换为数组并计算转化率
      const result = Array.from(statsMap.values()).map(stats => ({
        teacherId: stats.teacherId,
        teacherName: stats.teacherName,
        total: stats.total,
        converted: stats.converted,
        conversionRate: stats.total > 0 ? Math.round((stats.converted / stats.total) * 100) : 0,
      }));

      // 按转化率降序排序
      result.sort((a, b) => b.conversionRate - a.conversionRate);

      sendSuccess(res, result);
    } catch (error) {
      next(error);
    }
  },
};
