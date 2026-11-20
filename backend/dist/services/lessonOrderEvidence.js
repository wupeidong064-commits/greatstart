"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.printedOrderId = void 0;
exports.readOrderEvidence = readOrderEvidence;
const client_1 = require("@prisma/client");
const printedOrderId = (notes) => /^(?:新签|续费)入账：(.+)$/.exec(notes || '')?.[1];
exports.printedOrderId = printedOrderId;
async function readOrderEvidence(tx, organizationId, ids) {
    const postings = new Map(), renewals = new Map();
    if (ids.length) {
        const [credits, receipts] = await Promise.all([
            tx.lessonLog.findMany({ where: { organizationId, type: 'add', OR: [{ conversionId: { in: ids } },
                        { notes: { in: ids.flatMap(id => ['新签入账：' + id, '续费入账：' + id]) } }] },
                select: { id: true, studentId: true, conversionId: true, notes: true } }),
            tx.$queryRaw `SELECT response #>> '{conversion,id}' AS id,"studentId"
        FROM renewal_requests WHERE "organizationId"=${organizationId} AND response #>> '{conversion,id}' IN (${client_1.Prisma.join(ids)})`,
        ]);
        for (const row of credits)
            for (const id of new Set([row.conversionId, (0, exports.printedOrderId)(row.notes)])) {
                if (!id)
                    continue;
                const group = postings.get(id) ?? [];
                group.push(row);
                postings.set(id, group);
            }
        for (const row of receipts) {
            const group = renewals.get(row.id) ?? [];
            group.push(row.studentId);
            renewals.set(row.id, group);
        }
    }
    return {
        allows(orderId, studentId, creditId, alreadyLinked = false) {
            const credits = postings.get(orderId) ?? [], receipts = renewals.get(orderId) ?? [];
            if (receipts.length > 1 || receipts.some(s => s !== studentId) || credits.length > 1)
                return false;
            const linked = credits[0];
            if (linked && (linked.studentId !== studentId || creditId && linked.id !== creditId ||
                linked.conversionId && (0, exports.printedOrderId)(linked.notes) && linked.conversionId !== (0, exports.printedOrderId)(linked.notes)))
                return false;
            return !creditId || !receipts.length || alreadyLinked;
        },
    };
}
//# sourceMappingURL=lessonOrderEvidence.js.map