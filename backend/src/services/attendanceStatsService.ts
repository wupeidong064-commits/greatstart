import prisma from '../config/database';
import type { Prisma } from '@prisma/client';

// Enrollment windows use the class end time, in the same instant timeline as the schedule.
export function wasEnrolled(e:{enrolledAt:Date|string|null;endedAt?:Date|string|null;status:string}, end:Date|number|string) {
  const instant=typeof end==='number'?end:+new Date(end);
  return (!e.enrolledAt || +new Date(e.enrolledAt)<=instant) && (e.endedAt ? instant<+new Date(e.endedAt) : e.status==='active');
}

export interface SessionAttendanceInput {
  /** 场次（startTime/endTime/classId） */
  schedules: Array<{ id: string; classId: string; startTime: Date; endTime: Date | null }>;
  /** 报名（含入班时间与状态） */
  enrollments: Array<{ classId: string; studentId: string; enrolledAt: Date | null; endedAt?: Date | null; status: string }>;
  /** 出勤记录（按场次） */
  attendances: Array<{ studentId?:string; scheduleId: string; classId: string; status: string; isTemporary?: boolean }>;
}

export interface SessionAttendanceResult {
  expected: number;
  present: number;
  rate: number | null; // null = 分母为 0，不可计算
  perClass: Array<{ classId: string; sessions: number; expected: number; present: number; rate: number | null }>;
  caliberNote: string;
}

export const SESSION_ATTENDANCE_CALIBER='应到按每次课结束时的有效入班名单去重；已记录离班时间的报名只计离班前场次。历史转班、取消无结束时间的不倒推。已保存临时串课学员只计入对应场次应到，不改变报名；实到计出勤和迟到；无应到时不显示比率。';
export function computeSessionAttendance(input: SessionAttendanceInput): SessionAttendanceResult {
  const byClass = new Map<string, { sessions: number; expected: number; present: number }>();
  const eligible=new Map<string,{classId:string;students:Set<string>}>();
  for (const s of input.schedules) {
    const row=byClass.get(s.classId)||{sessions:0,expected:0,present:0};
    const students=new Set(input.enrollments.filter(e=>e.classId===s.classId&&wasEnrolled(e,s.endTime||s.startTime)).map(e=>e.studentId));
    row.sessions++;row.expected+=students.size;byClass.set(s.classId,row);eligible.set(s.id,{classId:s.classId,students});
  }
  // Saved temporary attendance adds exactly one expected seat to its own occurrence.
  for (const a of input.attendances) {
    const hit=eligible.get(a.scheduleId);
    if (a.isTemporary && a.studentId && hit?.classId===a.classId && !hit.students.has(a.studentId)) {
      hit.students.add(a.studentId); byClass.get(a.classId)!.expected++;
    }
  }
  const seen=new Set<string>();
  for(const a of input.attendances){
    const hit=eligible.get(a.scheduleId);
    if(!hit || hit.classId!==a.classId || !['present','late'].includes(a.status))continue;
    if(a.studentId){const key=a.scheduleId+':'+a.studentId;if(!hit.students.has(a.studentId)||seen.has(key))continue;seen.add(key);}
    byClass.get(a.classId)!.present++;
  }
  const perClass = Array.from(byClass.entries())
    .map(([classId, r]) => ({
      classId, sessions: r.sessions, expected: r.expected, present: r.present,
      rate: r.expected > 0 ? Math.round((r.present / r.expected) * 100) : null,
    }))
    .sort((x, y) => x.classId.localeCompare(y.classId));
  const expected = perClass.reduce((s, r) => s + r.expected, 0);
  const present = perClass.reduce((s, r) => s + r.present, 0);
  return {
    expected,
    present,
    rate: expected > 0 ? Math.round((present / expected) * 100) : null,
    perClass,
    caliberNote: SESSION_ATTENDANCE_CALIBER,
  };
}

/** Per-student facts use the same eligible occurrence pairs, including saved guests. */
export function computeStudentSessions(input: SessionAttendanceInput) {
  const pairs=new Map<string,{classId:string;studentId:string}>();
  for(const e of input.enrollments)pairs.set(e.classId+':'+e.studentId,{classId:e.classId,studentId:e.studentId});
  for(const a of input.attendances)if(a.isTemporary && a.studentId)pairs.set(a.classId+':'+a.studentId,{classId:a.classId,studentId:a.studentId});
  return [...pairs.values()].map(pair=>{
    const enrollments=input.enrollments.filter(e=>e.classId===pair.classId && e.studentId===pair.studentId);
    const attendances=input.attendances.filter(a=>a.classId===pair.classId && a.studentId===pair.studentId);
    const guestIds=new Set(attendances.filter(a=>a.isTemporary).map(a=>a.scheduleId));
    const schedules=input.schedules.filter(s=>s.classId===pair.classId && (guestIds.has(s.id) || enrollments.some(e=>wasEnrolled(e,s.endTime || s.startTime))));
    const stats=computeSessionAttendance({schedules,enrollments,attendances});
    const arrivals=new Set(attendances.filter(a=>['present','late'].includes(a.status)).map(a=>a.scheduleId));
    let continuousAbsentCount=0;
    for(const s of [...schedules].sort((a,b)=>+b.startTime-+a.startTime)){if(arrivals.has(s.id))break;continuousAbsentCount++;}
    return {...pair,...stats,continuousAbsentCount,isTemporary:attendances.some(a=>a.isTemporary)};
  });
}

/** 查库版（AI 工具用）：按校区/班级集合与时间窗口取数后走同一公式 */
export async function querySessionAttendance(args: {
  organizationId: string;
  campusId?: string | null;
  classIds: string[];
  startISO?: string;
  endISO?: string;
}, db: Prisma.TransactionClient = prisma): Promise<SessionAttendanceResult> {
  // 先取场次（attendances 依赖其 id），再并行取报名与出勤
  const schedules = await db.schedule.findMany({
    where: {
      organizationId: args.organizationId,
      classId: { in: args.classIds },
      ...(args.campusId ? {campusId:args.campusId} : {}),
      status: 'completed',
      startTime: { gte: args.startISO ? new Date(args.startISO) : undefined, lte: args.endISO ? new Date(args.endISO) : undefined },
    },
    select: { id: true, classId: true, startTime: true, endTime: true },
  });
  const scheduleIds = schedules.length > 0 ? schedules.map((s) => s.id) : ['__none__'];
  const [enrollments, attendances] = await Promise.all([
    db.enrollment.findMany({
      where: { organizationId: args.organizationId, classId: { in: args.classIds } },
      select: { classId: true, studentId: true, enrolledAt: true, endedAt:true,status: true },
    }),
    db.attendance.findMany({
      where: { organizationId: args.organizationId, scheduleId: { in: scheduleIds } },
      select: { studentId:true, scheduleId: true, classId: true, status: true, isTemporary:true },
    }),
  ]);
  return computeSessionAttendance({ schedules, enrollments, attendances });
}
