import prisma from '../config/database';
import { BusinessPeriod, mentionedPeriods, resolveBusinessCalendar } from './aiBusinessCalendar';
import type { ChatMessage } from './aiService';
import type { Evidence, PlannedToolCall, ToolContext } from './aiTools';
import { renderTeacherRanking } from './aiTeacherRanking';
import { rankScopeFor } from './aiQueryBinding';
import { renderClassStandings } from './aiClassStandings';
import { percentageIn, quantity, scopeClarification } from './aiQueryRequirements';

const sources = [
  'students',
  'orders',
  'attendance',
  'lessons',
  'teachers',
  'lowStudents',
  'renewals',
  'balance',
  'refunds',
] as const;
type Source = (typeof sources)[number];
const operations = [
  'read',
  'minimum',
  'maximum',
  'spread',
  'difference',
  'growth',
  'sum',
  'list',
  'priority',
] as const;
type Op = (typeof operations)[number];
const metrics = ['attendance', 'sales', 'signup', 'consumption'] as const;
type Metric = (typeof metrics)[number];
const statuses = { lost: '流失', archived: '归档', refunded: '已退费', active: '在读' } as const;
const choices = ['auto', 'previousYear', 'yearComparison', 'recentPair', 'outerPair'] as const;
type Time = (typeof choices)[number];
type Cohort = { threshold?: number; inclusive?: boolean; maxRemaining?: number };
type Group = { id: string; name: string };
export interface DialogueQuery extends Cohort {
  source: Source;
  op: Op;
  periods: BusinessPeriod[];
  group?: Group;
  metric?: Metric;
  allStaff?: boolean;
  status?: keyof typeof statuses;
  names?: string[];
  numberOfPeople?: number;
  against?: 'minimum' | 'maximum';
}
type Command = Partial<Cohort> & {
  source: Source;
  op?: Op;
  time?: Time;
  base?: 'earlier' | 'later';
  against?: 'minimum' | 'maximum';
  inherit?: boolean;
  group?: string;
  campus?: string;
  metric?: Metric;
  status?: keyof typeof statuses;
  allStaff?: boolean;
  names?: string[];
  numberOfPeople?: number;
};
type Resolution =
  | { query: DialogueQuery; tools: PlannedToolCall[] }
  | { reply: string; retain?: DialogueQuery };
type PriorMessage = { role: string; status: string; usageJson: unknown; evidenceJson: unknown };
function legacyFrame(row: PriorMessage): DialogueQuery | undefined {
  if (!Array.isArray(row.evidenceJson)) return;
  const cards = (row.evidenceJson as Evidence[]).filter(
    (e) => !e.error && e.tool !== 'search_classes'
  );
  const card = cards[0];
  if (!card || cards.some((e) => e.tool !== card.tool)) return;
  const f = card.filters;
  const byTool: Record<string, Source> = {
    class_attendance: 'attendance',
    teacher_performance_ranking: 'teachers',
    signup_renewal: 'orders',
    low_attendance_students: 'lowStudents',
    renewal_candidates: 'renewals',
    search_students: 'balance',
  };
  const source =
    byTool[card.tool] ??
    (f.domain === 'schedules' ? 'lessons' : f.domain === 'students' ? 'students' : undefined);
  if (!source) return;
  const periods = unique(cards.flatMap((c) => (c.timeRange ? [c.timeRange] : [])));
  const saved = (row.usageJson as any)?.operatingAnswer;
  if (periods.length > 1 && !saved?.crossSum && saved?.calendar?.observation)
    periods.splice(0, periods.length, saved.calendar.observation);
  const groupName =
    card.rows.find((r) => r.id === f.classId)?.name ?? card.rows[0]?.className ?? f.className;
  const group =
    typeof f.classId === 'string'
      ? { id: f.classId, name: String(groupName ?? '指定班级') }
      : undefined;
  return {
    source,
    op:
      f.direction === 'min'
        ? 'minimum'
        : source === 'teachers'
          ? 'maximum'
          : saved?.crossSum
            ? 'sum'
            : 'read',
    periods,
    group,
    ...(source === 'teachers'
      ? { metric: metrics.find((m) => m === f.metric), allStaff: f.scope !== 'teachers' }
      : {}),
    ...(source === 'balance' && typeof f.keyword === 'string' ? { names: [f.keyword] } : {}),
    ...(typeof f.threshold === 'number'
      ? { threshold: f.threshold, inclusive: f.thresholdMode === 'lte' }
      : {}),
    ...(typeof f.maxRemaining === 'number' ? { maxRemaining: f.maxRemaining } : {}),
    ...(typeof f.status === 'string' && Object.prototype.hasOwnProperty.call(statuses, f.status)
      ? { status: f.status as keyof typeof statuses }
      : {}),
  };
}
export function dialogueHistory(messages: PriorMessage[]): DialogueQuery[] {
  const history: DialogueQuery[] = [];
  for (const row of messages) {
    if (row.role !== 'assistant') continue;
    const q =
      (row.usageJson as { operatingAnswer?: { dialogue?: DialogueQuery } } | null)?.operatingAnswer
        ?.dialogue ?? legacyFrame(row);
    if (
      row.status !== 'complete' ||
      !q ||
      !sources.includes(q.source) ||
      !Array.isArray(q.periods)
    ) {
      history.length = 0;
      continue;
    }
    history.push(q);
  }
  return history.slice(-8);
}

