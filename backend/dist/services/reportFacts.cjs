'use strict';
const crypto=require('crypto');

// Only normalized, institution-scoped rows may enter this module. No I/O or model calls.
const r2 = v => Math.round((Number(v) + Number.EPSILON) * 100) / 100;
const sum = (rows, key) => r2(rows.reduce((s, r) => s + (Number.isFinite(Number(r[key])) ? Number(r[key]) : 0), 0));
const pct = (a, b) => b > 0 ? r2(a / b * 100) : null;
const cleanText=s=>String(s||'').replace(/<[^>]*>/g,'').replace(/o:p(?:\s[^>]*)?>/g,'').replace(/&nbsp;|\u00a0/g,' ').replace(/\r\n/g,'\n').replace(/\n[ \t]+/g,'\n').replace(/\n{3,}/g,'\n\n').trim();
function iso(value) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'number' && value > 20000) return new Date(Date.UTC(1899,11,30) + value * 86400000).toISOString().slice(0,10);
  const s = String(value || '').trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:$|[ T])/);
  if (m) { const d=m.slice(1).join('-'), date=new Date(d+'T00:00:00Z'); return Number.isFinite(date.getTime()) && date.toISOString().slice(0,10) === d ? d : null; }
  m=s.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})(?:$|\s)/);
  if (m) return iso(`${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`);
  m=s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (m) return iso(`${m[3].length===2?'20'+m[3]:m[3]}-${m[1].padStart(2,'0')}-${m[2].padStart(2,'0')}`);
  return null;
}
function range(label) {
  const m=String(label || '').match(/(\d{4}-\d{2}-\d{2})\s*[~～至]\s*(\d{4}-\d{2}-\d{2})/);
  return m ? [m[1],m[2]] : null;
}
function validateRequest(req) {
  const kind=req.kind || 'weekly', start=iso(req.periodStart), end=iso(req.periodEnd);
  if (!['daily','weekly','monthly'].includes(kind) || !start || !end || start>end) throw Error('报告类型或日期无效');
  const days=(Date.parse(end)-Date.parse(start))/86400000+1;
  if (kind==='daily' && days!==1) throw Error('日报只能选择一天');
  if (kind==='weekly' && days!==7) throw Error('周报须选择连续七天');
  if (kind==='monthly') {
    const d=new Date(end+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+1);
    if (!start.endsWith('-01') || !d.toISOString().slice(0,10).endsWith('-01') || start.slice(0,7)!==end.slice(0,7)) throw Error('月报须选择完整自然月');
  }
  if (days>31) throw Error('单份报告最长一个月');
  return {kind,start,end,days};
}
function buildReportFacts(input, request) {
  const period=validateRequest(request);
  const rows=input.filter(r=>r.status==='confirmed_fact');
  const by=k=>rows.filter(r=>r.kind===k);
  const inside=d=>Boolean(d && d>=period.start && d<=period.end);
  const overlaps=rr=>rr && rr[0]<=period.end && rr[1]>=period.start;
  const sources=[], sourceIndex=new Map(), metrics={}, checks=[], missing=[];
  function source(r, detail) {
    const p=r.payload?._prov || {}, label=r.source_label || p.file || r.kind;
    const key=JSON.stringify([label,p.sheet,p.row,detail]);
    if (sourceIndex.has(key)) return sourceIndex.get(key);
    const id='S'+String(sources.length+1).padStart(3,'0');sourceIndex.set(key,id);
    let hint=detail||p.detail||null;
    if(!hint&&r.kind==='weekly_summary'){
      const points=['总数据','周中数据','周末数据'].flatMap(k=>Object.values(r.payload.current?.sections?.[k]||{})).map(v=>v?._prov?.row).filter(Number.isFinite);
      if(points.length)hint='课务数据第'+Math.min(...points)+'—'+Math.max(...points)+'行；总数据、周中、周末分别核算';
    }
    if(!hint&&r.kind==='monthly_summary'&&r.payload.month){
      const m=Number(r.payload.month.slice(5,7)),n=String.fromCharCode(64+m+3),renew=String.fromCharCode(64+m+2);
      hint=`年度表：确认收入模块B${m+2}:F${m+2}；新签现金流收入模块${n}30:${n}31；续费模块收入模块${renew}15:${renew}18；退费文件按日期过滤`;
    }
    sources.push({id,label,sheet:p.sheet||null,row:p.row||null,detail:hint,coverage:r.period_label||null});return id;
  }
  const addMetric=(id,label,value,unit,sourceIds,description)=>metrics[id]={id,label,value,unit,sourceIds,description:description||''};
  const check=(name,expected,actual,sourceIds)=>checks.push({name,expected,actual,pass:expected!==null&&actual!==null&&Math.abs(expected-actual)<0.011,sourceIds});

  // A report only uses a weekly aggregate when the entire source interval matches.
  const week=by('weekly_summary').find(r=>{
    const rr=range(r.period_label);return rr && rr[0]===period.start && rr[1]===period.end;
  });
  const month=[...by('monthly_summary'),...by('report_cash_summary')].find(r=>{const rr=range(r.period_label);return rr && rr[0]===period.start && rr[1]===period.end;});
  const cashRows=by('cash_line').filter(r=>overlaps(range(r.period_label))).map(r=>({...r.payload,date:iso(r.payload.date),sourceId:source(r)}));
  const expenseRows=by('expense_line').filter(r=>overlaps(range(r.period_label))).map(r=>({...r.payload,date:iso(r.payload.date),sourceId:source(r)}));
  if (cashRows.some(r=>!r.date) || expenseRows.some(r=>!r.date)) throw Error('现金资料存在无法识别的业务日期，已停止生成');
  const rawCash=by('cash_line'), cashCoverage=rawCash.map(r=>range(r.period_label)).filter(Boolean);
  const confirmedCoverage=by('source_coverage').filter(r=>r.payload.income&&range(r.period_label));const coveredCash=cashCoverage.some(rr=>rr[0]<=period.start && rr[1]>=period.end)||confirmedCoverage.some(r=>{const rr=range(r.period_label);return rr[0]<=period.start&&rr[1]>=period.end;});
  const daily=by('daily_report').filter(r=>inside(iso(r.payload.time))).map(r=>({...r.payload,summary:cleanText(r.payload.summary),plan:cleanText(r.payload.plan),date:iso(r.payload.time),sourceId:source(r)})).sort((a,b)=>(a.date+a.reporter).localeCompare(b.date+b.reporter));
  if (!week && !month && !coveredCash && !daily.length && !by('source_paragraph').length) throw Error('所选期间没有覆盖该期间的运营资料；请补充数据，不沿用其他日期报告');
  const income=cashRows.filter(r=>inside(r.date));
  const expenses=expenseRows.filter(r=>inside(r.date));
  const outsideIncome=cashRows.filter(r=>!inside(r.date));
  const cashIds=[...new Set(income.map(r=>r.sourceId))];if(!cashIds.length&&coveredCash)cashIds.push(...confirmedCoverage.map(r=>source(r)));
  const byType={};for(const row of income){const type=String(row.dept||'未分类').split('-')[0];(byType[type] ||= []).push(row);}
  const cash={covered:coveredCash,income:coveredCash?sum(income,'amount'):null,count:coveredCash?income.length:null,expenses:coveredCash?sum(expenses,'amount'):null,net:coveredCash?r2(sum(income,'amount')-sum(expenses,'amount')):null,byType:Object.entries(byType).map(([type,rs])=>({type,count:rs.length,amount:sum(rs,'amount')})),fileIncome:sum(cashRows,'amount'),fileCount:cashRows.length,outsideAmount:sum(outsideIncome,'amount'),refundsKnown:false};
  const monthData=month?.payload || null;
  if (monthData?.cash) {Object.assign(cash,monthData.cash);if(!cashRows.length)cash.outsideAmount=null;cashIds.push(source(month));}
  addMetric('cash.income','本期现金收入',cash.income,'元',cashIds,'按业务日期筛选；未取得完整退费资料时为收款额');
  addMetric('cash.count','本期收款笔数',cash.count,'笔',cashIds);
  addMetric('cash.expense','本期已提供支出',cash.expenses,'元',expenses.map(r=>r.sourceId));
  addMetric('cash.net','所提供收支净额',cash.net,'元',cashIds,'仅对当前资料计算，不等同利润');
  addMetric('cash.refunds','本期退费',cash.refundsKnown?cash.refunds:null,'元',cashIds);
  addMetric('cash.netSales','扣退费后的净成单',cash.refundsKnown?r2(cash.income-cash.refunds):null,'元',cashIds);
  if(cash.knownRefunds!==undefined){addMetric('cash.knownRefunds','有日期的当期退费',cash.knownRefunds,'元',cashIds,'仍有未定日期记录，不能声称资料完整');addMetric('cash.netAfterKnownRefunds','仅扣已知退费后的暂算净额',cash.netAfterKnownRefunds,'元',cashIds,'非最终完整净额');}
  const monthStart=period.start.slice(0,7)+'-01';
  const mtdCovered=[...cashCoverage,...confirmedCoverage.map(r=>range(r.period_label))].some(rr=>rr[0]<=monthStart&&rr[1]>=period.end);
  const mtdRows=cashRows.filter(r=>r.date>=monthStart&&r.date<=period.end),mtdIds=mtdRows.map(r=>r.sourceId);
  if(mtdCovered)addMetric('cash.monthToDate','月初至期末累计收款',sum(mtdRows,'amount'),'元',mtdIds);
  if (coveredCash) check('本期收入分类合计',sum(cash.byType,'amount'),cash.income,cashIds);
  if (!coveredCash && !monthData?.cash) missing.push('现金资料未覆盖完整报告期间，不能把缺失记录当成零收入。');
  if (outsideIncome.length && coveredCash) missing.push(`财务原文件覆盖额${cash.fileIncome}元/${cash.fileCount}笔，其中${outsideIncome.length}笔共${cash.outsideAmount}元在报告期间外，已从本期指标排除。`);
  if (!cash.refundsKnown) missing.push('本期未取得完整退费资料，现金收入不等同扣除退费后的净成单额；所提供收支净额不等同利润。');

  let lessons=null, comparison=null, coaches=[], funnel=[];
  if (week) {
    const sec=week.payload.current.sections, id=source(week), total=sec['总数据'];
    const venues=Object.keys(total['应到']).filter(k=>!['合计','_prov'].includes(k));
    const section=name=>{
      const s=sec[name];if(!s)return null;
      const due=venues.reduce((n,v)=>n+Number(s['应到']?.[v]||0),0),actual=venues.reduce((n,v)=>n+Number(s['实到']?.[v]||0),0);
      return {due,actual,rate:week.payload.caliber==='database_fifo' && due>0 ? Math.round(actual/due*100) : pct(actual,due)};
    };
    lessons={...section('总数据'),consumption:r2(venues.reduce((n,v)=>n+Number(total['总消课金额']?.[v]||0),0)),weekday:section('周中数据'),weekend:section('周末数据'),sourceIds:[id],venues:venues.map(v=>({venue:v,due:total['应到'][v],actual:total['实到'][v],rate:week.payload.caliber==='database_fifo' && total['应到'][v]>0 ? Math.round(total['实到'][v]/total['应到'][v]*100) : pct(total['实到'][v],total['应到'][v]),consumption:total['总消课金额'][v],sourceId:id}))};
    const compare=week.payload.compare;
    if(compare?.sections?.['总数据']){
      const t=compare.sections['总数据'];const a=t['实到']?.合计,d=t['应到']?.合计;
      comparison={label:compare.period,due:d,actual:a,rate:pct(a,d),consumption:t['总消课金额']?.合计,sourceIds:[id]};
      addMetric('lessons.delta','与最近完整周的课消差额',r2(lessons.consumption-comparison.consumption),'元',[id]);
      addMetric('lessons.deltaPct','与最近完整周的课消变化率',pct(lessons.consumption-comparison.consumption,comparison.consumption),'%',[id]);
      addMetric('lessons.rateDelta','出勤率较比较期变化',r2(lessons.rate-comparison.rate),'个百分点',[id]);
    }
    const bound=range(week.period_label);
    const sameWeek=r=>{const rr=range(r.period_label);return rr && rr[0]===bound[0] && rr[1]===bound[1];};
    coaches=by('coach_summary').filter(sameWeek).map(r=>({...r.payload,sourceId:source(r)})).sort((a,b)=>b.consumption-a.consumption);
    funnel=by('funnel_item').filter(sameWeek).filter(r=>r.payload.label).map(r=>({...r.payload,sourceId:source(r)}));
    const repairedFunnel=by('funnel_corrected').find(sameWeek);if(repairedFunnel)funnel=repairedFunnel.payload.rows.map(r=>({...r,sourceId:source({...repairedFunnel,payload:r})}));
    if(coaches.length)check('教练课消与分馆课消',sum(coaches,'consumption'),lessons.consumption,[id,...coaches.map(c=>c.sourceId)]);
    if(coaches.length){const top=coaches[0],low=[...coaches].sort((a,b)=>a.rate-b.rate)[0];addMetric('coach.topConsumption',top.name+'课消',top.consumption,'元',[top.sourceId]);addMetric('coach.lowestRate',low.name+'出勤率',low.rate,'%',[low.sourceId]);}
    for(const dept of ['产品部','市场部']){
      const rs=funnel.filter(r=>r.dept===dept),tag=dept==='产品部'?'product':'market';
      for(const [i,r]of rs.entries())addMetric(`funnel.${tag}.${i}`,dept+r.label,r.w1,'人次',[r.sourceId]);
      const fish=rs.find(r=>r.label==='鱼池获客数'),invite=rs.find(r=>r.label==='约访数'),attend=rs.find(r=>r.label==='到场数'),signed=rs.find(r=>r.label==='成单数');
      if(fish&&invite)addMetric(`funnel.${tag}.inviteRate`,dept+'约访转化率',pct(invite.w1,fish.w1),'%',[fish.sourceId,invite.sourceId]);
      if(attend&&signed)addMetric(`funnel.${tag}.closeRate`,dept+'到场成单率',pct(signed.w1,attend.w1),'%',[attend.sourceId,signed.sourceId]);
    }
  } else if(monthData?.lessons) {
    lessons=monthData.lessons;lessons.sourceIds=[source(month)];coaches=(monthData.coaches||[]).map(c=>({...c,sourceId:source({kind:'monthly_coach',payload:c,source_label:c._prov?.file||month.source_label})})).sort((a,b)=>b.consumption-a.consumption);
    if(monthData.renewalRate!==null&&monthData.renewalRate!==undefined)addMetric('retention.rate','当月续费率',monthData.renewalRate,'%',lessons.sourceIds,'续费数÷（续费数＋不续费数）');
    if(monthData.noRenewal!==null&&monthData.noRenewal!==undefined)addMetric('retention.noRenewal','当月不续费人数',monthData.noRenewal,'人',lessons.sourceIds);
    if(coaches.length){const top=coaches[0];addMetric('coach.topConsumption',top.name+'月课消',top.consumption,'元',[top.sourceId]);}
    const previousEnd=new Date(Date.parse(period.start)-86400000).toISOString().slice(0,10),previousStart=previousEnd.slice(0,7)+'-01';
    const previous=by('monthly_summary').find(r=>{const rr=range(r.period_label);return rr&&rr[0]===previousStart&&rr[1]===previousEnd;});
    comparison=previous?{...previous.payload.lessons,label:previousStart+' — '+previousEnd,sourceIds:[source(previous)]}:null;
    if(comparison){addMetric('lessons.delta','确认收入较上月差额',r2(lessons.consumption-comparison.consumption),'元',lessons.sourceIds);addMetric('lessons.deltaPct','确认收入较上月变化率',pct(lessons.consumption-comparison.consumption,comparison.consumption),'%',lessons.sourceIds);}
    if(typeof previous?.payload.renewalRate==='number'){addMetric('retention.previousRate','上月续费率',previous.payload.renewalRate,'%',[source(previous)]);if(typeof monthData.renewalRate==='number')addMetric('retention.rateDelta','续费率较上月变化',r2(monthData.renewalRate-previous.payload.renewalRate),'个百分点',[source(month),source(previous)]);}
    if(previous)for(const [key,label]of [['newSign','新签'],['renewal','续费']])addMetric('sales.'+key+'DeltaPct',label+'较上月变化率',pct(monthData[key]-previous.payload[key],previous.payload[key]),'%',[source(month),source(previous)]);
    if(monthData.newCount){addMetric('sales.newCount','本月新签笔数',monthData.newCount,'笔',lessons.sourceIds);addMetric('sales.newTicket','本月新签平均金额',r2(monthData.newSign/monthData.newCount),'元',lessons.sourceIds);}
    if(previous?.payload.newCount){addMetric('sales.newCountDeltaPct','新签笔数较上月变化率',pct(monthData.newCount-previous.payload.newCount,previous.payload.newCount),'%',[source(month),source(previous)]);addMetric('sales.newTicketDeltaPct','新签平均金额较上月变化率',pct(monthData.newSign/monthData.newCount-previous.payload.newSign/previous.payload.newCount,previous.payload.newSign/previous.payload.newCount),'%',[source(month),source(previous)]);}
  }
  if(lessons){
    for(const [key,label,unit] of [['consumption',period.kind==='monthly'&&!['uploaded_consumption','database_fifo'].includes(week?.payload.caliber)?'确认收入（含活动）':'实际课消','元'],['due','应到','人次'],['actual','实到','人次'],['rate','出勤率','%']])addMetric('lessons.'+key,label,lessons[key],unit,lessons.sourceIds);
    for(const k of ['weekday','weekend'])if(lessons[k])for(const [key,label,unit] of [['due','应到','人次'],['actual','实到','人次'],['rate','出勤率','%']])addMetric(`lessons.${k}.${key}`,(k==='weekday'?'周中':'周末')+label,lessons[k][key],unit,lessons.sourceIds);
  }else missing.push('未取得与所选期间完全对应的课务场次或汇总，课消与出勤保持缺失，不按天摊分周数据。');

  const monthKey=Number(period.start.slice(5,7))+'月';
  const target=by('target_confirm_income')[0];
  const targets={lesson:target?.payload?.excellent?.[monthKey]?.['月度总目标']??null,newSign:null,renewal:null,cash:null,sourceIds:target?[source(target)]:[],version:'原始目标表'};
  const goal=by('report_targets').find(r=>r.payload.month===period.start.slice(0,7)&&(!r.payload.effectiveDate||r.payload.effectiveDate<=period.end));if(goal){Object.assign(targets,goal.payload);targets.sourceIds.push(source(goal));}
  for(const k of ['lesson','newSign','renewal','cash','product','market'])if(targets[k]!==null&&targets[k]!==undefined)targets[k]=r2(targets[k]);
  if(monthData?.missing)missing.push(...monthData.missing);
  if(lessons && targets.lesson){addMetric('target.lesson','月度课消目标',targets.lesson,'元',targets.sourceIds);addMetric('target.lessonProgress','本期课消占月目标',pct(lessons.consumption,targets.lesson),'%',targets.sourceIds);}
  for(const k of ['newSign','renewal','cash'])if(targets[k]!==null)addMetric('target.'+k,({newSign:'月度新签目标',renewal:'月度续费目标',cash:'月度现金目标'})[k],targets[k],'元',targets.sourceIds);
  if(targets.product)addMetric('target.product','产品部新签月目标',targets.product,'元',targets.sourceIds);
  if(targets.market)addMetric('target.market','市场部新签月目标',targets.market,'元',targets.sourceIds);
  if(mtdCovered){
    for(const [tag,types,goal,label]of [['new',['产品新签','市场新签','线上新签'],targets.newSign,'新签'],['renewal',['产品续费'],targets.renewal,'续费'],['product',['产品新签'],targets.product,'教练端新签'],['market',['市场新签'],targets.market,'市场部新签']]){
      const value=sum(mtdRows.filter(r=>types.includes(String(r.dept).split('-')[0])),'amount');addMetric(`sales.${tag}MTD`,label+'月累计收款',value,'元',mtdIds);
      if(goal)addMetric(`sales.${tag}Progress`,label+'月累计目标完成率',pct(value,goal),'%',mtdIds.concat(targets.sourceIds));
    }
  }
  if(targets.newSign===null || targets.renewal===null)missing.push('新签、续费及现金目标尚未取得对应期间的有效配置，未借用课消目标替代。');
  const timeProgress=pct(Number(period.end.slice(8)),new Date(Date.UTC(Number(period.end.slice(0,4)),Number(period.end.slice(5,7)),0)).getUTCDate());
  addMetric('target.timeProgress','截至期末的月度时间进度',timeProgress,'%',[],'用于月累计进度比较，本期流量不直接等同月累计');

  // Snapshots and comparisons are selected by their actual dates, not by insertion order.
  const series=by('roster_series')[0],change=by('roster_change')[0];let roster=null;
  if(series){
    const p=series.payload, dates=p.dates||[];
    // Prefer a requested/known snapshot only when it is within one day of the period end.
    const chosen=request.snapshotDate || (week ? new Date(Date.parse(period.end)+86400000).toISOString().slice(0,10):null);
    const usable=chosen && Math.abs((Date.parse(chosen)-Date.parse(period.end))/86400000)<=1;
    const col=usable?dates.findIndex(d=>String(d).includes(chosen.slice(5))):-1;
    const total=(p.coaches||[]).find(c=>String(c.name||c.coach||'').trim()==='合计');
    if(col>=0&&total){
      const sid=source(series),values=total.values||[];
      roster={snapshot:chosen,current:values[col]??null,previous:col>0?values[col-1]??null:null,changes:[],sourceIds:[sid]};
      if(change&&week){const cr=change.payload.rows||[];const t=cr.find(r=>r.isTotal||r.coach==='合计');roster.comparablePrevious=t?.prev??null;roster.comparableCurrent=t?.curr??null;roster.comparableDelta=t?.delta??null;roster.changes=cr.filter(r=>typeof r.prev==='number'&&r.coach!=='合计').map(r=>({...r,sourceId:source(change)}));roster.sourceIds.push(source(change));}
      if(roster.current!==null)addMetric('roster.current','快照花名册人次',roster.current,'人次',roster.sourceIds);
      if(roster.comparableDelta!==null)addMetric('roster.delta','可比花名册人次变化',roster.comparableDelta,'人次',roster.sourceIds);
    }
  }
  if(!roster)missing.push('没有与期末相邻、口径匹配的花名册快照，未套用其他日期人数。');
  const history=by('report_history').filter(r=>!r.payload.effectiveDate || r.payload.effectiveDate<=period.end).map(r=>({...r.payload,sourceId:source(r)}));
  const newIncome=income.filter(r=>/新签|新报|报名/.test(String(r.dept).split('-')[0]));
  const renewalIncome=income.filter(r=>/续费/.test(String(r.dept).split('-')[0]));
  addMetric('sales.new','本期新签收款',coveredCash?sum(newIncome,'amount'):monthData?.newSign??null,'元',newIncome.map(r=>r.sourceId));
  addMetric('sales.renewal','本期续费收款',coveredCash?sum(renewalIncome,'amount'):monthData?.renewal??null,'元',renewalIncome.map(r=>r.sourceId));
  addMetric('daily.count','本期已取得的主管汇报',daily.length||null,'条',daily.map(r=>r.sourceId),'未取得对应资料时保留缺失，不认定为零汇报');
  let rosterReference=null;
  if(!roster&&period.kind==='monthly'&&series){
    const year=period.start.slice(0,4),p=series.payload,total=(p.coaches||[]).find(r=>r.name==='合计');
    const points=(p.dates||[]).flatMap((label,i)=>{const m=String(label||'').match(/(\d{2}-\d{2})/);return m&&typeof total?.values?.[i]==='number'?[{date:year+'-'+m[1],value:total.values[i]}]:[];});
    const before=points.filter(r=>r.date<=period.start).sort((a,b)=>b.date.localeCompare(a.date))[0],after=points.filter(r=>r.date>=period.end).sort((a,b)=>a.date.localeCompare(b.date))[0];
    if(before&&after&&(Date.parse(after.date)-Date.parse(period.end))/86400000<=3){rosterReference={before,after,referenceOnly:true,sourceId:source(series)};}
  }
  const registrationLists=[];
  for(const [kind,type]of [['new_signup','新报'],['renewal','续费']])for(const record of by(kind).filter(r=>overlaps(range(r.period_label)))){
    const p=record.payload,name=String(p.name||'').replace(/\s+/g,'');
    const candidates=cashRows.filter(r=>{
      const cashName=String(r.dept||'').split('-').slice(1).join('-').replace(/\s+/g,'');
      const correctType=type==='续费'?/续费/.test(String(r.dept).split('-')[0]):/新签|新报|报名/.test(String(r.dept).split('-')[0]);
      return correctType&&cashName.length>=2&&r2(r.amount)===r2(p.amount)&&(name.includes(cashName)||cashName.includes(name));
    });
    const matched=candidates.length===1?candidates[0]:null;
    if(period.kind==='daily'&&matched&&!inside(matched.date))continue;
    registrationLists.push({...p,type,matchedDate:matched?.date||null,matchStatus:matched?(inside(matched.date)?'匹配本期收款':'匹配期间外收款'):'日期待核：未唯一匹配',matchedCashSourceId:matched?.sourceId||null,sourceId:source(record)});
  }
  if(cash.sourceCaliber==='confirmed_orders'){metrics['cash.income'].label='本期确认成单总额';metrics['cash.count'].label='本期成单笔数';metrics['cash.netSales'].label='本期净成单额（扣确认退费）';metrics['sales.new'].label='本期新签成单额';metrics['sales.renewal'].label='本期续费成单额';if(Number.isInteger(monthData?.newCount))addMetric('sales.newCount','本期新签单数',monthData.newCount,'单',cashIds);if(Number.isInteger(monthData?.renewalCount))addMetric('sales.renewalCount','本期续费单数',monthData.renewalCount,'单',cashIds);}
  const refundRows=by('refund_line').filter(r=>!iso(r.payload.date)||inside(iso(r.payload.date))).map(r=>({...r.payload,date:iso(r.payload.date),sourceId:source(r)}));
  const undatedRefunds=refundRows.filter(r=>!r.date);
  if(undatedRefunds.length){addMetric('refund.undatedCount','无日期退费条数',undatedRefunds.length,'条',undatedRefunds.map(r=>r.sourceId));addMetric('refund.undatedAmount','无日期退费金额',sum(undatedRefunds,'amount'),'元',undatedRefunds.map(r=>r.sourceId));missing.push('退费资料有'+undatedRefunds.length+'条记录无日期，金额'+sum(undatedRefunds,'amount')+'元，未强行归入本期。');}
  const contextNotes=by('source_paragraph').map(r=>({...r.payload,sourceId:source(r)}));
  const result={version:2,period,metrics,sources,checks,contextNotes,lessons,comparison,coaches,personnel:monthData?.personnel||[],registrationLists,refundRows,funnel,cash,income,expenses,outsideIncome,daily,roster,rosterReference,targets,history,missing,complete:false};
  const usedLabels=new Set(sources.map(s=>s.label));
  const sourceInputs=rows.filter(r=>usedLabels.has(r.source_label)).map(r=>({kind:r.kind,period_label:r.period_label,status:r.status,payload:r.payload,source_label:r.source_label})).sort((a,b)=>JSON.stringify(a)<JSON.stringify(b)?-1:JSON.stringify(a)>JSON.stringify(b)?1:0);
  result.snapshotDigest=crypto.createHash('sha256').update(JSON.stringify({period,sourceInputs})).digest('hex');
  result.complete=Boolean(lessons && (coveredCash||monthData?.cash));
  return result;
}
module.exports={buildReportFacts,validateRequest,iso,range,pct,sum,r2};
