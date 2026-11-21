import { describe, expect, it, vi } from 'vitest';
import { buildOperatingSnapshot, compareOperatingFacts, comparablePeriods, renderOperatingFacts } from '../src/services/aiOperatingFacts';
import { validateToolPlan, type EvidenceCard } from '../src/services/aiTools';
import { teacherPerformance } from '../src/services/aiOperationalData';
import prisma from '../src/config/database';

const oct = {start:'2026-10-01',end:'2026-10-31'};
const sep = {start:'2026-09-01',end:'2026-09-30'};
const card = (overrides:Partial<EvidenceCard>={}):EvidenceCard=>({
  tool:'signup_renewal',title:'报名续费',evidenceId:'a',timeRange:oct,unit:'单',caliber:'按成单日',generatedAt:'2026-11-16T01:00:00Z',
  columns:[],rows:[],totals:{续费单数:21},filters:{organizationId:'org',campusId:'c'},missing:[],error:null,...overrides
});

describe('经营事实快照',()=>{
  it('按全量记录分布，满八条预览不限制核算',()=>{
    const rows = [0,0,0,0,0,50,50,50,75,75,75].map((rate,i)=>({studentId:i===10?'s0':'s'+i,classId:'c'+i,出勤率:rate}));
    const db=card({tool:'low_attendance_students',totals:{记录数:11,去重学员人数:10},rows});
    for (const records of [rows,[...rows].reverse()]) {
      const facts=buildOperatingSnapshot([{...db,rows:records}]).facts;
      expect(facts.find(f=>f.kind==='distribution')?.bins).toEqual([{rate:0,count:5},{rate:50,count:3},{rate:75,count:3}]);
      expect(renderOperatingFacts({version:'',facts})).toContain('去重学员人数：10人');
    }
    expect(buildOperatingSnapshot([{...db,missing:['仅显示前 8 条']}]).facts.some(f=>f.kind==='distribution')).toBe(false);
  });
  it('零分母、真实零与合计分母',()=>{
    for(const [due,present,value] of [[0,0,null],[10,0,0],[6,2,33]]) {
      const f=buildOperatingSnapshot([card({tool:'class_attendance',totals:{应到:due,实到:present,出勤率:90}})]).facts.find(f=>f.metric==='lessons.rate')!;
      expect(f.value).toBe(value);expect(f.denominator).toBe(due);
      expect(f.coverage).toBe(due===0?'zero_denominator':'complete');
    }
  });
  it('已持久化证据的字段顺序和模型预览不改变版本',()=>{
    const a=card();const b=Object.fromEntries(Object.entries(a).reverse());
    expect(buildOperatingSnapshot([a]).version).toBe(buildOperatingSnapshot([{...b,modelText:'another preview'} as unknown as EvidenceCard]).version);
    expect(buildOperatingSnapshot([a]).version).not.toBe(buildOperatingSnapshot([{...a,totals:{续费单数:22}}]).version);
  });
  it('失败保留合格来源，内部错误不显示',()=>{
    const body=renderOperatingFacts(buildOperatingSnapshot([card(),card({tool:'cost_and_income',error:'SQL exception with credentials'})]));
    expect(body).toContain('续费单数：21单');expect(body).toContain('成单与退费本次查询未完成');expect(body).not.toContain('SQL');
  });
  it('上传与系统保留各来源，名单截取只影响显示',()=>{
    const list=card({title:'上传的名单',tool:'uploaded_file',columns:[{key:'姓名',label:'姓名'}],rows:Array.from({length:22},(_,i)=>({姓名:'名字'+i})),totals:{记录数:22}});
    const body=renderOperatingFacts(buildOperatingSnapshot([list,card()]),{includeRows:true});
    expect(body).toContain('上传的名单');expect(body).toContain('前 20 条，共 22 条');expect(body).not.toContain('名字21');expect(body).toContain('报名续费');
  });
  it('跨教师、单位、指标、机构和不完整金额均拒绝比较',()=>{
    const current=buildOperatingSnapshot([card()]).facts[0];
    const prior={...current,id:'b',period:sep,value:0};
    expect(compareOperatingFacts(current,prior)).toMatchObject({delta:21,percent:null});
    for(const mismatch of [{entityId:'other'},{metric:'other'},{unit:'元'},{campusId:'new'},{scopeKey:'other org'},{coverage:'partial' as const}]) {
      expect(compareOperatingFacts(current,{...prior,...mismatch})).toBe(null);
    }
  });
  it('等长、整月可比，重叠或长短不同的非整月仅列原值',()=>{
    expect(comparablePeriods(oct,sep)).toBe(true);
    expect(comparablePeriods(oct,{...oct,end:'2026-10-12'})).toBe(false);
    expect(comparablePeriods(oct,{...sep,start:'2026-09-10'})).toBe(false);
  });
  it('指定环比日期必须成对且有效',()=>{
    const plan=(params:{[k:string]:string})=>validateToolPlan([{name:'weekly_comparison',params:{startDate:oct.start,endDate:oct.end,...params}}]);
    expect(plan({comparisonStartDate:sep.start}).errors.length).toBe(1);
    expect(plan({comparisonStartDate:sep.end,comparisonEndDate:sep.start}).errors.length).toBe(1);
    expect(plan({comparisonStartDate:sep.start,comparisonEndDate:sep.end}).errors).toEqual([]);
  });
  it('比较段凭原值重新计算差值与方向',()=>{
    const rows=[{指标:'出勤率',本期:33,上期:25,变化:12345},{指标:'续费单',本期:2,上期:0,环比百分比:999}];
    const body=renderOperatingFacts(buildOperatingSnapshot([card({tool:'weekly_comparison',rows,filters:{campusId:'c',previousStart:sep.start,previousEnd:sep.end}})]));
    expect(body).toContain('增加8个百分点');expect(body).toContain('增加2单（基期为零，无法计算增长百分比）');expect(body).not.toMatch(/12345|999/);
  });
  it('没有基准的续费笔数不评价高低',()=>{
    const body=renderOperatingFacts(buildOperatingSnapshot([card()]),{compare:true});
    expect(body).toContain('尚无同指标');expect(body).not.toMatch(/偏低|偏高/);
  });
});

