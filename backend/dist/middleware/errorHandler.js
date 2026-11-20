"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ApiError = exports.errorHandler = void 0;
const errorHandler = (err, _req, res, _next) => {
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
exports.errorHandler = errorHandler;
class ApiError extends Error {
    constructor(message, statusCode = 500, code) {
        super(message);
        this.statusCode = statusCode;
        this.code = code;
        this.name = 'ApiError';
    }
}
exports.ApiError = ApiError;
//# sourceMappingURL=errorHandler.js.map