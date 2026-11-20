"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.followupOccurrenceWhere = followupOccurrenceWhere;
/**
 * Attendance follow-up includes marked occurrences (even if marked early) and
 * elapsed, still-scheduled occurrences. An absent mark is not materialized:
 * missing marks are derived from the effective roster, so later make-up marks
 * replace the absence without leaving a second attendance/lesson transaction.
 * Cancelled, rescheduled-away and class-paused occurrences never qualify.
 */
function followupOccurrenceWhere(now = new Date()) {
    return {
        OR: [
            { status: 'completed' },
            { status: 'scheduled', endTime: { lte: now } },
        ],
    };
}
//# sourceMappingURL=followupOccurrences.js.map