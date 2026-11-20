import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { userInfo } from 'node:os';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Client } from 'pg';

async function main() {
  const db = 'consumption_history_' + randomBytes(6).toString('hex');
  const adminURL = new URL(`postgresql://${encodeURIComponent(userInfo().username)}@127.0.0.1:5432/postgres`);
  const admin = new Client({ connectionString: adminURL.toString() });
  let created = false, p: any;
  const checks: string[] = [];
  let evidence: any;
  await admin.connect();
  try {
    assert.match(db, /^consumption_history_[a-f0-9]+$/);
    await admin.query(`CREATE DATABASE "${db}"`);
    created = true;
    const url = new URL(adminURL); url.pathname = '/' + db;
    process.env.DATABASE_URL = url.toString(); process.env.DATABASE_DIRECT_URL = url.toString();
    process.env.NODE_ENV = 'test'; process.env.AI_PROVIDER = 'mock';
    execFileSync('./node_modules/.bin/prisma', ['migrate', 'deploy'], { cwd: process.cwd(), env: process.env, stdio: 'pipe' });
    p = (await import('../src/config/database')).default;
    const column = await p.$queryRaw`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='enrollments' AND column_name='endedAt'`;
    assert.equal(column.length, 1, '只能在已迁移新列的临时库执行');
    checks.push('独立临时库迁移确认 endedAt 列存在');
    const { querySessionAttendance, computeSessionAttendance } = await import('../src/services/attendanceStatsService');
    const { consumptionController } = await import('../src/controllers/consumptionController');
    const org = await p.organization.create({ data: { name: '调班历史隔离验收', code: db } });
    const campus = await p.campus.create({ data: { organizationId: org.id, name: '验收校区', code: 'QA' } });
    const cls = await p.class.create({ data: { organizationId: org.id, campusId: campus.id, code: 'QA', name: '复入原班', courseType: '篮球', capacity: 10 } });
    const student = await p.student.create({ data: { organizationId: org.id, campusId: campus.id, name: '复入学员', phone: '13900000000', purchasedLessons: 10, consumedLessons: 3, remainingLessons: 7 } });
    const actor = { id: 'qa-reader', organizationId: org.id, campusId: campus.id, role: 'admin' };
    const close = new Date('2026-11-03T03:00:00Z');
    await p.enrollment.create({ data: { organizationId: org.id, classId: cls.id, studentId: student.id, enrolledAt: new Date('2026-11-01T00:00:00Z'), endedAt: close, status: 'transferred' } });
    const reentry = { organizationId: org.id, classId: cls.id, studentId: student.id, enrolledAt: new Date('2026-11-04T00:00:00Z'), status: 'active' };
    await p.enrollment.create({ data: reentry });
    // A duplicated legacy re-entry row must not double the same student's denominator.
    await p.enrollment.create({ data: reentry });
    const ends = ['2026-11-02T03:00:00Z', close.toISOString(), '2026-11-03T04:00:00Z', '2026-11-04T03:00:00Z', '2026-11-05T03:00:00Z'];
    const schedules: any[] = [];
    for (let i = 0; i < ends.length; i++) {
      const endTime = new Date(ends[i]);
      const schedule = await p.schedule.create({ data: { organizationId: org.id, campusId: campus.id, classId: cls.id, startTime: new Date(+endTime - 3600000), endTime, status: 'completed' } });
      schedules.push(schedule);
      // Deliberately include two legacy attendances outside the valid enrollment window.
      await p.attendance.create({ data: { organizationId: org.id, classId: cls.id, studentId: student.id, scheduleId: schedule.id, status: 'present' } });
      if ([0,3,4].includes(i)) await p.lessonLog.create({ data: { organizationId: org.id, studentId: student.id, studentName: student.name, scheduleId: schedule.id, businessDate: ends[i].slice(0,10), type: 'deduct', lessons: 1 } });
    }
    const queryOne = (i: number) => querySessionAttendance({ organizationId: org.id, campusId: campus.id, classIds: [cls.id], startISO: schedules[i].startTime.toISOString(), endISO: schedules[i].startTime.toISOString() });
    const before = await queryOne(0); assert.equal(before.expected, 1); assert.equal(before.present, 1);
    checks.push('已知 transferred 结束时间：离班前真实课次仍计学员');
    const boundary = await queryOne(1), gap = await queryOne(2);
    assert.equal(boundary.expected,0); assert.equal(boundary.present,0); assert.equal(boundary.rate,null);
    assert.equal(gap.expected,0); assert.equal(gap.present,0);
    checks.push('离班时刻及之后复入前不追算，遗留出勤也不抬高分子');
    for (const i of [3,4]) { const result = await queryOne(i); assert.equal(result.expected,1); assert.equal(result.present,1); }
    checks.push('同班复入只计复入后场次，重复报名记录按学员去重');
    const whole = await querySessionAttendance({ organizationId: org.id, campusId: campus.id, classIds: [cls.id], startISO: '2026-11-01T00:00:00+08:00', endISO: '2026-11-05T23:59:59.999+08:00' });
    assert.equal(whole.expected,3); assert.equal(whole.present,3); assert.equal(whole.rate,100);
    // The shared pure function must also de-duplicate duplicated attendance rows.
    const enrollments = await p.enrollment.findMany({where:{classId:cls.id}});
    const attendances = await p.attendance.findMany({where:{classId:cls.id}});
    const pure = computeSessionAttendance({schedules,enrollments,attendances:[...attendances,...attendances]});
    assert.deepEqual({expected:pure.expected,present:pure.present,rate:pure.rate},{expected:3,present:3,rate:100});
    checks.push('全周期公共查库/内存公式均为应到3、实到3、100%，重复考勤不重复计');
    let response:any, error:any;
    await consumptionController.getStatistics({user:actor,body:{},query:{startDate:'2026-11-01',endDate:'2026-11-05'}} as any,{status(){return this},json(v:any){response=v;return this}} as any,(e:any)=>error=e);
    if(error)throw error;
    assert.equal(response.data.totalAttendanceCount,3); assert.equal(response.data.present,3); assert.equal(response.data.attendanceRate,100); assert.equal(response.data.totalAttendance,3); assert.equal(response.data.baseCount,1);
    checks.push('课消主接口透传 endedAt，与公共服务一致：应到3/实到3/净扣3/当前基本盘1');
    assert.equal(response.data.fullClassRate,10);
    checks.push('名额占用率同班重复活跃报名只计1个名额：1/10=10%');
    const otherClass=await p.class.create({data:{organizationId:org.id,campusId:campus.id,code:'QA-SECOND',name:'跨班名额',courseType:'篮球',capacity:30}});
    await p.enrollment.create({data:{organizationId:org.id,classId:otherClass.id,studentId:student.id,enrolledAt:new Date('2026-11-04T00:00:00Z'),status:'active'}});
    let across:any,acrossError:any;
    await consumptionController.getStatistics({user:actor,body:{},query:{startDate:'2026-11-01',endDate:'2026-11-05'}} as any,{status(){return this},json(v:any){across=v;return this}} as any,(e:any)=>acrossError=e);
    if(acrossError)throw acrossError;
    assert.equal(across.data.fullClassRate,5);assert.equal(across.data.baseCount,1);assert.equal(across.data.classCount,2);
    checks.push('同学员跨班分别占名额而基本盘仍去重：2/40=5%，基本盘1');

    evidence={checks,passed:checks.length,isolatedDatabase:db,endedAtVerified:true,expectedByOccurrence:[1,0,0,1,1],presentByOccurrence:[1,0,0,1,1],whole:{expected:whole.expected,present:whole.present,rate:whole.rate},occupancy:{duplicateSameClassPercent:10,acrossClassesPercent:5,rosterStudents:1},productionWrites:0,realModelRequests:0};
  } finally {
    if(p)await p.$disconnect();
    if(created)await admin.query(`DROP DATABASE "${db}" WITH (FORCE)`);
    await admin.end();
    if(evidence){evidence.cleanedTemporaryDatabase=true;const out=path.resolve('../docs/acceptance/2026-11-05-production-audit/consumption-transfer-history-evidence.json');fs.writeFileSync(out,JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence,null,2));}
  }
}
main().catch(e=>{console.error(e);process.exitCode=1});
