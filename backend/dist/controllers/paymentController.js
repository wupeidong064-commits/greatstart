"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.paymentController = void 0;
const studentAccess_1 = require("../utils/studentAccess");
const crypto_1 = require("crypto");
const errorHandler_1 = require("../middleware/errorHandler");
const response_1 = require("../utils/response");
const database_1 = __importDefault(require("../config/database"));
const scope_1 = require("../utils/scope");
const client_1 = require("@prisma/client");
function paymentScope(req) {
    const { organizationId, campusId } = (0, scope_1.resolveScope)(req);
    return { organizationId, ...(campusId ? { student: (0, studentAccess_1.studentAccess)(req).where, enrollment: { class: { campusId } } } : {}) };
}
function validAmount(value) {
    if ((typeof value !== 'string' && typeof value !== 'number') || !/^\d+(?:\.\d{1,2})?$/.test(String(value)))
        throw new errorHandler_1.ApiError('金额最多支持两位小数', 400, 'INVALID_AMOUNT');
    const amount = Number(value);
    if (!Number.isFinite(amount) || amount <= 0 || amount > 99999999.99)
        throw new errorHandler_1.ApiError('缴费金额应大于0', 400, 'INVALID_AMOUNT');
    return amount;
}
exports.paymentController = {
    getPayments: async (req, res, next) => {
        try {
            const page = parseInt(req.query.page) || 1;
            const pageSize = parseInt(req.query.pageSize) || 10;
            const studentId = req.query.studentId;
            const enrollmentId = req.query.enrollmentId;
            const startDate = req.query.startDate;
            const endDate = req.query.endDate;
            const where = {
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
                database_1.default.payment.findMany({
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
                database_1.default.payment.count({ where }),
            ]);
            (0, response_1.sendPaginated)(res, payments, page, pageSize, total);
        }
        catch (error) {
            next(error);
        }
    },
    getPaymentById: async (req, res, next) => {
        try {
            const { id } = req.params;
            const payment = await database_1.default.payment.findFirst({
                where: { id, ...paymentScope(req) },
                include: {
                    student: true,
                    enrollment: {
                        include: {
                            class: true,
                        },
                    },
                    paidByUser: { select: { id: true, name: true } },
                },
            });
            if (!payment) {
                return next(new errorHandler_1.ApiError('缴费记录不存在', 404, 'PAYMENT_NOT_FOUND'));
            }
            if (payment.organizationId !== (0, scope_1.resolveScope)(req).organizationId) {
                return next(new errorHandler_1.ApiError('无权访问', 403, 'FORBIDDEN'));
            }
            (0, response_1.sendSuccess)(res, payment);
        }
        catch (error) {
            next(error);
        }
    },
    createPayment: async (req, res, next) => {
        try {
            const { enrollmentId, studentId, amount, paymentType, paymentMethod, notes, } = req.body;
            const { organizationId, campusId } = (0, scope_1.resolveScope)(req);
            if (!campusId)
                throw new errorHandler_1.ApiError('请先选择校区', 403, 'CAMPUS_REQUIRED');
            const value = validAmount(amount);
            const requestId = req.get('Idempotency-Key') || req.body.requestId;
            if (typeof requestId !== 'string' || !/^[a-zA-Z0-9_-]{16,128}$/.test(requestId))
                throw new errorHandler_1.ApiError('请提供请求编号，重试保持不变', 400, 'IDEMPOTENCY_KEY_REQUIRED');
            if (!enrollmentId || !studentId || !['tuition', 'material', 'other'].includes(paymentType) || !['cash', 'card', 'transfer', 'alipay', 'wechat'].includes(paymentMethod))
                throw new errorHandler_1.ApiError('收款参数无效', 400, 'INVALID_PAYMENT');
            if (notes !== undefined && (typeof notes !== 'string' || notes.length > 2000))
                throw new errorHandler_1.ApiError('备注无效', 400, 'INVALID_PAYMENT');
            const paidAt = req.body.paidAt ? new Date(req.body.paidAt) : new Date();
            if (!Number.isFinite(paidAt.getTime()))
                throw new errorHandler_1.ApiError('收款日期无效', 400, 'INVALID_DATE');
            const requestHash = (0, crypto_1.createHash)('sha256').update(JSON.stringify([enrollmentId, studentId, value.toFixed(2), paymentType, paymentMethod, notes ?? null, req.body.paidAt ? paidAt.toISOString() : null])).digest('hex');
            const replay = async () => {
                const old = await database_1.default.payment.findUnique({ where: { organizationId_requestId: { organizationId, requestId } } });
                if (!old)
                    return null;
                const scoped = await database_1.default.payment.findFirst({ where: { id: old.id, ...paymentScope(req) } });
                if (!scoped || old.requestHash !== requestHash)
                    throw new errorHandler_1.ApiError('请求编号已用于其他收款', 409, 'IDEMPOTENCY_CONFLICT');
                return scoped;
            };
            const old = await replay();
            if (old)
                return (0, response_1.sendSuccess)(res, old, '收款已登记');
            // 验证报名记录
            const enrollment = await database_1.default.enrollment.findFirst({
                where: { id: enrollmentId, organizationId, studentId, class: { campusId } },
            });
            if (!enrollment || enrollment.organizationId !== organizationId) {
                return next(new errorHandler_1.ApiError('报名记录不存在或不属于该机构', 400, 'ENROLLMENT_NOT_FOUND'));
            }
            // 验证学员
            const student = await database_1.default.student.findFirst({
                where: { ...(0, studentAccess_1.studentAccess)(req).where, id: studentId },
            });
            if (!student || student.organizationId !== organizationId) {
                return next(new errorHandler_1.ApiError('学员不存在或不属于该机构', 400, 'STUDENT_NOT_FOUND'));
            }
            let payment;
            try {
                payment = await database_1.default.payment.create({
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
            }
            catch (error) {
                if (error instanceof client_1.Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
                    const old = await replay();
                    if (old)
                        return (0, response_1.sendSuccess)(res, old, '收款已登记');
                }
                throw error;
            }
            (0, response_1.sendSuccess)(res, payment, '缴费记录创建成功', 201);
        }
        catch (error) {
            next(error);
        }
    },
    updatePayment: async (req, res, next) => {
        try {
            const { id } = req.params;
            const { amount, paymentType, paymentMethod, notes } = req.body;
            const payment = await database_1.default.payment.findFirst({
                where: { id, ...paymentScope(req) },
            });
            if (!payment) {
                return next(new errorHandler_1.ApiError('缴费记录不存在', 404, 'PAYMENT_NOT_FOUND'));
            }
            if (payment.organizationId !== (0, scope_1.resolveScope)(req).organizationId) {
                return next(new errorHandler_1.ApiError('无权修改该缴费记录', 403, 'FORBIDDEN'));
            }
            if (amount !== undefined || paymentType !== undefined || paymentMethod !== undefined)
                throw new errorHandler_1.ApiError('已入账收款不可修改金额、类型或方式', 409, 'PAYMENT_IMMUTABLE');
            const updateData = {};
            if (amount !== undefined)
                updateData.amount = validAmount(amount);
            if (paymentType)
                updateData.paymentType = paymentType;
            if (paymentMethod)
                updateData.paymentMethod = paymentMethod;
            if (notes !== undefined)
                updateData.notes = notes;
            const updated = await database_1.default.payment.update({
                where: { id },
                data: updateData,
            });
            (0, response_1.sendSuccess)(res, updated, '缴费记录更新成功');
        }
        catch (error) {
            next(error);
        }
    },
    deletePayment: async (req, res, next) => {
        try {
            const { id } = req.params;
            const payment = await database_1.default.payment.findFirst({
                where: { id, ...paymentScope(req) },
            });
            if (!payment) {
                return next(new errorHandler_1.ApiError('缴费记录不存在', 404, 'PAYMENT_NOT_FOUND'));
            }
            if (payment.organizationId !== (0, scope_1.resolveScope)(req).organizationId) {
                return next(new errorHandler_1.ApiError('无权删除该缴费记录', 403, 'FORBIDDEN'));
            }
            throw new errorHandler_1.ApiError('已入账收款不可删除', 409, 'PAYMENT_IMMUTABLE');
        }
        catch (error) {
            next(error);
        }
    },
};
//# sourceMappingURL=paymentController.js.map