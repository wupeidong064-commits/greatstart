import { beforeEach, describe, expect, it, vi } from 'vitest';
const { db } = vi.hoisted(() => ({ db: { $transaction: vi.fn(), user: { findFirst: vi.fn() } } }));
vi.mock('../src/config/database', () => ({ default: db }));
import { summarizeNewStudentAttendance, type NewStudentSnapshot, newStudentAttendance } from '../src/services/aiNewStudentAttendance';
import { validateToolPlan, runPlannedTools } from '../src/services/aiTools';
import { newStudentAttendanceIntent, inheritPreviousIntent } from '../src/services/aiWorkbenchPolicy';

const day = (s: string) => new Date(s + 'T04:00:00Z');
const cutoff = day('2026-11-15');
const scope = { organizationId: 'org', campusId: 'campus', userId: 'manager', today: '2026-11-15' };
function sample(): NewStudentSnapshot {
  return { orders: [{ id: 'order', studentId: 'student', studentName: '小甲', conversionDate: '2026-11-05' }],
    firstSales: [{ studentId: 'student', _min: { conversionDate: '2026-11-05' } }],
    students: [{ id: 'student', name: '小甲', status: 'active' }],
    enrollments: [{ studentId: 'student', classId: 'class', enrolledAt: day('2026-11-05'), endedAt: null,
      status: 'active', class: { name: '一班', teacher: { name: '老师' } } }],
    schedules: [{ id: 'lesson', classId: 'class', startTime: day('2026-11-12'), endTime: day('2026-11-12') }], attendances: [] };
}
const summarize = (s: NewStudentSnapshot) => summarizeNewStudentAttendance(s, '2026-11-02', '2026-11-08', cutoff);
const mark = (s: NewStudentSnapshot, status: string, isTemporary = false) => s.attendances.push({ studentId: 'student', classId: 'class', scheduleId: 'lesson', status, isTemporary });
beforeEach(() => vi.clearAllMocks());

describe('new-sale cohort and subsequent attendance', () => {
  it.each(['present', 'late'])('counts %s after the signup week through observation cutoff', status => {
    const s = sample(); mark(s, status);
    expect(summarize(s).totals).toMatchObject({ 已到课学员数: 1, 暂无到课记录学员数: 0 });
  });
  it.each(['leave', 'absent', 'makeUp'])('does not claim %s is attendance', status => {
    const s = sample(); mark(s, status); expect(summarize(s).rows[0]).toMatchObject({ 已到课次数: 0, 应到次数: 1 });
  });
  it('separates no eligible occurrences from absence and excludes future early check-in', () => {
    const s = sample(); s.schedules[0].startTime = day('2026-11-16'); mark(s, 'present');
    expect(summarize(s).rows[0]).toMatchObject({ 已到课次数: 0, 应到次数: 0, 跟进说明: '已入班，报名后尚无应到场次' });
  });
  it('preserves saved temporary attendance without inventing enrollment', () => {
    const s = sample(); s.enrollments = []; mark(s, 'present', true);
    expect(summarize(s).rows[0]).toMatchObject({ 已到课次数: 1, 当前班级: '未入班' });
  });
  it('does not count a mark outside enrollment eligibility', () => {
    const s = sample(); s.enrollments[0].endedAt = day('2026-11-10'); mark(s, 'present');
    expect(summarize(s).rows[0]).toMatchObject({ 已到课次数: 0, 应到次数: 0, 当前班级: '未入班' });
  });
  it('does not turn an unlinked same-name order into a non-attending student', () => {
    const s = sample(); s.orders.push({ id: 'unlinked', studentId: null, studentName: '小甲', conversionDate: '2026-11-06' });
    expect(summarize(s).totals).toMatchObject({ 期间新签订单数: 2, 首次新签可核学员数: 1, 暂无到课记录学员数: 1, 关联待核成单笔数: 1 });
    expect(summarize(s).rows[1]).toMatchObject({ 到课状态: '待核', 已到课次数: '未知' });
  });
  it('deduplicates students and excludes subsequent new-sale orders outside the first-new cohort', () => {
    const s = sample(); s.orders.push({ ...s.orders[0], id: 'second' }); expect(summarize(s).totals.首次新签可核学员数).toBe(1);
    s.firstSales[0]._min.conversionDate = '2026-10-01'; expect(summarize(s).totals).toMatchObject({ 首次新签可核学员数: 0, 剔除非首次新签学员数: 1 });
  });
  it('uses a read-only snapshot and caller scope on all relations', async () => {
    const empty = () => vi.fn().mockResolvedValue([]);
    const tx = { $executeRawUnsafe: vi.fn(), conversion: { findMany: empty(), groupBy: empty() }, student: { findMany: empty() },
      enrollment: { findMany: empty() }, attendance: { findMany: empty() }, schedule: { findMany: empty() } };
    db.$transaction.mockImplementation(fn => fn(tx)); await newStudentAttendance(scope, { startDate: '2026-11-02', endDate: '2026-11-08' }, cutoff);
    expect(tx.$executeRawUnsafe).toHaveBeenCalledWith('SET TRANSACTION READ ONLY');
    expect(tx.conversion.findMany.mock.calls[0][0].where).toMatchObject({ organizationId: 'org', approvalStatus: 'confirmed' });
    expect(tx.student.findMany.mock.calls[0][0].where).toMatchObject({ organizationId: 'org', campusId: 'campus' });
    expect(tx.enrollment.findMany.mock.calls[0][0].where.class).toEqual({ organizationId: 'org', campusId: 'campus' });
    expect(tx.attendance.findMany.mock.calls[0][0].where.schedule).toMatchObject({ organizationId: 'org', campusId: 'campus' });
    expect(tx.schedule.findMany.mock.calls[0][0].where).toMatchObject({ organizationId: 'org', campusId: 'campus' });
  });
});

