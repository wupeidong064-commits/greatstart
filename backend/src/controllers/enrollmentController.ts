import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import { ApiError } from '../middleware/errorHandler';
import { sendSuccess, sendPaginated } from '../utils/response';
import prisma from '../config/database';

export const enrollmentController = {
  getEnrollments: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const pageSize = parseInt(req.query.pageSize as string) || 10;
      const studentId = req.query.studentId as string;
      const classId = req.query.classId as string;
      const status = req.query.status as string;

      const where: any = {
        organizationId: req.body.organizationId,
      };

      if (studentId) {
        where.studentId = studentId;
      }

      if (classId) {
        where.classId = classId;
      }

      if (status) {
        where.status = status;
      }

      const [enrollments, total] = await Promise.all([
        prisma.enrollment.findMany({
          where,
          include: {
            student: {
              select: {
                id: true,
                name: true,
                phone: true,
                parentPhone: true,
              },
            },
            class: {
              select: {
                id: true,
                name: true,
                code: true,
                courseType: true,
              },
            },
            enrolledByUser: {
              select: {
                id: true,
                name: true,
              },
            },
            _count: {
              select: {
                payments: true,
              },
            },
          },
          skip: (page - 1) * pageSize,
          take: pageSize,
          orderBy: { enrolledAt: 'desc' },
        }),
        prisma.enrollment.count({ where }),
      ]);

      sendPaginated(res, enrollments, page, pageSize, total);
    } catch (error) {
      next(error);
    }
  },

  getEnrollmentById: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;

      const enrollment = await prisma.enrollment.findUnique({
        where: { id },
        include: {
          student: true,
          class: {
            include: {
              teacher: true,
            },
          },
          enrolledByUser: true,
          payments: {
            orderBy: { paidAt: 'desc' },
          },
        },
      });

      if (!enrollment) {
        return next(new ApiError('报名记录不存在', 404, 'ENROLLMENT_NOT_FOUND'));
      }

      if (enrollment.organizationId !== req.body.organizationId) {
        return next(new ApiError('无权访问', 403, 'FORBIDDEN'));
      }

      sendSuccess(res, enrollment);
    } catch (error) {
      next(error);
    }
  },

  createEnrollment: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { studentId, classId, notes } = req.body;

      const organizationId = req.body.organizationId;

      // 验证学员
      const student = await prisma.student.findUnique({
        where: { id: studentId },
      });
      if (!student || student.organizationId !== organizationId) {
        return next(new ApiError('学员不存在或不属于该机构', 400, 'STUDENT_NOT_FOUND'));
      }

      // 验证班级
      const classData = await prisma.class.findUnique({
        where: { id: classId },
      });
      if (!classData || classData.organizationId !== organizationId) {
        return next(new ApiError('班级不存在或不属于该机构', 400, 'CLASS_NOT_FOUND'));
      }

      // 检查是否已报名
      const existing = await prisma.enrollment.findFirst({
        where: {
          studentId,
          classId,
          status: 'active',
        },
      });

      if (existing) {
        return next(new ApiError('该学员已报名此班级', 400, 'ENROLLMENT_EXISTS'));
      }

      const enrollment = await prisma.enrollment.create({
        data: {
          organizationId,
          studentId,
          classId,
          enrolledBy: req.user?.id,
          notes,
        },
      });

      sendSuccess(res, enrollment, '报名成功', 201);
    } catch (error) {
      next(error);
    }
  },

  updateEnrollment: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const { status, notes } = req.body;

      const enrollment = await prisma.enrollment.findUnique({
        where: { id },
      });

      if (!enrollment) {
        return next(new ApiError('报名记录不存在', 404, 'ENROLLMENT_NOT_FOUND'));
      }

      if (enrollment.organizationId !== req.body.organizationId) {
        return next(new ApiError('无权修改该报名记录', 403, 'FORBIDDEN'));
      }

      const updateData: any = {};
      if (status) updateData.status = status;
      if (notes !== undefined) updateData.notes = notes;

      const updated = await prisma.enrollment.update({
        where: { id },
        data: updateData,
      });

      sendSuccess(res, updated, '报名记录更新成功');
    } catch (error) {
      next(error);
    }
  },

  deleteEnrollment: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;

      const enrollment = await prisma.enrollment.findUnique({
        where: { id },
      });

      if (!enrollment) {
        return next(new ApiError('报名记录不存在', 404, 'ENROLLMENT_NOT_FOUND'));
      }

      if (enrollment.organizationId !== req.body.organizationId) {
        return next(new ApiError('无权删除该报名记录', 403, 'FORBIDDEN'));
      }

      await prisma.enrollment.delete({
        where: { id },
      });

      sendSuccess(res, null, '报名记录删除成功');
    } catch (error) {
      next(error);
    }
  },

  transferStudent: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { studentId, newClassId, notes } = req.body;
      const organizationId = req.body.organizationId;

      // 验证学员
      const student = await prisma.student.findUnique({
        where: { id: studentId },
      });
      if (!student || student.organizationId !== organizationId) {
        return next(new ApiError('学员不存在或不属于该机构', 400, 'STUDENT_NOT_FOUND'));
      }

      // 验证新班级
      const newClass = await prisma.class.findUnique({
        where: { id: newClassId },
      });
      if (!newClass || newClass.organizationId !== organizationId) {
        return next(new ApiError('班级不存在或不属于该机构', 400, 'CLASS_NOT_FOUND'));
      }

      // 查找学员的当前活跃报名记录
      const currentEnrollments = await prisma.enrollment.findMany({
        where: {
          studentId,
          status: 'active',
          organizationId,
        },
        include: {
          class: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });

      if (currentEnrollments.length === 0) {
        return next(new ApiError('该学员没有活跃的班级报名记录', 400, 'NO_ACTIVE_ENROLLMENT'));
      }

      // 检查是否已经在新班级报名
      const existingInNewClass = await prisma.enrollment.findFirst({
        where: {
          studentId,
          classId: newClassId,
          status: 'active',
        },
      });

      if (existingInNewClass) {
        return next(new ApiError('该学员已在新班级报名', 400, 'ALREADY_ENROLLED'));
      }

      // 使用事务处理调班
      const result = await prisma.$transaction(async (tx) => {
        // 将当前所有活跃报名记录状态改为transferred
        await Promise.all(
          currentEnrollments.map((enrollment) =>
            tx.enrollment.update({
              where: { id: enrollment.id },
              data: {
                status: 'transferred',
                notes: notes || `调班到 ${newClass.name}`,
              },
            })
          )
        );

        // 创建新的报名记录
        const newEnrollment = await tx.enrollment.create({
          data: {
            organizationId,
            studentId,
            classId: newClassId,
            enrolledBy: req.user?.id,
            notes: notes || `从 ${currentEnrollments[0].class.name} 调班`,
          },
          include: {
            class: {
              select: {
                id: true,
                name: true,
                code: true,
              },
            },
            student: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        });

        return newEnrollment;
      });

      sendSuccess(res, result, '调班成功');
    } catch (error) {
      next(error);
    }
  },
};

