import {describe,it,expect,vi} from 'vitest';
const {db}=vi.hoisted(()=>({db:{
  schedule:{findMany:vi.fn()},class:{findMany:vi.fn()},user:{findMany:vi.fn()},
  enrollment:{findMany:vi.fn()},attendance:{findMany:vi.fn()},
}}));
vi.mock('../src/config/database',()=>({default:db}));
import {businessRecords} from '../src/services/aiDataDictionary';
import {buildOperatingSnapshot} from '../src/services/aiOperatingFacts';

describe('排课应到与已完成出勤分开核算',()=>{
 it('未来排课使用有效报名和本场临时串课，保留历史离班边界和场次老师',async()=>{
  const scope={organizationId:'org',campusId:'campus'},ctx={...scope,today:'2026-11-17'};
  const schedule=(id:string,day:string,status='scheduled')=>({id,classId:'class',teacherId:'teacher',startTime:new Date(day+'T07:00:00Z'),endTime:new Date(day+'T08:00:00Z'),status});
  db.schedule.findMany.mockResolvedValue([schedule('past','2026-11-16','completed'),schedule('future','2026-11-18'),schedule('cancelled','2026-11-18','cancelled')]);
  db.class.findMany.mockResolvedValue([{id:'class',name:'展翼新班'}]);db.user.findMany.mockResolvedValue([{id:'teacher',name:'场次老师'}]);
  db.enrollment.findMany.mockResolvedValue([
   {classId:'class',studentId:'active',enrolledAt:new Date('2026-11-01'),endedAt:null,status:'active'},
   {classId:'class',studentId:'left',enrolledAt:new Date('2026-11-01'),endedAt:new Date('2026-11-17'),status:'cancelled'},
  ]);
  db.attendance.findMany.mockResolvedValue([
   {classId:'class',scheduleId:'future',studentId:'guest',isTemporary:true,status:'pending'},
   {classId:'class',scheduleId:'future',studentId:'guest',isTemporary:true,status:'pending'},
  ]);
  const card=await businessRecords(ctx,{domain:'schedules',startDate:'2026-11-16',endDate:'2026-11-18'});
  expect(card.rows.map(r=>r.plannedExpected)).toEqual([2,2,null]);
  expect(card.rows[1]).toMatchObject({className:'展翼新班',teacherName:'场次老师'});
  expect(card.totals.排课应到人次).toBe(4);
  expect(card.caliber).toContain('未完成场次也有排课应到');
  expect(db.user.findMany).toHaveBeenCalledWith({where:{...scope,id:{in:['teacher']}},select:{id:true,name:true}});
  expect(db.enrollment.findMany.mock.calls[0][0].where).toMatchObject({organizationId:'org',class:scope,student:scope});
  const snapshot=buildOperatingSnapshot([card]);
  expect(snapshot.facts).toEqual(expect.arrayContaining([expect.objectContaining({metric:'schedule.expected',value:4})]));
  expect(JSON.stringify(snapshot)).toContain('授课老师 场次老师');
 });
});
