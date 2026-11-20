import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import { confirmLessonPricing, getLessonPricing } from '../services/lessonPricingService';
import { sendSuccess } from '../utils/response';

export const lessonPricingController = {
  async get(req:AuthRequest,res:Response,next:NextFunction) {
    try { res.set('Cache-Control','no-store'); sendSuccess(res,await getLessonPricing(req)); } catch(error) { next(error); }
  },
  async confirm(req:AuthRequest,res:Response,next:NextFunction) {
    try { sendSuccess(res,await confirmLessonPricing(req),'原批次计价已确认'); } catch(error) { next(error); }
  },
};
