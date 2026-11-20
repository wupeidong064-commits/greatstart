import { createHash, randomUUID } from 'crypto';
import { mkdir, readFile, rename, unlink, writeFile } from 'fs/promises';
import { join, resolve } from 'path';
import sharp from 'sharp';
import { ApiError } from '../middleware/errorHandler';

export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
// This directory is persistent user content and must be included in storage backups.
const avatarDirectory = () => resolve(process.env.AVATAR_STORAGE_DIR || join(process.cwd(), 'storage', 'avatars'));
const avatarPath = (userId: string) => join(avatarDirectory(), createHash('sha256').update(userId).digest('hex') + '.webp');
const missing = (error: unknown) => (error as NodeJS.ErrnoException)?.code === 'ENOENT';

export async function readAccountAvatar(userId: string) {
  try { return 'data:image/webp;base64,' + (await readFile(avatarPath(userId))).toString('base64'); }
  catch (error) { if (missing(error)) return null; throw error; }
}

export async function saveAccountAvatar(userId: string, input: Buffer) {
  if (!input.length) throw new ApiError('图片文件为空，请重新选择', 400, 'INVALID_AVATAR');
  if (input.length > AVATAR_MAX_BYTES) throw new ApiError('头像图片不能超过2MB', 413, 'AVATAR_TOO_LARGE');
  let output: Buffer;
  try {
    const png = input.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    const jpeg = input[0] === 255 && input[1] === 216 && input[2] === 255;
    const webp = input.toString('ascii', 0, 4) === 'RIFF' && input.toString('ascii', 8, 12) === 'WEBP';
    if (!png && !jpeg && !webp) throw new Error('unsupported image');
    const image = sharp(input, { limitInputPixels: 16 * 1024 * 1024, failOn: 'warning' });
    const metadata = await image.metadata();
    if (!['jpeg', 'png', 'webp'].includes(metadata.format || '') || (metadata.pages || 1) !== 1 ||
      !metadata.width || !metadata.height || metadata.width > 4096 || metadata.height > 4096) {
      throw new Error('unsupported image');
    }
    output = await image.rotate().resize(256, 256, { fit: 'cover', position: 'centre' }).webp({ quality: 85 }).toBuffer();
  } catch { throw new ApiError('请选择有效的JPG、PNG或WebP静态图片，宽高均不超过4096像素', 400, 'INVALID_AVATAR'); }
  await mkdir(avatarDirectory(), { recursive: true, mode: 0o700 });
  const target = avatarPath(userId), temporary = target + '.' + randomUUID() + '.tmp';
  try { await writeFile(temporary, output, { flag: 'wx', mode: 0o600 }); await rename(temporary, target); }
  finally { await unlink(temporary).catch(error => { if (!missing(error)) throw error; }); }
  return readAccountAvatar(userId);
}

export async function removeAccountAvatar(userId: string) {
  try { await unlink(avatarPath(userId)); } catch (error) { if (!missing(error)) throw error; }
}
