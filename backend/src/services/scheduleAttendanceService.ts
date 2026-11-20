import { LessonSource, readLessonLedgers } from './lessonLedger';
import { CLASS_PAUSED } from './scheduleConflicts';
import prisma from '../config/database';
import { ApiError } from '../middleware/errorHandler';

export type AttendanceActor = { id: string; role?: string; organizationId?: string; campusId?: string };
export type AttendanceEntry = { studentId: string; status: string; temporary?: boolean; lessonSource?: LessonSource };
export const businessDate = (date: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);

export async function submitScheduleAttendance(actor: AttendanceActor, scheduleId: string, entries: AttendanceEntry[]) {
  if (!actor.organizationId || !actor.campusId || !['admin', 'manager', 'teacher', 'coach'].includes(actor.role || '')) throw new ApiError('无权签到或未分配校区', 403, 'FORBIDDEN');
  if (!scheduleId || !Array.isArray(entries) || !entries.length || entries.length > 500 || entries.some(e => !e || typeof e.studentId !== 'string' || !e.studentId || !['present','late','leave','absent'].includes(e.status) || (e.lessonSource !== undefined && !['paid','gift'].includes(e.lessonSource)) || (e.temporary !== undefined && typeof e.temporary !== 'boolean')) || new Set(entries.map(e => e.studentId)).size !== entries.length) throw new ApiError('签到名单或状态无效', 400, 'INVALID_ATTENDANCE');
  return prisma.$transaction(async tx => {
    // Serialize all writes for this actual occurrence, including retries and corrections.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${scheduleId}))`;
    const schedule = await tx.schedule.findFirst({ where: { id: scheduleId, organizationId: actor.organizationId, campusId: actor.campusId, class:{organizationId:actor.organizationId,campusId:actor.campusId} } });
    if (!schedule) throw new ApiError('排课不存在或不属于当前校区', 403, 'FORBIDDEN');
    if (schedule.status === CLASS_PAUSED) throw new ApiError('停课场次不能签到',409,'CLASS_UNAVAILABLE');
    if (['cancelled', 'rescheduled'].includes(schedule.status)) throw new ApiError('已取消或已调走的场次不能签到', 400, 'INVALID_SCHEDULE');
    if (['teacher','coach'].includes(actor.role || '') && schedule.teacherId !== actor.id) throw new ApiError('只能处理本人授课场次', 403, 'FORBIDDEN');
    const ordered = [...entries].sort((a,b) => a.studentId.localeCompare(b.studentId));
    // Enrollment writers also lock the student before the class row. Lock all students
    // first so a multi-student submission cannot invert that order.
    for (const entry of ordered) await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${entry.studentId}))`;
    const available = await tx.$queryRaw<Array<{id:string}>>`SELECT id FROM classes WHERE id=${schedule.classId} AND status NOT IN ('deleted','inactive') FOR SHARE`;
    if (!available.length) throw new ApiError('已删除或停课班级不能签到',409,'CLASS_UNAVAILABLE');
    const date = businessDate(schedule.startTime);
    const results = [];
    const students = await tx.student.findMany({where:{id:{in:ordered.map(e=>e.studentId)},organizationId:actor.organizationId,campusId:actor.campusId}});
    const studentMap = new Map(students.map(s=>[s.id,s]));
    const ledgers = await readLessonLedgers(tx,students,actor.organizationId!);
    for (const entry of ordered) {
      const student = studentMap.get(entry.studentId);
      const enrollment = await tx.enrollment.findFirst({ where: { studentId: entry.studentId, classId: schedule.classId, organizationId: actor.organizationId, OR:[{status:'active',endedAt:null},{endedAt:{gt:schedule.endTime}}], enrolledAt: { lte: schedule.endTime } } });
      const prior = await tx.attendance.findFirst({where:{organizationId:actor.organizationId,scheduleId,studentId:entry.studentId}});
      const retainedPrior = prior && !prior.isTemporary && !enrollment && await tx.enrollment.findFirst({ where: {
        organizationId: actor.organizationId, studentId: entry.studentId, classId: schedule.classId,
        status: 'cancelled', endedAt: { not: null }, enrolledAt: { lte: schedule.endTime },
        removalReceipt: { path: ['retainedAttendanceIds'], array_contains: [prior.id] },
      }, select: { id: true } });
      if (!student) throw new ApiError('学员不属于当前机构或范围',403,'INVALID_STUDENT');
      if (prior && !prior.isTemporary && !enrollment && !retainedPrior) throw new ApiError('历史考勤缺少该场次有效报名期间，请先核对历史报名，不能直接改为临时串课',409,'LEGACY_ENROLLMENT_RECONCILIATION_REQUIRED');
      if (!enrollment && !retainedPrior && !prior?.isTemporary && entry.temporary !== true) throw new ApiError('学员不属于该场次有效名单，请明确添加临时串课学员', 403, 'INVALID_STUDENT');
      // A saved guest remains a guest even if they enroll in this class later.
      const isTemporary = prior?.isTemporary ?? !enrollment;
      if (isTemporary && !prior && student.status !== 'active') throw new ApiError('只能添加本机构有效学员',403,'INVALID_STUDENT');
      if (isTemporary && !prior && !['admin','manager'].includes(actor.role || '') && schedule.teacherId !== actor.id) throw new ApiError('只能为本人授课场次添加串课学员',403,'FORBIDDEN');
      const logs = await tx.lessonLog.findMany({ where: { organizationId: actor.organizationId, scheduleId, studentId: student.id }, orderBy: { createdAt: 'desc' } });
      if (prior && ['present','late','makeUp'].includes(prior.status) && !logs.length) throw new ApiError('历史考勤缺少关联扣课流水，请先核对期初课时，禁止自动补扣',409,'LEGACY_RECONCILIATION_REQUIRED');
      const net = logs.reduce((n,l) => n + (l.type === 'deduct' ? l.lessons : -l.lessons), 0);
      const wanted = ['present','late'].includes(entry.status) ? 1 : 0;
      const delta = wanted - net;
      if (delta > 0 && student.remainingLessons < delta) throw new ApiError(`${student.name}课时不足，请续费或调整签到名单`, 409, 'INSUFFICIENT_LESSONS');
      // 2026-11-08 用户拍板：出勤（present/late）即推进「最后上课日期」——只前进不后退；
      // 更正为请假/缺勤不回拨，重签同状态（delta=0）也补推进。编辑表单已撤手动维护入口。
      const nextLastClass = wanted === 1 && (!student.lastClassDate || schedule.startTime > student.lastClassDate) ? schedule.startTime : null;
      const ledger = ledgers.get(student.id)!;
      const priorLog = ledger.activeBySchedule.get(scheduleId);
      if ((net !== 0 && net !== 1) || Boolean(priorLog) !== (net === 1)) throw new ApiError('场次扣课记录不一致，请先核对流水',409,'LEGACY_RECONCILIATION_REQUIRED');
      const originalSource = priorLog && ledger.valuations.get(priorLog)?.lessonSource;
      const lessonSource = entry.lessonSource ?? (originalSource || 'paid');
      const switchSource = !!(wanted && priorLog && lessonSource !== originalSource);
      if (delta || switchSource) {
        ledger.assertWritable();
        const common = {organizationId:actor.organizationId!,studentId:student.id,studentName:student.name,
          lessons:1,scheduleId,businessDate:date,operatorId:actor.id};
        if (priorLog && (!wanted || switchSource)) {
          const value = ledger.reverse(priorLog);
          await tx.lessonLog.create({data:{...common,type:'add',reversalOfId:priorLog,
            lessonSource:value.lessonSource,allocations:value.allocations,notes:'签到更正返还'}});
        }
        if (wanted && (delta > 0 || switchSource)) {
          const allocations = ledger.take(1,lessonSource);
          await tx.lessonLog.create({data:{...common,type:'deduct',lessonSource,allocations,notes:'场次签到扣课'}});
        }
      }
      if (delta || nextLastClass) await tx.student.update({where:{id:student.id},data:{
        remainingLessons:{decrement:delta},consumedLessons:{increment:delta},...(nextLastClass ? {lastClassDate:nextLastClass} : {})}});
      const attendance = await tx.attendance.upsert({ where: { studentId_scheduleId: { studentId: student.id, scheduleId } }, create: { organizationId: actor.organizationId!, studentId: student.id, scheduleId, classId: schedule.classId, isTemporary, status: entry.status, checkedInBy: actor.id, checkInTime: new Date() }, update: { status: entry.status, checkedInBy: actor.id, checkInTime: new Date() } });
      results.push({ studentId: student.id, attendanceId: attendance.id, status: entry.status, isTemporary, deducted: delta, remainingLessons: student.remainingLessons - delta, ...ledger.balance, lessonSource:wanted ? lessonSource : null });
    }
    const allLogs = await tx.lessonLog.findMany({where:{scheduleId,organizationId:actor.organizationId}});
    const netCount = allLogs.reduce((n,l)=>n+(l.type==='deduct'?l.lessons:-l.lessons),0);
    await tx.lessonDeductionRecord.upsert({where:{scheduleId},create:{scheduleId,organizationId:actor.organizationId!,classId:schedule.classId,deductionDate:date,operatorId:actor.id,deductionCount:netCount},update:{deductionCount:netCount,operatorId:actor.id}});
    // 签到即已完成课次：全部统计口径（低出勤/蜜月期/AI 工具）按 status='completed' 计数，
    // 而系统此前没有任何把场次置为 completed 的路径，导致“已完成场次”永远为空。
    // 签到发生=课已上完，随扣课事务一并落库。
    if (schedule.status !== 'completed') {
      await tx.schedule.update({ where: { id: scheduleId }, data: { status: 'completed' } });
    }
    return { success: results.length, failed: 0, results, errors: [] };
  }, { timeout: 20000 });
}
