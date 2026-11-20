import { RequestHandler, Response, NextFunction } from 'express';
import multer from 'multer';
import { AuthRequest } from '../middleware/auth';
import { ApiError } from '../middleware/errorHandler';
import { sendSuccess } from '../utils/response';
import { AVATAR_MAX_BYTES, readAccountAvatar, removeAccountAvatar, saveAccountAvatar } from '../services/accountAvatarStorage';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: AVATAR_MAX_BYTES, files: 1, fields: 0 } }).single('avatar');
export const avatarUpload: RequestHandler = (req, res, next) => upload(req, res, error => {
  if (error) return next(new ApiError(error.code === 'LIMIT_FILE_SIZE' ? '头像图片不能超过2MB' : '请只上传一张头像图片', error.code === 'LIMIT_FILE_SIZE' ? 413 : 400, 'INVALID_AVATAR_UPLOAD'));
  next();
});

// Ownership always comes from the live authenticated account, never an uploaded ID.
function owner(req: AuthRequest) {
  if (!req.user?.id) throw new ApiError('请先登录', 401, 'UNAUTHORIZED');
  if (Object.keys(req.query).length || (req.body && Object.keys(req.body).length)) throw new ApiError('头像只能由本人修改，请勿提交其他账户参数', 400, 'INVALID_AVATAR_OWNER');
  return req.user.id;
}
export const accountAvatarController = {
  get: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try { res.set('Cache-Control', 'no-store'); sendSuccess(res, { imageData: await readAccountAvatar(owner(req)) }); } catch (error) { next(error); }
  },
  save: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const userId = owner(req);
      if (!req.file) throw new ApiError('请先选择头像图片', 400, 'AVATAR_REQUIRED');
      res.set('Cache-Control', 'no-store'); sendSuccess(res, { imageData: await saveAccountAvatar(userId, req.file.buffer) }, '头像已保存');
    } catch (error) { next(error); }
  },
  remove: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try { await removeAccountAvatar(owner(req)); res.set('Cache-Control', 'no-store'); sendSuccess(res, { imageData: null }, '已恢复默认头像'); } catch (error) { next(error); }
  },
};
