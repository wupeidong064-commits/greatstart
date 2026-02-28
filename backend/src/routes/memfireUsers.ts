import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { sendSuccess } from '../utils/response';
import { memfireAdmin } from '../config/memfire';
import { normalizeRole } from '../middleware/rbac';

export const memfireUsersRoutes = Router();

// 所有路由需要 JWT 认证
memfireUsersRoutes.use(authenticate);

/**
 * @swagger
 * /api/memfire/users:
 *   get:
 *     summary: 获取 MemFire 用户列表
 *     tags: [MemFire 用户管理]
 *     security:
 *       - bearerAuth: []
 *     description: 系统管理员可以查看所有用户，其他用户只能查看自己机构的用户
 */
memfireUsersRoutes.get('/', async (req: any, res, next): Promise<any> => {
  try {
    const user = req.user;

    if (!user) {
      return res.status(401).json({ error: '未认证' });
    }

    const normalizedRole = normalizeRole(user.role);

    let query = memfireAdmin
      .from('users')
      .select('id, name, email, phone, role, isActive, group, organizationId, campusId, createdAt')
      .order('name', { ascending: true });

    // 如果不是系统管理员，按机构筛选
    if (normalizedRole !== 'admin' && user.organizationId) {
      query = query.eq('organizationId', user.organizationId);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[MemFire Users] 查询失败:', error);
      return res.status(500).json({ error: error.message });
    }

    console.log('[MemFire Users] 查询结果:', { count: data?.length || 0, role: normalizedRole, organizationId: user.organizationId });

    sendSuccess(res, data || []);
  } catch (error: any) {
    console.error('[MemFire Users] 异常:', error);
    next(error);
  }
});

/**
 * @swagger
 * /api/memfire/users/{id}:
 *   put:
 *     summary: 更新 MemFire 用户
 *     tags: [MemFire 用户管理]
 *     security:
 *       - bearerAuth: []
 */
memfireUsersRoutes.put('/:id', async (req: any, res, next): Promise<any> => {
  try {
    const { id } = req.params;
    const { name, phone, role, group, isActive, organizationId, campusId } = req.body;
    const currentUser = req.user;

    if (!currentUser) {
      return res.status(401).json({ error: '未认证' });
    }

    const normalizedRole = normalizeRole(currentUser.role);

    // 获取要更新的用户
    const { data: targetUser, error: fetchError } = await memfireAdmin
      .from('users')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !targetUser) {
      return res.status(404).json({ error: '用户不存在' });
    }

    // 权限检查：非系统管理员只能修改自己机构的用户
    if (normalizedRole !== 'admin' && targetUser.organizationId !== currentUser.organizationId) {
      return res.status(403).json({ error: '无权修改该用户' });
    }

    // 构建更新数据
    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (phone !== undefined) updateData.phone = phone;
    if (role !== undefined) updateData.role = role;
    if (group !== undefined) updateData.group = group;
    if (isActive !== undefined) updateData.isActive = isActive;
    if (organizationId !== undefined && normalizedRole === 'admin') updateData.organizationId = organizationId;
    if (campusId !== undefined) updateData.campusId = campusId;

    updateData.updatedAt = new Date().toISOString();

    const { data: updatedUser, error: updateError } = await memfireAdmin
      .from('users')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (updateError) {
      return res.status(500).json({ error: updateError.message });
    }

    sendSuccess(res, updatedUser, '更新成功');
  } catch (error: any) {
    next(error);
  }
});
