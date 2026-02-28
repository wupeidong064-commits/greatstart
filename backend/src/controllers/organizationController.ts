import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import { ApiError } from '../middleware/errorHandler';
import { sendSuccess, sendPaginated } from '../utils/response';
import { memfireAdmin } from '../config/memfire';

// 辅助函数：获取当前用户信息（兼容 req.user 和 req.memfireUser）
const getCurrentUser = (req: AuthRequest) => {
  return req.user || req.memfireUser;
};

export const organizationController = {
  getOrganizations: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const pageSize = parseInt(req.query.pageSize as string) || 10;
      const search = req.query.search as string;
      const currentUser = getCurrentUser(req);

      let query = memfireAdmin
        .from('organizations')
        .select('*')
        .order('createdAt', { ascending: false });

      // 数据隔离：
      // - admin: 可以看到所有机构
      // - 其他角色: 只能看到自己的机构
      if (currentUser?.role === 'admin') {
        // admin 不过滤，显示所有机构
      } else if (currentUser?.organizationId) {
        query = query.eq('id', currentUser.organizationId);
      } else {
        // 没有机构ID的非admin用户，返回空列表
        return sendPaginated(res, [], page, pageSize, 0);
      }

      // 分页
      query = query.range((page - 1) * pageSize, (page - 1) * pageSize + pageSize - 1);

      const { data: organizations, error } = await query;

      if (error) {
        return next(new ApiError('获取机构列表失败', 500, 'QUERY_ERROR'));
      }

      // 获取总数
      let countQuery = memfireAdmin
        .from('organizations')
        .select('*', { count: 'exact', head: true });

      if (currentUser?.role === 'admin') {
        // admin 不需要过滤
      } else if (currentUser?.organizationId) {
        countQuery = countQuery.eq('id', currentUser.organizationId);
      } else {
        // 没有机构ID的非admin用户，count为0
      }

      const { count } = await countQuery;

      // 客户端搜索过滤
      let filteredOrgs = organizations || [];
      if (search) {
        const searchLower = search.toLowerCase();
        filteredOrgs = filteredOrgs.filter((org: any) =>
          (org.name && org.name.toLowerCase().includes(searchLower)) ||
          (org.code && org.code.toLowerCase().includes(searchLower))
        );
      }

      sendPaginated(res, filteredOrgs, page, pageSize, count || 0);
    } catch (error) {
      next(error);
    }
  },

  getOrganizationById: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const currentUser = getCurrentUser(req);

      const { data: organization, error } = await memfireAdmin
        .from('organizations')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (error || !organization) {
        return next(new ApiError('机构不存在', 404, 'ORGANIZATION_NOT_FOUND'));
      }

      // 数据隔离：非admin只能查看自己机构
      if (currentUser?.role !== 'admin' && organization.id !== currentUser?.organizationId) {
        return next(new ApiError('无权访问', 403, 'FORBIDDEN'));
      }

      // 获取校区的数量
      const { data: campuses } = await memfireAdmin
        .from('campuses')
        .select('id', { count: 'exact' })
        .eq('organizationId', id);

      // 获取关联数据统计（简化版本）
      const result = {
        ...organization,
        campuses: campuses || [],
        _count: {
          campuses: campuses?.length || 0,
        },
      };

      sendSuccess(res, result);
    } catch (error) {
      next(error);
    }
  },

  createOrganization: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { name, code, address, phone, email } = req.body;
      const currentUser = getCurrentUser(req);

      // 只有 admin 可以创建机构
      if (currentUser?.role !== 'admin') {
        return next(new ApiError('无权创建机构', 403, 'FORBIDDEN'));
      }

      // 检查代码是否已存在
      const { data: existing } = await memfireAdmin
        .from('organizations')
        .select('id')
        .eq('code', code)
        .maybeSingle();

      if (existing) {
        return next(new ApiError('机构代码已存在', 400, 'CODE_EXISTS'));
      }

      const { data: organization, error } = await memfireAdmin
        .from('organizations')
        .insert({
          name,
          code,
          address,
          phone,
          email,
        })
        .select()
        .single();

      if (error) {
        return next(new ApiError('创建机构失败', 500, 'CREATE_ERROR'));
      }

      sendSuccess(res, organization, '机构创建成功', 201);
    } catch (error) {
      next(error);
    }
  },

  updateOrganization: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const { name, address, phone, email, isActive } = req.body;
      const currentUser = getCurrentUser(req);

      // 检查机构是否存在
      const { data: existing } = await memfireAdmin
        .from('organizations')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (!existing) {
        return next(new ApiError('机构不存在', 404, 'ORGANIZATION_NOT_FOUND'));
      }

      // 数据隔离检查
      if (currentUser?.role !== 'admin' && existing.id !== currentUser?.organizationId) {
        return next(new ApiError('无权修改该机构', 403, 'FORBIDDEN'));
      }

      const updateData: any = {};
      if (name) updateData.name = name;
      if (address !== undefined) updateData.address = address;
      if (phone !== undefined) updateData.phone = phone;
      if (email !== undefined) updateData.email = email;
      if (isActive !== undefined) updateData.isActive = isActive;

      const { data: updated, error } = await memfireAdmin
        .from('organizations')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        return next(new ApiError('更新机构失败', 500, 'UPDATE_ERROR'));
      }

      sendSuccess(res, updated, '机构更新成功');
    } catch (error) {
      next(error);
    }
  },

  deleteOrganization: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const currentUser = getCurrentUser(req);

      // 只有 admin 可以删除机构
      if (currentUser?.role !== 'admin') {
        return next(new ApiError('无权删除机构', 403, 'FORBIDDEN'));
      }

      // 检查机构是否存在
      const { data: existing } = await memfireAdmin
        .from('organizations')
        .select('id')
        .eq('id', id)
        .maybeSingle();

      if (!existing) {
        return next(new ApiError('机构不存在', 404, 'ORGANIZATION_NOT_FOUND'));
      }

      const { error } = await memfireAdmin
        .from('organizations')
        .delete()
        .eq('id', id);

      if (error) {
        return next(new ApiError('删除机构失败', 500, 'DELETE_ERROR'));
      }

      sendSuccess(res, null, '机构删除成功');
    } catch (error) {
      next(error);
    }
  },
};
