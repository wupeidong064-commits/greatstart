import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Enrollment, Prisma } from '@prisma/client';
import { assertCanEndEnrollment, enrollForConversion, rejectClientEnrollmentPeriod } from '../src/services/enrollmentPeriod';

const { database } = vi.hoisted(() => ({ database: { $transaction: vi.fn() } }));
vi.mock('../src/config/database', () => ({ default: database }));
import { enrollmentController } from '../src/controllers/enrollmentController';

const instant = new Date('2026-11-06T08:00:00.000Z');
const active = (): Enrollment => ({ id: 'enrollment', studentId: 'student', classId: 'old-class', organizationId: 'org', status: 'active', enrolledAt: new Date('2026-10-01T00:00:00Z'), endedAt: null, enrolledBy: null, notes: null, createdAt: instant, updatedAt: instant });
function transaction(row = active()) {
  return {
    $executeRaw: vi.fn().mockResolvedValue(1),
    $queryRaw: vi.fn().mockResolvedValue([{ id: 'row', status: 'active', capacity: 20 }]),
    enrollment: { findFirst: vi.fn().mockImplementation(async () => ({ ...row })), update: vi.fn().mockImplementation(async ({ data }) => Object.assign(row, data)), create: vi.fn().mockResolvedValue({}), count: vi.fn().mockResolvedValue(0), findMany: vi.fn().mockResolvedValue([row]) },
    attendance: { findFirst: vi.fn().mockResolvedValue(null) },
  };
}
function request(status: string, extra = {}) {
  return { params: { id: 'enrollment' }, query: {}, body: { status, ...extra }, user: { id: 'admin', role: 'admin', organizationId: 'org', campusId: 'campus' } } as any;
}
function response() { const res = { json: vi.fn(), status: vi.fn() }; res.status.mockReturnValue(res); return res as any; }

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(instant); database.$transaction.mockReset(); });
afterEach(() => vi.useRealTimers());

describe('enrollment periods', () => {
  it.each(['completed', 'cancelled'])('ends active as %s at server time and preserves it on retry', async status => {
    const row = active(); const tx = transaction(row); database.$transaction.mockImplementation(fn => fn(tx)); const next = vi.fn();
    await enrollmentController.updateEnrollment(request(status), response(), next);
    expect(next).not.toHaveBeenCalled(); expect(row.status).toBe(status); expect(row.endedAt).toEqual(instant);
    vi.setSystemTime(new Date(+instant + 10000));
    await enrollmentController.updateEnrollment(request(status), response(), next);
    expect(next).not.toHaveBeenCalled(); expect(row.endedAt).toEqual(instant); expect(tx.enrollment.update).toHaveBeenCalledTimes(1);
  });
  it('does not invent an end date for repeated legacy terminal status', async () => {
    const row = { ...active(), status: 'completed' }; const tx = transaction(row); database.$transaction.mockImplementation(fn => fn(tx)); const next = vi.fn();
    await enrollmentController.updateEnrollment(request('completed'), response(), next);
    expect(next).not.toHaveBeenCalled(); expect(row.endedAt).toBeNull(); expect(tx.enrollment.update).not.toHaveBeenCalled();
  });
  it.each(['active', 'cancelled'])('rejects rewriting completed history to %s', async status => {
    const tx = transaction({ ...active(), status: 'completed' }); database.$transaction.mockImplementation(fn => fn(tx)); const next = vi.fn();
    await enrollmentController.updateEnrollment(request(status), response(), next);
    expect(next.mock.calls[0][0]).toMatchObject({ statusCode: 409 }); expect(tx.enrollment.update).not.toHaveBeenCalled();
  });
  it.each(['endedAt', 'enrolledAt'])('rejects client supplied %s even null', field => {
    expect(() => rejectClientEnrollmentPeriod({ [field]: null })).toThrow('报名起止时间由服务器记录');
  });
  it('rejects future start without writing a negative period', async () => {
    const tx = transaction({ ...active(), enrolledAt: new Date(+instant + 1) }); database.$transaction.mockImplementation(fn => fn(tx)); const next = vi.fn();
    await enrollmentController.updateEnrollment(request('completed'), response(), next);
    expect(next.mock.calls[0][0]).toMatchObject({ code: 'INVALID_ENROLLMENT_PERIOD' }); expect(tx.enrollment.update).not.toHaveBeenCalled();
  });
  it('rejects shortening a period across a saved future attendance', async () => {
    const tx = transaction(); tx.attendance.findFirst.mockResolvedValue({ id: 'attendance' });
    await expect(assertCanEndEnrollment(tx as unknown as Prisma.TransactionClient, active(), instant)).rejects.toMatchObject({ code: 'ENROLLMENT_HAS_FUTURE_ATTENDANCE' });
  });
  it('rechecks enrollment after locking instead of overwriting a concurrent transfer', async () => {
    const tx = transaction(); tx.enrollment.findFirst.mockResolvedValueOnce(active()).mockResolvedValueOnce({ ...active(), status: 'transferred', endedAt: instant }); database.$transaction.mockImplementation(fn => fn(tx)); const next = vi.fn();
    await enrollmentController.updateEnrollment(request('completed'), response(), next);
    expect(next.mock.calls[0][0]).toMatchObject({ statusCode: 409 }); expect(tx.enrollment.update).not.toHaveBeenCalled();
  });
  it('renews into a class with history using a new enrollment and one boundary instant', async () => {
    const row = active(); const tx = transaction(row); tx.enrollment.findFirst.mockResolvedValue(null);
    await enrollForConversion(tx as unknown as Prisma.TransactionClient, 'student', 'new-class', { organizationId: 'org', campusId: 'campus' }, true, 'admin');
    expect(tx.enrollment.update).toHaveBeenCalledWith({ where: { id: row.id }, data: { status: 'completed', endedAt: instant } });
    expect(tx.enrollment.create.mock.calls[0][0].data).toMatchObject({ classId: 'new-class', enrolledAt: instant });
  });
});
