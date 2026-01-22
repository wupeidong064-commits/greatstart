import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import { ApiError } from '../middleware/errorHandler';
import { sendSuccess, sendPaginated } from '../utils/response';
import prisma from '../config/database';

export const paymentController = {
  getPayments: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const pageSize = parseInt(req.query.pageSize as string) || 10;
      const studentId = req.query.studentId as string;
      const enrollmentId = req.query.enrollmentId as string;
      const startDate = req.query.startDate as string;
      const endDate = req.query.endDate as string;

      const where: any = {
        organizationId: req.body.organizationId,
      };

      if (studentId) {
        where.studentId = studentId;
      }

      if (enrollmentId) {
        where.enrollmentId = enrollmentId;
      }

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
            student: {
              select: {
                id: true,
                name: true,
                phone: true,
              },
            },
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

      sendPaginated(res, payments, page, pageSize, total);
    } catch (error) {
      next(error);
    }
  },

  getPaymentById: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;

      const payment = await prisma.payment.findUnique({
        where: { id },
        include: {
          student: true,
          enrollment: {
            include: {
              class: true,
            },
          },
          paidByUser: true,
        },
      });

      if (!payment) {
        return next(new ApiError('缴费记录不存在', 404, 'PAYMENT_NOT_FOUND'));
      }

      if (payment.organizationId !== req.body.organizationId) {
        return next(new ApiError('无权访问', 403, 'FORBIDDEN'));
      }

      sendSuccess(res, payment);
    } catch (error) {
      next(error);
    }
  },

  createPayment: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const {
        enrollmentId,
        studentId,
        amount,
        paymentType,
        paymentMethod,
        notes,
      } = req.body;

      const organizationId = req.body.organizationId;

      // 验证报名记录
      const enrollment = await prisma.enrollment.findUnique({
        where: { id: enrollmentId },
      });
      if (!enrollment || enrollment.organizationId !== organizationId) {
        return next(new ApiError('报名记录不存在或不属于该机构', 400, 'ENROLLMENT_NOT_FOUND'));
      }

      // 验证学员
      const student = await prisma.student.findUnique({
        where: { id: studentId },
      });
      if (!student || student.organizationId !== organizationId) {
        return next(new ApiError('学员不存在或不属于该机构', 400, 'STUDENT_NOT_FOUND'));
      }

      const payment = await prisma.payment.create({
        data: {
          organizationId,
          enrollmentId,
          studentId,
          amount: parseFloat(amount),
          paymentType,
          paymentMethod,
          paidBy: req.user?.id,
          notes,
        },
      });

      sendSuccess(res, payment, '缴费记录创建成功', 201);
    } catch (error) {
      next(error);
    }
  },

  updatePayment: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const { amount, paymentType, paymentMethod, notes } = req.body;

      const payment = await prisma.payment.findUnique({
        where: { id },
      });

      if (!payment) {
        return next(new ApiError('缴费记录不存在', 404, 'PAYMENT_NOT_FOUND'));
      }

      if (payment.organizationId !== req.body.organizationId) {
        return next(new ApiError('无权修改该缴费记录', 403, 'FORBIDDEN'));
      }

      const updateData: any = {};
      if (amount) updateData.amount = parseFloat(amount);
      if (paymentType) updateData.paymentType = paymentType;
      if (paymentMethod) updateData.paymentMethod = paymentMethod;
      if (notes !== undefined) updateData.notes = notes;

      const updated = await prisma.payment.update({
        where: { id },
        data: updateData,
      });

      sendSuccess(res, updated, '缴费记录更新成功');
    } catch (error) {
      next(error);
    }
  },

  deletePayment: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;

      const payment = await prisma.payment.findUnique({
        where: { id },
      });

      if (!payment) {
        return next(new ApiError('缴费记录不存在', 404, 'PAYMENT_NOT_FOUND'));
      }

      if (payment.organizationId !== req.body.organizationId) {
        return next(new ApiError('无权删除该缴费记录', 403, 'FORBIDDEN'));
      }

      await prisma.payment.delete({
        where: { id },
      });

      sendSuccess(res, null, '缴费记录删除成功');
    } catch (error) {
      next(error);
    }
  },
};

