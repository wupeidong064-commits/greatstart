import { randomUUID } from 'crypto';
import type { AiIntent } from './aiIntent';
import type { Evidence, ToolContext } from './aiTools';
import { comparablePeriods, entityDisplayNames } from './aiOperatingFacts';
import { readTeachingPerformance } from './personnelStatisticsService';

const toolName = 'teacher_performance_comparison';
type Performance = Awaited<ReturnType<typeof readTeachingPerformance>>[number];

export function teacherComparisonIntent(question: string, previous: Evidence[]): AiIntent | undefined {
  const prior = previous.find(card => card.tool === toolName && !card.error);
  const asksReason = /为什么|原因|怎么回事/.test(question);
  const asksDecline = /下滑|下降|退步|变差|走低|少了|变低/.test(question);
  const known = prior?.rows.filter(row => typeof row.姓名 === 'string' && question.includes(row.姓名));
  const asksTeachers = /老师|教师|教练/.test(question) || Boolean(known?.length);
  if (/定义|口径|如何排查|怎么排查|一般|通常|绩效方案|目标|不查|不看数据|新签|成单|续费|招生|收入|利润/.test(question))
    return undefined;
  if (!(asksTeachers && asksDecline) && !(prior && asksReason && (asksTeachers || /^(那)?为什么[？?。\s]*$/.test(question))))
    return undefined;
  const named = known?.length === 1 ? String(known[0].姓名) : undefined;
  const shorthand = question.match(/(?:^|为什么|看看)([\p{Script=Han}]{1,3}(?:老师|教练))(?=为什么|的出勤率|的课消|下滑|下降)/u)?.[1];
  const name = named || (shorthand && !/哪些|哪位|哪个|每位|所有|我们|这些|一位|个别/.test(shorthand) ? shorthand : undefined);
  const priorMetric = prior?.filters.metric;
  const metric = /出勤|到课/.test(question) && !/课消/.test(question) ? 'attendance'
    : /课消/.test(question) && !/出勤|到课/.test(question) ? 'consumption'
    : asksReason && (priorMetric === 'attendance' || priorMetric === 'consumption') ? priorMetric : undefined;
  const params = { ...(name ? { teacherName: name } : {}),
    ...(metric ? { metric } : {}), ...(asksReason ? { breakdown: 'true' } : {}) };
  return { parsedOk: true, purpose: 'comparison', subject: 'teacher', tools: [{ name: toolName, params }] };
}

const difference = (current: number | null, prior: number | null) =>
  current === null || prior === null ? null : Number((current - prior).toFixed(2));

type TeachingMetrics = Pick<Performance, 'teacherId' | 'teacherName' | 'attendanceRate' | 'actualConsumptionAmount' | 'expectedAttendance' | 'actualAttendance'>;
export function teacherDeclines(current: TeachingMetrics[], previous: TeachingMetrics[], metric?: unknown) {
  const byTeacher = new Map(previous.map(row => [row.teacherId, row]));
  const names = entityDisplayNames(current.map(row => ({ id: row.teacherId, name: row.teacherName })));
  return current.flatMap(row => {
    const prior = byTeacher.get(row.teacherId);
    if (!prior) return [];
    const attendance = difference(row.attendanceRate, prior.attendanceRate);
    const consumption = difference(row.actualConsumptionAmount, prior.actualConsumptionAmount);
    if (!(metric !== 'consumption' && attendance !== null && attendance < 0)
      && !(metric !== 'attendance' && consumption !== null && consumption < 0)) return [];
    return [{ teacherId: row.teacherId, 姓名: row.teacherName, 老师: names.get(row.teacherId) || row.teacherName,
      上期应到: prior.expectedAttendance, 上期实到: prior.actualAttendance, 本期应到: row.expectedAttendance, 本期实到: row.actualAttendance,
      上期出勤率: prior.attendanceRate, 本期出勤率: row.attendanceRate, 出勤率变化: attendance,
      上期课消: prior.actualConsumptionAmount, 本期课消: row.actualConsumptionAmount, 课消变化: consumption }];
  });
}

