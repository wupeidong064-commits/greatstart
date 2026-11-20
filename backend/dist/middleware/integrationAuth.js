"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authenticateIntegration = authenticateIntegration;
const auth_1 = require("./auth");
const errorHandler_1 = require("./errorHandler");
const integrationKeyService_1 = require("../services/integrationKeyService");
const organizationScope_1 = require("../services/organizationScope");
const database_1 = __importDefault(require("../config/database"));
async function authenticateIntegration(req, res, next) {
    res.setHeader('Cache-Control', 'no-store');
    const header = req.headers.authorization;
    if (header?.startsWith('Bearer bzsk_')) {
        try {
            req.user = await (0, integrationKeyService_1.authenticateIntegrationKey)(header.slice(7));
            next();
        }
        catch (e) {
            next(e);
        }
        return;
    }
    // Keep developer JWT access, with the same current manager and institution boundary.
    await (0, auth_1.authenticate)(req, res, async (e) => {
        if (e)
            return next(e);
        try {
            const u = req.user;
            if (!u.organizationId || !(u.isPlatformAdmin || ['super', 'manager'].includes(u.managementLevel || '')))
                throw new errorHandler_1.ApiError('只有机构管理员可以接入机构数据', 403, 'FORBIDDEN');
            const campus = await (0, organizationScope_1.resolveDefaultCampus)(database_1.default, u.organizationId);
            if (u.campusId !== campus.id)
                throw new errorHandler_1.ApiError('账号机构范围异常', 403, 'FORBIDDEN');
            next();
        }
        catch (error) {
            next(error);
        }
    });
}
//# sourceMappingURL=integrationAuth.js.map