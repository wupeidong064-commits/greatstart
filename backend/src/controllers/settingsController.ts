import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import { ApiError } from '../middleware/errorHandler';
import { sendSuccess } from '../utils/response';
import prisma from '../config/database';
const DEFAULT_SETTINGS: Record<string, string> = { maxClasses: '10', workingHoursStart: '09:00', workingHoursEnd: '21:00' };
export const settingsController = {
  getSetting: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { key } = req.params, organizationId = req.user?.organizationId;
      if (!organizationId) throw new ApiError('未分配机构', 403, 'FORBIDDEN');
      const setting = await prisma.setting.findUnique({ where: { key_organizationId: { key: `${organizationId}_${key}`, organizationId } } })
        ?? await prisma.setting.findUnique({ where: { key_organizationId: { key, organizationId } } });
      sendSuccess(res, setting ? { ...setting, key } : { key, value: DEFAULT_SETTINGS[key] || '', organizationId, isDefault: true });
    } catch (error) { next(error); }
  },
  updateSetting: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { key } = req.params, { value } = req.body, organizationId = req.user?.organizationId;
      if (!organizationId) throw new ApiError('未分配机构', 403, 'FORBIDDEN');
      if (value === undefined || value === null) throw new ApiError('设置值不能为空', 400, 'INVALID_VALUE');
      const uniqueKey = `${organizationId}_${key}`;
      const result = await prisma.setting.upsert({
        where: { key_organizationId: { key: uniqueKey, organizationId } },
        create: { key: uniqueKey, organizationId, value: String(value) }, update: { value: String(value) },
      });
      sendSuccess(res, { ...result, key }, '设置已保存');
    } catch (error) { next(error); }
  },
};
