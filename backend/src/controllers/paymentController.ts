import { studentAccess } from '../utils/studentAccess';
import { Response, NextFunction } from 'express';
import { createHash } from 'crypto';
import { AuthRequest } from '../middleware/auth';
import { ApiError } from '../middleware/errorHandler';
import { sendSuccess, sendPaginated } from '../utils/response';
import prisma from '../config/database';
import { resolveScope } from '../utils/scope';
import { Prisma } from '@prisma/client';

function paymentScope(req: AuthRequest): Prisma.PaymentWhereInput {
  const { organizationId, campusId } = resolveScope(req);
  return { organizationId, ...(campusId ? { student: studentAccess(req).where, enrollment: { class: { campusId } } } : {}) };
}
function validAmount(value: unknown) {
  if ((typeof value !== 'string' && typeof value !== 'number') || !/^\d+(?:\.\d{1,2})?$/.test(String(value))) throw new ApiError('金额最多支持两位小数',400,'INVALID_AMOUNT');
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 99999999.99) throw new ApiError('缴费金额应大于0', 400, 'INVALID_AMOUNT');
  return amount;
}

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
        ...paymentScope(req),
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
          where.paidAt.gte = new Date(/^\d{4}-\d{2}-\d{2}$/.test(startDate) ? startDate + 'T00:00:00+08:00' : startDate);
        }
        if (endDate) {
          where.paidAt.lte = new Date(/^\d{4}-\d{2}-\d{2}$/.test(endDate) ? endDate + 'T23:59:59.999+08:00' : endDate);
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

      const payment = await prisma.payment.findFirst({
        where: { id, ...paymentScope(req) },
        include: {
          student: true,
          enrollment: {
            include: {
              class: true,
            },
          },
          paidByUser: {select:{id:true,name:true}},
        },
      });

      if (!payment) {
        return next(new ApiError('缴费记录不存在', 404, 'PAYMENT_NOT_FOUND'));
      }

      if (payment.organizationId !== resolveScope(req).organizationId) {
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

      const { organizationId, campusId } = resolveScope(req);
      if (!campusId) throw new ApiError('请先选择校区',403,'CAMPUS_REQUIRED');
      const value = validAmount(amount);
      const requestId = req.get('Idempotency-Key') || req.body.requestId;
      if (typeof requestId !== 'string' || !/^[a-zA-Z0-9_-]{16,128}$/.test(requestId)) throw new ApiError('请提供请求编号，重试保持不变',400,'IDEMPOTENCY_KEY_REQUIRED');
      if (!enrollmentId || !studentId || !['tuition','material','other'].includes(paymentType) || !['cash','card','transfer','alipay','wechat'].includes(paymentMethod)) throw new ApiError('收款参数无效',400,'INVALID_PAYMENT');
      if (notes !== undefined && (typeof notes !== 'string' || notes.length > 2000)) throw new ApiError('备注无效',400,'INVALID_PAYMENT');
      const paidAt = req.body.paidAt ? new Date(req.body.paidAt) : new Date();
      if (!Number.isFinite(paidAt.getTime())) throw new ApiError('收款日期无效',400,'INVALID_DATE');

      const requestHash = createHash('sha256').update(JSON.stringify([enrollmentId,studentId,value.toFixed(2),paymentType,paymentMethod,notes ?? null,req.body.paidAt ? paidAt.toISOString() : null])).digest('hex');
      const replay = async () => {
        const old = await prisma.payment.findUnique({where:{organizationId_requestId:{organizationId,requestId}}});
        if (!old) return null;
        const scoped = await prisma.payment.findFirst({where:{id:old.id,...paymentScope(req)}});
        if (!scoped || old.requestHash !== requestHash) throw new ApiError('请求编号已用于其他收款',409,'IDEMPOTENCY_CONFLICT');
        return scoped;
      };
      const old = await replay();
      if (old) return sendSuccess(res,old,'收款已登记');
      // 验证报名记录
      const enrollment = await prisma.enrollment.findFirst({
        where: { id: enrollmentId, organizationId, studentId, class: { campusId } },
      });
      if (!enrollment || enrollment.organizationId !== organizationId) {
        return next(new ApiError('报名记录不存在或不属于该机构', 400, 'ENROLLMENT_NOT_FOUND'));
      }

      // 验证学员
      const student = await prisma.student.findFirst({
        where: { ...studentAccess(req).where, id: studentId },
      });
      if (!student || student.organizationId !== organizationId) {
        return next(new ApiError('学员不存在或不属于该机构', 400, 'STUDENT_NOT_FOUND'));
      }

      let payment;
      try {
      payment = await prisma.payment.create({
        data: {
          organizationId,
          requestId, requestHash,
          enrollmentId,
          studentId,
          amount: value,
          paidAt,
          paymentType,
          paymentMethod,
          paidBy: req.user?.id,
          notes,
        },
      });

      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          const old = await replay();
          if (old) return sendSuccess(res,old,'收款已登记');
        }
        throw error;
      }
      sendSuccess(res, payment, '缴费记录创建成功', 201);
    } catch (error) {
      next(error);
    }
  },

  updatePayment: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const { amount, paymentType, paymentMethod, notes } = req.body;

      const payment = await prisma.payment.findFirst({
        where: { id, ...paymentScope(req) },
      });

      if (!payment) {
        return next(new ApiError('缴费记录不存在', 404, 'PAYMENT_NOT_FOUND'));
      }

      if (payment.organizationId !== resolveScope(req).organizationId) {
        return next(new ApiError('无权修改该缴费记录', 403, 'FORBIDDEN'));
      }

      if (amount !== undefined || paymentType !== undefined || paymentMethod !== undefined) throw new ApiError('已入账收款不可修改金额、类型或方式',409,'PAYMENT_IMMUTABLE');
      const updateData: any = {};
      if (amount !== undefined) updateData.amount = validAmount(amount);
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

      const payment = await prisma.payment.findFirst({
        where: { id, ...paymentScope(req) },
      });

      if (!payment) {
        return next(new ApiError('缴费记录不存在', 404, 'PAYMENT_NOT_FOUND'));
      }

      if (payment.organizationId !== resolveScope(req).organizationId) {
        return next(new ApiError('无权删除该缴费记录', 403, 'FORBIDDEN'));
      }

      throw new ApiError('已入账收款不可删除',409,'PAYMENT_IMMUTABLE');
    } catch (error) {
      next(error);
    }
  },
};

