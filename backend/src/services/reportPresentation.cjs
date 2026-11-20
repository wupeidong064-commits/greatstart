'use strict';
const AdmZip=require('../../node_modules/adm-zip');
const ExcelJS=require('../../node_modules/exceljs');
const {assertPublicNarrative,reportAdviceNotice,stripReportAdviceNotice}=require('./reportQuality.cjs');
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const plain=s=>String(s??'').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g,'');
const val=(v,d=0)=>v===null||v===undefined||!Number.isFinite(Number(v))?'未提供':Number(v).toLocaleString('zh-CN',{minimumFractionDigits:d,maximumFractionDigits:d});
const money=v=>val(v,2), rate=v=>v===null||v===undefined?'未提供':val(v,2)+'%';
const src=ids=>(ids||[]).join('、');
function compactReferences(s){
 const text=String(s??'');if(!/^S\d{3,5}(?:[、,，]\s*S\d{3,5})*$/.test(text))return text;
 const numbers=[...new Set((text.match(/S\d{3,5}/g)||[]).map(id=>Number(id.slice(1))))].sort((a,b)=>a-b),parts=[];
 const name=n=>'S'+String(n).padStart(3,'0');
 for(let i=0;i<numbers.length;){let j=i;while(j+1<numbers.length&&numbers[j+1]===numbers[j]+1)j++;parts.push(j-i>=2?name(numbers[i])+'—'+name(numbers[j]):numbers.slice(i,j+1).map(name).join('、'));i=j+1;}return parts.join('、');
}
const readable=s=>String(s??'').replace(/（(来源|依据)：([^）]+)）/g,(_,label,ids)=>'（'+label+'：'+compactReferences(ids)+'）');
function blocksFor(f,n={}) {
 assertPublicNarrative(n);
 const orders=f.cash.sourceCaliber==='confirmed_orders';
 const showTargetProgress=!f.databaseObservation || f.databaseObservation.monthlyTargetComparable;
 const out=[],paragraphs=key=>(n.sections||[]).find(s=>s.key===key)?.paragraphs||[];
 const add=(key,title,paragraphs=[],tables=[])=>out.push({key,title,paragraphs,tables});
 const table=(title,headers,rows,types=[])=>({title,headers,rows,types});
 const metrics=Object.values(f.metrics);
 add('summary','经营摘要',n.summary?.length?n.summary:['本版已按所选业务日期核算，跨来源经营判断尚待真实模型验证。'],[
  table('核心指标',['指标','本期','单位','来源'],metrics.filter(m=>['cash.income','cash.count','sales.new','sales.renewal','lessons.consumption','lessons.rate','roster.current'].includes(m.id)).map(m=>[m.label,m.value===null?'未提供':m.unit==='元'?money(m.value):m.unit==='%'?val(m.value,2):val(m.value),m.unit,src(m.sourceIds)]),['text','text','text','text'])
 ]);
 add('lessons','课务、出勤与可比趋势',paragraphs('lessons'),[
  table('分馆课务',['场馆','应到人次','实到人次','出勤率','课消金额'],(f.lessons?.venues||[]).map(r=>[r.venue,r.due,r.actual,r.rate,r.consumption]),['text','integer','integer','percent','money']),
  table('周中与周末',['时段','应到人次','实到人次','出勤率'],['weekday','weekend'].filter(k=>f.lessons?.[k]).map(k=>[k==='weekday'?'周中':'周末',f.lessons[k].due,f.lessons[k].actual,f.lessons[k].rate]),['text','integer','integer','percent']),
  table('比较基准',['项目','本期','最近完整比较期','说明'],f.comparison?[
   ['课消金额',f.lessons?.consumption,f.comparison.consumption,f.comparison.label||'原始资料比较期'],
   ['出勤率',rate(f.lessons?.rate),rate(f.comparison.rate),'比较期如不相邻，不能称连续上周环比']
  ]:[],['text','number','number','text'])
 ]);
 const roster=f.roster;
 add('roster','基本盘变化与人员流转',paragraphs('roster'),[
  table('花名册口径',['指标','数值','说明'],roster?[
   ['快照日期',roster.snapshot,'快照时点单列，不冒充报告期间内的流量'],
   ['本期花名册',roster.current,'班级学员关系人次，非去重学员人数'],
   ['历史台账上期',roster.previous,'保留原台账口径'],
   ['可比口径上期',roster.comparablePrevious??null,'只用于与本期可比的增减'],
   ['可比增减',roster.comparableDelta??null,'移出可能涉及转班、更名或归档，不能直接确认为流失']
  ]:f.rosterReference?[
   ['相邻期初参照',f.rosterReference.before.value,f.rosterReference.before.date+'，不是自然月末口径'],
   ['相邻期末参照',f.rosterReference.after.value,f.rosterReference.after.date+'，不是自然月末口径'],
   ['使用边界','仅供相邻快照参照','不据此计算本月真实流失或自然月净增']
  ]:[],['text','text','text']),
  table('逐教练变化',['教练','上期可比','本期','增减','来源'],(roster?.changes||[]).map(r=>[r.coach,r.prev,r.curr,r.delta,r.sourceId]),['text','integer','integer','integer','text']),
  table('移出与加入的完整明细',['教练','变化类型','原表学员与班级记录','来源'],(roster?.changes||[]).flatMap(r=>[...(r.left||[]).map(text=>[r.coach,'移出待核',text,r.sourceId]),...(r.joined||[]).map(text=>[r.coach,'加入/更名待核',text,r.sourceId])]),['text','text','text','text'])
 ]);
 add('coach','教练表现与教学支持',paragraphs('coach'),[
  f.period.kind==='monthly'&&!orders?table('教练月度数据',['教练','新签金额','续费金额','不续费人数','课消金额','来源'],f.coaches.map(c=>[c.name,c.newAmount,c.renewalAmount,c.noRenewal,c.consumption,c.sourceId]),['text','money','money','integer','money','text']):table('完整教练数据',['教练','花名册人次','应到','实到','出勤率','课消金额','来源'],f.coaches.map(c=>[c.name,c.roster,c.due,c.actual,c.rate,c.consumption,c.sourceId]),['text','integer','integer','integer','percent','money','text'])
 ]);
 add('sales','新签、续费与转化漏斗',[...paragraphs('sales'),...paragraphs('renewal')],[
  table(orders?'本期成单结构':'本期收款结构',['业务类型','笔数','金额'],f.cash.byType.map(r=>[r.type,r.count,r.amount]),['text','integer','money']),
  table('漏斗过程',['部门','环节','本期数量','来源'],f.funnel.map(r=>[r.dept||'原表未标注',r.label,r.w1,r.sourceId]),['text','text','integer','text']),
  table('月度人员成单与续费'+(f.personnel?.length?'（来源：'+String(f.personnel[0]._prov?.file||'').split('/').pop()+'，'+(f.personnel[0]._prov?.sheet||'')+'第'+Math.min(...f.personnel.map(r=>r._prov?.row||0))+'—'+Math.max(...f.personnel.map(r=>r._prov?.row||0))+'行）':''),['人员','新签数','新签金额','续费数','续费金额','不续费人数'],(f.personnel||[]).map(r=>[r.name,r.newCount,r.newAmount,r.renewalCount,r.renewalAmount,r.noRenewal]),['text','integer','money','integer','money','integer']),
  table('新报与续费来源清单（按匹配日期分列，不强行归期）',['类型/姓名','收款匹配','金额','报名课时','负责人/授课','场馆与时段','来源'],(f.registrationLists||[]).map(r=>[r.type+'：'+r.name,(r.matchedDate||'日期待核')+'；'+r.matchStatus,r.amount,r.lessons,[r.recruiter||r.owner,r.classCoach].filter(Boolean).join(' / '),[r.venue,r.slot||r.time].filter(Boolean).join('；'),[r.sourceId,r.matchedCashSourceId].filter(Boolean).join('、')]),['text','text','money','number','text','text','text'])
 ]);
 add('cash','现金、目标与节奏',paragraphs('cash'),[
  table('期间收支',['项目','金额','口径'],[
   [f.cash.sourceCaliber==='confirmed_orders'?'本期确认成单总额':'本期现金收入',f.cash.income,orders?'已确认订单按成单业务日期统计':'按收款业务日期；未取得完整退费资料时不称净收入'],
   ['已确认退费',f.cash.refundsKnown?f.cash.refunds:null,'按退费业务日期；缺失保留未提供'],
   ['扣退费后的净成单',f.metrics['cash.netSales']?.value??null,orders?'已确认成单总额减本期通过退费':'收款减已取得的完整退费，单列展示'],
   ['有日期的当期退费',f.cash.knownRefunds??null,'若另有未定日期记录，不认定为完整退费'],
   ['仅扣已知退费后的暂算净额',f.cash.netAfterKnownRefunds??null,'归期或来源差异未核清前，不认定为最终净额'],
   ['已提供支出',f.cash.expenses,'只包含本轮资料，未推断为全部经营成本'],
   ['所提供收支净额',f.cash.net,'现金收入减已提供支出，不等同利润'],
   ['源资料覆盖额',f.cash.fileIncome,'与本期指标分列，保留资料原有期间口径'],
   ['期间外收入',f.cash.outsideAmount,'已从本期指标排除']
  ],['text','money','text']),
  table('目标与进度',['项目','目标金额','本期占月目标','来源/版本'],[
   ['课消',f.targets.lesson,showTargetProgress&&f.lessons?.consumption!=null&&f.targets.lesson?f.lessons.consumption/f.targets.lesson*100:null,f.targets.version],
   ['新签',f.targets.newSign,showTargetProgress&&f.targets.newSign&&f.metrics['sales.new']?.value!==null?f.metrics['sales.new'].value/f.targets.newSign*100:null,f.targets.version],
   ['续费',f.targets.renewal,showTargetProgress&&f.targets.renewal&&f.metrics['sales.renewal']?.value!==null?f.metrics['sales.renewal'].value/f.targets.renewal*100:null,f.targets.version],
   ['现金收入',f.targets.cash,showTargetProgress&&f.targets.cash&&f.cash.income!==null?f.cash.income/f.targets.cash*100:null,f.targets.version]
  ],['text','money','percent','text'])
 ]);
 if(f.contextNotes?.length)add('provided-notes','上传文档参考原文',f.contextNotes.map(r=>r.text+'（来源：'+r.sourceId+'；未结构化参考，未直接当作已核算事实）'));
 if(f.refundRows?.length)add('refunds','退费记录与日期核查',[],[table('报告期间及待核日期退费',['业务日期','姓名/事项','原表符号金额','退费流出金额','归期状态','来源'],f.refundRows.map(r=>[r.date,r.name||r.item||'',r.signedSourceAmount??r.amount,r.amount,r.date?'已按日期归入本期':'日期待核，未计入本期完整净额',r.sourceId]),['date','text','money','money','text','text'])]);
 const reporterCounts={};for(const d of f.daily)reporterCounts[d.reporter]=(reporterCounts[d.reporter]||0)+1;
 add('daily','主管日报与行动复盘',paragraphs('daily'),[
  table('汇报覆盖',['汇报人','本期条数'],Object.entries(reporterCounts),['text','integer'])
 ]);
 add('context','历史事项与执行承接',paragraphs('context'),[
  table('历史事项',['事项与原安排','原负责人/期限','本期证据核查','来源'],f.history.map(h=>{const review=(n.historyReview||[]).find(r=>r.historySourceId===h.sourceId);return [h.title+'；'+(h.standard||''),[h.owner,h.deadline].filter(Boolean).join('；'),review?review.status+'：'+review.assessment:h.status||'待核实',h.sourceId];}),['text','text','text','text'])
 ]);
 add('actions','经营风险与建议安排',[],[
  table('风险判断',['级别','风险','依据与待核实项','来源'],(n.risks||[]).map(r=>[r.level,r.title,r.reason,src(r.sourceIds)]),['text','text','text','text']),
  table('建议安排',['优先级','建议动作','建议负责人','建议时限','来源'],(n.actions||[]).map(r=>[r.priority,r.action,r.owner||'待确认',r.deadline||'待确认',src(r.sourceIds)]),['text','text','text','text','text'])
 ]);
 add('quality','资料完整性与核算说明',f.missing,[
  table('核算检查',['检查项','独立分项合计','报告指标','结果'],f.checks.map(r=>[r.name,r.expected,r.actual,r.pass?'一致':'不一致']),['text','number','number','text'])
 ]);
 add('income',orders?'成单逐笔核对':'收入逐笔核对',f.income.length?[]:['本轮只有对应期间的汇总资料，未取得完整逐笔流水；没有据汇总数量模拟生成明细。'],[
  table(orders?'本期成单明细':'本期收入明细',['业务日期','业务事项','场馆','金额',orders?'计价口径':'收款方式','成单人','来源'],[...f.income].sort((a,b)=>a.date.localeCompare(b.date)).map(r=>[r.date,r.dept,r.venue,r.amount,r.method,r.closer,r.sourceId]),['date','text','text','money','text','text','text']),
  table('期间外收入记录',['业务日期','业务事项','场馆','金额','来源'],f.outsideIncome.map(r=>[r.date,r.dept,r.venue,r.amount,r.sourceId]),['date','text','text','money','text']),
  table('已提供支出明细',['业务日期','事项','金额','来源'],f.expenses.map(r=>[r.date,r.item,r.amount,r.sourceId]),['date','text','money','text'])
 ]);
 if(f.daily.length)add('logs','主管日报原文与明日计划',[],[]);
 add('sources','来源索引',[],[
  table('资料来源',['编号','文件与表','行号','覆盖/说明'],f.sources.map(s=>[s.id,[s.label,s.sheet].filter(Boolean).join(' / '),s.row??'',[s.coverage,s.detail].filter(Boolean).join('；')||'原始资料']),['text','text','text','text'])
 ]);
 for(const block of out){block.paragraphs=block.paragraphs.map(stripReportAdviceNotice).filter(Boolean).map(readable);for(const t of block.tables)t.rows=t.rows.map(row=>row.map(v=>typeof v==='string'?compactReferences(readable(block.key==='actions'?stripReportAdviceNotice(v):v)):v));}
 const notice=reportAdviceNotice(n);if(notice)out.find(b=>b.key==='actions').paragraphs.push(notice);
 return out;
}
const display=(v,type)=>v===null||v===undefined?'未提供':type==='money'?money(v):type==='percent'?rate(v):['integer','number'].includes(type)&&typeof v==='number'?val(v,type==='integer'?0:2):String(v);
function renderHtml(f,n={},options={}) {
 const title=(options.organizationName||'机构')+'运营'+({weekly:'周报',daily:'日报',monthly:'月报'})[f.period.kind];
 const blocks=blocksFor(f,n);
 const table=t=>t.rows.length?`<h3>${esc(t.title)}</h3><div class="table-wrap"><table><thead><tr>${t.headers.map(h=>`<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${t.rows.map(row=>`<tr>${row.map((v,i)=>`<td${['money','integer','percent','number'].includes(t.types[i])?' class="num"':''}>${esc(display(v,t.types[i]))}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`:'';
 const logs=f.daily.map(d=>`<article class="log"><h3>${esc(d.date)} · ${esc(d.reporter)}</h3><p class="source">来源 ${esc(d.sourceId)}</p><h4>当日工作记录</h4>${String(d.summary||'未提供').split(/\n/).filter(Boolean).map(p=>`<p>${esc(p)}</p>`).join('')}<h4>明日计划</h4>${String(d.plan||'未提供').split(/\n/).filter(Boolean).map(p=>`<p>${esc(p)}</p>`).join('')}</article>`).join('');
 return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>
:root{--ink:#172434;--muted:#66758a;--paper:#fff;--canvas:#eff3f8;--line:#dce4ee;--brand:#234f80;--soft:#edf3fa;--warning:#8d590d;--warning-bg:#fff6df}*{box-sizing:border-box}body{margin:0;background:var(--canvas);color:var(--ink);font:15px/1.75 -apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif}.report{max-width:1120px;margin:30px auto;padding:38px 44px;background:var(--paper);border-radius:14px}.eyebrow{font-size:13px;letter-spacing:.12em;color:var(--brand)}h1{font-size:32px;line-height:1.3;margin:10px 0 12px}h2{font-size:21px;border-top:2px solid var(--line);padding-top:26px;margin-top:34px;color:var(--brand)}h3{font-size:16px;margin:22px 0 10px}h4{margin:15px 0 7px}.meta,.source{font-size:12px;color:var(--muted)}.status{padding:12px 16px;background:var(--warning-bg);color:var(--warning);border-radius:7px}.cards{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin:25px 0}.card{padding:18px;background:var(--soft);border-radius:8px}.card small{display:block;color:var(--muted)}.card strong{font-size:25px;display:block;font-variant-numeric:tabular-nums}.table-wrap{overflow-x:auto}table{border-collapse:collapse;width:100%;font-size:13px;margin-bottom:20px}th{text-align:left;background:var(--soft);font-weight:600}th,td{padding:10px 12px;border-bottom:1px solid var(--line);vertical-align:top;overflow-wrap:anywhere}.num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}p{margin:10px 0}.log{padding:10px 0 22px;border-bottom:1px solid var(--line)}.log p{white-space:pre-wrap}.footer{margin-top:32px;padding-top:20px;border-top:1px solid var(--line);font-size:12px;color:var(--muted)}@media(max-width:700px){.report{margin:0;padding:22px 16px;border-radius:0}.cards{grid-template-columns:repeat(2,1fr)}.table-wrap table{min-width:680px}h1{font-size:25px}}@media print{body{background:var(--paper)}.report{margin:0;max-width:none;padding:0}h2,h3{break-after:avoid}thead{display:table-header-group}.cards,.log h3{break-inside:avoid}table{font-size:10px}.table-wrap{overflow:visible}a{color:inherit}}
</style></head><body><main class="report"><div class="eyebrow">经营数据与行动复盘</div><h1>${esc(title)}</h1><p class="meta">${esc(f.period.start)} — ${esc(f.period.end)}${f.roster?' · 花名册快照 '+esc(f.roster.snapshot):''}</p>${!n.verified?'<p class="status">业务数据核算稿，经营分析待确认。</p>':''}<div class="cards">${['lessons.consumption','cash.income','lessons.rate','sales.renewal'].map(id=>f.metrics[id]).filter(Boolean).map(m=>`<div class="card"><small>${esc(m.label)}</small><strong>${esc(m.unit==='%'?val(m.value,2):m.unit==='元'?money(m.value):val(m.value))}</strong><small>${esc(m.unit)}</small></div>`).join('')}</div>${blocks.map((b,i)=>`<section id="${b.key}"><h2>${i+1}. ${esc(b.title)}</h2>${b.paragraphs.map(p=>`<p>${esc(p)}</p>`).join('')}${b.tables.map(table).join('')}${b.key==='logs'?logs:''}</section>`).join('')}<p class="footer">负责人、时限及经营动作以已确认安排或明确标注的建议为准。</p></main></body></html>`;
}
function renderDocx(f,n={},options={}) {
 const blocks=blocksFor(f,n), font='STHeiti';
 const p=(text,style='Normal')=>`<w:p><w:pPr><w:pStyle w:val="${style}"/></w:pPr><w:r><w:t xml:space="preserve">${esc(plain(text))}</w:t></w:r></w:p>`;
 const title=(options.organizationName||'机构')+'运营'+({weekly:'周报',daily:'日报',monthly:'月报'})[f.period.kind];
 const table=t=>{
  if(!t.rows.length)return '';
  const width=Math.floor(9600/t.headers.length),grid=t.headers.map(()=>`<w:gridCol w:w="${width}"/>`).join('');
  const row=(rs,header)=>`<w:tr>${header?'<w:trPr><w:tblHeader/></w:trPr>':''}${rs.map((v,i)=>`<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/>${header?'<w:shd w:fill="EDF3FA"/>':''}</w:tcPr>${p(header?v:display(v,t.types[i]),header?'TableHead':'TableText')}</w:tc>`).join('')}</w:tr>`;
  return p(t.title,'Heading2')+`<w:tbl><w:tblPr><w:tblW w:w="9600" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblBorders>${['top','left','bottom','right','insideH','insideV'].map(k=>`<w:${k} w:val="single" w:sz="3" w:color="DCE4EE"/>`).join('')}</w:tblBorders></w:tblPr><w:tblGrid>${grid}</w:tblGrid>${row(t.headers,true)}${t.rows.map(r=>row(r,false)).join('')}</w:tbl>`;
 };
 const body=[p(title,'Title'),p(`${f.period.start} — ${f.period.end}`)];
 if(!n.verified)body.push(p('业务数据核算稿，经营分析待确认。'));
 for(const b of blocks){body.push(p(b.title,'Heading1'),...b.paragraphs.flatMap(t=>String(t).split('\n').map(s=>p(s))),...b.tables.map(table));
  if(b.key==='logs')for(const d of f.daily){body.push(p(`${d.date} · ${d.reporter}`,'Heading2'),p(`来源 ${d.sourceId}`),p('当日工作记录','Heading2'),...String(d.summary||'未提供').split('\n').map(s=>p(s)),p('明日计划','Heading2'),...String(d.plan||'未提供').split('\n').map(s=>p(s)));}
 }
 const z=new AdmZip(),ns='http://schemas.openxmlformats.org/wordprocessingml/2006/main';
 z.addFile('[Content_Types].xml',Buffer.from('<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>'));
 z.addFile('_rels/.rels',Buffer.from('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'));
 z.addFile('word/_rels/document.xml.rels',Buffer.from('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="styles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'));
 z.addFile('word/styles.xml',Buffer.from(`<w:styles xmlns:w="${ns}"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="${font}" w:hAnsi="${font}" w:eastAsia="${font}"/><w:sz w:val="21"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="100" w:line="300" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>${[['Normal',21],['Title',34],['Heading1',27],['Heading2',23],['TableText',18],['TableHead',18]].map(([name,size])=>`<w:style w:type="paragraph" w:styleId="${name}"><w:name w:val="${name}"/><w:pPr>${name.startsWith('Heading')?'<w:keepNext/><w:spacing w:before="220" w:after="120"/>':''}</w:pPr><w:rPr><w:sz w:val="${size}"/>${name!=='Normal'&&name!=='TableText'?'<w:b/>':''}</w:rPr></w:style>`).join('')}</w:styles>`));
 const ct=z.readAsText('[Content_Types].xml').replace('</Types>','<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/></Types>');z.updateFile('[Content_Types].xml',Buffer.from(ct));
 const rel=z.readAsText('word/_rels/document.xml.rels').replace('</Relationships>','<Relationship Id="footer" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/></Relationships>');z.updateFile('word/_rels/document.xml.rels',Buffer.from(rel));
 z.addFile('word/footer1.xml',Buffer.from(`<w:ftr xmlns:w="${ns}"><w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:sz w:val="18"/></w:rPr><w:t xml:space="preserve">第 </w:t></w:r><w:fldSimple w:instr="PAGE"><w:r><w:t>1</w:t></w:r></w:fldSimple><w:r><w:t xml:space="preserve"> 页 / 共 </w:t></w:r><w:fldSimple w:instr="NUMPAGES"><w:r><w:t>1</w:t></w:r></w:fldSimple><w:r><w:t> 页</w:t></w:r></w:p></w:ftr>`));
 z.addFile('word/document.xml',Buffer.from(`<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="${ns}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>${body.join('')}<w:sectPr><w:footerReference w:type="default" r:id="footer"/><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1050" w:right="1153" w:bottom="1050" w:left="1153" w:footer="500"/></w:sectPr></w:body></w:document>`));
 return z.toBuffer();
}
async function renderXlsx(f,n={},options={}) {
 const wb=new ExcelJS.Workbook();wb.creator='蜂鸣课务';const blocks=blocksFor(f,n);
 function sheet(name,headers,rows,types=[],widths=[],extraTables=[]){
  const s=wb.addWorksheet(name,{views:[{state:'frozen',ySplit:1,showGridLines:false}]});
  const columnCount=Math.max(headers.length,...extraTables.map(t=>t.headers.length));
  s.columns=Array.from({length:columnCount},(_,i)=>({header:headers[i]||'',key:'c'+i,width:widths[i]||(['money','integer','percent','number'].includes(types[i])?18:30)}));
  s.getRow(1).font={name:'STHeiti',size:10,bold:true,color:{argb:'FFFFFFFF'}};s.getRow(1).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF234F80'}};s.getRow(1).height=25;
  const specifications=rows.map(data=>({data,types}));
  for(const t of extraTables){specifications.push({title:t.title},{header:t.headers},...t.rows.map(data=>({data,types:t.types})));}
  for(const spec of specifications){
   if(spec.title){s.addRow([]);const row=s.addRow([spec.title]);row.font={name:'STHeiti',size:12,bold:true};row.height=27;continue;}
   if(spec.header){const row=s.addRow(spec.header);row.font={name:'STHeiti',size:10,bold:true,color:{argb:'FFFFFFFF'}};row.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF234F80'}};row.height=25;continue;}
   const data=spec.data,rowTypes=spec.types;
   // Split long text into complete continuation rows; no cell is silently truncated.
   const split=s=>{const parts=[];let current='',lines=0,length=0;for(const c of s){current+=c;length++;if(c==='\n')lines++;if(length>=600||lines>=18){parts.push(current);current='';lines=0;length=0;}}if(current)parts.push(current);return parts.length?parts:[''];};
   const chunks=data.map(v=>typeof v==='string'?split(v):[v]);
   const count=Math.max(1,...chunks.map(v=>v.length));
   for(let part=0;part<count;part++){
    const row=s.addRow(chunks.map((c,i)=>part===0?c[0]??null:c.length>1?c[part]??null:(i===0||/来源/.test(headers[i]||'')||name==='主管日报原文'&&i===1)?c[0]:null));
    row.font={name:'STHeiti',size:10};row.alignment={vertical:'top',wrapText:true};
    let lines=1;
    row.eachCell((cell,i)=>{
     const type=rowTypes[i-1];if(type==='date'&&typeof cell.value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(cell.value)){cell.value=new Date(cell.value+'T00:00:00Z');cell.numFmt='yyyy-mm-dd';}
     else if(cell.value!==null&&cell.value!==undefined&&type==='percent'&&typeof cell.value==='number'){cell.value=cell.value/100;cell.numFmt='0.00%';}
     else if(type==='money'&&typeof cell.value==='number')cell.numFmt='#,##0.00';
     else if(['integer','number'].includes(type)&&typeof cell.value==='number')cell.numFmt=type==='integer'?'#,##0':'#,##0.00';
     if(typeof cell.value==='number')cell.alignment={vertical:'top',horizontal:'right'};
     const text=String(cell.value??'');lines=Math.max(lines,text.split('\n').reduce((n,line)=>n+Math.max(1,Math.ceil([...line].reduce((a,c)=>a+(c.charCodeAt(0)>255?2:1),0)/Math.max(10,(s.columns[i-1].width||30)-2))),0));
    });row.height=Math.min(400,Math.max(23,lines*15+8));
   }
  }
  if(rows.length&&!extraTables.length)s.autoFilter={from:'A1',to:{row:s.rowCount,column:headers.length}};
  if(extraTables.length)s.views=[{state:'normal',showGridLines:false}];
  s.pageSetup={paperSize:9,orientation:headers.length>5?'landscape':'portrait',fitToPage:true,fitToWidth:1,fitToHeight:0,printTitlesRow:'1:1'};return s;
 }
 sheet('报告信息',['项目','内容'],[
  ['机构',options.organizationName||'机构'],['报告类型',({weekly:'运营周报',daily:'运营日报',monthly:'运营月报'})[f.period.kind]||'运营报告'],
  ['开始日期',f.period.start],['结束日期',f.period.end],['分析状态',n.verified?'经营分析已生成，待人工验收':'业务数据核算稿，经营分析待确认'],
 ],['text','text'],[26,65]);
 const overview=sheet('经营总览',['项目','数值','单位','来源'],Object.values(f.metrics).map(m=>[m.label,m.value,m.unit,compactReferences(src(m.sourceIds))]),['text','number','text','text'],[35,26,18,45]);
 Object.values(f.metrics).forEach((m,i)=>{const cell=overview.getCell(i+2,2);if(m.value!==null&&m.value!==undefined&&m.unit==='%'){cell.value=m.value/100;cell.numFmt='0.00%';}else if(['人次','人','条','笔'].includes(m.unit))cell.numFmt='#,##0';});
 sheet('经营分析',['章节','分析内容','来源'],blocks.flatMap(b=>b.paragraphs.map(p=>[b.title,p,'详见来源索引'])),['text','text','text'],[26,100,25]);
 const sections=[['课务教练',['lessons','coach']],['新签与续费',['sales']],['基本盘变化',['roster']],['现金目标',['cash']],['风险与建议',['actions']],['核算与来源',['quality','sources']]];
 for(const [name,keys]of sections){
  const ts=blocks.filter(b=>keys.includes(b.key)).flatMap(b=>b.tables).filter(t=>t.rows.length);
  if(ts.length)sheet(name,ts[0].headers,ts[0].rows,ts[0].types,[30,24,26,26,30,26,28],ts.slice(1));
 }
 sheet(f.cash.sourceCaliber==='confirmed_orders'?'成单明细':'收入流水',['业务日期','业务事项','场馆','金额',f.cash.sourceCaliber==='confirmed_orders'?'计价口径':'收款方式','成单人','来源'],[...f.income].sort((a,b)=>a.date.localeCompare(b.date)).map(r=>[r.date,r.dept,r.venue,r.amount,r.method,r.closer,r.sourceId]),['date','text','text','money','text','text','text'],[18,48,22,20,22,24,18]);
 sheet('期间外收入',['业务日期','业务事项','场馆','金额','来源'],f.outsideIncome.map(r=>[r.date,r.dept,r.venue,r.amount,r.sourceId]),['date','text','text','money','text'],[18,48,22,20,18]);
 sheet('支出明细',['业务日期','支出事项','金额','来源'],f.expenses.map(r=>[r.date,r.item,r.amount,r.sourceId]),['date','text','money','text'],[18,70,20,18]);
 if(f.refundRows?.length)sheet('退费明细',['业务日期','姓名/事项','原表符号金额','退费流出金额','归期状态','来源'],f.refundRows.map(r=>[r.date,r.name||r.item||'',r.signedSourceAmount??r.amount,r.amount,r.date?'已按日期归入本期':'日期待核，未计入完整净额',r.sourceId]),['date','text','money','money','text','text'],[18,30,20,20,45,18]);
 sheet('主管日报原文',['业务日期','汇报人','当日工作记录','明日计划','来源'],f.daily.map(r=>[r.date,r.reporter,r.summary,r.plan,r.sourceId]),['date','text','text','text','text'],[18,25,95,70,16]);
 return Buffer.from(await wb.xlsx.writeBuffer());
}
module.exports={blocksFor,renderHtml,renderDocx,renderXlsx};