describe('complete typed query plans', () => {
  it('rejects the reported mixed plan before any business read', async () => {
    const plan = [{ name: 'signup_renewal', params: { startDate: '2026-11-02' } }, { name: 'business_records', params: {} }, { name: 'business_records', params: {} }];
    expect(validateToolPlan(plan).tools).toEqual([]); await expect(runPlannedTools(scope, plan)).rejects.toThrow('查询计划不完整');
    expect(db.user.findFirst).not.toHaveBeenCalled(); expect(db.$transaction).not.toHaveBeenCalled();
  });
  it.each([{ domain: 'credentials' }, { domain: 'students', startDate: '2026-02-30' }, []])('rejects an invalid domain, calendar date or parameter object', params => {
    expect(validateToolPlan([{ name: 'business_records', params: params as any }]).errors.length).toBeGreaterThan(0);
  });
  it('deduplicates calls regardless of parameter key order', () => {
    const result = validateToolPlan([{ name: 'business_records', params: { domain: 'students', status: 'active' } }, { name: 'business_records', params: { status: 'active', domain: 'students' } }]);
    expect(result.errors).toEqual([]); expect(result.tools).toHaveLength(1);
  });
  it('routes the actual shortcut to a joined query and does not inherit an unrelated previous total', () => {
    const question = '上周新报学员哪些还没来上过课？', intent = newStudentAttendanceIntent(question, '2026-11-15');
    expect(intent?.tools).toEqual([{ name: 'new_student_attendance', params: { startDate: '2026-11-02', endDate: '2026-11-08', asOfDate: '2026-11-15', attendanceState: 'not_attended' } }]);
    const previous = [{ tool: 'signup_renewal', rows: [], filters: {}, timeRange: { start: '2026-10-01', end: '2026-10-31' } }];
    expect(inheritPreviousIntent(question, intent!, previous, '2026-11-15')).toEqual(intent);
    expect(inheritPreviousIntent('上周呢？', {}, previous, '2026-11-15').tools?.[0].name).toBe('signup_renewal');
  });
  it('does not capture dangerous requests, finance questions or renewal-only attendance', () => {
    for (const q of ['删除上周新报没来上课的学员', '上周续费学员哪些没来上课', '本月新签金额多少', '新报学员出勤率']) expect(newStudentAttendanceIntent(q, '2026-11-15')).toBeUndefined();
  });
});
