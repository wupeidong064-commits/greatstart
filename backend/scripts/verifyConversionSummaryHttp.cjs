// Isolated PostgreSQL and HTTP tests, never uses the working database.
const { execFileSync, spawn }=require('node:child_process'), { randomUUID,randomBytes }=require('node:crypto'), { userInfo }=require('node:os');
const { PrismaClient }=require('@prisma/client'), bcrypt=require('bcryptjs'),assert=require('node:assert/strict'),net=require('node:net');
const db='buzzer_conversion_summary_'+randomBytes(6).toString('hex'),url='postgresql://'+encodeURIComponent(userInfo().username)+'@127.0.0.1:5432/'+db;
const env={...process.env,DATABASE_URL:url,DATABASE_DIRECT_URL:url,JWT_SECRET:randomBytes(32).toString('hex'),NODE_ENV:'test',AI_PROVIDER:'mock',};
const p=new PrismaClient({datasources:{db:{url}}});let child,created=false;const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
(async()=>{
 const socket=net.createServer();await new Promise(resolve=>socket.listen(0,'127.0.0.1',resolve));const port=socket.address().port;await new Promise(resolve=>socket.close(resolve));env.PORT=String(port);
 execFileSync('createdb',['-h','127.0.0.1',db]);created=true;execFileSync('./node_modules/.bin/prisma',['migrate','deploy'],{cwd:__dirname+'/..',env,stdio:'pipe'});
 const org=await p.organization.create({data:{name:'汇总隔离',code:randomUUID()}}),other=await p.organization.create({data:{name:'其他机构',code:randomUUID()}});
 const campus=await p.campus.create({data:{name:'校区',code:'MAIN',organizationId:org.id}}),otherCampus=await p.campus.create({data:{name:'外校区',code:'MAIN',organizationId:other.id}}),siblingCampus=await p.campus.create({data:{name:'同机构其他校区',code:'SECOND',organizationId:org.id}});
 const password=randomUUID(),hash=await bcrypt.hash(password,10),makeUser=async(role,c)=>p.user.create({data:{name:role,email:randomUUID()+'@test.local',role,password:hash,organizationId:c.organizationId,campusId:c.id}});
 const admin=await makeUser('manager',campus),salesA=await makeUser('sales',campus),salesB=await makeUser('sales',campus),teacher=await makeUser('teacher',campus),otherAdmin=await makeUser('manager',otherCampus),siblingSales=await makeUser('sales',siblingCampus);
 const unassigned=await p.user.create({data:{name:'无校区管理员',email:randomUUID()+'@test.local',role:'manager',password:hash,organizationId:org.id,campusId:null}});
 const cls=await p.class.create({data:{name:'班',code:'C',courseType:'通用',organizationId:org.id,campusId:campus.id}}),otherClass=await p.class.create({data:{name:'外校班',code:'C',courseType:'通用',organizationId:other.id,campusId:otherCampus.id}}),siblingClass=await p.class.create({data:{name:'同机构其他校班',code:'S',courseType:'通用',organizationId:org.id,campusId:siblingCampus.id}});
 const s1=await p.student.create({data:{name:'张一',organizationId:org.id,campusId:campus.id}}),s2=await p.student.create({data:{name:'张二',organizationId:org.id,campusId:campus.id}});
 async function order({user,student,klass=cls,date,price,type='新签',name}){return p.conversion.create({data:{organizationId:user.organizationId,studentId:student?.id||null,classId:klass?.id||null,salesId:user.id,studentName:name||'测试',contact:'',conversionDate:date,price,courseType:type}})}
 const a1=await order({user:salesA,student:s1,date:'2026-10-28',price:'0.10'});
 await order({user:salesA,student:s1,date:'2026-10-30',price:'0.20'});
 await order({user:salesA,student:s2,date:'2026-11-01',price:'8.99',type:'续费'});
 await order({user:salesA,klass:null,date:'2026-11-02',price:'9.10'});
 const b1=await order({user:salesB,student:s2,date:'2026-10-29',price:'10.03'});
 await order({user:salesB,date:'2026-11-03',price:'2.05'});
 await p.conversion.create({data:{organizationId:org.id,studentId:s1.id,classId:cls.id,studentName:'无金额',contact:'',conversionDate:'2026-11-04',price:null}});
 await order({user:otherAdmin,klass:otherClass,date:'2026-11-01',price:'999.99'});
 await order({user:siblingSales,klass:siblingClass,date:'2026-11-01',price:'999.99'});
 child=spawn(process.execPath,['--import','tsx','src/index.ts'],{cwd:__dirname+'/..',env,stdio:'ignore'});const base='http://127.0.0.1:'+port;let ready=false;for(let i=0;i<100;i++){try{if((await fetch(base+'/health')).ok){ready=true;break}}catch{}await delay(150)}assert(ready);
 async function http(method,path,token,body,status){const r=await fetch(base+path,{method,headers:{'content-type':'application/json',...(token?{authorization:'Bearer '+token}:{})},body:body?JSON.stringify(body):undefined});const b=await r.json();assert.equal(r.status,status,method+' '+path+' '+JSON.stringify(b));return b;}
 const login=async u=>(await http('POST','/api/auth/login',null,{email:u.email,password},200)).data.token;
 const a=await login(admin),sa=await login(salesA),sb=await login(salesB),t=await login(teacher),noCampus=await login(unassigned);
 await http('GET','/api/conversions',noCampus,null,403);await http('GET','/api/conversions/summary',noCampus,null,403);
 async function verify(token,query,count,amount){const params=new URLSearchParams(query),summary=await http('GET','/api/conversions/summary?'+params,token,null,200);assert.equal(summary.data.count,count);assert.equal(summary.data.amount,amount);params.set('pageSize','2');params.set('page','1');let page=await http('GET','/api/conversions?'+params,token,null,200);assert.equal(page.pagination.total,count);const rows=[...page.data];for(let n=2;n<=Math.ceil(count/2);n++){params.set('page',String(n));page=await http('GET','/api/conversions?'+params,token,null,200);rows.push(...page.data)}assert.equal(rows.length,count);assert.equal(new Set(rows.map(x=>x.id)).size,count);const cents=rows.reduce((n,x)=>n+(x.price===null?0:Math.round(Number(x.price)*100)),0);assert.equal(cents,Math.round(amount*100));return rows}
 let rows=await verify(a,{},7,30.47);assert.equal(typeof rows.find(x=>x.id===a1.id).price,'string');
 await verify(a,{startDate:'2026-10-26',endDate:'2026-11-01'},4,19.32);
 await verify(a,{salesId:salesA.id},4,18.39);
 await verify(a,{studentId:s1.id},3,0.30);
 await verify(a,{unlinkedOnly:'true'},2,11.15);
 await verify(a,{studentId:s1.id,unlinkedOnly:'true'},0,0);
 await verify(a,{newOnly:'true'},6,21.48);
 await verify(a,{startDate:'2025-01-01',endDate:'2025-01-31'},0,0);
 await verify(sa,{},4,18.39);await verify(sb,{},2,12.08);await verify(t,{},0,0);
 await verify(sa,{salesId:salesB.id},0,0);await verify(sa,{studentId:s2.id},1,8.99);
 await http('GET','/api/conversions/'+b1.id,sa,null,404);
 await http('PUT','/api/conversions/'+b1.id,sa,{studentName:'越权'},404);
 await http('GET','/api/conversions/'+a1.id,sa,null,200);
 await http('GET','/api/conversions/summary?startDate=2026-12-01&endDate=2026-01-01',a,null,400);
 console.log('PASS 隔离 HTTP：Decimal 汇总跨页、日期/学员/负责人/未关联/新签组合、空集、员工越权、机构及校区隔离');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{if(child){child.kill('SIGTERM');await Promise.race([new Promise(resolve=>child.once('exit',resolve)),delay(3000)])}await p.$disconnect();if(created)execFileSync('dropdb',['-h','127.0.0.1','--if-exists',db])});
