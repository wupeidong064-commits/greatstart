import type { AiIntent, BusinessTimeIntent } from './aiIntent';

export interface BusinessPeriod {
  start: string;
  end: string;
}
export interface BusinessCalendar {
  observation: BusinessPeriod;
  target?: BusinessPeriod;
  comparison?: BusinessPeriod;
  asOfDate: string;
  explicit: boolean;
  singleDayMention?: boolean;
  clarification?: string;
}
type Slot = keyof BusinessTimeIntent;
interface Mention {
  period: BusinessPeriod;
  text: string;
  start: number;
  end: number;
  slot?: Slot;
  joined?: boolean;
}
interface CalendarInput {
  question: string;
  today: string;
  intent?: AiIntent;
  previous?: Partial<BusinessCalendar> | null;
}

// Treat Shanghai date labels as calendar dates. No arithmetic uses the machine's local zone.
const DAY = 86400000;
const timestamp = (day: string) => Date.parse(day + 'T00:00:00Z');
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const shift = (day: string, n: number) => iso(timestamp(day) + n * DAY);
const monthRange = (y: number, m: number): BusinessPeriod => ({
  start: iso(Date.UTC(y, m - 1, 1)),
  end: iso(Date.UTC(y, m, 0)),
});
function realDay(y: number, m: number, d: number): string {
  if (y < 1000 || y > 9999 || m < 1 || m > 12 || d < 1 || d > 31)
    throw new Error('日期无效，请填写真实的年月日。');
  const day = iso(Date.UTC(y, m - 1, d));
  if (Number(day.slice(-2)) !== d) throw new Error('日期无效，请核对该月实际天数。');
  return day;
}
function clean(s: string) {
  const digits = '零一二三四五六七八九';
  return s
    .normalize('NFKC')
    .replace(/\s+/g, '')
    .replace(/[〇零一二两三四五六七八九十]+(?=个?月|天|日|号|年)/g, (raw) => {
      const n = raw.replace(/〇/g, '零').replace(/两/g, '二');
      if (!n.includes('十')) return [...n].map((v) => digits.indexOf(v)).join('');
      const [tens, ones] = n.split('十');
      return String((tens ? digits.indexOf(tens) : 1) * 10 + (ones ? digits.indexOf(ones) : 0));
    });
}
const DATE_WORD =
  /(?:(?:最近|过去|近)(?:半个?年|\d+个?月)|半个?年|(?:\d{4}年|去年|今年|明年)?\d+月(?:\d+[日号]?)?|\d{4}[-/.]\d+(?:[-/.]\d+)?|\d{1,2}[-.]\d{1,2}|\d+[/]\d+|(?:最近|过去|近|未来|接下来)\d+天|(?:上上|上|本|这|下下|下|这个)(?:个?月|周|星期)|上上一?周|(?:上上)?一周|昨天|昨日|今天|今日|明天|前天|后天|\d+[号日])/g;
const RANGE_LINK = /^(?:至|到|[-~～—–])$/;
const AMBIGUOUS = '请明确要查询的起止日期，或分别说明观察期、目标期和比较期。';
const point = (day: string) => ({ start: day, end: day });

