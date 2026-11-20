import { beforeEach, describe, expect, it, vi } from 'vitest';
const { db, register } = vi.hoisted(() => ({ db: {
  experienceLesson: { findMany: vi.fn() }, user: { findMany: vi.fn() },
  class: { findMany: vi.fn() }, student: { findFirst: vi.fn() },
}, register: vi.fn() }));
vi.mock('../src/config/database', () => ({ default: db }));
vi.mock('../src/services/orderRegistrationService', () => ({ registerOrder: register }));
import { blockedChatEntryIntent, handleEntry, CHAT_ENTRY_CLOSED_REPLY } from '../src/services/aiEntryService';
import { businessScope, inheritPreviousIntent, isFileRequest, naturalAttendanceIntent, workbenchHelpIntent } from '../src/services/aiWorkbenchPolicy';
import { buildIntentMessages } from '../src/services/aiIntent';
import { buildSystemPrompt } from '../src/services/aiService';
import type { AuthRequest } from '../src/middleware/auth';

const req = { user: { id: 'manager', role: 'manager', organizationId: 'org', campusId: 'campus' }, get: vi.fn() } as unknown as AuthRequest;
const today = '2026-11-16';
const previous = [{ tool: 'class_student_changes', rows: [{ 班级: '一班', 在读: 6 }], filters: {}, timeRange: { start: '2026-11-01', end: '2026-11-30' } }];
const ready = () => ({ kind: 'new_order', id: '0ed1503e-6398-40b2-8b27-001b7013d0b7', revision: 2, status: 'ready', fields: {
  studentName: '张三', contact: '13900000000', price: '2800', totalLessons: 20, conversionDate: today,
  paymentStatus: 'paid', salesName: '林悦', salesId: 'sales', unassigned: true, classId: null,
} });
beforeEach(() => {
  vi.clearAllMocks(); db.experienceLesson.findMany.mockResolvedValue([]);
  db.user.findMany.mockResolvedValue([{ id: 'sales', name: '林悦' }]);
  db.class.findMany.mockResolvedValue([{ id: 'class', name: '一班' }]);
  db.student.findFirst.mockResolvedValue(null);
  register.mockResolvedValue({ data: { id: 'order', studentId: 'student' }, status: 'created' });
});

