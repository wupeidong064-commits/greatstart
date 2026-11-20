import { parsePhoneNumberFromString } from 'libphonenumber-js/max';

import { ApiError } from '../middleware/errorHandler';

/** A registration age is a snapshot; it must never be converted into a birthday. */
export function validateRecordedAge(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (!Number.isSafeInteger(value) || (value as number) < 0 || (value as number) > 150) {
    throw new ApiError('登记年龄须为 0 至 150 的整数', 400, 'INVALID_RECORDED_AGE');
  }
  return value as number;
}

/** Accept date-only and ISO timestamps while rejecting impossible calendar dates. */
export function parseProfileDate(value: unknown): Date | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string') throw new ApiError('日期无效', 400, 'INVALID_DATE');
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/.exec(value);
  if (!match) throw new ApiError('日期无效', 400, 'INVALID_DATE');
  const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
  const check = new Date(0);
  check.setUTCFullYear(year, month - 1, day);
  check.setUTCHours(0, 0, 0, 0);
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) {
    throw new ApiError('日期无效', 400, 'INVALID_DATE');
  }
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) throw new ApiError('日期无效', 400, 'INVALID_DATE');
  return parsed;
}

export function validateAddress(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string' || value.length > 2000) throw new ApiError('地址无效', 400, 'INVALID_ADDRESS');
  return value;
}

export function studentGenderFromConversion(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (value === 'M' || value === 'male' || value === '男') return 'M';
  if (value === 'F' || value === 'female' || value === '女') return 'F';
  return typeof value === 'string' ? value : null;
}

/** Only a valid mainland mobile can be used as parent login phone; landlines and international contacts stay in the profile. */
export function parentMobileFromContact(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.replace(/\s/g, '').replace(/^\+86/, '');
  return /^1[3-9]\d{9}$/.test(normalized) ? normalized : null;
}

/** Student profile names are bounded on every write path. */
export function validateStudentName(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) throw new ApiError('请输入学员姓名', 400, 'INVALID_STUDENT_NAME');
  const name = value.trim();
  if (name.length > 50 || name.includes('\0')) throw new ApiError('学员姓名不能超过50个字符或包含无效字符', 400, 'INVALID_STUDENT_NAME');
  return name;
}

/** Validate the complete number against country numbering plans; retain the entered formatting. */
export function validateContactPhone(value: unknown): string | null {
  if (value == null || value === '') return null;
  if (typeof value !== 'string') throw new ApiError('电话格式无效', 400, 'INVALID_PHONE');
  const phone = value.trim();
  if (!phone) return null;
  if (phone.length > 32 || !/^\+?(?:\d+|\(\d+\))(?:[ -]?(?:\d+|\(\d+\)))*$/.test(phone)
      || !parsePhoneNumberFromString(phone, { defaultCountry: 'CN', extract: false })?.isValid())
    throw new ApiError('请输入有效的电话号码', 400, 'INVALID_PHONE');
  return phone;
}

export function validateBusinessDate(value: string, label: string, now = new Date()): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !parseProfileDate(value)) throw new ApiError(label + '无效', 400, 'INVALID_DATE');
  const today = new Date(now.getTime() + 8 * 3600000).toISOString().slice(0, 10);
  if (value > today) throw new ApiError(label + '不能晚于今天', 400, 'FUTURE_DATE');
  return value;
}
