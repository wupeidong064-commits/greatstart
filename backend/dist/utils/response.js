"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendPaginated = exports.sendSuccess = void 0;
const sendSuccess = (res, data, message, statusCode = 200) => {
    const response = {
        success: true,
        data,
        message,
    };
    res.status(statusCode).json(response);
};
exports.sendSuccess = sendSuccess;
const sendPaginated = (res, data, page, pageSize, total, message) => {
    const response = {
        success: true,
        data,
        message,
        pagination: {
            page,
            pageSize,
            total,
            totalPages: Math.ceil(total / pageSize),
        },
    };
    res.status(200).json(response);
};
exports.sendPaginated = sendPaginated;
//# sourceMappingURL=response.js.map