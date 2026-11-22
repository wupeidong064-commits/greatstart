import type { AiIntent } from './aiIntent';
import { BusinessPeriod, mentionedPeriods } from './aiBusinessCalendar';
import { bindSumWindows, formatPeriodCandidates, parsePeriodSelection, sumMetricFor, SumMetric, SumWindow } from './aiQueryBinding';
import type { Evidence } from './aiTools';

type ClassScope = { id: string; name: string };
type Conditions = { metric: SumMetric; scope?: ClassScope };
type Pair = [BusinessPeriod, BusinessPeriod];
type Completed = Conditions & { windows: Pair };
type Pending = Conditions & { kind: 'period'; candidates: SumWindow[]; proposal?: Pair };
type Result = { intent: AiIntent; completed?: Completed; pending?: Pending };
type HistoryCard = Pick<Evidence, 'tool' | 'timeRange' | 'filters' | 'error' | 'rows'>;
type Context = {
  today: string;
  completed?: Completed;
  pending?: Pending;
  recent: HistoryCard[];
  history: () => HistoryCard[];
  findClasses: () => Promise<ClassScope[]>;
};

const toolsByMetric: Record<SumMetric, string> = {
  money: 'signup_renewal', net: 'cost_and_income', attendance: 'class_attendance', receipts: 'weekly_report_data',
};
const two = /(?:两|二|双|2)个?(?:期间|段|期|周|星期|月)/;
const addition = /合计|共计|一共|总共|总和|加起来|合起来|加在一起|合并|相加|占.*比例/;
const askFirst = /先问|让我选|我要选|先让我|让我先|先选|先确认|确认.{0,4}再|等我确认/;
const confirm = /^(?:好(?:的)?[，,]?)?(?:确认|确定|可以|是的|对|就这两(?:段|周|个)|按这两(?:段|周|个)(?:算)?|没错|同意|好)(?:了|吧)?[。.!！\s]*$/;
const dateHint = /\d{1,4}[-/.年月]\d|[一二三四五六七八九十\d]+月|(?:上上|上|本|这|下)(?:个?月|周|星期)/;
const explicitMetric = /出勤|实到|应到|到课|人次|成交|成单|销售额|实收|收款|实缴/;
const broad = /全(?:机构|校区|校|部班级)|所有班级|整个(?:机构|校区)/;
const say = (reply: string): Result => ({ intent: { parsedOk: true, reply } });
const same = (a: BusinessPeriod, b: BusinessPeriod) => a.start === b.start && a.end === b.end;
const label = (w: BusinessPeriod) => w.start + ' 至 ' + w.end;
const keyFor = (tool: string) => (Object.keys(toolsByMetric) as SumMetric[]).find(k => toolsByMetric[k] === tool);

/** A comparison card may contain an automatically generated baseline. Only dates actually
 * requested in that turn can subsequently be selected by position. Read old conversations too. */
export function historicalSumCards(rows: Array<{role:string;status:string;content:string;evidenceJson:unknown;usageJson:unknown}>): HistoryCard[] {
  let question = '';
  return rows.flatMap(row => {
    if (row.role === 'user') { question = row.content; return []; }
    if (row.role !== 'assistant' || row.status !== 'complete' || !Array.isArray(row.evidenceJson)) return [];
    const cards: HistoryCard[] = row.evidenceJson.filter(c => c?.timeRange && !c.error);
    const saved = (row.usageJson as {operatingAnswer?:{crossSum?:Completed;calendar?:{asOfDate:string;observation?:BusinessPeriod;comparison?:BusinessPeriod}}} | null)?.operatingAnswer;
    const cal = saved?.calendar;
    if (saved?.crossSum || !cal?.comparison || !cal.observation) return cards;
    let requested = [cal.observation];
    try {
      const explicit = mentionedPeriods(question, cal.asOfDate);
      if (explicit.length) requested = explicit;
    } catch { /* Keep the recorded observation if the earlier wording was ambiguous. */ }
    return cards.filter(c => requested.some(w => same(w, c.timeRange!)));
  });
}

function windowsOf(cards: HistoryCard[]): SumWindow[] {
  const windows: SumWindow[] = [];
  for (const { timeRange, tool, error } of cards) {
    if (!error && (keyFor(tool) || tool === 'weekly_comparison') && timeRange && !windows.some(w => same(w, timeRange)))
      windows.push({ ...timeRange, seq: windows.length + 1 });
  }
  return windows;
}

function prompt(conditions: Conditions, candidates: SumWindow[], mode: string, proposal?: Pair): Result {
  const list = formatPeriodCandidates(candidates);
  let reply: string;
  if (proposal) reply = '请确认是否选用 ' + proposal.map(label).join(' 和 ') + '。回复「确认」后再合计，也可以改选。';
  else if (candidates.length < 2) reply = (list ? '本对话只查过一段期间：' + list : '本对话还没有可合计的期间') + '。请提供要合计的两段日期。';
  else reply = (mode === 'invalid' ? '请选两个不同且有效的编号。' : '要合计哪两个期间？') + list + '。可回复编号或两段日期。';
  if (proposal && candidates.length > 2) reply += ' 可选期间：' + list + '。';
  return { ...say(reply), pending: { ...conditions, kind: 'period', candidates, proposal } };
}

