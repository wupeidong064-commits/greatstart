import type { AiIntent } from './aiIntent';
import { resolveBusinessCalendar } from './aiBusinessCalendar';

/** 接续轮共用查询绑定（R1/N1/N3）：把查询对象、指标、人员范围、统计期间和排序方向
 * 作为可独立承接的条件。本轮明确提出的条件优先，省略型追问从上一轮同款排名卡补齐未改条件。 */

/** 明确要求把销售/顾问等非教学岗并入排名，才放开人员范围。 */
export const RANK_EXPAND_RX =
  /全员|全体员工|所有员工|全部员工|把顾问也算|顾问也算上|算上顾问|把顾问算上|顾问也算|销售也算上|把销售也算|算上销售|不限岗位|所有人员|所有人[中里]/;

/** 本轮点名教学岗位（老师／教师／教练）→ 默认只在教学人员中统计。 */
export function rankScopeFor(q: string): 'teachers' | 'all' | undefined {
  if (/(?:排除|不含|不算|不计|别算|不[要再]*[把将]?)(?:销售)?顾问|(?:销售)?顾问.{0,3}(?:排除|不算|不计|不参加)/.test(q)) return 'teachers';
  if (/(?:纳入|包括|加上|包含|计入).{0,3}(?:销售|顾问)|(?:顾问|销售).{0,4}(?:也算|纳入|计入|加入|包含)/.test(q) || RANK_EXPAND_RX.test(q)) return 'all';
  if (/老师|教师|教练/.test(q)) return 'teachers';
  return undefined;
}

const METRIC_RX: Array<[RegExp, string]> = [
  [/个人新招|新招人数|新签人数/, 'signup'],
  [/课消|核销/, 'consumption'],
  [/成单|成交|销售额|销售业绩/, 'sales'],
  [/出勤率|到课率|出勤|到课/, 'attendance'],
];
function metricFromText(text: string): string | undefined {
  for (const [rx, metric] of METRIC_RX) if (rx.test(text)) return metric;
  return undefined;
}

const MIN_RX = /最低|垫底|倒数|排在最后|排最后|谁最后|最后一名|末位|最差|表现最差/;
const MAX_RX = /最高|最好|最佳|最强|第一|领先|最出色|头名/;

/** 排名条件的省略型承接：仅当上一轮已有老师表现排名卡，且本轮出现方向词、
 * 范围扩缩或明确指标之一时接管。两人比较（和/比/环比）不在其列，仍走比较意图。 */
export function rankFollowupBinding(
  q: string,
  previous: any[],
  today: string
): AiIntent | undefined {
  const text = q.trim();
  if (text.length > 40) return undefined;
  if (/学员|学生|同学|班级|各班|哪个班|哪班|课程|学科|科目|哪门|校区|渠道|来源|线索|家长|体验|其他机构|删除|修改|密码|密钥/.test(text)) return undefined;
  if (/(?:和|与|跟|相比|比较|环比|同比)/.test(text)) return undefined;
  const min = MIN_RX.test(text);
  const max = MAX_RX.test(text);
  const expand = RANK_EXPAND_RX.test(text);
  if (!min && !max && !expand) return undefined;
  const prev = previous.find(
    (c) => c && c.tool === 'teacher_performance_ranking' && !c.error && Array.isArray(c.rows)
  );
  if (!prev) return undefined;
  const explicitMetric = metricFromText(text);
  const filters = (prev.filters || {}) as Record<string, unknown>;
  const metric = explicitMetric || (typeof filters.metric === 'string' ? filters.metric : 'attendance');
  const direction = min ? 'min' : max ? 'max' : filters.direction === 'min' ? 'min' : 'max';
  const scope = expand ? undefined : (rankScopeFor(text) ?? (typeof filters.scope === 'string' ? filters.scope : undefined));
  const calendar = resolveBusinessCalendar({ question: text, today });
  if (calendar.clarification) return { parsedOk: true, reply: calendar.clarification };
  const explicitPeriod = calendar.explicit;
  const params: Record<string, unknown> = { metric, direction };
  if (scope) params.scope = scope;
  const carry = prev.timeRange && prev.timeRange.start && prev.timeRange.end;
  const period = explicitPeriod ? calendar.observation : carry ? prev.timeRange : calendar.observation;
  params.startDate = period.start;
  params.endDate = period.end;
  return { parsedOk: true, purpose: 'facts', subject: 'teacher', tools: [{ name: 'teacher_performance_ranking', params }] };
}

export type SumMetric = 'money' | 'net' | 'attendance' | 'receipts';
export function sumMetricFor(q: string, fallback: SumMetric = 'money'): SumMetric {
  if (/净(?:成单|成交)/.test(q)) return 'net';
  if (/出勤|实到|应到|到课|人次/.test(q)) return 'attendance';
  if (/实收|收款|实缴/.test(q)) return 'receipts';
  if (/成交|成单|销售额/.test(q)) return 'money';
  return fallback;
}

export interface SumWindow {
  start: string;
  end: string;
  /** 会话内的查询次序（1 起），用于「最早查过/最后查过」。 */
  seq: number;
}

