'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const KEY=Symbol.for('greatstart.ai.live.budget');
function budgetError(message){const e=new Error(message);e.code='AI_TEST_BUDGET';e.notSent=true;return e;}
function createGuard({directory,scope,nativeFetch}){
 if(scope.authorized!==true||scope.maxCostCny!==5||scope.model!=='doubao-seed-2-1-lite-260915')throw Error('真实模型测试授权无效');
 fs.mkdirSync(directory,{recursive:true,mode:0o700});const file=path.join(directory,'supplier-budget.private.json'),lock=file+'.lock';
 if(!fs.existsSync(file))fs.writeFileSync(file,JSON.stringify({approvalId:scope.approvalId,calls:[],actualCashCharge:null,freeQuotaDeduction:null},null,2),{mode:0o600,flag:'wx'});
 const read=()=>{const l=JSON.parse(fs.readFileSync(file,'utf8'));if(l.approvalId!==scope.approvalId)throw budgetError('预算批次不匹配，已停止真实调用');return l;};
 const persist=l=>{const tmp=file+'.'+process.pid+'.tmp';fs.writeFileSync(tmp,JSON.stringify(l,null,2),{mode:0o600});fs.renameSync(tmp,file);};
 const locked=fn=>{try{fs.mkdirSync(lock,{mode:0o700});}catch{throw budgetError('预算记录正在更新，请稍后再试');}try{const l=read(),out=fn(l);persist(l);return out;}finally{fs.rmdirSync(lock);}};
 const exposure=l=>l.calls.reduce((n,c)=>n+(c.estimatedNanoCny??c.reservedNanoCny),0);
 const status=()=>{const l=read(),known=l.calls.reduce((n,c)=>n+(c.estimatedNanoCny??0),0),exposed=exposure(l);return {approvalId:scope.approvalId,model:scope.model,limitCny:5,estimatedCny:known/1e9,reservedExposureCny:exposed/1e9,remainingCny:Math.max(0,5-exposed/1e9),calls:l.calls.length,usageUnknownCalls:l.calls.filter(c=>!c.usage).length,actualCashCharge:null,freeQuotaDeduction:null,exhausted:exposed>=5e9,blockedReason:l.blockedReason||null};};
 async function guarded(input,init={}){
  const url=String(input instanceof Request?input.url:input);if(!url.includes('/chat/completions'))return nativeFetch(input,init);
  if(url!=='https://ark.cn-beijing.volces.com/api/v3/chat/completions')throw budgetError('本轮仅允许已批准的豆包模型接口');
  let body;try{body=JSON.parse(String(init.body));}catch{throw budgetError('真实模型请求格式无效');}
  if(body.model!==scope.model||!Array.isArray(body.messages)||body.messages.some(m=>typeof m.content!=='string'))throw budgetError('模型或输入格式不在本轮授权范围');
  const max=body.max_tokens;if(!Number.isSafeInteger(max)||max<1||max>8000)throw budgetError('真实模型输出上限必须为1至8000 Token');
  const inputUpper=Buffer.byteLength(JSON.stringify(body.messages),'utf8')+4096+body.messages.length*128;if(inputUpper>100000)throw budgetError('本轮单次输入超过上限，请缩小资料范围');
  // Conservative admission before free quota or cache discounts; usage-unknown calls retain their full reservation.
  const reserve=inputUpper*800+max*2700;const entry=locked(l=>{if(l.blockedReason)throw budgetError('真实模型测试已停止：'+l.blockedReason);if(exposure(l)+reserve>5e9)throw budgetError('本轮5元预算不足本次最坏用量，已停止真实调用');const c={id:crypto.randomUUID(),at:new Date().toISOString(),requestedModel:body.model,purpose:body.messages.some(m=>m.content.includes('【意图解析】'))?'intent':body.stream?'answer_or_summary':'operating_report',inputUpper,maxOutputTokens:max,reservedNanoCny:reserve,status:'started',usage:null,estimatedNanoCny:null};l.calls.push(c);return c;});
  body.thinking={type:'disabled'};body.service_tier='default';if(body.stream)body.stream_options={include_usage:true};let terminal=false,usage=null,returnedModel=null;
  const finish=(reason,complete)=>{if(terminal)return;terminal=true;locked(l=>{const c=l.calls.find(c=>c.id===entry.id);c.finishedAt=new Date().toISOString();c.returnedModel=returnedModel;c.usage=usage;c.complete=!!complete;c.status=reason?'failed_or_usage_unknown':'received';if(reason)c.reason=String(reason).slice(0,220);const cached=usage?.prompt_tokens_details?.cached_tokens||0;if(usage&&[usage.prompt_tokens,usage.completion_tokens,cached].every(n=>Number.isSafeInteger(n)&&n>=0)&&cached<=usage.prompt_tokens&&usage.prompt_tokens<=inputUpper&&usage.completion_tokens<=max&&returnedModel===scope.model){c.estimatedNanoCny=(usage.prompt_tokens-cached)*800+cached*160+usage.completion_tokens*2700;}else{c.status='usage_unknown';if(returnedModel&&returnedModel!==scope.model)l.blockedReason='供应商返回了未批准的模型';}if(exposure(l)>5e9)l.blockedReason='用量超出保守预留，需要核查';});};
  const signal=AbortSignal.any([...(init.signal?[init.signal]:[]),AbortSignal.timeout(120000)]);
  try{const res=await nativeFetch(url,{...init,body:JSON.stringify(body),redirect:'error',signal});locked(l=>{l.calls.find(c=>c.id===entry.id).httpStatus=res.status;});if(!res.ok||!res.body){finish('HTTP '+res.status,false);return res;}
   if(!body.stream){const bytes=Buffer.from(await res.arrayBuffer());try{const j=JSON.parse(bytes.toString('utf8'));usage=j.usage||null;returnedModel=j.model||null;finish(null,true);}catch(e){finish('供应商返回格式无效',false);throw e;}return new Response(bytes,{status:res.status,headers:res.headers});}
   const reader=res.body.getReader(),decoder=new TextDecoder();let pending='',doneMarker=false;
   const parse=text=>{pending+=text;const lines=pending.split('\n');pending=lines.pop()||'';for(const line of lines){if(!line.startsWith('data:'))continue;const raw=line.slice(5).trim();if(raw==='[DONE]'){doneMarker=true;continue;}if(!raw)continue;const j=JSON.parse(raw);if(j.error)throw Error('供应商流返回错误');if(j.model)returnedModel=j.model;if(j.usage)usage=j.usage;}};
   const stream=new ReadableStream({async pull(controller){try{const r=await reader.read();if(r.done){parse(decoder.decode()+'\n');finish(doneMarker?null:'供应商流未完整结束',doneMarker);controller.close();}else{parse(decoder.decode(r.value,{stream:true}));controller.enqueue(r.value);}}catch(e){finish('供应商流中断',false);controller.error(e);}},async cancel(reason){finish('用户已停止',false);await reader.cancel(reason);}});return new Response(stream,{status:res.status,headers:res.headers});
  }catch(e){finish('请求失败或已停止',false);throw e;}
 }
 return {fetch:guarded,status,file};
}
function installFromEnv(){if(process.env.AI_LIVE_TEST_MODE!=='1')return null;if(globalThis[KEY])return globalThis[KEY];if(process.env.AI_PROVIDER!=='ark'||process.env.ARK_MODEL!=='doubao-seed-2-1-lite-260915')throw Error('真实AI测试不可使用mock或其他模型');const root=process.env.AI_WORKBENCH_RUNTIME_DIR;if(!root)throw Error('真实AI测试缺少运行目录');const scope=JSON.parse(fs.readFileSync(path.join(root,'live-scope.private.json'),'utf8'));if(new URL(process.env.DATABASE_URL).pathname!=='/'+scope.database)throw Error('真实AI测试数据库不匹配');const guard=createGuard({directory:path.join(root,'budget'),scope,nativeFetch:globalThis.fetch.bind(globalThis)});globalThis.fetch=guard.fetch;globalThis[KEY]=guard;return guard;}
function statusFromEnv(){return installFromEnv()?.status()||null;}
module.exports={createGuard,installFromEnv,statusFromEnv};
