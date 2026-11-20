'use strict';
// Deterministic business claims. No sample-specific names, amounts, periods or prose overrides.
function groundNarrative(raw,facts){
 const value=JSON.parse(JSON.stringify(raw)),repairs=[];
 const reference=id=>'{{'+id+'}}';
 const money=m=>m&&typeof m.value==='number';
 const fullMonth=facts.period.kind==='monthly';
 const newProgress=facts.metrics['target.newSignProgress'],renewProgress=facts.metrics['target.renewalProgress'];
 const targetSentence=()=>`新签收款${reference('sales.new')}，对应月目标完成率${reference('target.newSignProgress')}，${facts.metrics['sales.new'].value>=facts.targets.newSign?'已达标':'尚未达标'}；续费收款${reference('sales.renewal')}，对应月目标完成率${reference('target.renewalProgress')}，${facts.metrics['sales.renewal'].value>=facts.targets.renewal?'已达标':'尚未达标'}`;
 function transform(text,field){
  let s=text;
  const change=(next,rule)=>{if(next!==s){repairs.push({rule,field,before:s,after:next});s=next;}};
  // Joint status claims are recomputed from corresponding monthly targets, never borrowed from another metric.
  if(fullMonth&&money(newProgress)&&money(renewProgress)&&/新签|新报/.test(s)&&/续费/.test(s)){
   const bothUnder=/(?:新签|新报)(?:与|和|及)续费(?:收款|收入|金额)?(?:均|都)(?:未达[^，。；]*目标|低于[^，。；]*目标)/;
   if(bothUnder.test(s)&&(newProgress.value>=100||renewProgress.value>=100))change(s.replace(bothUnder,targetSentence()),'monthly_target_status_from_facts');
   const twoDigits=/(?:两类业务(?:规模)?(?:较上月)?(?:均)?出现两位数下滑|两类业务(?:规模)?较上月均出现两位数下滑)/;
   if(twoDigits.test(s)&&money(facts.metrics['sales.newSignDeltaPct'])&&money(facts.metrics['sales.renewalDeltaPct']))change(s.replace(twoDigits,`新签与续费收款较上月分别变化${reference('sales.newSignDeltaPct')}和${reference('sales.renewalDeltaPct')}`),'replace_vague_change_band_with_exact_metrics');
  }
  if(fullMonth)for(const [key,id,label]of [['newSign','sales.new','新签'],['renewal','sales.renewal','续费']]){const actual=facts.metrics[id]?.value,goal=facts.targets[key];if(typeof actual==='number'&&typeof goal==='number'&&goal>0){const achieved=actual>=goal,pattern=achieved?new RegExp('(?:未达(?:到)?|低于)(?:对应|月度|本月)?'+label+'(?:收款|收入|金额)?目标','g'):new RegExp('已达(?:到)?(?:对应|月度|本月)?'+label+'(?:收款|收入|金额)?目标','g');change(s.replace(pattern,(achieved?'已达到':'尚未达到')+'月度'+label+'目标'),'individual_target_status_from_facts');}}
  if(fullMonth&&money(newProgress)&&money(renewProgress)&&/新签(?:与|和|及)?续费(?:双|均|都)?下滑且未达目标/.test(s)){const under=[['新签',newProgress],['续费',renewProgress]].filter(([,m])=>m.value<100).map(([label])=>label);change(s.replace(/新签(?:与|和|及)?续费(?:双|均|都)?下滑且未达目标/,'新签与续费收款下降，'+(under.length?under.join('及')+'未达标':'月目标均已达标')),'joint_risk_title_target_status_from_facts');}
  if(/sales\.renewalDeltaPct/.test(s)&&/留存端走弱/.test(s))change(s.replace(/留存端走弱/,'收款规模下降不能直接等同留存率下降'+(money(facts.metrics['retention.previousRate'])&&money(facts.metrics['retention.rateDelta'])?`；续费率由${reference('retention.previousRate')}变为${reference('retention.rate')}，变化${reference('retention.rateDelta')}`:'')),'cash_change_does_not_prove_retention_change');
  change(s.replace(/不续费学员的流失原因/g,'不续费学员的未续费原因'),'nonrenewal_not_confirmed_churn');
  if(/分别下降/.test(s)&&/DeltaPct/.test(s))change(s.replace('分别下降','分别变化'),'signed_multi_metric_change');
  change(s.replace(/已按\{\{diary\.renewalGroups\}\}个教练分组/g,'已整理为{{diary.renewalGroups}}教练名单'),'diary_group_unit_from_metric');
  change(s.replace(/次日已排期体验课\{\{diary\.experienceNextDayRows\}\}(?:条)?/g,'主管原文所列次日体验跟进{{diary.experienceNextDayRows}}，不等同已实际到场'),'diary_schedule_is_source_followup');
  if(/暂不能填列/.test(s))change(s.replace(/\{\{([\w.]+)\}\}/g,(m,id)=>facts.metrics[id]?.value===null?facts.metrics[id].label:m),'missing_metric_labels_remain_readable');
  if(money(facts.metrics['cash.fileIncome'])&&money(facts.metrics['cash.fileCount']))change(s.replace(/财务原文件中有\{\{cash\.monthToDate\}\}元、\{\{cash\.count\}\}笔以上的覆盖记录/,'财务原文件覆盖{{cash.fileIncome}}、{{cash.fileCount}}'),'file_coverage_separate_from_period_count');
  for(const [from,to]of Object.entries(facts.displayAliases||{}).sort((a,b)=>b[0].length-a[0].length))change(s.split(from).join(to),'resolve_source_column_heading');
  // Bind the count to a uniquely named cash category, including when the model miscopies the numeral.
  for(let i=0;i<facts.cash.byType.length;i++){
   const type=facts.cash.byType[i].type,id='cash.byType.'+i+'.count';if(!facts.metrics[id])continue;
   const escaped=String(type).replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),pattern=new RegExp('('+escaped+'\\s*)(?:\\d+(?:\\.\\d+)?|[一二三四五六七八九十两]+)\\s*笔','g');
   change(s.replace(pattern,(_,label)=>label+reference(id)),'cash_category_count_from_facts');
  }
  // Source self-reports stay self-reports; they never replace institution-wide attendance.
  if(/主管日报|单馆|自述|原文/.test(s)&&/出勤/.test(s)){
   const candidates=Object.values(facts.metrics).filter(m=>m.id.endsWith('.reportedAttendance')&&typeof m.value==='number');
   if(candidates.length===1){const m=candidates[0];change(s.replace(/出勤(?:率)?\s*\d+(?:\.\d+)?\s*%/, '出勤率'+reference(m.id)),'diary_self_report_rate_from_source');}
  }
  // An untyped per-person plan number cannot be silently promoted to a count of completed leads.
  if(/地推|线索/.test(s)&&/每人/.test(s)){
   change(s.replace(/每人(?:的)?(?:目标)?(?:新增)?(?:线索)?\s*\d+\s*(?:个|条)(?:线索)?(?:的目标)?/g,field.startsWith('actions')?'个人计划目标':'个人计划目标需逐人核对'),'untyped_plan_quantity_kept_as_plan');
  }
  return s;
 }
 value.summary=(value.summary||[]).map((s,i)=>transform(s,'summary['+i+']'));
 for(const [i,section]of(value.sections||[]).entries())section.paragraphs=(section.paragraphs||[]).map((s,j)=>transform(s,'sections['+i+'].paragraphs['+j+']'));
 for(const [i,r]of(value.risks||[]).entries()){r.title=transform(r.title,'risks['+i+'].title');r.reason=transform(r.reason,'risks['+i+'].reason');}
 for(const [i,a]of(value.actions||[]).entries())a.action=transform(a.action,'actions['+i+'].action');
 return {output:value,repairs};
}
module.exports={groundNarrative};
