'use strict';
const assert = require('node:assert/strict');

module.exports = async function verifyClassPause({ db, scope, account, klass, request, expect, passed }) {
  const home = await scope('停复课验收');
  const manager = await account(home, 'manager'), teacher = await account(home, 'coach');
  const cls = await klass(home, '停复课班', {teacherId:teacher.id}), other = await klass(home, '资源占用班');
  const student = await db.student.create({data:{...home,name:'测试学员'}});
  const state = async id => (await db.schedule.findUniqueOrThrow({where:{id}})).status;
  const status = value => request('PUT','/'+cls.id,manager.token,{status:value});
  const schedule = (method, suffix, body) => request(method,suffix,manager.token,body,'schedules');
  const add = (hours, status = 'scheduled') => db.schedule.create({data:{
    ...home,classId:cls.id,teacherId:teacher.id,classroom:'东馆',status,
    startTime:new Date(Date.now()+hours*3600000),endTime:new Date(Date.now()+(hours+0.5)*3600000),
  }});
  const late = await add(30), next = await add(1), cancelled = await add(40,'cancelled');
  const moved = await add(41,'rescheduled'), old = await add(-2), done = await add(36,'completed');
  const history = await add(3), manual = await add(4);
  const att = await db.attendance.create({data:{organizationId:home.organizationId,classId:cls.id,studentId:student.id,scheduleId:history.id,status:'leave'}});
  expect(await status('inactive'),200);
  expect(await status('inactive'),200);
  assert.equal(await state(next.id),'class_paused');
  assert.equal(await state(late.id),'class_paused');
  assert.deepEqual(await db.schedule.findUnique({where:{id:history.id}}),history);
  for (const record of [moved,cancelled,old,done]) assert.deepEqual(await db.schedule.findUnique({where:{id:record.id}}),record);
  const visible = expect(await schedule('GET','?classId='+cls.id),200).data.map(s=>s.id);
  for (const row of [next, late, history, moved, cancelled]) assert(!visible.includes(row.id));
  passed('未来未点名场次暂停，重复停课稳定；历史、已调课或取消场次及有考勤的行逐字段保留，课表隐藏停课场次');

  for (const row of [next,history]) {
    expect(await schedule('GET','/'+row.id+'/temporary-students?q=1234'),409);
    expect(await request('POST','/batch',manager.token,{scheduleId:row.id,entries:[{studentId:student.id,status:'present',temporary:true}]},'attendances'),409);
  }
  expect(await schedule('POST','',{classId:cls.id,startTime:next.startTime,endTime:next.endTime}),409);
  expect(await schedule('PUT','/'+next.id,{status:'scheduled'}),409);
  expect(await schedule('POST','/'+next.id+'/reschedule',{newStartTime:next.startTime,newEndTime:next.endTime}),409);
  expect(await schedule('DELETE','/'+manual.id),200);
  assert.equal(await db.lessonLog.count({where:{studentId:student.id}}),0);
  passed('停课期间拒绝新排、调课、强制激活、串课和批量签到，显式取消可永久撤销待恢复场次');

  const overlapping = {classId:other.id,startTime:late.startTime,endTime:late.endTime,teacherId:teacher.id,classroom:'西馆'};
  const block = expect(await schedule('POST','',overlapping),201).data;
  const conflict = expect(await status('active'),409,'SCHEDULE_CONFLICT');
  assert.match(conflict.error.message,/教师/);
  assert.match(conflict.error.message,/北京时间/);
  assert.equal((await db.class.findUnique({where:{id:cls.id}})).status,'inactive');
  for (const row of [next,late]) assert.equal(await state(row.id),'class_paused');
  expect(await schedule('PUT','/'+block.id,{teacherId:null,classroom:'东馆'}),200);
  assert.match(expect(await status('active'),409,'SCHEDULE_CONFLICT').error.message,/教室/);
  expect(await schedule('DELETE','/'+block.id),200);
  const duplicate = await db.schedule.create({data:{...home,classId:cls.id,startTime:next.startTime,endTime:next.endTime,status:'class_paused'}});
  assert.match(expect(await status('active'),409,'SCHEDULE_CONFLICT').error.message,/班级/);
  expect(await schedule('DELETE','/'+duplicate.id),200);
  passed('暂停资源可重排，教师、教室和班内重叠分别阻止复课，失败后仍保持停课');
  const expired = await add(-3,'class_paused');
  expect(await status('active'),200);
  expect(await status('active'),200);
  for (const row of [late,next]) assert.equal(await state(row.id),'scheduled');
  for (const row of [manual,cancelled]) assert.equal(await state(row.id),'cancelled');
  assert.equal(await state(expired.id),'class_paused');
  assert.deepEqual(await db.attendance.findUnique({where:{id:att.id}}),att);
  assert.deepEqual(await db.schedule.findUnique({where:{id:history.id}}),history);
  passed('释放冲突后原 ID 恢复，停课中错过的课、主动取消、历史考勤均保留');

  const viaImport = async extra => expect(await request('POST','/execute',manager.token,{
    type:'classes',duplicateStrategy:'update',data:[{name:cls.name,courseType:cls.courseType,...extra}],
  },'import'),200).data;
  assert.equal((await viaImport({status:'inactive'})).summary.updated,1);
  assert.equal(await state(next.id),'class_paused');
  assert.equal((await viaImport({level:'二段'})).summary.updated,1);
  assert.equal((await db.class.findUnique({where:{id:cls.id}})).status,'inactive');
  const newTeacher = await account(home,'coach');
  expect(await request('POST','/execute',manager.token,{fromTeacherId:teacher.id,toTeacherId:newTeacher.id,classIds:[cls.id]},'resource-transfers'),200);
  assert.equal((await db.schedule.findUnique({where:{id:next.id}})).teacherId,newTeacher.id);
  assert.deepEqual(await db.schedule.findUnique({where:{id:history.id}}),history);
  const taken = expect(await schedule('POST','',{classId:other.id,startTime:next.startTime,endTime:next.endTime,teacherId:newTeacher.id}),201).data;
  assert.equal((await viaImport({status:'active'})).summary.failed,1);
  assert.equal((await db.class.findUnique({where:{id:cls.id}})).status,'inactive');
  expect(await schedule('DELETE','/'+taken.id),200);
  assert.equal((await viaImport({status:'active'})).summary.updated,1);
  assert.equal(await state(next.id),'scheduled');
  passed('导入停复课遵守同一事务；省略状态保留停课，交接在停课中继承新教师，复课时检查实际授课教师的占用');
  expect(await status('inactive'),200);
  const [opened, competing] = await Promise.all([
    status('active'), schedule('POST','',{classId:other.id,startTime:next.startTime,endTime:next.endTime,teacherId:newTeacher.id}),
  ]);
  assert([200,409].includes(opened.status) && [201,409].includes(competing.status));
  assert.notEqual(opened.status === 200, competing.status === 201);
  assert.equal(await state(next.id), opened.status === 200 ? 'scheduled' : 'class_paused');
  const simultaneous = await db.schedule.count({where:{status:'scheduled',teacherId:newTeacher.id,startTime:next.startTime}});
  assert.equal(simultaneous,1);
  passed('复课与另一班同时抢同一教师，仅一项成功，数据库恰有一个有效场次');
};
