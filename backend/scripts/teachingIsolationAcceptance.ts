import 'dotenv/config';
import assert from 'node:assert/strict';
import p from '../src/config/database';
import {scheduleController as sc} from '../src/controllers/scheduleController';
import {attendanceController as ac} from '../src/controllers/attendanceController';
import {lessonLogController as lc} from '../src/controllers/lessonLogController';
import {submitScheduleAttendance as submit} from '../src/services/scheduleAttendanceService';
async function call(fn:any,user:any,body:any={},id?:string){let data:any,error:any;await fn({user,body,params:{id},query:{}},{status(){return this},json(v:any){data=v;return this}},(e:any)=>error=e);if(error)throw error;return data?.data;}
async function main(){let org:any;const checks:string[]=[];try{
org=await p.organization.create({data:{code:'ISOLATED-TEACHING-'+Date.now(),name:'隔离课消验收'}});
const a=await p.campus.create({data:{organizationId:org.id,code:'A',name:'A'}}),b=await p.campus.create({data:{organizationId:org.id,code:'B',name:'B'}});
const u=await p.user.create({data:{organizationId:org.id,campusId:a.id,email:org.code+'@qa.invalid',password:'unused',name:'QA',role:'admin'}}),actor={id:u.id,organizationId:org.id,campusId:a.id,role:'admin'};
const cls=await p.class.create({data:{organizationId:org.id,campusId:a.id,code:'QA',name:'QA',courseType:'篮球'}});
const st=await p.student.create({data:{organizationId:org.id,campusId:a.id,name:'QA',phone:'13900000000',purchasedLessons:2,remainingLessons:2}}),other=await p.student.create({data:{organizationId:org.id,campusId:b.id,name:'B',phone:'13900000001'}});
await p.enrollment.create({data:{organizationId:org.id,classId:cls.id,studentId:st.id,enrolledAt:new Date('2020-01-01')}});
const old=await p.schedule.create({data:{organizationId:org.id,campusId:a.id,classId:cls.id,startTime:new Date('2026-11-01T01:00Z'),endTime:new Date('2026-11-01T02:00Z')}});
const moved=await call(sc.reschedule,actor,{newStartTime:'2026-11-02T01:00Z',newEndTime:'2026-11-02T02:00Z'},old.id);assert.equal(moved.status,'scheduled');await assert.rejects(()=>submit(actor,old.id,[{studentId:st.id,status:'present'}]));checks.push('调课原场次拒签、新场次可签');
await Promise.all(Array.from({length:5},()=>submit(actor,moved.id,[{studentId:st.id,status:'present'}])));assert.equal((await p.student.findUniqueOrThrow({where:{id:st.id}})).remainingLessons,1);checks.push('5次并发签到只扣1课');
const att=await p.attendance.findFirstOrThrow({where:{scheduleId:moved.id}});await assert.rejects(()=>call(ac.getAttendanceById,{...actor,campusId:b.id},{},att.id));checks.push('admin考勤详情跨校区拒绝');
await assert.rejects(()=>call(sc.deleteSchedule,actor,{},moved.id));checks.push('有考勤场次删除拒绝');
await submit(actor,moved.id,[{studentId:st.id,status:'leave'}]);assert.equal((await p.student.findUniqueOrThrow({where:{id:st.id}})).remainingLessons,2);checks.push('更正请假返还课时');
await assert.rejects(()=>call(lc.addLessons,actor,{studentId:other.id,lessons:3}));await assert.rejects(()=>call(lc.addLessons,{...actor,role:'sales'},{studentId:st.id,lessons:3}));await assert.rejects(()=>call(lc.addLessons,actor,{studentId:st.id,lessons:'3'}));await assert.rejects(()=>call(lc.createLessonLog,actor,{studentId:st.id,type:'deduct',lessons:1}));checks.push('跨校区、销售、字符串课时、直接流水均拒绝');
await Promise.all(Array.from({length:5},()=>call(lc.addLessons,actor,{studentId:st.id,lessons:1})));const final=await p.student.findUniqueOrThrow({where:{id:st.id}});assert.equal(final.remainingLessons,7);assert.equal(final.purchasedLessons,7);assert.equal(await p.lessonLog.count({where:{studentId:st.id,scheduleId:null,type:'add'}}),5);checks.push('5次并发增课余额与流水一致');
const zero=await p.student.create({data:{organizationId:org.id,campusId:a.id,name:'零余额',phone:'13900000002',remainingLessons:0,purchasedLessons:0}});await p.enrollment.create({data:{organizationId:org.id,classId:cls.id,studentId:zero.id,enrolledAt:new Date('2020-01-01')}});
const before=await p.lessonLog.count({where:{scheduleId:moved.id}});await assert.rejects(()=>submit(actor,moved.id,[{studentId:st.id,status:'present'},{studentId:zero.id,status:'present'}]));assert.equal((await p.student.findUniqueOrThrow({where:{id:st.id}})).remainingLessons,7);assert.equal(await p.lessonLog.count({where:{scheduleId:moved.id}}),before);checks.push('零余额整批签到事务回滚');
const pending=await p.schedule.create({data:{organizationId:org.id,campusId:a.id,classId:cls.id,startTime:new Date('2026-11-03T01:00Z'),endTime:new Date('2026-11-03T02:00Z')}});await p.schedule.update({where:{id:moved.id},data:{status:'scheduled'}});const cancelled=await call((req:any,res:any,next:any)=>{req.params.classId=req.params.id;return sc.cancelByClass(req,res,next)},actor,{},cls.id);assert.equal(cancelled.cancelledCount,1);assert.equal((await p.schedule.findUniqueOrThrow({where:{id:pending.id}})).status,'cancelled');assert.equal((await p.schedule.findUniqueOrThrow({where:{id:moved.id}})).status,'scheduled');checks.push('批量取消仅变更无流水场次并保留历史考勤');
console.log(JSON.stringify({checks,passed:checks.length},null,2));
}finally{if(org){await p.lessonDeductionRecord.deleteMany({where:{organizationId:org.id}});await p.user.deleteMany({where:{organizationId:org.id}});await p.organization.delete({where:{id:org.id}})};await p.$disconnect();}}
main().catch(e=>{console.error(e);process.exitCode=1});
