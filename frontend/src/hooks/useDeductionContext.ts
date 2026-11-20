import { useEffect, useState } from 'react';
import type { FormInstance } from 'antd';
import api from '../services/api';
import { readLessonBalance, type LessonBalance, type LessonSource } from '../utils/lessonBalance';

type Context<T> = { key: string; value: T | null; error: string };
type SavedAttendance = { source: LessonSource; status: string | null };
const blank = { key: '', value: null, error: '' };

export function useDeductionContext(
  studentId: string | undefined,
  scheduleId: string | undefined,
  form: FormInstance
) {
  const [balanceState, setBalanceState] = useState<Context<LessonBalance>>(blank);
  const [rosterState, setRosterState] = useState<Context<SavedAttendance>>(blank);
  const [balanceReload, setBalanceReload] = useState(0);
  const [rosterReload, setRosterReload] = useState(0);
  const scheduleKey = studentId && scheduleId ? JSON.stringify([studentId, scheduleId]) : '';
  useEffect(() => {
    setBalanceState(blank);
    if (!studentId) return;
    const controller = new AbortController();
    api
      .get('/lesson-logs/balance', { params: { studentId }, signal: controller.signal })
      .then((response) => {
        const balance = readLessonBalance(response.data);
        if (!balance || response.data?.studentId !== studentId)
          throw new Error('学员余额响应不完整');
        if (!controller.signal.aborted)
          setBalanceState({ key: studentId, value: balance, error: '' });
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setBalanceState({ key: studentId, value: null, error: error.message || '余额读取失败' });
      });
    return () => controller.abort();
  }, [studentId, balanceReload]);

  useEffect(() => {
    setRosterState(blank);
    if (!scheduleKey || !scheduleId) return;
    const controller = new AbortController();
    api
      .get(`/schedules/${encodeURIComponent(scheduleId)}/roster`, { signal: controller.signal })
      .then((response) => {
        const students: {
          id: string;
          attendanceStatus?: string | null;
          lessonSource?: LessonSource | null;
        }[] = response.data?.students;
        if (!Array.isArray(students)) throw new Error('场次名单响应不完整');
        const record = students.find((student) => student.id === studentId);
        if (!record) throw new Error('该学员不在这场课的名单中');
        if (!controller.signal.aborted) {
          const source = record.lessonSource ?? 'paid';
          const status =
            record.attendanceStatus === 'none' ? null : record.attendanceStatus || null;
          form.setFieldsValue({ lessonSource: source, attendanceStatus: status || 'present' });
          setRosterState({ key: scheduleKey, value: { source, status }, error: '' });
        }
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setRosterState({
            key: scheduleKey,
            value: null,
            error: error.message || '原签到读取失败',
          });
      });
    return () => controller.abort();
  }, [studentId, scheduleId, scheduleKey, form, rosterReload]);

  return {
    balance: balanceState.key === studentId ? balanceState.value : null,
    balanceError: balanceState.key === studentId ? balanceState.error : '',
    attendance: rosterState.key === scheduleKey ? rosterState.value : null,
    rosterError: rosterState.key === scheduleKey ? rosterState.error : '',
    retryBalance: () => setBalanceReload((n) => n + 1),
    retryRoster: () => setRosterReload((n) => n + 1),
  };
}
