import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import { ApiError } from '../middleware/errorHandler';
import { sendSuccess, sendPaginated } from '../utils/response';
import prisma from '../config/database';

export const parentController = {
  /**
   * 获取与当前家长用户关联的学员列表
   * 通过 User.phone 与 Student.parentPhone 匹配
   */
  getLinkedStudents: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const organizationId = req.body.organizationId;
      const userPhone = req.user?.phone;

      if (!userPhone) {
        return next(new ApiError('用户电话号码未设置，无法关联学员', 400, 'USER_PHONE_NOT_SET'));
      }

      // 通过家长电话查找关联的学员
      const students = await prisma.student.findMany({
        where: {
          organizationId,
          parentPhone: userPhone,
        },
        include: {
          campus: {
            select: {
              id: true,
              name: true,
              code: true,
            },
          },
          enrollments: {
            where: { status: 'active' },
            include: {
              class: {
                select: {
                  id: true,
                  name: true,
                  code: true,
                  courseType: true,
                  teacher: {
                    select: {
                      id: true,
                      name: true,
                    },
                  },
                },
              },
            },
          },
          _count: {
            select: {
              attendances: true,
              payments: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      sendSuccess(res, students);
    } catch (error) {
      next(error);
    }
  },

  /**
   * 获取指定学员的课表（已报名班级的课时安排）
   */
  getStudentSchedules: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { studentId } = req.params;
      const organizationId = req.body.organizationId;
      const userPhone = req.user?.phone;

      // 验证学员是否存在且属于该机构
      const student = await prisma.student.findUnique({
        where: { id: studentId },
      });

      if (!student) {
        return next(new ApiError('学员不存在', 404, 'STUDENT_NOT_FOUND'));
      }

      if (student.organizationId !== organizationId) {
        return next(new ApiError('无权访问该学员信息', 403, 'FORBIDDEN'));
      }

      // 验证家长是否有权访问该学员数据
      if (student.parentPhone !== userPhone) {
        return next(new ApiError('无权访问该学员信息', 403, 'FORBIDDEN'));
      }

      // 获取学员已报名的班级ID列表
      const enrollments = await prisma.enrollment.findMany({
        where: {
          studentId,
          status: 'active',
        },
        select: {
          classId: true,
        },
      });

      const classIds = enrollments.map((e) => e.classId);

      if (classIds.length === 0) {
        return sendSuccess(res, []);
      }

      // 获取这些班级的排课信息
      const page = parseInt(req.query.page as string) || 1;
      const pageSize = parseInt(req.query.pageSize as string) || 20;
      const startDate = req.query.startDate as string;
      const endDate = req.query.endDate as string;
      const status = req.query.status as string;

      const where: any = {
        classId: { in: classIds },
      };

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
      } else {
        // 默认只显示未来的和今天的课程
        where.startTime = { gte: new Date() };
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
                courseType: true,
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

  /**
   * 获取指定学员的出勤记录
   */
  getStudentAttendances: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { studentId } = req.params;
      const organizationId = req.body.organizationId;
      const userPhone = req.user?.phone;

      // 验证学员是否存在且属于该机构
      const student = await prisma.student.findUnique({
        where: { id: studentId },
      });

      if (!student) {
        return next(new ApiError('学员不存在', 404, 'STUDENT_NOT_FOUND'));
      }

      if (student.organizationId !== organizationId) {
        return next(new ApiError('无权访问该学员信息', 403, 'FORBIDDEN'));
      }

      // 验证家长是否有权访问该学员数据
      if (student.parentPhone !== userPhone) {
        return next(new ApiError('无权访问该学员信息', 403, 'FORBIDDEN'));
      }

      const page = parseInt(req.query.page as string) || 1;
      const pageSize = parseInt(req.query.pageSize as string) || 20;
      const startDate = req.query.startDate as string;
      const endDate = req.query.endDate as string;
      const status = req.query.status as string;

      const where: any = {
        studentId,
      };

      if (startDate || endDate) {
        where.checkInTime = {};
        if (startDate) {
          where.checkInTime.gte = new Date(startDate);
        }
        if (endDate) {
          where.checkInTime.lte = new Date(endDate);
        }
      }

      if (status) {
        where.status = status;
      }

      const [attendances, total] = await Promise.all([
        prisma.attendance.findMany({
          where,
          include: {
            schedule: {
              select: {
                id: true,
                startTime: true,
                endTime: true,
                classroom: true,
              },
            },
            class: {
              select: {
                id: true,
                name: true,
                code: true,
              },
            },
          },
          skip: (page - 1) * pageSize,
          take: pageSize,
          orderBy: { checkInTime: 'desc' },
        }),
        prisma.attendance.count({ where }),
      ]);

      // 计算统计信息
      const [presentCount, absentCount, lateCount, leaveCount] = await Promise.all([
        prisma.attendance.count({ where: { ...where, status: 'present' } }),
        prisma.attendance.count({ where: { ...where, status: 'absent' } }),
        prisma.attendance.count({ where: { ...where, status: 'late' } }),
        prisma.attendance.count({ where: { ...where, status: 'leave' } }),
      ]);

      const attendanceRate = (presentCount + lateCount) / (presentCount + absentCount + lateCount + leaveCount) * 100;

      sendSuccess(res, {
        data: attendances,
        pagination: {
          page,
          pageSize,
          total,
        },
        stats: {
          present: presentCount,
          absent: absentCount,
          late: lateCount,
          leave: leaveCount,
          attendanceRate: Math.round(attendanceRate * 100) / 100,
        },
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * 获取指定学员的缴费记录
   */
  getStudentPayments: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { studentId } = req.params;
      const organizationId = req.body.organizationId;
      const userPhone = req.user?.phone;

      // 验证学员是否存在且属于该机构
      const student = await prisma.student.findUnique({
        where: { id: studentId },
      });

      if (!student) {
        return next(new ApiError('学员不存在', 404, 'STUDENT_NOT_FOUND'));
      }

      if (student.organizationId !== organizationId) {
        return next(new ApiError('无权访问该学员信息', 403, 'FORBIDDEN'));
      }

      // 验证家长是否有权访问该学员数据
      if (student.parentPhone !== userPhone) {
        return next(new ApiError('无权访问该学员信息', 403, 'FORBIDDEN'));
      }

      const page = parseInt(req.query.page as string) || 1;
      const pageSize = parseInt(req.query.pageSize as string) || 20;
      const startDate = req.query.startDate as string;
      const endDate = req.query.endDate as string;

      const where: any = {
        studentId,
      };

      if (startDate || endDate) {
        where.paidAt = {};
        if (startDate) {
          where.paidAt.gte = new Date(startDate);
        }
        if (endDate) {
          where.paidAt.lte = new Date(endDate);
        }
      }

      const [payments, total] = await Promise.all([
        prisma.payment.findMany({
          where,
          include: {
            enrollment: {
              include: {
                class: {
                  select: {
                    id: true,
                    name: true,
                    code: true,
                  },
                },
              },
            },
            paidByUser: {
              select: {
                id: true,
                name: true,
              },
            },
          },
          skip: (page - 1) * pageSize,
          take: pageSize,
          orderBy: { paidAt: 'desc' },
        }),
        prisma.payment.count({ where }),
      ]);

      // 计算总缴费金额
      const allPayments = await prisma.payment.findMany({ where });
      const totalAmount = allPayments.reduce((sum, p) => sum + Number(p.amount), 0);

      // 按缴费类型分组统计
      const paymentByType = await prisma.payment.groupBy({
        by: ['paymentType'],
        where,
        _sum: {
          amount: true,
        },
      });

      sendSuccess(res, {
        data: payments,
        pagination: {
          page,
          pageSize,
          total,
        },
        summary: {
          totalAmount,
          paymentByType: paymentByType.reduce((acc, item) => {
            acc[item.paymentType] = Number(item._sum.amount || 0);
            return acc;
          }, {} as Record<string, number>),
        },
      });
    } catch (error) {
      next(error);
    }
  },
};
