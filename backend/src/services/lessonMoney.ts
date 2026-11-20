import { Prisma } from '@prisma/client';
import { ApiError } from '../middleware/errorHandler';

export function parseLessonAmount(value:unknown, label='原批次总价') {
  if ((typeof value!=='string' && typeof value!=='number') || !/^\d{1,8}(?:\.\d{1,2})?$/.test(String(value).trim()))
    throw new ApiError('请填写'+label+'，范围为0至99999999.99元，最多两位小数',400,'INVALID_PRICE');
  return new Prisma.Decimal(String(value).trim()).times(100).toNumber();
}
