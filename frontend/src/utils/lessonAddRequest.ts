export type PendingLessonAdd = { requestId: string; studentId: string; lessons: number; notes: string };

export function lessonAddStorageKey(organizationId: string | undefined, userId: string, studentId: string) {
  if (!organizationId) throw new Error('未分配机构，无法增课');
  return `pending-lesson-add:v1:${JSON.stringify([organizationId, userId, studentId])}`;
}

export function readPendingLessonAdd(key: string, studentId: string): PendingLessonAdd | null {
  const raw = sessionStorage.getItem(key);
  if (raw === null) return null;
  try {
    const value = JSON.parse(raw);
    if (!value || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.requestId) || value.studentId !== studentId || !Number.isSafeInteger(value.lessons) || value.lessons <= 0 || typeof value.notes !== 'string') throw new Error('invalid');
    return value;
  } catch {
    // Never silently discard an unreadable receipt: its request may already have committed.
    throw new Error('此学员有无法读取的待确认增课记录，请先联系管理员核对流水');
  }
}

export function savePendingLessonAdd(key: string, request: PendingLessonAdd) {
  sessionStorage.setItem(key, JSON.stringify(request));
  if (sessionStorage.getItem(key) !== JSON.stringify(request)) throw new Error('无法保存增课重试记录，请检查浏览器存储后再提交');
}
