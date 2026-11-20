import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { requireOrganizationAccess, requireMinRole } from '../middleware/rbac';
import { orgProfileController } from '../controllers/orgProfileController';

export const orgProfileRoutes = Router();

// 机构数据说明：仅机构数据管理权限（manager 及以上）可访问；
// 范围（机构/授权校区）由登录身份在服务端确定，不接收任何范围参数
orgProfileRoutes.use(authenticate);
orgProfileRoutes.use(requireOrganizationAccess());
orgProfileRoutes.get('/', requireMinRole('manager'), orgProfileController.getProfile);
