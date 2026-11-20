"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateRecordedAge = validateRecordedAge;
exports.parseProfileDate = parseProfileDate;
exports.validateAddress = validateAddress;
exports.studentGenderFromConversion = studentGenderFromConversion;
exports.parentMobileFromContact = parentMobileFromContact;
exports.validateStudentName = validateStudentName;
exports.validateContactPhone = validateContactPhone;
exports.validateBusinessDate = validateBusinessDate;
const max_1 = require("libphonenumber-js/max");
const errorHandler_1 = require("../middleware/errorHandler");
/** A registration age is a snapshot; it must never be converted into a birthday. */
function validateRecordedAge(value) {
    if (value === null || value === undefined)
        return null;
    if (!Number.isSafeInteger(value) || value < 0 || value > 150) {
        throw new errorHandler_1.ApiError('登记年龄须为 0 至 150 的整数', 400, 'INVALID_RECORDED_AGE');
    }
    return value;
}
/** Accept date-only and ISO timestamps while rejecting impossible calendar dates. */
function parseProfileDate(value) {
    if (value === null || value === undefined || value === '')
        return null;
    if (typeof value !== 'string')
        throw new errorHandler_1.ApiError('日期无效', 400, 'INVALID_DATE');
    const match = /^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/.exec(value);
    if (!match)
        throw new errorHandler_1.ApiError('日期无效', 400, 'INVALID_DATE');
    const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
    const check = new Date(0);
    check.setUTCFullYear(year, month - 1, day);
    check.setUTCHours(0, 0, 0, 0);
    if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) {
        throw new errorHandler_1.ApiError('日期无效', 400, 'INVALID_DATE');
    }
    const parsed = new Date(value);
    if (!Number.isFinite(parsed.getTime()))
        throw new errorHandler_1.ApiError('日期无效', 400, 'INVALID_DATE');
    return parsed;
}
function validateAddress(value) {
    if (value === null || value === undefined || value === '')
        return null;
    if (typeof value !== 'string' || value.length > 2000)
        throw new errorHandler_1.ApiError('地址无效', 400, 'INVALID_ADDRESS');
    return value;
}
function studentGenderFromConversion(value) {
    if (value === null || value === undefined || value === '')
        return null;
    if (value === 'M' || value === 'male' || value === '男')
        return 'M';
    if (value === 'F' || value === 'female' || value === '女')
        return 'F';
    return typeof value === 'string' ? value : null;
}
/** Only a valid mainland mobile can be used as parent login phone; landlines and international contacts stay in the profile. */
function parentMobileFromContact(value) {
    if (typeof value !== 'string')
        return null;
    const normalized = value.replace(/\s/g, '').replace(/^\+86/, '');
    return /^1[3-9]\d{9}$/.test(normalized) ? normalized : null;
}
/** Student profile names are bounded on every write path. */
function validateStudentName(value) {
    if (typeof value !== 'string' || !value.trim())
        throw new errorHandler_1.ApiError('请输入学员姓名', 400, 'INVALID_STUDENT_NAME');
    const name = value.trim();
    if (name.length > 50 || name.includes('\0'))
        throw new errorHandler_1.ApiError('学员姓名不能超过50个字符或包含无效字符', 400, 'INVALID_STUDENT_NAME');
    return name;
}
/** Validate the complete number against country numbering plans; retain the entered formatting. */
function validateContactPhone(value) {
    if (value == null || value === '')
        return null;
    if (typeof value !== 'string')
        throw new errorHandler_1.ApiError('电话格式无效', 400, 'INVALID_PHONE');
    const phone = value.trim();
    if (!phone)
        return null;
    if (phone.length > 32 || !/^\+?(?:\d+|\(\d+\))(?:[ -]?(?:\d+|\(\d+\)))*$/.test(phone)
        || !(0, max_1.parsePhoneNumberFromString)(phone, { defaultCountry: 'CN', extract: false })?.isValid())
        throw new errorHandler_1.ApiError('请输入有效的电话号码', 400, 'INVALID_PHONE');
    return phone;
}
function validateBusinessDate(value, label, now = new Date()) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !parseProfileDate(value))
        throw new errorHandler_1.ApiError(label + '无效', 400, 'INVALID_DATE');
    const today = new Date(now.getTime() + 8 * 3600000).toISOString().slice(0, 10);
    if (value > today)
        throw new errorHandler_1.ApiError(label + '不能晚于今天', 400, 'FUTURE_DATE');
    return value;
}
//# sourceMappingURL=studentProfileFields.js.map