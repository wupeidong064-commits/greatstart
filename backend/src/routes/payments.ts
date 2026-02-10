import { Router } from 'express';
import { authenticateMemFire } from '../middleware/auth';
import { requireOrganizationAccess } from '../middleware/rbac';
import { paymentController } from '../controllers/paymentController';

export const paymentRoutes = Router();

paymentRoutes.use(authenticateMemFire);
paymentRoutes.use(requireOrganizationAccess());

paymentRoutes.get('/', paymentController.getPayments);
paymentRoutes.get('/:id', paymentController.getPaymentById);
paymentRoutes.post('/', paymentController.createPayment);
paymentRoutes.put('/:id', paymentController.updatePayment);
paymentRoutes.delete('/:id', paymentController.deletePayment);

