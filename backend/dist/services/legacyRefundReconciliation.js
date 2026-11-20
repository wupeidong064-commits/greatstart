"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.legacyRefundMatches = legacyRefundMatches;
// Old confirmations and cancellations wrote the first eight characters of the
// same refund UUID into the journal. Resolve only unique pairs within both
// tenant and student, and only after the refund entity confirms cancellation.
async function legacyRefundMatches(tx, org, logs, gifts) {
    const candidates = logs.filter(r => r.type === 'add' && !r.reversalOfId && !r.refundId && !r.conversionId &&
        !r.lessonSource && !r.allocations && !r.scheduleId && !gifts.has(r.id) &&
        /^退费取消返还 [a-f0-9]{8}$/i.test(r.notes || ''));
    const matches = new Map();
    if (!candidates.length)
        return matches;
    const ids = [...new Set(candidates.map(r => r.studentId))];
    const refunds = await tx.refund.findMany({ where: { organizationId: org, studentId: { in: ids } },
        select: { id: true, studentId: true, status: true, lessonsToRefund: true, conversionId: true } });
    for (const r of candidates) {
        const prefix = r.notes.slice(-8).toLowerCase();
        const entities = refunds.filter(f => f.studentId === r.studentId && f.id.toLowerCase().startsWith(prefix));
        if (entities.length !== 1)
            continue;
        const f = entities[0];
        if (f.status !== 'cancelled' || f.conversionId || f.lessonsToRefund !== r.lessons || r.lessons <= 0)
            continue;
        const related = logs.filter(log => log.studentId === r.studentId && log.type === 'refund' &&
            (log.refundId === f.id || log.notes?.toLowerCase() === '退费确认 ' + prefix || log.notes?.toLowerCase() === '退费审批 ' + f.id.toLowerCase()));
        if (related.length !== 1)
            continue;
        const debit = related[0];
        const printed = debit.notes?.toLowerCase();
        if (debit.lessons !== r.lessons || debit.scheduleId || debit.createdAt >= r.createdAt || debit.conversionId ||
            debit.reversalOfId || debit.refundId && debit.refundId !== f.id ||
            (printed !== '退费确认 ' + prefix && printed !== '退费审批 ' + f.id.toLowerCase()))
            continue;
        const returns = logs.filter(log => log.studentId === r.studentId && log.type === 'add' &&
            (log.reversalOfId === debit.id || log.refundId === f.id || log.notes?.toLowerCase() === '退费取消返还 ' + prefix));
        if (returns.length !== 1 || returns[0].id !== r.id)
            continue;
        matches.set(r.id, { debitId: debit.id, refundId: f.id });
    }
    return matches;
}
//# sourceMappingURL=legacyRefundReconciliation.js.map