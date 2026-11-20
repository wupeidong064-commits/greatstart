import { readLessonLedgers } from '../services/lessonLedger';
import prisma from '../config/database';
import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import { ApiError } from '../middleware/errorHandler';
import { sendSuccess, sendPaginated } from '../utils/response';
import { assertScheduleAvailable, CLASS_PAUSED, findCoexistingSessions, hiddenTimetableOccurrence, lockScheduleWrites, normalizeClassroom, parseScheduleTime, validateScheduleTime } from '../services/scheduleConflicts';
import { inheritClassCourse } from '../services/classCourseType';
import { wasEnrolled } from '../services/attendanceStatsService';
import { cancelPendingOccurrences } from '../services/cancelPendingOccurrences';
import { createHash } from 'crypto';
import {
  annotateConflicts, buildClassRuleSlots, classRulesGroupId, filterSelectedRules, selectUpcomingOccurrences, validateClassRulesRequest,
} from '../services/classRulesGeneration';

function requireSchedulingActor(req: AuthRequest) {
  const actor = req.user;
  if (!actor?.organizationId || !actor.campusId || !['admin','manager'].includes(actor.role || '')) throw new ApiError('无权排课或未分配机构校区',403,'FORBIDDEN');
  if ((req.body.organizationId !== undefined && req.body.organizationId !== actor.organizationId) || (req.body.campusId !== undefined && req.body.campusId !== actor.campusId)) throw new ApiError('不能跨机构或校区排课',403,'FORBIDDEN');
  return actor as typeof actor & {organizationId:string;campusId:string};
}

async function validateScheduleTeacher(tx: import('@prisma/client').Prisma.TransactionClient, actor:{organizationId:string;campusId:string}, teacherId: unknown) {
  if (teacherId === null) return;
  if (typeof teacherId !== 'string' || !teacherId || !await tx.user.findFirst({where:{id:teacherId,organizationId:actor.organizationId,campusId:actor.campusId,isActive:true,role:{in:['teacher','coach','admin','manager']}}})) throw new ApiError('教师已停用或不属于当前校区',403,'FORBIDDEN');
}

async function validateScheduleCourse(tx: import('@prisma/client').Prisma.TransactionClient, organizationId: string, value: unknown, allowInactive = false) {
  if (typeof value !== 'string' || !value.trim()) throw new ApiError('课程类型无效', 400, 'INVALID_COURSE');
  const course = await tx.course.findUnique({where:{id:value}});
  if (!course) throw new ApiError('课程类型不存在', 404, 'COURSE_NOT_FOUND');
  if (course.organizationId !== organizationId) throw new ApiError('课程类型不属于当前机构', 403, 'FORBIDDEN');
  if (!allowInactive && !course.isActive) throw new ApiError('该课程类型已停用', 400, 'COURSE_INACTIVE');
  return course.id;
}

async function cancelPending(req: AuthRequest, classId: string, fromDate?: string) {
  const actor = req.user;
  if (!actor?.organizationId || !actor.campusId || !['admin','manager'].includes(actor.role || '')) throw new ApiError('无权取消排课',403,'FORBIDDEN');
  if (!classId) throw new ApiError('请指定班级',400,'INVALID_PARAMS');
  const start = fromDate === undefined ? undefined : new Date(fromDate+'T00:00:00+08:00');
  if (start && (!/^\d{4}-\d{2}-\d{2}$/.test(fromDate!) || !Number.isFinite(+start))) throw new ApiError('日期无效',400,'INVALID_DATE');
  return prisma.$transaction(async tx => {
    await lockScheduleWrites(tx, actor.organizationId!);
    if (!await tx.class.findFirst({where:{id:classId,status:{not:'deleted'},organizationId:actor.organizationId,campusId:actor.campusId}})) throw new ApiError('班级不存在',404,'CLASS_NOT_FOUND');
    const now = new Date();
    // fromDate is inclusive only when later than now; never widen cancellation into history.
    const startTime = start && +start > +now ? { gte: start } : { gt: now };
    return {cancelledCount: await cancelPendingOccurrences(tx, {organizationId:actor.organizationId!,campusId:actor.campusId!}, classId, startTime)};
  },{timeout:20000});
}

