import { randomUUID } from 'crypto';
import type { AiIntent } from './aiIntent';
import type { Evidence, ToolContext } from './aiTools';
import { entityDisplayNames } from './aiOperatingFacts';
import { readTeachingPerformance } from './personnelStatisticsService';
import prisma from '../config/database';

const toolName = 'teacher_performance_ranking';
const metricLabels = { attendance: '出勤率', consumption: '实际课消金额', sales: '个人成单额', signup: '个人新招人数' } as const;
type Metric = keyof typeof metricLabels;

export function teacherRankingIntent(q: string): AiIntent | undefined {
  const minDirection = /最低|垫底|倒数|排在最后|排最后|谁最后|末位/.test(q);
  if (!/老师|教师|教练|出勤率|课消|成单额/.test(q) || !/最好|最佳|最强|谁第一|哪位.{0,12}第一|最高|最多|领先|最出色|最低|垫底|倒数|排在最后|排最后|谁最后|末位/.test(q)
    || /怎么评|如何评|薪资|工资|续费率|续费金额|续费笔数|续费单数|新签金额|体验课|授课场次|授课最多|上课最多|谁.{0,10}最差/.test(q)) return undefined;
  const metric: Metric = /成单|成交|销售额|销售业绩/.test(q) ? 'sales' : /课消|核销/.test(q) ? 'consumption'
    : /个人新招|新招人数|新签人数/.test(q) ? 'signup' : 'attendance';
  return { parsedOk: true, purpose: 'facts', subject: 'teacher', tools: [{ name: toolName, params: { metric, ...(minDirection ? { direction: 'min' } : {}) } }] };
}

type TeachingRow = Pick<Awaited<ReturnType<typeof readTeachingPerformance>>[number],
  'teacherId' | 'teacherName' | 'expectedAttendance' | 'actualAttendance' | 'actualConsumptionAmount' |
  'totalOrderAmount' | 'missingPriceCount' | 'personalNewRecruits' | 'unlinkedNewOrderCount'>;

export function rankTeachingRows(people: TeachingRow[], metric: Metric) {
  const labels = entityDisplayNames(people.map(p => ({ id: p.teacherId, name: p.teacherName })));
  const rows = people.map(p => {
    const rate = p.expectedAttendance ? 100 * p.actualAttendance / p.expectedAttendance : null;
    const sales = p.missingPriceCount ? null : p.totalOrderAmount;
    const signup = p.unlinkedNewOrderCount ? null : p.personalNewRecruits;
    const score = { attendance: rate, sales, consumption: p.actualConsumptionAmount, signup }[metric];
    return { teacherId: p.teacherId, 老师: labels.get(p.teacherId) || p.teacherName,
      应到: p.expectedAttendance, 实到: p.actualAttendance, 出勤率: rate === null ? null : Number(rate.toFixed(1)),
      实际课消金额: p.actualConsumptionAmount, 个人成单额: sales, 个人新招人数: signup, score };
  });
  return rows.filter(row => row.score !== null).sort((a, b) => b.score! - a.score! || b.应到 - a.应到 || a.老师.localeCompare(b.老师));
}

