'use strict';

// Both the model request and the reader-facing prose are derived from this closed catalog.
// The model selects and orders IDs. It cannot supply numbers, identities, sources or prose.
const protocol = 'database-report-selections-v1';
const sections = {
  lessons: '授课与出勤',
  roster: '在读与学员变化',
  coach: '授课人工作',
  sales: '新签成单',
  renewal: '续费与留存',
  cash: '成单、退费与课消',
  daily: '执行记录',
  context: '目标与历史复核',
};
const units = {
  'lessons.due': '人次',
  'lessons.actual': '人次',
  'lessons.rate': '%',
  'lessons.consumption': '元',
  'coach.topConsumption': '元',
  'sales.new': '元',
  'sales.newCount': '单',
  'sales.renewal': '元',
  'sales.renewalCount': '单',
  'cash.income': '元',
  'cash.refunds': '元',
  'cash.netSales': '元',
  'target.newSign': '元',
  'target.renewal': '元',
  'roster.current': '人次',
  'daily.count': '条',
};
const definitions = [
  [
    'attendance',
    'lessons',
    '出勤与应到基数',
    '应到{{lessons.due}}，实到{{lessons.actual}}，出勤率{{lessons.rate}}。应到随班级排课与有效报名变化，核查缺席应从具体场次入手。',
    '缺席跟进',
    '把未到课记录按场次交给授课老师核对，分别记录请假、调课和待联系情况。',
  ],
  [
    'consumption',
    'lessons',
    '实际课消',
    '按原课时批次计价，本期实际课消{{lessons.consumption}}。可按已完成场次核查扣课及冲正记录。',
    '课消核对',
    '抽取发生扣课或更正的场次，与原批次金额对照。',
  ],
  [
    'teaching',
    'coach',
    '授课人工作量的归属',
    '按实际场次归属，本期授课人课消最高值为{{coach.topConsumption}}。请结合该老师的班型、场次和应到人次理解金额差异。',
    '教师复核',
    '与授课人逐班核对已完成场次及临时替课，销售指标另按订单归属核对。',
  ],
  [
    'signup',
    'sales',
    '新签金额与笔数',
    '本期已确认新签{{sales.newCount}}，对应成单金额{{sales.new}}。两项按成单业务日期统计。',
    '新签复核',
    '核对新签订单的确认状态、班级归属和后续到课安排。',
  ],
  [
    'renewal',
    'renewal',
    '续费金额与笔数',
    '本期已确认续费{{sales.renewalCount}}，金额{{sales.renewal}}。计算到期续费率还需同期间到期名单及其续费结果。',
    '续费跟进',
    '按到期学员名单核对负责人与续费记录，再讨论续费率目标。',
  ],
  [
    'netOrders',
    'cash',
    '净成单与退费',
    '确认成单总额{{cash.income}}，同期确认退费{{cash.refunds}}，扣除退费后的净成单额{{cash.netSales}}。成单按业务日归集，退费按确认日归集。',
    '财务对账',
    '依据成单日和退费确认日分别核对明细，复核跨期退费。',
  ],
  [
    'roster',
    'roster',
    '花名册快照',
    '已取得的花名册快照记录{{roster.current}}，跨班报名按各班分别列示。',
    '学员核查',
    '使用同一日期的班级花名册核对调班和归档原因。',
  ],
  [
    'workLog',
    'daily',
    '主管工作记录',
    '本期取得主管工作记录{{daily.count}}。请结合记录日期与原始办理回执核查执行结果。',
    '执行复核',
    '将已记录的安排与业务回执对应，待核事项单列。',
  ],
];
const fallbacks = {
  lessons: '未取得可核算出勤率的完整场次与应到分母，出勤情况待核。',
  roster: '未取得可对比的期初、期末花名册，暂不能核定净增人数或流失。',
  coach: '未取得可归属到个人的授课课消资料，个人表现待核。',
  sales: '未取得完整且可核对来源的新签金额与笔数。',
  renewal: '未取得可核对来源的续费明细或到期学员分母，续费表现待核。',
  cash: '未取得可核对来源的完整成单与退费数据，净成单额待核。',
  daily: '未取得本期主管执行记录。具体安排是否办结，可向负责人核查。',
  context: '未取得本期可直接对比的业务目标或已核实的历史执行结果。',
};
function databaseObservation(f, asOf) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf) || !Number.isFinite(Date.parse(asOf)))
    throw Error('报告核算截点无效');
  const period = f.period,
    month = period.start.slice(0, 7);
  const wholeMonth =
    period.start.endsWith('-01') &&
    month === period.end.slice(0, 7) &&
    new Date(Date.parse(period.end) + 86400000).getUTCDate() === 1;
  const past = period.end < asOf,
    completePrices =
      f.cash?.covered === true &&
      f.cash?.sourceCaliber === 'confirmed_orders' &&
      !f.missing.some((s) => /缺失价格|未登记价格|价格缺失|仅合计已登记价格/.test(s));
  const note = past
    ? ''
    : period.start > asOf
      ? '报告期间尚未开始。查询截点为' + asOf + '，以下为该截点已登记的记录，不能据此评定整期结果。'
      : '报告期间尚未结束。查询截点为' +
        asOf +
        '，以下为该截点已登记的记录，整期实绩和是否达标待期末核对。';
  return {
    asOf,
    monthlyTargetComparable: period.kind === 'monthly' && wholeMonth && past && completePrices,
    note,
  };
}
function catalog(f) {
  const validSources = new Set(f.sources.map((s) => s.id));
  const entries = [];
  function add([id, section, label, paragraph, actionLabel, action]) {
    const metricIds = [...new Set([...paragraph.matchAll(/\{\{([\w.]+)\}\}/g)].map((m) => m[1]))];
    if (!metricIds.length) return;
    const metrics = metricIds.map((id) => f.metrics[id]);
    if (
      metrics.some(
        (m, i) =>
          !m ||
          m.id !== metricIds[i] ||
          m.unit !== units[m.id] ||
          !Number.isFinite(m.value) ||
          !Array.isArray(m.sourceIds) ||
          !m.sourceIds.length ||
          m.sourceIds.some((s) => !validSources.has(s))
      )
    )
      return;
    entries.push({
      id,
      section,
      label,
      paragraph,
      actionLabel,
      action,
      metricIds,
      sourceIds: [...new Set(metrics.flatMap((m) => m.sourceIds))],
    });
  }
  for (const item of definitions) add(item);
  // A zero denominator is observable. Only the rate is unavailable.
  if (f.metrics['lessons.due']?.value === 0)
    add([
      'noAttendanceBase',
      'lessons',
      '出勤分母',
      '本期应到{{lessons.due}}，实到{{lessons.actual}}。应到为零，无法计算出勤率。',
      '排课复核',
      '核对本期实际开课与有效报名情况。',
    ]);
  if (f.period.kind === 'monthly' && f.databaseObservation?.monthlyTargetComparable === true) {
    for (const [id, label, actual, goal] of [
      ['signupTarget', '新签', 'sales.new', 'target.newSign'],
      ['renewalTarget', '续费', 'sales.renewal', 'target.renewal'],
    ]) {
      const a = f.metrics[actual]?.value,
        g = f.metrics[goal]?.value;
      const target = f.targets || {},
        window = f.databaseObservation;
      if (
        !Number.isFinite(a) ||
        !Number.isFinite(g) ||
        g < 0 ||
        target.month !== f.period.start.slice(0, 7) ||
        (target.effectiveDate && target.effectiveDate > window.asOf) ||
        (target.effectiveDate && target.effectiveDate > f.period.end)
      )
        continue;
      const outcome = a === g ? '等于' : a > g ? '超过' : '低于';
      add([
        id,
        'context',
        label + '同月目标',
        `本月${label}金额{{${actual}}}，${outcome}已确认的月度目标{{${goal}}}。`,
        label + '目标复核',
        '结合本月有效目标与同范围订单核定差额，再安排后续行动。',
      ]);
    }
  }
  return entries;
}
function selectionRequest(f) {
  const entries = catalog(f);
  const available = entries.map((e) => ({
    id: e.id,
    focus: e.label,
    action: e.actionLabel,
    facts: e.metricIds.map((id) => ({ id, value: f.metrics[id].value, unit: f.metrics[id].unit })),
  }));
  return { protocol, period: f.period, candidates: available };
}
function resolveSelection(plan, f) {
  const available = catalog(f),
    byId = new Map(available.map((e) => [e.id, e]));
  const rejected = [];
  if (!plan || !Array.isArray(plan.highlights) || !Array.isArray(plan.actions))
    throw Error('报告分析未提交可验证的事实和行动选择');
  const select = (name, ids, limit) => {
    const selected = [];
    for (const [i, token] of ids.entries()) {
      let id = token;
      if (name === 'actions' && typeof token === 'string' && !byId.has(token)) {
        const matches = available.filter((e) => e.actionLabel === token);
        if (matches.length === 1) id = matches[0].id;
      }
      if (typeof id !== 'string' || !byId.has(id)) {
        rejected.push({ field: name, index: i, reason: '未知引用' });
        continue;
      }
      if (selected.length < limit && !selected.includes(id)) selected.push(id);
    }
    return selected.map((id) => byId.get(id));
  };
  const highlights = select('highlights', plan.highlights, 3),
    actions = select('actions', plan.actions, 4);
  if (!highlights.length) throw Error('报告分析没有有效的重点事实引用');
  if (!actions.length) throw Error('报告分析没有有效的建议行动引用');
  const ordered = [...new Set([...highlights, ...available])];
  const cutoff = f.databaseObservation?.note;
  const raw = {
    summary: [
      ...(cutoff ? [cutoff] : []),
      ...highlights.map((e) => e.paragraph + '（来源：' + e.sourceIds.join('、') + '）'),
    ],
    sections: Object.entries(sections).map(([key, title]) => {
      const claims = ordered.filter((e) => e.section === key);
      return {
        key,
        title,
        paragraphs: claims.length
          ? claims.map((e) => e.paragraph)
          : [key === 'context' && cutoff ? '未取得可用于整月达标评价的完整期间。' : fallbacks[key]],
        paragraphSourceIds: claims.length ? claims.map((e) => e.sourceIds) : [[]],
        sourceIds: [...new Set(claims.flatMap((e) => e.sourceIds))],
      };
    }),
    risks: [],
    actions: actions.map((e, i) => ({
      priority: i === 0 ? '建议优先' : '建议跟进',
      action: e.action,
      owner: '建议待确认',
      deadline: '建议待确认',
      sourceIds: e.sourceIds,
    })),
    historyReview: (f.history || []).map((h) => ({
      historySourceId: h.sourceId,
      status: '待核实',
      assessment: '本期尚缺独立的办理回执，可与原记录逐项核查。',
      evidenceSourceIds: [],
    })),
  };
  if (!f.metrics['roster.current']?.sourceIds?.length)
    raw.risks.push({
      level: '待核实',
      title: '学员留存的资料缺口',
      reason: fallbacks.roster,
      sourceIds: [],
    });
  return {
    raw,
    audit: {
      protocol,
      highlights: highlights.map((e) => e.id),
      actions: actions.map((e) => e.id),
      rejected,
      bindings: ordered.map(({ id, section, metricIds, sourceIds }) => ({
        id,
        section,
        metricIds,
        sourceIds,
      })),
    },
  };
}
module.exports = { protocol, selectionRequest, resolveSelection, databaseObservation };
