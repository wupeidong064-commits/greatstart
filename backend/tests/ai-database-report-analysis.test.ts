import { describe,expect,it } from 'vitest';
const { prepareDatabase,verifyDatabasePlan,prepare }=require('../src/services/reportNarrative.cjs');
const { buildReportFacts }=require('../src/services/reportFacts.cjs');
const { enrichFacts }=require('../src/services/reportQuality.cjs');
function sample(kind:string,start:string,end:string) {
 const source=(kind:string,payload:object)=>({kind,payload,source_label:'测试校区',status:'confirmed_fact',period_label:start+'~'+end});
 const matrix={应到:{校区:3,合计:3},实到:{校区:1,合计:1},总消课金额:{校区:120,合计:120}};
 const raw=[source('report_cash_summary',{newCount:1,renewalCount:1,newSign:100,renewal:80,cash:{covered:true,income:180,refundsKnown:true,refunds:30,count:2,sourceCaliber:'confirmed_orders',byType:[{type:'新签',amount:100,count:1},{type:'续费',amount:80,count:1}]}}),source('source_coverage',{income:true}),source('cash_line',{date:start,dept:'新签',amount:100}),source('cash_line',{date:start,dept:'续费',amount:80}),source('weekly_summary',{caliber:'database_fifo',current:{sections:{总数据:matrix}}}),source('report_history',{title:'待核目标表'}),source('report_targets',{month:start.slice(0,7),newSign:90,renewal:100})];
 const f=enrichFacts(buildReportFacts(raw,{kind,periodStart:start,periodEnd:end}));
 f.databaseObservation=require('../src/services/reportDatabaseNarrative.cjs').databaseObservation(f,'2026-11-16');return f;
}
it('完整报告Excel明确机构和期间，并保持原经营指标',async()=>{
 const ExcelJS=require('exceljs');const {renderXlsx}=require('../src/services/reportPresentation.cjs');
 const f=sample('monthly','2026-10-01','2026-10-31');
 const wb=new ExcelJS.Workbook();await wb.xlsx.load(await renderXlsx(f,{}, {organizationName:'验收机构'}));
 const info=wb.getWorksheet('报告信息');expect(info.getCell('B2').value).toBe('验收机构');
 expect(info.getCell('B4').value).toBe('2026-10-01');expect(info.getCell('B5').value).toBe('2026-10-31');
 const values:any[]=[];wb.getWorksheet('经营总览').eachRow((r:any)=>values.push(r.values));
 expect(values.some(r=>r[1]===f.metrics['cash.income'].label&&r[2]===180)).toBe(true);
});
describe('数据库来源的正式报告引用协议',()=>{
 it.each([['daily','2026-10-01','2026-10-01'],['weekly','2026-10-01','2026-10-07'],['monthly','2026-10-01','2026-10-31']])('%s 使用登记指标和对应来源，覆盖所有章节且保留缺项', (kind,start,end)=>{
   const f=sample(kind,start,end);
   const result=verifyDatabasePlan({highlights:['netOrders','attendance'],actions:['renewal']},f);
   expect(result.verified).toBe(true);expect(result.reviewed).toBe(false);expect(result.quality.status).toBe('passed');
   expect(result.quality.selection.protocol).toBe('database-report-selections-v1');
   expect(result.sections).toHaveLength(8);expect(result.summary[0]).toContain('150.00元');expect(result.summary[1]).toContain('33%');
   expect(result.summary.every((s:string)=>s.includes('来源：'))).toBe(true);
   expect(result.sections.find((s:any)=>s.key==='roster').paragraphs.join('')).toContain('未取得');
   expect(result.historyReview[0].status).toBe('待核实');expect(result.actions[0].owner).toBe('建议待确认');
   const targets=result.sections.find((s:any)=>s.key==='context').paragraphs.join('');
   if(kind==='monthly'){expect(targets).toContain('超过已确认的月度目标90.00元');expect(targets).toContain('低于已确认的月度目标100.00元');}
   else expect(targets).toContain('未取得本期可直接对比的业务目标');
 });
 it('非法事实、自由文本、伪造行动均按项丢弃，其余选择仍需通过原检查',()=>{
   const f=sample('daily','2026-10-01','2026-10-01');
   const result=verifyDatabasePlan({highlights:['attendance','续费下降90%',{id:'netOrders',value:10000}],actions:['netOrders','已完成整改'],summary:['恶意替换事实']},f);
   expect(result.quality.selection.rejected).toHaveLength(3);expect(result.actions).toHaveLength(1);
   expect(JSON.stringify(result)).not.toMatch(/下降90|恶意替换|已完成整改|10000/);
   expect(()=>verifyDatabasePlan({highlights:['unchecked'],actions:['attendance']},f)).toThrow('没有有效');
 });
 it('缺失指标、单位不符及无效来源均不能生成该项事实',()=>{
   const f=sample('daily','2026-10-01','2026-10-01');
   for(const variant of [{value:null},{sourceIds:['foreign']},{unit:'笔'}]){
     const bad={...f,metrics:{...f.metrics,'lessons.rate':{...f.metrics['lessons.rate'],...variant}}};
     const result=verifyDatabasePlan({highlights:['attendance','netOrders'],actions:['attendance','netOrders']},bad);
     expect(result.quality.selection.highlights).toEqual(['netOrders']);expect(result.quality.selection.actions).toEqual(['netOrders']);
   }
 });
 it('模型只接收可选事实；报告范围、协议及快照区分缓存',()=>{
   const f=sample('daily','2026-10-01','2026-10-01'); f.coaches=[{name:'隐私姓名',sourceId:'S001',consumption:9}];
   const structured=prepareDatabase(f);expect(JSON.stringify(structured.body)).not.toContain('隐私姓名');
   expect(prepareDatabase({...f,snapshotDigest:'different'}).dataDigest).not.toEqual(structured.dataDigest);
   expect(prepare(f).dataDigest).not.toEqual(structured.dataDigest);
 });
});

