import { readLessonLedgers } from '../services/lessonLedger';
import { studentAccess } from '../utils/studentAccess';
import prisma from '../config/database';
import { submitScheduleAttendance } from '../services/scheduleAttendanceService';
import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import { ApiError } from '../middleware/errorHandler';
import { sendSuccess, sendPaginated } from '../utils/response';
import { deductActivityLessons } from '../services/activityDeductService';
import { addLessonsIdempotently } from '../services/lessonAddService';

// 辅助函数：获取当前用户信息
const getCurrentUser = (req: AuthRequest) => {
  return req.user;
};

export const lessonLogController = {
  getBalance: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const id = req.query.studentId;
      if (typeof id !== 'string' || !id) throw new ApiError('请选择学员',400,'INVALID_STUDENT');
      const access = studentAccess(req);
      const data = await prisma.$transaction(async tx => {
        const student = await tx.student.findFirst({where:{id,AND:[access.where]},select:{id:true,remainingLessons:true}});
        if (!student) throw new ApiError('学员不在当前负责范围',403,'FORBIDDEN');
        const ledger = (await readLessonLedgers(tx,[student],access.campus.organizationId)).get(id)!;
        return {studentId:id,remainingLessons:student.remainingLessons,...ledger.balance};
      },{isolationLevel:'RepeatableRead'});
      res.set('Cache-Control','no-store');
      sendSuccess(res,data);
    } catch (error) { next(error); }
  },
  // 获取课时日志列表
  getLessonLogs: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const pageSize = parseInt(req.query.pageSize as string) || 10;
      const type = req.query.type as string;
      const studentId = req.query.studentId as string;
      const studentName = typeof req.query.studentName === 'string' ? req.query.studentName.trim() : '';
      const startDate = req.query.startDate as string;
      const endDate = req.query.endDate as string;

      const currentUser = getCurrentUser(req);
      const targetOrgId = currentUser?.organizationId;

      if (!targetOrgId) {
        return next(new ApiError('未分配机构', 403, 'FORBIDDEN'));
      }

      if (!currentUser?.campusId) throw new ApiError('未分配校区',403,'FORBIDDEN');
      const scopedStudents = await prisma.student.findMany({
        where: { AND: [studentAccess(req).where, ...(studentName ? [{ name: { contains: studentName, mode: 'insensitive' as const } }] : [])] },
        select: { id: true },
      });
      // 日期参数先校验再进查询：非法日期给 400 而不是 500
      const dateOf = (v: unknown, label: string) => {
        if (v == null || v === '') return undefined;
        const d = new Date(String(v));
        if (!Number.isFinite(+d)) throw new ApiError(`${label}格式无效`, 400, 'INVALID_DATE');
        return d;
      };
      const startAt = dateOf(startDate, '开始日期'), endAt = dateOf(endDate, '结束日期');
      const where: import('@prisma/client').Prisma.LessonLogWhereInput = {
        organizationId: targetOrgId,
        AND: [{ studentId: { in: scopedStudents.map(s => s.id) } }, ...(studentId ? [{ studentId }] : [])],
        ...(type ? { type } : {}),
        // 2026-11-08 用户拍板（⑪修订）：增减课台账只看学员管理页的手动增减课——
        // 赠课/手动增课 + 划课（含签到更正返还）；成单入账、退费扣/返、建档初始一律不出现。
        ...(req.query.source === 'manual' ? {
          OR: [
            {
              type: 'add',
              NOT: [
                { notes: { startsWith: '新签入账' } },
                { notes: { startsWith: '续费入账' } },
                { notes: { startsWith: '退费取消返还' } },
                { notes: { in: ['建档初始课时'] } },
              ],
            },
            { type: 'deduct' },
          ],
        } : {}),
        ...((startAt || endAt) ? { createdAt: { ...(startAt ? { gte: startAt } : {}), ...(endAt ? { lte: endAt } : {}) } } : {}),
      };
      const [logs, count] = await prisma.$transaction([
        prisma.lessonLog.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
        prisma.lessonLog.count({ where }),
      ]);

      const scheduleIds = [...new Set((logs || []).map((log: any) => log.scheduleId).filter(Boolean))] as string[];
      const schedules = scheduleIds.length ? await prisma.schedule.findMany({
        where: { id: { in: scheduleIds }, organizationId: targetOrgId, campusId: currentUser.campusId },
        select: { id: true, class: { select: { name: true } } },
      }) : [];
      const classNames = new Map(schedules.map(schedule => [schedule.id, schedule.class.name]));
      sendPaginated(res, (logs || []).map((log: any) => ({ ...log, className: classNames.get(log.scheduleId) || null })), page, pageSize, count || 0);
    } catch (error) {
      next(error);
    }
  },

  // 创建课时日志
  createLessonLog: async (req: AuthRequest, res: Response, next: NextFunction) => {
    next(new ApiError('课时流水必须随业务事务生成，请使用增课或场次签到', 409, 'USE_LESSON_TRANSACTION'));
  },

  // 增课
  addLessons: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const actor = getCurrentUser(req);
      if (!actor) throw new ApiError('未认证', 401, 'UNAUTHORIZED');
      res.status(200).json(await addLessonsIdempotently(actor, req.body));
    } catch (error) { next(error); }
  },

  // 划课（扣减课时）——统一场次签到（单学员固定 1 课时；更正返还由服务处理）
  deductLessons: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const actor = getCurrentUser(req);
      if (!actor) throw new ApiError('未认证',401,'UNAUTHORIZED');
      const lessons = req.body.lessons ?? 1; // 新前端不再传 lessons：单学员场次签到固定 1
      if (Number(lessons) !== 1) throw new ApiError('场次签到每次仅支持1课时',400,'INVALID_PARAMS');
      sendSuccess(res, await submitScheduleAttendance(actor, req.body.scheduleId, [{studentId:req.body.studentId,status:req.body.attendanceStatus || 'present',lessonSource:req.body.lessonSource}]));
    } catch(error) { next(error); }
  },

  // 2026-11-08 用户拍板（⑫）：活动划课——不依赖班级/排课场次的活动课直接扣课时（备注必填，进增减课台账）。
  // 与场次签到分流：不产生考勤、不推进最后上课日期；课消口径按 deduct 计入。
  activityDeduct: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const actor = getCurrentUser(req);
      if (!actor) throw new ApiError('未认证', 401, 'UNAUTHORIZED');
      res.status(200).json(await deductActivityLessons(actor, req.body, req.get('Idempotency-Key')));
    } catch (error) { next(error); }
  },
};