function parseToken(raw: string, today: string, left?: BusinessPeriod): BusinessPeriod {
  const y = Number(today.slice(0, 4)),
    m = Number(today.slice(5, 7));
  if (/^(?:最近|近期)$/.test(raw)) return { start: shift(today, -29), end: today };
  const rollingMonths = raw.match(/^(?:(?:最近|过去|近)(?:半个?年|(\d+)个?月)|半个?年)$/);
  if (rollingMonths) {
    const count = rollingMonths[1] === undefined ? 6 : Number(rollingMonths[1]);
    if (!Number.isSafeInteger(count) || count < 1 || count > 120)
      throw new Error('请填写有效的时间跨度（月数）。');
    const boundary = monthRange(y, m - count);
    const days = Math.min(Number(today.slice(-2)), Number(boundary.end.slice(-2)));
    return { start: shift(boundary.start, days), end: today };
  }
  const md = raw.match(/^(\d{1,2})[-.](\d{1,2})$/);
  if (md) {
    // “11-01”式月-日：跟随左侧日期的年份（跨年校验在提取阶段完成）。
    const year = Number(left?.start.slice(0, 4) || y);
    return point(realDay(year, Number(md[1]), Number(md[2])));
  }
  const chinese = raw.match(/^(?:(\d{4})年|(去年|今年|明年))?(\d+)月(?:(\d+)[日号]?)?$/);
  const numeric = raw.match(/^(\d{4})[-/.](\d+)(?:[-/.](\d+))?$/);
  if (chinese || numeric) {
    const year = chinese
      ? Number(
          chinese[1] ||
            (chinese[2]
              ? y + ({ 去年: -1, 今年: 0, 明年: 1 }[chinese[2]] ?? 0)
              : left?.start.slice(0, 4) || y)
        )
      : Number(numeric![1]);
    const month = Number(chinese ? chinese[3] : numeric![2]),
      day = chinese ? chinese[4] : numeric![3];
    return day
      ? point(realDay(year, month, Number(day)))
      : monthRange(Number(realDay(year, month, 1).slice(0, 4)), month);
  }
  if (/^\d+[/]\d+$/.test(raw)) throw new Error('请用“几月几日”或 YYYY-MM-DD 明确日期。');
  if (/^\d+[日号]$/.test(raw)) {
    if (!left) throw new Error('请补充这一天所属的月份。');
    return point(
      realDay(Number(left.start.slice(0, 4)), Number(left.start.slice(5, 7)), parseInt(raw))
    );
  }
  const n = raw.match(/^(最近|过去|近|未来|接下来)(\d+)天$/);
  if (n) {
    const count = Number(n[2]);
    if (!Number.isSafeInteger(count) || count < 1 || count > 36600)
      throw new Error('请填写有效的时间跨度（天数）。');
    return /未来|接下来/.test(n[1])
      ? { start: today, end: shift(today, count - 1) }
      : { start: shift(today, 1 - count), end: today };
  }
  const offsets: Record<string, number> = {
    昨天: -1,
    昨日: -1,
    今天: 0,
    今日: 0,
    明天: 1,
    前天: -2,
    后天: 2,
  };
  if (raw in offsets) return point(shift(today, offsets[raw]));
  const offset = raw.startsWith('上上')
    ? -2
    : raw.startsWith('下下')
      ? 2
      : raw.startsWith('上')
        ? -1
        : raw.startsWith('下')
          ? 1
          : 0;
  if (raw.endsWith('月')) return monthRange(y, m + offset);
  const weekday = (new Date(timestamp(today)).getUTCDay() + 6) % 7;
  const start = shift(today, offset * 7 - weekday);
  return { start, end: shift(start, 6) };
}

