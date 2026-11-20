import type { NextFunction, Request, Response } from 'express';
import { ApiError } from './errorHandler';

/** Inspect parsed text only: arbitrary uploaded binary data is not text. */
export function containsNul(value: unknown): boolean {
  const pending: unknown[] = [value];
  const seen = new WeakSet<object>();
  while (pending.length) {
    const item = pending.pop();
    if (typeof item === 'string') {
      if (item.includes('\0')) return true;
    } else if (item && typeof item === 'object' && !Buffer.isBuffer(item)) {
      if (seen.has(item)) continue;
      seen.add(item);
      for (const [key, child] of Object.entries(item)) {
        if (key.includes('\0')) return true;
        pending.push(child);
      }
    }
  }
  return false;
}

export function rejectNul(req: Request, _res: Response, next: NextFunction) {
  let requestPath = req.path;
  try { requestPath = decodeURIComponent(requestPath); } catch { /* Leave malformed escapes to Express. */ }
  if (containsNul(requestPath) || containsNul(req.query) || containsNul(req.body)) {
    return next(new ApiError('内容包含无法处理的空字符，请删除后重试', 400, 'INVALID_NUL_CHARACTER'));
  }
  return next();
}
