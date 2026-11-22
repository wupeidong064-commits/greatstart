import { describe, expect, it } from 'vitest';
import { crossPeriodQuery, historicalSumCards, renderPeriodSum } from '../src/services/aiCrossPeriodQuery';
import { previousClassStandings, renderClassStandings } from '../src/services/aiClassStandings';
import { orderMetricIntent } from '../src/services/aiWorkbenchPolicy';
import type { Evidence } from '../src/services/aiTools';

const windows = [
  { start: '2026-11-02', end: '2026-11-08' },
  { start: '2026-11-09', end: '2026-11-15' },
  { start: '2026-11-16', end: '2026-11-22' },
];
const cards = windows.map(timeRange => ({
  tool: 'signup_renewal', timeRange, filters: {}, rows: [], error: null,
}));
const scope = { id: 'class-a', name: '数学应用研习班' };
const ctx = { today: '2026-11-22', recent: [cards[2]], history: () => cards, findClasses: async () => [] };

describe('cross-period dialogue', () => {
  it('routes a single dated sales total without a comparison and preserves entity-specific questions', () => {
    for (const q of ['2026-11-02到2026-11-08这一周成单多少？','11月2日至8日成交多少笔、多少钱？']) {
      expect(orderMetricIntent(q,ctx.today)?.tools).toEqual([{ name:'signup_renewal',
        params:{startDate:windows[0].start,endDate:windows[0].end} }]);
    }
    expect(orderMetricIntent('周老师11月2日至8日个人成单多少？',ctx.today)).toBeUndefined();
  });
  it('recovers the three requested periods from older comparison answers without including implicit baselines', async () => {
    const before = {start:'2026-10-26',end:'2026-11-01'};
    const rows = windows.flatMap((period,i) => {
      const comparison = i ? windows[i-1] : before;
      return [
        {role:'user',status:'complete',content:period.start+'到'+period.end+'这一周成单多少？',usageJson:null,evidenceJson:null},
        {role:'assistant',status:'complete',content:'',usageJson:{operatingAnswer:{calendar:{asOfDate:ctx.today,observation:period,comparison}}},
          evidenceJson:[{...cards[i],tool:'weekly_comparison'},...(i ? [] : [cards[0],{...cards[0],timeRange:before}])]},
      ];
    });
    const history = () => historicalSumCards(rows);
    const q = await crossPeriodQuery('日期最晚的两周合计成交额，先确认再算。',{...ctx,history});
    expect(q?.pending?.candidates.map(w=>w.start)).toEqual(windows.map(w=>w.start));
    expect(q?.pending?.proposal?.map(w=>w.start)).toEqual(windows.slice(1).map(w=>w.start));
  });
  it('chooses an explicit pair before history and preserves the requested attendance scope on both tools', async () => {
    const result = await crossPeriodQuery('只合计数学应用研习班2026年11月2日至8日和11月16日至22日的实到人次。',
      { ...ctx, findClasses: async () => [scope] });
    expect(result?.intent.tools).toEqual([windows[0], windows[2]].map(w => ({
      name: 'class_attendance', params: { classId: scope.id, startDate: w.start, endDate: w.end },
    })));
  });
  it('waits for agreement, accepts a different choice and carries the pending scope and metric', async () => {
    const r = await crossPeriodQuery('数学应用研习班最早查的两周实到合计，先确认再算。',
      { ...ctx, findClasses: async () => [scope] });
    expect(r?.intent.tools).toBeUndefined();
    expect(r?.pending?.proposal?.map(w=>w.start)).toEqual(windows.slice(0,2).map(w=>w.start));
    const confirm = await crossPeriodQuery('好的，确认。', { ...ctx, pending:r!.pending });
    expect(confirm?.completed?.scope).toEqual(scope);
    const alt = await crossPeriodQuery('我选第一项与第三项吧！', { ...ctx, pending:r!.pending });
    expect(alt?.completed?.windows.map(w=>w.start)).toEqual([windows[0].start, windows[2].start]);
    expect(alt?.completed?.metric).toBe('attendance');
  });
  it.each(['改选第二个和第三个。','不，还是按第二和第三个期间算吧。','直接用第二个和最后一个就好'])(
    'lets the user replace a suggested pair using %s', async q => {
      const proposal = await crossPeriodQuery('最早查过的两周合计成交额，先确认再算。',ctx);
      const replacement = await crossPeriodQuery(q, {...ctx, pending: proposal!.pending});
      expect(replacement?.completed?.windows.map(w => w.start)).toEqual(windows.slice(1).map(w => w.start));
    });
  it('preserves the question on an invalid choice and does not reuse it for a different topic', async () => {
    const r = await crossPeriodQuery('两周合计多少？先让我选。', ctx);
    const pending = (await crossPeriodQuery('就选第一和第四个吧', { ...ctx, pending:r!.pending }))?.pending;
    expect(pending?.candidates).toHaveLength(3);
    expect(await crossPeriodQuery('我换个问题，林沐辰还剩几节课？', { ...ctx, pending })).toBeUndefined();
    expect((await crossPeriodQuery('就选第一和第三个吧', ctx))?.intent.reply).toContain('没有待选');
  });
  it('keeps selected dates on a metric change and removes class scope only when the user requests that', async () => {
    const r = await crossPeriodQuery('数学应用研习班最早查的两周实到合计', { ...ctx, findClasses: async () => [scope] });
    const next = await crossPeriodQuery('那成交额呢？', { ...ctx, completed:r!.completed });
    expect(next?.intent.reply).toContain('按该班级');
    const all = await crossPeriodQuery('换成全机构出勤率呢？', { ...ctx, completed:r!.completed });
    expect(all?.completed?.scope).toBeUndefined();
    const receipts = await crossPeriodQuery('刚才那两周的实收金额呢？', { ...ctx, completed:all!.completed });
    expect(receipts?.intent.tools?.map(t=>t.name)).toEqual(['weekly_report_data','weekly_report_data']);
  });
  it('clarifies unknown or conflicting scopes without broadening the query', async () => {
    expect((await crossPeriodQuery('只算不存在的班，两周实到合计多少？',ctx))?.intent.tools).toBeUndefined();
    const conflicting = cards.slice(0,2).map((card,i)=>({...card,tool:'class_attendance',filters:{classId:'id'+i}}));
    expect((await crossPeriodQuery('这两周实到合计多少？',{...ctx,recent:[conflicting[1]],history:()=>conflicting}))?.intent.reply).toContain('不同的班级范围');
  });
  it('keeps single-period totals on the original route and rejects impossible dates', async () => {
    expect(await crossPeriodQuery('2026年11月9日至15日成单一共多少钱？',ctx)).toBeUndefined();
    expect((await crossPeriodQuery('合计2026年11月31日和2026年12月1日两期成交额',ctx))?.intent.reply).toMatch(/日期|天数/);
  });
  it('checks scope and date against the executed evidence and sums money in cents', async () => {
    const state = (await crossPeriodQuery('日期最早的两周合计成交多少？',ctx))!.completed!;
    const evidence = cards.slice(0,2).map((c,i)=>({...c,totals:{金额合计:i ? 0.2 : 0.1}})) as unknown as Evidence[];
    expect(renderPeriodSum(state,evidence)).toContain('合计 ¥0.3');
    expect(renderPeriodSum(state,[evidence[1], evidence[0]])).toContain('无法合计');
    expect(renderPeriodSum(state,[{...evidence[0],filters:{classId:'other'}},evidence[1]])).toContain('无法合计');
  });
});

describe('class standings after a drill-down', () => {
  const card = { ...cards[0], tool:'class_attendance', rows:[
    {name:'甲班', 实到:100, 应到:101}, {name:'乙班', 实到:99, 应到:100},
    {name:'丙班', 实到:200, 应到:202}, {name:'丁班', 实到:0, 应到:0},
  ] } as unknown as Evidence;
  it('keeps the discussed period for a group confirmation, and leaves an explicitly changed date or teacher to its own query', () => {
    expect(previousClassStandings('还是那些并列第一的班吗？',[card])).toEqual(card.timeRange);
    expect(previousClassStandings('上个月哪些班并列第一？',[card])).toBeUndefined();
    expect(previousClassStandings('那张老师的班排第一吗？',[card])).toBeUndefined();
  });
  it('excludes zero denominators and distinguishes ties using exact ratios', () => {
    const result = renderClassStandings(card);
    expect(result).toContain('2 个班');
    expect(result).toContain('甲班'); expect(result).toContain('丙班');
    expect(result).not.toContain('乙班'); expect(result).not.toContain('丁班');
  });
});