function extract(q: string, today: string): Mention[] {
  const out: Mention[] = [];
  let lastEnd = 0;
  for (const match of q.matchAll(DATE_WORD)) {
    const start = match.index!,
      text = match[0],
      end = start + text.length;
    const prev = out[out.length - 1];
    const gap = q.slice(lastEnd, start);
    const join = prev && RANGE_LINK.test(gap);
    if (
      /\d{2,}年|(?:本|上|下|这)(?:个)?季度|(?:上|下)半年|月初|月底|月末|周末|周[一二三四五六日天]|星期[一二三四五六日天]|\d{1,4}[-/.]\d*$/.test(
        gap
      )
    )
      throw new Error(AMBIGUOUS);
    let left = join ? prev.period : undefined;
    if (/^半个?年$/.test(text) && /[上下这本]$/.test(gap))
      throw new Error(AMBIGUOUS);
    const monthOnlyYear = text.match(/^(\d+)月/);
    if (left && monthOnlyYear && Number(monthOnlyYear[1]) < Number(left.start.slice(5, 7))) {
      if (!/^(?:\d{4}(?:年|[-/.])|今年|去年|明年)/.test(prev.text))
        throw new Error('跨年查询请注明开始或结束年份。');
      left = monthRange(Number(left.start.slice(0, 4)) + 1, 1);
    }
    const mdYear = text.match(/^(\d{1,2})[-.]\d{1,2}$/);
    if (left && mdYear && Number(mdYear[1]) < Number(left.start.slice(5, 7)) && !/^\d{4}/.test(prev.text)) {
      if (/^(?:今年|去年|明年)/.test(prev.text) || /^\d{4}/.test(prev.text)) {
        left = monthRange(Number(left.start.slice(0, 4)) + 1, 1);
      } else {
        throw new Error('跨年查询请注明开始或结束年份。');
      }
    }
    const p = parseToken(text, today, left);
    if (join) {
      if (prev.period.start > p.end) throw new Error('开始日期不能晚于结束日期。');
      if (prev.joined) throw new Error(AMBIGUOUS);
      prev.joined = true;
      prev.period = { start: prev.period.start, end: p.end };
      prev.text = q.slice(prev.start, end);
      prev.end = end;
    } else out.push({ text, start, end, period: p });
    lastEnd = end;
  }
  for (const v of out) {
    const suffix = q.slice(v.end).match(/^(?:至今|到现在|以来)/)?.[0];
    if (!suffix) continue;
    if (v.joined || v.period.start > today) throw new Error(AMBIGUOUS);
    v.period = { start: v.period.start, end: today };
    v.joined = true;
    v.text += suffix;
    v.end += suffix.length;
  }
  const residual = [...out]
    .reverse()
    .reduce((s, v) => s.slice(0, v.start) + '#' + s.slice(v.end), q);
  if (
    /(?:\d{2,4}年|\d{1,4}[-/.]\d+|#(?:以前|之前|以后|之后|[-/.]\d|初|底|末|份?上旬|份?下旬|[一二三四五六日天])|(?:近|过去|最近|未来)\d+个?月|(?:上|下|本|这)季度|季度|上半年|下半年|月初|月末|月底|年初|年底|年末|近期|最近几天|前段时间|前一阵|前阵子|(?:今年|去年|明年)|周[一二三四五六日天]|星期[一二三四五六日天])/.test(
      residual
    )
  )
    throw new Error(AMBIGUOUS);
  return out;
}

function comparisonFor(p: BusinessPeriod, yearly: boolean): BusinessPeriod {
  const y = Number(p.start.slice(0, 4)),
    m = Number(p.start.slice(5, 7));
  if (yearly) {
    if (p.start.endsWith('-01') && p.end === monthRange(y, m).end) return monthRange(y - 1, m);
    const lastYear = (date: string) => {
      const prevYear = Number(date.slice(0, 4)) - 1,
        month = Number(date.slice(5, 7));
      return realDay(
        prevYear,
        month,
        Math.min(Number(date.slice(-2)), Number(monthRange(prevYear, month).end.slice(-2)))
      );
    };
    return { start: lastYear(p.start), end: lastYear(p.end) };
  }
  if (p.start.endsWith('-01') && p.end === monthRange(y, m).end) return monthRange(y, m - 1);
  const days = Math.round((timestamp(p.end) - timestamp(p.start)) / DAY) + 1;
  return { start: shift(p.start, -days), end: shift(p.end, -days) };
}

