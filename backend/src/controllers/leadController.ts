import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import { ApiError } from '../middleware/errorHandler';
import { sendSuccess, sendPaginated } from '../utils/response';
import { memfireAdmin } from '../config/memfire';

const getCurrentUser = (req: AuthRequest) => {
  return req.user || req.memfireUser;
};

// 辅助函数：检查是否为管理员
const isAdminOrManager = (user: any) => {
  const role = user?.role;
  return role === 'admin' || role === 'manager';
};

export const leadController = {
  // 获取线索列表
  getLeads: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const pageSize = parseInt(req.query.pageSize as string) || 10;
      const assigneeId = req.query.assigneeId as string;
      const status = req.query.status as string;

      const currentUser = getCurrentUser(req);
      const targetOrgId = currentUser?.organizationId;

      if (!targetOrgId) {
        return next(new ApiError('未分配机构', 403, 'FORBIDDEN'));
      }

      let query = memfireAdmin
        .from('leads')
        .select('*')
        .eq('organizationId', targetOrgId)
        .order('createdAt', { ascending: false });

      // 非管理人员只能看到自己负责的线索（防止翘单）
      if (!isAdminOrManager(currentUser) && currentUser?.id) {
        query = query.eq('assigneeId', currentUser.id);
      } else if (assigneeId) {
        // 管理人员可以按负责人筛选
        query = query.eq('assigneeId', assigneeId);
      }

      if (status) {
        query = query.eq('status', status);
      }

      query = query.range((page - 1) * pageSize, (page - 1) * pageSize + pageSize - 1);

      const { data: leads, error } = await query;

      if (error) {
        return next(new ApiError('获取线索列表失败', 500, 'QUERY_ERROR'));
      }

      let countQuery = memfireAdmin
        .from('leads')
        .select('*', { count: 'exact', head: true })
        .eq('organizationId', targetOrgId);

      if (!isAdminOrManager(currentUser) && currentUser?.id) {
        countQuery = countQuery.eq('assigneeId', currentUser.id);
      } else if (assigneeId) {
        countQuery = countQuery.eq('assigneeId', assigneeId);
      }
      if (status) countQuery = countQuery.eq('status', status);

      const { count } = await countQuery;

      sendPaginated(res, leads || [], page, pageSize, count || 0);
    } catch (error) {
      next(error);
    }
  },

  // 创建线索
  createLead: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const currentUser = getCurrentUser(req);
      const targetOrgId = currentUser?.organizationId;

      if (!targetOrgId) {
        return next(new ApiError('未分配机构', 403, 'FORBIDDEN'));
      }

      const {
        customerName, age, contact, source,
        assigneeId, assigneeName, notes
      } = req.body;

      // 非管理人员创建线索时，强制分配给自己（防止翘单）
      let finalAssigneeId = assigneeId;
      let finalAssigneeName = assigneeName;

      if (!isAdminOrManager(currentUser)) {
        finalAssigneeId = currentUser.id;
        // 从 users 表获取用户名
        const { data: userData } = await memfireAdmin
          .from('users')
          .select('name')
          .eq('id', currentUser.id)
          .maybeSingle();
        finalAssigneeName = userData?.name || null;
      }

      const { data: lead, error } = await memfireAdmin
        .from('leads')
        .insert({
          organizationId: targetOrgId,
          customerName,
          age,
          contact,
          source,
          assigneeId: finalAssigneeId,
          assigneeName: finalAssigneeName,
          status: 'new',
          notes,
        })
        .select()
        .single();

      if (error) {
        console.error('创建线索失败:', error);
        return next(new ApiError('创建线索失败', 500, 'CREATE_ERROR'));
      }

      sendSuccess(res, lead, '创建成功', 201);
    } catch (error) {
      next(error);
    }
  },

  // 更新线索
  updateLead: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const currentUser = getCurrentUser(req);

      const { data: existing } = await memfireAdmin
        .from('leads')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (!existing) {
        return next(new ApiError('线索不存在', 404, 'NOT_FOUND'));
      }

      // 检查数据隔离权限
      if (existing.organizationId !== currentUser?.organizationId) {
        return next(new ApiError('无权修改', 403, 'FORBIDDEN'));
      }

      // 非管理人员只能修改自己负责的线索（防止翘单）
      if (!isAdminOrManager(currentUser) && existing.assigneeId !== currentUser?.id) {
        return next(new ApiError('您只能修改自己负责的线索', 403, 'FORBIDDEN'));
      }

      // 非管理人员不能修改负责人（防止翘单）
      let updateData = { ...req.body };
      if (!isAdminOrManager(currentUser)) {
        delete updateData.assigneeId;
        delete updateData.assigneeName;
      }

      const { data: updated, error } = await memfireAdmin
        .from('leads')
        .update(updateData)
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

  // 更新最近联系时间
  updateLastContactTime: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const currentUser = getCurrentUser(req);

      const { data: existing } = await memfireAdmin
        .from('leads')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (!existing) {
        return next(new ApiError('线索不存在', 404, 'NOT_FOUND'));
      }

      // 检查数据隔离权限
      if (existing.organizationId !== currentUser?.organizationId) {
        return next(new ApiError('无权修改', 403, 'FORBIDDEN'));
      }

      // 非管理人员只能更新自己负责的线索（防止翘单）
      if (!isAdminOrManager(currentUser) && existing.assigneeId !== currentUser?.id) {
        return next(new ApiError('您只能更新自己负责的线索', 403, 'FORBIDDEN'));
      }

      const { data: updated, error } = await memfireAdmin
        .from('leads')
        .update({ lastContactAt: new Date().toISOString() })
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

  // 删除线索
  deleteLead: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const currentUser = getCurrentUser(req);

      const { data: existing } = await memfireAdmin
        .from('leads')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (!existing) {
        return next(new ApiError('线索不存在', 404, 'NOT_FOUND'));
      }

      // 检查数据隔离权限
      if (existing.organizationId !== currentUser?.organizationId) {
        return next(new ApiError('无权删除', 403, 'FORBIDDEN'));
      }

      // 非管理人员只能删除自己负责的线索（防止翘单）
      if (!isAdminOrManager(currentUser) && existing.assigneeId !== currentUser?.id) {
        return next(new ApiError('您只能删除自己负责的线索', 403, 'FORBIDDEN'));
      }

      const { error } = await memfireAdmin
        .from('leads')
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
};
