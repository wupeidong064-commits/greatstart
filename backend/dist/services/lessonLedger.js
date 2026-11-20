"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LessonLedger = void 0;
exports.creditCents = creditCents;
exports.readLessonLedgers = readLessonLedgers;
exports.readStudentLedger = readStudentLedger;
const lessonOrderEvidence_1 = require("./lessonOrderEvidence");
const legacyRefundReconciliation_1 = require("./legacyRefundReconciliation");
const client_1 = require("@prisma/client");
const errorHandler_1 = require("../middleware/errorHandler");
const logSelect = { id: true, studentId: true, type: true, lessons: true, scheduleId: true, reversalOfId: true,
    conversionId: true, lessonSource: true, allocations: true, creditAmountCents: true, notes: true, businessDate: true,
    refundId: true, purchasedReduction: true, createdAt: true, ledgerSequence: true };
const orderRef = (log) => log.conversionId ?? (0, lessonOrderEvidence_1.printedOrderId)(log.notes);
const delta = (log) => (log.type === 'add' ? 1 : -1) * log.lessons;
const invalid = () => new errorHandler_1.ApiError('课时流水与批次不一致，请核对原始入账与冲回记录', 409, 'LESSON_LEDGER_RECONCILIATION_REQUIRED');
function creditCents(price, lessons, orderLessons) {
    if (price == null || !orderLessons || lessons > orderLessons)
        return null;
    const cents = new client_1.Prisma.Decimal(price).times(100).toNumber();
    if (lessons === orderLessons)
        return cents;
    // For a partial import only an even unit price is provable without knowing
    // whether the credited subset included the order's final (remainder) unit.
    return cents % orderLessons === 0 ? cents / orderLessons * lessons : null;
}
function valuation(parts, lessonSource) {
    return { lessonSource, allocations: parts, amountCents: parts.reduce((n, p) => n + (p.amountCents ?? 0), 0),
        unpricedLessons: parts.reduce((n, p) => n + (p.amountCents === null ? p.lessons : 0), 0) };
}
function price(lot, range) {
    if (lot.cents === null)
        return null;
    const base = Math.floor(lot.cents / lot.size);
    return base * range.lessons + (range.start + range.lessons === lot.size ? lot.cents % lot.size : 0);
}
class LessonLedger {
    constructor(supplements = new Map()) {
        this.supplements = supplements;
        this.traceableCredits = new Set();
        this.supplementedCredits = new Set();
        this.reconciliationRequired = false;
        this.lots = new Map();
        this.ambiguousDebits = new Set();
        this.valuations = new Map();
        this.activeBySchedule = new Map();
        this.reversed = new Set();
        this.retiredLots = new Set();
        this.refundLogs = new Set();
        this.verifiedCredits = new Map();
        this.valuationEvidence = new Map();
    }
    creditDetail(id) {
        const lot = this.lots.get(id);
        return lot && { source: lot.source, cents: lot.cents, remaining: this.availableIn(id), retired: this.retiredLots.has(id),
            traceable: this.traceableCredits.has(id) };
    }
    assertWritable() {
        if (this.reconciliationRequired)
            throw invalid();
    }
    // Earlier versions collapsed a legacy refund with an unlinked cancellation
    // into "opening". Alias that old coordinate system only when a fully
    // evidenced replay ends with one priced purchase owning every available unit.
    certifyOpening(before, refundIds) {
        if (!before || !refundIds.length || this.lots.has('opening'))
            return;
        const open = [...this.lots.values()].filter(l => l.free.length);
        const lot = open[0];
        if (open.length !== 1 || !this.verifiedCredits.has(lot.id) || this.availableIn(lot.id) !== before)
            return;
        this.openingAlias = { lot, ranges: lot.free.map(r => ({ ...r })), refunds: refundIds };
    }
    verifiedParts(raw, logId) {
        const recorded = normalizeParts(raw);
        let changed = false, usedAlias = false;
        const verified = recorded.flatMap(part => {
            if (part.amountCents !== null)
                return [part];
            const alias = this.openingAlias;
            if (part.lotId === 'opening' && alias) {
                const end = part.start + part.lessons;
                let offset = 0;
                const slices = [];
                for (const range of alias.ranges) {
                    const from = Math.max(offset, part.start), to = Math.min(offset + range.lessons, end);
                    if (to > from) {
                        const r = { start: range.start + from - offset, lessons: to - from };
                        slices.push({ ...r, lotId: alias.lot.id, amountCents: price(alias.lot, r) });
                    }
                    offset += range.lessons;
                }
                if (slices.reduce((n, r) => n + r.lessons, 0) !== part.lessons)
                    throw invalid();
                usedAlias = changed = true;
                return slices;
            }
            const lot = this.lots.get(part.lotId);
            if (lot && (this.verifiedCredits.has(lot.id) || this.supplementedCredits.has(lot.id))) {
                changed = true;
                return [{ ...part, amountCents: price(lot, part) }];
            }
            return [part];
        });
        if (changed && logId)
            this.valuationEvidence.set(logId, { recorded, verified,
                orderIds: [...new Set(verified.map(p => this.verifiedCredits.get(p.lotId) ?? (this.supplementedCredits.has(p.lotId) ? this.supplements.get(p.lotId)?.orderId : null)).filter((s) => !!s))],
                refundIds: usedAlias ? this.openingAlias.refunds : [],
                pricingIds: [...new Set(verified.map(p => this.supplementedCredits.has(p.lotId) ? this.supplements.get(p.lotId)?.id : undefined).filter((s) => !!s))] });
        return verified;
    }
    outstandingRefundsIn(lotId) {
        let total = 0;
        for (const id of this.refundLogs)
            if (!this.reversed.has(id)) {
                for (const p of this.valuations.get(id)?.allocations || [])
                    if (p.lotId === lotId)
                        total += p.lessons;
            }
        return total;
    }
    get balance() {
        let paidRemainingLessons = 0, giftRemainingLessons = 0, unpricedRemainingLessons = 0;
        for (const lot of this.lots.values()) {
            const count = lot.free.reduce((n, r) => n + r.lessons, 0);
            if (lot.source === 'gift')
                giftRemainingLessons += count;
            else if (lot.cents === null)
                unpricedRemainingLessons += count;
            else
                paidRemainingLessons += count;
        }
        return { paidRemainingLessons, giftRemainingLessons, unpricedRemainingLessons };
    }
    credit(id, size, cents, source = 'paid', spent = false) {
        if (size < 0 || this.lots.has(id))
            throw invalid();
        if (size)
            this.lots.set(id, { id, size, cents, source, free: spent ? [] : [{ start: 0, lessons: size }] });
    }
    availableIn(id) {
        const lot = id && this.lots.get(id);
        return lot ? lot.free.reduce((n, r) => n + r.lessons, 0) : null;
    }
    // Plan before mutating, so an insufficient source never partially consumes another pool.
    take(count, source, preferredId) {
        const lots = [...this.lots.values()];
        if (source === 'any')
            lots.sort((a, b) => Number(b.id === preferredId) - Number(a.id === preferredId) || Number(a.source === 'gift') - Number(b.source === 'gift'));
        const parts = [];
        let left = count;
        for (const lot of lots) {
            if (source !== 'any' && lot.source !== source)
                continue;
            for (const range of lot.free) {
                const lessons = Math.min(range.lessons, left);
                if (!lessons)
                    break;
                const slice = { start: range.start, lessons };
                parts.push({ lotId: lot.id, ...slice, amountCents: price(lot, slice) });
                left -= lessons;
            }
            if (!left)
                break;
        }
        if (left)
            throw new errorHandler_1.ApiError(source === 'gift' ? '赠送课时不足' : '可扣课时不足，请核对付费、赠送余额', 409, source === 'gift' ? 'INSUFFICIENT_GIFT_LESSONS' : source === 'paid' ? 'INSUFFICIENT_PAID_LESSONS' : 'INSUFFICIENT_LESSONS');
        this.apply(parts, false);
        return parts;
    }
    apply(parts, restore) {
        for (const p of parts) {
            const lot = this.lots.get(p.lotId);
            if (!lot || !Number.isInteger(p.start) || !Number.isInteger(p.lessons) || p.lessons <= 0 ||
                p.start < 0 || p.start + p.lessons > lot.size || price(lot, p) !== p.amountCents)
                throw invalid();
            const end = p.start + p.lessons;
            if (restore) {
                if (lot.free.some(r => r.start < end && r.start + r.lessons > p.start))
                    throw invalid();
                lot.free.push({ start: p.start, lessons: p.lessons });
                lot.free.sort((a, b) => a.start - b.start);
                for (let i = lot.free.length - 1; i > 0; i--) {
                    const a = lot.free[i - 1], b = lot.free[i];
                    if (a.start + a.lessons === b.start) {
                        a.lessons += b.lessons;
                        lot.free.splice(i, 1);
                    }
                }
            }
            else {
                const idx = lot.free.findIndex(r => r.start <= p.start && r.start + r.lessons >= end);
                if (idx < 0)
                    throw invalid();
                const r = lot.free[idx];
                const rest = [{ start: r.start, lessons: p.start - r.start }, { start: end, lessons: r.start + r.lessons - end }];
                lot.free.splice(idx, 1, ...rest.filter(s => s.lessons > 0));
            }
        }
    }
    reverse(id) {
        const original = this.valuations.get(id);
        if (!original || this.reversed.has(id))
            throw invalid();
        if (original.allocations.some(p => this.retiredLots.has(p.lotId))) {
            throw new errorHandler_1.ApiError('原扣课批次已作废，无法返还至该批次，请先核对原单与扣课记录', 409, 'VOIDED_LESSON_LOT');
        }
        this.apply(original.allocations, true);
        this.reversed.add(id);
        return original;
    }
    replay(log, orders, gifts, creditRefs) {
        if (!Number.isInteger(log.lessons) || log.lessons < 0)
            throw invalid();
        const reversal = log.type === 'add' && (log.scheduleId || log.reversalOfId ||
            (!log.lessonSource && !gifts.has(log.id) && log.notes?.startsWith('退费取消返还')));
        let source = log.lessonSource === 'gift' ? 'gift' : 'paid';
        if (log.type === 'add' && !reversal) {
            if (log.lessonSource === 'gift' && (log.creditAmountCents?.toNumber() !== 0 || log.conversionId))
                throw invalid();
            if (log.lessonSource === 'paid' && log.creditAmountCents !== null && !log.conversionId && log.notes !== '建档初始课时')
                throw invalid();
            const ref = orderRef(log), order = ref && orders.get(ref);
            const proven = order && order.studentId === log.studentId &&
                (log.conversionId || log.businessDate === order.conversionDate) &&
                ['confirmed', 'voided', 'pending'].includes(order.approvalStatus);
            const gift = source === 'gift' || !log.lessonSource && gifts.has(log.id);
            const recordedCents = log.creditAmountCents?.toNumber() ?? null;
            const certifiable = proven && ['confirmed', 'voided'].includes(order.approvalStatus) && !gift;
            const orderCents = proven && (!log.lessonSource || certifiable && log.conversionId) ?
                creditCents(order.price, log.lessons, order.totalLessons) : null;
            let cents = gift ? 0 : recordedCents ?? orderCents;
            const supplemental = this.supplements.get(log.id);
            if (supplemental && supplemental.studentId === log.studentId && !gift && recordedCents === null && supplemental.originalLessons === log.lessons) {
                cents = supplemental.amountCents.toNumber();
                this.supplementedCredits.add(log.id);
            }
            else if (certifiable && orderCents !== null && recordedCents === null)
                this.verifiedCredits.set(log.id, order.id);
            this.traceableCredits.add(log.id);
            this.credit(log.id, log.lessons, cents, gift ? 'gift' : 'paid');
            if (ref && (proven || log.lessonSource && log.conversionId)) {
                if (creditRefs.has(ref))
                    throw invalid();
                creditRefs.set(ref, log.id);
            }
            return;
        }
        let value;
        if (reversal) {
            const origin = log.reversalOfId ?? (log.scheduleId ? this.activeBySchedule.get(log.scheduleId) : undefined);
            if (!origin)
                throw invalid();
            value = this.reverse(origin);
            if (log.lessonSource && log.lessonSource !== value.lessonSource)
                throw invalid();
            if (log.allocations && JSON.stringify(normalizeParts(this.verifiedParts(log.allocations, log.id))) !== JSON.stringify(normalizeParts(value.allocations)))
                throw invalid();
            if (log.scheduleId) {
                if (this.activeBySchedule.get(log.scheduleId) !== origin)
                    throw invalid();
                this.activeBySchedule.delete(log.scheduleId);
            }
        }
        else {
            if (!['refund', 'void', 'deduct'].includes(log.type))
                throw invalid();
            let parts;
            if (log.allocations !== null) {
                parts = this.verifiedParts(log.allocations, log.id);
                if (log.type === 'deduct' && parts.some(p => this.lots.get(p.lotId)?.source !== source))
                    throw invalid();
                this.apply(parts, false);
            }
            else {
                // Earlier attendance didn't record a pool choice. If gifts could have
                // supplied the charge, neither a paid amount nor a zero is provable.
                let pool = log.type === 'deduct' ? source : 'any';
                if (log.type === 'deduct' && !log.lessonSource) {
                    const b = this.balance, paid = b.paidRemainingLessons + b.unpricedRemainingLessons;
                    if (b.giftRemainingLessons && !paid)
                        pool = source = 'gift';
                    else if (b.giftRemainingLessons && paid) {
                        if (log.lessons !== paid + b.giftRemainingLessons)
                            throw invalid();
                        pool = 'any';
                    }
                }
                const preferred = log.type === 'void' ? log.reversalOfId ?? creditRefs.get(log.conversionId || '') : undefined;
                if (log.type !== 'deduct' && !preferred && log.lessons > 0) {
                    const open = [...this.lots.values()].map(lot => lot.free.reduce((n, r) => n + r.lessons, 0)).filter(Boolean);
                    if (open.length > 1 && log.lessons !== open.reduce((n, q) => n + q, 0))
                        throw invalid();
                }
                parts = this.take(log.lessons, pool, preferred);
            }
            value = valuation(parts, source);
            if (log.type === 'deduct' && log.scheduleId) {
                if (this.activeBySchedule.has(log.scheduleId))
                    throw invalid();
                this.activeBySchedule.set(log.scheduleId, log.id);
            }
        }
        if (value.allocations.reduce((n, p) => n + p.lessons, 0) !== log.lessons)
            throw invalid();
        this.valuations.set(log.id, value);
        if (log.type === 'refund')
            this.refundLogs.add(log.id);
        if (log.type === 'void') {
            const id = log.reversalOfId || creditRefs.get(log.conversionId || '');
            if (id)
                this.retiredLots.add(id);
        }
    }
    // A pre-ledger debit can be reversed into unknown-price units, never into
    // today's paid lot. Keep its identity for future correction and replay.
    unresolved(logs, remaining, proven, gifts = new Set()) {
        // Each uncertain historical debit could have used gifts, up to its quantity.
        // Preserve the minimum gift stock proved even under that worst case.
        let guaranteedGifts = 0;
        for (const log of logs) {
            const known = proven?.valuations.get(log.id);
            const giftUnits = known?.allocations.reduce((n, p) => n + (proven?.lots.get(p.lotId)?.source === 'gift' ? p.lessons : 0), 0);
            if (log.type === 'add' && !log.reversalOfId && !log.scheduleId && (log.lessonSource === 'gift' || gifts.has(log.id)))
                guaranteedGifts += log.lessons;
            else if (log.type !== 'add')
                guaranteedGifts -= giftUnits ?? log.lessons;
            else if (known)
                guaranteedGifts += giftUnits ?? 0;
        }
        guaranteedGifts = Math.max(0, Math.min(remaining, guaranteedGifts));
        this.credit('opening', remaining - guaranteedGifts, null);
        this.credit('legacy-guaranteed-gifts', guaranteedGifts, 0, 'gift');
        // Earlier fully verified debits stay priced even if a later legacy event
        // makes the remaining pool composition unknowable. Preserve their spent
        // unit positions so corrections can still restore those exact units.
        if (proven)
            for (const id of proven.retiredLots)
                this.retiredLots.add(id);
        if (proven)
            for (const lot of proven.lots.values()) {
                if (lot.id !== 'opening' && lot.id !== 'legacy-guaranteed-gifts')
                    this.credit(lot.id, lot.size, lot.cents, lot.source, true);
            }
        const credits = new Map();
        for (const log of logs) {
            const ref = orderRef(log);
            if (ref && log.type === 'add' && !log.reversalOfId)
                credits.set(ref, log.id);
            if (log.type === 'void') {
                const retired = log.reversalOfId ?? credits.get(log.conversionId || '');
                if (retired)
                    this.retiredLots.add(retired);
            }
            if (log.type === 'deduct' || log.type === 'refund') {
                if (log.type === 'refund')
                    this.refundLogs.add(log.id);
                const lotId = 'historical:' + log.id;
                const original = proven?.valuations.get(log.id);
                if (original && !original.allocations.some(p => p.lotId === 'opening'))
                    this.valuations.set(log.id, original);
                else {
                    this.credit(lotId, log.lessons, null, 'paid', true);
                    this.valuations.set(log.id, valuation(log.lessons ? [{ lotId, start: 0, lessons: log.lessons, amountCents: null }] : [], 'paid'));
                }
                if (log.scheduleId)
                    this.activeBySchedule.set(log.scheduleId, log.id);
            }
            else if (log.type === 'add' && (log.scheduleId || log.reversalOfId)) {
                const id = log.reversalOfId || this.activeBySchedule.get(log.scheduleId || '');
                const old = id && this.valuations.get(id);
                if (old) {
                    this.valuations.set(log.id, old);
                    this.reversed.add(id);
                }
                if (log.scheduleId)
                    this.activeBySchedule.delete(log.scheduleId);
            }
        }
    }
}
exports.LessonLedger = LessonLedger;
function normalizeParts(input) {
    if (!Array.isArray(input))
        throw invalid();
    return input.map(part => {
        if (!part || typeof part !== 'object' || !('lotId' in part) || typeof part.lotId !== 'string' ||
            typeof part.start !== 'number' || typeof part.lessons !== 'number' ||
            (part.amountCents !== null && typeof part.amountCents !== 'number'))
            throw invalid();
        return { lotId: part.lotId, start: part.start, lessons: part.lessons, amountCents: part.amountCents };
    });
}
function auditReversals(ledger, rows) {
    const byId = new Map(rows.map(row => [row.id, row]));
    const seen = new Set();
    for (const row of rows) {
        if (row.type !== 'add' || !row.reversalOfId)
            continue;
        const original = byId.get(row.reversalOfId);
        if (original?.type !== 'deduct' && original?.type !== 'refund')
            continue;
        const value = ledger.valuations.get(original.id);
        let matches = !seen.has(original.id) && original.lessons === row.lessons && original.scheduleId === row.scheduleId &&
            (!row.lessonSource || row.lessonSource === value?.lessonSource);
        if (row.allocations !== null) {
            try {
                matches = matches && !!value && JSON.stringify(normalizeParts(ledger.verifiedParts(row.allocations))) === JSON.stringify(normalizeParts(value.allocations));
            }
            catch {
                matches = false;
            }
        }
        seen.add(original.id);
        if (!matches)
            ledger.ambiguousDebits.add(original.id);
    }
    if (ledger.ambiguousDebits.size)
        ledger.reconciliationRequired = true;
    return ledger;
}
function build(student, rows, orders, gifts, supplements, matches) {
    const refs = new Map();
    let ledger = new LessonLedger(supplements);
    const firstSnapshot = rows.findIndex(r => r.lessonSource !== null || r.allocations !== null);
    const old = firstSnapshot === -1 ? rows : rows.slice(0, firstSnapshot);
    const current = rows.slice(old.length);
    const before = student.remainingLessons - current.reduce((total, r) => total + delta(r), 0);
    const opening = before - old.reduce((total, r) => total + delta(r), 0);
    try {
        // A discrepancy against the original opening can have arisen at any point
        // in an unversioned history. Do not assign its consumption to priced lots.
        const only = old.length === 1 && old[0].type === 'add' ? old[0] : undefined;
        const orderId = only && orderRef(only), order = orderId && orders.get(orderId);
        const purchasedBefore = (student.purchasedLessons ?? NaN) - current.reduce((n, r) => n +
            (r.type === 'void' ? -(r.purchasedReduction ?? NaN) : r.type === 'refund' ? -r.lessons : r.type === 'add' && !r.scheduleId ? r.lessons : 0), 0);
        const consumedBefore = (student.consumedLessons ?? NaN) - current.reduce((n, r) => n +
            (r.type === 'deduct' ? r.lessons : r.type === 'add' && r.scheduleId ? -r.lessons : 0), 0);
        const soleOpening = opening < 0 && before >= 0 && only && order && order.studentId === student.id &&
            (only.conversionId || order.conversionDate === only.businessDate) && purchasedBefore === only.lessons && consumedBefore === -opening;
        if (soleOpening) {
            // A single documented purchase and both matching legacy counters prove
            // the remaining quantity comes from it. Missing debit records leave its
            // unit positions and actual past amounts unpriced.
            ledger.credit(only.id, only.lessons, null);
            ledger.take(-opening, 'paid');
            refs.set(order.id, only.id);
        }
        else {
            if (opening < 0 || opening > 0 && old.some(r => r.type !== 'add' || r.scheduleId || r.reversalOfId))
                throw invalid();
            ledger.credit('opening', opening, null);
        }
        for (const [i, r] of (soleOpening ? [] : old).entries()) {
            const next = old[i + 1];
            if (next && r.ledgerSequence === null && next.ledgerSequence === null &&
                r.createdAt.getTime() === next.createdAt.getTime())
                throw invalid();
            ledger.replay(r, orders, gifts, refs);
        }
        if (matches)
            ledger.certifyOpening(before, old.flatMap(r => matches.get(r.id)?.refundId ?? []));
    }
    catch (e) {
        if (!(e instanceof errorHandler_1.ApiError))
            throw e;
        const verifiedPrefix = ledger;
        ledger = new LessonLedger(supplements);
        ledger.unresolved(old, before, verifiedPrefix, gifts);
        refs.clear();
    }
    try {
        for (const r of current)
            ledger.replay(r, orders, gifts, refs);
        const { paidRemainingLessons, giftRemainingLessons, unpricedRemainingLessons } = ledger.balance;
        if (paidRemainingLessons + giftRemainingLessons + unpricedRemainingLessons !== student.remainingLessons)
            throw invalid();
    }
    catch (error) {
        if (!(error instanceof errorHandler_1.ApiError))
            throw error;
        const prefix = ledger;
        ledger = new LessonLedger(supplements);
        ledger.unresolved(rows.filter(r => r.lessons >= 0), Math.max(0, student.remainingLessons), prefix, gifts);
        ledger.reconciliationRequired = true;
    }
    return auditReversals(ledger, rows);
}
// Read all source credits, including purchases prior to the requested reporting
// window. The caller supplies authorized students and a consistent DB snapshot.
async function readLessonLedgers(db, students, organizationId) {
    const ids = students.map(s => s.id);
    if (!ids.length)
        return new Map();
    const [logs, receiptRows, pricing] = await Promise.all([
        db.lessonLog.findMany({ where: { organizationId, studentId: { in: ids } }, select: logSelect,
            orderBy: [{ ledgerSequence: { sort: 'asc', nulls: 'first' } }, { createdAt: 'asc' }, { id: 'asc' }] }),
        // Renewal receipts have existed longer than linked credit logs. The
        // committed order+quantity is sufficient posting evidence when unique.
        db.$queryRaw `
      SELECT "studentId","createdAt",response #>> '{conversion,id}' AS "orderId",
        response #>> '{conversion,totalLessons}' AS lessons FROM renewal_requests
      WHERE "organizationId"=${organizationId} AND "studentId" IN (${client_1.Prisma.join(ids)})`,
        db.lessonBatchPricing.findMany({ where: { organizationId, studentId: { in: ids } },
            select: { id: true, studentId: true, creditLogId: true, originalLessons: true, amountCents: true, orderId: true } }),
    ]);
    const supplements = new Map(pricing.map(p => [p.creditLogId, p]));
    const recorded = new Set(logs.filter(l => l.type === 'add' && !l.reversalOfId).map(l => l.studentId + ':' + orderRef(l)));
    const receiptCounts = new Map();
    for (const row of receiptRows)
        if (row.orderId)
            receiptCounts.set(row.orderId, 1 + (receiptCounts.get(row.orderId) || 0));
    const missing = receiptRows.filter(row => row.orderId && !recorded.has(row.studentId + ':' + row.orderId) && receiptCounts.get(row.orderId) === 1);
    const legacy = logs.filter(log => !log.lessonSource && !log.allocations);
    const unfrozen = logs.filter(l => l.type === 'add' && l.lessonSource === 'paid' && l.creditAmountCents === null);
    const orderIds = [...new Set([...legacy.map(orderRef), ...unfrozen.map(orderRef), ...missing.map(r => r.orderId)].filter((s) => !!s))];
    const [orders, receipts, provenance] = await Promise.all([
        orderIds.length ? db.conversion.findMany({ where: { organizationId, id: { in: orderIds }, studentId: { in: ids } },
            select: { id: true, studentId: true, price: true, totalLessons: true, conversionDate: true, approvalStatus: true, classId: true,
                student: { select: { campusId: true } }, class: { select: { organizationId: true, campusId: true } } } }) : [],
        legacy.length ? db.lessonAddRequest.findMany({ where: { organizationId, studentId: { in: ids } }, select: { response: true, studentId: true } }) : [],
        (0, lessonOrderEvidence_1.readOrderEvidence)(db, organizationId, orderIds),
    ]);
    const orderMap = new Map(orders.filter(o => o.studentId && (!o.classId || o.class?.organizationId === organizationId && o.student?.campusId != null && o.class.campusId === o.student.campusId) && provenance.allows(o.id, o.studentId)).map(o => [o.id, o]));
    for (const r of missing) {
        const order = r.orderId && orderMap.get(r.orderId);
        if (!order || order.studentId !== r.studentId || !order.totalLessons || String(order.totalLessons) !== r.lessons)
            continue;
        logs.push({ id: 'renewal:' + order.id, studentId: r.studentId, type: 'add', lessons: order.totalLessons, scheduleId: null,
            businessDate: order.conversionDate, conversionId: order.id, reversalOfId: null, refundId: null, lessonSource: null,
            allocations: null, creditAmountCents: null, purchasedReduction: null, notes: null, createdAt: r.createdAt, ledgerSequence: null });
    }
    if (missing.length)
        logs.sort((a, b) => {
            if (a.ledgerSequence === null && b.ledgerSequence !== null)
                return -1;
            if (a.ledgerSequence !== null && b.ledgerSequence === null)
                return 1;
            return (a.ledgerSequence ?? 0) - (b.ledgerSequence ?? 0) || +a.createdAt - +b.createdAt || a.id.localeCompare(b.id);
        });
    const gifts = new Set();
    for (const r of receipts) {
        const value = r.response;
        const log = value?.data?.log;
        if (log?.id && log.studentId === r.studentId && log.type === 'add')
            gifts.add(log.id);
    }
    const refundMatches = await (0, legacyRefundReconciliation_1.legacyRefundMatches)(db, organizationId, logs, gifts);
    const byStudent = new Map();
    for (const log of logs) {
        if (!byStudent.has(log.studentId))
            byStudent.set(log.studentId, []);
        byStudent.get(log.studentId).push(log);
    }
    const candidates = students.filter(s => {
        const rows = byStudent.get(s.id) || [];
        const first = rows[0];
        return first?.type === 'add' && !first.lessonSource && !!orderRef(first) &&
            first.lessons > s.remainingLessons - rows.slice(1).reduce((n, r) => n + delta(r), 0);
    });
    const profiles = candidates.length ? await db.student.findMany({ where: { organizationId, id: { in: candidates.map(s => s.id) } },
        select: { id: true, purchasedLessons: true, consumedLessons: true } }) : [];
    const counters = new Map(profiles.map(s => [s.id, s]));
    return new Map(students.map(s => {
        const rows = byStudent.get(s.id) || [];
        const student = { ...s, ...counters.get(s.id) };
        try {
            if (rows.some(r => refundMatches.has(r.id))) {
                const linked = rows.map(r => {
                    const match = refundMatches.get(r.id);
                    return match ? { ...r, reversalOfId: match.debitId, refundId: match.refundId } : r;
                });
                const improved = build(student, linked, orderMap, gifts, supplements, refundMatches);
                if (!improved.reconciliationRequired)
                    return [s.id, improved];
                // The original synthetic ranges may still be ambiguous with several
                // surviving batches. Preserve their old, writable unpriced inventory.
            }
            return [s.id, build(student, rows, orderMap, gifts, supplements)];
        }
        catch (error) {
            if (!(error instanceof errorHandler_1.ApiError))
                throw error;
            // Preserve readable reports even if an externally edited modern ledger
            // cannot be replayed. Keep immutable, well-formed valuations as evidence.
            const ledger = new LessonLedger();
            ledger.unresolved(rows.filter(r => r.lessons >= 0), Math.max(0, s.remainingLessons), undefined, gifts);
            ledger.reconciliationRequired = true;
            return [s.id, auditReversals(ledger, rows)];
        }
    }));
}
async function readStudentLedger(tx, student, org) {
    const ledger = (await readLessonLedgers(tx, [student], org)).get(student.id);
    ledger.assertWritable();
    return ledger;
}
//# sourceMappingURL=lessonLedger.js.map