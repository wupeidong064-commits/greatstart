import { beforeEach, describe, expect, it, vi } from 'vitest';

const { db, tx } = vi.hoisted(() => {
  const tx = {
    $executeRaw: vi.fn(),
    user: { findUniqueOrThrow: vi.fn(), findFirstOrThrow: vi.fn(), updateMany: vi.fn() },
    class: { count: vi.fn() }, student: { count: vi.fn() },
  };
  return { tx, db: { $transaction: vi.fn(async (fn: any) => fn(tx)), user: { findFirst: vi.fn(), findFirstOrThrow: vi.fn() } } };
});
vi.mock('../src/config/database', () => ({ default: db }));
vi.mock('../src/services/personnelStatisticsService', () => ({ personnelOptions: vi.fn(), teachingPerformance: vi.fn(), salesPerformance: vi.fn() }));
import { userController } from '../src/controllers/userController';

const version = new Date('2026-11-13T00:00:00Z');
const actor = { id: 'super', organizationId: 'org', campusId: 'campus', role: 'manager', managementLevel: 'super', isActive: true };
const target = { id: 'teacher', organizationId: 'org', campusId: 'campus', role: 'coach', managementLevel: 'none', isPlatformAdmin: false, isActive: true, updatedAt: version };
async function update(body: object) {
  const next = vi.fn(), res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
  await userController.updateUser({ user: actor, params: { id: target.id }, body: { expectedUpdatedAt: version.toISOString(), ...body } } as any, res as any, next);
  return { next, res };
}

describe('教师改岗交接前置检查', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.user.findFirst.mockResolvedValue({ ...target });
    db.user.findFirstOrThrow.mockResolvedValue({ ...target });
    tx.user.findUniqueOrThrow.mockResolvedValue({ ...actor });
    tx.user.findFirstOrThrow.mockResolvedValue({ ...target });
    tx.user.updateMany.mockResolvedValue({ count: 1 });
    tx.class.count.mockResolvedValue(0); tx.student.count.mockResolvedValue(0);
  });

  it.each(['sales', 'staff'])('有未删除班级时拒绝改为%s，保留原资料', async role => {
    tx.class.count.mockResolvedValue(1);
    const { next } = await update({ role, name: '不能落库的修改' });
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 409, code: 'TEACHER_ROLE_HAS_RESPONSIBILITIES' }));
    expect(tx.user.updateMany).not.toHaveBeenCalled();
    expect(tx.class.count).toHaveBeenCalledWith({ where: { organizationId: 'org', teacherId: target.id, status: { not: 'deleted' } } });
  });
  it('无班但有沉默回访责任时仍拒绝改岗', async () => {
    tx.student.count.mockResolvedValue(1);
    const { next } = await update({ role: 'staff' });
    expect(next.mock.calls[0][0]).toMatchObject({ code: 'TEACHER_ROLE_HAS_RESPONSIBILITIES' });
    expect(next.mock.calls[0][0].message).toContain('1 名待回访学员');
    expect(tx.user.updateMany).not.toHaveBeenCalled();
    expect(tx.student.count.mock.calls[0][0].where).toMatchObject({ organizationId: 'org', recallTeacherId: target.id, status: { not: 'archived' } });
    expect(tx.student.count.mock.calls[0][0].where).not.toHaveProperty('campusId');
  });
  it.each(['teacher', 'coach'])('兼容%s存储岗位，移交完毕可以改岗', async originalRole => {
    tx.user.findFirstOrThrow.mockResolvedValue({ ...target, role: originalRole });
    const { next, res } = await update({ role: 'sales' });
    expect(next).not.toHaveBeenCalled(); expect(res.json).toHaveBeenCalled();
    expect(tx.user.updateMany.mock.calls[0][0].data.role).toBe('sales');
    expect(tx.$executeRaw).toHaveBeenCalledTimes(2);
    expect(tx.$executeRaw.mock.invocationCallOrder[1]).toBeLessThan(tx.class.count.mock.invocationCallOrder[0]);
    expect(tx.student.count.mock.invocationCallOrder[0]).toBeLessThan(tx.user.updateMany.mock.invocationCallOrder[0]);
  });
  it('仅改姓名不要求移交', async () => {
    const { next } = await update({ name: '新姓名' });
    expect(next).not.toHaveBeenCalled(); expect(tx.class.count).not.toHaveBeenCalled();
  });
  it('teacher转coach仍为教师，不要求移交', async () => {
    tx.user.findFirstOrThrow.mockResolvedValue({ ...target, role: 'teacher' });
    const { next } = await update({ role: 'coach' });
    expect(next).not.toHaveBeenCalled(); expect(tx.student.count).not.toHaveBeenCalled();
  });
  it('等待锁后按实时岗位判定，不能用旧的销售快照绕过检查', async () => {
    db.user.findFirst.mockResolvedValue({ ...target, role: 'sales' });
    tx.class.count.mockResolvedValue(1);
    const { next } = await update({ role: 'staff' });
    expect(next.mock.calls[0][0].code).toBe('TEACHER_ROLE_HAS_RESPONSIBILITIES');
    expect(tx.user.updateMany).not.toHaveBeenCalled();
  });
  it('权限被撤销时不执行改岗', async () => {
    tx.user.findUniqueOrThrow.mockResolvedValue({ ...actor, role: 'staff', managementLevel: 'none' });
    const { next } = await update({ role: 'sales' });
    expect(next.mock.calls[0][0].statusCode).toBe(403); expect(tx.user.updateMany).not.toHaveBeenCalled();
  });
  it('资源查询失败时阻止修改', async () => {
    tx.student.count.mockRejectedValueOnce(new Error('query failed'));
    const { next } = await update({ role: 'sales' });
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: 'query failed' }));
    expect(tx.user.updateMany).not.toHaveBeenCalled();
  });
});
