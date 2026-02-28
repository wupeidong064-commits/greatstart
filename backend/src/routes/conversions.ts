import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { requireOrganizationAccess } from '../middleware/rbac';
import { conversionController } from '../controllers/conversionController';

export const conversionRoutes = Router();

// 使用后端 JWT 认证
conversionRoutes.use(authenticate);
conversionRoutes.use(requireOrganizationAccess());

// 获取成单信息列表
conversionRoutes.get('/', conversionController.getConversions);

// 创建成单记录
conversionRoutes.post('/', conversionController.createConversion);

// 获取单条成单信息
conversionRoutes.get('/:id', conversionController.getConversionById);

// 更新成单信息
conversionRoutes.put('/:id', conversionController.updateConversion);

// 删除成单记录
conversionRoutes.delete('/:id', conversionController.deleteConversion);

// 关联学员到成单信息
conversionRoutes.post('/link-student', conversionController.linkStudent);