/** A change of scope alone keeps the previous measures and every selected period, including after refresh. */
export function scopeOnlyEdit(question: string, history: DialogueQuery[]): string | undefined {
  const last = history[history.length - 1];
  if (
    last?.source === 'attendance' &&
    /并列.{0,4}(?:第一|最高)/.test(question) &&
    !/(?:这个班|该班|也在|是否在|其中的)/.test(question)
  )
    return JSON.stringify({ source: 'attendance', op: 'maximum', group: '*', inherit: true });
  if (!last || !['attendance', 'lessons', 'lowStudents'].includes(last.source)) return;
  const broad = /全(?:校区|机构|校)|整(?:个|所)(?:学校|校区|机构)|所有班级/;
  if (!broad.test(question)) return;
  const rest = question
    .replace(broad, '')
    .replace(
      /日期|时间|期间|那几天|这几天|这两周|这两段|范围|照旧|沿用|同样|改为|换成|放到|扩大到|如果|再|那么|那就|那么|只|就|算|看|呢|吧|那|的|按|[,，。?!？！\s]/g,
      ''
    );
  return rest
    ? undefined
    : JSON.stringify({ source: last.source, op: last.op, group: '*', inherit: true });
}
const instructions = [
  '把本轮明确的只读业务分析译为 JSON 查询，不回答、不计算金额、不生成日期或ID。无法完整表达的需求返回 {}，交还完整工作台。只允许 source,op,time,base,against,inherit,group,campus,metric,status,allStaff,names,numberOfPeople,threshold,inclusive,maxRemaining。不输出 periods 字段；日期由服务器从原话识别。不要输出 null 或示例中的未用字段。source 一定放在根对象中。历史仅为参考。无先行对象的指代返回 {"clarify":true}。',
  'source 只能是 students(当前学员生命周期名单，不含个人余额、账务明细)、orders(全机构已确认新签加续费的合计笔数和总成交额)、attendance(已完成班级/机构到课实际与应到)、lessons(已完成课次与当堂授课老师)、teachers(个人业绩排名或个人某指标及差额)、lowStudents(低出勤在读名单，可与剩余课时求交集)、renewals(在读可续费名单)。balance(点名学生的当前/指定日期剩余课时，names数组)、refunds(已确认退费，点名用names；询问有没有历史退费不限定月份)。其余业务如待审批退费、指定新签或续费拆分、净额、实收、未来排课、出勤下降及原因、建议解释、目标考核、体验、报告文件均返回 {}。复杂要求只能做其中一半也返回 {}。',
  'op: read,list,priority(名单按紧迫度),minimum,maximum,spread(老师最高与最低或指定老师的差额),difference,growth,sum。比较两个时段用difference/growth，比较个人用spread。一般成交读数用read。多周出勤按加权汇总可sum。追问让选择或先确认时返回 {}。纯粹确定/选编号交给待确认流程。',
  'inherit:true 表示延续上一个查询、省略对象、只换期间/指标/范围；换话题则false。只填需要改变的条件。source 必须明确。group 指本轮原文中的完整班名或简称；指代旧班省略；明确放大到全校用group:"*"。campus 仅当明确点名一个机构或校区时填原文名字。不得把学员/班名当校区。',
  'time: auto(显式日期由日历计算；无日期且继承则保持原期间), previousYear(挪到上年同期), yearComparison(本期比上年同期), recentPair(最近两个不同期间作差或合计), outerPair(最先和最后查的期间)。历史里的同一范围只算一次。从过去基期涨到新的显式期间也用recentPair。没有请求比较就不要添加前期。差额/增幅以较早为基期则 base:earlier；明确用较晚为基期或问较早减较晚则 base:later。点名老师对比最低或最高时 against:minimum/maximum。',
  'teachers 的 metric: sales(个人成交)、attendance(出勤率)、consumption(课消金额)、signup(个人新招人数)。明确纳入顾问 allStaff:true，明确只比授课老师 false。只给出本轮明确提到的老师或学生姓名 names 数组，从原文逐字摘取，操作词不能作为名字。students 的 status 用 active/lost/archived/refunded；不要用空名单代替不支持状态。lowStudents 的 threshold 出勤百分数、inclusive 是否含阈值；maxRemaining 是包含边界的剩余节数，严格小于整节数换算为上一个整数。priority 的 numberOfPeople 是要求选几人。仅在本轮明确给出时填数值，不猜人名或阈值。',
].join('\n');

