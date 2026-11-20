import { Response } from 'express';
export interface ApiResponse<T = any> {
    success: boolean;
    data?: T;
    message?: string;
    pagination?: {
        page: number;
        pageSize: number;
        total: number;
        totalPages: number;
    };
}
export declare const sendSuccess: <T>(res: Response, data?: T, message?: string, statusCode?: number) => void;
export declare const sendPaginated: <T>(res: Response, data: T[], page: number, pageSize: number, total: number, message?: string) => void;
//# sourceMappingURL=response.d.ts.map