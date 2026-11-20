"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseLessonAmount = parseLessonAmount;
const client_1 = require("@prisma/client");
const errorHandler_1 = require("../middleware/errorHandler");
function parseLessonAmount(value, label = '原批次总价') {
    if ((typeof value !== 'string' && typeof value !== 'number') || !/^\d{1,8}(?:\.\d{1,2})?$/.test(String(value).trim()))
        throw new errorHandler_1.ApiError('请填写' + label + '，范围为0至99999999.99元，最多两位小数', 400, 'INVALID_PRICE');
    return new client_1.Prisma.Decimal(String(value).trim()).times(100).toNumber();
}
//# sourceMappingURL=lessonMoney.js.map