// Companion to verifyTemporaryAttendanceHttp.cjs; refuses any non-disposable database.
import assert from 'node:assert/strict';
import p from '../src/config/database';
import { AI_TOOLS } from '../src/services/aiTools';
async function main(){
  assert.match(new URL(process.env.DATABASE_URL!).pathname,/^\/temporary_attendance_[a-f0-9]+$/);
  const [organizationId,campusId,classId,studentId,day,low]=process.argv.slice(2);
  const ctx={organizationId,campusId,today:day}, expected=Number(low);
  const students=await AI_TOOLS.find(t=>t.name==='low_attendance_students')!.run(ctx,{startDate:day,endDate:day});
  assert.equal(students.rows.filter(r=>r.姓名==='候选串课' && r.班级==='目标班').length,expected);
  const classes=await AI_TOOLS.find(t=>t.name==='low_attendance_classes')!.run(ctx,{startDate:day,endDate:day});
  assert.equal(classes.rows.filter(r=>r.班级==='目标班').length,expected);
  const attendance=await AI_TOOLS.find(t=>t.name==='class_attendance')!.run(ctx,{startDate:day,endDate:day,classId});
  assert.equal(attendance.rows[0].应到,2);assert.equal(attendance.rows[0].实到,expected?1:2);assert.equal(attendance.rows[0].出勤率,expected?'50%':'100%');
  if(expected){assert.equal(students.rows.find(r=>r.姓名==='候选串课' && r.班级==='目标班')?.含临时串课,'是');assert.equal(classes.rows.find(r=>r.班级==='目标班')?.学员数,1);assert.equal(classes.rows.find(r=>r.班级==='目标班')?.临时串课人次,1);}
  console.log(JSON.stringify({aiLowStudents:expected,aiLowClasses:expected,paidModelRequests:0}));
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>p.$disconnect());
