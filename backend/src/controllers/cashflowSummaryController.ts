import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import { sendSuccess } from '../utils/response';
import { resolveScope } from '../utils/scope';
import { getCashflowSummary } from '../services/cashflowSummaryService';

export const cashflowSummaryController = {
  getSummary: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const data = await getCashflowSummary(resolveScope(req), req.query);
      sendSuccess(res, data);
    } catch (error) { next(error); }
  },
};