it('受控行动可按唯一目录名称匹配；缺少有效行动保持未完成',()=>{
 const f=sample('daily','2026-10-01','2026-10-01');
 const n=verifyDatabasePlan({highlights:['attendance'],actions:['缺席跟进','缺席跟进！','任意自由文本']},f);
 expect(n.quality.selection.actions).toEqual(['attendance']);expect(n.quality.selection.rejected).toHaveLength(2);
 expect(()=>verifyDatabasePlan({highlights:['attendance'],actions:['随意行动']},f)).toThrow('没有有效的建议行动');
});
it('未结束月、未来月与缺价不评达标，未来生效目标不得比较',()=>{
 const {databaseObservation,selectionRequest}=require('../src/services/reportDatabaseNarrative.cjs');
 const {blocksFor}=require('../src/services/reportPresentation.cjs');
 const f=sample('monthly','2026-10-01','2026-10-31');
 for(const asOf of ['2026-09-30','2026-10-18','2026-10-31']){
   f.databaseObservation=databaseObservation(f,asOf);
   const n=verifyDatabasePlan({highlights:['attendance'],actions:['缺席跟进']},f);
   expect(n.summary[0]).toContain('查询截点为'+asOf);
   expect(selectionRequest(f).candidates.map((c:any)=>c.id)).not.toContain('signupTarget');
   const target=blocksFor(f,n).flatMap((b:any)=>b.tables).find((t:any)=>t.title==='目标与进度');
   expect(target.rows.every((r:any)=>r[2]===null)).toBe(true);
 }
 f.missing.push('期间有未登记价格的订单');
 expect(databaseObservation(f,'2026-11-16').monthlyTargetComparable).toBe(false);
 f.missing.pop();f.databaseObservation=databaseObservation(f,'2026-11-16');f.targets.effectiveDate='2026-11-01';
 expect(selectionRequest(f).candidates.map((c:any)=>c.id)).not.toContain('signupTarget');
});
