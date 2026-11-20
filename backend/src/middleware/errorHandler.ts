import { Request, Response, NextFunction } from 'express';

export interface AppError extends Error {
  statusCode?: number;
  code?: string;
}

export const errorHandler = (
  err: AppError,
  _req: Request,
  res: Response,
  _next: NextFunction
) => {
  const statusCode = err.statusCode || 500;
  // 2026-11-07 用户要求报错一律中文：5xx 不再透出原始英文（Prisma/Node 异常），统一中文兜底；
  // 原始错误由 errorLogger 记入服务端日志。4xx 保留业务 message（ApiError 均为中文文案）。
  const message = statusCode >= 500
    ? '服务器开小差了，请稍后重试；若持续出现请联系管理员'
    : err.message || '请求处理失败，请稍后重试';

  res.status(statusCode).json({
    success: false,
    error: {
      message, code: err.code,
    },
  });
};

export class ApiError extends Error implements AppError {
  statusCode: number;
  code?: string;

  constructor(message: string, statusCode: number = 500, code?: string) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.name = 'ApiError';
  }
}

