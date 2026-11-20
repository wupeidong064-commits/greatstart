"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.accountAvatarController = exports.avatarUpload = void 0;
const multer_1 = __importDefault(require("multer"));
const errorHandler_1 = require("../middleware/errorHandler");
const response_1 = require("../utils/response");
const accountAvatarStorage_1 = require("../services/accountAvatarStorage");
const upload = (0, multer_1.default)({ storage: multer_1.default.memoryStorage(), limits: { fileSize: accountAvatarStorage_1.AVATAR_MAX_BYTES, files: 1, fields: 0 } }).single('avatar');
const avatarUpload = (req, res, next) => upload(req, res, error => {
    if (error)
        return next(new errorHandler_1.ApiError(error.code === 'LIMIT_FILE_SIZE' ? '头像图片不能超过2MB' : '请只上传一张头像图片', error.code === 'LIMIT_FILE_SIZE' ? 413 : 400, 'INVALID_AVATAR_UPLOAD'));
    next();
});
exports.avatarUpload = avatarUpload;
// Ownership always comes from the live authenticated account, never an uploaded ID.
function owner(req) {
    if (!req.user?.id)
        throw new errorHandler_1.ApiError('请先登录', 401, 'UNAUTHORIZED');
    if (Object.keys(req.query).length || (req.body && Object.keys(req.body).length))
        throw new errorHandler_1.ApiError('头像只能由本人修改，请勿提交其他账户参数', 400, 'INVALID_AVATAR_OWNER');
    return req.user.id;
}
exports.accountAvatarController = {
    get: async (req, res, next) => {
        try {
            res.set('Cache-Control', 'no-store');
            (0, response_1.sendSuccess)(res, { imageData: await (0, accountAvatarStorage_1.readAccountAvatar)(owner(req)) });
        }
        catch (error) {
            next(error);
        }
    },
    save: async (req, res, next) => {
        try {
            const userId = owner(req);
            if (!req.file)
                throw new errorHandler_1.ApiError('请先选择头像图片', 400, 'AVATAR_REQUIRED');
            res.set('Cache-Control', 'no-store');
            (0, response_1.sendSuccess)(res, { imageData: await (0, accountAvatarStorage_1.saveAccountAvatar)(userId, req.file.buffer) }, '头像已保存');
        }
        catch (error) {
            next(error);
        }
    },
    remove: async (req, res, next) => {
        try {
            await (0, accountAvatarStorage_1.removeAccountAvatar)(owner(req));
            res.set('Cache-Control', 'no-store');
            (0, response_1.sendSuccess)(res, { imageData: null }, '已恢复默认头像');
        }
        catch (error) {
            next(error);
        }
    },
};
//# sourceMappingURL=accountAvatarController.js.map