export async function teacherPerformanceComparison(ctx: ToolContext, params: Record<string, unknown>): Promise<Evidence> {
  const actor = ctx.personnelActor;
  if (!ctx.campusId || !actor || !['admin', 'manager'].includes(actor.role))
    throw new Error('仅当前机构管理人员可查看老师比较');
  const campus = { organizationId: ctx.organizationId, campusId: ctx.campusId };
  const current = { start: String(params.startDate), end: String(params.endDate) };
  const previous = { start: String(params.comparisonStartDate), end: String(params.comparisonEndDate) };
  const filters = {
    campusId: ctx.campusId, previousStart: previous.start, previousEnd: previous.end,
    teacherName: params.teacherName, metric: params.metric, breakdown: params.breakdown,
  };
  const missing: string[] = [];
  const columns = ['老师', '上期应到', '上期实到', '本期应到', '本期实到', '上期出勤率', '本期出勤率', '出勤率变化', '上期课消', '本期课消', '课消变化'];
  let rows: Array<Record<string, unknown>> = [];
  let compared = 0;
  const lengthDays = (p: { start: string; end: string }) => Date.parse(p.end) - Date.parse(p.start) + 86400000;
  const nonOverlap = previous.end < current.start;
  const bothBounded = lengthDays(current) <= 40 * 86400000 && lengthDays(previous) <= 40 * 86400000;
  if (!comparablePeriods(current, previous)) {
    if (!(nonOverlap && bothBounded)) {
      missing.push('两个期间长度不同或相互重叠，无法判断下滑。请选择可比的两个期间。');
    } else {
      // 期间不等长但各自有界且不重叠（如 10月整月 vs 11月至今）：按各自期间实际数对齐，声明口径后作答。
      const wantBreakdown = params.breakdown === 'true';
      const read = (p: typeof current) => readTeachingPerformance({ user: actor, query: { startDate: p.start, endDate: p.end } }, campus, wantBreakdown);
      const [latest, baseline] = await Promise.all([read(current), read(previous)]);
      const selected = (list: Performance[]) => list.filter(t => !params.teacherName || t.teacherName === params.teacherName);
      const active = selected(latest);
      const prior = selected(baseline);
      compared = active.filter(row => prior.some(before => row.teacherId === before.teacherId &&
        (params.metric !== 'consumption' && row.attendanceRate !== null && before.attendanceRate !== null ||
          params.metric !== 'attendance' && row.actualConsumptionAmount !== null && before.actualConsumptionAmount !== null))).length;
      rows = teacherDeclines(active, prior, params.metric);
      missing.push('两个期间长度不同（' + Math.round(lengthDays(current)/86400000) + ' 天 vs ' + Math.round(lengthDays(previous)/86400000) + ' 天），已按各自期间实际数对齐说明；结论仅指示方向，不代表日均速率。');
    }
  } else {
    const wantBreakdown = params.breakdown === 'true';
    const read = (p: typeof current) => readTeachingPerformance({ user: actor, query: { startDate: p.start, endDate: p.end } }, campus, wantBreakdown);
    const [latest, baseline] = await Promise.all([read(current), read(previous)]);
    const selected = (list: Performance[]) => list.filter(t => !params.teacherName || t.teacherName === params.teacherName);
    const active = selected(latest);
    const prior = selected(baseline);
    compared = active.filter(row => prior.some(before => row.teacherId === before.teacherId &&
      (params.metric !== 'consumption' && row.attendanceRate !== null && before.attendanceRate !== null ||
        params.metric !== 'attendance' && row.actualConsumptionAmount !== null && before.actualConsumptionAmount !== null))).length;
    rows = teacherDeclines(active, prior, params.metric);
    if (params.teacherName && !active.length) missing.push('在当前范围没有找到这位老师，请核对姓名。');
    else if (!compared) missing.push('两个期间没有足够的可比数据。');
    if ((params.metric !== 'attendance') && [...active, ...prior].some(row => row.actualConsumptionAmount === null))
      missing.push('部分老师的课消金额缺少完整计价记录，无法判断该指标的升降。');
    if (wantBreakdown) {
      columns.push('班级与课次');
      rows = rows.map(row => {
        const currentClasses = active.find(t => t.teacherId === row.teacherId)?.classAttendance || [];
        const priorClasses = prior.find(t => t.teacherId === row.teacherId)?.classAttendance || [];
        const summary = currentClasses.flatMap(cls => {
          const before = priorClasses.find(t => t.classId === cls.classId);
          if (!before) return [];
          const priorPresent = before.sessions.reduce((n, s) => n + s.present, 0);
          const currentPresent = cls.sessions.reduce((n, s) => n + s.present, 0);
          const priorExpected = before.sessions.reduce((n, s) => n + s.expected, 0);
          const currentExpected = cls.sessions.reduce((n, s) => n + s.expected, 0);
          const rateDropped = priorExpected > 0 && currentExpected > 0 &&
            currentPresent * priorExpected < priorPresent * currentExpected;
          if (currentPresent >= priorPresent && !rateDropped) return [];
          const details = cls.sessions.filter(s => s.expected > s.present)
            .map(s => s.date + '实到' + s.present + '/' + s.expected).join('、');
          return [cls.name + ' 实到/应到 ' + priorPresent + '/' + priorExpected + ' → ' + currentPresent + '/' + currentExpected +
            (details ? '，本期缺勤课次 ' + details : '')];
        });
        return { ...row, 班级与课次: summary.join('。') || '未在可直接对照的班级中定位到实到或出勤率下降' };
      });
      if (rows.length) missing.push('课次记录能说明下降集中在哪些班级，实际缺勤原因仍需要回访核实。');
    }
  }
  const caliber = '沿用老师表现页，按当前主责班级计算出勤率及实际课消金额。出勤率差值为百分点，课消差值为元。';
  const title = '老师表现对比';
  return { evidenceId: randomUUID(), tool: toolName, title, unit: '', timeRange: current, generatedAt: new Date().toISOString(),
    filters, columns: columns.map(key => ({ key, label: key })), rows, totals: { 可比老师数: compared, 指标下降老师数: rows.length },
    caliber, missing, error: null, modelText: '' };
}

