import {useState} from 'react';
import {useAuthStore} from '../store/authStore';
import {message} from 'antd';
import {Modal} from './overlays';
import type {AiAttachment} from './AiAttachments';
async function call(url:string,body:any){const token=useAuthStore.getState().token;const r=await fetch((import.meta.env.VITE_API_BASE||'/api')+'/ai/report-imports/'+url,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(body)});const j=await r.json();if(!r.ok)throw Error(j.error?.message||j.message||'资料导入失败');return j.data;}
export default function ReportImportPanel({items,onChange,disabled}:{items:AiAttachment[];onChange:(items:AiAttachment[])=>void;disabled:boolean}){
 const [open,setOpen]=useState(false),[busy,setBusy]=useState(false),[preview,setPreview]=useState<any>(null),[error,setError]=useState('');
 const [kind,setKind]=useState('weekly'),[start,setStart]=useState(''),[end,setEnd]=useState(''),[coverageStart,setCoverageStart]=useState(''),[coverageEnd,setCoverageEnd]=useState(''),[snapshotDate,setSnapshotDate]=useState(''),[mappings,setMappings]=useState<any[]>([]);
 const body=()=>({uploadIds:items.map(a=>a.id),kind,periodStart:start,periodEnd:kind==='daily'?start:end,coverageStart,coverageEnd,snapshotDate:snapshotDate||undefined,mappings});
 const work=async(fn:()=>Promise<void>)=>{setBusy(true);setError('');try{await fn();}catch(e:any){setError(e.message);}finally{setBusy(false);}};
 const update=(table:any,key:string,value:any)=>{const old=mappings.find(m=>m.uploadId===table.uploadId&&m.table===table.table)||table;const next={uploadId:table.uploadId,table:table.table,headerRow:table.headerRow,kind:old.kind,columns:{...old.columns},amountUnit:old.amountUnit||'元',[key]:value};setMappings([...mappings.filter(m=>!(m.uploadId===table.uploadId&&m.table===table.table)),next]);setPreview((p:any)=>p?{...p,dirty:true,tables:p.tables.map((t:any)=>t.uploadId===table.uploadId&&t.table===table.table?{...t,...next}:t)}:p);};
 return <><button type="button" className="wb-btn-ghost" disabled={disabled||!items.length} onClick={()=>setOpen(true)}>用于运营报告 · 核对并导入资料</button>
 {open&&<Modal open={open} title="运营报告资料导入" onCancel={()=>{if(!busy)setOpen(false);}} width={980} footer={null}>
 <div className="wb-report-import" style={{padding:20,color:'var(--tx)'}}><p>确认资料的业务期间和字段。导入后用于报告分析，不写入学员、报名或成单业务记录。</p>
 <div style={{display:'flex',gap:12,flexWrap:'wrap',margin:'16px 0'}}>
 <label>报告类型 <select aria-label="导入报告类型" value={kind} onChange={e=>{setKind(e.target.value);setPreview(null);}}><option value="weekly">周报</option><option value="daily">日报</option><option value="monthly">月报</option></select></label>
 <label>报告开始 <input aria-label="导入报告开始" type="date" value={start} onChange={e=>{setStart(e.target.value);setPreview(null);}}/></label>
 <label>报告结束 <input aria-label="导入报告结束" type="date" disabled={kind==='daily'} value={kind==='daily'?start:end} onChange={e=>{setEnd(e.target.value);setPreview(null);}}/></label>
 <label>资料实际覆盖开始 <input aria-label="资料实际覆盖开始" type="date" value={coverageStart} onChange={e=>{setCoverageStart(e.target.value);setPreview(null);}}/></label>
 <label>资料实际覆盖结束 <input aria-label="资料实际覆盖结束" type="date" value={coverageEnd} onChange={e=>{setCoverageEnd(e.target.value);setPreview(null);}}/></label>
 <label>花名册快照（可选） <input aria-label="资料花名册快照" type="date" value={snapshotDate} onChange={e=>{setSnapshotDate(e.target.value);setPreview(null);}}/></label></div>
 <p style={{color:'var(--tx2)'}}>报告期间和资料覆盖可以不同。例如资料含11月1日收款、报告从2日开始，系统会分列期间外记录。日期不明的记录不会自动归期。</p>
 <button className="wb-btn-ghost" disabled={busy||!start||kind!=='daily'&&!end} onClick={()=>void work(async()=>setPreview(await call('preview',body())))}>{busy?'正在核对…':'识别资料并预览'}</button>
 {error&&<p role="alert" style={{color:'var(--bad)'}}>{error}</p>}
 {preview&&<div>{preview.dirty&&<p>字段已修改，请点击“识别资料并预览”重新核对后确认。</p>}<p>识别 {preview.importedRows} 条资料；相同文件跳过 {preview.duplicates.length} 份。以下内容确认后才进入报告。</p>
 {preview.tables.map((t:any)=><div key={t.uploadId+t.table} style={{padding:'12px 0',borderBottom:'1px solid var(--line)'}}><strong>{items.find(i=>i.id===t.uploadId)?.fileName} / {t.table}</strong><p>{t.label} · 原表{t.rows}行 · 识别{t.importedRows}条</p>
 <label>资料类型 <select aria-label={'资料类型 '+t.table} value={t.kind} onChange={e=>update(t,'kind',e.target.value)}><option value="">暂不使用</option>{Object.entries(preview.kindLabels).map(([key,label])=><option key={key} value={key}>{String(label)}</option>)}</select></label>
 {preview.schemas[t.kind]?.includes('amount')&&<label style={{marginLeft:12}}>原表金额单位 <select aria-label={t.table+' 金额单位'} value={t.amountUnit||'元'} onChange={e=>update(t,'amountUnit',e.target.value)}><option value="元">元</option><option value="万元">万元</option></select></label>}
 {preview.schemas[t.kind]?.map((field:string)=><label key={field} style={{display:'inline-block',margin:'8px 10px'}}>{preview.fieldLabels[field]||field} <select aria-label={t.table+' '+field} value={t.columns[field]??''} onChange={e=>update(t,'columns',{...t.columns,[field]:e.target.value===''?undefined:Number(e.target.value)})}><option value="">未映射</option>{t.headers.map((h:string,i:number)=><option value={i} key={i}>{h}</option>)}</select></label>)}</div>)}
 {preview.issues.length>0&&<ul>{preview.issues.map((s:string,i:number)=><li key={i}>{s}</li>)}</ul>}{preview.errors.length>0&&<ul style={{color:'var(--bad)'}}>{preview.errors.map((s:string,i:number)=><li key={i}>{s}</li>)}</ul>}
 <button className="wb-btn-ghost" disabled={busy||preview.dirty||preview.errors.length>0||!preview.importedRows} onClick={()=>void work(async()=>{const result=await call('confirm',{...body(),digest:preview.digest});onChange(items.map(i=>result.uploads.find((u:any)=>u.id===i.id)||i));message.success('报告资料已确认，可在对话框请求生成报告');setOpen(false);})}>确认作为报告资料</button></div>}
 </div></Modal>}</>;
}
