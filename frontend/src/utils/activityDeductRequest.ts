import type { LessonSource } from './lessonBalance';

export type PendingActivityDeduct = { lessonSource: LessonSource; requestId: string; studentId: string; lessons: number; notes: string };

export function activityDeductStorageKey(organizationId: string | undefined, userId: string, studentId: string) {
  if (!organizationId) throw new Error('未分配机构，无法活动划课');
  return `pending-activity-deduct:v1:${JSON.stringify([organizationId, userId, studentId])}`;
}

export function readPendingActivityDeduct(key: string, studentId: string): PendingActivityDeduct | null {
  const raw = sessionStorage.getItem(key);
  if (raw === null) return null;
  try {
    const value = JSON.parse(raw);
    if (!value || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.requestId) || value.studentId !== studentId || !Number.isSafeInteger(value.lessons) || value.lessons <= 0 || typeof value.notes !== 'string') throw new Error('invalid');
    if (value.lessonSource !== undefined && value.lessonSource !== 'paid' && value.lessonSource !== 'gift') throw new Error('invalid lesson source');
    return { ...value, lessonSource: value.lessonSource ?? 'paid' };
  } catch {
    // Never silently discard an unreadable receipt: its request may already have committed.
    throw new Error('此学员有无法读取的待确认活动划课记录，请先联系管理员核对流水');
  }
}

export function savePendingActivityDeduct(key: string, request: PendingActivityDeduct) {
  sessionStorage.setItem(key, JSON.stringify(request));
  if (sessionStorage.getItem(key) !== JSON.stringify(request)) throw new Error('无法保存活动划课重试记录，请检查浏览器存储后再提交');
}
