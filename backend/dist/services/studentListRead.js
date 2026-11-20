"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.confirmedRenewals = exports.renewalCourseTypes = void 0;
exports.latestRenewalFilter = latestRenewalFilter;
exports.recallableFromNotes = recallableFromNotes;
const errorHandler_1 = require("../middleware/errorHandler");
exports.renewalCourseTypes = ['续费', 'renewal', '续报'];
const confirmedRenewals = (organizationId) => ({
    organizationId, approvalStatus: 'confirmed', courseType: { in: exports.renewalCourseTypes },
});
exports.confirmedRenewals = confirmedRenewals;
function dateParameter(value) {
    if (value === undefined)
        return undefined;
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value)
        throw new errorHandler_1.ApiError('最近续费日期应为有效的YYYY-MM-DD日期', 400, 'INVALID_RENEWAL_DATE');
    return value;
}
/** Date selection refers to the latest confirmed renewal, not any historical order. */
function latestRenewalFilter(query, organizationId) {
    const start = dateParameter(query.lastRenewalStartDate), end = dateParameter(query.lastRenewalEndDate);
    if (start && end && start > end)
        throw new errorHandler_1.ApiError('最近续费开始日期不能晚于结束日期', 400, 'INVALID_RENEWAL_DATE');
    if (!start && !end)
        return {};
    const order = (0, exports.confirmedRenewals)(organizationId);
    return { AND: [
            { conversions: { some: { ...order, conversionDate: { ...(start ? { gte: start } : {}), ...(end ? { lte: end } : {}) } } } },
            ...(end ? [{ conversions: { none: { ...order, conversionDate: { gt: end } } } }] : []),
        ] };
}
function recallableFromNotes(notes, now = new Date()) {
    const value = notes?.match(/预计召回时间:([^,\n]*)/)?.[1].trim();
    if (!value)
        return false;
    // Preserve old ISO timestamps as well as the current date-only field.
    let day = value;
    if (/^\d{4}-\d{2}-\d{2}T/.test(value)) {
        const instant = new Date(value);
        if (!Number.isFinite(+instant))
            return false;
        day = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai' }).format(instant);
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(Date.parse(day)) || new Date(day).toISOString().slice(0, 10) !== day)
        return false;
    const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai' }).format(now);
    const cutoff = new Date(Date.parse(today + 'T00:00:00Z') + 7 * 86400000).toISOString().slice(0, 10);
    return day <= cutoff;
}
//# sourceMappingURL=studentListRead.js.map