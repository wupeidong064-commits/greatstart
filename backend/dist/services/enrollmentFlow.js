"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.enrollmentFlow = enrollmentFlow;
exports.classEnrollmentFlow = classEnrollmentFlow;
/** Merge overlapping membership periods per class/student without losing leave-and-return events. */
function enrollmentFlow(rows, start, end, mergeAdjacent = false) {
    const relevant = rows.filter(row => row.enrolledAt <= end);
    const incomplete = relevant.filter(row => (!row.endedAt && row.status !== 'active') || (row.endedAt && row.endedAt < row.enrolledAt));
    if (incomplete.length)
        return { historyAvailable: false, unknownPeriods: incomplete.length, startCount: null, added: null, removedRoster: null, removedByStatus: null, removedTotal: null, endCount: null };
    const groups = new Map();
    for (const row of relevant) {
        const key = `${row.classId}:${row.studentId}`;
        const own = groups.get(key) || [];
        own.push({ start: +row.enrolledAt, end: row.endedAt ? +row.endedAt : Infinity });
        groups.set(key, own);
    }
    let initial = 0, added = 0, removed = 0, final = 0;
    for (const own of groups.values()) {
        own.sort((a, b) => a.start - b.start);
        const merged = [];
        for (const interval of own) {
            const previous = merged[merged.length - 1];
            if (previous && (interval.start < previous.end || (mergeAdjacent && interval.start === previous.end)))
                previous.end = Math.max(previous.end, interval.end);
            else
                merged.push({ ...interval });
        }
        for (const interval of merged) {
            // The opening balance is immediately before the inclusive start boundary.
            if (interval.start < +start && interval.end >= +start)
                initial++;
            if (interval.start >= +start && interval.start <= +end)
                added++;
            if (interval.end >= +start && interval.end <= +end)
                removed++;
            if (interval.start <= +end && interval.end > +end)
                final++;
        }
    }
    return { historyAvailable: true, unknownPeriods: 0, startCount: initial, added, removedRoster: removed, removedByStatus: 0, removedTotal: removed, endCount: final };
}
/** A class remains nonempty when one membership ends exactly as another begins. */
function classEnrollmentFlow(rows, start, end) {
    return enrollmentFlow(rows.map(row => ({ ...row, studentId: '__class_population__' })), start, end, true);
}
//# sourceMappingURL=enrollmentFlow.js.map