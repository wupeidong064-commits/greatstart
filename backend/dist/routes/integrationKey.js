"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.integrationKeyRoutes = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const auth_1 = require("../middleware/auth");
const rbac_1 = require("../middleware/rbac");
const errorHandler_1 = require("../middleware/errorHandler");
const response_1 = require("../utils/response");
const integrationKeyService_1 = require("../services/integrationKeyService");
const organizationScope_1 = require("../services/organizationScope");
const database_1 = __importDefault(require("../config/database"));
const logger_1 = require("../middleware/logger");
exports.integrationKeyRoutes = (0, express_1.Router)();
exports.integrationKeyRoutes.use(auth_1.authenticate, (0, rbac_1.requireMinRole)('manager'));
exports.integrationKeyRoutes.use(async (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
        if (!req.user?.organizationId)
            throw new errorHandler_1.ApiError('未分配机构', 403, 'FORBIDDEN');
        const campus = await (0, organizationScope_1.resolveDefaultCampus)(database_1.default, req.user.organizationId);
        if (req.user.campusId !== campus.id)
            throw new errorHandler_1.ApiError('账号机构范围异常', 403, 'FORBIDDEN');
        next();
    }
    catch (e) {
        next(e);
    }
});
exports.integrationKeyRoutes.get('/', async (req, res, next) => {
    try {
        (0, response_1.sendSuccess)(res, await (0, integrationKeyService_1.integrationKeyStatus)(req.user.organizationId));
    }
    catch (e) {
        next(e);
    }
});
for (const method of ['post', 'delete']) {
    exports.integrationKeyRoutes[method]('/', async (req, res, next) => {
        try {
            const parsed = zod_1.z.object({ expectedRevision: zod_1.z.string().uuid().nullable() }).strict().safeParse(req.body);
            if (!parsed.success)
                throw new errorHandler_1.ApiError('接入配置版本无效，请刷新后再操作', 400, 'INVALID_REVISION');
            const result = await (0, integrationKeyService_1.changeIntegrationKey)(req.user, parsed.data.expectedRevision, method === 'delete');
            logger_1.logger.audit(method === 'post' ? 'integration-key-generated' : 'integration-key-revoked', { organizationId: req.user.organizationId, actorId: req.user.id });
            (0, response_1.sendSuccess)(res, result);
        }
        catch (e) {
            next(e);
        }
    });
}
//# sourceMappingURL=integrationKey.js.map