export const scheduleController = {
  getSchedules: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const user = req.user;
      if (!user?.organizationId || !user.campusId) throw new ApiError('未分配机构或校区', 403, 'FORBIDDEN');
      const page = Math.max(1, Number(req.query.page) || 1), pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 100));
      const date = (v: any, end = false) => new Date(String(v).slice(0,10) + (end ? 'T23:59:59.999+08:00' : 'T00:00:00+08:00'));
      const where: any = { organizationId: user.organizationId, campusId: user.campusId, class: { organizationId: user.organizationId, campusId: user.campusId }, ...(['teacher','coach'].includes(user.role || '') ? { teacherId: user.id } : {}) };
      // Historical rows remain accessible by ID after a class is paused or deleted.
      where.NOT = hiddenTimetableOccurrence();
      if (req.query.classId) where.classId = String(req.query.classId);
      if (req.query.status) where.status = String(req.query.status);
      if (req.query.startDate || req.query.endDate) where.startTime = { ...(req.query.startDate ? { gte: date(req.query.startDate) } : {}), ...(req.query.endDate ? { lte: date(req.query.endDate,true) } : {}) };
      const [rows,count] = await Promise.all([prisma.schedule.findMany({ where, orderBy: { startTime: 'asc' }, skip: (page-1)*pageSize, take: pageSize, include: { class: true, course: { select: { id: true, name: true, code: true, isActive: true } }, teacher: { select: { name: true } } } }), prisma.schedule.count({where})]);
      const [enrollments, guests] = await Promise.all([
        prisma.enrollment.findMany({
          where: { organizationId: user.organizationId, classId: { in: rows.map(row => row.classId) }, student: { organizationId: user.organizationId, campusId: user.campusId } },
          select: { classId: true, studentId: true, status: true, enrolledAt: true, endedAt: true },
        }),
        prisma.attendance.findMany({
          where: { organizationId: user.organizationId, scheduleId: { in: rows.map(row => row.id) }, isTemporary: true, student: { organizationId: user.organizationId, campusId: user.campusId } },
          select: { scheduleId: true, studentId: true },
        }),
      ]);
      const output = rows.map(row => {
        const students = new Set(enrollments.filter(enrollment => enrollment.classId === row.classId && wasEnrolled(enrollment, row.endTime)).map(enrollment => enrollment.studentId));
        guests.filter(guest => guest.scheduleId === row.id).forEach(guest => students.add(guest.studentId));
        return { ...row, studentCount: students.size };
      });
      sendPaginated(res, output, page, pageSize, count);
    } catch(error) { next(error); }
  },

  getScheduleById: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const user = req.user;
      if (!user?.organizationId || !user.campusId || !['admin','manager','teacher','coach'].includes(user.role)) throw new ApiError('无权查看排课',403,'FORBIDDEN');
      const schedule = await prisma.schedule.findFirst({ where: { id:req.params.id, organizationId:user.organizationId, campusId:user.campusId, class:{organizationId:user.organizationId,campusId:user.campusId}, ...(['teacher','coach'].includes(user.role)?{teacherId:user.id}:{}) }, include:{ class:true, course:{select:{id:true,name:true,code:true,isActive:true}}, teacher:{select:{name:true}} } });
      if (!schedule) throw new ApiError('无权查看该场次',403,'FORBIDDEN');
      sendSuccess(res,schedule);
    } catch (error) { next(error); }
  },

  /** Actual-occurrence roster, including saved attendance. A substitute owns this occurrence, not the entire class. */
  getScheduleRoster: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const user=req.user;
      if (!user?.organizationId || !user.campusId || !['admin','manager','teacher','coach'].includes(user.role)) throw new ApiError('无权读取点名名单',403,'FORBIDDEN');
      const result=await prisma.$transaction(async tx=>{
        const schedule=await tx.schedule.findFirst({where:{id:req.params.id,organizationId:user.organizationId,campusId:user.campusId,class:{organizationId:user.organizationId,campusId:user.campusId},...(['teacher','coach'].includes(user.role)?{teacherId:user.id}:{})},include:{class:{select:{id:true,name:true,code:true,status:true}},course:{select:{id:true,name:true,code:true,isActive:true}},teacher:{select:{name:true}}}});
        if(!schedule)throw new ApiError('无权读取该场次名单',403,'FORBIDDEN');
        if(schedule.class.status === 'inactive' || ['cancelled','rescheduled',CLASS_PAUSED].includes(schedule.status))throw new ApiError('停课、已取消或已调走场次不能点名',409,'SCHEDULE_UNAVAILABLE');
        const enrollments=await tx.enrollment.findMany({where:{organizationId:user.organizationId,classId:schedule.classId,enrolledAt:{lte:schedule.endTime},OR:[{status:'active',endedAt:null},{endedAt:{gt:schedule.endTime}}],student:{organizationId:user.organizationId,campusId:user.campusId}},select:{student:{select:{id:true,name:true,phone:true,remainingLessons:true}}},orderBy:{id:'asc'},take:501});
        if(enrollments.length>500)throw new ApiError('场次名单超过500人，请联系管理员处理',422,'ROSTER_LIMIT');
        const saved=await tx.attendance.findMany({where:{organizationId:user.organizationId,scheduleId:schedule.id,student:{organizationId:user.organizationId,campusId:user.campusId},OR:[{isTemporary:true},{studentId:{in:enrollments.map(e=>e.student.id)}}]},select:{studentId:true,status:true,isTemporary:true,student:{select:{id:true,name:true,phone:true,remainingLessons:true}}}});
        const roster=new Map(enrollments.map(e=>[e.student.id,{...e.student,attendanceStatus:'none',isTemporary:false}]));
        for(const row of saved)roster.set(row.studentId,{...row.student,attendanceStatus:row.status,isTemporary:row.isTemporary});
        if(roster.size>500)throw new ApiError('场次名单超过500人，请联系管理员处理',422,'ROSTER_LIMIT');
        const rows=[...roster.values()];
        const ledgers=await readLessonLedgers(tx,rows,user.organizationId!);
        return {schedule,students:rows.map(row=>{
          const ledger=ledgers.get(row.id)!;
          const active=ledger.activeBySchedule.get(schedule.id);
          return {...row,...ledger.balance,lessonSource:active ? ledger.valuations.get(active)?.lessonSource ?? 'paid' : null};
        })};
      },{isolationLevel:'RepeatableRead'});
      res.set('Cache-Control','no-store');sendSuccess(res,result);
    }catch(error){next(error);}
  },

  /** Minimal, occurrence-authorized search; never creates an enrollment. */
  searchTemporaryStudents: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const user=req.user;
      if(!user?.organizationId || !user.campusId || !['admin','manager','teacher','coach'].includes(user.role || ''))throw new ApiError('无权添加串课学员',403,'FORBIDDEN');
      const query=typeof req.query.q==='string'?req.query.q.trim():'';
      if(!query || query.length>50)throw new ApiError('请输入姓名或手机末4位（最多50字）',400,'INVALID_SEARCH');
      const result = await prisma.$transaction(async tx => {
      const schedule=await tx.schedule.findFirst({where:{id:req.params.id,organizationId:user.organizationId,campusId:user.campusId,class:{organizationId:user.organizationId,campusId:user.campusId},...(['teacher','coach'].includes(user.role || '')?{teacherId:user.id}:{})},include:{class:{select:{status:true}}}});
      if(!schedule)throw new ApiError('无权读取该场次',403,'FORBIDDEN');
      if(schedule.class.status === 'inactive' || ['cancelled','rescheduled',CLASS_PAUSED].includes(schedule.status))throw new ApiError('该场次不能添加学员',409,'SCHEDULE_UNAVAILABLE');
      const suffixQuery=/^\d{4}$/.test(query);
      // Match normalized last four digits without exposing either full phone number.
      const phoneMatches=suffixQuery ? await tx.$queryRaw<Array<{id:string}>>`SELECT id FROM students WHERE "organizationId"=${user.organizationId} AND "campusId"=${user.campusId} AND status='active' AND (right(regexp_replace(coalesce(phone,''),'[^0-9]','','g'),4)=${query} OR right(regexp_replace(coalesce("parentPhone",''),'[^0-9]','','g'),4)=${query}) ORDER BY name,id LIMIT 20` : null;
      const students=await tx.student.findMany({where:{organizationId:user.organizationId,campusId:user.campusId,status:'active',...(phoneMatches ? {id:{in:phoneMatches.map(s=>s.id)}} : {name:{contains:query,mode:'insensitive' as const}})},orderBy:[{name:'asc'},{id:'asc'}],take:20,select:{id:true,name:true,remainingLessons:true,phone:true,parentPhone:true,enrollments:{where:{organizationId:user.organizationId,status:'active',class:{organizationId:user.organizationId,campusId:user.campusId,status:'active'}},select:{class:{select:{name:true}}},orderBy:{enrolledAt:'desc'},take:3}}});
      const ids=students.map(s=>s.id);
      const [enrollments,saved]=await Promise.all([
        tx.enrollment.findMany({where:{organizationId:user.organizationId,classId:schedule.classId,studentId:{in:ids},enrolledAt:{lte:schedule.endTime},OR:[{status:'active',endedAt:null},{endedAt:{gt:schedule.endTime}}]},select:{studentId:true}}),
        tx.attendance.findMany({where:{organizationId:user.organizationId,scheduleId:schedule.id,studentId:{in:ids}},select:{studentId:true,isTemporary:true}})
      ]);
      const enrolled=new Set(enrollments.map(e=>e.studentId)), flags=new Map(saved.map(a=>[a.studentId,a.isTemporary]));
      const ledgers=await readLessonLedgers(tx,students,user.organizationId!);
      return students.map(s=>({id:s.id,name:s.name,remainingLessons:s.remainingLessons,...ledgers.get(s.id)!.balance,phoneLast4:(suffixQuery ? [s.phone,s.parentPhone].find(phone=>phone?.replace(/\D/g,'').slice(-4)===query) : s.phone || s.parentPhone)?.replace(/\D/g,'').slice(-4) || null,classNames:[...new Set(s.enrollments.map(e=>e.class.name))],isEnrolled:enrolled.has(s.id),isTemporary:flags.get(s.id) === true}));
      },{isolationLevel:'RepeatableRead'});
      res.set('Cache-Control','no-store');
      sendSuccess(res,result);
    }catch(error){next(error);}
  },

  createSchedule: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const actor = requireSchedulingActor(req);
      const { classId, startTime, endTime } = req.body;
      const classroom = normalizeClassroom(req.body.classroom);
      const start = parseScheduleTime(startTime), end = parseScheduleTime(endTime);
      validateScheduleTime(start, end);
      let reused = false;
      const result = await prisma.$transaction(async tx => {
        await lockScheduleWrites(tx, actor.organizationId);
        const cls = await tx.class.findFirst({where:{id:classId,organizationId:actor.organizationId,campusId:actor.campusId,status:{not:'deleted'}}});
        if (!cls || !classId) throw new ApiError('班级不属于当前校区',403,'FORBIDDEN');
        if (cls.status !== 'active') throw new ApiError('班级已停用，无法排课',409,'CLASS_UNAVAILABLE');
        const teacherId = req.body.teacherId === undefined ? cls.teacherId : req.body.teacherId;
        await validateScheduleTeacher(tx, actor, teacherId);
        const courseId = req.body.courseId === undefined
          ? await inheritClassCourse(tx, cls)
          : await validateScheduleCourse(tx, actor.organizationId, req.body.courseId);
        const data = {organizationId:actor.organizationId,campusId:actor.campusId,classId:cls.id,courseId,startTime:start,endTime:end,classroom,teacherId};
        const duplicate = await assertScheduleAvailable(tx, data, {allowExactReuse:true, inheritCourse:req.body.courseId === undefined});
        if (duplicate) { reused = true; return duplicate; }
        return tx.schedule.create({data});
      }, {timeout:20000});
      // 2026-11-07 用户拍板：幂等复用不能静默——完全相同的场次不重建，但明确提示"未重复创建"。
      sendSuccess(res,result,reused ? '该时间点的课已完全相同，未重复创建（幂等复用）' : '排课已保存',reused ? 200 : 201);
    } catch(error) { next(error); }
  },

  updateSchedule: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const actor = requireSchedulingActor(req);
      const updated = await prisma.$transaction(async tx => {
        await lockScheduleWrites(tx, actor.organizationId);
        const id = req.params.id;
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${id}))`;
        const schedule = await tx.schedule.findFirst({where:{id,organizationId:actor.organizationId,campusId:actor.campusId,class:{organizationId:actor.organizationId,campusId:actor.campusId,status:{not:'deleted'}}},include:{class:{select:{status:true}}}});
        if (!schedule) throw new ApiError('排课不属于当前校区',403,'FORBIDDEN');
        if (schedule.class.status === 'inactive' || schedule.status === CLASS_PAUSED) {
          const cancelOnly = req.body.status === 'cancelled' && Object.keys(req.body).every(key => ['status','organizationId','campusId'].includes(key));
          if (cancelOnly && schedule.status === CLASS_PAUSED) {
            return tx.schedule.update({ where: { id }, data: { status: 'cancelled' } });
          }
          throw new ApiError('停课场次仅可取消，修改请先复课',409,'CLASS_UNAVAILABLE');
        }
        const {startTime,endTime,status,notes} = req.body;
        const start = startTime === undefined ? schedule.startTime : parseScheduleTime(startTime);
        const end = endTime === undefined ? schedule.endTime : parseScheduleTime(endTime);
        validateScheduleTime(start, end);
        if (status !== undefined && !['scheduled','cancelled'].includes(status)) throw new ApiError('完成与调课状态必须由业务操作生成',400,'INVALID_STATUS');
        if ((startTime !== undefined || endTime !== undefined || status !== undefined) && (schedule.status !== 'scheduled' || await tx.attendance.count({where:{scheduleId:id}}) || await tx.lessonLog.count({where:{scheduleId:id}}))) throw new ApiError('已有考勤或已结束场次不能变更时间和状态',409,'SCHEDULE_LOCKED');
        const teacherId = req.body.teacherId === undefined ? schedule.teacherId : req.body.teacherId;
        const changesScheduledSlot = status !== 'cancelled' && (
          startTime !== undefined || endTime !== undefined || req.body.classroom !== undefined || status === 'scheduled'
        );
        if (req.body.teacherId !== undefined || changesScheduledSlot) {
          await validateScheduleTeacher(tx, actor, teacherId);
        }
        const classroom = req.body.classroom === undefined ? schedule.classroom : normalizeClassroom(req.body.classroom);
        const effectiveStatus = status === undefined ? schedule.status : status;
        if (!['cancelled','rescheduled'].includes(effectiveStatus)) {
          await assertScheduleAvailable(tx, {...schedule,teacherId,startTime:start,endTime:end,classroom}, {excludeIds:[id]});
        }
        return tx.schedule.update({where:{id},data:{teacherId,startTime:start,endTime:end,classroom,status,notes}});
      }, {timeout:20000});
      sendSuccess(res,updated,'排课更新成功');
    } catch(error) { next(error); }
  },

  deleteSchedule: async (req: AuthRequest, res: Response, next: NextFunction) => {
    req.body = { status: 'cancelled' };
    return scheduleController.updateSchedule(req,res,next);
  },

  reschedule: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const actor = requireSchedulingActor(req);
      const { id } = req.params;
      const { newStartTime, newEndTime, notes } = req.body;
      const start = parseScheduleTime(newStartTime), end = parseScheduleTime(newEndTime);
      validateScheduleTime(start, end);
      const newSchedule = await prisma.$transaction(async tx => {
        await lockScheduleWrites(tx, actor.organizationId);
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${id}))`;
        const current = await tx.schedule.findFirst({where:{id,organizationId:actor.organizationId,campusId:actor.campusId,class:{organizationId:actor.organizationId,campusId:actor.campusId,status:{not:'deleted'}}},include:{class:{select:{status:true}}}});
        if (!current) throw new ApiError('排课不属于当前校区',403,'FORBIDDEN');
        if (current.class.status === 'inactive') throw new ApiError('停课班级不能调课',409,'CLASS_UNAVAILABLE');
        if (current.status !== 'scheduled' || await tx.attendance.count({where:{scheduleId:id}}) || await tx.lessonLog.count({where:{scheduleId:id}})) throw new ApiError('场次已签到或已变更',409,'SCHEDULE_LOCKED');
        await validateScheduleTeacher(tx, actor, current.teacherId);
        await assertScheduleAvailable(tx, {...current,startTime:start,endTime:end}, {excludeIds:[id]});
        const replacement = await tx.schedule.create({data:{organizationId:current.organizationId,campusId:current.campusId,classId:current.classId,courseId:current.courseId,teacherId:current.teacherId,startTime:start,endTime:end,classroom:normalizeClassroom(current.classroom),status:'scheduled',originalScheduleId:id,notes:notes || `调课自 ${current.startTime.toISOString()}`}});
        await tx.schedule.update({where:{id},data:{status:'rescheduled',notes:`已调课至 ${start.toISOString()}`}});
        return replacement;
      }, {timeout:20000});
      sendSuccess(res, newSchedule, '调课成功', 201);
    } catch (error) { next(error); }
  },

  createRecurringSchedules: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const actor = requireSchedulingActor(req);
      const {classId,recurrenceType,startDate,endDate,weekDays,startTime,endTime,location} = req.body;
      if (!classId || !startDate || !endDate || !startTime || !endTime) throw new ApiError('缺少必要参数',400,'INVALID_PARAMS');
      const validDate = (value: unknown) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(+new Date(value)) && new Date(value).toISOString().slice(0,10) === value;
      if (!validDate(startDate) || !validDate(endDate) || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(startTime) || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(endTime) || endTime <= startTime || new Date(endDate) < new Date(startDate) || (+new Date(endDate)-+new Date(startDate))/86400000 > 366) throw new ApiError('排课日期或时间范围无效',400,'INVALID_TIME');
      if (recurrenceType !== undefined && !['daily','weekly'].includes(recurrenceType)) throw new ApiError('重复类型无效',400,'INVALID_PARAMS');
      if (recurrenceType === 'weekly' && (!Array.isArray(weekDays) || !weekDays.length || weekDays.some((day:unknown)=>!Number.isInteger(day) || Number(day)<0 || Number(day)>6))) throw new ApiError('请选择有效的每周上课日期',400,'INVALID_PARAMS');
      const classroom = normalizeClassroom(location);
      const start = new Date(startDate+'T00:00:00+08:00'), end = new Date(endDate+'T00:00:00+08:00');
      const [startHour,startMinute] = startTime.split(':').map(Number), [endHour,endMinute] = endTime.split(':').map(Number);
      const createdSchedules = await prisma.$transaction(async tx => {
        await lockScheduleWrites(tx, actor.organizationId);
        const cls = await tx.class.findFirst({where:{id:classId,organizationId:actor.organizationId,campusId:actor.campusId,status:{not:'deleted'}}});
        if (!cls) throw new ApiError('班级不属于当前校区',403,'FORBIDDEN');
        if (cls.status !== 'active') throw new ApiError('班级已停用，无法排课',409,'CLASS_UNAVAILABLE');
        const teacherId = req.body.teacherId === undefined ? cls.teacherId : req.body.teacherId;
        await validateScheduleTeacher(tx, actor, teacherId);
        const courseId = req.body.courseId === undefined
          ? await inheritClassCourse(tx, cls)
          : await validateScheduleCourse(tx, actor.organizationId, req.body.courseId);
        const rows = [];
        for (let d = +start; d <= +end; d += 86400000) {
          if (recurrenceType === 'weekly' && !weekDays.includes(new Date(d+8*3600000).getUTCDay())) continue;
          const data = {organizationId:actor.organizationId,campusId:actor.campusId,classId:cls.id,courseId,teacherId,classroom,startTime:new Date(d+(startHour*60+startMinute)*60000),endTime:new Date(d+(endHour*60+endMinute)*60000)};
          const duplicate = await assertScheduleAvailable(tx, data, {allowExactReuse:true, inheritCourse:req.body.courseId === undefined});
          rows.push(duplicate || await tx.schedule.create({data}));
        }
        if (!rows.length) throw new ApiError('没有生成任何排课',400,'NO_SCHEDULES');
        return rows;
      }, {timeout:20000});
      sendSuccess(res, {count:createdSchedules.length,schedules:createdSchedules}, '排课创建成功',201);
    } catch (error) { next(error); }
  },

  /** Replace the class rule and future occurrences as a single operation. */
  replaceRecurringSchedules: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const actor = requireSchedulingActor(req);
      const { classId, recurrenceType, startDate, endDate, weekDays, startTime, endTime, location, requestId, expectedClassUpdatedAt } = req.body;
      if (typeof requestId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)) throw new ApiError('排课请求标识无效', 400, 'INVALID_REQUEST_ID');
      if (typeof classId !== 'string' || !classId || !['daily', 'weekly'].includes(recurrenceType)) throw new ApiError('班级或重复方式无效', 400, 'INVALID_PARAMS');
      if (typeof expectedClassUpdatedAt !== 'string' || !Number.isFinite(+new Date(expectedClassUpdatedAt))) throw new ApiError('班级版本无效，请刷新后重试', 400, 'INVALID_CLASS_VERSION');
      const expectedVersion = new Date(expectedClassUpdatedAt).toISOString();
      const validDate = (value: unknown) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(+new Date(value)) && new Date(value).toISOString().slice(0, 10) === value;
      if (!validDate(startDate) || !validDate(endDate) || typeof startTime !== 'string' || typeof endTime !== 'string' || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(startTime) || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(endTime) || endTime <= startTime || new Date(endDate) < new Date(startDate) || (+new Date(endDate) - +new Date(startDate)) / 86400000 > 366) throw new ApiError('排课日期或时间范围无效', 400, 'INVALID_TIME');
      if (recurrenceType === 'weekly' && (!Array.isArray(weekDays) || !weekDays.length || weekDays.some((day:unknown) => !Number.isInteger(day) || Number(day) < 0 || Number(day) > 6))) throw new ApiError('请选择有效的每周上课日期', 400, 'INVALID_PARAMS');
      const days: number[] = recurrenceType === 'weekly' ? [...new Set<number>(weekDays)].sort((a, b) => a - b) : [];
      const classroom = normalizeClassroom(location);
      const start = new Date(startDate + 'T00:00:00+08:00'), end = new Date(endDate + 'T00:00:00+08:00');
      const [sh, sm] = startTime.split(':').map(Number), [eh, em] = endTime.split(':').map(Number);
      const prefix = `replace-v1:${requestId.toLowerCase()}:`;
      const outcome = await prisma.$transaction(async tx => {
        await lockScheduleWrites(tx, actor.organizationId);
        const cls = await tx.class.findFirst({ where: { id: classId, organizationId: actor.organizationId, campusId: actor.campusId, status:{not:'deleted'} } });
        if (!cls) throw new ApiError('班级不存在或不属于当前校区', 403, 'FORBIDDEN');
        const teacherId = req.body.teacherId === undefined ? cls.teacherId : req.body.teacherId;
        const requestedCourseId = req.body.courseId;
        if (requestedCourseId !== undefined && (typeof requestedCourseId !== 'string' || !requestedCourseId.trim())) throw new ApiError('课程类型无效', 400, 'INVALID_COURSE');
        // Hash the caller's intent, not resolved state, so later class changes do not alter a retry.
        const requestedTeacher = req.body.teacherId === undefined ? ['default'] : ['explicit', req.body.teacherId];
        const payload = { actorId: actor.id, organizationId: actor.organizationId, campusId: actor.campusId, classId, recurrenceType, startDate, endDate, weekDays: days, startTime, endTime, classroom, requestedTeacher, requestedCourseId: requestedCourseId ?? '__preserve__', expectedVersion };
        const groupId = prefix + createHash('sha256').update(JSON.stringify(payload)).digest('hex');
        const previous = await tx.schedule.findMany({ where: { organizationId: actor.organizationId, scheduleGroupId: { startsWith: prefix } }, orderBy: { startTime: 'asc' } });
        if (previous.length) {
          if (previous.some(row => row.scheduleGroupId !== groupId || row.classId !== classId || row.campusId !== actor.campusId)) throw new ApiError('请求标识已用于其他排课，请刷新后重试', 409, 'SCHEDULE_REQUEST_CONFLICT');
          return { count: previous.length, schedules: previous, courseId: previous[0]?.courseId ?? null, classUpdatedAt: cls.updatedAt, replayed: true };
        }
        if (cls.updatedAt.toISOString() !== expectedVersion) throw new ApiError('班级资料或排课已更新，请刷新后重新核对', 409, 'CLASS_VERSION_CHANGED');
        if (cls.status !== 'active') throw new ApiError('班级已停用，无法排课', 409, 'CLASS_UNAVAILABLE');
        await validateScheduleTeacher(tx, actor, teacherId);

        const now = new Date();
        const slots: Array<{startTime:Date;endTime:Date}> = [];
        for (let d = +start; d <= +end; d += 86400000) {
          if (recurrenceType === 'weekly' && !days.includes(new Date(d + 8 * 3600000).getUTCDay())) continue;
          const slotStart = new Date(d + (sh * 60 + sm) * 60000);
          if (slotStart <= now) continue;
          slots.push({ startTime: slotStart, endTime: new Date(d + (eh * 60 + em) * 60000) });
        }
        if (!slots.length) throw new ApiError('没有未来的可排课场次，原有课程未更改', 400, 'NO_FUTURE_SCHEDULES');

        const old = await tx.schedule.findMany({ where: { organizationId: actor.organizationId, campusId: actor.campusId, classId, status: 'scheduled', startTime: { gt: now } }, orderBy: { id: 'asc' }, select: { id: true, courseId: true } });
        const oldCourses = [...new Set(old.map(row => row.courseId))];
        if (requestedCourseId === undefined && oldCourses.length > 1) throw new ApiError('原未来课程包含多种课程类型，请先到周课表逐一调整；原有课程未更改', 409, 'MULTIPLE_COURSE_TYPES');
        const storedRule = cls.scheduleRule && typeof cls.scheduleRule === 'object' && !Array.isArray(cls.scheduleRule) ? cls.scheduleRule as { courseId?: unknown } : null;
        const ruleCourse = typeof storedRule?.courseId === 'string' ? storedRule.courseId : null;
        const preservedCourse = old.length ? oldCourses[0] : ruleCourse;
        const courseId = requestedCourseId !== undefined
          ? await validateScheduleCourse(tx, actor.organizationId, requestedCourseId)
          : preservedCourse
            ? await validateScheduleCourse(tx, actor.organizationId, preservedCourse, true)
            : await inheritClassCourse(tx, cls);
        // Attendance locks each occurrence before its class; acquire in the same order.
        for (const row of old) await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${row.id}))`;
        const [locked] = await tx.$queryRaw<{ updatedAt: Date }[]>`SELECT "updatedAt" FROM classes
          WHERE id=${classId} AND "organizationId"=${actor.organizationId} AND "campusId"=${actor.campusId} FOR UPDATE`;
        if (!locked || locked.updatedAt.toISOString() !== expectedVersion) throw new ApiError('班级资料或排课已更新，请刷新后重新核对', 409, 'CLASS_VERSION_CHANGED');
        for (const row of old) {
          if (await tx.attendance.count({ where: { scheduleId: row.id } }) || await tx.lessonLog.count({ where: { scheduleId: row.id } })) throw new ApiError('未来课程已有考勤或课时记录，请先核对；原有课程未更改', 409, 'SCHEDULE_LOCKED');
          const changed = await tx.schedule.updateMany({ where: { id: row.id, status: 'scheduled' }, data: { status: 'cancelled' } });
          if (changed.count !== 1) throw new ApiError('课程已发生变化，请刷新后重试', 409, 'SCHEDULE_CHANGED');
        }
        const created = [];
        for (const slot of slots) {
          const data = { organizationId: actor.organizationId, campusId: actor.campusId, classId, courseId, teacherId, classroom, ...slot, scheduleGroupId: groupId };
          await assertScheduleAvailable(tx, data);
          created.push(await tx.schedule.create({ data }));
        }
        const nextVersion = new Date(Math.max(Date.now(), cls.updatedAt.getTime() + 1));
        const updatedClass = await tx.class.update({ where: { id: classId }, data: { scheduleRule: { recurrenceType, startDate, endDate, weekDays: days, startTime, endTime, location: typeof location === 'string' ? location.trim() : '', teacherId, courseId }, updatedAt: nextVersion }, select: { updatedAt: true } });
        return { count: created.length, schedules: created, courseId, classUpdatedAt: updatedClass.updatedAt, replayed: false };
      }, { timeout: 30000 });
      sendSuccess(res, outcome, outcome.replayed ? '此前排课请求已处理，请刷新课表' : '班级排课已更新', 201);
    } catch (error) { next(error); }
  },

  cancelByClass: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {sendSuccess(res,await cancelPending(req,req.params.classId),'取消排课成功');} catch(error) {next(error);}
  },
  cancelAllFuture: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.body.fromDate) throw new ApiError('缺少日期',400,'INVALID_PARAMS');
      sendSuccess(res,await cancelPending(req,req.body.classId,req.body.fromDate),'取消未来排课成功');
    } catch(error) {next(error);}
  },

  /** 按班级时间规则预览未来场次：只读，不写任何数据。 */
  previewFromClassRules: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const actor = requireSchedulingActor(req);
      const { classId, startDate, endDate, selectedRules } = validateClassRulesRequest(req.body);
      const result = await prisma.$transaction(async tx => {
        const cls = await tx.class.findFirst({
          where: { id: classId, organizationId: actor.organizationId, campusId: actor.campusId, status: { not: 'deleted' } },
          include: {
            teacher: { select: { id: true, name: true } },
            weeklyRules: { orderBy: [{ weekday: 'asc' }, { startTime: 'asc' }] },
          },
        });
        if (!cls) throw new ApiError('班级不属于当前校区', 403, 'FORBIDDEN');
        const rules = filterSelectedRules(cls.weeklyRules.map(row => ({ weekday: row.weekday, startTime: row.startTime, endTime: row.endTime, classroom: row.classroom })), selectedRules);
        if (!rules.length) throw new ApiError('该班级还没有班级时间，请先在班级管理补充每周上课时间', 400, 'NO_CLASS_WEEKLY_RULES');
        const { occurrences, skippedPast } = selectUpcomingOccurrences(rules, startDate, endDate);
        if (!occurrences.length) throw new ApiError('所选日期范围内没有未来的可排课场次', 400, 'NO_FUTURE_SCHEDULES');
        const conflicts = await annotateConflicts(tx, actor.organizationId, cls, occurrences);
        return {
          class: { id: cls.id, name: cls.name, code: cls.code, courseType: cls.courseType, teacherId: cls.teacherId, teacherName: cls.teacher?.name || null, updatedAt: cls.updatedAt },
          rules,
          occurrences: occurrences.map(row => ({ businessDate: row.businessDate, weekday: row.weekday, startTime: row.startTime.toISOString(), endTime: row.endTime.toISOString(), classroom: row.classroom })),
          skippedPast, conflicts,
        };
      });
      sendSuccess(res, result);
    } catch (error) { next(error); }
  },

  /** 按班级时间规则一次事务生成实际课表：任一场次冲突整批回滚；requestId 幂等防重复生成。 */
  generateFromClassRules: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const actor = requireSchedulingActor(req);
      const { classId, startDate, endDate, selectedRules } = validateClassRulesRequest(req.body);
      const requestId = req.body.requestId;
      if (typeof requestId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)) {
        throw new ApiError('排课请求标识无效', 400, 'INVALID_REQUEST_ID');
      }
      if (typeof req.body.expectedClassUpdatedAt !== 'string' || !Number.isFinite(+new Date(req.body.expectedClassUpdatedAt))) {
        throw new ApiError('班级版本无效，请刷新后重试', 400, 'INVALID_CLASS_VERSION');
      }
      const expectedVersion = new Date(req.body.expectedClassUpdatedAt).toISOString();
      // 幂等键只包含调用方意图：老师缺省/显式参与哈希，保证重试与原请求语义一致。
      const replaceFuture = req.body.replaceFuture === true;
      if (replaceFuture && selectedRules) throw new ApiError('全班重排不能只选择部分时段，请使用全部班级时间', 400, 'INVALID_PARAMS');
      const requestedTeacher = req.body.teacherId === undefined ? ['default'] : ['explicit', req.body.teacherId];
      const prefix = `classrules-v1:${requestId.toLowerCase()}:`;
      const outcome = await prisma.$transaction(async tx => {
        await lockScheduleWrites(tx, actor.organizationId);
        const cls = await tx.class.findFirst({
          where: { id: classId, organizationId: actor.organizationId, campusId: actor.campusId, status: { not: 'deleted' } },
        });
        if (!cls) throw new ApiError('班级不属于当前校区', 403, 'FORBIDDEN');
        const payload = { actorId: actor.id, organizationId: actor.organizationId, campusId: actor.campusId, classId, startDate, endDate, teacher: requestedTeacher, replaceFuture, selectedRules: selectedRules ?? '__all__', expectedVersion };
        const groupId = classRulesGroupId(requestId, payload);
        const scope = { organizationId: actor.organizationId, requestId: requestId.toLowerCase() };
        const payloadHash = groupId.slice(prefix.length);
        const receipt = await tx.scheduleGenerationReceipt.findUnique({ where: { organizationId_requestId: scope } });
        if (receipt) {
          if (receipt.payloadHash !== payloadHash || receipt.actorId !== actor.id || receipt.campusId !== actor.campusId || receipt.classId !== classId) {
            throw new ApiError('请求标识已用于其他排课，请刷新后重试', 409, 'SCHEDULE_REQUEST_CONFLICT');
          }
          if (!receipt.response || typeof receipt.response !== 'object' || Array.isArray(receipt.response)) {
            throw new ApiError('排课回执格式无效', 500, 'INVALID_SCHEDULE_RECEIPT');
          }
          return { ...receipt.response, replayed: true };
        }
        // Requests completed before the receipt migration only tagged their newly created rows.
        const previous = await tx.schedule.findMany({ where: { organizationId: actor.organizationId, scheduleGroupId: { startsWith: prefix } }, orderBy: { startTime: 'asc' } });
        if (previous.length) {
          if (previous.some(row => row.scheduleGroupId !== groupId || row.classId !== classId || row.campusId !== actor.campusId)) {
            throw new ApiError('请求标识已用于其他排课，请刷新后重试', 409, 'SCHEDULE_REQUEST_CONFLICT');
          }
          return { count: previous.length, schedules: previous, replayed: true, skippedPast: 0 };
        }
        if (cls.updatedAt.toISOString() !== expectedVersion) throw new ApiError('班级资料或班级时间已更新，请刷新后重新预览', 409, 'CLASS_VERSION_CHANGED');
        if (cls.status !== 'active') throw new ApiError('班级已停用，无法排课', 409, 'CLASS_UNAVAILABLE');
        const teacherId = req.body.teacherId === undefined ? cls.teacherId : req.body.teacherId;
        await validateScheduleTeacher(tx, actor, teacherId);
        const courseId = await inheritClassCourse(tx, cls);
        // replaceFuture（2026-11-07 产品拍板）：重排=按班级时间替换未来未开始场次。
        // 历史保护与 replace-recurring 同源：有考勤/课时记录的未来场次一律拒绝，整批不落库。
        if (replaceFuture) {
          const now = new Date();
          const old = await tx.schedule.findMany({
            where: { organizationId: actor.organizationId, campusId: actor.campusId, classId, status: 'scheduled', startTime: { gt: now } },
            select: { id: true },
          });
          for (const row of old) {
            await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${row.id}))`;
            const [attendanceCount, lessonLogCount, deductionCount] = await Promise.all([
              tx.attendance.count({ where: { scheduleId: row.id } }),
              tx.lessonLog.count({ where: { scheduleId: row.id } }),
              tx.lessonDeductionRecord.count({ where: { scheduleId: row.id } }),
            ]);
            if (attendanceCount > 0 || lessonLogCount > 0 || deductionCount > 0) {
              throw new ApiError('未来课程已有考勤或课时记录，原有课程未更改', 409, 'SCHEDULE_LOCKED');
            }
            const changed = await tx.schedule.updateMany({ where: { id: row.id, status: 'scheduled' }, data: { status: 'cancelled' } });
            if (changed.count !== 1) throw new ApiError('课程已发生变化，请刷新后重试', 409, 'SCHEDULE_CHANGED');
          }
        }
        const { slots, skippedPast } = await buildClassRuleSlots(tx, classId, startDate, endDate, selectedRules);
        const created = [];
        let reusedCount = 0;
        // 共存提醒（2026-11-07 用户拍板）：新建与复用的时段都查一遍"该时间点已有一节课"。
        const coexistSeen = new Set<string>();
        const coexisting = [];
        for (const slot of slots) {
          const data = {
            organizationId: actor.organizationId, campusId: actor.campusId, classId, courseId, teacherId,
            startTime: slot.startTime, endTime: slot.endTime, classroom: slot.classroom, scheduleGroupId: groupId,
          };
          // 完全相同的已排场次复用不重建；其余任一冲突即抛错，整批回滚。
          const duplicate = await assertScheduleAvailable(tx, data, { allowExactReuse: true, inheritCourse: true });
          if (duplicate) reusedCount++;
          for (const note of await findCoexistingSessions(tx, data)) {
            if (coexistSeen.has(note.scheduleId)) continue;
            coexistSeen.add(note.scheduleId);
            coexisting.push(note);
          }
          created.push(duplicate || await tx.schedule.create({ data }));
        }
        const response = { count: created.length, createdCount: created.length - reusedCount, reusedCount, schedules: created, replayed: false, skippedPast, coexisting: coexisting.slice(0, 30), coexistingTotal: coexisting.length };
        await tx.scheduleGenerationReceipt.create({ data: {
          ...scope, campusId: actor.campusId, classId, actorId: actor.id, payloadHash,
          response: JSON.parse(JSON.stringify(response)),
        } });
        return response;
      }, { timeout: 30000 });
      sendSuccess(res, outcome, outcome.replayed ? '此前排课请求已处理，请刷新课表' : '课表已生成', outcome.replayed ? 200 : 201);
    } catch (error) { next(error); }
  },

  /** 按班级时间停/复某一个时段（2026-11-07 用户拍板）：只作用于该班未来场次，班级整体状态不动。
   *  pause：未开始的该时段场次 → class_paused（有考勤/课时记录的跳过保留）；resume：逐场冲突校验后恢复 scheduled。 */
  setClassRuleSlotStatus: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const actor = requireSchedulingActor(req);
      const { classId } = req.body;
      const action = req.body.action;
      const weekday = req.body.weekday, startTime = req.body.startTime, endTime = req.body.endTime;
      const clock = (v: unknown) => typeof v === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(v);
      if (typeof classId !== 'string' || !classId || (action !== 'pause' && action !== 'resume') ||
          !Number.isInteger(weekday) || (weekday as number) < 0 || (weekday as number) > 6 || !clock(startTime) || !clock(endTime) || (endTime as string) <= (startTime as string)) {
        throw new ApiError('时段参数无效', 400, 'INVALID_PARAMS');
      }
      const outcome = await prisma.$transaction(async tx => {
        await lockScheduleWrites(tx, actor.organizationId);
        const cls = await tx.class.findFirst({
          where: { id: classId, organizationId: actor.organizationId, campusId: actor.campusId },
          include: { weeklyRules: true },
        });
        if (!cls) throw new ApiError('班级不属于当前校区', 403, 'FORBIDDEN');
        if (cls.status !== 'active') throw new ApiError('班级当前不是活跃状态，请先整体复课后再按时段操作', 409, 'CLASS_UNAVAILABLE');
        // 所操作时段必须是该班的班级时间之一
        const isClassRule = cls.weeklyRules.some(row => row.weekday === weekday && row.startTime === startTime && row.endTime === endTime);
        if (!isClassRule) throw new ApiError('该时段不是此班的班级时间', 400, 'INVALID_TIME');
        const now = new Date();
        const fromStatus = action === 'pause' ? 'scheduled' : CLASS_PAUSED;
        const toStatus = action === 'pause' ? CLASS_PAUSED : 'scheduled';
        const scope = { organizationId: actor.organizationId, campusId: actor.campusId, classId };
        const futures = await tx.schedule.findMany({
          where: { ...scope, status: fromStatus, startTime: { gt: now } },
          orderBy: { id: 'asc' }, select: { id: true, startTime: true, endTime: true },
        });
        // Rules are same-day Shanghai wall-clock intervals with exact minute boundaries.
        const matchesSlot = (row: { startTime: Date; endTime: Date }) => {
          const local = new Date(+row.startTime + 8 * 3600000);
          const date = local.toISOString().slice(0, 10);
          return local.getUTCDay() === weekday &&
            +row.startTime === Date.parse(date + 'T' + startTime + ':00+08:00') &&
            +row.endTime === Date.parse(date + 'T' + endTime + ':00+08:00');
        };
        const matching = futures.filter(matchesSlot);
        let changed = 0, skippedHistory = 0;
        for (const candidate of matching) {
          // Attendance/correction holds this lock through its status, balance and ledger writes.
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${candidate.id}))`;
          const row = await tx.schedule.findFirst({ where: { ...scope, id: candidate.id } });
          if (!row || row.startTime <= new Date() || !matchesSlot(row)) continue;
          const history = await Promise.all([
            tx.attendance.count({ where: { scheduleId: row.id } }),
            tx.lessonLog.count({ where: { scheduleId: row.id } }),
            tx.lessonDeductionRecord.count({ where: { scheduleId: row.id } }),
          ]);
          if (history.some(count => count > 0)) { skippedHistory++; continue; }
          if (row.status !== fromStatus) continue;
          if (action === 'resume') {
            await validateScheduleTeacher(tx, actor, row.teacherId);
            await assertScheduleAvailable(tx, row, { excludeIds: [row.id] });
          }
          const update = await tx.schedule.updateMany({
            where: { ...scope, id: row.id, status: fromStatus, startTime: { gt: new Date() } },
            data: { status: toStatus },
          });
          changed += update.count;
        }
        return { changed, matched: matching.length, skippedHistory };
      }, { timeout: 30000 });
      sendSuccess(res, outcome, action === 'pause'
        ? `已停该时段未来场次 ${outcome.changed} 场${outcome.skippedHistory ? `（${outcome.skippedHistory} 场有记录保留）` : ''}`
        : `已恢复该时段场次 ${outcome.changed} 场`);
    } catch (error) { next(error); }
  },
};
