import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import { ApiError } from '../middleware/errorHandler';
import { sendSuccess, sendPaginated } from '../utils/response';
import prisma from '../config/database';

export const courseController = {
  getCourses: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const pageSize = parseInt(req.query.pageSize as string) || 10;
      const search = req.query.search as string;
      const isActive = req.query.isActive === 'true' ? true : req.query.isActive === 'false' ? false : undefined;

      const where: any = {
        organizationId: req.body.organizationId,
      };

      if (isActive !== undefined) {
        where.isActive = isActive;
      }

      if (search) {
        where.OR = [
          { name: { contains: search, mode: 'insensitive' } },
          { code: { contains: search, mode: 'insensitive' } },
        ];
      }

      const [courses, total] = await Promise.all([
        prisma.course.findMany({
          where,
          skip: (page - 1) * pageSize,
          take: pageSize,
          orderBy: { createdAt: 'desc' },
        }),
        prisma.course.count({ where }),
      ]);

      sendPaginated(res, courses, page, pageSize, total);
    } catch (error) {
      next(error);
    }
  },

  getCourseById: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;

      const course = await prisma.course.findUnique({
        where: { id },
        include: {
          _count: {
            select: {
              schedules: true,
            },
          },
        },
      });

      if (!course) {
        return next(new ApiError('课程不存在', 404, 'COURSE_NOT_FOUND'));
      }

      if (course.organizationId !== req.body.organizationId) {
        return next(new ApiError('无权访问', 403, 'FORBIDDEN'));
      }

      sendSuccess(res, course);
    } catch (error) {
      next(error);
    }
  },

  createCourse: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { name, code, description, duration, price } = req.body;

      const organizationId = req.body.organizationId;

      // 检查代码是否已存在
      const existing = await prisma.course.findFirst({
        where: {
          organizationId,
          code,
        },
      });

      if (existing) {
        return next(new ApiError('课程代码已存在', 400, 'CODE_EXISTS'));
      }

      const course = await prisma.course.create({
        data: {
          organizationId,
          name,
          code,
          description,
          duration,
          price: price ? parseFloat(price) : 0,
        },
      });

      sendSuccess(res, course, '课程创建成功', 201);
    } catch (error) {
      next(error);
    }
  },

  updateCourse: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const { name, description, duration, price, isActive } = req.body;

      const course = await prisma.course.findUnique({
        where: { id },
      });

      if (!course) {
        return next(new ApiError('课程不存在', 404, 'COURSE_NOT_FOUND'));
      }

      if (course.organizationId !== req.body.organizationId) {
        return next(new ApiError('无权修改该课程', 403, 'FORBIDDEN'));
      }

      const updateData: any = {};
      if (name) updateData.name = name;
      if (description !== undefined) updateData.description = description;
      if (duration) updateData.duration = duration;
      if (price !== undefined) updateData.price = parseFloat(price);
      if (isActive !== undefined) updateData.isActive = isActive;

      const updated = await prisma.course.update({
        where: { id },
        data: updateData,
      });

      sendSuccess(res, updated, '课程更新成功');
    } catch (error) {
      next(error);
    }
  },

  deleteCourse: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;

      const course = await prisma.course.findUnique({
        where: { id },
      });

      if (!course) {
        return next(new ApiError('课程不存在', 404, 'COURSE_NOT_FOUND'));
      }

      if (course.organizationId !== req.body.organizationId) {
        return next(new ApiError('无权删除该课程', 403, 'FORBIDDEN'));
      }

      await prisma.course.delete({
        where: { id },
      });

      sendSuccess(res, null, '课程删除成功');
    } catch (error) {
      next(error);
    }
  },
};

