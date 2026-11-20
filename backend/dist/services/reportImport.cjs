'use strict';
// Pure import adapters. They never write students, orders or report contexts.
const {iso,range,r2,validateRequest}=require('./reportFacts.cjs');
const fields={date:['业务日期','收款日期','退费日期','日期','时间','汇报时间'],amount:['金额（万元）','金额(万元)','金额','收款金额','退费金额','收入金额','支出金额'],dept:['业务事项','业务类型','部门','类型'],venue:['场馆','上课场馆','校区'],method:['收款方式'],closer:['成单人'],item:['支出事项','事项','说明','备注'],name:['学员姓名','姓名','教练','人员'],reporter:['汇报人','主管'],summary:['今日工作总结（必填）','今日工作总结','当日工作记录','工作总结'],plan:['明日工作计划','明日计划'],due:['应到人次','应到'],actual:['实到人次','实到'],consumption:['课消金额','课销金额','已完成课销金额'],roster:['花名册人数','花名册人次'],lessons:['报名课时','课次','课时'],owner:['负责人','报名教练'],classCoach:['上课教练','授课教练'],slot:['上课时间段','上课时间'],prev:['上期','上期可比'],curr:['本期'],delta:['增减'],left:['离开明细','移出明细'],joined:['新增明细','加入明细'],newAmount:['新签金额','新报金额'],renewalAmount:['续费金额'],newCount:['新签数','已报名'],renewalCount:['续费数','已续费'],noRenewal:['不续费人数','不续费'],label:['指标','项目','环节'],value:['数值','数量','目标金额'],month:['月份'],title:['事项','行动','标题'],deadline:['期限','截止日期'],status:['状态'],balance:['剩余课时']};
const schemas={cash_line:['date','amount','dept','venue','method','closer'],expense_line:['date','amount','item'],refund_line:['date','amount','name'],daily_report:['date','reporter','summary','plan'],coach_summary:['name','roster','due','actual','consumption'],lesson_row:['date','venue','due','actual','consumption'],new_signup:['name','amount','lessons','owner','classCoach','venue','slot'],renewal:['name','amount','lessons','owner','venue','slot'],monthly_personnel:['name','newCount','newAmount','renewalCount','renewalAmount','noRenewal','consumption'],funnel_item:['dept','label','value'],report_target_row:['month','label','value'],report_history:['title','owner','deadline','summary'],roster_change_row:['name','prev','curr','delta','left','joined']};
const required={cash_line:['date','amount'],expense_line:['date','amount','item'],refund_line:['amount'],daily_report:['date','reporter','summary'],coach_summary:['name','due','actual','consumption'],lesson_row:['date','venue','due','actual','consumption'],new_signup:['name','amount'],renewal:['name','amount'],monthly_personnel:['name','newAmount','renewalAmount'],funnel_item:['dept','label','value'],report_target_row:['label','value'],report_history:['title'],roster_change_row:['name','prev','curr','delta']};
const norm=s=>String(s??'').replace(/[\s（）()]/g,'').trim();
const number=v=>v===null||v===undefined||String(v).trim()===''?null:(typeof v==='number'?v:(()=>{const s=String(v).replace(/[,，￥¥元\s]/g,'').replace(/课时$/,'');return /^-?\d+(?:\.\d+)?%?$/.test(s)?Number(s.replace('%','')):NaN;})());
const labelNames={cash_line:'收入流水',expense_line:'支出流水',refund_line:'退费记录',daily_report:'主管日报',coach_summary:'教练课务',lesson_row:'逐日课务',new_signup:'新报名单',renewal:'续费名单',monthly_personnel:'月度人员数据',funnel_item:'获客漏斗',report_target_row:'经营目标',report_history:'历史行动',roster_change_row:'花名册变化',weekly_matrix:'分馆课务矩阵',funnel_matrix:'部门漏斗矩阵',roster_series:'基本盘周序列',target_matrix:'年度目标表',monthly_matrix:'月度成单矩阵',roster_detail:'花名册原始明细',cash_month_matrix:'年度收款实际矩阵'};
function raw(t){return t.sourceRows||[{row:t.headerRow,values:t.headers},...t.rows.map(r=>({row:Number(r.source.match(/行(\d+)$/)?.[1])||0,values:r.values}))];}
function suggest(t,fileName){
 const rr=raw(t),text=rr.slice(0,5).map(r=>r.values.join('|')).join('\n');
 if(/总数据|周中数据/.test(text)&&/课务/.test(t.name))return {kind:'weekly_matrix',columns:{},headerRow:1};
 if(/各部门运营/.test(t.name)&&/M\d+W\d+/.test(text))return {kind:'funnel_matrix',columns:{},headerRow:1};
 if(/周序列/.test(t.name))return {kind:'roster_series',columns:{},headerRow:rr.find(r=>r.values[0]==='教练')?.row||1};
 if(/确认收入模块/.test(t.name)&&/优秀目标|月度总目标/.test(text))return {kind:'target_matrix',columns:{},headerRow:1};
 if(/新签现金流收入模块|续费模块收入模块/.test(t.name))return {kind:'cash_month_matrix',columns:{},headerRow:2};
 if(/增减/.test(text)&&/离开明细|移出明细/.test(text))return {kind:'roster_change_row',columns:{name:0,prev:1,curr:2,delta:3,left:4,joined:5},headerRow:1};
 if(/已报名/.test(text)&&/已续费/.test(text))return {kind:'monthly_matrix',columns:{},headerRow:1};
 if(/班级总表|学员明细/.test(t.name)&&/班级/.test(text))return {kind:'roster_detail',columns:{},headerRow:1};
 let best={kind:'',columns:{},headerRow:t.headerRow},score=0;
 for(const r of rr.slice(0,12)){
  const cols={};for(const[k,syn]of Object.entries(fields)){const i=r.values.findIndex(v=>syn.some(s=>norm(s)===norm(v)));if(i>=0)cols[k]=i;}
  let kind='';
  if(cols.summary!==undefined&&cols.reporter!==undefined)kind='daily_report';
  else if(cols.date!==undefined&&cols.consumption!==undefined&&cols.venue!==undefined)kind='lesson_row';
  else if(cols.due!==undefined&&cols.consumption!==undefined&&cols.name!==undefined)kind='coach_summary';
  else if(cols.amount!==undefined&&cols.date!==undefined)kind=/退费|退款/.test(t.name+' '+fileName)?'refund_line':/支出|费用/.test(t.name)?'expense_line':'cash_line';
  else if(cols.amount!==undefined&&cols.name!==undefined)kind=/续费/.test(t.name)?'renewal':'new_signup';
  else if(cols.label!==undefined&&cols.value!==undefined)kind=/目标/.test(t.name)?'report_target_row':'funnel_item';
  if(kind&&Object.keys(cols).length>score){score=Object.keys(cols).length;best={kind,columns:cols,headerRow:r.row};}
 }
 // Some legacy expense sheets have a title only and unambiguous date/item/amount rows.
 if(!best.kind&&/支出/.test(t.name)&&rr.some(r=>iso(r.values[0])&&number(r.values[2])!==null))return {kind:'expense_line',columns:{date:0,item:1,amount:2},headerRow:1};
 return best;
}
function importUploads(uploads,request,options={}){
 const period=validateRequest(request),year=period.start.slice(0,4),contexts=[],tables=[],issues=[],errors=[],duplicates=[];let importedRows=0;
 const add=(kind,payload,u,t,row,start=period.start,end=period.end)=>contexts.push({kind,period_label:start+'~'+end,status:'confirmed_fact',payload:{...payload,_prov:{file:u.fileName,sheet:t.name,row,uploadId:u.id,sha256:u.hash}},source_label:u.fileName});
 const date=v=>iso(v)||null,split=v=>String(v||'').split(/[;；\n]/).map(s=>s.trim()).filter(Boolean);
 const validNumber=(v,label,u,t,row)=>{const n=number(v);if(n!==null&&!Number.isFinite(n))errors.push(`${u.fileName}/${t.name}第${row}行：${label}不是有效数值`);return Number.isFinite(n)?n:null;};
 const signatures=new Set(),hashes=new Set();
 for(const u of uploads){
  if(hashes.has(u.hash)){duplicates.push(u.fileName);continue;}hashes.add(u.hash);
  for(const t of u.tables){
   const automatic=suggest(t,u.fileName),override=(options.mappings||[]).find(m=>m.uploadId===u.id&&m.table===t.name);const config=override?{...automatic,...override}:automatic;
   if(!config.kind||config.kind==='skip'){tables.push({uploadId:u.id,table:t.name,kind:'',label:'尚未识别',rows:t.rows.length,importedRows:0,headers:t.headers,columns:{},headerRow:t.headerRow,ignored:true});issues.push(`${u.fileName}/${t.name}未作为结构化指标导入；需映射或补充资料`);continue;}
   if(!labelNames[config.kind])throw Error('未知报告资料类型');
   const columns=config.columns||{},before=contexts.length,amountUnit=config.amountUnit||((fields.amount.some(s=>norm(s)===norm(raw(t).find(r=>r.row===config.headerRow)?.values[columns.amount]))&&/万元/.test(String(raw(t).find(r=>r.row===config.headerRow)?.values[columns.amount])))?'万元':'元');if(!['元','万元'].includes(amountUnit))throw Error('金额单位只能选择元或万元');const scale=amountUnit==='万元'?10000:1;let count=0;
   const rows=raw(t),after=rows.filter(r=>r.row>config.headerRow);
   const get=(r,k)=>r.values[columns[k]]??null;
   if(schemas[config.kind]){
    for(const k of required[config.kind])if(!Number.isInteger(columns[k])||columns[k]<0||columns[k]>=64)errors.push(`${u.fileName}/${t.name}缺少字段映射：${(fields[k]||[k])[0]}`);
    let cashDetailEnded=false;
    for(const r of after){
     if(config.kind==='cash_line'&&r.values.some(v=>String(v||'').trim()==='部门明细')){cashDetailEnded=true;issues.push(u.fileName+'/'+t.name+'：部门汇总附表不重复计入逐笔收款');}if(cashDetailEnded)continue;
     if(r.values.every(v=>v===null||String(v).trim()===''))continue;
     const p=Object.fromEntries(schemas[config.kind].map(k=>[k,get(r,k)]));
     const first=String(r.values.find(v=>v!==null&&String(v).trim())||'').trim();if(config.kind!=='roster_change_row'&&(/^(合计|总计|小计|部门明细|使用说明|口径说明|比例)/.test(first)||r.values.some(v=>typeof v==='string'&&/^(合计|总计|小计)[：:：\s]*$/.test(v.trim()))))continue;
     if(['cash_line','expense_line','refund_line'].includes(config.kind)&&String(p.amount).trim()==='金额')continue;
     if(config.kind==='roster_change_row'&&typeof p.prev==='string'&&!Number.isFinite(number(p.prev))&&r.values.slice(1,4).every(v=>!Number.isFinite(number(v))||number(v)===null)){issues.push(u.fileName+'/'+t.name+'第'+r.row+'行是说明文字，未计入人员变动');continue;}
     if(config.kind==='cash_line'||config.kind==='expense_line'||config.kind==='refund_line'){
      p.date=date(p.date);p.amount=validNumber(p.amount,'金额',u,t,r.row);if(p.amount!==null)p.amount=r2(p.amount*scale);p.sourceAmountUnit=amountUnit;if(config.kind==='refund_line'&&p.amount!==null){p.signedSourceAmount=p.amount;p.amount=Math.abs(p.amount);if(p.signedSourceAmount<0)issues.push(u.fileName+'/'+t.name+'：原表负数退费按流出正额核算，原始符号保留');}
      if(p.amount===null){if(!p.date)continue;errors.push(`${u.fileName}/${t.name}第${r.row}行金额缺失`);continue;}
      if(!p.date&&config.kind!=='refund_line'){if(!iso(r.values[0])&&!get(r,'date')&&!get(r,'amount'))continue;errors.push(`${u.fileName}/${t.name}第${r.row}行日期无效，不能自动归期`);continue;}
      const key=JSON.stringify([config.kind,p.date,p.amount,p.dept,p.closer,p.item,p.name]);if(signatures.has(key))issues.push(`${u.fileName}/${t.name}第${r.row}行与其他行相同，保留但需核查是否重复`);signatures.add(key);
     }else if(config.kind==='daily_report'){
      p.time=date(p.date);delete p.date;if(!p.time){errors.push(`${u.fileName}/${t.name}第${r.row}行汇报日期无效`);continue;}
      if(!p.reporter||!p.summary){errors.push(`${u.fileName}/${t.name}第${r.row}行缺汇报人或工作记录`);continue;}
     }else if(config.kind==='new_signup'||config.kind==='renewal'){p.amount=validNumber(p.amount,'金额',u,t,r.row);if(p.amount!==null)p.amount=r2(p.amount*scale);p.lessons=validNumber(p.lessons,'课时',u,t,r.row);if(!p.name||p.amount===null)continue;}
     else if(config.kind==='coach_summary'){for(const k of ['roster','due','actual','consumption'])p[k]=validNumber(p[k],k,u,t,r.row);if(!p.name)continue;p.rate=p.due>0?r2(p.actual/p.due*100):null;}
     else if(config.kind==='lesson_row'){p.date=date(p.date);for(const k of ['due','actual','consumption'])p[k]=validNumber(p[k],k,u,t,r.row);if(!p.date)errors.push(`${u.fileName}/${t.name}第${r.row}行课务日期无效`);}
     else if(config.kind==='roster_change_row'){p.coach=p.name;p.isTotal=/^(合计|总计)$/.test(String(p.name));delete p.name;for(const k of ['prev','curr','delta'])p[k]=validNumber(p[k],k,u,t,r.row);p.left=split(p.left);p.joined=split(p.joined);}
     else if(config.kind==='funnel_item'){p.w1=validNumber(p.value,'数量',u,t,r.row);delete p.value;}
     add(config.kind,p,u,t,r.row);count++;
    }
   }else if(config.kind==='weekly_matrix'){
    const titleRow=rows[0]?.values||[],venueRow=rows.find(r=>r.values.filter(v=>v==='合计').length)?.values||[];const halves=[];
    for(let off=0;off<venueRow.length;off++)if(String(titleRow[off]||'').includes('课务数据')){
     const label=String(titleRow[off]),m=label.match(/(\d{1,2})[.\/-](\d{1,2})\s*[~～至—-]\s*(\d{1,2})[.\/-](\d{1,2})/);if(!m){errors.push(`${u.fileName}/${t.name}课务区间未识别`);continue;}
     const start=`${year}-${m[1].padStart(2,'0')}-${m[2].padStart(2,'0')}`,end=`${year}-${m[3].padStart(2,'0')}-${m[4].padStart(2,'0')}`,sections={};let section='总数据';
     for(const r of rows){const key=String(r.values[off]||'').trim();if(['总数据','周中数据','周末数据'].includes(key)){section=key;continue;}if(!['应到','实到','出勤率','总消课金额'].includes(key))continue;const values={_prov:{row:r.row}};for(let j=off+1;j<venueRow.length&&j<off+7;j++){const venue=String(venueRow[j]||'');if(!venue)continue;values[venue]=number(r.values[j]);if(venue==='合计')break;}(sections[section]||={})[key]=values;}
     halves.push({period:start+'~'+end,sections,start,end});
    }
    for(const half of halves){add('weekly_summary',{current:half,compare:halves.filter(h=>h.end<half.start).sort((a,b)=>b.end.localeCompare(a.end))[0]||null},u,t,1,half.start,half.end);count++;}
   }else if(config.kind==='funnel_matrix'){
    const header=rows[0]?.values||[],week=Math.ceil(Number(period.start.slice(8))/7),col=header.findIndex(v=>new RegExp('M?'+Number(period.start.slice(5,7))+'W'+week+'$','i').test(String(v||'')));let dept=null;
    if(col<0)issues.push(`${u.fileName}/${t.name}没有对应周的漏斗列`);else for(const r of rows){const name=String(r.values[0]||'').trim();if(/部$/.test(name)){dept=name;continue;}if(dept&&['鱼池获客数','约访数','到场数','成单数'].includes(name)){add('funnel_item',{dept,label:name,w1:number(r.values[col])},u,t,r.row);count++;}}
   }else if(config.kind==='roster_series'){
    const head=rows.find(r=>r.values[0]==='教练');if(head){const coaches=rows.filter(r=>r.row>head.row&&r.values[0]&&r.values.slice(1).some(v=>typeof v==='number')).map(r=>({name:r.values[0],values:head.values.slice(1).map((_,i)=>number(r.values[i+1]))}));add('roster_series',{dates:head.values.slice(1).map(v=>String(v||'')),coaches},u,t,head.row);count=coaches.length;}
   }else if(config.kind==='monthly_matrix'){
    const people=rows.filter(r=>r.row>2&&r.values[0]&&!/合计|总计/.test(String(r.values[0]))&&[1,2,3,4,5,19].some(i=>typeof r.values[i]==='number')).map(r=>({name:String(r.values[0]),newCount:number(r.values[1]),newAmount:number(r.values[2]),renewalCount:number(r.values[3]),renewalAmount:number(r.values[4]),noRenewal:number(r.values[5]),consumption:number(r.values[period.kind==='monthly'?19:7]),_row:r.row}));
    for(const p of people){add('monthly_personnel',p,u,t,p._row);count++;}
   }else if(config.kind==='target_matrix'){
    const excellent={};for(const r of rows){const m=String(r.values[9]||'');if(/^\d+月$/.test(m))excellent[m]={'月度总目标':number(r.values[14])};}add('target_confirm_income',{excellent},u,t,1);count++;
    // Full-month actual figures use the original annual sheet's left block, not goal tiers.
    for(const known of rows.filter(r=>/^\d{1,2}月$/.test(String(r.values[0]))&&typeof r.values[5]==='number'))if(period.kind==='monthly'){const month=Number(String(known.values[0]).replace('月','')),start=year+'-'+String(month).padStart(2,'0')+'-01',end=new Date(Date.UTC(Number(year),month,0)).toISOString().slice(0,10);const head=rows.find(r=>r.values[0]==='月份'&&r.values.slice(1,5).every(v=>typeof v==='string'))?.values||[];const venues=[];for(let j=1;j<=4;j++)if(known.values[j]!==null)venues.push({venue:String(head[j]||'来源列'+(j+1)).replace(/(?:目标|金额)?[（(]元[）)]/g,'').replace(/目标$/,''),consumption:number(known.values[j]),due:null,actual:null,rate:null});add('monthly_actual_lessons',{month:start.slice(0,7),lessons:{consumption:number(known.values[5]),due:null,actual:null,rate:null,venues}},u,t,known.row,start,end);count++;}
   }else if(config.kind==='cash_month_matrix'){
    const header=rows.find(r=>r.row===2)?.values||[],renew=/续费/.test(t.name),base=rows.findIndex(r=>String(r.values[0]||'').replace(/\s/g,'')===(renew?'合计':'总体合计'));
    if(base<0)errors.push(u.fileName+'/'+t.name+'未找到实际合计区');else for(let month=1;month<=12;month++){const col=header.findIndex(v=>v===month+'月');if(col<0)continue;const amount=number(rows[base+(renew?1:2)]?.values[col]),countValue=number(rows[base+(renew?0:1)]?.values[col]),noRenewal=renew?number(rows[base+2]?.values[col]):null;const start=year+'-'+String(month).padStart(2,'0')+'-01',end=new Date(Date.UTC(Number(year),month,0)).toISOString().slice(0,10);if(amount!==null&&countValue!==null){add('monthly_cash_actual',{type:renew?'renewal':'newSign',amount,count:countValue,noRenewal},u,t,rows[base].row,start,end);count++;}}
   }else if(config.kind==='roster_detail'){
    add('source_rows',{label:'花名册原始资料；身份、活动班与校区映射需另行核对',headers:t.headers,rows:t.rows},u,t,t.headerRow);count=t.rows.length;issues.push(`${u.fileName}/${t.name}已完整保留原表，未经规则确认不直接据此计算去重学员或流失`);
   }
   tables.push({uploadId:u.id,table:t.name,kind:config.kind,label:labelNames[config.kind],rows:t.rows.length,importedRows:count,amountUnit,headers:(rows.find(r=>r.row===config.headerRow)?.values||t.headers).map((v,i)=>String(v||'未命名列'+(i+1))),columns,headerRow:config.headerRow,ignored:false});importedRows+=count;
  }
  for(const p of u.paragraphs||[]){add('source_paragraph',{text:p.text,caliber:'上传文档原文，仅为未结构化资料，不自动认定为业务事实'},u,{name:'正文'},p.source);importedRows++;}if(u.paragraphs?.length)issues.push(u.fileName+'：正文全文保留为参考资料；其中的数量未直接计入已核算指标');
 }
 const teaching=contexts.filter(c=>c.kind==='lesson_row'&&c.payload.date>=period.start&&c.payload.date<=period.end);
 if(teaching.length){
  if(teaching.some(c=>['due','actual','consumption'].some(k=>c.payload[k]===null)))errors.push('逐场课务存在缺失数字，不能按零汇总');
  else {const venues=[...new Set(teaching.map(c=>String(c.payload.venue)))],section=(records)=>{const result={};for(const [key,field]of [['应到','due'],['实到','actual'],['总消课金额','consumption']])result[key]=Object.fromEntries([...venues.map(v=>[v,r2(records.filter(c=>String(c.payload.venue)===v).reduce((n,c)=>n+c.payload[field],0))]),['合计',r2(records.reduce((n,c)=>n+c.payload[field],0))]]);return result;};const weekend=c=>[0,6].includes(new Date(c.payload.date+'T00:00:00Z').getUTCDay());contexts.push({...teaching[0],kind:'weekly_summary',payload:{caliber:'uploaded_consumption',current:{period:period.start+'~'+period.end,sections:{总数据:section(teaching),周中数据:section(teaching.filter(c=>!weekend(c))),周末数据:section(teaching.filter(weekend))}}}});issues.push('上传课务按原表金额汇总，尚未与业务库逐场核对');}
 }
 const targetRows=contexts.filter(c=>c.kind==='report_target_row');if(targetRows.length){const payload={month:period.start.slice(0,7),version:'本次确认导入的月度目标'};const names={课消:'lesson',新签:'newSign',新报:'newSign',续费:'renewal',现金收入:'cash',现金:'cash'};for(const c of targetRows){const key=names[String(c.payload.label).trim()];if(key)payload[key]=number(c.payload.value);}contexts.push({...targetRows[0],kind:'report_targets',payload});}
 // Combine imported month totals. No matching monthly source means no monthly figure.
 for(const a of contexts.filter(c=>c.kind==='monthly_actual_lessons')){
  const bounds=range(a.period_label),cashRows=contexts.filter(c=>c.kind==='monthly_cash_actual'&&c.period_label===a.period_label),ns=cashRows.find(c=>c.payload.type==='newSign'),renew=cashRows.find(c=>c.payload.type==='renewal');
  const personnel=contexts.filter(c=>c.kind==='monthly_personnel'&&a.payload.month===period.start.slice(0,7)).map(c=>({...c.payload})),coaches=personnel.filter(p=>p.consumption!==null),refunds=contexts.filter(c=>c.kind==='refund_line'&&c.payload.date&&c.payload.date>=bounds[0]&&c.payload.date<=bounds[1]),undated=contexts.filter(c=>c.kind==='refund_line'&&!c.payload.date),knownRefunds=r2(refunds.reduce((n,c)=>n+c.payload.amount,0));
  const amount=ns&&renew?r2(ns.payload.amount+renew.payload.amount):null,countValue=ns&&renew?ns.payload.count+renew.payload.count:null;
  contexts.push({...a,kind:'monthly_summary',payload:{...a.payload,coaches,personnel,newSign:ns?.payload.amount??null,newCount:ns?.payload.count??null,renewal:renew?.payload.amount??null,renewalCount:renew?.payload.count??null,noRenewal:renew?.payload.noRenewal??null,renewalRate:renew&&renew.payload.noRenewal!==null?r2(renew.payload.count/(renew.payload.count+renew.payload.noRenewal)*100):null,cash:{covered:amount!==null,income:amount,count:countValue,expenses:null,net:null,fileIncome:amount,fileCount:countValue,outsideAmount:null,refundsKnown:false,knownRefunds:refunds.length?knownRefunds:null,netAfterKnownRefunds:amount!==null&&refunds.length?r2(amount-knownRefunds):null,byType:[...(ns?[{type:'新签',amount:ns.payload.amount,count:ns.payload.count}]:[]),...(renew?[{type:'续费',amount:renew.payload.amount,count:renew.payload.count}]:[])]},missing:['整月出勤、完整成本、自然月末花名册与逐笔现金须分别提供；没有据汇总数量模拟流水。',...(undated.length?['退费资料存在无日期记录，暂不确认完整净额。']:[])]}});
 }
 const changeRows=contexts.filter(c=>c.kind==='roster_change_row');if(changeRows.length)contexts.push({...changeRows[0],kind:'roster_change',payload:{rows:changeRows.map(c=>c.payload)}});
 // Zero rows never prove coverage. A user confirms the source coverage through the import receipt.
 const coverageLabel=options.coverageStart&&options.coverageEnd?options.coverageStart+'~'+options.coverageEnd:null;
 if(!coverageLabel)errors.push('请确认原始资料实际覆盖的开始、结束日期；不能用报告期间代替资料覆盖范围');
 if(options.coverageStart&&options.coverageEnd&&(!iso(options.coverageStart)||!iso(options.coverageEnd)||options.coverageStart>options.coverageEnd))errors.push('资料覆盖日期无效');
 const validated=contexts.filter(c=>c.kind==='cash_line');if(validated.length&&coverageLabel){for(const c of contexts.filter(c=>['cash_line','expense_line','refund_line','new_signup','renewal'].includes(c.kind)))c.period_label=coverageLabel;}
 contexts.push({kind:'source_coverage',period_label:coverageLabel,status:'confirmed_fact',source_label:'导入确认回执',payload:{income:tables.some(t=>t.kind==='cash_line'),expense:tables.some(t=>t.kind==='expense_line'),refund:tables.some(t=>t.kind==='refund_line'),issues:[...new Set(issues)]}});
 return {version:1,period,contexts,tables,issues:[...new Set(issues)],errors:[...new Set(errors)],duplicates,importedRows,schemas,fieldLabels:Object.fromEntries(Object.entries(fields).map(([k,v])=>[k,v[0]])),kindLabels:labelNames,coverage:{start:options.coverageStart||null,end:options.coverageEnd||null},snapshotDate:options.snapshotDate||null};
}
module.exports={importUploads,suggest,schemas,fields};
