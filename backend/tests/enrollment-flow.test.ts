import { describe, it, expect } from 'vitest';
import { enrollmentFlow, classEnrollmentFlow } from '../src/services/enrollmentFlow';
const start = new Date('2026-11-01T00:00:00+08:00'), end = new Date('2026-11-08T23:59:59.999+08:00');
const row = (from: string, to: string | null, overrides = {}) => ({ classId: 'class', studentId: 'student', enrolledAt: new Date(from), endedAt: to ? new Date(to) : null, status: to ? 'cancelled' : 'active', ...overrides });
describe('evidenced enrollment period flow', () => {
  it('counts leaving and rejoining the same class as separate events, without a negative reduction', () => {
    const flow = enrollmentFlow([row('2026-10-01', '2026-11-03'), row('2026-11-04', null)], start, end);
    expect(flow).toMatchObject({ historyAvailable: true, startCount: 1, added: 1, removedTotal: 1, removedByStatus: 0, endCount: 1 });
  });
  it('preserves separate lifecycle events when one period ends exactly as the next begins', () => {
    const rows = [row('2026-10-01', '2026-11-03'), row('2026-11-03', null)];
    expect(enrollmentFlow(rows, start, end)).toMatchObject({ startCount: 1, added: 1, removedTotal: 1, endCount: 1 });
    expect(classEnrollmentFlow(rows, start, end)).toMatchObject({ startCount: 1, added: 0, removedTotal: 0, endCount: 1 });
  });
  it('counts boundary events once and merges genuinely overlapping duplicate memberships', () => {
    const rows = [row(start.toISOString(), '2026-11-03'), row('2026-11-02', end.toISOString())];
    expect(enrollmentFlow(rows, start, end)).toMatchObject({ startCount: 0, added: 1, removedTotal: 1, endCount: 0 });
  });
  it('keeps independent classes and excludes events after selected period end', () => {
    const flow = enrollmentFlow([row('2026-10-01', null), row('2026-11-02', null, { classId: 'second' }), row('2026-11-09', null)], start, end);
    expect(flow).toMatchObject({ startCount: 1, added: 1, removedTotal: 0, endCount: 2 });
  });
  it('does not invent the end of a legacy terminal enrollment', () => {
    const flow = enrollmentFlow([row('2026-10-01', null, { status: 'completed' })], start, end);
    expect(flow).toMatchObject({ historyAvailable: false, unknownPeriods: 1, startCount: null, added: null, removedTotal: null, endCount: null });
  });
});