export function resolveBusinessCalendar({
  question,
  today,
  intent,
  previous,
}: CalendarInput): BusinessCalendar {
  const y = Number(today.slice(0, 4)),
    m = Number(today.slice(5, 7));
  const base: BusinessCalendar = {
    observation: monthRange(y, m),
    asOfDate: today,
    explicit: false,
  };
  const q = clean(question).replace(/(去年|上年|上一年)?同(一)?期/g, '同期');
  try {
    const mentions = extract(q, today);
    const retained = /沿用|刚才|上次|上条|同一|还是|按之前|继续|上述|这个结果|这些/.test(q);
    const goals =
      /目标|指标草案|规划|计划/.test(q) &&
      (!/(?:目标|计划).{0,4}(?:完成|达成|实现|回顾)/.test(q) ||
        /(?:制定|设定|拟定|规划).{0,20}目标/.test(q));
    const byTeacher = intent?.tools?.some((t) => t.name === 'teacher_performance_comparison');
    const compare =
      /环比|同比|同期|对比|相比|比较|比起|[与和跟].*比|比.*(?:高|低|多|少|增长|下降)/.test(q) ||
      intent?.purpose === 'comparison' || byTeacher ||
      mentions.some((v, i) => i > 0 && /^比$/.test(q.slice(mentions[i - 1].end, v.start)));
    const slots: Partial<Record<Slot, BusinessPeriod>> = {};
    for (const v of mentions) {
      const before = q.slice(0, v.start),
        after = q.slice(v.end);
      const hints = (Object.entries(intent?.timeIntent || {}) as [Slot, string][])
        .filter(([, h]) => clean(h) === v.text)
        .map(([key]) => key);
      if (/截至|截止/.test(before.slice(-4)) && !/^(?:到|至)/.test(after)) v.slot = 'asOf';
      else if (
        goals &&
        (/^(?:的)?(?:目标|计划|规划)/.test(after) ||
          /(?:目标期|执行期)(?:为|是)?$/.test(before) ||
          /^(?:下|未来|明年)/.test(v.text))
      )
        v.slot = 'target';
      else if (
        /^(?:相比|为基准|为基期|作为基准)/.test(after) &&
        /与|和|跟|同/.test(before.slice(-1))
      )
        v.slot = 'comparison';
      else if (/(?:相比于|相较于|较之|比起)$/.test(before)) v.slot = 'comparison';
      else if (compare && /(?:比|较)$/.test(before.slice(-2)) && !/^(?:本|这|下)/.test(v.text)) v.slot = 'comparison';
      else if (
        hints.length === 1 &&
        (hints[0] === 'observation' ||
          (hints[0] === 'target' && goals) ||
          (hints[0] === 'comparison' && compare) ||
          (hints[0] === 'asOf' && /截至|截止|观察到/.test(before)))
      )
        v.slot = hints[0];
    }
    const exact = mentions.find((v) => v.joined && (!v.slot || v.slot === 'observation'));
    for (const v of [...mentions].sort((a, b) => Number(!!b.slot) - Number(!!a.slot))) {
      // Parenthetic rolling labels do not override a user's exact from/to dates.
      if (
        exact &&
        !compare &&
        (!v.slot || v.slot === 'observation') &&
        /^(?:最近|过去|近)\d+天$/.test(v.text) &&
        !/还是|或者|或是/.test(q)
      )
        continue;
      const role =
        v.slot || (!slots.observation ? 'observation' : compare ? 'comparison' : 'observation');
      const previousPeriod = slots[role];
      if (previousPeriod) {
        if (previousPeriod.start === v.period.start && previousPeriod.end === v.period.end) continue;
        throw new Error(AMBIGUOUS);
      }
      slots[role] = v.period;
    }
    // A model may identify an unsupported expression, but cannot supply computed dates or invent an interval.
    for (const phrase of Object.values(intent?.timeIntent || {})) {
      if (
        phrase &&
        q.includes(clean(phrase)) &&
        !mentions.some((v) => clean(phrase).includes(v.text))
      ) {
        if (/^(?:最近|近期|近期内|最近)$/.test(clean(phrase))) continue; // 裸“最近/近期”按默认近30天窗口，不作模糊报错
        throw new Error(AMBIGUOUS);
      }
    }
    const isTeacherGoal =
      goals &&
      (slots.target || /老师|教练|教师|表现|绩效/.test(q) || intent?.subject === 'teacher');
    const weekly = intent?.tools?.some((t) => t.name === 'weekly_comparison');
    const low = intent?.tools?.find((t) => /^low_attendance_(students|classes)$/.test(t.name));
    const comparisonOnly = Boolean(slots.comparison && !slots.observation);
    const defaultPeriod = isTeacherGoal
      ? monthRange(y, m - 1)
      : (weekly || byTeacher) && !comparisonOnly
        ? parseToken('上周', today)
        : low && !comparisonOnly
          ? parseToken(low.name.endsWith('classes') ? '近14天' : '近30天', today)
          : base.observation;
    const inheritNoMention = mentions.length === 0 && previous?.explicit;
    base.explicit = mentions.length > 0 || Boolean(inheritNoMention);
    base.singleDayMention =
      mentions.length > 0 && mentions.every(v => !v.joined &&
        !/^(?:最近|过去|近|未来|接下来)/.test(v.text) &&
        v.period.start === v.period.end && v.period.start === mentions[0].period.start);
    const inheritTeacherPeriods = byTeacher && mentions.length === 0 && Boolean(previous?.comparison);
    base.observation = slots.observation || ((retained || inheritTeacherPeriods || (mentions.length === 0 && previous?.explicit)) && previous?.observation) || defaultPeriod;
    base.target = slots.target || (retained ? previous?.target : undefined);
    base.asOfDate = slots.asOf?.end || today;
    if (slots.asOf && !intent?.tools?.some((t) => t.name === 'new_student_attendance')) {
      const rolling = mentions.find(
        (v) => v.period === slots.observation && /^(最近|过去|近)(?:\d+天|\d+个?月|半个?年)$/.test(v.text)
      );
      if (rolling) base.observation = parseToken(rolling.text, base.asOfDate);
      else if (base.asOfDate < base.observation.start && slots.observation)
        throw new Error('截止日期早于观察期，请确认要查询的日期。');
      else if (!slots.observation)
        base.observation = { start: base.asOfDate.slice(0, 7) + '-01', end: base.asOfDate };
      else
        base.observation = {
          start: base.observation.start,
          end: base.observation.end < base.asOfDate ? base.observation.end : base.asOfDate,
        };
    }
    base.comparison =
      slots.comparison ||
      (inheritTeacherPeriods && previous?.comparison) ||
      (compare || weekly ? comparisonFor(base.observation, /同比|同期/.test(q)) : undefined);
    // Compare elapsed portions of named, still-open calendar periods. Explicit endpoints stay literal.
    const active = mentions.find((v) => v.period === slots.observation);
    if (
      base.comparison &&
      base.observation.start <= today &&
      base.observation.end > today &&
      active &&
      !active.joined &&
      /^(?:本|这|这个)(?:个?月|周|星期)$/.test(active.text)
    ) {
      const elapsedDays = Math.round((timestamp(today) - timestamp(base.observation.start)) / DAY);
      const equivalent = shift(base.comparison.start, elapsedDays);
      base.observation = { start: base.observation.start, end: today };
      base.comparison = {
        start: base.comparison.start,
        end: equivalent < base.comparison.end ? equivalent : base.comparison.end,
      };
    }
    return base;
  } catch (err) {
    return {
      ...base,
      explicit: true,
      clarification: err instanceof Error ? err.message : AMBIGUOUS,
    };
  }
}

/** Only an elliptical period change can inherit the former tools and their entity filters. */
export function isCalendarOnlyFollowup(question: string) {
  const q = clean(question).replace(/(去年|上年|上一年)?同(一)?期/g, '同期');
  const rest = q
    .replace(DATE_WORD, '#')
    .replace(
      /(?:麻烦|请|帮我|改用|改为|改成|换成|换到|换为|换个|看一下|再看看|再看|看看|只看|那|那么|按|从|和|对比|比较|环比|同比|相比|与|到|至|的|呢|吧|么|怎么样|如何|再导出|导出|做成|表格|Excel|Word|文件|[-~～—–,，。!！?？])/gi,
      ''
    );
  return /^#+$/.test(rest);
}
