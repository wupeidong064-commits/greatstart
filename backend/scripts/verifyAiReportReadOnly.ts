import { readFileSync } from 'fs';
Object.assign(process.env, JSON.parse(readFileSync(process.env.HOME + '/.local/share/greatstart-human-acceptance/current/runtime/env.private.json', 'utf8')));
process.env.AI_REPORTS_DIR = process.env.HOME + '/buzzer/greatstart/临时/ai-report-20261113';
async function main() {
  const { default: prisma } = await import('../src/config/database');
  const { AI_TOOLS } = await import('../src/services/aiTools');
  const { getCashflowSummary } = await import('../src/services/cashflowSummaryService');
  const orgs = await prisma.organization.findMany({select:{id:true,name:true}});
  for (const org of orgs) {
    const ctx = {organizationId: org.id, campusId: null, today:'2026-11-13'};
    const params={startDate:'2026-11-01',endDate:'2026-11-30'};
    const cash=await getCashflowSummary(ctx,params);
    if (!cash.totals.orderCount) continue;
    const raw=await prisma.conversion.groupBy({by:['approvalStatus'],where:{organizationId:org.id,conversionDate:{gte:params.startDate,lte:params.endDate}},_count:{_all:true},_sum:{price:true}});
    const get=(name:string)=>AI_TOOLS.find(x=>x.name===name)!.run(ctx,params);
    const [sign,flow,weekly]=await Promise.all([get('signup_renewal'),get('cost_and_income'),get('weekly_report_data')]);
    const assert=(v:boolean,msg:string)=>{if(!v)throw Error(org.name+': '+msg)};
    assert(sign.totals['新单数']===cash.newSignup.conversions,'signup count');
    assert(sign.totals['续费单数']===cash.renewal.count,'renew count');
    assert(sign.totals['金额合计']===cash.totals.grossAmount,'signup amount');
    assert(flow.totals['净成单额']===cash.totals.netAmount,'net');
    assert(weekly.totals['新签单']===cash.newSignup.conversions && weekly.totals['续费单']===cash.renewal.count,'weekly counts');
    assert(weekly.totals['总成单额']===cash.totals.grossAmount,'weekly gross');
    for (const k of ['新签单','续费单','新签金额','续费金额']) assert(Math.abs(weekly.rows.reduce((s,r)=>s+Number(r[k]||0),0)-Number(weekly.totals[k]))<0.01, 'row sum '+k);
    const service = await import('../src/services/reportFileService');
    const Excel = (await import('exceljs')).default;
    const oldFind = prisma.aiReportFile.findUnique, oldUpdate = prisma.aiReportFile.update;
    const taskId='readonly-evidence-check';
    (prisma.aiReportFile as any).findUnique = async () => ({ id: taskId, periodStart: params.startDate, periodEnd: params.endDate, paramsJson: {tool:'weekly_report_data'}, evidenceJson: [weekly] });
    (prisma.aiReportFile as any).update = async () => ({});
    try {
      const result = await service.generateReportFile(taskId);
      assert(result.status === 'ready', 'file generate '+result.error);
      const wb = new Excel.Workbook(); await wb.xlsx.readFile(process.env.AI_REPORTS_DIR + '/' + taskId + '.xlsx');
      const sheet=wb.getWorksheet('经营汇总')!;
      const val=(name:string)=>{let found:any;sheet.eachRow(r=>{if(r.getCell(1).value===name)found=r.getCell(2).value});return found};
      assert(val('总成单额')===cash.totals.grossAmount,'file gross');
      assert(val('已通过退费金额')===cash.refund.amount,'file refund');
      assert(val('净成单额')===cash.totals.netAmount,'file net');
      assert(val('新签单')===cash.newSignup.conversions && val('续费单')===cash.renewal.count,'file counts');
    } finally { (prisma.aiReportFile as any).findUnique=oldFind; (prisma.aiReportFile as any).update=oldUpdate; }
    console.log(JSON.stringify({fileVerified:true,organization:org.name,period:params,raw:raw.map(x=>({status:x.approvalStatus,count:x._count._all,amount:Number(x._sum.price||0)})),cash:cash.totals,refund:cash.refund.amount,signup:sign.totals,flow:flow.totals,weekly:weekly.totals,unassigned:weekly.rows.find(r=>r['班级']==='未分班')||null,passed:true}));
  }
  await prisma.$disconnect();
}
main().catch(e=>{console.error(e.message);process.exitCode=1});
