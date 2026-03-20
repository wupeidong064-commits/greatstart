import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import { ApiError } from '../middleware/errorHandler';
import { sendSuccess, sendPaginated } from '../utils/response';

// 辅助函数：直接使用 fetch 查询数据库
const fetchFromDB = async (query: string) => {
  const envKey = process.env.MEMFIRE_SERVICE_ROLE_KEY || '';
  const envUrl = process.env.MEMFIRE_URL || '';
  const response = await fetch(`${envUrl}/rest/v1/${query}`, {
    headers: {
      'apikey': envKey,
      'Authorization': `Bearer ${envKey}`,
      'Content-Type': 'application/json'
    }
  });
  if (!response.ok) {
    throw new Error(`Database query failed: ${response.statusText}`);
  }
  return response.json();
};

// 辅助函数：获取当前用户信息（兼容 req.user 和 req.memfireUser）
const getCurrentUser = (req: AuthRequest) => {
  return req.user || req.memfireUser;
};

export const classController = {
  getClasses: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const pageSize = parseInt(req.query.pageSize as string) || 10;
      const search = req.query.search as string;
      const status = req.query.status as string;
      const campusId = req.query.campusId as string;
      const teacherId = req.query.teacherId as string;
      const currentUser = getCurrentUser(req);

      // 数据隔离：使用用户自己的机构ID，admin可以看到所有数据
      const targetOrgId = currentUser?.organizationId;
      const userRole = currentUser?.role;

      // 构建 URL 参数
      const params = new URLSearchParams();
      params.set('select', '*,teacher:users(id,name)');
      params.set('order', 'createdAt.desc');

      // Admin without orgId can see all classes, otherwise filter by orgId
      if (targetOrgId) {
        params.set('organizationId', `eq.${targetOrgId}`);
      }

      // 校区过滤逻辑：
      // - admin 和 manager：如果有 campusId 则按校区过滤
      // - coach 和 sales：可以看到整个机构的班级，完全忽略 campusId 参数
      const shouldFilterByCampus = userRole === 'admin' || userRole === 'manager';

      if (shouldFilterByCampus) {
        // 只有 admin 和 manager 才按校区过滤
        if (campusId) {
          params.set('campusId', `eq.${campusId}`);
        } else if (currentUser?.campusId && targetOrgId) {
          params.set('campusId', `eq.${currentUser.campusId}`);
        }
      }
      // coach 和 sales 完全忽略 campusId，可以看到整个机构的班级

      // 状态过滤
      if (status) {
        params.set('status', `eq.${status}`);
      }

      // 教练过滤
      if (teacherId) {
        params.set('teacherId', `eq.${teacherId}`);
      }

      // 分页
      const offset = (page - 1) * pageSize;
      params.set('offset', offset.toString());
      params.set('limit', pageSize.toString());

      // 使用 fetch 查询班级
      const classes = await fetchFromDB(`classes?${params.toString()}`);

      // 获取总数 - 使用 Prefer header
      const countParams = new URLSearchParams();
      countParams.set('select', '*');
      if (targetOrgId) {
        countParams.set('organizationId', `eq.${targetOrgId}`);
      }
      if (shouldFilterByCampus) {
        if (campusId) {
          countParams.set('campusId', `eq.${campusId}`);
        } else if (currentUser?.campusId && targetOrgId) {
          countParams.set('campusId', `eq.${currentUser.campusId}`);
        }
      }
      if (status) {
        countParams.set('status', `eq.${status}`);
      }
      if (teacherId) {
        countParams.set('teacherId', `eq.${teacherId}`);
      }

      // 获取总数 - 简化处理，直接查询所有记录
      const allClasses = await fetchFromDB(`classes?${countParams.toString()}`);
      const count = Array.isArray(allClasses) ? allClasses.length : 0;

      // 客户端搜索过滤
      let filteredClasses = classes || [];
      if (search) {
        const searchLower = search.toLowerCase();
        filteredClasses = filteredClasses.filter((c: any) =>
          (c.name && c.name.toLowerCase().includes(searchLower)) ||
          (c.code && c.code.toLowerCase().includes(searchLower))
        );
      }

      // 获取每个班级的学员数量
      const classesWithCounts = await Promise.all(
        filteredClasses.map(async (cls: any) => {
          try {
            const enrollments = await fetchFromDB(`enrollments?classId=eq.${cls.id}&status=eq.active&select=id`);
            const enrollmentCount = Array.isArray(enrollments) ? enrollments.length : 0;
            return {
              ...cls,
              _count: {
                enrollments: enrollmentCount,
              },
            };
          } catch {
            return {
              ...cls,
              _count: {
                enrollments: 0,
              },
            };
          }
        })
      );

      sendPaginated(res, classesWithCounts, page, pageSize, count || 0);
    } catch (error) {
      console.error('获取班级列表异常:', error);
      next(error);
    }
  },

  getClassById: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const currentUser = getCurrentUser(req);

      const classes = await fetchFromDB(`classes?id=eq.${id}&select=*`);
      const classData = Array.isArray(classes) && classes.length > 0 ? classes[0] : null;

      if (!classData) {
        return next(new ApiError('班级不存在', 404, 'CLASS_NOT_FOUND'));
      }

      // 数据隔离检查
      if (currentUser?.role !== 'admin' && classData.organizationId !== currentUser?.organizationId) {
        return next(new ApiError('无权访问', 403, 'FORBIDDEN'));
      }

      sendSuccess(res, classData);
    } catch (error) {
      next(error);
    }
  },

  createClass: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const {
        name,
        code,
        courseType,
        level,
        capacity,
        teacherId,
        startDate,
        endDate,
        description,
        campusId,
      } = req.body;

      const currentUser = getCurrentUser(req);
      const organizationId = req.body.organizationId || currentUser?.organizationId;
      const targetCampusId = campusId || currentUser?.campusId;

      if (!organizationId) {
        return next(new ApiError('必须指定机构', 400, 'MISSING_ORGANIZATION'));
      }

      // 检查代码是否已存在
      const { data: existing } = await memfireAdmin
        .from('classes')
        .select('id')
        .eq('organizationId', organizationId)
        .eq('code', code)
        .maybeSingle();

      if (existing) {
        return next(new ApiError('班级代码已存在', 400, 'CODE_EXISTS'));
      }

      // 验证校区
      if (targetCampusId) {
        const { data: campus } = await memfireAdmin
          .from('campuses')
          .select('id, organizationId')
          .eq('id', targetCampusId)
          .maybeSingle();

        if (!campus || campus.organizationId !== organizationId) {
          return next(new ApiError('校区不存在或不属于该机构', 400, 'CAMPUS_NOT_FOUND'));
        }
      }

      // 验证教练
      if (teacherId) {
        const { data: teacher } = await memfireAdmin
          .from('users')
          .select('id, organizationId')
          .eq('id', teacherId)
          .maybeSingle();

        if (!teacher || teacher.organizationId !== organizationId) {
          return next(new ApiError('教练不存在或不属于该机构', 400, 'TEACHER_NOT_FOUND'));
        }
      }

      const { data: newClass, error } = await memfireAdmin
        .from('classes')
        .insert({
          organizationId,
          campusId: targetCampusId,
          name,
          code,
          courseType,
          level,
          capacity,
          teacherId,
          startDate,
          endDate,
          description,
        })
        .select()
        .single();

      if (error) {
        return next(new ApiError('创建班级失败', 500, 'CREATE_ERROR'));
      }

      sendSuccess(res, newClass, '班级创建成功', 201);
    } catch (error) {
      next(error);
    }
  },

  updateClass: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const {
        name,
        code,
        courseType,
        level,
        capacity,
        teacherId,
        startDate,
        endDate,
        description,
        status,
        campusId,
        scheduleRule,
      } = req.body;
      const currentUser = getCurrentUser(req);

      const { data: classData } = await memfireAdmin
        .from('classes')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (!classData) {
        return next(new ApiError('班级不存在', 404, 'CLASS_NOT_FOUND'));
      }

      // 数据隔离检查
      if (currentUser?.role !== 'admin' && classData.organizationId !== currentUser?.organizationId) {
        return next(new ApiError('无权修改该班级', 403, 'FORBIDDEN'));
      }

      const updateData: any = {};
      if (name) updateData.name = name;
      if (code !== undefined) updateData.code = code;
      if (courseType) updateData.courseType = courseType;
      if (level !== undefined) updateData.level = level;
      if (capacity) updateData.capacity = capacity;
      if (teacherId !== undefined) updateData.teacherId = teacherId;
      if (startDate !== undefined) updateData.startDate = startDate;
      if (endDate !== undefined) updateData.endDate = endDate;
      if (description !== undefined) updateData.description = description;
      if (status) updateData.status = status;
      if (scheduleRule !== undefined) updateData.scheduleRule = scheduleRule;

      if (campusId) {
        const { data: campus } = await memfireAdmin
          .from('campuses')
          .select('id, organizationId')
          .eq('id', campusId)
          .maybeSingle();

        if (!campus || campus.organizationId !== classData.organizationId) {
          return next(new ApiError('校区不存在或不属于该机构', 400, 'CAMPUS_NOT_FOUND'));
        }
        updateData.campusId = campusId;
      }

      const { data: updated, error } = await memfireAdmin
        .from('classes')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        console.error('更新班级错误:', JSON.stringify(error, null, 2));
        console.error('updateData:', JSON.stringify(updateData, null, 2));
        return next(new ApiError(`更新班级失败: ${error.message || JSON.stringify(error)}`, 500, 'UPDATE_ERROR'));
      }

      sendSuccess(res, updated, '班级更新成功');
    } catch (error) {
      console.error('更新班级异常:', error);
      next(error);
    }
  },

  deleteClass: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const currentUser = getCurrentUser(req);

      const { data: classData } = await memfireAdmin
        .from('classes')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (!classData) {
        return next(new ApiError('班级不存在', 404, 'CLASS_NOT_FOUND'));
      }

      // 数据隔离检查
      if (currentUser?.role !== 'admin' && classData.organizationId !== currentUser?.organizationId) {
        return next(new ApiError('无权删除该班级', 403, 'FORBIDDEN'));
      }

      const { error } = await memfireAdmin
        .from('classes')
        .delete()
        .eq('id', id);

      if (error) {
        return next(new ApiError('删除班级失败', 500, 'DELETE_ERROR'));
      }

      sendSuccess(res, null, '班级删除成功');
    } catch (error) {
      next(error);
    }
  },

  getExperiencePriorityClasses: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const currentUser = getCurrentUser(req);
      const targetOrgId = currentUser?.organizationId;

      if (!targetOrgId) {
        return next(new ApiError('未分配机构', 403, 'FORBIDDEN'));
      }

      // 获取所有活跃班级
      const { data: allClasses } = await memfireAdmin
        .from('classes')
        .select('*, teacher:users(id, name)')
        .eq('organizationId', targetOrgId)
        .eq('status', 'active')
        .order('createdAt', { ascending: false });

      // 获取每个班级的学员数量
      const classesWithCounts = await Promise.all(
        (allClasses || []).map(async (cls: any) => {
          const { count } = await memfireAdmin
            .from('enrollments')
            .select('*', { count: 'exact', head: true })
            .eq('classId', cls.id)
            .eq('status', 'active');

          const currentStudents = count || 0;
          const availableSlots = Math.max(0, (cls.capacity || 0) - currentStudents);
          const fillRate = cls.capacity > 0 ? Math.round((currentStudents / cls.capacity) * 100) : 0;

          return {
            ...cls,
            currentStudents,
            availableSlots,
            fillRate,
            _count: {
              enrollments: currentStudents,
            },
          };
        })
      );

      // 按空位数排序（空位多的排前面）
      classesWithCounts.sort((a, b) => b.availableSlots - a.availableSlots);

      sendSuccess(res, classesWithCounts);
    } catch (error) {
      next(error);
    }
  },

  // 获取班级学员列表
  getClassStudents: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const currentUser = getCurrentUser(req);

      // 先验证班级存在且有权限
      const { data: classData } = await memfireAdmin
        .from('classes')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (!classData) {
        return next(new ApiError('班级不存在', 404, 'CLASS_NOT_FOUND'));
      }

      // 数据隔离检查
      if (currentUser?.role !== 'admin' && classData.organizationId !== currentUser?.organizationId) {
        return next(new ApiError('无权访问', 403, 'FORBIDDEN'));
      }

      // 获取班级的报名记录，包含学员信息
      const { data: enrollments, error } = await memfireAdmin
        .from('enrollments')
        .select(`
          id,
          status,
          enrolledAt,
          notes,
          student:students (
            id,
            name,
            gender,
            phone,
            parentPhone,
            parentName,
            status
          )
        `)
        .eq('classId', id)
        .eq('status', 'active');

      if (error) {
        return next(new ApiError('获取班级学员失败', 500, 'QUERY_ERROR'));
      }

      // 格式化返回数据
      const students = (enrollments || []).map((e: any) => ({
        ...e.student,
        enrollmentId: e.id,
        enrollmentStatus: e.status,
        enrollmentDate: e.enrolledAt,
        enrollmentNotes: e.notes,
      }));

      sendSuccess(res, students);
    } catch (error) {
      next(error);
    }
  },
};
