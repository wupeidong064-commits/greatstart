import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
export declare const paymentController: {
    getPayments: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
    getPaymentById: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
    createPayment: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
    updatePayment: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
    deletePayment: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
};
//# sourceMappingURL=paymentController.d.ts.map