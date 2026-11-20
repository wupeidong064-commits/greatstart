// Disposable local database only. No shared 4310/5410 or paid services.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import express from 'express';
import jwt from 'jsonwebtoken';
import prisma from '../src/config/database';
import { studentRoutes } from '../src/routes/students';
import { errorHandler } from '../src/middleware/errorHandler';
import { sessionTag } from '../src/middleware/auth';
import { securityConfig } from '../src/config/security';

const root = '/Users/wupeidong/buzzer/greatstart';
const task = '/Users/wupeidong/.local/share/greatstart-five-fixes/20261113';
async function main() {
  const url = new URL(process.env.DATABASE_URL!);
  assert(['localhost','127.0.0.1'].includes(url.hostname));
  assert.match(url.pathname, /^\/buzzer_five_fixes_\d+$/);
  assert.equal(process.env.DATABASE_URL, process.env.DATABASE_DIRECT_URL);
  const org = await prisma.organization.create({data:{name:'独立五项验收',code:randomUUID()}});
  const campus = await prisma.campus.create({data:{name:'本校',code:'MAIN',organizationId:org.id}});
  const campus2 = await prisma.campus.create({data:{name:'同机构他校',code:'OTHER',organizationId:org.id}});
  const foreign = await prisma.organization.create({data:{name:'外机构',code:randomUUID()}});
  const otherCampus = await prisma.campus.create({data:{name:'他校',code:'OTHER',organizationId:foreign.id}});
  const scope = {organizationId:org.id,campusId:campus.id};
  const person = (role:string,extra={}) => prisma.user.create({data:{...scope,role,name:'隔离人员',email:randomUUID()+'@qa.invalid',password:'isolated-password-hash',...extra}});
  const admin = await person('staff',{managementLevel:'super'}),teacher=await person('coach'),second=await person('coach'),parent=await person('parent'),sales=await person('sales');
  const token=(user:typeof admin)=>jwt.sign({userId:user.id,sessionTag:sessionTag(user.password)},securityConfig.jwt.secret,{expiresIn:'1h'});
  const student=(name:string,extra={})=>prisma.student.create({data:{...scope,name,status:'active',remainingLessons:2,salesId:admin.id,...extra}});
  const mainStudent=await student('历史601次'),later=await student('区间后又续费'),none=await student('从未续费'),missing=await student('最近缺价');
  const other=await student('同校其他老师'),otherSchool=await student('同机构他校',{campusId:campus2.id}),otherOrg=await student('外机构学员',{organizationId:foreign.id,campusId:otherCampus.id,salesId:null});
  const cls=await prisma.class.create({data:{...scope,name:'本老师班',code:randomUUID(),teacherId:teacher.id,courseType:'篮球'}});
  const cls2=await prisma.class.create({data:{...scope,name:'别的老师班',code:randomUUID(),teacherId:second.id,courseType:'篮球'}});
  for (const s of [mainStudent,later,none,missing]) await prisma.enrollment.create({data:{organizationId:org.id,studentId:s.id,classId:cls.id,enrolledAt:new Date('2026-01-01')}});
  await prisma.enrollment.create({data:{organizationId:org.id,studentId:other.id,classId:cls2.id,enrolledAt:new Date('2026-01-01')}});
  const order=(studentId:string,date:string,price:number|null=100,extra={})=>({organizationId:org.id,studentId,studentName:'订单样例',contact:'13900000000',salesId:admin.id,conversionDate:date,price,totalLessons:10,courseType:'renewal',approvalStatus:'confirmed',...extra});
  await prisma.conversion.createMany({data:Array.from({length:600},(_,i)=>order(mainStudent.id,'2026-10-01',10,{courseType:['续费','renewal','续报'][i%3]}))});
  await prisma.conversion.createMany({data:[order(mainStudent.id,'2026-11-13',0),order(mainStudent.id,'2026-11-14',999,{approvalStatus:'voided'}),order(mainStudent.id,'2026-11-15',999,{courseType:'new'}),order(mainStudent.id,'2026-11-16',999,{approvalStatus:'pending'}),order(mainStudent.id,'2026-11-17',999,{organizationId:foreign.id}),order(later.id,'2026-11-01'),order(later.id,'2026-11-12'),order(missing.id,'2026-11-13',null),order(otherSchool.id,'2026-11-13'),order(otherOrg.id,'2026-11-13',7777,{organizationId:foreign.id})]});
  const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai'}).format(new Date());
  const day=(offset:number)=>new Date(Date.parse(today+'T00:00:00Z')+offset*86400000).toISOString().slice(0,10);
  const lost=[];
  for(let i=0;i<25;i++)lost.push(await student('回访样例'+i,{status:'lost',recallTeacherId:i<12?teacher.id:second.id,notes:'删除原因:时间问题, 预计召回时间:'+day(i<12?0:30)}));
  const invalid=await student('无效回访日',{status:'lost',notes:'预计召回时间:2026-02-30'});
  const boundary=await student('第七日',{status:'lost',recallTeacherId:teacher.id,notes:'预计召回时间:'+day(7)});
  const eighth=await student('第八日',{status:'lost',notes:'预计召回时间:'+day(8)});
  await student('异校召回',{status:'lost',campusId:campus2.id,notes:'预计召回时间:'+today});
  await student('外机构召回',{status:'lost',organizationId:foreign.id,campusId:otherCampus.id,salesId:null,notes:'预计召回时间:'+today});
  const app=express();app.use(express.json());app.use('/api/students',studentRoutes);app.use(errorHandler);
  app.get('/api/auth/me',(_req,res)=>res.json({success:true,data:{...admin,role:'admin',password:undefined}}));
  // Only dictionaries outside this audit's business reads use explicit fixture stubs.
  app.get('/api/users/teachers',(_req,res)=>res.json({success:true,data:[teacher,second].map(u=>({id:u.id,name:u.name,role:u.role}))}));
  app.get('/api/classes',(_req,res)=>res.json({success:true,data:[]}));
  app.get('/api/ai-credits/account',(_req,res)=>res.json({success:true,data:{status:'active',available:2000,balance:2000,reserved:0,totalTopup:2000,used:0}}));
  app.get('/api/ai-credits/packages',(_req,res)=>res.json({success:true,data:{packages:{small:{name:'轻享包',credits:2000,priceYuan:68},large:{name:'畅享包',credits:6800,priceYuan:168}}}}));
  app.get('/api/ai-credits/ledger',(_req,res)=>res.json({success:true,data:[]}));
  app.get('/api/*',(_req,res)=>res.json({success:true,data:[]}));
  app.use(express.static(task+'/frontend-dist'));app.get('*',(_req,res)=>res.sendFile(task+'/frontend-dist/index.html'));
  const server=await new Promise<ReturnType<typeof app.listen>>(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
  const base='http://127.0.0.1:'+(server.address() as any).port;
  const checks:string[]=[];
  const get=async(query:string,actor=admin)=>{const r=await fetch(base+'/api/students'+query,{headers:{Authorization:'Bearer '+token(actor)}});return {status:r.status,...await r.json() as any};};
  try {
    const history=await get('?includeRenewalHistory=true&search='+encodeURIComponent(mainStudent.name));assert.equal(history.status,200);const row=history.data[0];assert.equal(row.renewalCount,601);assert.equal(row.lastRenewalPrice,0);assert.equal(row.lastRenewalLessons,10);assert.equal(row.lastRenewalDate,'2026-11-13');checks.push('601笔有效续费全量聚合；排除作废/新签/待审/跨机构伪关联；真实0元保留');
    const unknown=await get('?includeRenewalHistory=true&search='+encodeURIComponent(missing.name));assert.equal(unknown.data[0].renewalCount,1);assert.equal(unknown.data[0].lastRenewalPrice,null);checks.push('缺价为null，续费次数仍为1，与真实零元不同');
    const first=await get('?includeRenewalHistory=true&search='+encodeURIComponent(none.name));assert.equal(first.data[0].renewalCount,0);assert.equal(first.data[0].lastRenewalDate,null);checks.push('从未续费为0次，无虚构日期或价格');
    const filtered=await get('?includeRenewalHistory=true&lastRenewalStartDate=2026-11-13&lastRenewalEndDate=2026-11-13');assert.deepEqual(new Set(filtered.data.map((r:any)=>r.id)),new Set([mainStudent.id,missing.id]));assert.equal(filtered.pagination.total,2);checks.push('最近有效续费日期筛选两端含当天，名单与总数一致且隔离校区/机构');
    const oldRange=await get('?lastRenewalStartDate=2026-11-01&lastRenewalEndDate=2026-11-02');assert(!oldRange.data.some((r:any)=>r.id===later.id));checks.push('区间内续费但区间后又续费者不属于最近续费日期范围');
    for(const query of ['?lastRenewalStartDate=2026-02-30','?lastRenewalStartDate=2026-11-03&lastRenewalEndDate=2026-11-01','?lastRenewalStartDate[]=2026-11-01','?recallableOnly[]=true'])assert.equal((await get(query)).status,400);checks.push('无效日期/倒置范围/数组参数拒绝');
    const own=await get('?includeRenewalHistory=true',teacher);assert(own.data.every((r:any)=>[mainStudent.id,later.id,none.id,missing.id].includes(r.id)));assert.equal(own.pagination.total,4);assert.equal((await get('?includeRenewalHistory=true&campusId='+campus2.id)).status,403);assert.equal((await get('?includeRenewalHistory=true',parent)).status,403);checks.push('真实教师职责、伪造校区、家长权限隔离保持');
    const recalled=await get('?status=lost&recallableOnly=true&pageSize=10');assert.equal(recalled.data.length,10);assert.equal(recalled.pagination.total,13);
    const recalled2=await get('?status=lost&recallableOnly=true&page=2&pageSize=10');assert.equal(recalled2.data.length,3);assert.equal(recalled2.pagination.total,13);const ids=[...recalled.data,...recalled2.data].map((r:any)=>r.id);assert.equal(new Set(ids).size,13);assert(ids.includes(boundary.id));assert(!ids.includes(eighth.id));assert(!ids.includes(invalid.id));checks.push('召回过滤在分页前执行，跨页10+3共13，不夹入远期/无效日/异校数据，含第7天');
    const recallTeacher=await get('?status=lost&recallableOnly=true&pageSize=100',teacher);assert.equal(recallTeacher.pagination.total,13);assert(recallTeacher.data.every((r:any)=>r.recallTeacherId===teacher.id));const recallOther=await get('?status=lost&recallableOnly=true',second);assert.equal(recallOther.pagination.total,0);checks.push('召回分页保留当前回访老师权限，不泄露他人学员');
    assert.equal((await get('?status=lost&recallableOnly=false&pageSize=100')).pagination.total,28);checks.push('取消召回筛选恢复完整本校流失名单');
    writeFileSync(root+'/docs/acceptance/2026-11-13-five-review-fixes/http-results.json',JSON.stringify({at:new Date().toISOString(),database:url.pathname.slice(1),passed:checks.length,checks,sharedBusinessWrites:0},null,2));
    writeFileSync(task+'/browser-config.json',JSON.stringify({base,token:token(admin),user:{...admin,role:'admin',password:undefined},mainStudentId:mainStudent.id}));
    console.log(JSON.stringify({passed:checks.length,ready:true}));
    // Browser runner shares this isolated HTTP server and real student endpoints.
    const {spawn}=await import('node:child_process');
    await new Promise<void>((resolve,reject)=>{const child=spawn(process.execPath,[task+'/browser.cjs'],{stdio:'inherit'});child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(new Error('Browser verification failed: '+code)));});
  } finally { await new Promise<void>(resolve=>server.close(()=>resolve())); }
}
main().catch(e=>{console.error(e.message);process.exitCode=1;}).finally(()=>prisma.$disconnect());
