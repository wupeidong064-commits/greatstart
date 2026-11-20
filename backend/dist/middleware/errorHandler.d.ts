import { Request, Response, NextFunction } from 'express';
export interface AppError extends Error {
    statusCode?: number;
    code?: string;
}
export declare const errorHandler: (err: AppError, _req: Request, res: Response, _next: NextFunction) => void;
export declare class ApiError extends Error implements AppError {
    statusCode: number;
    code?: string;
    constructor(message: string, statusCode?: number, code?: string);
}
//# sourceMappingURL=errorHandler.d.ts.map