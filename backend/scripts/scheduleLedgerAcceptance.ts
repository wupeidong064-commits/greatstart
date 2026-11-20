import 'dotenv/config';
import p from '../src/config/database';
import bcrypt from 'bcryptjs';
import assert from 'node:assert/strict';
import {submitScheduleAttendance as submit} from '../src/services/scheduleAttendanceService';
import fs from 'node:fs';
async function main(){
 const code='SCHEDULE-QA-'+Date.now(), password='Schedule-QA-2026!';
 const o=await p.organization.create({data:{code,name:'课消独立验收'}});
 const c=await p.campus.create({data:{organizationId:o.id,code:'QA',name:'课消验收校区'}});
 const u=await p.user.create({data:{organizationId:o.id,campusId:c.id,email:code.toLowerCase()+'@accept.buzzer.test',password:await bcrypt.hash(password,10),name:'验收管理员',role:'admin'}});
 const cls=await p.class.create({data:{organizationId:o.id,campusId:c.id,code:'QA',name:'真实场次验收班',courseType:'篮球'}});
 const students=[];
 for(let i=0;i<5;i++){const s=await p.student.create({data:{organizationId:o.id,campusId:c.id,name:'课消验收'+i,phone:'1390000300'+i,purchasedLessons:i===4?0:10,remainingLessons:i===4?0:10}});students.push(s);await p.enrollment.create({data:{organizationId:o.id,classId:cls.id,studentId:s.id,enrolledAt:new Date('2026-01-01')}});}
 const now=new Date(), schedules=[];
 for(const d of [new Date(now.getFullYear(),now.getMonth(),now.getDate(),9),new Date(now.getFullYear(),now.getMonth(),1,10),new Date(now.getFullYear(),now.getMonth()-1,20,10)])schedules.push(await p.schedule.create({data:{organizationId:o.id,campusId:c.id,classId:cls.id,startTime:d,endTime:new Date(+d+3600000)}}));
 const actor={id:u.id,role:'admin',organizationId:o.id,campusId:c.id},id=schedules[0].id,entries=students.slice(0,2).map(s=>({studentId:s.id,status:'present'})),checks=[];
 await submit(actor,id,entries);await Promise.all(Array.from({length:8},()=>submit(actor,id,entries)));assert.equal(await p.lessonLog.count({where:{scheduleId:id}}),2);checks.push('8次并发重试不重复扣课');
 await submit(actor,id,[{studentId:students[0].id,status:'leave'}]);assert.equal((await p.student.findUniqueOrThrow({where:{id:students[0].id}})).remainingLessons,10);assert.equal(await p.lessonLog.count({where:{scheduleId:id,reversalOfId:{not:null}}}),1);checks.push('请假更正关联返还');
 await submit(actor,id,[{studentId:students[0].id,status:'late'}]);assert.equal((await p.student.findUniqueOrThrow({where:{id:students[0].id}})).remainingLessons,9);checks.push('恢复迟到扣1课时');
 const before=await p.lessonLog.count({where:{scheduleId:id}});await assert.rejects(()=>submit(actor,id,[{studentId:students[2].id,status:'present'},{studentId:students[4].id,status:'present'}]));assert.equal(await p.lessonLog.count({where:{scheduleId:id}}),before);assert.equal((await p.student.findUniqueOrThrow({where:{id:students[2].id}})).remainingLessons,10);checks.push('课时不足整批回滚');
 await assert.rejects(()=>submit({...actor,campusId:'other'},id,entries));await assert.rejects(()=>submit({...actor,role:'sales'},id,entries));checks.push('跨校区及销售拒绝');
 for(const s of schedules.slice(1))await submit(actor,s.id,[{studentId:students[1].id,status:'present'},{studentId:students[2].id,status:'leave'},{studentId:students[3].id,status:'absent'}]);
 const logs=await p.lessonLog.findMany({where:{organizationId:o.id}}),net=logs.reduce((n,l)=>n+(l.type==='deduct'?l.lessons:-l.lessons),0);assert.equal(net,4);checks.push('当月上月课消合计4课时');
 fs.mkdirSync('../docs/schedule-ledger',{recursive:true});fs.writeFileSync('../docs/schedule-ledger/acceptance.json',JSON.stringify({code,organizationId:o.id,campusId:c.id,email:u.email,password,checks,net,dates:schedules.map(s=>s.startTime),students:await p.student.findMany({where:{organizationId:o.id},select:{name:true,purchasedLessons:true,consumedLessons:true,remainingLessons:true}})},null,2));console.log(JSON.stringify({code,checks,net}));
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>p.$disconnect());