export function dialogueMessages(
  question: string,
  history: DialogueQuery[],
  priorQuestions: string[]
): ChatMessage[] {
  const context = history.map(({ group, ...rest }) => ({ ...rest, group: group?.name }));
  return [
    { role: 'system', content: instructions },
    {
      role: 'user',
      content: JSON.stringify({
        priorQuestions: priorQuestions.slice(-4).map((q) => q.slice(0, 250)),
        priorQueries: context,
        question,
      }),
    },
  ];
}
function decoded(text: string): Command | { clarify: true } | undefined {
  let x: any;
  try {
    x = JSON.parse(text.trim().replace(/^```(?:json)?\s*|\s*```$/g, ''));
  } catch {
    return;
  }
  if (!x || typeof x !== 'object' || Array.isArray(x)) return;
  // Date literals and prior output-only fields are never trusted; derive them from the user's text.
  for (const k of ['periods', 'startDate', 'endDate', 'dateRange', 'period', 'dates']) delete x[k];
  for (const k of Object.keys(x)) if (x[k] === null) delete x[k];
  if (
    typeof x.time === 'string' &&
    /^\d{4}-\d{2}-\d{2}(?:[~,， 至]+\d{4}-\d{2}-\d{2})?$/.test(x.time)
  )
    x.time = 'auto';
  if (
    x.time &&
    typeof x.time === 'object' &&
    !Array.isArray(x.time) &&
    Object.keys(x.time).every((k) => ['start', 'end', 'startDate', 'endDate'].includes(k))
  ) {
    x.time = 'auto';
  }
  // The attendance tool always returns numerator, denominator and rate as one measurement.
  if (
    x.source === 'attendance' &&
    ['expected', 'actual', 'present', 'attendanceRate', 'expectedCount', 'actualCount'].includes(
      x.metric
    )
  )
    delete x.metric;
  if (x.time === 'inherit' || x.time === 'same') {
    x.time = 'auto';
    x.inherit = true;
  }
  if (x.clarify === true) return { clarify: true };
  if (!sources.includes(x.source)) return;
  const keys = [
    'source',
    'op',
    'time',
    'inherit',
    'group',
    'campus',
    'metric',
    'status',
    'allStaff',
    'names',
    'numberOfPeople',
    'threshold',
    'inclusive',
    'maxRemaining',
    'base',
    'against',
  ];
  if (
    (x.base !== undefined && !['earlier', 'later'].includes(x.base)) ||
    (x.against !== undefined && !['minimum', 'maximum'].includes(x.against))
  )
    return;
  if (Object.keys(x).some((k) => !keys.includes(k))) return;
  if (
    (x.op !== undefined && !operations.includes(x.op)) ||
    (x.time !== undefined && !choices.includes(x.time)) ||
    (x.metric !== undefined && !metrics.includes(x.metric))
  )
    return;
  if (x.status !== undefined && !Object.prototype.hasOwnProperty.call(statuses, x.status)) return;
  if (
    ['inherit', 'allStaff', 'inclusive'].some(
      (k) => x[k] !== undefined && typeof x[k] !== 'boolean'
    )
  )
    return;
  if (
    ['group', 'campus'].some(
      (k) => x[k] !== undefined && (typeof x[k] !== 'string' || !x[k].length || x[k].length > 80)
    )
  )
    return;
  if (
    x.names !== undefined &&
    (!Array.isArray(x.names) ||
      x.names.length > 8 ||
      !x.names.every((n: unknown) => typeof n === 'string' && n.length > 0 && n.length <= 50))
  )
    return;
  for (const [k, max] of [
    ['threshold', 100],
    ['maxRemaining', 50],
    ['numberOfPeople', 20],
  ] as const)
    if (
      x[k] !== undefined &&
      (!Number.isFinite(x[k]) ||
        x[k] < 0 ||
        x[k] > max ||
        (k !== 'threshold' && !Number.isInteger(x[k])))
    )
      return;
  return x;
}
const same = (a: BusinessPeriod, b: BusinessPeriod) => a.start === b.start && a.end === b.end;
function unique(periods: BusinessPeriod[]) {
  return periods.filter((p, i) => !periods.slice(0, i).some((other) => same(p, other)));
}
function yearBefore(p: BusinessPeriod) {
  const back = (day: string) => {
    const [y, m, d] = day.split('-').map(Number);
    return new Date(
      Date.UTC(y - 1, m - 1, Math.min(d, new Date(Date.UTC(y - 1, m, 0)).getUTCDate()))
    )
      .toISOString()
      .slice(0, 10);
  };
  return { start: back(p.start), end: back(p.end) };
}
const classSource = (s: Source) => ['attendance', 'lessons', 'lowStudents'].includes(s);
const labels: Record<Metric, string> = {
  sales: '个人成单额',
  attendance: '出勤率',
  consumption: '实际课消金额',
  signup: '个人新招人数',
};
const unit = (metric: Metric) =>
  metric === 'attendance' ? '个百分点' : metric === 'signup' ? '人' : '元';
function periodsFor(
  c: Command,
  question: string,
  today: string,
  hist: DialogueQuery[],
  previous?: DialogueQuery
) {
  const paired = c.time === 'recentPair' || c.time === 'outerPair' || c.time === 'yearComparison';
  // Relative year selectors refer to a recorded window. Keep explicit calendar dates for the common parser.
  const dateText = question.replace(/(今年|去年|明年)(?!\s*[零一二两三四五六七八九十\d]+月)/g, '');
  const explicit = mentionedPeriods(dateText.replace(/这半年/g, '最近半年'), today);
  if (
    c.op === 'priority' &&
    previous?.periods.length &&
    explicit.every((p) => p.start === today && p.end === today)
  )
    return previous.periods;
  if (
    explicit.length === 1 &&
    !['difference', 'growth', 'sum'].includes(c.op ?? 'read') &&
    !['previousYear', 'yearComparison'].includes(c.time ?? 'auto')
  )
    return explicit;
  const active = explicit.length ? explicit : previous?.periods?.length ? previous.periods : [];
  const recent = unique([
    ...hist.filter((q) => q.source === c.source).flatMap((q) => q.periods),
    ...explicit,
  ]);
  const last = active[active.length - 1] || recent[recent.length - 1];
  if (c.time === 'previousYear' && last) return [yearBefore(last)];
  if (c.time === 'yearComparison' && last) {
    // A previous turn may already have moved from the current period to last year.
    const later =
      recent.length >= 2 && same(yearBefore(recent[recent.length - 2]), last)
        ? recent[recent.length - 2]
        : last;
    return [yearBefore(later), later];
  }
  if (paired && recent.length >= 2) {
    const pair =
      explicit.length === 2
        ? explicit
        : c.time === 'outerPair'
          ? [recent[0], recent[recent.length - 1]]
          : recent.slice(-2);
    if (c.op === 'difference' || c.op === 'growth')
      pair.sort((a, b) =>
        c.base === 'later' ? b.start.localeCompare(a.start) : a.start.localeCompare(b.start)
      );
    return pair;
  }
  if (paired || c.time === 'previousYear')
    throw Error('需要两个可区分的统计期间，请说明基期和本期。');
  if (active.length) return unique(active);
  if (c.source === 'lowStudents')
    return [
      {
        start: new Date(Date.parse(today + 'T00:00:00Z') - 29 * 86400000)
          .toISOString()
          .slice(0, 10),
        end: today,
      },
    ];
  return [resolveBusinessCalendar({ question: dateText, today }).observation];
}