export async function teacherPerformanceRanking(ctx: ToolContext, params: Record<string, unknown>): Promise<Evidence> {
  const actor = ctx.personnelActor;
  if (!ctx.campusId || !actor || !['admin','manager'].includes(actor.role))
    throw new Error('仅当前机构管理人员可查看老师表现');
  const metric: Metric = params.metric === 'sales' || params.metric === 'consumption' || params.metric === 'signup' ? params.metric : 'attendance';
  const direction = params.direction === 'min' ? 'min' : 'max';
  const campus = { organizationId: ctx.organizationId, campusId: ctx.campusId };
  const period = { start: String(params.startDate), end: String(params.endDate) };
  let people: TeachingRow[] = await readTeachingPerformance({user:actor, query:{startDate:period.start, endDate:period.end}},campus);
  if (metric === 'sales') {
    // 个人成单额排名候选含销售岗等有业绩归属的人员（盲测场景：叶顾问）。
    const salesUsers = await prisma.user.findMany({
      where: { organizationId: ctx.organizationId, campusId: ctx.campusId, isPlatformAdmin: false, role: 'sales', isActive: true },
      select: { id: true, name: true },
    });
    const salesIds = salesUsers.map(u => u.id);
    const groups = await prisma.conversion.groupBy({
      by: ['salesId'],
      where: { organizationId: ctx.organizationId, approvalStatus: 'confirmed', conversionDate: { gte: period.start, lte: period.end }, salesId: { in: salesIds } },
      _count: { _all: true, price: true }, _sum: { price: true },
    });
    const bySales = new Map(groups.map(g => [g.salesId, g]));
    const extras = salesUsers.map(u => {
      const g = bySales.get(u.id);
      const amount = g?._sum.price ? Number(g._sum.price) : 0;
      const missing = g ? (g._count._all - (g._count.price ?? 0)) : 0;
      return {
        teacherId: u.id, teacherName: u.name || u.id,
        expectedAttendance: 0, actualAttendance: 0,
        actualConsumptionAmount: null,
        totalOrderAmount: missing ? null : amount,
        missingPriceCount: missing,
        personalNewRecruits: 0, unlinkedNewOrderCount: 0,
      } as unknown as TeachingRow;
    });
    const known = new Set(people.map(p => p.teacherId));
    people = [...people, ...extras.filter(r => !known.has(r.teacherId))];
  }
  const ranked = rankTeachingRows(people, metric);
  const scores = ranked.map(row => row.score).filter((v): v is number => typeof v === 'number');
  const target = direction === 'min' ? Math.min(...scores) : Math.max(...scores);
  const winners = ranked.filter(row => row.score === target).map(row => row.teacherId);
  const columns = ['老师','应到','实到','出勤率','实际课消金额','个人成单额','个人新招人数'].map(key => ({key, label:key}));
  const rows = ranked.map(({score: _score, ...row}) => row);
  return {
    evidenceId: randomUUID(), tool:toolName, title:'老师表现排名', unit:'', timeRange:period, generatedAt:new Date().toISOString(),
    filters:{ campusId:ctx.campusId, metric }, columns, rows,
    totals:{ 可比较老师数: ranked.length, 有效老师数: people.length, 首位老师数: winners.length },
    error:null, missing:ranked.length < people.length ? ['部分老师缺少该指标的可比较数据。'] : [],
    caliber:'出勤及课消按当前主责班级统计，个人成单额按订单业绩归属。',
    modelText:'',
  };
}

export function renderTeacherRanking(card: Evidence): string {
  const { filters, timeRange, rows, totals } = card;
  const period = '统计期间 ' + timeRange?.start + ' 至 ' + timeRange?.end + '。';
  if (!rows.length) return [period, '这个期间没有足够的老师数据，暂时无法排名。', ...card.missing].join('\n\n');
  const metric = filters.metric as Metric;
  const label = metricLabels[metric];
  const min = (filters as Record<string, unknown>).direction === 'min';
  const n = Number(totals.首位老师数) || 1;
  const winners = min ? rows.slice(Math.max(0, rows.length - n)) : rows.slice(0, n);
  const first = winners.map(r => r.老师).join('、');
  const suffix = metric === 'attendance' ? '%' : metric === 'signup' ? ' 人' : ' 元';
  const leading = winners.length === 1 ? '**' + first + '** 排第一' : '**' + first + '** 并列第一';
  const leadingMin = winners.length === 1 ? '**' + first + '** 排在最后' : '**' + first + '** 并列最后';
  const value = min ? winners[0][label] : rows[0][label];
  const conclusion = '按' + label + '看，' + (min ? leadingMin : leading) + '（' + value + suffix + '）。';
  const evidence = winners.slice(0, 3).map(row => {
    const parts = [];
    if (typeof row.出勤率 === 'number') parts.push('实到 ' + row.实到 + '／应到 ' + row.应到 + ' 人次，出勤率 ' + row.出勤率 + '%');
    if (typeof row.实际课消金额 === 'number') parts.push('实际课消 ¥' + row.实际课消金额.toLocaleString('zh-CN'));
    if ((metric === 'sales' || metric === 'signup') && typeof row.个人成单额 === 'number')
      parts.push('个人成单 ¥' + row.个人成单额.toLocaleString('zh-CN'));
    return '• ' + row.老师 + '：' + parts.join('，') + '。';
  });
  const next = min ? rows[rows.length - n - 1] : rows[winners.length];
  const comparison = next ? (min ? '往上一名是' + next.老师 + '（' + next[label] + suffix + '）。' : '下一位是' + next.老师 + '（' + next[label] + suffix + '）。') : '';
  return [conclusion, period, evidence.join('\n'), comparison, card.caliber, ...card.missing].filter(Boolean).join('\n\n');
}
