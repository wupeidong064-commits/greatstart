/** Customer self-service business import has been retired. */
import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { requireOrganizationAccess } from '../middleware/rbac';
import { ApiError } from '../middleware/errorHandler';

export const importRoutes = Router();
importRoutes.use(authenticate, requireOrganizationAccess());
importRoutes.use((_req, _res, next) => next(new ApiError('自助批量导入已关闭，请联系工作人员协助迁移数据', 410, 'IMPORT_RETIRED')));
