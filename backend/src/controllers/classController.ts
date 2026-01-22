import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import { ApiError } from '../middleware/errorHandler';
import { sendSuccess, sendPaginated } from '../utils/response';
import prisma from '../config/database';

export const classController = {
  getClasses: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const pageSize = parseInt(req.query.pageSize as string) || 10;
      const search = req.query.search as string;
      const status = req.query.status as string;
      const campusId = req.query.campusId as string;
      const teacherId = req.query.teacherId as string;

      const where: any = {
        organizationId: req.body.organizationId,
      };

      if (campusId) {
        where.campusId = campusId;
      } else if (req.user?.campusId) {
        where.campusId = req.user.campusId;
      }

      if (status) {
        where.status = status;
      }

      if (teacherId) {
        where.teacherId = teacherId;
      }

      if (search) {
        where.OR = [
          { name: { contains: search, mode: 'insensitive' } },
          { code: { contains: search, mode: 'insensitive' } },
        ];
      }

      const [classes, total] = await Promise.all([
        prisma.class.findMany({
          where,
          include: {
            campus: {
              select: {
                id: true,
                name: true,
                code: true,
              },
            },
            teacher: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
            _count: {
              select: {
                enrollments: true,
                schedules: true,
              },
            },
          },
          skip: (page - 1) * pageSize,
          take: pageSize,
          orderBy: { createdAt: 'desc' },
        }),
        prisma.class.count({ where }),
      ]);

      sendPaginated(res, classes, page, pageSize, total);
    } catch (error) {
      next(error);
    }
  },

  getClassById: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;

      const classData = await prisma.class.findUnique({
        where: { id },
        include: {
          organization: {
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
          teacher: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
            },
          },
          enrollments: {
            include: {
              student: {
                select: {
                  id: true,
                  name: true,
                  phone: true,
                  parentPhone: true,
                },
              },
            },
          },
          schedules: {
            orderBy: { startTime: 'asc' },
          },
        },
      });

      if (!classData) {
        return next(new ApiError('班级不存在', 404, 'CLASS_NOT_FOUND'));
      }

      if (classData.organizationId !== req.body.organizationId) {
        return next(new ApiError('无权访问', 403, 'FORBIDDEN'));
      }

      sendSuccess(res, classData);
    } catch (error) {
      next(error);
    }
  },

  createClass: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const {
        name,
        code,
        courseType,
        level,
        capacity,
        teacherId,
        startDate,
        endDate,
        description,
        campusId,
      } = req.body;

      const organizationId = req.body.organizationId;
      const targetCampusId = campusId || req.user?.campusId;

      // 检查代码是否已存在
      const existing = await prisma.class.findFirst({
        where: {
          organizationId,
          code,
        },
      });

      if (existing) {
        return next(new ApiError('班级代码已存在', 400, 'CODE_EXISTS'));
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

      // 验证教练
      if (teacherId) {
        const teacher = await prisma.user.findUnique({
          where: { id: teacherId },
        });
        if (!teacher || teacher.organizationId !== organizationId) {
          return next(new ApiError('教练不存在或不属于该机构', 400, 'TEACHER_NOT_FOUND'));
        }
      }

      const classData = await prisma.class.create({
        data: {
          organizationId,
          campusId: targetCampusId,
          name,
          code,
          courseType,
          level,
          capacity,
          teacherId,
          startDate: startDate ? new Date(startDate) : null,
          endDate: endDate ? new Date(endDate) : null,
          description,
        },
      });

      sendSuccess(res, classData, '班级创建成功', 201);
    } catch (error) {
      next(error);
    }
  },

  updateClass: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const {
        name,
        courseType,
        level,
        capacity,
        teacherId,
        startDate,
        endDate,
        description,
        status,
        campusId,
      } = req.body;

      const classData = await prisma.class.findUnique({
        where: { id },
      });

      if (!classData) {
        return next(new ApiError('班级不存在', 404, 'CLASS_NOT_FOUND'));
      }

      if (classData.organizationId !== req.body.organizationId) {
        return next(new ApiError('无权修改该班级', 403, 'FORBIDDEN'));
      }

      const updateData: any = {};
      if (name) updateData.name = name;
      if (courseType) updateData.courseType = courseType;
      if (level !== undefined) updateData.level = level;
      if (capacity) updateData.capacity = capacity;
      if (teacherId !== undefined) updateData.teacherId = teacherId;
      if (startDate !== undefined) updateData.startDate = startDate ? new Date(startDate) : null;
      if (endDate !== undefined) updateData.endDate = endDate ? new Date(endDate) : null;
      if (description !== undefined) updateData.description = description;
      if (status) updateData.status = status;

      if (campusId) {
        const campus = await prisma.campus.findUnique({
          where: { id: campusId },
        });
        if (!campus || campus.organizationId !== classData.organizationId) {
          return next(new ApiError('校区不存在或不属于该机构', 400, 'CAMPUS_NOT_FOUND'));
        }
        updateData.campusId = campusId;
      }

      const updated = await prisma.class.update({
        where: { id },
        data: updateData,
      });

      sendSuccess(res, updated, '班级更新成功');
    } catch (error) {
      next(error);
    }
  },

  deleteClass: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;

      const classData = await prisma.class.findUnique({
        where: { id },
      });

      if (!classData) {
        return next(new ApiError('班级不存在', 404, 'CLASS_NOT_FOUND'));
      }

      if (classData.organizationId !== req.body.organizationId) {
        return next(new ApiError('无权删除该班级', 403, 'FORBIDDEN'));
      }

      await prisma.class.delete({
        where: { id },
      });

      sendSuccess(res, null, '班级删除成功');
    } catch (error) {
      next(error);
    }
  },

  getExperiencePriorityClasses: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const organizationId = req.body.organizationId;

      // 获取所有活跃班级
      const allClasses = await prisma.class.findMany({
        where: {
          organizationId,
          status: 'active',
        },
        include: {
          teacher: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          enrollments: {
            where: { status: 'active' },
            select: { studentId: true },
          },
          schedules: {
            where: {
              startTime: { gte: new Date() }, // 未来的排课
            },
            select: { id: true },
          },
          _count: {
            select: {
              enrollments: true,
              schedules: true,
            },
          },
        },
      });

      // 筛选需要优先安排体验课的班级：
      // 1. 新创建的班级（创建时间在30天内）且没有排课
      // 2. 学员数少于5人的班级
      // 3. 没有未来排课的班级
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const experiencePriorityClasses = allClasses.filter((classData) => {
        const isNewClass = classData.createdAt >= thirtyDaysAgo;
        const hasFewStudents = classData.enrollments.length < 5;
        const hasNoFutureSchedules = classData.schedules.length === 0;

        return (isNewClass && hasNoFutureSchedules) || hasFewStudents || hasNoFutureSchedules;
      });

      sendSuccess(res, experiencePriorityClasses);
    } catch (error) {
      next(error);
    }
  },
};