export async function crossPeriodQuery(q: string, ctx: Context): Promise<Result | undefined> {
  const last = ctx.completed?.windows?.length === 2 ? ctx.completed : undefined;
  const pending = ctx.pending;
  if (pending && /^(?:取消|不算了|先不算|算了|不用了)[。！!\s]*$/.test(q))
    return say('已取消本次合计。');
  if (!pending && /选|第/.test(q) && parsePeriodSelection(q, Number.MAX_SAFE_INTEGER))
    return say('当前没有待选期间。请说明要查询的指标和两个期间。');
  const selection = pending && parsePeriodSelection(q, pending.candidates.length);
  const agrees = Boolean(pending && confirm.test(q.trim()));
  const twoMentioned = two.test(q);
  const wait = askFirst.test(q);
  const dateInQuestion = dateHint.test(q.replace(/(?:两|二|2)个月/g, ''));
  const related = /那|换成|改成|只看|只算|只统计|还是|呢|这两|刚才|同一|全机构/.test(q);
  const pointsToPair = /(?:这|那|同样的|刚才的|上述)(?:两|2)(?:个)?(?:周|段|期|月)/.test(q) &&
    !/最早|最晚|最先|最后|最近查|日期/.test(q);
  const followup = Boolean(last && related && !wait && !dateInQuestion && (!twoMentioned || pointsToPair) &&
    !/排名|排行|最低|最高|哪个|哪位|谁|为什么|原因|学员|学生|余额|课时|利润|同比|环比|换个问题/.test(q) &&
    (explicitMetric.test(q) || /班|全机构|全校/.test(q)));
  if (!selection && !agrees && !followup && !(twoMentioned && (addition.test(q) || wait)) &&
      !(dateInQuestion && (pending || addition.test(q)))) return;
  if (/(?:最近|过去|未来|连续)两周/.test(q) && !pending && !/分别|两个期间|查过/.test(q)) return;
  let explicit: BusinessPeriod[] = [];
  if (dateInQuestion) {
    try { explicit = mentionedPeriods(q.replace(/(?:两|二|2)个月/g, '两个期间'), ctx.today); }
    catch (err) { return say(err instanceof Error ? err.message : '请核对期间的起止日期。'); }
    if (!twoMentioned && !pending && explicit.length < 2) return;
    if (pending && explicit.length < 2 && !twoMentioned && !addition.test(q) &&
        !(pending.candidates.length === 1 && /另|补|再加|还有/.test(q))) return;
  }
  // Named rankings, balances, and general advice keep their own authorized tools.
  if (/排名|排行|最低|最高|哪个|哪位|谁|余额|课时|怎么办|为什么|同比|环比|对比/.test(q)) return;
  const priorMetric = pending?.metric ?? last?.metric ?? keyFor(ctx.recent[0]?.tool);
  if (!priorMetric && !explicitMetric.test(q)) return say('这两段期间要合计哪个指标？可以查成交额、净成单额、实收金额或出勤。');
  const metric = sumMetricFor(q, priorMetric);
  const classes = selection || agrees ? [] : await ctx.findClasses();
  const currentClass = classes[0];
  if (classes.length > 1) return say('本次匹配到多个班级，请用完整班级名或班级代码指定一个班级。');
  const scopeText = currentClass ? q.replace(currentClass.name, '').replace(currentClass.id, '') : q;
  const all = broad.test(scopeText);
  const previous = ctx.recent[0];
  const prevId = previous?.tool === 'class_attendance' && previous.filters?.classId;
  const prevName = prevId && previous.rows.find(r => r.id === prevId)?.name;
  const priorScope = pending ? pending.scope : last ? last.scope : (typeof prevId === 'string'
    ? { id: prevId, name: typeof prevName === 'string' ? prevName : '指定班级' } : undefined);
  const scope = currentClass ?? (all ? undefined : priorScope);
  if (/老师|教师|教练|顾问|学科|科目|某课程|指定课程|学员|学生/.test(scopeText))
    return say('这项跨期汇总支持全机构的成单、实收及出勤，或指定班级的出勤。请明确统计范围。');
  if (!all && !currentClass && /班|研习社|兴趣社/.test(q) &&
      !(priorScope && /(?:这个|该|本|同一|刚才的|原来那个)班/.test(q)))
    return say('请提供当前机构的完整班级名或班级代码，再核算这两个期间。');
  if (/新签|退费|续费|多少笔|几笔|多少单|几单|去重|多少人(?!次)|实到人数|课消/.test(scopeText))
    return say('请明确要合计的指标。支持成交额、净成单额、实收金额、实到人次与出勤率。');
  if (scope && metric !== 'attendance')
    return say('当前跨期' + (metric === 'receipts' ? '实收' : '成单') + '查询没有可按该班级核对的小计。可查询该班出勤，或明确改查全机构金额。');
  const conditions: Conditions = { metric, scope };
  let pair: Pair;
  if (explicit.length > 0) {
    if (explicit.length === 1 && pending?.candidates.length === 1 && /另|补|再加|还有/.test(q))
      explicit.unshift(pending.candidates[0]);
    if (explicit.length !== 2 || same(explicit[0], explicit[1]))
      return say('请提供两个不同期间的起止日期，以便合计。');
    pair = [explicit[0], explicit[1]];
    if (wait) return prompt(conditions, pair.map((w,i) => ({ ...w, seq:i+1 })), 'confirm', pair);
  } else if (pending && (selection || agrees)) {
    if (selection?.kind === 'pair') pair = [pending.candidates[selection.first-1], pending.candidates[selection.second-1]];
    else if (agrees && pending.proposal) pair = pending.proposal;
    else return prompt(conditions, pending.candidates, 'invalid', selection ? undefined : pending.proposal);
  } else if (followup && last) {
    pair = last.windows;
  } else {
    const binding = bindSumWindows(q, windowsOf(ctx.history()));
    if (binding.action === 'clarify') {
      const [first, second] = binding.candidates;
      const proposal: Pair | undefined = wait && binding.candidates.length === 2 ? [first, second] : undefined;
      return prompt(conditions, binding.candidates, binding.mode, proposal);
    }
    pair = [binding.first, binding.second];
    if (wait) return prompt(conditions, binding.candidates, 'confirm', pair);
  }
  // Historical periods identify the dates. Both fresh queries use exactly this turn's conditions.
  if (!currentClass && !all && !pending && !last) {
    const historicalScopes = new Set(ctx.history().filter(c => c.tool === 'class_attendance' && !c.error &&
      c.timeRange && pair.some(w => same(w, c.timeRange!))).map(c => c.filters?.classId ?? null));
    if (historicalScopes.size > 1 || historicalScopes.size === 1 && !historicalScopes.has(scope?.id ?? null))
      return say('这两个期间曾使用不同的班级范围。请指定班级名，或说明按全机构合计。');
  }
  const tools = pair.map(w => ({
    name: toolsByMetric[metric],
    params: { startDate: w.start, endDate: w.end, ...(scope ? { classId: scope.id } : {}) },
  }));
  return { intent: { parsedOk: true, purpose: 'facts', crossSum: true, tools }, completed: { ...conditions, windows: pair } };
}