it('实际授课教师与当前班级负责人分开，同名两人分别核算，缺归属场次不分摊',async()=>{
  const startTime=new Date('2026-10-13T02:00:00Z');
  const load=(rows:unknown[])=>({findMany:vi.fn().mockResolvedValue(rows)});
  const tx={ class:load([{id:'c1',teacherId:'t2',status:'active'}]),user:load([{id:'t1',name:'同名'},{id:'t2',name:'同名'}]),lessonLog:load([]),lessonAddReceipt:load([]),
    schedule:load(['t1','t1',null].map((teacherId,i)=>({id:'s'+i,classId:'c1',teacherId,startTime,endTime:startTime}))),
    enrollment:load([{classId:'c1',studentId:'kid',enrolledAt:new Date(0),endedAt:null,status:'active'}]),
    attendance:load([{classId:'c1',scheduleId:'s0',studentId:'kid',status:'present',isTemporary:false}]) };
  const transaction=vi.spyOn(prisma,'$transaction').mockImplementation(async (fn:any)=>fn(tx));
  try {
    const c=await teacherPerformance({organizationId:'org',campusId:'campus',today:'2026-11-16'},{startDate:oct.start,endDate:oct.end});
    expect(tx.schedule.findMany.mock.calls[0][0].where).toMatchObject({organizationId:'org',campusId:'campus',classId:{in:['c1']},status:'completed'});
    expect(c.totals).toMatchObject({实际授课场次:3,未归属授课场次:1,应到:3,实到:1,出勤率:33});
    expect(c.rows[0]).toMatchObject({teacherId:'t1',实际授课场次:2,当前负责班级数:0,出勤率:50});
    expect(c.rows[1]).toMatchObject({teacherId:'t2',实际授课场次:0,当前负责班级数:1,出勤率:null});
    const scoped=await teacherPerformance({organizationId:'org',campusId:'campus',today:'2026-11-16'},{startDate:oct.start,endDate:oct.end,teacherId:'t2'});
    expect(scoped.rows).toHaveLength(1);expect(scoped.totals).toMatchObject({实际授课场次:0,应到:0,实到:0});
    const rates=buildOperatingSnapshot([c]).facts.filter(f=>f.entityName && f.metric==='lessons.rate');
    expect(rates.map(f=>f.entityId)).toEqual(['t1','t2']);expect(rates[0].entityName).not.toBe(rates[1].entityName);
  } finally { transaction.mockRestore(); }
});

