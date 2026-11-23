import type { AiIntent } from './aiIntent';

export function requestsTable(q: string, intent: AiIntent) {
  return (
    intent.presentation === 'table' ||
    /(?:做成|排成|整理成|列成|用|制成|生成|排个|列个|做个)[^，。！？\n]{0,8}(?:小表|简表|表格|表看|一张表)/.test(
      q
    )
  );
}

// Match a named destination before executing even the fast report or previous-snapshot paths.
// Only the signed-in campus name is read. A match never looks up the foreign campus.
export function scopeClarification(q: string, ownName: string, requested?: string) {
  const deny =
    '当前账号仅可查询' + ownName + '。指定范围超出当前校区权限，此次没有查询或复用经营数据。';
  if (/跨(?:校区|机构)|其他(?:独立)?(?:校区|机构)|别的(?:校区|机构)|所有校区|全机构各校区/.test(q))
    return deny;
  const local = /^(?:(?:当前|我们|咱们|本|这个|本机构当前|整个|全)校区|校区|全校|全机构|整个(?:学校|机构))$/;
  const named = requested && q.includes(requested) ? requested : undefined;
  const ownAbbreviation = named && /^[\p{Script=Han}]{2,12}$/u.test(named) && ownName.startsWith(named) && !/(机构|校区|分校|学校)$/.test(named);
  if (named && !local.test(named) && !ownAbbreviation && named !== ownName && named + '校区' !== ownName) return deny;
  const remainder = ownName ? q.split(ownName).join('本校区') : q;
  const destinations = [
    ...remainder.matchAll(
      /(?:改看|改查|切换到?|换成|换到|看看|查询|对比|比较|查一下)[「“"]?([\p{L}\d]{1,20}校区)/gu
    ),
  ];
  if (destinations.some((m) => !local.test(m[1]))) return deny;
  return undefined;
}

const chineseDigit = '零一二三四五六七八九';
export function quantity(text: string): number {
  if (/^\d/.test(text)) return Number(text);
  const [whole, decimal] = text.replace(/两/g, '二').split('点');
  const [tens, ones] = whole.split('十');
  const n =
    whole === '一百'
      ? 100
      : ones !== undefined
        ? (tens ? chineseDigit.indexOf(tens) : 1) * 10 + (ones ? chineseDigit.indexOf(ones) : 0)
        : chineseDigit.indexOf(whole);
  return decimal ? n + Number('0.' + [...decimal].map((d) => chineseDigit.indexOf(d)).join('')) : n;
}
// The business API takes percentage points. Only explicitly stated rates may
// override defaults. Two separate percentages require two distinct constraints.
export function percentageIn(text: string) {
  const num = '(?:\\d+(?:\\.\\d+)?|[零一二两三四五六七八九十百点]+)';
  const rx = new RegExp('(?:百分之(' + num + ')|(' + num + ')\\s*[%％]|(' + num + ')成)', 'g');
  return [...text.matchAll(rx)].map((m) => (m[3] ? quantity(m[3]) * 10 : quantity(m[1] || m[2])));
}
function requestedPercent(q: string) {
  const clause = q
    .split(/[，,。！？?；;]/)
    .find(
      (part) =>
        /目标|达标线|定[在为]|达到|至少|希望|考核线|做到/.test(part) && percentageIn(part).length
    );
  const percents = clause && percentageIn(clause);
  return percents && percents.length === 1 && percents[0] >= 0 && percents[0] <= 100
    ? percents[0]
    : undefined;
}
export function bindUserThreshold(intent: AiIntent, q: string, inherited = false): AiIntent {
  if (inherited || !intent.tools?.some((t) => t.name.startsWith('low_attendance_'))) return intent;
  const clauses = q
    .split(/[，,。！？?；;]/)
    .filter((x) =>
      /出勤|到课|阈值|门槛|不到|不满|未满|不足|低于|低过|小于|不高于|不超过|以下|[<≤]/.test(x)
    );
  const constrained = clauses.filter((x) =>
    /不到|不满|未满|不足|未达|不及|低于|低过|小于|少于|不高于|不超过|以下|阈值|门槛|[<≤]/.test(x)
  );
  const values = [...new Set(constrained.flatMap(percentageIn))];
  const inclusive = /不高于|不超过|小于等于|低于或等于|含边界|含本数|≤|<=/.test(
    constrained.join('')
  );

  if (
    values.length > 1 ||
    values.some((x) => !Number.isFinite(x) || x < 0 || x > 100) ||
    (!values.length && clauses.some((x) => /(?:低于|不足|小于|阈值)[为是\s]*\d/.test(x)))
  )
    return { parsedOk: true, reply: '请明确一个出勤率阈值并带上百分号，例如“低于60%”。' };
  return {
    ...intent,
    tools: intent.tools.map((t) => {
      if (!t.name.startsWith('low_attendance_')) return t;
      const params = { ...t.params };
      delete params.threshold;
      delete params.thresholdMode;
      if (values.length) {
        params.threshold = values[0];
        if (inclusive) params.thresholdMode = 'lte';
      }
      return { ...t, params };
    }),
  };
}

/** A count, a historical rate, and a current directory search answer different questions.
 * Bind the measure and the named entity to a capable tool before reading records. */
export function alignMeasures(intent: AiIntent, question: string): AiIntent {
  if (!intent.parsedOk || intent.reuseSnapshot) return intent;
  const tools = intent.tools || [];
  const labels = [question, ...(intent.metrics || [])].join(' ');
  if (/续费率|续报率|续班率/.test(labels)) {
    const params: Record<string, unknown> = {};
    const percent = requestedPercent(question);
    if (percent !== undefined) params.userTargetPercent = percent;
    const extra = tools.filter(
      (t) => t.name === 'teacher_performance' || t.name.startsWith('low_attendance_')
    );
    return { ...intent, reply: undefined, tools: [{ name: 'renewal_rate', params }, ...extra] };
  }
  const lookup = tools.find(
    (t) =>
      t.name === 'student_attendance' ||
      t.name === 'search_students' ||
      (t.name === 'business_records' && t.params.domain === 'students')
  );
  const proposed = intent.entities?.student || lookup?.params.studentName || lookup?.params.keyword;
  const name = typeof proposed === 'string'
    && (question.includes(proposed) || (proposed.includes('、') && proposed.split('、').every(p => p && question.includes(p))))
    ? proposed : undefined;
  if (
    /出勤|到课|签到|上课/.test(labels) &&
    (name || lookup?.name === 'student_attendance') &&
    !tools.some((t) => t.name === 'new_student_attendance')
  ) {
    const params: Record<string, unknown> = name ? { studentName: name } : {};
    if (!name && proposed) return { parsedOk: true, reply: '请提供要查询出勤的学员姓名或编号。' };
    if (lookup?.params.studentId && question.includes(String(lookup.params.studentId)))
      params.studentId = lookup.params.studentId;
    if (lookup?.params.ranking) params.ranking = lookup.params.ranking;
    return { ...intent, reply: undefined, tools: [{ name: 'student_attendance', params }] };
  }
  if (
    /已设|配置|既定|系统.*目标|目标.*系统/.test(question) &&
    /目标/.test(question) &&
    /金额|成单|新签|续费/.test(labels)
  ) {
    return {
      ...intent,
      reply: undefined,
      tools: [{ name: 'monthly_target_comparison', params: {} }],
    };
  }
  return intent;
}

// Narrow explicit single-metric comparisons to references carrying the requested
// business unit. Broad requests keep their full, validated set of metrics.
export function comparisonFactIds(q: string, facts: import('./aiOperatingFacts').OperatingFact[]) {
  const concepts: [RegExp, string][] = [
    [/续(?:费|报)(?:的)?(?:单数|笔数|订单数)|几(?:笔|单).*续费/, 'sales.renewalCount'],
    [/新签(?:单数|笔数|订单数)/, 'sales.newCount'],
    [/续费金额/, 'sales.renewal'],
    [/新签金额/, 'sales.new'],
    [/净成单额/, 'cash.netSales'],
    [/出勤率/, 'lessons.rate'],
    [/应到人次/, 'lessons.due'],
    [/实到人次/, 'lessons.actual'],
  ];
  const requested = concepts.filter(([pattern]) => pattern.test(q)).map(([, metric]) => metric);
  if (requested.length !== 1 || /其他|其他指标|明细|分别|各项/.test(q)) return undefined;
  const selected = facts.filter(
    (f) => f.metric === requested[0] && (f.kind === 'metric' || f.kind === 'comparison')
  );
  const ids = selected.filter((f) => f.kind === 'comparison');
  return selected.length ? (ids.length ? ids : selected).map((f) => f.id) : undefined;
}
