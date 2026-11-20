"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.fail = exports.employeeRoles = exports.userFields = void 0;
exports.textField = textField;
exports.validEmail = validEmail;
exports.normalizePhone = normalizePhone;
exports.loginIdentity = loginIdentity;
exports.validPassword = validPassword;
exports.staffScope = staffScope;
exports.createManaged = createManaged;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const client_1 = require("@prisma/client");
const database_1 = __importDefault(require("../config/database"));
const errorHandler_1 = require("../middleware/errorHandler");
const security_1 = require("../config/security");
const managementAccess_1 = require("./managementAccess");
const organizationScope_1 = require("./organizationScope");
exports.userFields = {
    id: true,
    name: true,
    email: true,
    role: true,
    phone: true,
    campusId: true,
    organizationId: true,
    isActive: true,
    createdAt: true,
    updatedAt: true,
    isPlatformAdmin: true,
    managementLevel: true,
    managementGrantedById: true,
    managementGrantedAt: true,
};
exports.employeeRoles = ['staff', 'sales', 'teacher', 'coach'];
const fail = (message, status = 400) => {
    throw new errorHandler_1.ApiError(message, status, status === 403 ? 'FORBIDDEN' : 'INVALID_REQUEST');
};
exports.fail = fail;
function textField(v, label, max = 100) {
    if (typeof v !== 'string' || !v.trim() || v.trim().length > max)
        throw new errorHandler_1.ApiError(label + '无效', 400, 'VALIDATION_ERROR');
    return v.trim();
}
function validEmail(v) {
    const email = textField(v, '邮箱', 254).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
        (0, exports.fail)('邮箱格式无效');
    return email;
}
function normalizePhone(v) {
    if (typeof v !== 'string')
        (0, exports.fail)('手机号格式无效');
    const phone = v.replace(/\s/g, '').replace(/^\+86/, '');
    if (!/^1[3-9]\d{9}$/.test(phone))
        (0, exports.fail)('请输入大陆11位手机号，可带+86及空格');
    return phone;
}
function loginIdentity(body) {
    const email = body.email == null || body.email === '' ? null : validEmail(body.email);
    const phone = body.phone == null || body.phone === '' ? null : normalizePhone(body.phone);
    if (!email && !phone)
        (0, exports.fail)('手机号或邮箱至少填写一项');
    return { email, phone };
}
function validPassword(v) {
    if (typeof v !== 'string' || v.length < 8 || Buffer.byteLength(v) > 72)
        throw new errorHandler_1.ApiError('密码至少 8 位且不得超过 72 字节', 400, 'INVALID_PASSWORD');
    return v;
}
function staffScope(req) {
    const u = req.user;
    if (!u.organizationId)
        throw new errorHandler_1.ApiError('需要机构身份', 403, 'FORBIDDEN');
    return {
        organizationId: u.organizationId,
        ...(u.campusId ? { campusId: u.campusId } : {}),
        isPlatformAdmin: false,
    };
}
async function createManaged(req, role) {
    const actor = req.user;
    const body = req.body;
    if (['managementLevel', 'isPlatformAdmin', 'managementGrantedById', 'managementGrantedAt'].some(key => key in body))
        (0, exports.fail)('管理身份请通过专用任命操作设置', 403);
    if (!exports.employeeRoles.includes(role) && !['manager', 'parent'].includes(role))
        (0, exports.fail)('角色无效', 403);
    if (role === 'manager' && !actor.isPlatformAdmin)
        (0, exports.fail)('无权创建管理账号', 403);
    const org = body.organizationId || actor.organizationId;
    if (!org ||
        (!actor.isPlatformAdmin &&
            org !== actor.organizationId))
        (0, exports.fail)('无权分配该机构或校区', 403);
    const name = textField(body.name, '姓名');
    const { email, phone } = loginIdentity(body);
    if (role === 'parent' && (!phone || !body.studentId))
        (0, exports.fail)('创建家长账号需要手机号和关联学员');
    // 2026-11-08 用户拍板：家长账号初始密码默认=登录手机号（随机串交付易抄错）；后台仍可显式指定其他密码。
    const password = body.password
        ? validPassword(body.password)
        : role === 'parent' && phone
            ? phone
            : (0, security_1.generateSecurePassword)();
    const hash = await bcryptjs_1.default.hash(password, 10);
    try {
        return await database_1.default.$transaction(async (tx) => {
            // Serialize all creation/reuse for one phone, including the first concurrent request.
            if (phone)
                await tx.$executeRaw `SELECT pg_advisory_xact_lock(hashtextextended(${phone}, 0))`;
            await (0, managementAccess_1.lockManagement)(tx, org);
            // Permission may have changed while hashing the password or waiting for a
            // phone/management lock. Authorize the write with the current stored identity.
            const currentActor = await tx.user.findUnique({ where: { id: actor.id } });
            if (!currentActor)
                throw new errorHandler_1.ApiError('管理账号不存在，请重新登录', 403, 'FORBIDDEN');
            if (!currentActor.isActive ||
                (!currentActor.isPlatformAdmin &&
                    (currentActor.organizationId !== org || currentActor.campusId !== actor.campusId ||
                        !['admin', 'manager'].includes((0, managementAccess_1.effectiveRole)(currentActor)))) ||
                (role === 'manager' && !currentActor.isPlatformAdmin))
                (0, exports.fail)('管理权限已变化，请刷新后重试', 403);
            const campus = (await (0, organizationScope_1.resolveDefaultCampus)(tx, org)).id;
            if ((body.campusId != null && body.campusId !== campus) ||
                (!currentActor.isPlatformAdmin && currentActor.campusId !== campus))
                (0, exports.fail)('无权分配该机构内部范围', 403);
            if (role === 'parent')
                await tx.$queryRaw `SELECT id FROM students WHERE id = ${body.studentId} FOR UPDATE`;
            const child = role === 'parent'
                ? await tx.student.findFirst({
                    where: { id: body.studentId, organizationId: org, campusId: campus },
                })
                : null;
            if (role === 'parent' && (!child?.parentPhone || normalizePhone(child.parentPhone) !== phone))
                (0, exports.fail)('请核对学员与家长电话', 403);
            const existing = phone ? await tx.user.findUnique({ where: { phone }, select: { ...exports.userFields, isPlatformAdmin: true } }) : null;
            if (existing) {
                if (role !== 'parent' || existing.role !== 'parent' || existing.isPlatformAdmin ||
                    !existing.isActive || existing.organizationId !== org || existing.campusId !== campus ||
                    (email && email !== existing.email?.trim().toLowerCase()))
                    (0, exports.fail)('手机号已被其他账号使用', 409);
                await tx.parentStudentLink.upsert({
                    where: { parentId_studentId: { parentId: existing.id, studentId: child.id } },
                    create: { parentId: existing.id, studentId: child.id }, update: {},
                });
                const { isPlatformAdmin, ...safe } = existing;
                return { ...safe, accountReused: true };
            }
            // Old accounts can contain mixed-case emails. Prisma's ordinary unique
            // index only covers exact spelling; match the same identity used by login.
            if (email && await tx.user.findFirst({
                where: { email: { equals: email, mode: 'insensitive' } }, select: { id: true },
            }))
                throw new errorHandler_1.ApiError('邮箱已被其他账号使用', 409, 'IDENTITY_EXISTS');
            const created = await tx.user.create({
                data: { email, name, phone, password: hash,
                    role: role === 'manager' ? (exports.employeeRoles.includes(body.jobRole) ? body.jobRole : 'staff') : role,
                    managementLevel: role === 'manager' ? 'super' : 'none',
                    managementGrantedById: role === 'manager' ? actor.id : null,
                    managementGrantedAt: role === 'manager' ? new Date() : null,
                    organizationId: org, campusId: campus },
                select: exports.userFields,
            });
            if (role === 'manager')
                await tx.userManagementEvent.create({ data: { organizationId: org, actorId: actor.id,
                        userId: created.id, fromLevel: 'none', toLevel: 'super', jobRole: (0, managementAccess_1.jobRole)(created), origin: 'platform-creation' } });
            if (child)
                await tx.parentStudentLink.create({ data: { studentId: child.id, parentId: created.id } });
            return { ...created, defaultPassword: password, accountReused: false };
        });
    }
    catch (e) {
        if (e instanceof client_1.Prisma.PrismaClientKnownRequestError && e.code === 'P2002')
            (0, exports.fail)('手机号或邮箱已被其他账号使用', 409);
        throw e;
    }
}
//# sourceMappingURL=managedUsers.js.map