describe('已确认目标与报告指标',()=>{
  it('有目标才计算差额，零目标仍保留差额，月底前或缺价不给评价',async()=>{
    const {evaluateMonthlyTarget}=await import('../src/services/aiOperatingFacts');
    expect(evaluateMonthlyTarget(90,100,oct,'2026-11-16',true)).toMatchObject({difference:-10,percent:90});
    expect(evaluateMonthlyTarget(90,0,oct,'2026-11-16',true)).toMatchObject({difference:90,percent:null});
    for(const value of [null,'100',Infinity,-1]) expect(evaluateMonthlyTarget(90,value,oct,'2026-11-16',true).difference).toBe(null);
    expect(evaluateMonthlyTarget(90,100,oct,'2026-10-31',true).difference).toBe(null);
    expect(evaluateMonthlyTarget(90,100,oct,'2026-11-16',false).difference).toBe(null);
  });
  it('相同源值的正式报告与聊天使用相同指标、单位及出勤率精度',()=>{
    const {buildReportFacts}=require('../src/services/reportFacts.cjs');
    const period='2026-10-01~2026-10-01';
    const source=(kind:string,payload:object)=>({kind,payload,status:'confirmed_fact',source_label:'业务系统',period_label:period});
    const matrix={应到:{当前校区:3,合计:3},实到:{当前校区:1,合计:1},总消课金额:{当前校区:20,合计:20}};
    const report=buildReportFacts([source('report_cash_summary',{newCount:0,renewalCount:1,newSign:0,renewal:20,cash:{income:20,refunds:0,refundsKnown:true,count:1,sourceCaliber:'confirmed_orders'}}),source('source_coverage',{income:true}),source('cash_line',{date:'2026-10-01',dept:'续费',amount:20}),source('weekly_summary',{caliber:'database_fifo',current:{sections:{总数据:matrix}}})],{kind:'daily',periodStart:'2026-10-01',periodEnd:'2026-10-01'});
    const chat=buildOperatingSnapshot([card({totals:{应到:3,实到:1,出勤率:33,新单数:0,续费单数:1,新签金额:0,续费金额:20,已通过退费金额:0,净成单额:20}})]);
    for(const f of chat.facts) expect(report.metrics[f.metric]).toMatchObject({value:f.value,unit:f.unit});
  });
});

it('按学员稳定编号还原历史出勤，跨班及临时课合计，同名仍能比较',async()=>{
  const {studentAttendance}=await import('../src/services/aiOperationalData');
  const date=new Date('2026-10-12T02:00:00Z');
  const load=(rows:unknown[])=>({findMany:vi.fn().mockResolvedValue(rows)});
  const scope={organizationId:'org',campusId:'campus'};
  const tx={
    class:load([{id:'c1',name:'甲班'},{id:'c2',name:'乙班'}]),
    student:load([{id:'a',name:'同姓'},{id:'b',name:'同姓'},{id:'c',name:'同姓'}]),
    schedule:load(['c1','c2'].map((classId,i)=>({id:'s'+i,classId,startTime:date,endTime:date}))),
    enrollment:load(['a','b'].map(studentId=>({classId:'c1',studentId,enrolledAt:new Date(0),endedAt:null,status:'active'}))),
    attendance:load([{scheduleId:'s0',classId:'c1',studentId:'a',status:'present',isTemporary:false},
      {scheduleId:'s1',classId:'c2',studentId:'a',status:'late',isTemporary:true}]),
  };
  const txMock=vi.spyOn(prisma,'$transaction').mockImplementation(async(fn:any)=>fn(tx));
  try {
    const result=await studentAttendance({...scope,today:'2026-11-16'},{startDate:oct.start,endDate:oct.end,studentName:'同姓',ranking:'lowest_present'});
    expect(tx.student.findMany.mock.calls[0][0].where).toEqual({...scope,name:'同姓'});
    expect(tx.schedule.findMany.mock.calls[0][0].where.startTime).toEqual({gte:new Date('2026-10-01T00:00:00+08:00'),lt:new Date('2026-11-01T00:00:00+08:00')});
    expect(result.rows.map(r=>[r.studentId,r.应到,r.实到,r.出勤率])).toEqual([['b',1,0,0],['a',2,2,100],['c',0,0,null]]);
    expect(result.totals).toMatchObject({学员人数:3,应到:3,实到:2,实到最低学员人数:1});
    const snap=buildOperatingSnapshot([result]);
    expect(snap.facts.find(f=>f.kind==='comparison')?.refs).toEqual([result.evidenceId+'/b/实到']);
    expect(renderOperatingFacts(snap)).toContain('实到最低：同姓（甲班，编号尾号 b），实到 0人次');
  } finally { txMock.mockRestore(); }
});

