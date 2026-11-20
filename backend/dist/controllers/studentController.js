"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.studentController = void 0;
const lessonLedger_1 = require("../services/lessonLedger");
const database_1 = __importDefault(require("../config/database"));
const errorHandler_1 = require("../middleware/errorHandler");
const response_1 = require("../utils/response");
const studentAccess_1 = require("../utils/studentAccess");
const client_1 = require("@prisma/client");
const enrollmentPeriod_1 = require("../services/enrollmentPeriod");
const studentProfileFields_1 = require("../utils/studentProfileFields");
const currentEnrollment_1 = require("../services/currentEnrollment");
const studentResponsibility_1 = require("../services/studentResponsibility");
const managementAccess_1 = require("../services/managementAccess");
const studentListRead_1 = require("../services/studentListRead");
async function lockStudentAssignee(tx, organizationId, campusId, id) {
    await tx.$queryRaw `SELECT id FROM users WHERE id=${id} AND "organizationId"=${organizationId} FOR UPDATE`;
    if (!await tx.user.findFirst({ where: { id, organizationId, campusId, isActive: true, isPlatformAdmin: false, role: { in: ['sales', 'staff', 'manager', 'admin', 'teacher', 'coach'] } }, select: { id: true } }))
        throw new errorHandler_1.ApiError('跟进负责人已停用或不属于当前校区', 409, 'ASSIGNEE_UNAVAILABLE');
}
const getCurrentUser = (req) => {
    return req.user;
};
// Conversion.price is Decimal(10,2). Never parse money through floating arithmetic.
const conversionMoney = (value) => {
    if (value === null)
        return null;
    if (typeof value !== 'number' && typeof value !== 'string')
        throw new errorHandler_1.ApiError('成交金额格式无效', 400, 'INVALID_CONVERSION_PRICE');
    const text = String(value).trim();
    if (!/^\d{1,8}(?:\.\d{1,2})?$/.test(text))
        throw new errorHandler_1.ApiError('成交金额应为非负数，最多两位小数', 400, 'INVALID_CONVERSION_PRICE');
    return new client_1.Prisma.Decimal(text);
};
exports.studentController = {
    getStudents: async (req, res, next) => {
        try {
            const responsibilityList = req.path === '/renewal' || req.query.renewalStatus === 'no_renewal';
            const lossCandidates = req.query.lossCandidates === 'true';
            const { actor, campus: scope, where: accessWhere, management } = lossCandidates || (responsibilityList && req.query.renewalStatus !== 'no_renewal') ? (0, studentResponsibility_1.renewalAccess)(req) : (0, studentAccess_1.studentAccess)(req, { includeRecall: true });
            if (responsibilityList && !management && !['teacher', 'coach'].includes(actor.role))
                throw new errorHandler_1.ApiError('续费及不续费名单由负责老师或管理员查看', 403, 'FORBIDDEN');
            const page = Math.max(1, Number(req.query.page) | 0), pageSize = Math.min(1000, Math.max(1, Number(req.query.pageSize || 10) | 0));
            const q = req.query, renewal = req.path === '/renewal', lost = req.path === '/lost', max = q.maxRemainingLessons === undefined ? (renewal ? 10 : null) : Number(q.maxRemainingLessons);
            for (const key of ['includeRenewalHistory', 'recallableOnly'])
                if (q[key] !== undefined && (typeof q[key] !== 'string' || !['true', 'false'].includes(q[key])))
                    throw new errorHandler_1.ApiError('列表筛选值无效', 400, 'INVALID_LIST_FILTER');
            const renewalHistory = renewal || q.includeRenewalHistory === 'true';
            const renewalDateFilter = (0, studentListRead_1.latestRenewalFilter)(q, scope.organizationId);
            if (q.status === 'archived' && !management)
                throw new errorHandler_1.ApiError('仅管理人员可以查看归档学员', 403, 'FORBIDDEN');
            if (max !== null && !Number.isSafeInteger(max))
                throw new errorHandler_1.ApiError('课时筛选值无效', 400);
            const search = String(q.search || '').trim();
            const cutoff = new Date();
            // 未排班 = 当前没有任何有效在读班级；不读取排课或临时串课记录。
            // 列表所属班级与筛选共用此条件，避免已关闭班级/已结束报名仍显示为在读。
            const activeEnrollments = responsibilityList || lossCandidates ? (0, studentResponsibility_1.responsibilityEnrollmentWhere)(scope, cutoff) : (0, currentEnrollment_1.currentEnrollmentWhere)(scope, cutoff);
            // 2026-11-08 用户拍板：学员管理只显示在读（active）学员——流失在流失库、退费在退费记录、归档在已归档；
            // 显式传 status（如 archived）仍按参数过滤。
            const statusFilter = renewal || lossCandidates ? 'active' : lost ? 'lost' : q.status ? String(q.status) : 'active';
            // 流失库需要展示「原所在班级/负责老师」：附带已结束的报名（在读查询仍只取 active）。
            const enrollmentScope = statusFilter === 'lost'
                ? { OR: [activeEnrollments, { status: { in: ['cancelled', 'completed'] } }] }
                : activeEnrollments;
            const selectedMembership = q.classId || q.teacherId ? { enrollments: { some: {
                        ...(0, studentResponsibility_1.responsibilityEnrollmentWhere)(scope, cutoff), ...(q.classId ? { classId: String(q.classId) } : {}),
                        class: { ...scope, status: { not: 'deleted' }, ...(q.teacherId ? { teacherId: String(q.teacherId) } : {}) },
                    } } } : {};
            let selectedResponsibility = q.renewalStatus === 'no_renewal' && q.teacherId && !q.classId
                ? { OR: [selectedMembership, { recallTeacherId: String(q.teacherId) }] } : selectedMembership;
            if (statusFilter === 'lost' && (q.teacherId || q.classId)) {
                const historicalMembership = (teacherId) => ({ enrollments: { some: {
                            organizationId: scope.organizationId, status: { in: ['cancelled', 'completed'] },
                            ...(q.classId ? { classId: String(q.classId) } : {}),
                            class: { ...scope, ...(teacherId ? { teacherId } : {}) },
                        } } });
                // An explicit recall assignment is the current responsibility. Legacy
                // rows without one may still be located by their historical class;
                // that display filter never grants access beyond accessWhere below.
                selectedResponsibility = { AND: [
                        ...(q.classId ? [historicalMembership()] : []),
                        ...(q.teacherId ? [{ OR: [
                                    { recallTeacherId: String(q.teacherId) },
                                    { recallTeacherId: null, AND: [historicalMembership(String(q.teacherId))] },
                                ] }] : []),
                    ] };
            }
            const where = { ...scope, status: statusFilter, ...(q.renewalStatus ? { renewalStatus: String(q.renewalStatus) } : {}),
                ...(max !== null ? { remainingLessons: { lte: max } } : {}), ...(q.salesId ? { salesId: String(q.salesId) } : {}),
                AND: [accessWhere, selectedResponsibility, renewalDateFilter, ...(search ? [{ OR: ['name', 'phone', 'parentName', 'parentPhone'].map(k => ({ [k]: { contains: search, mode: 'insensitive' } })) }] : []),
                    ...(lossCandidates ? [{ enrollments: { some: activeEnrollments } }] : []),
                    ...(renewal || q.excludeNoRenewal === 'true' ? [{ OR: [{ renewalStatus: null }, { renewalStatus: { not: 'no_renewal' } }] }] : []),
                    ...(q.unscheduledOnly === 'true' ? [{ enrollments: { none: activeEnrollments } }] : [])] };
            const result = await database_1.default.$transaction(async (tx) => {
                // Legacy recall dates live in notes. Read only scoped metadata before
                // pagination; never infer an empty filtered page from the first 10 rows.
                const recallIds = q.recallableOnly === 'true' ? (await tx.student.findMany({ where: { AND: [where, { status: 'lost' }] }, select: { id: true, notes: true } }))
                    .filter(row => (0, studentListRead_1.recallableFromNotes)(row.notes, cutoff)).map(row => row.id) : null;
                const listWhere = recallIds === null ? where : { AND: [where, { id: { in: recallIds } }] };
                const [rows, total] = await Promise.all([tx.student.findMany({ where: listWhere, skip: (page - 1) * pageSize, take: pageSize, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
                        include: { sales: { select: { id: true, name: true } }, recallTeacher: { select: { id: true, name: true } }, enrollments: { where: enrollmentScope, include: { class: { select: { id: true, name: true, code: true, teacherId: true, teacher: { select: { id: true, name: true } } } } } },
                            ...(renewalHistory ? { conversions: { where: (0, studentListRead_1.confirmedRenewals)(scope.organizationId), take: 1,
                                    orderBy: [{ conversionDate: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
                                    select: { price: true, totalLessons: true, conversionDate: true } },
                                _count: { select: { conversions: { where: (0, studentListRead_1.confirmedRenewals)(scope.organizationId) } } } } : {}),
                        } }), tx.student.count({ where: listWhere })]);
                return { total, rows: rows.map(row => {
                        if (!renewalHistory)
                            return row;
                        const { conversions, _count, ...student } = row;
                        const last = conversions?.[0];
                        return { ...student, renewalCount: _count?.conversions ?? 0,
                            lastRenewalPrice: last?.price == null ? null : Number(last.price), lastRenewalLessons: last?.totalLessons ?? null,
                            lastRenewalDate: last?.conversionDate ?? null };
                    }) };
            }, { isolationLevel: client_1.Prisma.TransactionIsolationLevel.RepeatableRead });
            (0, response_1.sendPaginated)(res, result.rows, page, pageSize, result.total);
        }
        catch (error) {
            next(error);
        }
    },
    getStudentById: async (req, res, next) => {
        try {
            const { where, campus, management } = (0, studentAccess_1.studentAccess)(req, { includeRecall: true });
            const student = await database_1.default.student.findFirst({ where: { id: req.params.id, AND: [where] }, include: { sales: { select: { id: true, name: true } }, recallTeacher: { select: { id: true, name: true } }, enrollments: { where: (0, studentResponsibility_1.responsibilityEnrollmentWhere)(campus), include: { class: { select: { id: true, name: true, code: true, teacherId: true, teacher: { select: { id: true, name: true } } } } } } } });
            if (!student)
                throw new errorHandler_1.ApiError('学员不存在或无权访问', 403, 'FORBIDDEN');
            if (student.status === 'archived' && !management)
                throw new errorHandler_1.ApiError('无权查看归档学员', 403, 'FORBIDDEN');
            (0, response_1.sendSuccess)(res, student);
        }
        catch (error) {
            next(error);
        }
    },
    createStudent: async (req, res, next) => {
        try {
            if (Object.prototype.hasOwnProperty.call(req.body, 'recallTeacherId'))
                throw new errorHandler_1.ApiError('回访负责人请通过沉默学员交接设置', 400, 'USE_RECALL_HANDOVER');
            const { actor, management } = (0, studentAccess_1.studentAccess)(req);
            const { name, gender, phone, parentName, parentPhone } = req.body;
            if (!management && req.body.salesId !== undefined && req.body.salesId !== actor.id)
                throw new errorHandler_1.ApiError('普通员工只能登记本人负责学员', 403, 'FORBIDDEN');
            const salesId = management ? req.body.salesId : actor.id;
            const campusId = actor.campusId || req.body.campusId, org = actor.organizationId;
            if (typeof name !== 'string' || !name.trim() || !campusId || !await database_1.default.campus.findFirst({ where: { id: campusId, organizationId: org, isActive: true } }))
                throw new errorHandler_1.ApiError('请输入姓名并选择有效校区', 400);
            const validName = (0, studentProfileFields_1.validateStudentName)(name), validPhone = (0, studentProfileFields_1.validateContactPhone)(phone), validParentPhone = (0, studentProfileFields_1.validateContactPhone)(parentPhone);
            let purchased = req.body.purchasedLessons ?? 0;
            if (!req.body.conversionId && Number(purchased) > 0)
                throw new errorHandler_1.ApiError('付费课时请通过成单登记或关联原单导入；赠课请先建立零课时档案，再办理增课', 409, 'USE_ORDER_REQUIRED');
            if (!Number.isSafeInteger(purchased) || purchased < 0 || purchased > 100000 || (req.body.remainingLessons !== undefined && (!req.body.conversionId || req.body.purchasedLessons !== undefined) && req.body.remainingLessons !== purchased) || Number(req.body.consumedLessons || 0) !== 0 || Number(req.body.totalPayment || 0) !== 0)
                throw new errorHandler_1.ApiError('课时数量应为非负整数；购课及成交金额请通过成单登记', 400);
            if (salesId && !await database_1.default.user.findFirst({ where: { id: salesId, organizationId: org, campusId, isActive: true, isPlatformAdmin: false, role: { in: ['sales', 'staff', 'manager', 'admin', 'teacher', 'coach'] } } }))
                throw new errorHandler_1.ApiError('负责人无效', 400);
            const date = (value) => { if (!value)
                return null; const d = new Date(String(value)); if (isNaN(d.getTime()))
                throw new errorHandler_1.ApiError('日期无效', 400); return d; };
            const recordedAge = (0, studentProfileFields_1.validateRecordedAge)(req.body.recordedAge);
            const recordedAgeAt = (0, studentProfileFields_1.parseProfileDate)(req.body.recordedAgeAt);
            if (recordedAge === null && recordedAgeAt !== null)
                throw new errorHandler_1.ApiError('登记年龄为空时不能填写登记日期', 400, 'INVALID_RECORDED_AGE');
            const birthDate = (0, studentProfileFields_1.parseProfileDate)(req.body.birthDate), address = (0, studentProfileFields_1.validateAddress)(req.body.address);
            const priceSupplied = Object.prototype.hasOwnProperty.call(req.body, 'conversionPrice');
            const expectedPriceSupplied = Object.prototype.hasOwnProperty.call(req.body, 'expectedConversionPrice');
            if ((priceSupplied || expectedPriceSupplied) && !req.body.conversionId)
                throw new errorHandler_1.ApiError('成交金额必须关联成单记录', 400, 'CONVERSION_REQUIRED');
            if (priceSupplied !== expectedPriceSupplied)
                throw new errorHandler_1.ApiError('请刷新成单信息后重试', 400, 'CONVERSION_PRICE_EXPECTED_REQUIRED');
            const price = priceSupplied ? conversionMoney(req.body.conversionPrice) : null;
            const expectedPrice = expectedPriceSupplied ? conversionMoney(req.body.expectedConversionPrice) : null;
            const student = await database_1.default.$transaction(async (tx) => {
                const { classId, conversionId } = req.body;
                let postedCents = null;
                if (conversionId) {
                    if (typeof conversionId !== 'string')
                        throw new errorHandler_1.ApiError('成单信息无效', 400, 'INVALID_CONVERSION');
                    if (!management && !await tx.conversion.findFirst({ where: { id: conversionId, organizationId: org, salesId: actor.id } }))
                        throw new errorHandler_1.ApiError('不能关联其他员工的成单', 403, 'FORBIDDEN');
                    // Always acquire the order row before the class lock so legacy and priced imports share a lock order.
                    await tx.$queryRaw `SELECT id FROM conversions WHERE id=${conversionId} AND "organizationId"=${org} FOR UPDATE`;
                    const order = await tx.conversion.findFirst({ where: { id: conversionId, organizationId: org, studentId: null, approvalStatus: { in: ['pending', 'confirmed'] }, ...(!management ? { salesId: actor.id } : {}), OR: [{ class: { campusId } }, { classId: null, sales: { campusId } }] }, select: { price: true, totalLessons: true } });
                    if (!order)
                        throw new errorHandler_1.ApiError('成单已关联或不属于当前校区，请刷新后重试；学员未创建', 409, 'CONVERSION_CHANGED');
                    const posted = await tx.lessonLog.findFirst({ where: { organizationId: org, type: 'add',
                            OR: [{ conversionId }, { conversionId: null, notes: { in: ['新签入账：' + conversionId, '续费入账：' + conversionId] } }],
                        }, select: { id: true } });
                    if (posted || await tx.renewalRequest.findFirst({ where: { organizationId: org,
                            response: { path: ['conversion', 'id'], equals: conversionId } }, select: { requestId: true } }))
                        throw new errorHandler_1.ApiError('原单已有入账记录，请核对关联学员', 409, 'CONVERSION_ALREADY_POSTED');
                    if (req.body.purchasedLessons === undefined)
                        purchased = order.totalLessons ?? 0;
                    if (!Number.isSafeInteger(purchased) || purchased < 0 || purchased > 100000)
                        throw new errorHandler_1.ApiError('原单入账课时超出可导入范围', 400, 'INVALID_PARAMS');
                    if (req.body.remainingLessons !== undefined && req.body.remainingLessons !== purchased)
                        throw new errorHandler_1.ApiError('入账课时以原成单及本次导入数量为准', 400, 'INVALID_PARAMS');
                    if (purchased > (order.totalLessons ?? 0))
                        throw new errorHandler_1.ApiError('入账课时超过原成单课时；额外课时请通过独立增课办理', 409, 'CONVERSION_LESSONS_MISMATCH');
                    const same = (a, b) => a === null ? b === null : b !== null && a.equals(b);
                    if (priceSupplied && !same(order.price, expectedPrice))
                        throw new errorHandler_1.ApiError('成单金额已变更，请刷新后重试；学员未创建', 409, 'CONVERSION_CHANGED');
                    if (priceSupplied && order.price !== null && !same(order.price, price))
                        throw new errorHandler_1.ApiError('已定价成单请沿用原单金额，不能在导入时改价', 409, 'CONVERSION_PRICE_LOCKED');
                    postedCents = (0, lessonLedger_1.creditCents)(order.price ?? price, purchased, order.totalLessons);
                    if (purchased > 0 && postedCents === null)
                        throw new errorHandler_1.ApiError('原单缺少可核定的入账总价，请补全原单金额及对应课时', 400, 'INVALID_PRICE');
                    if (priceSupplied && !same(order.price, price) && await tx.refund.findFirst({ where: { conversionId, organizationId: org }, select: { id: true } }))
                        throw new errorHandler_1.ApiError('该成单已有退款记录，不能在导入时修改金额，请先核对财务记录', 409, 'CONVERSION_HAS_REFUNDS');
                }
                if (classId) {
                    const dest = await tx.$queryRaw `SELECT capacity FROM classes WHERE id=${classId} AND "organizationId"=${org} AND "campusId"=${campusId} AND status='active' FOR UPDATE`;
                    if (!dest.length || (dest[0].capacity > 0 && await tx.enrollment.count({ where: { classId, status: 'active' } }) >= dest[0].capacity))
                        throw new errorHandler_1.ApiError('班级不可用或已满，学员未创建', 409);
                }
                if (salesId)
                    await lockStudentAssignee(tx, org, campusId, salesId);
                const row = await tx.student.create({ data: { name: validName, gender, phone: validPhone, parentName, parentPhone: validParentPhone, address, campusId, organizationId: org,
                        birthDate, recordedAge, recordedAgeAt, cardOpenDate: date(req.body.cardOpenDate), lastClassDate: date(req.body.lastClassDate), purchasedLessons: purchased, remainingLessons: purchased, salesId: salesId || null } });
                if (classId)
                    await tx.enrollment.create({ data: { organizationId: org, classId, studentId: row.id, enrolledBy: actor.id } });
                if (conversionId) {
                    const linked = await tx.conversion.updateMany({ where: { id: conversionId, organizationId: org, studentId: null, ...(priceSupplied ? { price: expectedPrice } : {}), OR: [{ class: { campusId } }, { classId: null, sales: { campusId } }] }, data: { studentId: row.id, ...(priceSupplied ? { price } : {}) } });
                    if (linked.count !== 1)
                        throw new errorHandler_1.ApiError('成单已关联、金额已变更或不属于当前校区，请刷新后重试；学员未创建', 409, 'CONVERSION_CHANGED');
                }
                if (purchased)
                    await tx.lessonLog.create({ data: { studentId: row.id, studentName: row.name, organizationId: org, operatorId: actor.id, type: 'add', lessons: purchased, lessonSource: 'paid', creditAmountCents: postedCents, conversionId: conversionId || null, notes: '建档初始课时' } });
                return row;
            });
            (0, response_1.sendSuccess)(res, student, '学员创建成功', 201);
        }
        catch (error) {
            next(error);
        }
    },
    updateStudent: async (req, res, next) => {
        try {
            const { id } = req.params;
            const { name, gender, birthDate, recordedAge, recordedAgeAt, address, phone, parentName, parentPhone, campusId, status, deleteReason, expectedRecallDate, renewalStatus, noRenewalReason, noRenewalDate, remainingLessons, refundReason, refundDate, cardOpenDate, purchasedLessons, consumedLessons, totalPayment, salesId, lastClassDate } = req.body;
            const { actor: currentUser, management, where } = (0, studentAccess_1.studentAccess)(req, { includeRecall: true });
            if (Object.prototype.hasOwnProperty.call(req.body, 'recallTeacherId'))
                throw new errorHandler_1.ApiError('回访负责人请通过沉默学员交接设置', 400, 'USE_RECALL_HANDOVER');
            const existing = await database_1.default.student.findFirst({ where: { id, AND: [where] } });
            if (!existing)
                throw new errorHandler_1.ApiError('学员不存在或无权修改', 403, 'FORBIDDEN');
            if (status === 'archived' || existing.status === 'archived')
                throw new errorHandler_1.ApiError('归档和恢复须使用专用操作', 409, 'ARCHIVE_OPERATION_REQUIRED');
            if (status === 'lost' && existing.status !== 'lost')
                throw new errorHandler_1.ApiError('移出花名册请使用正式移除操作', 409, 'ENROLLMENT_REMOVAL_REQUIRED');
            if (!management && salesId !== undefined && salesId !== existing.salesId)
                throw new errorHandler_1.ApiError('普通员工不能转移或冒领学员', 403, 'FORBIDDEN');
            if (['remainingLessons', 'purchasedLessons', 'consumedLessons', 'totalPayment'].some(k => req.body[k] !== undefined))
                throw new errorHandler_1.ApiError('请通过课时业务或收款登记调整账务', 409, 'LEDGER_REQUIRED');
            if (campusId && existing.campusId !== campusId)
                throw new errorHandler_1.ApiError('档案编辑不能转移校区', 403);
            if (salesId && salesId !== existing.salesId && !await database_1.default.user.findFirst({ where: { id: salesId, campusId: existing.campusId, organizationId: existing.organizationId, isActive: true, isPlatformAdmin: false, role: { in: ['sales', 'staff', 'teacher', 'coach', 'admin', 'manager'] } } }))
                throw new errorHandler_1.ApiError('负责人无效', 400);
            const updateData = {};
            if (name !== undefined && name !== existing.name)
                updateData.name = (0, studentProfileFields_1.validateStudentName)(name);
            if (gender)
                updateData.gender = gender;
            if (birthDate !== undefined)
                updateData.birthDate = (0, studentProfileFields_1.parseProfileDate)(birthDate);
            if (address !== undefined)
                updateData.address = (0, studentProfileFields_1.validateAddress)(address);
            if (recordedAge !== undefined) {
                updateData.recordedAge = (0, studentProfileFields_1.validateRecordedAge)(recordedAge);
                if (updateData.recordedAge === null && recordedAgeAt === undefined)
                    updateData.recordedAgeAt = null;
            }
            if (recordedAgeAt !== undefined) {
                updateData.recordedAgeAt = (0, studentProfileFields_1.parseProfileDate)(recordedAgeAt);
                const resultingAge = recordedAge === undefined ? existing.recordedAge : updateData.recordedAge;
                if (resultingAge === null && updateData.recordedAgeAt !== null)
                    throw new errorHandler_1.ApiError('登记年龄为空时不能填写登记日期', 400, 'INVALID_RECORDED_AGE');
            }
            if (phone !== undefined && phone !== existing.phone)
                updateData.phone = (0, studentProfileFields_1.validateContactPhone)(phone);
            if (parentName !== undefined)
                updateData.parentName = parentName;
            if (parentPhone !== undefined && parentPhone !== existing.parentPhone)
                updateData.parentPhone = (0, studentProfileFields_1.validateContactPhone)(parentPhone);
            if (req.body.notes !== undefined) {
                if (req.body.notes !== null && (typeof req.body.notes !== 'string' || req.body.notes.length > 5000))
                    throw new errorHandler_1.ApiError('备注不能超过5000字', 400, 'INVALID_NOTES');
                updateData.notes = req.body.notes;
            }
            if (campusId)
                updateData.campusId = campusId;
            if (status)
                updateData.status = status;
            // 新增字段更新
            if (cardOpenDate !== undefined)
                updateData.cardOpenDate = cardOpenDate;
            if (salesId !== undefined)
                updateData.salesId = salesId;
            if (lastClassDate !== undefined)
                updateData.lastClassDate = lastClassDate;
            // 续费相关字段更新
            if (renewalStatus !== undefined)
                updateData.renewalStatus = renewalStatus;
            if (noRenewalReason !== undefined)
                updateData.noRenewalReason = noRenewalReason;
            if (noRenewalDate !== undefined)
                updateData.noRenewalDate = noRenewalDate;
            // 退费相关字段更新
            if (refundReason !== undefined)
                updateData.refundReason = refundReason;
            if (refundDate !== undefined)
                updateData.refundDate = refundDate;
            // 处理流失相关信息
            if (deleteReason !== undefined || expectedRecallDate !== undefined) {
                let currentDeleteReason = '';
                let currentRecallDate = '';
                // 解析现有的 notes，提取当前的删除原因和召回时间
                const notes = existing.notes || '';
                const reasonMatch = notes.match(/删除原因:([^,]*)/);
                const dateMatch = notes.match(/预计召回时间:([^,]*)/);
                if (reasonMatch)
                    currentDeleteReason = reasonMatch[1];
                if (dateMatch)
                    currentRecallDate = dateMatch[1];
                // 使用新值或保留现有值
                const finalDeleteReason = deleteReason !== undefined ? deleteReason : currentDeleteReason;
                const finalRecallDate = expectedRecallDate !== undefined ? expectedRecallDate : currentRecallDate;
                // 2026-11-08 修复：只替换「删除原因/预计召回时间」两个标记，保留其余学员备注
                // （与 removeAsLost 的保留逻辑一致）。旧实现整段重建 notes，会把无关备注一并抹掉。
                const preserved = (existing.notes || '')
                    .replace(/(?:删除原因|预计召回时间):[^,\n]*/g, '')
                    .replace(/^[,\s]+|[,\s]+$/g, '');
                const notesParts = [];
                if (finalDeleteReason) {
                    notesParts.push(`删除原因:${finalDeleteReason}`);
                }
                if (finalRecallDate) {
                    notesParts.push(`预计召回时间:${finalRecallDate}`);
                }
                updateData.notes = [preserved, notesParts.join(', ')].filter(Boolean).join('\n');
            }
            for (const key of ['birthDate', 'cardOpenDate', 'lastClassDate', 'noRenewalDate', 'refundDate'])
                if (updateData[key] !== undefined && updateData[key] !== null) {
                    const date = new Date(updateData[key]);
                    if (!Number.isFinite(+date))
                        throw new errorHandler_1.ApiError('日期无效', 400, 'INVALID_DATE');
                    updateData[key] = date;
                }
            const updated = await database_1.default.$transaction(async (tx) => {
                await (0, managementAccess_1.lockManagement)(tx, existing.organizationId);
                const actor = await tx.user.findUnique({ where: { id: currentUser.id } });
                if (!actor?.isActive || actor.organizationId !== existing.organizationId || actor.campusId !== existing.campusId || (0, managementAccess_1.effectiveRole)(actor) !== currentUser.role || actor.isPlatformAdmin !== !!currentUser.isPlatformAdmin)
                    throw new errorHandler_1.ApiError('账号权限已变化，请刷新后重试', 403, 'FORBIDDEN');
                await (0, enrollmentPeriod_1.lockEnrollmentStudent)(tx, id, { organizationId: existing.organizationId, campusId: existing.campusId });
                const current = await tx.student.findFirst({ where: { id, status: { not: 'archived' }, AND: [where] } });
                if (!current)
                    throw new errorHandler_1.ApiError('学员归属已变更或无权修改', 403, 'FORBIDDEN');
                if (+current.updatedAt !== +existing.updatedAt)
                    throw new errorHandler_1.ApiError('学员刚刚被修改或移交，请刷新后重新编辑', 409, 'STUDENT_CHANGED');
                const scope = { organizationId: existing.organizationId, campusId: existing.campusId };
                if (!management && ['teacher', 'coach'].includes(currentUser.role)) {
                    const teaching = await tx.student.findFirst({ where: { id, AND: [(0, studentResponsibility_1.teachingStudentWhere)(scope, currentUser.id)] }, select: { id: true } });
                    if (!teaching) {
                        const allowed = new Set(['phone', 'parentPhone', 'parentName', 'notes', 'deleteReason', 'expectedRecallDate', 'status', 'renewalStatus', 'noRenewalReason', 'noRenewalDate']);
                        // requireOrganizationAccess injects these values into write bodies.
                        // Accept only the already verified scope, never a scope mutation.
                        const injectedScope = scope;
                        if (Object.keys(req.body).some(key => !allowed.has(key) && !(Object.prototype.hasOwnProperty.call(injectedScope, key) && req.body[key] === injectedScope[key])) || (status !== undefined && status !== current.status && !(current.status === 'lost' && status === 'active')) || (renewalStatus !== undefined && ![null, 'pending', 'renewing', 'no_renewal'].includes(renewalStatus)))
                            throw new errorHandler_1.ApiError('回访权限仅可修改联系方式、回访备注或恢复学员，不能调整班级、业绩及账务', 403, 'RECALL_PROFILE_ONLY');
                        if (!await tx.student.findFirst({ where: { id, AND: [(0, studentResponsibility_1.recallStudentWhere)(scope, currentUser.id)] }, select: { id: true } }))
                            throw new errorHandler_1.ApiError('学员回访归属已变化', 403, 'FORBIDDEN');
                    }
                }
                if (updateData.renewalStatus === 'no_renewal' && current.renewalStatus !== 'no_renewal' && current.recallTeacherId === null) {
                    // A separately assigned recall teacher survives repeat marking, even
                    // after restoration with no class from which to infer a new teacher.
                    updateData.recallTeacherId = await (0, studentResponsibility_1.uniqueResponsibleTeacher)(tx, scope, id, !management ? currentUser.id : undefined);
                }
                // Historical sales ownership is not a live employment requirement. Only
                // an explicitly changed sales attribution must still name active staff.
                if (updateData.salesId && updateData.salesId !== current.salesId)
                    await lockStudentAssignee(tx, existing.organizationId, existing.campusId, updateData.salesId);
                return tx.student.update({ where: { id }, data: updateData });
            });
            (0, response_1.sendSuccess)(res, updated, '学员更新成功');
        }
        catch (error) {
            next(error);
        }
    },
    archiveStudent: async (req, res, next) => {
        try {
            const { campus, management } = (0, studentAccess_1.studentAccess)(req);
            if (!management)
                throw new errorHandler_1.ApiError('仅管理人员可以归档学员', 403, 'FORBIDDEN');
            const { reason, note } = req.body;
            if (!['no_renewal', 'no_recall', 'other'].includes(reason))
                throw new errorHandler_1.ApiError('请选择归档原因', 400, 'INVALID_ARCHIVE_REASON');
            if (note !== undefined && (typeof note !== 'string' || note.length > 500))
                throw new errorHandler_1.ApiError('归档说明不能超过 500 字', 400, 'INVALID_ARCHIVE_NOTE');
            const student = await database_1.default.$transaction(async (tx) => {
                const locked = await (0, enrollmentPeriod_1.lockEnrollmentStudent)(tx, req.params.id, campus);
                const existing = await tx.student.findFirstOrThrow({ where: { id: locked.id, ...campus } });
                if (existing.status === 'archived')
                    return existing;
                const now = new Date();
                const enrollments = await tx.enrollment.findMany({ where: { studentId: existing.id, organizationId: campus.organizationId, status: 'active' }, include: { class: { select: { campusId: true, organizationId: true } } }, orderBy: { classId: 'asc' } });
                if (enrollments.some(e => e.class.campusId !== campus.campusId || e.class.organizationId !== campus.organizationId))
                    throw new errorHandler_1.ApiError('学员存在其他范围的在读报名，请先核对班级', 409, 'ENROLLMENT_SCOPE_MISMATCH');
                for (const enrollment of enrollments) {
                    await (0, enrollmentPeriod_1.lockEnrollmentClass)(tx, enrollment.classId, campus);
                    await (0, enrollmentPeriod_1.assertCanEndEnrollment)(tx, enrollment, now);
                }
                const futureGuest = await tx.attendance.findFirst({ where: { studentId: existing.id, organizationId: campus.organizationId, isTemporary: true, schedule: { endTime: { gte: now }, status: { notIn: ['cancelled', 'rescheduled', 'class_paused'] } } }, select: { id: true } });
                if (futureGuest)
                    throw new errorHandler_1.ApiError('学员有尚未结束的临时串课记录，请先核对后再归档', 409, 'FUTURE_TEMPORARY_ATTENDANCE');
                for (const enrollment of enrollments)
                    await tx.enrollment.update({ where: { id: enrollment.id }, data: { status: 'completed', endedAt: now } });
                return tx.student.update({ where: { id: existing.id }, data: { status: 'archived', archivePreviousStatus: existing.status, archivedAt: now, archiveReason: reason, archiveNote: note?.trim() || null } });
            });
            (0, response_1.sendSuccess)(res, student, '学员已归档');
        }
        catch (error) {
            next(error);
        }
    },
    restoreStudent: async (req, res, next) => {
        try {
            const { campus, management } = (0, studentAccess_1.studentAccess)(req);
            if (!management)
                throw new errorHandler_1.ApiError('仅管理人员可以恢复学员', 403, 'FORBIDDEN');
            const student = await database_1.default.$transaction(async (tx) => {
                const locked = await (0, enrollmentPeriod_1.lockEnrollmentStudent)(tx, req.params.id, campus);
                const existing = await tx.student.findFirstOrThrow({ where: { id: locked.id, ...campus } });
                if (existing.status !== 'archived') {
                    if (existing.archivedAt && existing.archivePreviousStatus)
                        return existing;
                    throw new errorHandler_1.ApiError('该学员尚未归档', 409, 'NOT_ARCHIVED');
                }
                if (!existing.archivePreviousStatus || existing.archivePreviousStatus === 'archived')
                    throw new errorHandler_1.ApiError('缺少归档前状态，请联系管理员核对', 409, 'ARCHIVE_STATE_MISSING');
                return tx.student.update({ where: { id: existing.id }, data: { status: existing.archivePreviousStatus } });
            });
            (0, response_1.sendSuccess)(res, student, '学员已恢复，需重新安排班级');
        }
        catch (error) {
            next(error);
        }
    },
    deleteStudent: async (req, res, next) => {
        try {
            const { id } = req.params;
            const { actor: currentUser, management } = (0, studentAccess_1.studentAccess)(req);
            if (!management)
                throw new errorHandler_1.ApiError('仅管理人员可以删除空档案', 403, 'FORBIDDEN');
            const existing = await database_1.default.student.findUnique({ where: { id } });
            if (!existing) {
                return next(new errorHandler_1.ApiError('学员不存在', 404, 'STUDENT_NOT_FOUND'));
            }
            // 数据隔离检查
            if (existing.organizationId !== currentUser?.organizationId || (currentUser?.campusId && currentUser.campusId !== existing.campusId)) {
                return next(new errorHandler_1.ApiError('无权删除该学员', 403, 'FORBIDDEN'));
            }
            const dropped = await database_1.default.student.deleteMany({ where: { id, organizationId: currentUser.organizationId, campusId: existing.campusId,
                    purchasedLessons: 0, consumedLessons: 0, remainingLessons: 0, frozenLessons: 0, totalPayment: 0,
                    enrollments: { none: {} }, attendances: { none: {} }, payments: { none: {} }, conversions: { none: {} }, lessonLogs: { none: {} }, lessonTransfers: { none: {} }, refunds: { none: {} }, parentLinks: { none: {} }, parentNotices: { none: {} } } });
            if (!dropped.count)
                throw new errorHandler_1.ApiError('仅能删除未发生任何业务的空档案；有记录的学员请保留档案。', 409, 'HISTORY_PROTECTED');
            (0, response_1.sendSuccess)(res, null, '空档案已删除');
        }
        catch (error) {
            next(error);
        }
    },
};
//# sourceMappingURL=studentController.js.map