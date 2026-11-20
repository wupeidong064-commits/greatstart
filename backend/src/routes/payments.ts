import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { requireOrganizationAccess, requireMinRole } from '../middleware/rbac';
import { paymentController } from '../controllers/paymentController';

export const paymentRoutes = Router();

paymentRoutes.use(authenticate);
paymentRoutes.use(requireOrganizationAccess());
paymentRoutes.use(requireMinRole('staff'));

paymentRoutes.get('/', paymentController.getPayments);
paymentRoutes.get('/:id', paymentController.getPaymentById);
paymentRoutes.post('/', paymentController.createPayment);
paymentRoutes.put('/:id', paymentController.updatePayment);
paymentRoutes.delete('/:id', paymentController.deletePayment);

