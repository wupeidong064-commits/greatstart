"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.refundSummary = refundSummary;
const database_1 = __importDefault(require("../config/database"));
// 2026-11-08: refund aggregates for the cashflow board, same source and caliber as
// "学员管理 -> 退费记录": approved refunds count by confirmedAt(reviewedAt) in window;
// cancelled count by cancelledAt(updatedAt) and never add to refund amount.
// Legacy fields (actualPaid*/cashReceipts/netCashFlow) come from the retired
// payment/payout ledger and remain for historical data visibility only.
async function refundSummary(scope, start, end, client = database_1.default) {
    const range = start || end ? { ...(start ? { gte: start } : {}), ...(end ? { lte: end } : {}) } : undefined;
    const [result, cancelled, paid, receipts] = await Promise.all([
        client.refund.aggregate({ where: { organizationId: scope.organizationId, status: 'approved', ...(scope.campusId ? { student: { campusId: scope.campusId } } : {}), ...(range ? { reviewedAt: range } : {}) }, _count: { id: true }, _sum: { amountToRefund: true, lessonsToRefund: true } }),
        client.refund.aggregate({ where: { organizationId: scope.organizationId, status: 'cancelled', ...(scope.campusId ? { student: { campusId: scope.campusId } } : {}), ...(range ? { updatedAt: range } : {}) }, _count: { id: true }, _sum: { amountToRefund: true } }),
        client.refundPayout.aggregate({ where: { organizationId: scope.organizationId, ...(scope.campusId ? { campusId: scope.campusId } : {}), ...(range ? { paidAt: range } : {}) }, _count: { id: true }, _sum: { amount: true } }),
        client.payment.aggregate({ where: { organizationId: scope.organizationId, ...(scope.campusId ? { student: { campusId: scope.campusId } } : {}), ...(range ? { paidAt: range } : {}) }, _sum: { amount: true } }),
    ]);
    const actualPaidAmount = Number(paid._sum.amount || 0), cashReceipts = Number(receipts._sum.amount || 0);
    return { approvedCount: result._count.id, approvedAmount: Number(result._sum.amountToRefund || 0), approvedLessons: result._sum.lessonsToRefund || 0,
        cancelledCount: cancelled._count.id, cancelledAmount: Number(cancelled._sum.amountToRefund || 0),
        actualPaidCount: paid._count.id, actualPaidAmount, cashReceipts, netCashFlow: cashReceipts - actualPaidAmount,
        caliber: '已通过退费按确认时间和学员当前校区计入；已取消按取消时间计入且不计入退费金额；与「学员管理 → 退费记录」同源同口径，同时间段两边数字一致。' };
}
//# sourceMappingURL=refundSummary.js.map