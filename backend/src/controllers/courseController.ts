import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import { ApiError } from '../middleware/errorHandler';
import { sendSuccess, sendPaginated } from '../utils/response';
import { memfireAdmin } from '../config/memfire';

// 辅助函数：获取当前用户信息（兼容 req.user 和 req.memfireUser）
const getCurrentUser = (req: AuthRequest) => {
  return req.user || req.memfireUser;
};

export const courseController = {
  getCourses: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const pageSize = parseInt(req.query.pageSize as string) || 10;
      const search = req.query.search as string;
      const isActive = req.query.isActive === 'true' ? true : req.query.isActive === 'false' ? false : undefined;
      const currentUser = getCurrentUser(req);

      // 数据隔离：使用用户自己的机构ID，admin可以看到所有数据
      const targetOrgId = currentUser?.organizationId;

      let query = memfireAdmin
        .from('courses')
        .select('*')
        .order('createdAt', { ascending: false });

      // Admin without orgId can see all courses, otherwise filter by orgId
      if (targetOrgId) {
        query = query.eq('organizationId', targetOrgId);
      }

      // 状态过滤
      if (isActive !== undefined) {
        query = query.eq('isActive', isActive);
      }

      // 分页
      query = query.range((page - 1) * pageSize, (page - 1) * pageSize + pageSize - 1);

      const { data: courses, error } = await query;

      if (error) {
        return next(new ApiError('获取课程列表失败', 500, 'QUERY_ERROR'));
      }

      // 获取总数
      let countQuery = memfireAdmin
        .from('courses')
        .select('*', { count: 'exact', head: true });

      if (targetOrgId) {
        countQuery = countQuery.eq('organizationId', targetOrgId);
      }

      if (isActive !== undefined) {
        countQuery = countQuery.eq('isActive', isActive);
      }

      const { count } = await countQuery;

      // 客户端搜索过滤
      let filteredCourses = courses || [];
      if (search) {
        const searchLower = search.toLowerCase();
        filteredCourses = filteredCourses.filter((c: any) =>
          (c.name && c.name.toLowerCase().includes(searchLower)) ||
          (c.code && c.code.toLowerCase().includes(searchLower))
        );
      }

      sendPaginated(res, filteredCourses, page, pageSize, count || 0);
    } catch (error) {
      next(error);
    }
  },

  getCourseById: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const currentUser = getCurrentUser(req);

      const { data: course, error } = await memfireAdmin
        .from('courses')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (error || !course) {
        return next(new ApiError('课程不存在', 404, 'COURSE_NOT_FOUND'));
      }

      // 数据隔离检查
      if (currentUser?.role !== 'admin' && course.organizationId !== currentUser?.organizationId) {
        return next(new ApiError('无权访问', 403, 'FORBIDDEN'));
      }

      sendSuccess(res, course);
    } catch (error) {
      next(error);
    }
  },

  createCourse: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { name, code, description, duration, price } = req.body;
      const currentUser = getCurrentUser(req);
      const organizationId = req.body.organizationId || currentUser?.organizationId;

      if (!organizationId) {
        return next(new ApiError('必须指定机构', 400, 'MISSING_ORGANIZATION'));
      }

      // 检查代码是否已存在
      const { data: existing } = await memfireAdmin
        .from('courses')
        .select('id')
        .eq('organizationId', organizationId)
        .eq('code', code)
        .maybeSingle();

      if (existing) {
        return next(new ApiError('课程代码已存在', 400, 'CODE_EXISTS'));
      }

      const { data: course, error } = await memfireAdmin
        .from('courses')
        .insert({
          organizationId,
          name,
          code,
          description,
          duration,
          price: price ? parseFloat(price) : 0,
        })
        .select()
        .single();

      if (error) {
        return next(new ApiError('创建课程失败', 500, 'CREATE_ERROR'));
      }

      sendSuccess(res, course, '课程创建成功', 201);
    } catch (error) {
      next(error);
    }
  },

  updateCourse: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const { name, description, duration, price, isActive } = req.body;
      const currentUser = getCurrentUser(req);

      const { data: course } = await memfireAdmin
        .from('courses')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (!course) {
        return next(new ApiError('课程不存在', 404, 'COURSE_NOT_FOUND'));
      }

      // 数据隔离检查
      if (currentUser?.role !== 'admin' && course.organizationId !== currentUser?.organizationId) {
        return next(new ApiError('无权修改该课程', 403, 'FORBIDDEN'));
      }

      const updateData: any = {};
      if (name) updateData.name = name;
      if (description !== undefined) updateData.description = description;
      if (duration) updateData.duration = duration;
      if (price !== undefined) updateData.price = parseFloat(price);
      if (isActive !== undefined) updateData.isActive = isActive;

      const { data: updated, error } = await memfireAdmin
        .from('courses')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        return next(new ApiError('更新课程失败', 500, 'UPDATE_ERROR'));
      }

      sendSuccess(res, updated, '课程更新成功');
    } catch (error) {
      next(error);
    }
  },

  deleteCourse: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const currentUser = getCurrentUser(req);

      const { data: course } = await memfireAdmin
        .from('courses')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (!course) {
        return next(new ApiError('课程不存在', 404, 'COURSE_NOT_FOUND'));
      }

      // 数据隔离检查
      if (currentUser?.role !== 'admin' && course.organizationId !== currentUser?.organizationId) {
        return next(new ApiError('无权删除该课程', 403, 'FORBIDDEN'));
      }

      const { error } = await memfireAdmin
        .from('courses')
        .delete()
        .eq('id', id);

      if (error) {
        return next(new ApiError('删除课程失败', 500, 'DELETE_ERROR'));
      }

      sendSuccess(res, null, '课程删除成功');
    } catch (error) {
      next(error);
    }
  },
};
