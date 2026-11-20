/**
 * 日志中间件
 * 用于记录请求和错误日志
 */
import { Request, Response, NextFunction } from 'express';
export declare const logger: {
    debug: (message: string, data?: Record<string, unknown>) => void;
    info: (message: string, data?: Record<string, unknown>) => void;
    warn: (message: string, data?: Record<string, unknown>) => void;
    error: (message: string, data?: Record<string, unknown>) => void;
    audit: (action: string, data: Record<string, unknown>) => void;
    access: (req: Request, res: Response, duration: number) => void;
};
export declare const requestLogger: (req: Request, res: Response, next: NextFunction) => void;
export declare const errorLogger: (err: Error, req: Request, res: Response, next: NextFunction) => void;
export declare const logOperation: (operation: string, userId: string | undefined, details: Record<string, unknown>) => void;
export default logger;
//# sourceMappingURL=logger.d.ts.map