/** 班级常规时间：按北京时间每周重复。不会写数据库或自动生成排课。 */
export interface WeeklyClassRule {
  weekday: number; // 周日为 0，周一至周六为 1 至 6
  startTime: string;
  endTime: string;
  classroom?: string | null;
}

export interface PreviewOccurrence {
  businessDate: string;
  weekday: number;
  startTime: Date;
  endTime: Date;
  classroom: string | null;
}

const DAY = 24 * 60 * 60 * 1000;
const OFFSET = 8 * 60 * 60 * 1000;

function dateAtShanghaiMidnight(value: string): number {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('日期格式应为 YYYY-MM-DD');
  const time = Date.parse(`${value}T00:00:00+08:00`);
  if (!Number.isFinite(time) || new Date(time + OFFSET).toISOString().slice(0, 10) !== value) throw new Error('日期无效');
  return time;
}

function clockMinutes(value: string): number {
  if (typeof value !== 'string' || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) throw new Error('时间格式应为 HH:mm');
  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + minutes;
}

/** 验证及标准化常规规则；禁止一个班在同一天安排重叠时段。 */
export function normalizeWeeklyRules(input: WeeklyClassRule[]): WeeklyClassRule[] {
  if (!Array.isArray(input) || input.length === 0) throw new Error('请至少添加一条上课时间');
  const rules = input.map(rule => {
    if (!rule || !Number.isInteger(rule.weekday) || rule.weekday < 0 || rule.weekday > 6) throw new Error('请选择有效的上课星期');
    const start = clockMinutes(rule.startTime);
    const end = clockMinutes(rule.endTime);
    if (end <= start) throw new Error('结束时间须晚于开始时间，暂不支持跨日课程');
    if (rule.classroom != null && typeof rule.classroom !== 'string') throw new Error('上课地点无效');
    const classroom = rule.classroom?.trim() || null;
    return { weekday: rule.weekday, startTime: rule.startTime, endTime: rule.endTime, classroom };
  });
  rules.sort((a, b) => a.weekday - b.weekday || a.startTime.localeCompare(b.startTime));
  for (let i = 1; i < rules.length; i++) {
    if (rules[i].weekday === rules[i - 1].weekday && rules[i].startTime < rules[i - 1].endTime) {
      throw new Error('同一班级的常规上课时间不能重叠');
    }
  }
  return rules;
}

/** 生成预览；提交和冲突检查由调用方在数据库事务中完成。 */
export function previewWeeklyOccurrences(input: WeeklyClassRule[], startDate: string, endDate: string): PreviewOccurrence[] {
  const rules = normalizeWeeklyRules(input);
  const start = dateAtShanghaiMidnight(startDate);
  const end = dateAtShanghaiMidnight(endDate);
  if (end < start) throw new Error('结束日期不得早于开始日期');
  if ((end - start) / DAY > 366) throw new Error('排课日期跨度最多366天');
  const result: PreviewOccurrence[] = [];
  for (let day = start; day <= end; day += DAY) {
    const local = new Date(day + OFFSET);
    const weekday = local.getUTCDay();
    const businessDate = local.toISOString().slice(0, 10);
    for (const rule of rules) {
      if (rule.weekday !== weekday) continue;
      result.push({ businessDate, weekday, startTime: new Date(day + clockMinutes(rule.startTime) * 60000), endTime: new Date(day + clockMinutes(rule.endTime) * 60000), classroom: rule.classroom ?? null });
    }
  }
  if (!result.length) throw new Error('所选日期范围内没有符合规则的课程');
  return result;
}
