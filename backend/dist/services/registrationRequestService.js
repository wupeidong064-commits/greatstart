"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.managesRegistrations = exports.registrationRoles = void 0;
exports.registrationActor = registrationActor;
exports.requestKey = requestKey;
exports.runRegistration = runRegistration;
exports.textValue = textValue;
exports.scopedStaff = scopedStaff;
exports.accessibleLead = accessibleLead;
const node_crypto_1 = require("node:crypto");
const zod_1 = require("zod");
const database_1 = __importDefault(require("../config/database"));
const errorHandler_1 = require("../middleware/errorHandler");
exports.registrationRoles = ['admin', 'manager', 'coach', 'teacher', 'sales', 'staff'];
function registrationActor(req) {
    const user = req.user;
    if (!user?.organizationId || !user.campusId || !exports.registrationRoles.includes(user.role)) {
        throw new errorHandler_1.ApiError('登记需要当前校区的员工账号', 403, 'FORBIDDEN');
    }
    return { id: user.id, role: user.role, organizationId: user.organizationId, campusId: user.campusId };
}
const managesRegistrations = (actor) => ['admin', 'manager'].includes(actor.role);
exports.managesRegistrations = managesRegistrations;
function requestKey(req) {
    const body = req.body?.requestId;
    const header = req.get('Idempotency-Key');
    if (header === undefined && body === undefined)
        return undefined;
    const key = zod_1.z.uuid().safeParse(header ?? body);
    if (!key.success || (header !== undefined && body !== undefined &&
        (typeof body !== 'string' || body.toLowerCase() !== header.toLowerCase()))) {
        throw new errorHandler_1.ApiError('登记请求编号须为一致的 UUID', 400, 'INVALID_REQUEST_ID');
    }
    return key.data.toLowerCase();
}
async function runRegistration(options) {
    const { actor, operation, key, command, authorizeReplay, create } = options;
    const { organizationId, campusId, id: actorId } = actor;
    return database_1.default.$transaction(async (tx) => {
        if (!key)
            return { data: await create(tx), status: 'legacy' };
        const identity = { organizationId, operation, requestId: key };
        const payloadHash = (0, node_crypto_1.createHash)('sha256').update(JSON.stringify(command)).digest('hex');
        await tx.$executeRaw `SELECT pg_advisory_xact_lock(hashtext(${'registration:' + organizationId + ':' + operation}), hashtext(${key}))`;
        const prior = await tx.registrationReceipt.findUnique({ where: { organizationId_operation_requestId: identity } });
        if (prior) {
            if (prior.actorId !== actorId || prior.campusId !== campusId || prior.payloadHash !== payloadHash) {
                throw new errorHandler_1.ApiError('此请求编号已用于其他登记，请核对原操作', 409, 'IDEMPOTENCY_CONFLICT');
            }
            await authorizeReplay(tx, prior.resultId);
            return { data: prior.snapshot, status: 'replayed' };
        }
        const data = await create(tx);
        const snapshot = JSON.parse(JSON.stringify(data));
        await tx.registrationReceipt.create({ data: { ...identity, campusId, actorId, payloadHash, resultId: data.id, snapshot } });
        return { data, status: 'created' };
    }, { maxWait: 15000, timeout: 20000 });
}
function textValue(value, label, required = false) {
    if (value != null && typeof value !== 'string')
        throw new errorHandler_1.ApiError(label + '无效', 400, 'INVALID_PARAMS');
    const result = typeof value === 'string' ? value.trim() : '';
    if (!result && required)
        throw new errorHandler_1.ApiError('请填写' + label, 400, 'INVALID_PARAMS');
    return result || null;
}
async function scopedStaff(tx, actor, id, teacher = false) {
    await tx.$queryRaw `SELECT id FROM users WHERE id = ${id} AND "organizationId" = ${actor.organizationId} FOR UPDATE`;
    const roles = teacher ? ['admin', 'manager', 'teacher', 'coach'] : exports.registrationRoles;
    const staff = await tx.user.findFirst({
        where: { id, organizationId: actor.organizationId, campusId: actor.campusId, isActive: true, role: { in: roles } },
        select: { id: true, name: true },
    });
    if (!staff)
        throw new errorHandler_1.ApiError(teacher ? '上课老师无效或不属于当前校区' : '负责人无效或不属于当前校区', 403, 'FORBIDDEN');
    return staff;
}
// Unassigned legacy leads use the creator's campus, matching the lead register.
async function accessibleLead(tx, actor, id) {
    const tenant = { organizationId: actor.organizationId, campusId: actor.campusId };
    const owners = (0, exports.managesRegistrations)(actor)
        ? { OR: [{ assignee: tenant }, { assigneeId: null, createdById: { in: (await tx.user.findMany({
                            where: tenant, select: { id: true },
                        })).map(row => row.id) } }] }
        : { assigneeId: actor.id };
    const lead = await tx.lead.findFirst({ where: { id, organizationId: tenant.organizationId, ...owners }, select: { id: true } });
    if (!lead)
        throw new errorHandler_1.ApiError('线索不存在或不在当前负责范围', 403, 'FORBIDDEN');
}
//# sourceMappingURL=registrationRequestService.js.map