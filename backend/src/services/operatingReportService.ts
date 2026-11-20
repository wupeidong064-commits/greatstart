import {businessToday} from './aiOperatingPlan';
import {reportDatabaseSource} from './reportDatabaseSource';
import fs from 'fs';
import path from 'path';
import {createHash,randomUUID} from 'crypto';
import prisma from '../config/database';
import {ApiError} from '../middleware/errorHandler';
import {ownedUpload,bindReportImport,UPLOAD_DIR} from './aiUploadService';
import type {ReportFileOwner} from './reportFileService';
import {resolveBusinessCalendar, isCalendarOnlyFollowup} from './aiBusinessCalendar';
import {runPilotReportPipeline,validateReportRequest} from './pilotReportPipeline';
const {reportAdviceNotice,stripReportAdviceNotice}=require('./reportQuality.cjs');
const importer=require('./reportImport.cjs') as {importUploads:(uploads:any[],request:any,options:any)=>any};
const ROOT=path.resolve(UPLOAD_DIR,'../ai-report-imports');
const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
const same=(a:ReportFileOwner,b:ReportFileOwner)=>a.userId===b.userId&&a.organizationId===b.organizationId&&a.campusId===b.campusId;
export function reportRequest(text: string, today: string, previous?: {kind?: string; start?: string; end?: string}) {
  const kind = /日报|日度报告/.test(text) ? 'daily' : /月报|月度.*报告|(?:\d{1,2}月|上个月|上月|本月|这个月).*?(?:经营|运营|分析).*?报告/.test(text) ? 'monthly'
    : /周报|周度.*报告|经营报告|运营报告/.test(text) ? 'weekly' : undefined;
  const formatOnly = /^(?:请|麻烦|帮我)?(?:把|将)?(?:刚才的?|上次的?|这份|这张|这个)?(?:报告|结果)?(?:导出|下载|生成|做成|改为|改成)(?:为|成)?(?:网页|文件|表格|文档|Word|Excel|HTML|DOCX|XLSX)?[。！!？?]*$/i.test(text.replace(/\s/g,''));
  if (!kind && !(previous?.kind && (formatOnly || isCalendarOnlyFollowup(text)))) return null;
  const reportKind = kind || previous?.kind;
  const calendar = resolveBusinessCalendar({question:text,today});
  if (calendar.clarification) return {needsPeriod:true,kind:reportKind,error:calendar.clarification};
  if (calendar.comparison || calendar.target)
    return {needsPeriod:true,kind:reportKind,error:'一份运营报告需要一个明确的事实统计期间'};
  let period = calendar.explicit ? calendar.observation : undefined;
  if (!period && previous?.start && previous.end) period={start:previous.start,end:previous.end};
  if (!period) return {needsPeriod:true,kind:reportKind};
  // A single named opening day fixes the seven-day weekly report window.
  if (calendar.singleDayMention && reportKind === 'weekly')
    period={start:period.start,end:new Date(Date.parse(period.start)+6*86400000).toISOString().slice(0,10)};
  try {
    return validateReportRequest({kind:reportKind,periodStart:period.start,periodEnd:period.end});
  } catch(error) {
    return {needsPeriod:true,kind:reportKind,error:error instanceof Error ? error.message : '报告日期无效'};
  }
}
function idsOf(body:any){const ids=body?.uploadIds;if(!Array.isArray(ids)||!ids.length||ids.length>12||ids.some(id=>typeof id!=='string'))throw new ApiError('请选择1至12份本人运营资料',400,'REPORT_IMPORT_FILES');return [...new Set(ids)]as string[];}
export function previewReportImport(owner:ReportFileOwner,body:any){
 const ids=idsOf(body),uploads=ids.map(id=>ownedUpload(owner,id));if(uploads.reduce((n,u)=>n+u.rowCount,0)>12000)throw new ApiError('本批资料超过12000行，请按业务期间拆分',413,'REPORT_IMPORT_LIMIT');
 const request={kind:body?.kind,periodStart:body?.periodStart,periodEnd:body?.periodEnd};
 let parsed;try{parsed=importer.importUploads(uploads,request,{coverageStart:body?.coverageStart,coverageEnd:body?.coverageEnd,snapshotDate:body?.snapshotDate,mappings:body?.mappings});}catch(e:any){throw new ApiError(e.message,400,'REPORT_IMPORT_INVALID');}
 const digest=hash(JSON.stringify({owner,sourceHashes:uploads.map(u=>u.hash),parsed}));
 const {contexts,...publicData}=parsed;return {publicData:{...publicData,digest,sourceFiles:uploads.map(u=>({id:u.id,fileName:u.fileName,sha256:u.hash,rows:u.rowCount}))},parsed,digest,uploads,ids};
}
export function confirmReportImport(owner:ReportFileOwner,body:any){
 const p=previewReportImport(owner,body);if(body.digest!==p.digest)throw new ApiError('预览后资料或映射已变化，请重新核对',409,'REPORT_IMPORT_CHANGED');
 if(p.parsed.errors.length)throw new ApiError(p.parsed.errors.join('；'),400,'REPORT_IMPORT_UNRESOLVED');
 if(!p.parsed.importedRows)throw new ApiError('尚未识别有效报告资料，请完成字段映射',400,'REPORT_IMPORT_EMPTY');
 const id=randomUUID(),record={id,owner,createdAt:new Date().toISOString(),digest:p.digest,uploads:p.uploads.map(u=>({id:u.id,hash:u.hash})),...p.parsed};
 fs.mkdirSync(ROOT,{recursive:true,mode:0o700});fs.writeFileSync(path.join(ROOT,id+'.json'),JSON.stringify(record),{mode:0o600,flag:'wx'});
 const reportImport={receiptId:id,digest:p.digest,confirmed:true,rows:p.parsed.importedRows,coverage:p.parsed.coverage,issues:p.parsed.issues};
 return {receipt:reportImport,uploads:bindReportImport(owner,p.ids,reportImport)};
}
function receipt(owner:ReportFileOwner,id:string){
 if(!/^[a-f0-9-]{36}$/.test(id))throw new ApiError('导入回执无效',404,'REPORT_IMPORT_NOT_FOUND');let r:any;try{r=JSON.parse(fs.readFileSync(path.join(ROOT,id+'.json'),'utf8'));}catch{throw new ApiError('导入回执不存在',404,'REPORT_IMPORT_NOT_FOUND');}
 if(!same(owner,r.owner))throw new ApiError('无权使用该导入回执',404,'REPORT_IMPORT_NOT_FOUND');
 for(const source of r.uploads){const u=ownedUpload(owner,source.id);if(u.hash!==source.hash)throw new ApiError('导入源文件已经变化，请重新确认',409,'REPORT_IMPORT_CHANGED');}return r;
}
function resolveVenueAliases(owner:ReportFileOwner,receipts:any[]) {
 const aliases:Record<string,string>={};
 for(const receipt of receipts)for(const c of receipt.contexts.filter((c:any)=>c.kind==='monthly_summary')){
  const p=c.payload?._prov;if(!p?.uploadId)continue;const u=ownedUpload(owner,p.uploadId);if(u.hash!==p.sha256)continue;
  const table=u.tables.find(t=>t.name===p.sheet),rows=table?.sourceRows||[],header=rows.find(r=>String(r.values[0])==='月份'&&r.values.slice(1,5).every(v=>typeof v==='string'));
  const source=rows.find(r=>r.row===p.row);
  for(const v of c.payload.lessons?.venues||[]){const m=String(v.venue).match(/^来源列(\d+)$/);if(!m||!header||!source)continue;const col=Number(m[1])-1;if(typeof source.values[col]!=='number'||Math.abs(Number(source.values[col])-v.consumption)>.00001)continue;const label=String(header.values[col]||'').replace(/(?:目标|金额)?[（(]元[）)]/g,'').replace(/目标$/,'').trim();if(label)aliases[v.venue]=label;}
 }
 return aliases;
}
export async function createOperatingReport(owner:ReportFileOwner,request:any,uploadIds:string[],requestId:string,previousReceiptIds:string[]=[],signal?:AbortSignal){
 const sources=uploadIds.map(id=>ownedUpload(owner,id));
 if(sources.some(u=>!u.reportImport?.confirmed))throw new ApiError('请先在附件区“用于运营报告”中核对资料覆盖日期与字段映射，再确认导入',400,'REPORT_IMPORT_REQUIRED');
 const receiptIds=[...new Set(sources.length?sources.map(u=>String(u.reportImport!.receiptId)):previousReceiptIds)];
 const receipts=receiptIds.map(id=>receipt(owner,id));
 // Never fall back to an unrelated organization-wide fixture when uploads are selected.
 const uniqueContexts=new Map<string,any>();for(const c of receipts.flatMap(r=>r.contexts)){const p=c.payload?._prov||{};const key=JSON.stringify([c.kind,c.period_label,p.sha256,p.sheet,p.row]);if(!uniqueContexts.has(key))uniqueContexts.set(key,c);}const sourceContexts=receipts.length?[...uniqueContexts.values()]:await reportDatabaseSource(owner,request);
 const old=await prisma.orgPilotReportTask.findUnique({where:{requestId:'chat:'+requestId}});if(old){if(old.createdById!==owner.userId||old.organizationId!==owner.organizationId||old.campusId!==owner.campusId)throw new ApiError('请求编号冲突',409,'REQUEST_ID_CONFLICT');return old;}
 const task=await prisma.orgPilotReportTask.create({data:{id:randomUUID(),organizationId:owner.organizationId,createdById:owner.userId,campusId:owner.campusId,kind:request.kind,periodStart:request.start,periodEnd:request.end,requestId:'chat:'+requestId,status:'processing',snapshotDate:receipts.find(r=>r.snapshotDate)?.snapshotDate||null,versions:[]}});
 try{await runPilotReportPipeline(task.id,{sourceContexts,strictQuality:true,signal,businessAsOf:businessToday(),displayAliases:resolveVenueAliases(owner,receipts),sourceKind:receipts.length?'uploads':'database',receiptIds});}catch(e:any){await prisma.orgPilotReportTask.update({where:{id:task.id},data:{status:'failed',error:String(e.message).slice(0,300)}});throw e;}
 return prisma.orgPilotReportTask.findUniqueOrThrow({where:{id:task.id}});
}
export function reportCards(task:any){const c=task.content as any,name=({weekly:'运营周报',daily:'运营日报',monthly:'月度运营报告'}as any)[task.kind];
 return [{tool:'operating_report',evidenceId:'report-'+task.id,reportId:task.id,title:name,timeRange:c.period,columns:[],rows:[],totals:{分析状态:c.meta.analysisComplete?'分析已生成':'核算稿，分析待验证'},previewUrl:'/api/ai/pilot-reports/'+task.id},...['html','docx','xlsx'].map(format=>({tool:'report_file',type:'file',evidenceId:task.id+'-'+format,fileId:task.id+'-'+format,title:name,status:'ready',timeRange:c.period,columns:[],rows:[],fileName:name+'_'+c.period.start+'_'+c.period.end+'.'+format,downloadUrl:'/api/ai/pilot-reports/'+task.id+'/download?format='+format,canRetry:false}))];}
export function reportAnswer(task:any){const c=task.content as any,n=c.narrative;return `${c.period.start} 至 ${c.period.end}的${({weekly:'周报',daily:'日报',monthly:'月报'}as any)[task.kind]}已生成。\n\n${n.summary.map(stripReportAdviceNotice).filter(Boolean).join('\n\n')}\n\n${c.meta.analysisComplete?'完整正文、业务表和来源已保存，可在下方直接阅读，并下载网页、Word和Excel。':'当前为业务数据核算稿，经营分析待确认。下方可查看正文及明细。'}${reportAdviceNotice(n)?'\n\n'+reportAdviceNotice(n):''}`;}
