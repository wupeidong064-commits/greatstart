import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import { ApiError } from '../middleware/errorHandler';
import { sendSuccess } from '../utils/response';
import { memfireAdmin } from '../config/memfire';
import { logger } from '../middleware/logger';

// 辅助函数：获取当前用户信息
const getCurrentUser = (req: AuthRequest) => {
  return req.user || req.memfireUser;
};

// 默认设置值
const DEFAULT_SETTINGS: Record<string, string> = {
  maxClasses: '10', // 默认最大班级数
  workingHoursStart: '09:00',
  workingHoursEnd: '21:00',
};

export const settingsController = {
  // 获取设置项
  getSetting: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { key } = req.params;
      const currentUser = getCurrentUser(req);
      const targetOrgId = currentUser?.organizationId;

      if (!targetOrgId) {
        return next(new ApiError('未分配机构', 403, 'FORBIDDEN'));
      }

      // 尝试两种 key 格式查询：原始格式和组织ID前缀格式
      const uniqueKey = `${targetOrgId}_${key}`;

      // 先尝试新格式
      let { data: setting, error } = await memfireAdmin
        .from('settings')
        .select('*')
        .eq('key', uniqueKey)
        .eq('organizationId', targetOrgId)
        .maybeSingle();

      // 如果新格式没找到，尝试旧格式
      if (!setting) {
        const result = await memfireAdmin
          .from('settings')
          .select('*')
          .eq('key', key)
          .eq('organizationId', targetOrgId)
          .maybeSingle();
        setting = result.data;
        error = result.error;
      }

      if (error) {
        logger.error('获取设置失败', { key, organizationId: targetOrgId, error: error.message });
        // 如果表不存在，返回默认值而不是报错
        if (error.message?.includes('relation') || error.message?.includes('does not exist')) {
          return sendSuccess(res, {
            key,
            value: DEFAULT_SETTINGS[key] || '',
            organizationId: targetOrgId,
            isDefault: true,
          });
        }
        return next(new ApiError(`获取设置失败: ${error.message}`, 500, 'QUERY_ERROR'));
      }

      // 如果没有找到设置，返回默认值
      if (!setting) {
        sendSuccess(res, {
          key,
          value: DEFAULT_SETTINGS[key] || '',
          organizationId: targetOrgId,
          isDefault: true,
        });
      } else {
        // 返回时使用原始 key 名称
        sendSuccess(res, {
          ...setting,
          key, // 返回原始 key 而不是带前缀的
        });
      }
    } catch (error) {
      next(error);
    }
  },

  // 更新设置项
  updateSetting: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { key } = req.params;
      const { value } = req.body;
      const currentUser = getCurrentUser(req);
      const targetOrgId = currentUser?.organizationId;

      if (!targetOrgId) {
        return next(new ApiError('未分配机构', 403, 'FORBIDDEN'));
      }

      if (value === undefined || value === null) {
        return next(new ApiError('设置值不能为空', 400, 'INVALID_VALUE'));
      }

      // 使用带前缀的 key 格式
      const uniqueKey = `${targetOrgId}_${key}`;

      // 检查设置是否存在（使用带前缀的 key 查询）
      const { data: existingSetting, error: queryError } = await memfireAdmin
        .from('settings')
        .select('*')
        .eq('key', uniqueKey)
        .eq('organizationId', targetOrgId)
        .maybeSingle();

      if (queryError) {
        logger.error('查询设置失败', { key: uniqueKey, organizationId: targetOrgId, error: queryError.message });
      }

      let result;

      if (existingSetting) {
        // 更新现有设置（使用 id 而不是 key，避免唯一约束冲突）
        const { data, error } = await memfireAdmin
          .from('settings')
          .update({ value: value.toString(), updatedAt: new Date().toISOString() })
          .eq('id', existingSetting.id)
          .select()
          .single();

        if (error) {
          logger.error('更新设置失败', { key, error: error.message });
          return next(new ApiError(`更新设置失败: ${error.message}`, 500, 'UPDATE_ERROR'));
        }
        result = data;
      } else {
        // 创建新设置
        const { data, error } = await memfireAdmin
          .from('settings')
          .insert({
            key: uniqueKey,
            value: value.toString(),
            organizationId: targetOrgId,
          })
          .select()
          .single();

        if (error) {
          logger.error('创建设置失败', { key: uniqueKey, organizationId: targetOrgId, error: error.message });
          return next(new ApiError(`创建设置失败: ${error.message}`, 500, 'CREATE_ERROR'));
        }
        result = data;
      }

      // 返回时使用原始 key 名称
      sendSuccess(res, { ...result, key }, '设置已保存');
    } catch (error) {
      next(error);
    }
  },
};