const compatible: Record<Source, Op[]> = {
  students: ['read', 'list'],
  orders: ['read', 'sum', 'difference', 'growth'],
  attendance: ['read', 'sum', 'maximum', 'list'],
  lessons: ['read', 'list'],
  teachers: ['read', 'maximum', 'minimum', 'spread'],
  lowStudents: ['read', 'list', 'priority'],
  renewals: ['read', 'list', 'priority'],
  balance: ['read', 'list'],
  refunds: ['read', 'list'],
};
// A numeric predicate narrows an existing cohort; it is independent of the model's choice of row order.
function balanceCap(text: string) {
  const match = text.match(
    /(?:至多|最多|不超(?:过)?|小于等于|不高于|不多于|≤|少于|不到|低于|小于)\s*([零一二两三四五六七八九十百\d]+)\s*(?:个?课时|节|次课)|([零一二两三四五六七八九十百\d]+)\s*(?:个?课时|节)(?:课)?(?:或更少|及以下|以内|以下)/
  );
  if (!match) return;
  const n = quantity(match[1] ?? match[2]);
  return n - (/^(?:少于|不到|低于|小于(?!等于))/.test(match[0]) ? 1 : 0);
}
function contextualCommand(
  input: ReturnType<typeof decoded>,
  question: string,
  last?: DialogueQuery
): ReturnType<typeof decoded> {
  const c = input && 'source' in input ? { ...input } : undefined;
  const p = balanceCap(question);
  const narrowing =
    last?.source === 'lowStudents' &&
    p !== undefined &&
    !/换个问题|全部在读|全校所有/.test(question);
  if (narrowing)
    return {
      ...c,
      source: 'lowStudents',
      op: 'list',
      inherit: true,
      maxRemaining: p,
      numberOfPeople: undefined,
    };
  if (c?.source === 'lowStudents') {
    const rate = percentageIn(question)[0];
    c.threshold = rate ?? last?.threshold;
    if (rate !== undefined) c.inclusive = /不高于|不超过|及以下|≤/.test(question);
    c.maxRemaining = p ?? (last?.source === 'lowStudents' ? last.maxRemaining : undefined);
    if (c.op === 'priority' && !/优先|先[打联看]|最急|先找/.test(question))
      c.op = /名单|列|哪些|有谁/.test(question) ? 'list' : 'read';
  }
  if (c?.source === 'students' && c.status) {
    const name = statuses[c.status];
    if (c.op === 'minimum' || c.op === 'maximum') return;
    if (
      !question.includes(name.replace('已', '')) &&
      last?.status !== c.status &&
      c.status !== 'active'
    )
      return;
  }
  if (
    c?.source === 'attendance' &&
    /各班|班级|哪些班/.test(question) &&
    /排名|排行|排序/.test(question) &&
    !/第一|最高/.test(question)
  )
    c.op = 'list';
  if (
    last?.source === 'balance' &&
    last.names?.length === 1 &&
    /他|她|刚才那位/.test(question) &&
    /几节|多少节|余额/.test(question) &&
    !/换个人|另外/.test(question)
  )
    return { ...c, source: 'balance', op: 'read', inherit: true, names: last.names };
  if (
    c?.source === 'orders' &&
    c.op === 'difference' &&
    /增长|增幅|增长率|百分之几|百分数/.test(question) &&
    !/不[要用算].{0,5}百分/.test(question)
  )
    c.op = 'growth';
  if (
    last?.source === 'balance' &&
    /^(?:那|那么|换成|改看)?(?:现在|如今|当前|此刻|今天)(?:呢|的余额|还有几节)?[？?。！\s]*$/.test(
      question
    )
  )
    return { source: 'balance', op: 'read', inherit: true, names: last.names };
  if (c?.source === 'teachers') {
    if (c.time === 'recentPair' || c.time === 'outerPair') c.time = 'auto';
    if (
      c.op === 'difference' &&
      (c.names?.length || c.against || /最高|最低|第一|排末/.test(question))
    )
      c.op = 'spread';
    if (
      !/出勤|到课|签到|课消|核销|成交|成单|销售|新招|新签/.test(question) &&
      last?.source === 'teachers'
    )
      c.metric = last.metric;
    if (!/顾问|销售岗|全员|所有人|全体员工/.test(question) && last?.source !== 'teachers')
      c.allStaff = false;
  }
  if (
    last?.source === 'orders' &&
    /合计|合起来|总和|加起来|加在一起/.test(question) &&
    /第一|最先|最早|首/.test(question) &&
    /最晚|最后|末/.test(question)
  )
    return { source: 'orders', op: 'sum', time: 'outerPair', inherit: true };
  return c ?? input;
}
export async function bindDialogue(
  raw: string,
  question: string,
  hist: DialogueQuery[],
  ctx: ToolContext,
  campusName: string
): Promise<Resolution | undefined> {
  const lastFrame = hist[hist.length - 1];
  let c = contextualCommand(decoded(raw), question, lastFrame);
  // Requests about eligibility keep the cohort's filters when naming individuals.
  const membership =
    lastFrame?.source === 'renewals' && /条件|符合|续费|催续|不续|同一份|名单/.test(question);
  const confirmedRefund =
    /退[费款]|退款/.test(question) &&
    /已确认|已通过|已批|办妥|实际退|退过|已退|已完成/.test(question) &&
    !/未确认|待审|申请中|尚未|还没/.test(question);
  if ((membership || confirmedRefund) && ctx.campusId) {
    const denied = scopeClarification(
      question,
      campusName,
      c && 'campus' in c ? c.campus : undefined
    );
    if (denied) return { reply: denied };
    const people = await prisma.$queryRaw<
      Array<{ name: string }>
    >`SELECT DISTINCT name FROM students WHERE "organizationId"=${ctx.organizationId} AND "campusId"=${ctx.campusId} AND length(name)>1 AND strpos(${question},name)>0 ORDER BY name LIMIT 5`;
    if (people.length && confirmedRefund)
      c = {
        source: 'refunds',
        op: 'read',
        inherit: lastFrame?.source === 'refunds',
        names: people.map((p) => p.name),
      };
    else if (people.length && membership)
      c = {
        source: 'renewals',
        op: 'read',
        inherit: true,
        names: people.map((p) => p.name),
        maxRemaining: balanceCap(question) ?? lastFrame.maxRemaining,
      };
  }
  if (!c) return;
  if ('clarify' in c) return { reply: '你想问哪位老师、哪个班或哪位学员？也请说明想比较的指标。' };
  const denied = scopeClarification(question, campusName, c.campus);
  if (denied) return { reply: denied };
  if (!ctx.campusId) return;
  const last = hist[hist.length - 1];
  const continuation =
    /同一|同样|刚才|这(?:些|批|几天|段|周|半年)|照旧|沿用|改[为成看]|换[成到看]|还是|排在末|换个指标|那[一位班]|把.*改为/.test(
      question
    );
  const previous =
    c.inherit || continuation || (c.inherit !== false && last?.source === c.source)
      ? last
      : undefined;
  const prior = previous?.source === c.source ? previous : undefined;
  let op = c.op || (prior && compatible[c.source].includes(prior.op) ? prior.op : 'read');
  if (c.source === 'lowStudents' && /名单|哪些|有谁|姓名|逐个/.test(question) && op !== 'priority')
    op = 'list';
  else if (
    c.source === 'lowStudents' &&
    /多少|几位|几人/.test(question) &&
    !/[挑选联]系|优先/.test(question) &&
    !c.maxRemaining
  )
    op = 'read';
  if (!compatible[c.source].includes(op)) return;
  if (c.names?.some((n) => !question.includes(n) && !prior?.names?.includes(n)))
    return { reply: '请提供要分别核对的人员姓名。' };
  if (
    previous === undefined &&
    !last &&
    /^(?:那位|那他|他呢|她呢)|(?:告诉我|看看)那位/.test(question)
  )
    return { reply: '请说明要比较的人员和指标。' };
  const query: DialogueQuery = { source: c.source, op, periods: [] };
  let explicitDates: BusinessPeriod[];
  try {
    const snapshot = c.source === 'students' || c.source === 'renewals';
    if (
      snapshot &&
      mentionedPeriods(question, ctx.today).some(
        (p) => p.start !== ctx.today || p.end !== ctx.today
      )
    )
      return { reply: '这份学员名单是当前状态快照，无法据此还原该历史期间的名单。' };
    explicitDates = snapshot ? [] : periodsFor(c, question, ctx.today, hist, previous);
  } catch (e) {
    return { reply: e instanceof Error ? e.message : '请确认统计期间。' };
  }
  query.periods = explicitDates;
  if (c.source === 'orders' && ['difference', 'growth'].includes(op) && query.periods.length !== 2)
    return { reply: '请指定比较的基期与本期。' };
  if (query.periods.length > 2) return { reply: '请指定要合并或比较的两个期间。' };
  if (c.group && c.group !== '*' && !question.includes(c.group)) {
    if (previous?.group?.name === c.group) delete c.group;
    else return { reply: '请提供要查询的班级名称或班级代码。' };
  }
  if (c.group && c.group !== '*' && !classSource(c.source))
    return { reply: '这个指标尚无可按指定班级核对的统计口径。' };
  if (classSource(c.source)) {
    const foundByText = await prisma.$queryRaw<
      Group[]
    >`SELECT id,name FROM classes WHERE "organizationId"=${ctx.organizationId} AND "campusId"=${ctx.campusId} AND status<>'deleted' AND ((length(name)>1 AND strpos(${question},name)>0) OR (length(code)>1 AND strpos(${question},code)>0)) ORDER BY length(name) DESC,id LIMIT 3`;
    if (foundByText.length > 1) return { reply: '请指定一个班级再核对，或分别查询这些班。' };
    if (foundByText.length === 1) query.group = foundByText[0];
    else if (c.group && c.group !== '*') {
      const base = {
        organizationId: ctx.organizationId,
        campusId: ctx.campusId,
        status: { not: 'deleted' },
      };
      const exact = await prisma.class.findMany({
        where: { ...base, OR: [{ name: c.group }, { code: c.group }] },
        select: { id: true, name: true },
        take: 2,
      });
      const found = exact.length
        ? exact
        : await prisma.class.findMany({
            where: { ...base, name: { contains: c.group } },
            select: { id: true, name: true },
            take: 5,
          });
      if (found.length !== 1)
        return {
          reply: found.length
            ? '匹配到多个班，请用完整班名或代码指定：' + found.map((f) => f.name).join('、')
            : '当前机构没有匹配的班级，请核对班名或代码。',
        };
      query.group = found[0];
    } else if (c.group !== '*' && previous && classSource(previous.source))
      query.group = previous.group;
  }
  if (!previous && /^(?:同一|同样|照旧|还是那个)/.test(question) && !hist.length && !c.group)
    return { reply: '请先指定沿用的对象或统计期间。' };
  if (c.source === 'students') {
    query.status = c.status ?? prior?.status;
    if (!query.status) return;
  }
  if (c.source === 'balance') {
    query.names = c.names?.length ? c.names : prior?.names;
    if (!query.names?.length) return { reply: '请提供要核对课时余额的学员姓名。' };
    if (query.names.length > 4) return { reply: '请每次指定最多四位学员核对余额。' };
    let dates: BusinessPeriod[];
    try {
      dates = mentionedPeriods(question, ctx.today);
    } catch {
      return { reply: '请给出余额的具体日期。' };
    }
    if (dates.length > 1 || dates.some((p) => p.start !== p.end))
      return { reply: '余额需要一个具体日期，请指定要核对哪一天。' };
    if (dates.some((p) => p.end > ctx.today))
      return { reply: '指定日期在未来，余额无法核实。', retain: { ...query, periods: [] } };
    query.periods = dates;
    return {
      query,
      tools: query.names.map((keyword) => ({
        name: 'search_students',
        params: { keyword, ...(dates.length ? { balanceAsOfDate: dates[0].end } : {}) },
      })),
    };
  }
  if (c.source === 'teachers') {
    query.against = c.against;
    query.metric = c.metric ?? prior?.metric ?? 'attendance';
    const scope = rankScopeFor(question);
    query.allStaff = scope === 'all' || (scope !== 'teachers' && (prior?.allStaff ?? false));
  }
  const names = c.names?.length ? c.names : prior?.names;
  if (names?.length) query.names = names;
  if (c.source === 'lowStudents' || c.source === 'renewals') {
    query.threshold = c.threshold ?? prior?.threshold;
    query.inclusive = c.inclusive ?? prior?.inclusive;
    query.maxRemaining = c.maxRemaining ?? prior?.maxRemaining;
    const pick = question.match(
      /([一二两三四五六七八九十\d]+)\s*(?:位|人|个(?:学生|学员|人)?|通(?:电话)?)/
    );
    query.numberOfPeople = pick ? Math.min(100, quantity(pick[1])) : undefined;
    if (
      query.maxRemaining != null &&
      (!Number.isInteger(query.maxRemaining) || query.maxRemaining < 0 || query.maxRemaining > 50)
    )
      return { reply: '请用 0 至 50 的整数指定可核对的余课上限。' };
  }
  const params: Record<string, unknown> = query.group ? { classId: query.group.id } : {};
  if (c.source === 'refunds') {
    const dates = mentionedPeriods(question, ctx.today);
    if (!dates.length && c.names?.length && !previous) query.periods = [];
    if (
      !dates.length &&
      query.names?.length &&
      (previous?.source !== 'refunds' || !previous.periods.length)
    )
      query.periods = [];
    const date = query.periods[0];
    if (query.periods.length > 1 || (!date && !query.names?.length))
      return { reply: '请指定核对已确认退费的学员或期间。' };
    const people = query.names?.length ? query.names : [undefined];
    if (people.length > 4) return { reply: '请每次指定最多四位学员。' };
    return {
      query,
      tools: people.map((keyword) => ({
        name: 'business_records',
        params: {
          domain: 'refunds',
          status: 'approved',
          ...(keyword ? { keyword } : {}),
          ...(date ? { startDate: date.start, endDate: date.end } : { view: 'history' }),
        },
      })),
    };
  }
  if (c.source === 'renewals' && query.names?.length) {
    if (query.names.length > 4) return { reply: '请每次指定最多四位学员。' };
    return {
      query,
      tools: query.names.map((keyword) => ({
        name: 'business_records',
        params: { domain: 'students', keyword },
      })),
    };
  }
  let name: string;
  switch (c.source) {
    case 'students':
      name = 'business_records';
      Object.assign(params, { domain: 'students', status: query.status });
      break;
    case 'orders':
      name = 'signup_renewal';
      break;
    case 'attendance':
      name = 'class_attendance';
      break;
    case 'lessons':
      name = 'business_records';
      Object.assign(params, { domain: 'schedules', status: 'completed' });
      break;
    case 'teachers':
      name = 'teacher_performance_ranking';
      Object.assign(
        params,
        { metric: query.metric, direction: op === 'minimum' ? 'min' : 'max' },
        !query.allStaff && { scope: 'teachers' }
      );
      break;
    case 'lowStudents':
      name = 'low_attendance_students';
      if (query.threshold != null) params.threshold = query.threshold;
      if (query.inclusive) params.thresholdMode = 'lte';
      if (query.maxRemaining != null) params.maxRemaining = query.maxRemaining;
      break;
    case 'renewals':
      name = 'renewal_candidates';
      if (query.maxRemaining != null) params.maxRemaining = query.maxRemaining;
      break;
  }
  const dated = query.periods.length
    ? query.periods.map((p) => ({ startDate: p.start, endDate: p.end }))
    : [{}];
  if (dated.length > 1 && !['orders', 'attendance'].includes(c.source)) return;
  return { query, tools: dated.map((date) => ({ name, params: { ...params, ...date } })) };
}