/** 合计问句的期间粒度过滤：两周→5-10 天窗口，两月→≥20 天窗口，两期/两段→不限。 */
function unitEligible(q: string, w: SumWindow): boolean {
  const days = Math.round((Date.parse(w.end) - Date.parse(w.start)) / 86400000) + 1;
  if (/(?:两|二|双)个?(?:周|星期)/.test(q)) return days >= 5 && days <= 10;
  if (/(?:两|二|双)个?月/.test(q)) return days >= 20;
  return true;
}

export type SumBinding =
  | { action: 'bind'; first: SumWindow; second: SumWindow; candidates: SumWindow[]; mode: string }
  | { action: 'clarify'; candidates: SumWindow[]; mode: string };

/** 按问句绑定要合计的两段（K1/K2）：
 * 「最早查/先查」按会话查询次序取前两段，「最后查/最近查」按次序取后两段；
 * 「日期最早/最晚」按日历起日排序；粒度（周/月）先过滤，整月与单日不占周候选位。
 * 无指代且非两段时→候选请用户选（K2），不足两段→列出候选并说明。 */
export function bindSumWindows(q: string, windows: SumWindow[]): SumBinding {
  const cands = windows.filter(w => unitEligible(q, w));
  const bySeq = [...cands].sort((a, b) => a.seq - b.seq);
  const byStart = [...cands].sort((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end));
  const calendarWord = /(?:日期|时间)(?:最早|最晚|最近)/.test(q);
  if (!calendarWord && /(?:最早|最先)(?:查|问|的)?/.test(q) && cands.length >= 2) {
    return { action: 'bind', first: bySeq[0], second: bySeq[1], candidates: bySeq, mode: 'order-first' };
  }
  if (!calendarWord && /最后(?:查|问)|最近(?:查|问)|刚才那两/.test(q) && cands.length >= 2) {
    return { action: 'bind', first: bySeq[bySeq.length - 2], second: bySeq[bySeq.length - 1], candidates: bySeq, mode: 'order-last' };
  }
  if (/(?:日期|时间)最早/.test(q) && cands.length >= 2) {
    return { action: 'bind', first: byStart[0], second: byStart[1], candidates: bySeq, mode: 'calendar-first' };
  }
  if (/(?:日期|时间)(?:最晚|最近)/.test(q) && cands.length >= 2) {
    return { action: 'bind', first: byStart[byStart.length - 2], second: byStart[byStart.length - 1], candidates: bySeq, mode: 'calendar-last' };
  }
  if (/先问|让我选|我要选|先让我|让我先|先选/.test(q)) {
    return { action: 'clarify', candidates: bySeq, mode: 'user-choice' };
  }
  if (cands.length === 2) {
    return { action: 'bind', first: bySeq[0], second: bySeq[1], candidates: bySeq, mode: 'unique' };
  }
  return { action: 'clarify', candidates: bySeq, mode: cands.length > 2 ? 'ambiguous' : 'insufficient' };
}

// ===== 待选期间的回复解析（K2：选第 1 和第 3 个） =====

const CN_NUM: Record<string, number> = { 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };

function cnNum(s: string): number | undefined {
  if (/^[0-9]+$/.test(s)) return Number(s);
  if (s.length === 1) return CN_NUM[s];
  if (s === '十一') return 11;
  if (s === '十二') return 12;
  return undefined;
}

export type PeriodSelection =
  | { kind: 'pair'; first: number; second: number }
  | { kind: 'invalid' }
  | undefined;

/** 解析对候选期间的选择：「第1和第3个」「1和3」「一、三」。无效（越界/同一项/只给一个）→ invalid。 */
export function parsePeriodSelection(q: string, count: number): PeriodSelection {
  const norm = q.normalize('NFKC').trim()
    .replace(/^(?:(?:不对|不是|不用|不|好的|确认)[,，]\s*)?/, '')
    .replace(/^(?:(?:那就|那么|还是|直接|麻烦|那|我就|我想|我要|我|请|就)\s*)*(?:改选|改用|改成|选(?:择)?|用|取|算|按)?\s*/, '')
    .replace(/(?:这两(?:个|项|段|周)|吧|啊|呀|好了|就好|即可|就行|来算|算|合计|[。.!！?？\s])*$/, '')
    .replace(/最后一(?:个|项|段|周|期)?/g, String(count))
    .replace(/第\s*/g, '').replace(/(?:期间|个|项|段|周|期)/g, '').trim();
  if (!/^[\d一二两三四五六七八九十和与跟以及、,，\s]+$/.test(norm)) return undefined;
  const parts = norm.split(/(?:以及|[和与跟及、,，\s])+/).filter(Boolean);
  if (parts.length !== 2) return { kind: 'invalid' };
  const a = cnNum(parts[0]), b = cnNum(parts[1]);
  if (!a || !b || a === b || a > count || b > count) return { kind: 'invalid' };
  return { kind: 'pair', first: a, second: b };
}

/** 候选期间的展示文案（会话查询次序编号）。 */
export function formatPeriodCandidates(cands: SumWindow[]): string {
  return cands.map((w, i) => `第${i + 1}个 ${w.start} 至 ${w.end}`).join('；');
}