export function renderPeriodSum(state: Completed, cards: Evidence[]): string {
  const [first, second] = state.windows;
  const [a, b] = cards;
  const prefix = state.scope ? state.scope.name + '，' : '';
  if (first.start <= second.end && second.start <= first.end)
    return '两个期间有重叠（' + [first, second].map(label).join(' 与 ') + '），直接相加会重复计算。请提供互不重叠的期间。';
  if (![a,b].every((c,i) => c && !c.error && c.timeRange && same(c.timeRange, state.windows[i]) &&
      c.tool === toolsByMetric[state.metric] && (c.filters?.classId ?? undefined) === state.scope?.id))
    return prefix + '两段期间未取得同一范围的完整数据，暂时无法合计。';
  const start = prefix + '两期合计：' + label(first);
  if (state.metric === 'attendance') {
    const [x,y,dx,dy] = [a.totals.实到,b.totals.实到,a.totals.应到,b.totals.应到];
    if (![x,y,dx,dy].every(v => typeof v === 'number' && Number.isFinite(v))) return prefix + '缺少出勤小计，无法合计。';
    const present = Number(x)+Number(y), due = Number(dx)+Number(dy);
    return start + ' 实到 ' + x + ' 人次，' + label(second) + ' 实到 ' + y + ' 人次；合计实到 ' + present +
      ' 人次，合计应到 ' + due + ' 人次' + (due ? '，合计出勤率 ' + Math.round(present/due*1000)/10 + '%（' + present + '／' + due + ' 人次）。' : '，无应到人次，无法计算出勤率。');
  }
  const [field, title] = state.metric === 'net' ? ['净成单额','净成单'] : state.metric === 'receipts' ? ['实收','实收'] : ['金额合计',''];
  const x = a.totals[field], y = b.totals[field];
  if (typeof x !== 'number' || typeof y !== 'number' || !Number.isFinite(x) || !Number.isFinite(y)) return '缺少可核对的金额小计，无法合计。';
  const centsA = Math.round(x * 100), centsB = Math.round(y * 100), total = centsA + centsB;
  const shares = total > 0 ? '；占比 ' + Math.round(1000*centsA/total)/10 + '% / ' + Math.round(1000*centsB/total)/10 + '%' : '';
  const partial = [a,b].some(c => c.missing?.some(m => /未登记价格|未填写.*金额|价格缺失|金额缺失/.test(m)));
  const prefixAmount = (title ? ' ' + title : '') + ' ¥';
  return start + prefixAmount + x.toLocaleString('zh-CN') + '，' + label(second) + prefixAmount + y.toLocaleString('zh-CN') +
    '；合计' + title + ' ¥' + (total/100).toLocaleString('zh-CN') + shares + '。' + (partial ? '部分订单缺少金额，仅合计可核实部分。' : '');
}
