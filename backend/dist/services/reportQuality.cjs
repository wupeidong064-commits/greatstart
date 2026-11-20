'use strict';
const {iso,r2}=require('./reportFacts.cjs');
function diaryFacts(f){
 const result=[];
 for(const log of f.daily){const lines=String(log.summary||'').split('\n').map(s=>s.trim()).filter(Boolean),groups=[],experience=[];let renewal=false;
  for(const line of lines){if(/续费.*名单.*整理|续费待跟进名单/.test(line)){renewal=true;continue;}if(renewal&&/^\d+[、.．]/.test(line))renewal=false;
   const group=line.match(/^([^：:]{2,24})[：:](.+)$/);if(renewal&&group&&/周[一二三四五六日天]/.test(group[2])){const n=(group[2].match(/周[一二三四五六日天]/g)||[]).length;groups.push({owner:group[1],count:n});}
   const dates=[...line.matchAll(/(?:^|\s)(\d{1,2})[./](\d{1,2})(?=\s|[.])/g)].map(m=>iso(f.period.end.slice(0,4)+'-'+m[1].padStart(2,'0')+'-'+m[2].padStart(2,'0'))).filter(Boolean);
   if(dates.length&&/\d{1,2}:\d{2}|体验/.test(line)){experience.push({date:dates.length===1?dates[0]:null,followupDate:dates[0],ambiguous:dates.length>1,historical:dates.some(d=>d<log.date),sourceId:log.sourceId});}
  }
  const rate=String(log.summary||'').match(/出勤(?:率)?[^\d\n]{0,8}(\d+(?:\.\d+)?)\s*%/);
  if(groups.length||experience.length||rate)result.push({sourceId:log.sourceId,reporter:log.reporter,date:log.date,reportedAttendance:rate?Number(rate[1]):null,renewalGroups:groups,renewalStudents:groups.reduce((n,g)=>n+g.count,0),experience,caliber:'主管原文列项，仅为名单或跟进记录；不代表实际到场、去重人数或已成单'});
 }
 return result;
}
function enrichFacts(f){
 const derived=diaryFacts(f);f.diaryFacts=derived;const add=(id,label,value,unit,sourceIds,description)=>f.metrics[id]={id,label,value,unit,sourceIds,description};
 for(const id of ['sales.new','sales.renewal'])if(f.metrics[id]?.value!==null&&!f.metrics[id]?.sourceIds?.length)f.metrics[id].sourceIds=[...f.metrics['cash.income'].sourceIds];
 if(typeof f.cash.fileIncome==='number')add('cash.fileIncome','源资料覆盖额',f.cash.fileIncome,'元',f.metrics['cash.income'].sourceIds,'来源资料原有覆盖范围，不冒充报告期间');if(typeof f.cash.fileCount==='number')add('cash.fileCount','源资料覆盖笔数',f.cash.fileCount,'笔',f.metrics['cash.count'].sourceIds,'未模拟明细');
 for(let i=0;i<f.cash.byType.length;i++){const r=f.cash.byType[i];add('cash.byType.'+i+'.count',r.type+'笔数',r.count,'笔',f.income.length?f.income.filter(row=>String(row.dept||'').split('-')[0]===r.type).map(row=>row.sourceId):f.metrics['cash.count'].sourceIds,'按本期逐笔流水分类，非名单人数');}
 for(const d of derived)if(d.reportedAttendance!==null)add('diary.'+d.sourceId+'.reportedAttendance','主管原文单馆出勤率（未独立核对）',d.reportedAttendance,'%', [d.sourceId],'只代表主管原文自述，不纳入全机构已核算课务');
 if(f.period.kind==='monthly')for(const [key,id]of [['newSign','sales.new'],['renewal','sales.renewal']]){const goal=f.targets[key],actual=f.metrics[id]?.value;if(typeof goal==='number'&&goal>0&&typeof actual==='number')add('target.'+key+'Progress',(key==='newSign'?'新签':'续费')+'月目标完成率',r2(actual/goal*100),'%',[...new Set([...(f.metrics[id]?.sourceIds||[]),...(f.targets.sourceIds||[]),...(f.metrics['cash.income']?.sourceIds||[])])],'本期为完整自然月时比较对应业务目标');}
 if(f.period.kind==='daily'){
  const lists=derived.filter(d=>d.renewalGroups.length);if(lists.length===1){const d=lists[0];add('diary.renewalGroups','日报续费名单教练分组数',d.renewalGroups.length,'组',[d.sourceId],d.caliber);add('diary.renewalStudents','日报续费名单列项数',d.renewalStudents,'条',[d.sourceId],d.caliber);}
  const diaries=derived.filter(d=>d.experience.length);if(diaries.length===1){const d=diaries[0],next=new Date(Date.parse(f.period.end)+86400000).toISOString().slice(0,10);add('diary.experienceFutureRows','日报所列未来体验跟进记录',d.experience.filter(r=>r.date&&r.date>f.period.end).length,'条',[d.sourceId],d.caliber);add('diary.experienceNextDayRows','日报所列次日体验跟进记录',d.experience.filter(r=>r.date===next).length,'条',[d.sourceId],d.caliber);}
 }
 return f;
}
// Check model prose before substitution. A number with a business unit must be a metric reference.
const INTERNAL_REPORT_TEXT=/system\s*prompt|系统提示词|意图解析|business_records|new_student_attendance|sourceIds\s*[:=]|factHash|usageJson|prompt_tokens|completion_tokens|strictQuality|analysisComplete|awaiting_model_validation|model_quality_blocked|真实模型|本地验证|服务端.*(?:生成|查询)|程序计算|质量门禁|冻结数据|\.private\.json|\/Users\/|"(?:summary|sections|sourceIds|verified|reviewed)"\s*:|只输出\s*JSON|你是.*(?:助手|分析师|解析器)/i;
function narrativeTexts(n={}){return [...(n.summary||[]),...(n.sections||[]).flatMap(s=>s.paragraphs||[]),...(n.risks||[]).flatMap(r=>[r.level,r.title,r.reason]),...(n.actions||[]).flatMap(a=>[a.priority,a.action,a.owner,a.deadline]),...(n.historyReview||[]).flatMap(r=>[r.status,r.assessment])].filter(s=>typeof s==='string');}
function assertPublicNarrative(n){if(narrativeTexts(n).some(s=>INTERNAL_REPORT_TEXT.test(s)))throw Error('经营分析包含内部运行信息，已停止导出');}
function checkRawNarrative(raw,facts){
 const issues=[],keys=['lessons','roster','coach','sales','renewal','cash','daily','context'];if(!raw||!Array.isArray(raw.sections))return ['缺少经营分析结构'];
 for(const key of keys)if(raw.sections.filter(s=>s.key===key).length!==1)issues.push('分析模块缺少或重复：'+key);
 if(facts.history?.length){const review=raw.historyReview||[];if(facts.history.some(h=>!review.some(r=>r.historySourceId===h.sourceId)))issues.push('历史事项复盘不完整');for(const r of review)if(/已完成|已执行|全部完成/.test(String(r.status))&&!facts.history.find(h=>h.sourceId===r.historySourceId&&h.verifiedComplete===true))issues.push('历史事项没有独立完成证据');}
 const sourceIds=new Set(facts.sources.map(s=>s.id));
 const scan=(s,refs=[])=>{if(typeof s!=='string'){issues.push('正文不是文本');return;}
  if(INTERNAL_REPORT_TEXT.test(s))issues.push('正文含内部运行信息');
  for(const m of s.matchAll(/\{\{([\w.]+)\}\}\s*(个百分点|人次|元|笔|条|%|人|名|位|组)/g)){const unit=facts.metrics[m[1]]?.unit;if(unit&&unit!==m[2]&&!(unit==='人'&&m[2]==='名'))issues.push('指标单位不匹配：'+m[1]);}
  let remaining=s.replace(/\{\{([\w.]+)\}\}/g,(_,id)=>{const m=facts.metrics[id];if(!m)issues.push('未知指标：'+id);else if(m.value===null||m.value===undefined){if(/为零|为0|没有|恶化|改善|下降|增长|最低/.test(s))issues.push('以缺失指标作确定性判断：'+id);}return '[指标]';});
  remaining=remaining.replace(/\d{4}-\d{2}-\d{2}|\d{1,2}月\d{1,2}日|S\d{3,5}/g,'');
  if(/(?:\d+(?:\.\d+)?|[零〇一二三四五六七八九十百千万两]+)\s*(?:元|人次|名|位|个|条|笔|场|组|%|个百分点|次)/.test(remaining))issues.push('正文有未经指标绑定的数量');
  for(const clause of s.split(/[。；;，,\n]|但|然而/))if(/预计.*(?:月底|达标)|达标概率|必然|已证实.*(?:流失|原因)/.test(clause)&&!/(?:不能|不得|不应|无法|不计算|不代表|不等于|不意味着)[^。；]*?(?:预计|达标|概率|必然|已证实)/.test(clause))issues.push('正文有未核实的预测或因果');
  if(/上周环比|较上周/.test(s)&&facts.comparison?.label&&!String(facts.comparison.label).includes(new Date(Date.parse(facts.period.start)-86400000).toISOString().slice(5)))issues.push('比较期不能直接称紧邻上周');
  if(refs.some(id=>!sourceIds.has(id)))issues.push('正文引用未知来源');
 };
 for(const s of raw.summary||[])scan(s);for(const s of raw.sections){for(const p of s.paragraphs||[])scan(p,s.sourceIds||[]);if(s.paragraphs?.length&&!s.sourceIds?.length&&!/缺失|未取得|未提供/.test(s.paragraphs.join('')))issues.push('实质分析缺少来源');}
 for(const r of raw.risks||[]){scan(r.title,r.sourceIds||[]);scan(r.reason,r.sourceIds||[]);}for(const a of raw.actions||[])scan(a.action,a.sourceIds||[]);
 return [...new Set(issues)];
}
function localNarrative(f,issues=[],stage='awaiting_model_validation'){
 const fmt=(id)=>{const m=f.metrics[id];return m?.value===null||m?.value===undefined?'未提供':Number(m.value).toLocaleString('zh-CN',{maximumFractionDigits:2})+m.unit;};
 const evidence=(s,ids)=>s+(ids.length?'（来源：'+ids.join('、')+'）':'');
 const cashIds=f.metrics['cash.income'].sourceIds,lessonIds=f.lessons?.sourceIds||[],summary=[evidence(`${f.metrics['cash.income'].label}${fmt('cash.income')}，${f.metrics['cash.count'].label}${fmt('cash.count')}。按所选业务期间计算，期间外流水独立保留。`,cashIds),f.lessons?evidence(`${f.metrics['lessons.consumption'].label}${fmt('lessons.consumption')}，出勤率${fmt('lessons.rate')}。比较与分组详见正文，资料缺失不补零。`,lessonIds):'未取得本期全机构课务资料，未按其他期间均摊。'];
 const paragraphs={lessons:f.lessons?[evidence(`应到${fmt('lessons.due')}，实到${fmt('lessons.actual')}；本期数据与比较期的业务日期分别列示。`,lessonIds)]:['本期课务资料缺失，暂不能判断出勤变化或教学产出。'],roster:['花名册按快照时点核算；移出记录先核对调班、更名与归档，再判断真实流失。'],coach:['完整人员数据保留原始空白。个人缺失值不能解释为零业绩，也不能仅凭金额判断教学质量。'],sales:[evidence(`${f.metrics['sales.new'].label}${fmt('sales.new')}，${f.metrics['sales.renewal'].label}${fmt('sales.renewal')}。金额与笔数、名单、漏斗分别核对。`,cashIds)],renewal:['待续费名单和跟进过程不等于实际到场或收款，须以相应业务回执核实。'],cash:['收款、确认收入、退费及所提供收支净额分别列示；成本或退费不完整时，不计算完整利润或净成单。'],daily:[],context:['历史事项保留原负责人和安排；计划、汇报自述与经核实结果分别记录，未见证据不认定未执行。']};
 for(const d of f.diaryFacts||[]){if(d.renewalGroups.length)paragraphs.daily.push(evidence(`主管原文续费名单按${d.renewalGroups.length}位教练分组，共${d.renewalStudents}条学员列项。这是待跟进名单，不是已完成续费。`,[d.sourceId]));if(d.experience.length){const future=d.experience.filter(r=>r.date&&r.date>f.period.end).length;paragraphs.daily.push(evidence(`原文识别到${future}条报告期后体验跟进记录。含多个日期的行保持待核，不算当期实际授课或转化。`,[d.sourceId]));}}
 if(!paragraphs.daily.length)paragraphs.daily=['主管工作记录和计划完整保留；没有取得的记录不推断成未执行。'];
 return {verified:false,reviewed:false,validationMode:'system_rules',stage,model:null,usage:null,cacheHit:false,summary,sections:Object.entries(paragraphs).map(([key,paragraphs])=>({key,title:key,paragraphs,sourceIds:[]})),risks:[{level:'待核实',title:'资料与分析边界',reason:'请核查资料完整性与来源差异，经营分析待确认。',sourceIds:[]}],actions:[],historyReview:[],quality:{status:'draft',issues,checks:['业务期间与来源分离','数量绑定指标','缺失不填零','完整导出','日报名单与结果分离']}};
}
const REPORT_ADVICE_NOTICE='AI 建议仅供参考。';
function stripReportAdviceNotice(value) {
 return typeof value==='string'?value.replace(/AI\s*建议仅供参考[。！!\.]?/gi,'').trim():value;
}
function reportAdviceNotice(n) {
 const advises=n?.actions?.some(a=>a.action)||
  [...(n?.summary||[]),...(n?.risks||[]).map(r=>r.reason),...(n?.sections||[]).flatMap(s=>s.paragraphs||[])].some(s=>/建议|请核查|可优先|应优先/.test(s));
 return advises?REPORT_ADVICE_NOTICE:'';
}
module.exports={reportAdviceNotice,stripReportAdviceNotice,enrichFacts,diaryFacts,checkRawNarrative,localNarrative,assertPublicNarrative};
