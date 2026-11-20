import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import { ApiError } from '../middleware/errorHandler';
import { sendSuccess, sendPaginated } from '../utils/response';
import prisma from '../config/database';
import { Prisma } from '@prisma/client';
import { registrationActor } from '../services/registrationRequestService';
import { attendedStatuses, availableSchedules, confirmedSignup, editExperience, experienceAccess, registerExperience, signupExperienceStatuses, unconvertedWhere } from '../services/experienceRegistrationService';

function withSignupFlag<T extends { _count: { conversions: number } }>({ _count, ...lesson }: T) {
  return { ...lesson, hasConfirmedSignup: _count.conversions > 0 };
}

export const experienceLessonController = {
  // 获取体验课列表
  getExperienceLessons: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const pageSize = parseInt(req.query.pageSize as string) || 10;
      const teachingTeacherId = req.query.teachingTeacherId as string;
      const assigneeId = req.query.assigneeId as string;
      const status = req.query.status as string;
      const unconvertedOnly = req.query.unconvertedOnly === 'true';
      const studentName = req.query.studentName as string;

      const actor = registrationActor(req);
      const filters: Prisma.ExperienceLessonWhereInput = {};
      if (teachingTeacherId) filters.teachingTeacherId = teachingTeacherId;
      if (assigneeId) filters.assigneeId = assigneeId;
      if (studentName) filters.studentName = { contains: studentName, mode: 'insensitive' };
      if (unconvertedOnly) {
        // Legacy callers sent status=completed as a tab label; include all attended states.
        Object.assign(filters, unconvertedWhere(actor));
        const requested = status?.split(',').map(value => value.trim());
        if (requested && !(requested.includes('completed') && requested.every(value => ['completed', 'unconverted'].includes(value)))) {
          filters.status = { in: requested.filter(value => attendedStatuses.includes(value)) };
        }
      } else if (status) {
        filters.status = { in: status.split(',').map(value => value.trim()) };
      }
      const where = { AND: [experienceAccess(actor), filters] };

      const [lessons, count] = await Promise.all([
        prisma.experienceLesson.findMany({
          where,
          include: { _count: { select: { conversions: { where: confirmedSignup(actor) } } } },
          orderBy: { scheduleDate: 'desc' },
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        prisma.experienceLesson.count({ where }),
      ]);

      sendPaginated(res, lessons.map(withSignupFlag), page, pageSize, count);
    } catch (error) {
      next(error);
    }
  },

  getAvailableSchedules: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      sendSuccess(res, await availableSchedules(registrationActor(req), req.query.classId));
    } catch (error) {
      next(error);
    }
  },

  // 获取单条体验课
  getExperienceLessonById: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const actor = registrationActor(req);
      const lesson = await prisma.experienceLesson.findFirst({ where: { id, ...experienceAccess(actor) },
        include: { _count: { select: { conversions: { where: confirmedSignup(actor) } } } } });
      if (!lesson) throw new ApiError('体验课不存在或不在当前负责范围', 404, 'NOT_FOUND');
      sendSuccess(res, withSignupFlag(lesson));
    } catch (error) {
      next(error);
    }
  },

  // 创建体验课
  createExperienceLesson: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const result = await registerExperience(req);
      res.set('Idempotency-Status', result.status);
      sendSuccess(res, result.data, '创建成功', result.status === 'replayed' ? 200 : 201);
    } catch (error) {
      next(error);
    }
  },

  // 更新体验课
  updateExperienceLesson: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const updated = await editExperience(registrationActor(req), req.params.id, req.body);
      sendSuccess(res, updated, '更新成功');
    } catch (error) {
      next(error);
    }
  },

  // 更新体验课状态
  updateStatus: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.body.status) throw new ApiError('请选择体验课状态', 400, 'INVALID_STATUS');
      const updated = await editExperience(registrationActor(req), req.params.id, { status: req.body.status });
      sendSuccess(res, updated, '状态更新成功');
    } catch (error) {
      next(error);
    }
  },

  // 删除体验课
  deleteExperienceLesson: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const actor = registrationActor(req);
      await prisma.$transaction(async tx => {
        // The order creation path takes the same row lock before linking a signup.
        await tx.$queryRaw`SELECT id FROM experience_lessons WHERE id = ${id} AND "organizationId" = ${actor.organizationId} FOR UPDATE`;
        const existing = await tx.experienceLesson.findFirst({ where: { id, ...experienceAccess(actor) }, select: { id: true } });
        if (!existing) throw new ApiError('体验课不存在或不在当前负责范围', 404, 'NOT_FOUND');
        if (await tx.conversion.findFirst({ where: { experienceLessonId: id } })) {
          throw new ApiError('体验课已关联成单，请保留转化记录', 409, 'LINKED_CONVERSION');
        }
        await tx.experienceLesson.delete({ where: { id } });
      });

      sendSuccess(res, null, '删除成功');
    } catch (error) {
      next(error);
    }
  },

  // Order entry includes pending bookings. Keep marketing's attended-only definition separate.
  getConversionCandidates: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const actor = registrationActor(req);
      const page = Math.max(1, parseInt(String(req.query.page)) || 1);
      const pageSize = Math.min(100, Math.max(1, parseInt(String(req.query.pageSize)) || 100));
      const where: Prisma.ExperienceLessonWhereInput = { AND: [experienceAccess(actor), {
        status: { in: signupExperienceStatuses },
        // Any prior order must be reconciled through the existing order/correction flow.
        conversions: { none: {} },
      }] };
      const [lessons, total] = await Promise.all([
        prisma.experienceLesson.findMany({ where, orderBy: [{ scheduleDate: 'desc' }, { id: 'asc' }],
          skip: (page - 1) * pageSize, take: pageSize }),
        prisma.experienceLesson.count({ where }),
      ]);
      sendPaginated(res, lessons, page, pageSize, total);
    } catch (error) { next(error); }
  },

  // 获取未成单列表（到场但未成单的体验课 + 未到场的体验课）
  getUnconverted: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const actor = registrationActor(req);
      // Order entry and AI follow-up also need no-shows. The paginated marketing tab counts attended lessons only.
      const lessons = await prisma.experienceLesson.findMany({
        where: { AND: [experienceAccess(actor), unconvertedWhere(actor, true)] },
        orderBy: { scheduleDate: 'desc' }, take: 50,
      });
      sendSuccess(res, lessons);
    } catch (error) {
      next(error);
    }
  },

  // 获取教练转化率统计
  getTeacherConversionStats: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const actor = registrationActor(req);
      const teachingTeacherId = req.query.teachingTeacherId as string;
      const assigneeId = req.query.assigneeId as string;
      const startDate = req.query.startDate as string;
      const endDate = req.query.endDate as string;
      const where: Prisma.ExperienceLessonWhereInput = { AND: [experienceAccess(actor)] };

      // 按上课教练筛选
      if (teachingTeacherId) {
        where.teachingTeacherId = teachingTeacherId;
      }

      // 按负责人筛选
      if (assigneeId) {
        where.assigneeId = assigneeId;
      }

      // 按日期范围筛选（按 scheduleDate）
      if (startDate || endDate) {
        where.scheduleDate = { ...(startDate ? { gte: startDate } : {}), ...(endDate ? { lte: endDate } : {}) };
      }

      const lessons = await prisma.experienceLesson.findMany({
        where,
        select: {
          teachingTeacherId: true,
          teachingTeacherName: true,
          status: true,
          _count: { select: { conversions: { where: confirmedSignup(actor) } } },
        },
      });

      // 按教练分组统计
      const statsMap = new Map<string, { teacherId: string; teacherName: string; total: number; converted: number }>();

      for (const lesson of lessons) {
        const teacherId = lesson.teachingTeacherId;
        const teacherName = lesson.teachingTeacherName || '未知教练';

        if (!teacherId) continue; // 跳过没有教练的记录

        if (!statsMap.has(teacherId)) {
          statsMap.set(teacherId, {
            teacherId,
            teacherName,
            total: 0,
            converted: 0,
          });
        }

        const stats = statsMap.get(teacherId)!;
        stats.total++;
        if (attendedStatuses.includes(lesson.status) && lesson._count.conversions) {
          stats.converted++;
        }
      }

      // 转换为数组并计算转化率
      const result = Array.from(statsMap.values()).map(stats => ({
        teacherId: stats.teacherId,
        teacherName: stats.teacherName,
        total: stats.total,
        converted: stats.converted,
        conversionRate: stats.total > 0 ? Math.round((stats.converted / stats.total) * 100) : 0,
      }));

      // 按转化率降序排序
      result.sort((a, b) => b.conversionRate - a.conversionRate);

      sendSuccess(res, result);
    } catch (error) {
      next(error);
    }
  },
};