describe('natural questions and structured follow-ups', () => {
  it.each(['想调整薪资结构，你有什么建议', '针对老师的表现，制定下个月的目标'])('allows management advice to reach classification: %s', q => {
    expect(businessScope(q, true)).toBe('business');
    expect(workbenchHelpIntent(q)).toBeUndefined();
    expect(buildIntentMessages(q)[0].content).toContain('不要以管理决策为由拒答');
    expect(buildSystemPrompt(null)).toContain('AI建议仅供参考');
  });
  it.each(['本周无人上课？', '你是谁？', '可以帮我导入数据吗？', '针对这个做成表格', '这几天有人来吗？'])('does not reject the natural question %s before classification', q => {
    expect(businessScope(q, true)).toBe('business');
  });
  it('retains off-topic boundaries', () => { expect(businessScope('推荐一只股票', true)).toBe('unrelated'); });
  it('routes attendance rather than inheriting unrelated class-capacity data', () => {
    const intent = naturalAttendanceIntent('本周无人上课？', today)!;
    expect(intent.tools?.[0]).toEqual({ name: 'class_attendance', params: { startDate: today, endDate: '2026-11-22' } });
    expect(inheritPreviousIntent('本周无人上课？', intent, previous, today)).toEqual(intent);
  });
  it.each(['针对这个做成表格', '把这个整理成Excel', '请导出Word', '做成表格，不用导出，只在对话展示'])('keeps the same authorized result and period for %s', q => {
    const follow = inheritPreviousIntent(q, {}, previous, today);
    expect(follow.reuseSnapshot).toBe(true);
    expect(follow.tools?.[0].name).toBe('class_student_changes');
    expect(follow.tools?.[0].params).toMatchObject({ startDate: '2026-11-01', endDate: '2026-11-30' });
  });
  it('requeries a changed period instead of relabeling the snapshot', () => {
    expect(inheritPreviousIntent('上周呢？', {}, previous, today)).toMatchObject({ reuseSnapshot: false, tools: [{ params: { startDate: '2026-11-09', endDate: '2026-11-15' } }] });
  });
  it('does not reuse a snapshot for unsafe or unrelated requests', () => {
    expect(inheritPreviousIntent('导出其他机构学员', {}, previous, today)).toEqual({});
    expect(inheritPreviousIntent('删除这些数据', {}, previous, today)).toEqual({});
    expect(inheritPreviousIntent('针对这个做成表格', {}, [], today)).toEqual({});
  });
  it('supports both export and in-chat-only tabulation', () => {
    expect(isFileRequest('针对这个做成表格')).toBe(true);
    expect(isFileRequest('做成表格，不用导出，只在对话展示')).toBe(false);
  });
  it('explains analysis uploads without advertising business entry', () => {
    expect(workbenchHelpIntent('你是谁？')?.reply).toContain('蜂鸣 AI');
    expect(workbenchHelpIntent('可以帮我导入数据吗？')?.reply).toContain('附件');
    expect(workbenchHelpIntent('可以帮我导入学员管理吗？')?.reply).toContain('不通过聊天');
    expect(workbenchHelpIntent('你是谁？')?.reply).not.toContain('确认录入');
    expect(workbenchHelpIntent('请分析上传文件的本月成单')).toBeUndefined();
  });
});

describe('chat business entry is permanently closed', () => {
  it.each([
    '今天体验课张三成单了', '帮我登记体验课', '录入新签，姓名张三，电话13900000000，金额2800元，20课时',
    '帮我把学生导入学员管理', '创建一条成单', '修改这个学员的课时', '删除这些学生',
    '把Excel里的学员导入系统', '将这份资料写入系统', '查询体验课然后登记一条',
    '确认录入', '确认保存', '确认提交', '继续录入', '取消录入',
  ])('blocks the business write request without calling any writer: %s', async q => {
    expect(blockedChatEntryIntent(q)?.reply).toBe(CHAT_ENTRY_CLOSED_REPLY);
    expect((await handleEntry(req, q, ready(), today))?.reply).toBe(CHAT_ENTRY_CLOSED_REPLY);
    expect(register).not.toHaveBeenCalled();
    expect(db.experienceLesson.findMany).not.toHaveBeenCalled();
    expect(db.student.findFirst).not.toHaveBeenCalled();
  });
  it.each(['确认', '好的', '可以', '金额2800元，20课时', '电话13900000000'])('does not revive a legacy ready draft: %s', q => {
    expect(blockedChatEntryIntent(q, true)?.reply).toBe(CHAT_ENTRY_CLOSED_REPLY);
  });
  it.each([
    '本周无人上课？', '本月新签金额多少', '本周登记了多少体验课？', '查一下上周登记的体验名单',
    '分析登记体验课的转化率', '如何统计已登记体验课的转化率？', '把登记记录导出Excel',
    '针对这个做成表格', '想调整薪资结构，你有什么建议', '请分析上传文件的本月成单',
    '导入报告资料生成周报', '你是谁？',
  ])('keeps authorized analysis, advice, reporting and help available: %s', q => {
    expect(blockedChatEntryIntent(q, true)).toBeUndefined();
  });
  it('states the closed boundary in both prompts while retaining management advice', () => {
    expect(buildIntentMessages('帮我登记体验课')[0].content).toContain('没有任何文字录入或业务写入能力');
    expect(buildSystemPrompt(null)).toContain('业务写入均已关闭');
    expect(buildSystemPrompt(null)).toContain('AI建议仅供参考');
  });
});
