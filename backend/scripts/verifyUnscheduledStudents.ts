/** Real HTTP and PostgreSQL acceptance. Creates and drops only a random isolated database.
 * cd backend && TZ=America/Los_Angeles npx tsx scripts/verifyUnscheduledStudents.ts
 */
import assert from 'node:assert/strict';
import { Client } from 'pg';
import { execFileSync } from 'node:child_process';
import { userInfo } from 'node:os';
import { randomBytes } from 'node:crypto';
import express from 'express';
import jwt from 'jsonwebtoken';

async function main() {
  const db = 'unscheduled_' + randomBytes(6).toString('hex');
  const admin = new Client({ connectionString: `postgresql://${encodeURIComponent(userInfo().username)}@127.0.0.1:5432/postgres` });
  let created = false, prisma: any, server: any;
  const RealDate = Date, now = +new Date('2026-11-06T08:30:00Z'); // 上海 16:30，洛杉矶 00:30。
  const checks: string[] = [];
  await admin.connect();
  try {
    await admin.query(`CREATE DATABASE "${db}"`); created = true;
    await admin.query(`ALTER DATABASE "${db}" SET timezone = 'Asia/Shanghai'`);
    process.env.DATABASE_URL = `postgresql://${encodeURIComponent(userInfo().username)}@127.0.0.1:5432/${db}`;
    process.env.DATABASE_DIRECT_URL = process.env.DATABASE_URL;
    process.env.JWT_SECRET = randomBytes(48).toString('hex');
    process.env.NODE_ENV = 'test'; process.env.AI_PROVIDER = 'mock';
    execFileSync('./node_modules/.bin/prisma', ['migrate', 'deploy'], { env: process.env, stdio: 'pipe' });
    prisma = (await import('../src/config/database')).default;
    const timezone = await prisma.$queryRaw`SELECT current_setting('TimeZone') AS timezone` as Array<{timezone:string}>;
    assert.equal(timezone[0].timezone,'Asia/Shanghai');
    const { sessionTag } = await import('../src/middleware/auth');
    const { studentRoutes } = await import('../src/routes/students');
    const { enrollmentRoutes } = await import('../src/routes/enrollments');
    const { errorHandler } = await import('../src/middleware/errorHandler');
    const org = await prisma.organization.create({ data: { code: db, name: '未排班筛选验收' } });
    const foreignOrg = await prisma.organization.create({ data: { code: db + '_foreign', name: '外机构' } });
    const campus = await prisma.campus.create({ data: { organizationId: org.id, code: 'A', name: 'A' } });
    const otherCampus = await prisma.campus.create({ data: { organizationId: org.id, code: 'B', name: 'B' } });
    const foreignCampus = await prisma.campus.create({ data: { organizationId: foreignOrg.id, code: 'F', name: 'F' } });
    const user = (role: string, name: string) => prisma.user.create({ data: { organizationId: org.id, campusId: campus.id, role, name, email: `${name}@${db}.invalid`, password: 'isolated-fixture' } });
    const manager = await user('manager', 'manager'), sale = await user('sales', 'sale'), otherSale = await user('sales', 'otherSale'), teacher = await user('teacher', 'teacher'), otherTeacher = await user('coach', 'otherTeacher');
    let seq = 0;
    const cls = (extra = {}) => prisma.class.create({ data: { organizationId: org.id, campusId: campus.id, code: `class-${++seq}`, name: `班级${seq}`, courseType: '篮球', teacherId: teacher.id, ...extra } });
    const student = (name: string, extra = {}) => prisma.student.create({ data: { organizationId: org.id, campusId: campus.id, name, salesId: sale.id, ...extra } });
    const enroll = (s: any, c: any, extra = {}) => prisma.enrollment.create({ data: { organizationId: org.id, studentId: s.id, classId: c.id, enrolledAt: new Date(now - 86400000), ...extra } });
    const schedule = (c: any, extra = {}) => prisma.schedule.create({ data: { organizationId: org.id, campusId: campus.id, classId: c.id, startTime: new Date(now + 3600000), endTime: new Date(now + 7200000), ...extra } });
    const attendance = (s: any, sc: any, extra = {}) => prisma.attendance.create({ data: { organizationId: org.id, studentId: s.id, classId: sc.classId, scheduleId: sc.id, status: 'leave', isTemporary: true, ...extra } });
    const expected = new Set<string>(), regular = new Set<string>(), byName = new Map<string,string>();
    async function fixture(name: string, unscheduled: boolean, create?: (s: any, c: any) => Promise<unknown>) {
      const s = await student('目标-' + name), c = await cls(); regular.add(s.id); byName.set(name,s.id);
      if (unscheduled) expected.add(s.id);
      if (create) await create(s, c);
      return { s, c };
    }
    await fixture('无班', true);
    await fixture('有班无课', false, (s,c) => enroll(s,c));
    await fixture('今天后续', false, async(s,c) => { await enroll(s,c); await schedule(c); });
    await fixture('今天已过', false, async(s,c) => { await enroll(s,c); await schedule(c,{startTime:new Date(now-7200000),endTime:new Date(now-3600000)}); });
    await fixture('今天已开始', false, async(s,c) => { await enroll(s,c); await schedule(c,{startTime:new Date(now-1000),endTime:new Date(now+3600000)}); });
    await fixture('起始恰好现在', false, async(s,c) => { await enroll(s,c); await schedule(c,{startTime:new Date(now)}); });
    await fixture('上海次日凌晨', false, async(s,c) => { await enroll(s,c); await schedule(c,{startTime:new Date('2026-11-06T16:05:00Z'),endTime:new Date('2026-11-06T17:05:00Z')}); });
    for (const status of ['cancelled','rescheduled','completed']) await fixture('场次-'+status,false,async(s,c)=>{await enroll(s,c);await schedule(c,{status});});
    await fixture('调课新场次',false,async(s,c)=>{await enroll(s,c);const old=await schedule(c,{status:'rescheduled'});await schedule(c,{originalScheduleId:old.id});});
    await fixture('失效班级',true,async(s,c)=>{await enroll(s,c);await prisma.class.update({where:{id:c.id},data:{status:'inactive'}});await schedule(c);});
    for(const status of ['transferred','cancelled','completed']) await fixture('报名-'+status,true,async(s,c)=>{await enroll(s,c,{status});await schedule(c);});
    await fixture('报名晚于课末',true,async(s,c)=>{await enroll(s,c,{enrolledAt:new Date(now+7200001)});await schedule(c);});
    await fixture('报名恰在课末',true,async(s,c)=>{await enroll(s,c,{enrolledAt:new Date(now+7200000)});await schedule(c);});
    await fixture('离班恰在课末',false,async(s,c)=>{await enroll(s,c,{endedAt:new Date(now+7200000)});await schedule(c);});
    await fixture('离班晚于课末',false,async(s,c)=>{await enroll(s,c,{endedAt:new Date(now+7200001)});await schedule(c);});
    await fixture('离班早于场次',true,async(s,c)=>{await enroll(s,c,{endedAt:new Date(now-1)});await schedule(c);});
    await fixture('多个报名仅一个有效',false,async(s,c)=>{await enroll(s,c,{status:'transferred'});await enroll(s,c);await schedule(c);});
    await fixture('未来临时串课',true,async(s,c)=>{await attendance(s,await schedule(c));});
    await fixture('历史临时串课',true,async(s,c)=>{await attendance(s,await schedule(c,{startTime:new Date(now-7200000),endTime:new Date(now-3600000)}));});
    await fixture('已取消临时串课',true,async(s,c)=>{await attendance(s,await schedule(c,{status:'cancelled'}));});
    await fixture('非临时孤立记录',true,async(s,c)=>{await attendance(s,await schedule(c),{isTemporary:false});});
    await fixture('串课班级不匹配',true,async(s,c)=>{const wrong=await cls();await attendance(s,await schedule(c),{classId:wrong.id});});
    await fixture('外机构场次',false,async(s,c)=>{await enroll(s,c);await schedule(c,{organizationId:foreignOrg.id});});
    await fixture('外校区场次',false,async(s,c)=>{await enroll(s,c);await schedule(c,{campusId:otherCampus.id});});
    await fixture('外机构报名',true,async(s,c)=>{await enroll(s,c,{organizationId:foreignOrg.id});await schedule(c);});
    await fixture('外机构临时记录',true,async(s,c)=>{await attendance(s,await schedule(c),{organizationId:foreignOrg.id});});
    await fixture('外校区班级',true,async(s)=>{const c=await cls({campusId:otherCampus.id});await enroll(s,c);await schedule(c);});
    await fixture('外机构班级',true,async(s)=>{const c=await cls({organizationId:foreignOrg.id,campusId:foreignCampus.id});await enroll(s,c);await schedule(c);});
    const hidden = await student('目标-他人负责',{salesId:otherSale.id});
    const foreignStudent=await student('目标-外机构学员',{organizationId:foreignOrg.id,campusId:foreignCampus.id});
    const otherCampusStudent=await student('目标-外校区学员',{campusId:otherCampus.id});
    const teacherOwn=await student('教师本人跟进',{salesId:teacher.id});
    const teacherClass=await student('教师本人班级无后续',{salesId:otherSale.id}), tc=await cls();await enroll(teacherClass,tc);
    const teacherScheduled=await student('教师本人班级有后续',{salesId:otherSale.id}), ts=await cls();await enroll(teacherScheduled,ts);await schedule(ts);
    const teacherHidden=await student('他人教师班级',{salesId:otherSale.id}), th=await cls({teacherId:otherTeacher.id});await enroll(teacherHidden,th);
    // Freeze the application clock for current enrollment window checks.
    global.Date = new Proxy(RealDate,{construct(target,args){return Reflect.construct(target,args.length?args:[now]);},get(target,key){return key==='now'?()=>now:Reflect.get(target,key);}});
    const app=express();app.use(express.json());app.use('/api/students',studentRoutes);app.use('/api/enrollments',enrollmentRoutes);app.use(errorHandler);
    await new Promise<void>(resolve=>{server=app.listen(0,'127.0.0.1',resolve);});
    const base=`http://127.0.0.1:${server.address().port}/api/students`;
    const tokens=new Map<string,string>();
    for(const actor of [manager,sale,otherSale,teacher,otherTeacher])tokens.set(actor.id,jwt.sign({userId:actor.id,sessionTag:sessionTag(actor.password)},process.env.JWT_SECRET!,{algorithm:'HS256',expiresIn:'10m'}));
    async function get(actor:any,query:string){const response=await fetch(base+'/?'+query,{headers:{authorization:'Bearer '+tokens.get(actor.id)}});const body=await response.json() as any;assert.equal(response.status,200,JSON.stringify(body));return body;}
    const filtered=await get(manager,'unscheduledOnly=true&search=目标-&pageSize=1000');
    assert.deepEqual(new Set(filtered.data.map((s:any)=>s.id)),new Set([...expected,hidden.id]));
    assert.equal(filtered.pagination.total,expected.size+1);
    assert.ok(filtered.data.every((s:any)=>s.enrollments.length===0));
    checks.push(`真实HTTP：${regular.size}个样例符合未排班口径；有班无课也排除，课程时间/状态及临时串课不参与判定`);
    assert.ok(!filtered.data.some((s:any)=>[foreignStudent.id,otherCampusStudent.id].includes(s.id)));
    checks.push('仅认可同机构当前校区有效班级报名，筛选结果均无所属班级，关闭班级及失效报名不再显示');
    const normal=await get(sale,'unscheduledOnly=false&search=目标-&pageSize=1000');
    assert.deepEqual(new Set(normal.data.map((s:any)=>s.id)),regular);assert.equal(normal.pagination.total,regular.size);
    for(const name of ['失效班级','离班早于场次','报名晚于课末','外机构报名','外校区班级','外机构班级'])assert.equal(normal.data.find((s:any)=>s.id===byName.get(name)).enrollments.length,0);
    assert.equal(normal.data.find((s:any)=>s.id===byName.get('有班无课')).enrollments.length,1);
    const absent=await get(sale,'search=目标-&pageSize=1000');assert.deepEqual(absent,normal);
    checks.push('false/缺省保持全部列表，姓名搜索和原有负责人范围保留');
    const pages:string[]=[];let total=0;
    for(let page=1;page<=Math.ceil(expected.size/3)+1;page++){const body=await get(sale,`unscheduledOnly=true&search=目标-&pageSize=3&page=${page}`);assert.equal(body.pagination.total,expected.size);total=body.pagination.total;pages.push(...body.data.map((s:any)=>s.id));}
    assert.equal(pages.length,total);assert.deepEqual(new Set(pages),expected);
    assert.equal((await get(sale,'unscheduledOnly=true&search=无班')).pagination.total,1);
    assert.equal((await get(sale,'unscheduledOnly=true&search=今天后续')).pagination.total,0);
    assert.equal((await get(sale,'unscheduledOnly=true&salesId='+otherSale.id)).pagination.total,0);
    checks.push('筛选先于分页；多页无漏无重、总数一致；筛选+搜索/负责人交集正确');
    const teacherRows=await get(teacher,'unscheduledOnly=true&pageSize=1000');
    const teacherExpected=['外机构报名'].map(name=>byName.get(name)!);
    assert.deepEqual(new Set(teacherRows.data.map((s:any)=>s.id)),new Set([teacherOwn.id,...teacherExpected]));
    assert.ok(!teacherRows.data.some((s:any)=>[teacherHidden.id,teacherScheduled.id,foreignStudent.id,otherCampusStudent.id,hidden.id].includes(s.id)));
    checks.push('老师列表继续限本人当前在读班级或本人负责，销售列表继续限本人负责；筛选不扩大权限');
    async function remove(enrollmentId:string,method='PUT'){
      const response=await fetch(base.replace('/students','/enrollments')+'/'+enrollmentId,{method,headers:{authorization:'Bearer '+tokens.get(manager.id),'content-type':'application/json'},...(method==='PUT'?{body:JSON.stringify({status:'cancelled'})}:{})});
      const body=await response.json();assert.equal(response.status,200,JSON.stringify(body));
    }
    const moved=await student('移出-单班'), mc=await cls(), me=await enroll(moved,mc);
    assert.equal((await get(sale,'unscheduledOnly=true&search=移出-单班')).pagination.total,0);
    await remove(me.id);
    const afterRemove=await get(sale,'unscheduledOnly=true&search=移出-单班');assert.equal(afterRemove.pagination.total,1);assert.equal(afterRemove.data[0].id,moved.id);assert.deepEqual(afterRemove.data[0].enrollments,[]);
    const multi=await student('移出-多班'), ma=await cls(), mb=await cls(), ea=await enroll(multi,ma), eb=await enroll(multi,mb);
    await remove(ea.id);assert.equal((await get(sale,'unscheduledOnly=true&search=移出-多班')).pagination.total,0);
    const stillAssigned=await get(sale,'search=移出-多班');assert.equal(stillAssigned.data[0].enrollments.length,1);assert.equal(stillAssigned.data[0].enrollments[0].class.id,mb.id);
    await remove(eb.id);assert.equal((await get(sale,'unscheduledOnly=true&search=移出-多班')).pagination.total,1);
    const deleted=await student('移出-删除空报名'), dc=await cls(), de=await enroll(deleted,dc);await remove(de.id,'DELETE');assert.equal((await get(sale,'unscheduledOnly=true&search=移出-删除空报名')).pagination.total,1);
    checks.push('真实HTTP移出花名册：单班移出后出现；多班只移出一个仍排除，全部移出才出现；删除空报名后也出现');
    console.log(JSON.stringify({passed:checks.length,checks,fixtureCount:regular.size,unscheduledExpected:expected.size,clock:new RealDate(now).toISOString(),hostTimezone:process.env.TZ||Intl.DateTimeFormat().resolvedOptions().timeZone,databaseTimezone:timezone[0].timezone,realHttp:true,productionWrites:0,realModelRequests:0},null,2));
  } finally {
    global.Date=RealDate;
    if(server)await new Promise<void>((resolve,reject)=>server.close((err:any)=>err?reject(err):resolve()));
    if(prisma)await prisma.$disconnect();
    if(created)await admin.query(`DROP DATABASE "${db}" WITH (FORCE)`);
    await admin.end();
    if(created)console.log('Temporary acceptance database dropped.');
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
