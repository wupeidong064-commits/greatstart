import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import { ApiError } from '../middleware/errorHandler';
import { sendSuccess } from '../utils/response';
import { memfireAdmin } from '../config/memfire';

// 辅助函数：获取当前用户信息（兼容 req.user 和 req.memfireUser）
const getCurrentUser = (req: AuthRequest) => {
  return req.user || req.memfireUser;
};

export const campusController = {
  getCampuses: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const organizationId = (req.query.organizationId as string);
      const currentUser = getCurrentUser(req);

      // 使用用户自己的机构ID（如果没有指定）
      const targetOrgId = organizationId || currentUser?.organizationId;

      if (!targetOrgId) {
        return next(new ApiError('必须指定机构', 400, 'MISSING_ORGANIZATION'));
      }

      // 数据隔离检查
      if (currentUser?.role !== 'admin' && targetOrgId !== currentUser?.organizationId) {
        return next(new ApiError('无权访问该机构数据', 403, 'FORBIDDEN'));
      }

      const { data: campuses, error } = await memfireAdmin
        .from('campuses')
        .select('*')
        .eq('organizationId', targetOrgId)
        .eq('isActive', true)
        .order('createdAt', { ascending: false });

      if (error) {
        return next(new ApiError('获取校区列表失败', 500, 'QUERY_ERROR'));
      }

      sendSuccess(res, campuses || []);
    } catch (error) {
      next(error);
    }
  },

  getCampusById: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const currentUser = getCurrentUser(req);

      const { data: campus, error } = await memfireAdmin
        .from('campuses')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (error || !campus) {
        return next(new ApiError('校区不存在', 404, 'CAMPUS_NOT_FOUND'));
      }

      // 数据隔离检查
      if (currentUser?.role !== 'admin' && campus.organizationId !== currentUser?.organizationId) {
        return next(new ApiError('无权访问', 403, 'FORBIDDEN'));
      }

      // 获取关联的机构信息
      const { data: organization } = await memfireAdmin
        .from('organizations')
        .select('id, name, code')
        .eq('id', campus.organizationId)
        .maybeSingle();

      const result = {
        ...campus,
        organization,
      };

      sendSuccess(res, result);
    } catch (error) {
      next(error);
    }
  },

  createCampus: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { name, code, address, phone, organizationId } = req.body;
      const currentUser = getCurrentUser(req);

      const targetOrgId = organizationId || currentUser?.organizationId;
      if (!targetOrgId) {
        return next(new ApiError('必须指定机构', 400, 'MISSING_ORGANIZATION'));
      }

      // 数据隔离检查
      if (currentUser?.role !== 'admin' && targetOrgId !== currentUser?.organizationId) {
        return next(new ApiError('无权在该机构创建校区', 403, 'FORBIDDEN'));
      }

      // 检查代码是否已存在（在同一机构内）
      const { data: existing } = await memfireAdmin
        .from('campuses')
        .select('id')
        .eq('organizationId', targetOrgId)
        .eq('code', code)
        .maybeSingle();

      if (existing) {
        return next(new ApiError('校区代码在该机构内已存在', 400, 'CODE_EXISTS'));
      }

      const { data: campus, error } = await memfireAdmin
        .from('campuses')
        .insert({
          name,
          code,
          address,
          phone,
          organizationId: targetOrgId,
        })
        .select()
        .single();

      if (error) {
        return next(new ApiError('创建校区失败', 500, 'CREATE_ERROR'));
      }

      sendSuccess(res, campus, '校区创建成功', 201);
    } catch (error) {
      next(error);
    }
  },

  updateCampus: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const { name, address, phone, isActive } = req.body;
      const currentUser = getCurrentUser(req);

      const { data: campus } = await memfireAdmin
        .from('campuses')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (!campus) {
        return next(new ApiError('校区不存在', 404, 'CAMPUS_NOT_FOUND'));
      }

      // 数据隔离检查
      if (currentUser?.role !== 'admin' && campus.organizationId !== currentUser?.organizationId) {
        return next(new ApiError('无权修改该校区', 403, 'FORBIDDEN'));
      }

      const updateData: any = {};
      if (name) updateData.name = name;
      if (address !== undefined) updateData.address = address;
      if (phone !== undefined) updateData.phone = phone;
      if (isActive !== undefined) updateData.isActive = isActive;

      const { data: updated, error } = await memfireAdmin
        .from('campuses')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        return next(new ApiError('更新校区失败', 500, 'UPDATE_ERROR'));
      }

      sendSuccess(res, updated, '校区更新成功');
    } catch (error) {
      next(error);
    }
  },

  deleteCampus: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const currentUser = getCurrentUser(req);

      const { data: campus } = await memfireAdmin
        .from('campuses')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (!campus) {
        return next(new ApiError('校区不存在', 404, 'CAMPUS_NOT_FOUND'));
      }

      // 数据隔离检查
      if (currentUser?.role !== 'admin' && campus.organizationId !== currentUser?.organizationId) {
        return next(new ApiError('无权删除该校区', 403, 'FORBIDDEN'));
      }

      const { error } = await memfireAdmin
        .from('campuses')
        .delete()
        .eq('id', id);

      if (error) {
        return next(new ApiError('删除校区失败', 500, 'DELETE_ERROR'));
      }

      sendSuccess(res, null, '校区删除成功');
    } catch (error) {
      next(error);
    }
  },
};
