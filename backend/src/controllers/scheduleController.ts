import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import { ApiError } from '../middleware/errorHandler';
import { sendSuccess, sendPaginated } from '../utils/response';
import prisma from '../config/database';

export const scheduleController = {
  getSchedules: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const pageSize = parseInt(req.query.pageSize as string) || 10;
      const classId = req.query.classId as string;
      const startDate = req.query.startDate as string;
      const endDate = req.query.endDate as string;
      const status = req.query.status as string;

      const where: any = {
        organizationId: req.body.organizationId,
      };

      if (classId) {
        where.classId = classId;
      }

      if (startDate || endDate) {
        where.startTime = {};
        if (startDate) {
          where.startTime.gte = new Date(startDate);
        }
        if (endDate) {
          where.startTime.lte = new Date(endDate);
        }
      }

      if (status) {
        where.status = status;
      }

      const [schedules, total] = await Promise.all([
        prisma.schedule.findMany({
          where,
          include: {
            class: {
              select: {
                id: true,
                name: true,
                code: true,
              },
            },
            course: {
              select: {
                id: true,
                name: true,
              },
            },
            teacher: {
              select: {
                id: true,
                name: true,
              },
            },
            campus: {
              select: {
                id: true,
                name: true,
              },
            },
            _count: {
              select: {
                attendances: true,
              },
            },
          },
          skip: (page - 1) * pageSize,
          take: pageSize,
          orderBy: { startTime: 'asc' },
        }),
        prisma.schedule.count({ where }),
      ]);

      sendPaginated(res, schedules, page, pageSize, total);
    } catch (error) {
      next(error);
    }
  },

  getScheduleById: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;

      const schedule = await prisma.schedule.findUnique({
        where: { id },
        include: {
          class: {
            include: {
              enrollments: {
                include: {
                  student: {
                    select: {
                      id: true,
                      name: true,
                    },
                  },
                },
              },
            },
          },
          course: true,
          teacher: true,
          campus: true,
          attendances: {
            include: {
              student: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
        },
      });

      if (!schedule) {
        return next(new ApiError('排课不存在', 404, 'SCHEDULE_NOT_FOUND'));
      }

      if (schedule.organizationId !== req.body.organizationId) {
        return next(new ApiError('无权访问', 403, 'FORBIDDEN'));
      }

      sendSuccess(res, schedule);
    } catch (error) {
      next(error);
    }
  },

  createSchedule: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const {
        classId,
        courseId,
        teacherId,
        startTime,
        endTime,
        classroom,
        isRecurring,
        recurrenceRule,
        campusId,
      } = req.body;

      const organizationId = req.body.organizationId;
      const targetCampusId = campusId || req.user?.campusId;

      // 验证班级
      const classData = await prisma.class.findUnique({
        where: { id: classId },
      });
      if (!classData || classData.organizationId !== organizationId) {
        return next(new ApiError('班级不存在或不属于该机构', 400, 'CLASS_NOT_FOUND'));
      }

      // 验证课程
      if (courseId) {
        const course = await prisma.course.findUnique({
          where: { id: courseId },
        });
        if (!course || course.organizationId !== organizationId) {
          return next(new ApiError('课程不存在或不属于该机构', 400, 'COURSE_NOT_FOUND'));
        }
      }

      // 验证教练
      if (teacherId) {
        const teacher = await prisma.user.findUnique({
          where: { id: teacherId },
        });
        if (!teacher || teacher.organizationId !== organizationId) {
          return next(new ApiError('教练不存在或不属于该机构', 400, 'TEACHER_NOT_FOUND'));
        }
      }

      // 验证校区
      if (targetCampusId) {
        const campus = await prisma.campus.findUnique({
          where: { id: targetCampusId },
        });
        if (!campus || campus.organizationId !== organizationId) {
          return next(new ApiError('校区不存在或不属于该机构', 400, 'CAMPUS_NOT_FOUND'));
        }
      }

      const schedule = await prisma.schedule.create({
        data: {
          organizationId,
          campusId: targetCampusId,
          classId,
          courseId,
          teacherId,
          startTime: new Date(startTime),
          endTime: new Date(endTime),
          classroom,
          isRecurring,
          recurrenceRule,
        },
      });

      sendSuccess(res, schedule, '排课创建成功', 201);
    } catch (error) {
      next(error);
    }
  },

  updateSchedule: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const {
        teacherId,
        startTime,
        endTime,
        classroom,
        status,
        notes,
      } = req.body;

      const schedule = await prisma.schedule.findUnique({
        where: { id },
      });

      if (!schedule) {
        return next(new ApiError('排课不存在', 404, 'SCHEDULE_NOT_FOUND'));
      }

      if (schedule.organizationId !== req.body.organizationId) {
        return next(new ApiError('无权修改该排课', 403, 'FORBIDDEN'));
      }

      const updateData: any = {};
      if (teacherId !== undefined) updateData.teacherId = teacherId;
      if (startTime) updateData.startTime = new Date(startTime);
      if (endTime) updateData.endTime = new Date(endTime);
      if (classroom !== undefined) updateData.classroom = classroom;
      if (status) updateData.status = status;
      if (notes !== undefined) updateData.notes = notes;

      const updated = await prisma.schedule.update({
        where: { id },
        data: updateData,
      });

      sendSuccess(res, updated, '排课更新成功');
    } catch (error) {
      next(error);
    }
  },

  deleteSchedule: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;

      const schedule = await prisma.schedule.findUnique({
        where: { id },
      });

      if (!schedule) {
        return next(new ApiError('排课不存在', 404, 'SCHEDULE_NOT_FOUND'));
      }

      if (schedule.organizationId !== req.body.organizationId) {
        return next(new ApiError('无权删除该排课', 403, 'FORBIDDEN'));
      }

      await prisma.schedule.delete({
        where: { id },
      });

      sendSuccess(res, null, '排课删除成功');
    } catch (error) {
      next(error);
    }
  },

  reschedule: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const { newStartTime, newEndTime, notes } = req.body;

      const schedule = await prisma.schedule.findUnique({
        where: { id },
      });

      if (!schedule) {
        return next(new ApiError('排课不存在', 404, 'SCHEDULE_NOT_FOUND'));
      }

      if (schedule.organizationId !== req.body.organizationId) {
        return next(new ApiError('无权调课', 403, 'FORBIDDEN'));
      }

      // 创建新的排课记录，标记为调课
      const newSchedule = await prisma.schedule.create({
        data: {
          organizationId: schedule.organizationId,
          campusId: schedule.campusId,
          classId: schedule.classId,
          courseId: schedule.courseId,
          teacherId: schedule.teacherId,
          startTime: new Date(newStartTime),
          endTime: new Date(newEndTime),
          classroom: schedule.classroom,
          status: 'rescheduled',
          originalScheduleId: schedule.id,
          notes: notes || `调课自 ${schedule.startTime}`,
        },
      });

      // 更新原排课状态
      await prisma.schedule.update({
        where: { id },
        data: {
          status: 'rescheduled',
          notes: `已调课至 ${newStartTime}`,
        },
      });

      sendSuccess(res, newSchedule, '调课成功', 201);
    } catch (error) {
      next(error);
    }
  },

  createRecurringSchedules: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const {
        classId,
        teacherId,
        recurrenceType,
        startDate,
        endDate,
        weekDays,
        startTime,
        endTime,
        location,
      } = req.body;

      const organizationId = req.body.organizationId;

      // 验证班级
      const classData = await prisma.class.findUnique({
        where: { id: classId },
      });
      if (!classData || classData.organizationId !== organizationId) {
        return next(new ApiError('班级不存在或不属于该机构', 400, 'CLASS_NOT_FOUND'));
      }

      // 验证教练
      if (teacherId) {
        const teacher = await prisma.user.findUnique({
          where: { id: teacherId },
        });
        if (!teacher || teacher.organizationId !== organizationId) {
          return next(new ApiError('教练不存在或不属于该机构', 400, 'TEACHER_NOT_FOUND'));
        }
      }

      const schedules: any[] = [];
      const start = new Date(startDate);
      const end = new Date(endDate);
      
      let current = new Date(start);
      while (current <= end) {
        let shouldCreate = false;

        if (recurrenceType === 'daily') {
          shouldCreate = true;
        } else if (recurrenceType === 'weekly' && weekDays && weekDays.length > 0) {
          const dayOfWeek = current.getDay();
          shouldCreate = weekDays.includes(dayOfWeek);
        }

        if (shouldCreate) {
          const year = current.getFullYear();
          const month = String(current.getMonth() + 1).padStart(2, '0');
          const day = String(current.getDate()).padStart(2, '0');
          
          const startDateTime = new Date(`${year}-${month}-${day}T${startTime}:00`);
          const endDateTime = new Date(`${year}-${month}-${day}T${endTime}:00`);
          
          schedules.push({
            organizationId,
            campusId: classData.campusId,
            classId,
            teacherId: teacherId || classData.teacherId,
            startTime: startDateTime,
            endTime: endDateTime,
            classroom: location || null,
            isRecurring: true,
            recurrenceRule: recurrenceType === 'weekly' 
              ? `weekly:${weekDays.join(',')}` 
              : 'daily',
            status: 'scheduled',
          });
        }

        current.setDate(current.getDate() + 1);
      }

      if (schedules.length === 0) {
        return next(new ApiError('没有生成任何排课记录', 400, 'NO_SCHEDULES_GENERATED'));
      }

      const result = await prisma.schedule.createMany({
        data: schedules,
      });

      sendSuccess(res, { count: result.count, schedules: schedules.length }, `成功创建 ${result.count} 条排课记录`, 201);
    } catch (error) {
      next(error);
    }
  },
};

