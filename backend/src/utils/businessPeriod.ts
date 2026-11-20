import { ApiError } from '../middleware/errorHandler';
const todaySH = () => new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
export function businessPeriod(query: any) {
  const today = todaySH();
  const startText = query.startDate === undefined ? today.slice(0, 7) + '-01' : query.startDate;
  const endText = query.endDate === undefined ? today : query.endDate;
  const parse = (value: any, end: boolean) => {
    if (
      typeof value !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2}))?$/.test(value)
    )
      throw new ApiError('日期须为有效业务日期', 400, 'INVALID_DATE');
    const day = value.slice(0, 10),
      calendar = new Date(day + 'T00:00:00Z');
    if (!Number.isFinite(+calendar) || calendar.toISOString().slice(0, 10) !== day)
      throw new ApiError('日期无效', 400, 'INVALID_DATE');
    const date = new Date(
      value.length === 10 ? value + (end ? 'T23:59:59.999+08:00' : 'T00:00:00+08:00') : value
    );
    if (!Number.isFinite(+date)) throw new ApiError('日期无效', 400, 'INVALID_DATE');
    return date;
  };
  const start = parse(startText, false),
    end = parse(endText, true);
  if (start > end || +end - +start > 367 * 86400000)
    throw new ApiError('日期范围须按先后选择且不超过一年', 400, 'INVALID_DATE');
  return { start, end };
}
