"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.hashIntegrationKey = void 0;
exports.integrationKeyStatus = integrationKeyStatus;
exports.changeIntegrationKey = changeIntegrationKey;
exports.authenticateIntegrationKey = authenticateIntegrationKey;
const crypto_1 = require("crypto");
const database_1 = __importDefault(require("../config/database"));
const errorHandler_1 = require("../middleware/errorHandler");
const auth_1 = require("../middleware/auth");
const managementAccess_1 = require("./managementAccess");
const organizationScope_1 = require("./organizationScope");
const hashIntegrationKey = (key) => (0, crypto_1.createHash)('sha256').update(key).digest('hex');
exports.hashIntegrationKey = hashIntegrationKey;
const denied = () => new errorHandler_1.ApiError('接入密钥无效或已失效，请联系机构管理员重新生成', 401, 'INVALID_INTEGRATION_KEY');
const issuerStamp = (user) => (0, crypto_1.createHash)('sha256').update(JSON.stringify([(0, auth_1.sessionTag)(user.password), user.managementGrantedAt?.toISOString() ?? null, user.campusId])).digest('hex');
const metadata = (key, status = key.revokedAt ? 'revoked' : 'active') => ({
    revision: key.revision, status, keyPrefix: key.keyPrefix, createdAt: key.createdAt, lastUsedAt: key.lastUsedAt,
});
async function issuerScope(db, key) {
    const issuer = await db.user.findUnique({ where: { id: key.createdById }, include: { organization: true } });
    if (!issuer?.isActive || issuer.organizationId !== key.organizationId || !issuer.organization?.isActive ||
        !(issuer.isPlatformAdmin || ['super', 'manager'].includes(issuer.managementLevel)) ||
        key.creatorSessionTag !== issuerStamp(issuer))
        throw denied();
    const campus = await (0, organizationScope_1.resolveDefaultCampus)(db, key.organizationId);
    if (issuer.campusId !== campus.id)
        throw denied();
    return { id: issuer.id, email: issuer.email, organizationId: key.organizationId, campusId: campus.id,
        role: 'manager', managementLevel: issuer.managementLevel, isPlatformAdmin: false };
}
async function integrationKeyStatus(organizationId) {
    const key = await database_1.default.integrationKey.findUnique({ where: { organizationId } });
    if (!key)
        return { revision: null, status: 'missing', keyPrefix: null, createdAt: null, lastUsedAt: null };
    let status = key.revokedAt ? 'revoked' : 'active';
    if (status === 'active') {
        try {
            await issuerScope(database_1.default, key);
        }
        catch (e) {
            if (!(e instanceof errorHandler_1.ApiError))
                throw e;
            status = 'unavailable';
        }
    }
    return metadata(key, status);
}
async function changeIntegrationKey(actor, expectedRevision, revoke = false) {
    if (!actor.organizationId)
        throw new errorHandler_1.ApiError('未分配机构', 403, 'FORBIDDEN');
    const organizationId = actor.organizationId;
    return database_1.default.$transaction(async (tx) => {
        await (0, managementAccess_1.lockManagement)(tx, organizationId);
        const current = await tx.user.findUnique({ where: { id: actor.id } });
        if (!current?.isActive || current.organizationId !== organizationId ||
            !(current.isPlatformAdmin || ['super', 'manager'].includes(current.managementLevel)))
            throw new errorHandler_1.ApiError('只有本机构管理员可以管理接入密钥', 403, 'FORBIDDEN');
        const campus = await (0, organizationScope_1.resolveDefaultCampus)(tx, organizationId);
        if (current.campusId !== campus.id)
            throw new errorHandler_1.ApiError('账号机构范围异常', 403, 'FORBIDDEN');
        const previous = await tx.integrationKey.findUnique({ where: { organizationId } });
        if ((previous?.revision ?? null) !== expectedRevision)
            throw new errorHandler_1.ApiError('接入配置已变化，请刷新后再操作', 409, 'INTEGRATION_KEY_CONFLICT');
        if (revoke) {
            if (!previous)
                return { revision: null, status: 'missing', keyPrefix: null, createdAt: null, lastUsedAt: null };
            if (previous.revokedAt)
                return metadata(previous);
            return metadata(await tx.integrationKey.update({ where: { id: previous.id }, data: { revokedAt: new Date(), revision: (0, crypto_1.randomUUID)() } }));
        }
        const plaintext = 'bzsk_' + (0, crypto_1.randomBytes)(32).toString('hex');
        const data = { keyHash: (0, exports.hashIntegrationKey)(plaintext), keyPrefix: plaintext.slice(0, 13), revision: (0, crypto_1.randomUUID)(),
            createdById: current.id, creatorSessionTag: issuerStamp(current), createdAt: new Date(), revokedAt: null, lastUsedAt: null };
        const saved = await tx.integrationKey.upsert({ where: { organizationId }, create: { organizationId, ...data }, update: data });
        return { ...metadata(saved), plaintext };
    });
}
async function authenticateIntegrationKey(plaintext) {
    if (!/^bzsk_[a-f0-9]{64}$/.test(plaintext))
        throw denied();
    const key = await database_1.default.integrationKey.findUnique({ where: { keyHash: (0, exports.hashIntegrationKey)(plaintext) } });
    if (!key || key.revokedAt)
        throw denied();
    const user = await issuerScope(database_1.default, key);
    // CAS prevents a concurrently rotated/revoked credential being accepted after scope validation.
    const used = await database_1.default.integrationKey.updateMany({ where: { id: key.id, revision: key.revision, revokedAt: null }, data: { lastUsedAt: new Date() } });
    if (used.count !== 1)
        throw denied();
    return user;
}
//# sourceMappingURL=integrationKeyService.js.map