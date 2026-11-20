import type { ActualConsumption } from '../utils/actualConsumption';
import dayjs, { type Dayjs } from 'dayjs';

export type DateRange = [Dayjs, Dayjs];
export type Period = 'week' | 'month' | 'lastMonth' | 'custom';
type Metric = number | null;
export interface StaffRow {
  teacherId: string;
  teacherName: string;
  role?: string;
}
export interface TeacherRow extends StaffRow, ActualConsumption {
  classCount: Metric;
  studentCount: Metric;
  baseCount: Metric;
  expectedAttendance?: Metric;
  actualAttendance?: Metric;
  attendanceRate: Metric;
  renewalRate: Metric;
  totalOrderAmount: Metric;
  personalNewRecruits: Metric;
  enrollmentStart?: Metric;
  enrollmentEnd?: Metric;
  enrollmentAdded?: Metric;
  enrollmentEnded?: Metric;
  enrollmentNet?: Metric;
  historyAvailable?: boolean;
  historyNote?: string;
  nonRenewals?: Metric;
  missingPriceCount?: Metric;
  unlinkedNewOrderCount?: Metric;
}
export interface SalesRow extends StaffRow {
  addedCount: Metric;
  invitationCount: Metric;
  attendanceCount: Metric;
  orderCount: Metric;
  orderAmount: Metric;
  newOrderCount: Metric;
  newOrderAmount: Metric;
  renewalOrderCount: Metric;
  renewalOrderAmount: Metric;
  missingPriceCount?: Metric;
  newMissingPriceCount?: Metric;
  renewalMissingPriceCount?: Metric;
}
export type StaffOption = { id: string; name: string };

export const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
const numberFormat = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 });
const moneyFormat = new Intl.NumberFormat('zh-CN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
export const amount = (n: unknown) => (finite(n) ? '¥' + moneyFormat.format(n) : '—');
export const number = (n: unknown, unit = '') => (finite(n) ? numberFormat.format(n) + unit : '—');
export const change = (a: unknown, b: unknown) =>
  finite(a) && finite(b) ? Math.round((a - b) * 100) / 100 : null;
export const signed = (n: unknown, unit = '') =>
  finite(n) ? (n > 0 ? '+' : '') + number(n, unit) : '—';
export const sortNumber = (a: Metric | undefined, b: Metric | undefined) =>
  finite(a) && finite(b) ? a - b : finite(a) ? 1 : finite(b) ? -1 : 0;
export const asDate = (d: Dayjs) => d.format('YYYY-MM-DD');
export const rangeLabel = (range: DateRange) => asDate(range[0]) + ' 至 ' + asDate(range[1]);

export function presetRange(key: Exclude<Period, 'custom'>): DateRange {
  const today = dayjs(new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' }));
  if (key === 'week') return [today.subtract((today.day() + 6) % 7, 'day'), today];
  if (key === 'lastMonth')
    return [today.subtract(1, 'month').startOf('month'), today.subtract(1, 'month').endOf('month')];
  return [today.startOf('month'), today];
}
export function previousRange([start, end]: DateRange): DateRange {
  const days = end.startOf('day').diff(start.startOf('day'), 'day') + 1;
  return [start.subtract(days, 'day'), start.subtract(1, 'day')];
}

export function isRow(value: unknown): value is StaffRow {
  if (!value || typeof value !== 'object') return false;
  const r = value as StaffRow;
  return typeof r.teacherId === 'string' && !!r.teacherId && typeof r.teacherName === 'string';
}
const hasMetrics = (row: StaffRow, keys: string[]) =>
  keys.every((key) => {
    const val = (row as unknown as Record<string, unknown>)[key];
    return val === null || finite(val);
  });
export function isTeacherRow(row: unknown): row is TeacherRow {
  return (
    isRow(row) &&
    hasMetrics(row, [
      'classCount',
      'studentCount',
      'baseCount',
      'attendanceRate',
      'renewalRate',
      'totalOrderAmount',
      'personalNewRecruits',
    ])
  );
}
export function isSalesRow(row: unknown): row is SalesRow {
  return (
    isRow(row) &&
    hasMetrics(row, [
      'addedCount',
      'invitationCount',
      'attendanceCount',
      'orderCount',
      'orderAmount',
      'newOrderCount',
      'newOrderAmount',
      'renewalOrderCount',
      'renewalOrderAmount',
    ])
  );
}
