import type { Evidence } from './aiTools';
import type { DialogueQuery } from './aiDialogueQuery';

type Measure = 'orders' | 'cash' | 'attendance' | 'trials' | 'conversion' | 'prospects';
export type EvidenceView = {
  source: 'overview' | 'experience';
  measures: Measure[];
  action?: boolean;
  reason?: boolean;
  limit?: number;
};

export function evidenceView(question: string, previous?: DialogueQuery): EvidenceView | undefined {
  if (
    /老师|顾问|学科|按班|哪个班|某个班|指定班|同比|环比|去年同期|利润|净额|退费|工资|导出|差额|为什么下降|出勤率低于/.test(
      question
    )
  )
    return;
  const management = /建议|值得追|下一步|晨会/.test(question);
  if (
    previous?.view?.source === 'overview' &&
    /刚才|这条|这项|太长|三行|简短|依据/.test(question) &&
    /建议|依据|三行|简短|重写/.test(question) &&
    !/换|改[为成]|取消|不用|不[想要]/.test(question)
  )
    return { ...previous.view, reason: /依据|支持|证据/.test(question) };
  const trial =
    /体验课|试听课/.test(question) ||
    (previous?.source === 'experience' && /到场|转[成化]|成单|分母|跟进/.test(question));
  if (trial && !/介绍|方法|排课|费用|取消|付款|课消|原因|为什么|怎么提高/.test(question)) {
    if (
      /到场/.test(question) &&
      /没成单|未成单|没转|未转/.test(question) &&
      /人|谁|名单|跟进/.test(question)
    ) {
      const m = question.match(/([1-9一二两三四五六七八九十])\s*(?:个|位|人)/);
      return {
        source: 'experience',
        measures: ['prospects'],
        limit: m
          ? Number(m[1]) ||
            ({ 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 }[
              m[1]
            ] ??
              10)
          : 20,
      };
    }
    if (/比例|转化率|成单率|分母/.test(question))
      return { source: 'experience', measures: ['conversion'] };
    if (/登记|到场/.test(question) && /成单/.test(question))
      return { source: 'experience', measures: ['trials'] };
    return;
  }
  if (
    /体验|试听|班|学员|学生|排名|课消|课时|含义|意思|如何理解|什么是|区别|假设|同比|环比|哪周/.test(
      question
    )
  )
    return;
  const measures: Measure[] = [];
  if (/成交|成单|签单/.test(question)) measures.push('orders');
  if (/实收|到账/.test(question)) measures.push('cash');
  if (/出勤|实到|到课/.test(question)) measures.push('attendance');
  if (measures.length >= 2) return { source: 'overview', measures, action: management };
  return undefined;
}

const fmt = (v: number) => new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 }).format(v);
function number(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw Error('unavailable');
  return value;
}
export function presentMeasures(v: EvidenceView, e: Evidence): string {
  const t = e.totals;
  if (!e.timeRange || e.error) throw Error('unavailable');
  const period = e.timeRange.start + ' 至 ' + e.timeRange.end + '，';
  if (v.source === 'experience') {
    const arrived = number(t.到场数),
      n = number(t.成单数);
    if (v.measures.includes('prospects')) {
      const names = e.rows
        .filter((r) => r.状态 === '未成单' && typeof r.姓名 === 'string')
        .map((r) => String(r.姓名));
      const list = [...new Set(names)].slice(0, v.limit);
      return (
        period +
        (list.length
          ? '到场尚未成单，可跟进' + list.join('、') + '。'
          : arrived > n
            ? '到场数高于成单数，已返回明细中没有可核实名单。'
            : '没有到场未成单的记录。')
      );
    }
    if (v.measures.includes('conversion'))
      return (
        period +
        '到场 ' +
        arrived +
        ' 人次，其中成单 ' +
        n +
        ' 人次。' +
        (arrived
          ? '以实际到场人次为分母，转化率 ' + fmt((100 * n) / arrived) + '%。'
          : '分母为零，无法计算到场转化率。')
      );
    return (
      period +
      '登记 ' +
      number(t.登记数) +
      ' 人次，到场 ' +
      arrived +
      ' 人次，成单 ' +
      n +
      ' 人次。'
    );
  }
  const lines: string[] = [];
  if (v.measures.includes('orders')) lines.push('确认成交 ' + fmt(number(t.总成单额)) + ' 元');
  if (v.measures.includes('cash')) lines.push('实收 ' + fmt(number(t.实收)) + ' 元');
  if (v.measures.includes('attendance'))
    lines.push('实到 ' + number(t.实到) + '／应到 ' + number(t.应到) + ' 人次');
  let action = '';
  if (v.action && v.measures.includes('attendance')) {
    const eligible = e.rows
      .filter(
        (r) =>
          typeof r.班级 === 'string' &&
          typeof r.应到 === 'number' &&
          typeof r.实到 === 'number' &&
          r.应到 > r.实到
      )
      .sort((a, b) => number(b.应到) - number(b.实到) - (number(a.应到) - number(a.实到)));
    const r = eligible[0];
    if (r)
      action =
        (v.reason ? '依据是' : '建议先核对') +
        r.班级 +
        '的缺勤记录：该班实到 ' +
        r.实到 +
        '／应到 ' +
        r.应到 +
        ' 人次，缺 ' +
        (number(r.应到) - number(r.实到)) +
        ' 人次。';
  }
  return v.reason && action
    ? period + action
    : period + lines.join('，') + '。' + (action ? '\n' + action : '');
}

export function selectAttendanceClass(question: string, cards: Evidence[]): string | undefined {
  if (!/班/.test(question) || !/先看|优先|举一个|挑一个|选一个/.test(question)) return;
  const card = cards.find((c) => c.tool === 'low_attendance_classes' && !c.error && c.timeRange);
  if (!card?.timeRange) return;
  const rows = card.rows.filter(
    (r) =>
      typeof r.班级 === 'string' &&
      typeof r.实到 === 'number' &&
      typeof r.应到 === 'number' &&
      r.应到 > 0
  );
  const row = rows.sort(
    (a, b) => number(a.实到) / number(a.应到) - number(b.实到) / number(b.应到)
  )[0];
  if (!row) return;
  return (
    card.timeRange.start +
    ' 至 ' +
    card.timeRange.end +
    '，建议先看' +
    row.班级 +
    '。已核对的低出勤班中，该班出勤率最低，实到 ' +
    row.实到 +
    '／应到 ' +
    row.应到 +
    ' 人次，出勤率 ' +
    fmt((100 * number(row.实到)) / number(row.应到)) +
    '%。可先核对缺勤课次并回访。'
  );
}
