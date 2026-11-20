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
conversionRoutes.get('/summary', conversionController.getConversionSummary);
conversionRoutes.get('/voided', conversionController.getVoidedConversions);
conversionRoutes.get('/registration-schedules', conversionController.getRegistrationSchedules);

// 创建成单记录
conversionRoutes.post('/', conversionController.createConversion);

// 续费（事务化：成单+课时应增+换班，同日同学员幂等，P1-06；须注册在 /:id 之前）
conversionRoutes.post('/renewal', conversionController.renewStudent);

// 获取单条成单信息
conversionRoutes.get('/:id', conversionController.getConversionById);

// 更新成单信息
conversionRoutes.put('/:id', conversionController.updateConversion);

// 删除成单记录
conversionRoutes.delete('/:id', conversionController.deleteConversion);

// 2026-11-08 用户拍板：成单作废（红冲）——保留记录、课时冲回、退出全部统计口径
conversionRoutes.post('/:id/void', conversionController.voidConversion);

// 关联学员到成单信息
conversionRoutes.post('/link-student', conversionController.linkStudent);
