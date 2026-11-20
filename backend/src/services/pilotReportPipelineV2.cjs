'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto'),pg=require('../../node_modules/pg');
const {buildReportFacts}=require('./reportFacts.cjs');
const {getNarrative}=require('./reportNarrative.cjs');
const {enrichFacts,localNarrative}=require('./reportQuality.cjs');
const {renderHtml,renderDocx,renderXlsx}=require('./reportPresentation.cjs');
const ROOT=path.resolve(process.env.AI_WORKBENCH_RUNTIME_DIR||path.join(process.cwd(),'storage/ai-runtime'));
async function runPilotReportPipeline(taskId, options={}) {
 if(!/^[a-f\d-]{36}$/.test(taskId))throw Error('报告任务编号无效');
 const env=process.env;if(!env.DATABASE_URL||!env.AI_EXPECTED_DATABASE)throw Error('运营报告环境未配置');
 const db=new pg.Client({connectionString:env.DATABASE_URL});await db.connect();await db.query("SET TIME ZONE 'UTC'");
 try {
  if((await db.query('SELECT current_database() d')).rows[0].d!==env.AI_EXPECTED_DATABASE)throw Error('独立数据库身份不符');
  const progress=(n,label)=>db.query('UPDATE org_pilot_report_tasks SET progress=$2,progress_label=$3,updated_at=now() WHERE id=$1',[taskId,n,label]);
  await progress(5,'冻结期间数据');
  await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  let task,facts,organizationName;
  try {
   task=(await db.query('SELECT * FROM org_pilot_report_tasks WHERE id=$1',[taskId])).rows[0];if(!task)throw Error('报告任务不存在');
   let rows=Array.isArray(options.sourceContexts)?options.sourceContexts:(await db.query('SELECT id,kind,period_label,status,payload,source_label FROM org_report_contexts WHERE organization_id=$1 AND (campus_id IS NULL OR campus_id=$2) AND (kind NOT IN (\'report_targets\',\'target_confirm_income\') OR campus_id IS NOT DISTINCT FROM $2) ORDER BY kind,period_label,source_label,id',[task.organization_id,task.campus_id])).rows;
   if(['uploads','database'].includes(options.sourceKind)){const configured=(await db.query('SELECT kind,period_label,status,payload,source_label FROM org_report_contexts WHERE organization_id=$1 AND (campus_id IS NULL OR campus_id=$2) AND (kind<>$4 OR campus_id IS NOT DISTINCT FROM $2) AND kind IN ($3,$4,$5) AND status=$6 ORDER BY created_at DESC',[task.organization_id,task.campus_id,'report_brand','report_targets','report_history','confirmed_fact'])).rows;rows=[...rows,...configured];}
   organizationName=(await db.query('SELECT name FROM organizations WHERE id=$1',[task.organization_id])).rows[0]?.name||'机构';
   const brand=rows.find(r=>r.kind==='report_brand'&&r.status==='confirmed_fact')?.payload?.displayName;
   if(typeof brand==='string'&&brand.trim())organizationName=brand.trim();
   facts=buildReportFacts(rows,{kind:task.kind,periodStart:task.period_start,periodEnd:task.period_end,snapshotDate:task.snapshot_date});
   facts.organizationId=task.organization_id;facts.campusId=task.campus_id;
   facts.displayAliases=options.displayAliases||{};for(const v of [...(facts.lessons?.venues||[]),...(facts.comparison?.venues||[])])if(facts.displayAliases[v.venue])v.venue=facts.displayAliases[v.venue];
   if(options.sourceKind==='database'){
    const asOf=options.businessAsOf||new Date(Date.now()+8*3600000).toISOString().slice(0,10);
    facts.databaseObservation=require('./reportDatabaseNarrative.cjs').databaseObservation(facts,asOf);
    if(facts.databaseObservation.note)facts.missing.push(facts.databaseObservation.note);
   }
   if(options.strictQuality)enrichFacts(facts);
   if(facts.databaseObservation && !facts.databaseObservation.monthlyTargetComparable){
    for(const id of ['target.newSignProgress','target.renewalProgress'])delete facts.metrics[id];
   }
   facts.importReceipts=options.receiptIds||[];
   const coverageRows=rows.filter(r=>r.kind==='source_coverage').map(r=>r.payload);const coverage=coverageRows.length?{expense:coverageRows.some(c=>c.expense),issues:[...new Set(coverageRows.flatMap(c=>c.issues||[]))]}:null;
   if(coverage){facts.missing.push(...(coverage.issues||[]));if(!coverage.expense){facts.cash.expenses=null;facts.cash.net=null;for(const k of ['cash.expense','cash.net'])facts.metrics[k].value=null;}facts.importedTables=rows.filter(r=>r.kind==='source_rows').map(r=>({title:r.source_label+' / '+r.payload._prov.sheet,headers:r.payload.headers,rows:r.payload.rows.map(r=>r.values)}));}

   if(!['uploads','database'].includes(options.sourceKind) && facts.cash.covered && task.kind!=='monthly'){
    const q=(await db.query('SELECT COUNT(*)::int n,COALESCE(SUM(price),0)::numeric amount FROM conversions WHERE "organizationId"=$1 AND "approvalStatus"=$2 AND "conversionDate">=$3 AND "conversionDate"<=$4',[task.organization_id,'confirmed',facts.period.start,facts.period.end])).rows[0];
    facts.checks.push({name:'原文件期间收入与已导入成单',expected:facts.cash.income,actual:Number(q.amount),pass:Math.abs(facts.cash.income-Number(q.amount))<.011&&facts.cash.count===q.n,sourceIds:[...new Set(facts.income.map(r=>r.sourceId))]});
   }
   await db.query('COMMIT');
  }catch(e){await db.query('ROLLBACK');throw e;}
  if(facts.checks.some(c=>!c.pass))throw Error('期间数据核对存在差异，已停止生成，请先核查来源与导入完整性');
  const frozen=JSON.stringify(facts),factHash=crypto.createHash('sha256').update(frozen).digest('hex');
  await progress(35,'核算完成，生成经营分析');
  let narrative;try{narrative=await getNarrative(facts,{strictQuality:Boolean(options.strictQuality),sourceKind:options.sourceKind,signal:options.signal});}catch(e){if(!options.strictQuality)throw e;narrative=localNarrative(facts,[String(e.message)]);} 
  const content={meta:{taskId,version:2,kind:task.kind,orgId:task.organization_id,generatedAt:new Date().toISOString(),provider:narrative.physicalCallId||narrative.verified?'ark':'local',model:narrative.model,analysisComplete:Boolean(narrative.verified),humanAccepted:false,analysisStage:narrative.stage||'model_generated',sourceKind:options.sourceKind||'contexts',quality:narrative.quality||null,factHash},period:{start:facts.period.start,end:facts.period.end,snapshot:facts.roster?.snapshot||null},facts,narrative,reconResults:facts.checks.map(c=>({name:c.name,expect:c.expected,actual:c.actual,pass:c.pass})),limitations:facts.missing,versions:[{v:2,factHash,analysisDigest:narrative.digest}]};
  await progress(75,'生成完整正文和附件');
  const presentationOptions={organizationName};
  const files={};
  const buffers={html:Buffer.from(renderHtml(facts,narrative,presentationOptions)),docx:renderDocx(facts,narrative,presentationOptions),xlsx:await renderXlsx(facts,narrative,presentationOptions)};
  const dir=path.join(ROOT,'reports/pilot');fs.mkdirSync(dir,{recursive:true,mode:0o700});
  for(const [format,buffer]of Object.entries(buffers)){
   const filename=path.join(dir,taskId+'.'+format);if(fs.existsSync(filename))throw Error('任务已有报告文件，不覆盖历史版本');
   fs.writeFileSync(filename,buffer,{mode:0o600,flag:'wx'});files[format]={path:filename,bytes:buffer.length,sha256:crypto.createHash('sha256').update(buffer).digest('hex')};
  }
  content.files=files;
  await db.query('BEGIN');
  await db.query('UPDATE org_pilot_report_tasks SET status=$2,progress=100,progress_label=$3,content=$4,versions=$5,updated_at=now() WHERE id=$1',[taskId,'ready',narrative.verified?'文件已生成，待人工验收':'业务数据核算稿，分析待确认',JSON.stringify(content),JSON.stringify(content.versions)]);
  let captureUsage=false;
  if(narrative.physicalCallId){await db.query('SELECT pg_advisory_xact_lock(hashtext($1))',[narrative.physicalCallId]);captureUsage=!(await db.query('SELECT id FROM ai_task_bills WHERE "organizationId"=$1 AND "usageJson"->>\'supplierCallId\'=$2 LIMIT 1',[task.organization_id,narrative.physicalCallId])).rowCount;}
  const usage={model:narrative.model||'local-deterministic',provider:narrative.physicalCallId||narrative.verified?'ark':'local',usage:captureUsage?narrative.usage||null:null,supplierCallId:narrative.physicalCallId||null,supplierCallCount:captureUsage?1:0,cacheHit:narrative.cacheHit,actualSupplierCost:null,note:narrative.physicalCallId?'真实回执只关联计量一次；实际抵扣及扣款另核':'无供应商调用，基础核算稿'};
  const recorded=captureUsage&&narrative.usage;usage.knownUsage=recorded?{promptTokens:recorded.prompt_tokens,completionTokens:recorded.completion_tokens}:{promptTokens:0,completionTokens:0};usage.usageComplete=!captureUsage||Boolean(recorded&&Number.isSafeInteger(recorded.prompt_tokens)&&Number.isSafeInteger(recorded.completion_tokens));usage.synthetic=false;usage.calls=captureUsage?[{id:narrative.physicalCallId,phase:'operating_report',requestedModel:narrative.model,actualModel:narrative.model,provider:'ark',status:usage.usageComplete?'complete':'failed',usage:recorded?{promptTokens:recorded.prompt_tokens,completionTokens:recorded.completion_tokens}:null,synthetic:false}]:[];
  await db.query('INSERT INTO ai_task_bills (id,"accountId","organizationId","campusId","userId","taskType",status,"reservedMicros","settledMicros","usageJson","conversationId","createdAt","settledAt") VALUES ($1,(SELECT id FROM ai_credit_accounts WHERE "organizationId"=$2 AND "campusId" IS NOT DISTINCT FROM $7 LIMIT 1),$2,$7,$3,$4,$5,0,0,$6,NULL,now(),now())',[crypto.randomUUID(),task.organization_id,task.created_by_id,'file','settled',JSON.stringify(usage),task.campus_id]);
  await db.query('COMMIT');
  return {taskId,factHash,analysisComplete:narrative.verified,files};
 }finally{await db.end();}
}
module.exports={runPilotReportPipeline};
