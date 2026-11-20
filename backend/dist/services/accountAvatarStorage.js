"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AVATAR_MAX_BYTES = void 0;
exports.readAccountAvatar = readAccountAvatar;
exports.saveAccountAvatar = saveAccountAvatar;
exports.removeAccountAvatar = removeAccountAvatar;
const crypto_1 = require("crypto");
const promises_1 = require("fs/promises");
const path_1 = require("path");
const sharp_1 = __importDefault(require("sharp"));
const errorHandler_1 = require("../middleware/errorHandler");
exports.AVATAR_MAX_BYTES = 2 * 1024 * 1024;
// This directory is persistent user content and must be included in storage backups.
const avatarDirectory = () => (0, path_1.resolve)(process.env.AVATAR_STORAGE_DIR || (0, path_1.join)(process.cwd(), 'storage', 'avatars'));
const avatarPath = (userId) => (0, path_1.join)(avatarDirectory(), (0, crypto_1.createHash)('sha256').update(userId).digest('hex') + '.webp');
const missing = (error) => error?.code === 'ENOENT';
async function readAccountAvatar(userId) {
    try {
        return 'data:image/webp;base64,' + (await (0, promises_1.readFile)(avatarPath(userId))).toString('base64');
    }
    catch (error) {
        if (missing(error))
            return null;
        throw error;
    }
}
async function saveAccountAvatar(userId, input) {
    if (!input.length)
        throw new errorHandler_1.ApiError('图片文件为空，请重新选择', 400, 'INVALID_AVATAR');
    if (input.length > exports.AVATAR_MAX_BYTES)
        throw new errorHandler_1.ApiError('头像图片不能超过2MB', 413, 'AVATAR_TOO_LARGE');
    let output;
    try {
        const png = input.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
        const jpeg = input[0] === 255 && input[1] === 216 && input[2] === 255;
        const webp = input.toString('ascii', 0, 4) === 'RIFF' && input.toString('ascii', 8, 12) === 'WEBP';
        if (!png && !jpeg && !webp)
            throw new Error('unsupported image');
        const image = (0, sharp_1.default)(input, { limitInputPixels: 16 * 1024 * 1024, failOn: 'warning' });
        const metadata = await image.metadata();
        if (!['jpeg', 'png', 'webp'].includes(metadata.format || '') || (metadata.pages || 1) !== 1 ||
            !metadata.width || !metadata.height || metadata.width > 4096 || metadata.height > 4096) {
            throw new Error('unsupported image');
        }
        output = await image.rotate().resize(256, 256, { fit: 'cover', position: 'centre' }).webp({ quality: 85 }).toBuffer();
    }
    catch {
        throw new errorHandler_1.ApiError('请选择有效的JPG、PNG或WebP静态图片，宽高均不超过4096像素', 400, 'INVALID_AVATAR');
    }
    await (0, promises_1.mkdir)(avatarDirectory(), { recursive: true, mode: 0o700 });
    const target = avatarPath(userId), temporary = target + '.' + (0, crypto_1.randomUUID)() + '.tmp';
    try {
        await (0, promises_1.writeFile)(temporary, output, { flag: 'wx', mode: 0o600 });
        await (0, promises_1.rename)(temporary, target);
    }
    finally {
        await (0, promises_1.unlink)(temporary).catch(error => { if (!missing(error))
            throw error; });
    }
    return readAccountAvatar(userId);
}
async function removeAccountAvatar(userId) {
    try {
        await (0, promises_1.unlink)(avatarPath(userId));
    }
    catch (error) {
        if (!missing(error))
            throw error;
    }
}
//# sourceMappingURL=accountAvatarStorage.js.map