describe('配置目标与续费率的工具入口',()=>{
  it('仅采用同校区、同月、已生效的目标，未配置项明确保留',async()=>{
    const cashflow=await import('../src/services/cashflowSummaryService');
    const {AI_TOOLS}=await import('../src/services/aiTools');
    const summary=vi.spyOn(cashflow,'getCashflowSummary').mockResolvedValue({scopeNotes:[],newSignup:{amount:80},renewal:{amount:50}} as any);
    const lookup=vi.spyOn(prisma.orgReportContext,'findMany').mockResolvedValue([
      {id:'next',sourceLabel:'待生效',payload:{month:'2026-10',newSign:1000,effectiveDate:'2026-11-01'}},
      {id:'active',sourceLabel:'校区月目标',payload:{month:'2026-10',newSign:100,effectiveDate:'2026-09-01'}},
    ] as any);
    try {
      const result=await AI_TOOLS.find(t=>t.name==='monthly_target_comparison')!.run({organizationId:'org',campusId:'campus',today:'2026-11-16'},{startDate:oct.start,endDate:oct.end});
      expect(lookup.mock.calls[0][0]?.where).toEqual({organizationId:'org',campusId:'campus',kind:'report_targets',status:'confirmed_fact',payload:{path:['month'],equals:'2026-10'}});
      expect(result.rows[0]).toMatchObject({实际金额:80,目标金额:100,差额:-20,目标完成率:80,目标记录:'active'});
      expect(result.rows[1]).toMatchObject({实际金额:50,目标金额:null,差额:null,目标完成率:null});
      expect(renderOperatingFacts(buildOperatingSnapshot([result]))).toContain('校区月目标');
    } finally {lookup.mockRestore();summary.mockRestore();}
  });
  it('当前待续费率、单数和用户给定百分比都不能代替历史到期续费率',async()=>{
    const cashflow=await import('../src/services/cashflowSummaryService');
    const {AI_TOOLS}=await import('../src/services/aiTools');
    const summary=vi.spyOn(cashflow,'getCashflowSummary').mockResolvedValue({renewal:{count:21,renewedStudents:10,renewalRate:80,totalEligible:13}} as any);
    try {
      const result=await AI_TOOLS.find(t=>t.name==='renewal_rate')!.run({organizationId:'org',campusId:'campus',today:'2026-11-16'},{startDate:oct.start,endDate:oct.end,userTargetPercent:80});
      const body=renderOperatingFacts(buildOperatingSnapshot([result]));
      expect(body).toContain('用户给定续费率目标：80%');expect(body).toContain('本期到期学员人数：缺少数据');expect(body).toContain('是否达标无法核定');
      expect(body).not.toContain('本期到期学员续费率：80%');expect(body).not.toContain('13人');
    } finally {summary.mockRestore();}
  });
});

it('同名优先标班级，编号尾号碰撞自动延长，内部编号不缩短',async()=>{
  const {entityDisplayNames}=await import('../src/services/aiOperatingFacts');
  const names=entityDisplayNames([{id:'long-code-1abcde',name:'老师',classes:['甲班']},{id:'long-code-2abcde',name:'老师',classes:['乙班']},{id:'third',name:'其他'}]);
  expect([...names.values()]).toEqual(['老师（甲班，编号尾号 1abcde）','老师（乙班，编号尾号 2abcde）','其他']);
});
