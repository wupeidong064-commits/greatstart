import type { AiIntent } from './aiIntent';
import { resolveBusinessCalendar } from './aiBusinessCalendar';

/** 接续轮共用查询绑定（R1/N1/N3）：把查询对象、指标、人员范围、统计期间和排序方向
 * 作为可独立承接的条件。本轮明确提出的条件优先，省略型追问从上一轮同款排名卡补齐未改条件。 */

/** 明确要求把销售/顾问等非教学岗并入排名，才放开人员范围。 */
export const RANK_EXPAND_RX =
  /全员|全体员工|所有员工|全部员工|把顾问也算|顾问也算上|算上顾问|把顾问算上|顾问也算|销售也算上|把销售也算|算上销售|不限岗位|所有人员|所有人[中里]/;

/** 本轮点名教学岗位（老师／教师／教练）→ 默认只在教学人员中统计。 */
export function rankScopeFor(q: string): 'teachers' | 'all' | undefined {
  if (RANK_EXPAND_RX.test(q)) return 'all';
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

/** 两期合计的两段绑定（复验 J2）：按问句点名的粒度过滤会话内讨论过的窗口。
 * windows 按最近优先；两周→仅 10 天内窗口，两月→仅 20 天以上窗口，两期/两段→不限。
 * 命中不足两段时不能唯一确定，返回 null 让用户从候选中挑。 */
export function bindSumWindows(
  q: string,
  windows: Array<{ start: string; end: string }>
): { bound: Array<{ start: string; end: string }> | null; candidates: Array<{ start: string; end: string }> } {
  const span = (w: { start: string; end: string }) =>
    Math.round((Date.parse(w.end) - Date.parse(w.start)) / 86400000) + 1;
  const week = /(?:两|二|双)个?(?:周|星期)/.test(q);
  const month = /(?:两|二|双)个?月/.test(q);
  let cands = windows;
  if (week) cands = windows.filter(w => span(w) <= 10);
  else if (month) cands = windows.filter(w => span(w) >= 20);
  return { bound: cands.length >= 2 ? [cands[0], cands[1]] : null, candidates: windows };
}
