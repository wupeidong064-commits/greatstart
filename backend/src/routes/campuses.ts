import { Router } from 'express';
import { platformOnly } from '../middleware/rbac';
import { authenticate } from '../middleware/auth';
import { ApiError } from '../middleware/errorHandler';
import { campusController } from '../controllers/campusController';

export const campusRoutes = Router();

campusRoutes.use(authenticate);

campusRoutes.get('/', campusController.getCampuses);
campusRoutes.get('/:id', campusController.getCampusById);
campusRoutes.post('/', (_req, _res, next) => next(new ApiError('每个机构仅使用一个默认业务范围，不支持新增校区', 409, 'SINGLE_ORGANIZATION_SCOPE')));
campusRoutes.put('/:id', platformOnly, campusController.updateCampus);
campusRoutes.delete('/:id', (_req, _res, next) => next(new ApiError('机构默认业务范围不可删除', 409, 'SINGLE_ORGANIZATION_SCOPE')));

