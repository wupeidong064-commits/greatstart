import { parsePhoneNumberFromString } from 'libphonenumber-js/max';

export function normalizePhone(value: string): string {
  return value.replace(/\s/g, '').replace(/^\+86/, '');
}

export function isValidPhone(value: string): boolean {
  return /^1[3-9]\d{9}$/.test(normalizePhone(value));
}

export function isValidContactPhone(value: string): boolean {
  const phone = value.trim();
  if (!phone) return true; // Required fields enforce presence at their own form boundary.
  if (phone.length > 32 || !/^\+?(?:\d+|\(\d+\))(?:[ -]?(?:\d+|\(\d+\)))*$/.test(phone)) return false;
  return parsePhoneNumberFromString(phone, { defaultCountry: 'CN', extract: false })?.isValid() === true;
}