const format = (n: number) =>
  Number(n.toFixed(2)).toLocaleString('zh-CN', { maximumFractionDigits: 2 });
const periodLabel = (p: BusinessPeriod) => p.start + ' 至 ' + p.end;
function numeric(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw Error('没有可核实的数值');
  return value;
}
function roster(q: DialogueQuery, card: Evidence): string {
  const person = (r: Record<string, unknown>) => String(r.姓名 ?? r.name);
  const balance = (r: Record<string, unknown>) => numeric(r.剩余课时 ?? r.remainingLessons);
  const matching = card.rows.filter((r) => !q.names || q.names.includes(person(r)));
  const sorted =
    q.op === 'priority'
      ? [...matching].sort(
          (a, b) => Number(a.出勤率 ?? 100) - Number(b.出勤率 ?? 100) || balance(a) - balance(b)
        )
      : matching;
  const people = new Map<string, Record<string, unknown>>();
  for (const r of sorted) {
    const k = String(r.studentId ?? r.id);
    if (!people.has(k)) people.set(k, r);
  }
  const list = [...people.values()];
  const truncated = card.missing.some((m) => /截断|可能不全|仅显示/.test(m));
  const count = (truncated ? '已核实至少 ' : '') + list.length + ' 人';
  const heading =
    q.source === 'students'
      ? statuses[q.status!] + '学员'
      : q.source === 'renewals'
        ? '可提醒续费的在读学员'
        : '低出勤在读学员';
  const filters =
    q.source === 'lowStudents'
      ? '（出勤率' +
        (q.inclusive ? '≤' : '＜') +
        (q.threshold ?? 60) +
        '%' +
        (q.maxRemaining == null ? '' : '，余额≤' + q.maxRemaining + '节') +
        '）'
      : '';
  const n =
    q.op === 'read' && !q.names && q.source === 'lowStudents'
      ? 0
      : Math.min(q.numberOfPeople ?? 100, 100);
  const shown = list
    .slice(0, n)
    .map(
      (r) =>
        person(r) +
        (q.source === 'students'
          ? ''
          : '（' +
            (q.source === 'lowStudents' ? '出勤 ' + r.实到 + '／' + r.应到 + '，' : '') +
            '剩 ' +
            balance(r) +
            ' 节）')
    );
  const missing = q.names?.filter((name) => !list.some((r) => person(r) === name));
  return (
    heading +
    filters +
    '共' +
    count +
    '。' +
    (shown.length ? shown.join('、') + '。' : '') +
    (q.op === 'priority' && shown.length ? '优先考虑出勤较低、余课较少的学员。' : '') +
    (missing?.length
      ? '在该条件的' + (truncated ? '已核实名单中未见' : '名单中未见') + missing.join('、') + '。'
      : '') +
    (n && list.length > n && q.op !== 'priority' ? '以上列出前 ' + n + ' 人。' : '') +
    (truncated ? '名单覆盖不完整。' : '')
  );
}
function ranking(q: DialogueQuery, c: Evidence) {
  if (!c.rows.length) return '该期间没有足够的记录可供排名。';
  const metric = q.metric!,
    key = labels[metric],
    label = metric === 'attendance' ? '%' : unit(metric);
  const first = c.rows[0],
    last = c.rows[c.rows.length - 1];
  if (q.names?.length || q.op === 'spread') {
    const matched = q.names?.flatMap((n) => c.rows.filter((r) => r.老师 === n)) ?? [];
    if (q.names && matched.length !== q.names.length)
      return '所选范围未能唯一匹配这些老师，请核对姓名。';
    const pair =
      q.op === 'spread'
        ? matched.length === 2
          ? matched
          : [matched.length && q.against === 'minimum' ? last : first, matched[0] ?? last]
        : matched;
    const details = pair.map((r) => r.老师 + ' ' + format(numeric(r[key])) + label);
    const result =
      details.join('，') +
      (q.op === 'spread'
        ? '，相差 ' +
          format(Math.abs(numeric(pair[0][key]) - numeric(pair[1][key]))) +
          ' ' +
          unit(metric)
        : '');
    return key + '：' + result + '。';
  }
  return renderTeacherRanking(c);
}
export function renderDialogue(q: DialogueQuery, cards: Evidence[]): string {
  if (
    cards.length !==
      (['balance', 'renewals', 'refunds'].includes(q.source) && q.names?.length
        ? q.names.length
        : Math.max(q.periods.length, 1)) ||
    cards.some((c) => c.error)
  )
    return '本次未取得完整记录，无法确认结果。请稍后重新查询。';
  const prefix =
    q.periods.map(periodLabel).join('、') +
    (q.periods.length ? '，' : '') +
    (q.group ? q.group.name + '，' : '');
  try {
    const card = cards[0];
    if (q.source === 'refunds')
      return (
        prefix +
        cards
          .map((e, i) => {
            const who = q.names?.[i],
              rows = who ? e.rows.filter((r) => r.studentName === who) : e.rows;
            if (who && new Set(rows.map((r) => r.studentId)).size > 1)
              return who + '有同名学员，请先确认档案。';
            return (
              (who ?? '本机构') +
              '已确认退费 ' +
              rows.length +
              ' 笔，共 ' +
              format(rows.reduce((sum, r) => sum + numeric(r.amountToRefund), 0)) +
              ' 元。'
            );
          })
          .join(' ')
      );
    if (q.source === 'renewals' && q.names?.length)
      return cards
        .map((card, i) => {
          const name = q.names![i],
            rows = card.rows.filter((r) => r.name === name);
          if (rows.length !== 1) return name + '未能唯一匹配学员档案。';
          const r = rows[0],
            bal = numeric(r.remainingLessons),
            ok =
              r.status === 'active' &&
              r.renewalStatus !== 'no_renewal' &&
              bal <= (q.maxRemaining ?? 3);
          return (
            name +
            '剩 ' +
            bal +
            ' 节，' +
            (ok ? '符合' : '不符合') +
            '续费提醒条件。' +
            (r.renewalStatus === 'no_renewal' ? '已标记不续费。' : '')
          );
        })
        .join(' ');
    if (q.source === 'balance')
      return cards
        .map((e, i) => {
          const name = q.names![i],
            rows = e.rows.filter((r) => r.name === name);
          if (rows.length !== 1 || rows[0].remainingLessons == null)
            return name + '的余额未能唯一核实。';
          return (
            name +
            '截至 ' +
            (q.periods[0]?.end ?? e.businessAsOf) +
            ' 剩余 ' +
            numeric(rows[0].remainingLessons) +
            ' 节。'
          );
        })
        .join(' ');
    if (q.source === 'students' || q.source === 'lowStudents' || q.source === 'renewals')
      return prefix + roster(q, card);
    if (q.source === 'teachers')
      return (q.names?.length || q.op === 'spread' ? prefix : '') + ranking(q, card);
    if (q.source === 'lessons') {
      const teachers = [
        ...new Set(card.rows.map((r) => String(r.teacherName || '授课老师未登记'))),
      ];
      return (
        prefix +
        '共完成 ' +
        card.rows.length +
        ' 场课。' +
        (teachers.length ? '授课老师：' + teachers.join('、') + '。' : '')
      );
    }
    const hasOverlap =
      q.periods.length === 2 &&
      q.periods[0].start <= q.periods[1].end &&
      q.periods[1].start <= q.periods[0].end;
    if (cards.length === 2 && hasOverlap && (q.op === 'sum' || q.source === 'attendance'))
      return '两段日期重叠，直接相加会重复统计。请先选定互不重叠的期间。';
    if (q.source === 'attendance') {
      if (q.op === 'maximum') return renderClassStandings(card);
      if (q.op === 'list') {
        const complete = card.rows
          .filter((r) => typeof r.应到 === 'number' && r.应到 > 0)
          .sort((a, b) => numeric(b.实到) / numeric(b.应到) - numeric(a.实到) / numeric(a.应到));
        return (
          prefix +
          (complete.length
            ? complete
                .map(
                  (r) =>
                    r.name +
                    ' ' +
                    format((100 * numeric(r.实到)) / numeric(r.应到)) +
                    '%（' +
                    r.实到 +
                    '／' +
                    r.应到 +
                    '）'
                )
                .join('、')
            : '无可比较的班级') +
          '。'
        );
      }
      const due = cards.reduce((n, c) => n + numeric(c.totals.应到), 0),
        present = cards.reduce((n, c) => n + numeric(c.totals.实到), 0);
      return (
        prefix +
        '实到 ' +
        present +
        ' 人次，应到 ' +
        due +
        ' 人次（' +
        present +
        '／' +
        due +
        '）' +
        (due ? '，出勤率 ' + format((100 * present) / due) + '%。' : '，没有可计算的出勤率。')
      );
    }
    if (cards.some((c) => c.missing.some((m) => /缺价|未填.*金额|价格缺失/.test(m))))
      return prefix + '部分成单缺少金额，无法确认完整成交额。';
    const totals = cards.map((c) => ({
      amount: numeric(c.totals.金额合计),
      count: numeric(c.totals.新单数) + numeric(c.totals.续费单数),
    }));
    const [a, b] = totals;
    if (!b) return prefix + '确认成单 ' + a.count + ' 笔，成交额 ' + format(a.amount) + ' 元。';
    if (q.op === 'sum')
      return (
        prefix +
        '合计 ' +
        (a.count + b.count) +
        ' 笔，成交额 ' +
        format(a.amount + b.amount) +
        ' 元。'
      );
    if (q.op !== 'difference' && q.op !== 'growth')
      return cards
        .map(
          (c, i) =>
            periodLabel(q.periods[i]) +
            '：' +
            totals[i].count +
            ' 笔、' +
            format(totals[i].amount) +
            ' 元。'
        )
        .join('\n');
    const delta = b.amount - a.amount;
    return (
      periodLabel(q.periods[1]) +
      ' 对比 ' +
      periodLabel(q.periods[0]) +
      '，成交额从 ' +
      format(a.amount) +
      ' 元到 ' +
      format(b.amount) +
      ' 元，' +
      (delta === 0
        ? '金额持平'
        : (delta > 0 ? '增加 ' : '减少 ') + format(Math.abs(delta)) + ' 元') +
      '。' +
      (q.op !== 'growth'
        ? ''
        : a.amount === 0
          ? '基期为零，无法计算增长率。'
          : '变化率 ' + format((delta / a.amount) * 100) + '%。') +
      '成单笔数从 ' +
      a.count +
      ' 笔到 ' +
      b.count +
      ' 笔。'
    );
  } catch {
    return '当前证据缺少计算所需字段，无法确认结果。';
  }
}
