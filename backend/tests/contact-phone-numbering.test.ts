import { describe, expect, it } from 'vitest';
import { validateContactPhone } from '../src/utils/studentProfileFields';
import { isValidContactPhone } from '../../frontend/src/utils/phone';

describe('contact telephone numbering plans on both write boundaries', () => {
  it.each([
    '13800138000', '+86 138 0013 8000', '010-82345678', '(010) 82345678',
    '021-64000000', '0571-87654321', '+86 10 8234 5678',
    '+852 2345 6789', '+44 7911 123456', '+44 (20) 7946 0958', '+1 202-555-0123',
  ])('accepts a complete mobile, area-code landline or international number: %s', value => {
    expect(validateContactPhone(value)).toBe(value);
    expect(isValidContactPhone(value)).toBe(true);
  });
  it.each([
    '1380013800', '138001380000', '+86 1380013800', '12800138000', '82345678',
    '010-823456', '+852 1234 5678', '+999 123456789', '+0 123456789',
    '+44 123', '+1 202555012345678', '微信13800138000', 'wx10086abc',
    '13800138000转123', '(010 82345678', '010) 82345678', '1380013\0' + '8000',
    '+44--7911123456', '123', '!!!',
  ])('rejects an incomplete, invalid or non-telephone value: %s', value => {
    expect(() => validateContactPhone(value)).toThrow();
    expect(isValidContactPhone(value)).toBe(false);
  });
  it('keeps optional-field handling and the original input formatting', () => {
    expect(validateContactPhone('')).toBeNull();
    expect(isValidContactPhone('')).toBe(true);
    expect(validateContactPhone('  +44 7911 123456  ')).toBe('+44 7911 123456');
  });
});
