// Only loopback HTTP and a newly-created local PostgreSQL database are used.
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const {spawn,execFileSync}=require('node:child_process');
const backend=path.resolve(__dirname,'../../backend');
const {Client}=require(path.join(backend,'node_modules/pg'));
const bcrypt=require(path.join(backend,'node_modules/bcryptjs'));
const output=path.join(__dirname,'integration-result.json');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
function page(file){let definition;global.Page=value=>definition=value;delete require.cache[require.resolve(file)];require(file);const instance={data:structuredClone(definition.data),setData(value){Object.assign(this.data,value);}};for(const [k,v]of Object.entries(definition))if(typeof v==='function')instance[k]=v.bind(instance);return instance;}
async function main(){
 const db='parent_mini_test_'+Date.now(),admin=new Client({connectionString:'postgresql://wupeidong@localhost:5432/postgres'});await admin.connect();await admin.query(`CREATE DATABASE "${db}"`);
 const env={...process.env,DATABASE_URL:`postgresql://wupeidong@localhost:5432/${db}`,DATABASE_DIRECT_URL:`postgresql://wupeidong@localhost:5432/${db}`,JWT_SECRET:'parent-mini-isolation-secret-0000000000000',NODE_ENV:'test',AI_PROVIDER:'mock',PORT:'3198'};
 let p,server;const events=[];
 try{
   execFileSync(path.join(backend,'node_modules/.bin/prisma'),['migrate','deploy'],{cwd:backend,env,stdio:'pipe'});
   process.env.DATABASE_URL=env.DATABASE_URL;process.env.DATABASE_DIRECT_URL=env.DATABASE_DIRECT_URL;
   const {PrismaClient}=require(path.join(backend,'node_modules/@prisma/client'));p=new PrismaClient();
   const org=await p.organization.create({data:{name:'家长小程序隔离测试',code:db}}),campus=await p.campus.create({data:{name:'独立校区',code:'one',organizationId:org.id}});
   const password='ParentMiniTest2026!',hash=await bcrypt.hash(password,10);
   const parent=await p.user.create({data:{name:'测试家长',email:'parent@mini.test',phone:'13800000000',password:hash,role:'parent',organizationId:org.id,campusId:campus.id}});
   const manager=await p.user.create({data:{name:'内部经理',email:'manager@mini.test',phone:'13800000001',password:hash,role:'manager',organizationId:org.id,campusId:campus.id}});
   const makeChild=(name,remainingLessons)=>p.student.create({data:{name,phone:'13900000000',parentPhone:'13800000000',organizationId:org.id,campusId:campus.id,purchasedLessons:10,consumedLessons:10-remainingLessons,remainingLessons}});
   const first=await makeChild('一号孩子',0),second=await makeChild('二号孩子',7),unbound=await makeChild('未绑定孩子',9);
   await p.parentStudentLink.createMany({data:[first,second].map(s=>({studentId:s.id,parentId:parent.id}))});
   const cls=await p.class.create({data:{name:'专属课程',code:'one',courseType:'体能',organizationId:org.id,campusId:campus.id}});
   const earlier=new Date(Date.now()-30*86400000);await p.enrollment.create({data:{organizationId:org.id,studentId:first.id,classId:cls.id,enrolledAt:earlier}});
   for(const [status,days] of [['completed',-2],['scheduled',1],['cancelled',2],['rescheduled',3]])await p.schedule.create({data:{organizationId:org.id,campusId:campus.id,classId:cls.id,status,startTime:new Date(Date.now()+days*86400000),endTime:new Date(Date.now()+days*86400000+3600000),classroom:'一号教室'}});
   const original=await p.lessonLog.create({data:{organizationId:org.id,studentId:first.id,studentName:first.name,type:'deduct',lessons:1,businessDate:'2026-11-01',createdAt:new Date(Date.now()-3000)}});
   const returned=await p.lessonLog.create({data:{organizationId:org.id,studentId:first.id,studentName:first.name,type:'add',lessons:1,reversalOfId:original.id,businessDate:'2026-11-01',createdAt:new Date(Date.now()-2000)}});
   for(let i=0;i<23;i++)await p.lessonLog.create({data:{organizationId:org.id,studentId:first.id,studentName:first.name,type:'deduct',lessons:1,businessDate:'2026-10-01',createdAt:new Date(Date.now()-100000-i*1000)}});
   await p.lessonLog.create({data:{organizationId:org.id,studentId:second.id,studentName:second.name,type:'refund',lessons:3,businessDate:'2026-11-02'}});
   for(let i=0;i<25;i++)await p.parentNotice.create({data:{studentId:first.id,title:'一号通知'+i,body:'课程变更请查看最新课表',occurredAt:new Date(Date.now()-i*1000)}});
   await p.parentNotice.create({data:{studentId:second.id,title:'二号孩子专属通知',body:'二号通知内容'}});
   server=spawn(process.execPath,['--import','tsx','src/index.ts'],{cwd:backend,env,stdio:['ignore','pipe','pipe']});server.stdout.on('data',()=>{});server.stderr.on('data',()=>{});
   let ready=false;for(let i=0;i<100;i++){try{await fetch('http://127.0.0.1:3198/health');ready=true;break;}catch{}await pause(100);}assert.ok(ready,'isolated backend failed to start');
   const storage=new Map();const trace=[];let navigation=[];let delayFirst=false;
   global.wx={getStorageSync:k=>storage.get(k),setStorageSync:(k,v)=>storage.set(k,v),removeStorageSync:k=>storage.delete(k),reLaunch:o=>navigation.push(o.url),showModal:o=>o.success({confirm:true}),stopPullDownRefresh(){},request(opts){
     const target=new URL(opts.url);target.protocol='http:';target.hostname='127.0.0.1';target.port='3198';
     if(opts.method==='GET')for(const [key,value]of Object.entries(opts.data||{}))target.searchParams.set(key,value);
     trace.push({method:opts.method,path:target.pathname,query:Object.fromEntries(target.searchParams)});
     (async()=>{if(delayFirst&&target.pathname.endsWith('/'+first.id))await pause(150);const response=await fetch(target,{method:opts.method,headers:opts.header,...(opts.method==='POST'?{body:JSON.stringify(opts.data)}:{})});opts.success({statusCode:response.status,data:await response.json()});})().catch(()=>opts.fail({}));
   }};
   const config=require('../config'),session=require('../utils/session'),api=require('../utils/api');assert.equal(config.apiBaseUrl,'');config.apiBaseUrl='https://loopback-fixture.invalid/api'; // in-memory only; wx transport maps strictly to local test server.
   const login=page('../pages/login/login');login.setData({identity:manager.email,password});await login.submit();assert.equal(session.get(),null);assert.match(login.data.error,/仅供家长/);events.push('real manager password accepted by auth but rejected by parent-only client');
   login.setData({identity:parent.phone,password});await login.submit();assert.ok(session.get());assert.equal(login.data.password,'');assert.ok(!JSON.stringify([...storage.values()]).includes(password));
   const home=page('../pages/home/home');home.onLoad();await home.onShow();assert.equal(home.data.students.length,2);assert.ok(!home.data.students.some(s=>s.id===unbound.id));assert.equal(home.data.child.id,first.id);assert.equal(home.data.child.remainingText,'0');assert.equal(home.data.logs.length,20);assert.ok(home.data.logsHasMore);assert.ok(home.data.notificationsHasMore);
   const correction=home.data.logs.find(row=>row.id===returned.id);assert.ok(correction);assert.equal(correction.value,'+1');assert.equal(correction.label,'更正返还');assert.ok(!/买课|购课/.test(correction.label));assert.equal(home.data.logs.find(row=>row.id===original.id).value,'−1');assert.equal(home.data.logs.find(row=>row.id===original.id).date,'2026-11-01');
   assert.deepEqual(home.data.schedules.map(s=>s.status).sort(),['cancelled','rescheduled','scheduled']);assert.ok(trace.filter(t=>t.path.includes('/parent/schedules/')).every(t=>t.query.startDate));events.push('bound children only; zero balance stays 0; historical deduction/reversal +1 never shown as purchase; future schedules include cancellation/reschedule and exclude completed past');
   await home.moreRecords({currentTarget:{dataset:{section:'logs'}}});await home.moreRecords({currentTarget:{dataset:{section:'notifications'}}});assert.equal(home.data.logs.length,25);assert.equal(new Set(home.data.logs.map(r=>r.id)).size,25);assert.equal(home.data.notifications.length,await p.parentNotice.count({where:{studentId:first.id}}));assert.ok(home.data.notifications.some(row=>row.title==='课程已安排'));assert.equal(home.data.logsHasMore,false);assert.equal(home.data.notificationsHasMore,false);events.push('real paginated logs20->25 and notices20->26 including database-generated course notification, no silent truncation');
   await home.changeChild({detail:{value:'1'}});assert.equal(home.data.child.id,second.id);assert.equal(home.data.child.remainingText,'7');assert.equal(home.data.schedules.length,0);assert.equal(home.data.logs.length,1);assert.equal(home.data.logs[0].label,'退费扣回');assert.equal(home.data.notifications[0].title,'二号孩子专属通知');events.push('second child without enrollment remains visible, shows own balance/refund log/notice and no first-child schedules');
   delayFirst=true;const old=home.changeChild({detail:{value:'0'}});const current=home.changeChild({detail:{value:'1'}});await Promise.all([old,current]);assert.equal(home.data.child.id,second.id);assert.equal(home.data.notifications[0].title,'二号孩子专属通知');events.push('delayed real first-child responses cannot replace newly selected second-child state');
   await assert.rejects(api.request('/parent/lesson-logs/'+unbound.id),error=>error.statusCode===403&&/未绑定/.test(error.message));home.logout();assert.equal(session.get(),null);assert.equal(home.data.child,null);events.push('unbound child API403; logout clears private state');
   const evidence={status:'PASS',transport:'mock wx API calls forwarded to actual loopback HTTP; real backend authentication+PostgreSQL',events,requests:trace};fs.writeFileSync(output,JSON.stringify(evidence,null,2)+'\n');console.log('PASS parent-mini real integration: '+events.join('; '));
 }finally{if(server){server.kill('SIGTERM');await new Promise(r=>server.exitCode!==null?r():server.once('exit',r));}if(p)await p.$disconnect();await admin.query(`DROP DATABASE "${db}" WITH (FORCE)`);await admin.end();console.log('CLEANED real integration backend and isolated database');}
}
main().catch(e=>{console.error(e.stack||e.message);process.exitCode=1;});