export function renderTeacherComparison(card: Evidence): string {
  const metric = card.filters.metric === 'attendance' ? '出勤率' : card.filters.metric === 'consumption' ? '实际课消' : '出勤率或实际课消';
  const total = card.totals.指标下降老师数;
  const labels = card.rows.map(row => row.老师).join('、');
  const bullets = card.rows.map(row => {
    const parts: string[] = [];
    if (card.filters.metric !== 'consumption' && typeof row.出勤率变化 === 'number' && row.出勤率变化 < 0)
      parts.push('出勤率 ' + row.上期出勤率 + '% → ' + row.本期出勤率 + '%，降 ' + Math.abs(row.出勤率变化) + ' 个百分点（实到 ' + row.上期实到 + '/' + row.上期应到 + ' → ' + row.本期实到 + '/' + row.本期应到 + ' 人次）');
    if (card.filters.metric !== 'attendance' && typeof row.课消变化 === 'number' && row.课消变化 < 0)
      parts.push('实际课消 ¥' + row.上期课消 + ' → ¥' + row.本期课消 + '，少 ¥' + Math.abs(row.课消变化));
    if (row.班级与课次) parts.push(String(row.班级与课次));
    return '- **' + row.老师 + '** ' + parts.join('。') + '。';
  });
  const displayed = typeof total === 'number' && total > card.rows.length
    ? labels + '等 ' + total + ' 位老师' : labels;
  const lead = card.totals.可比老师数 ? total ? '**' + displayed + '** 的' + metric + '出现下降。'
    : '有可比记录的老师中，这两个期间未发现' + metric + '下降。' : '暂时无法判断哪些老师的' + metric + '下降。';
  return [lead, card.filters.previousStart + ' 至 ' + card.filters.previousEnd + ' → ' + card.timeRange?.start + ' 至 ' + card.timeRange?.end + '。', bullets.join('\n'), ...card.missing].filter(Boolean).join('\n\n');
}
