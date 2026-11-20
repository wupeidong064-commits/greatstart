"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authenticate = exports.sessionTag = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const errorHandler_1 = require("./errorHandler");
const database_1 = __importDefault(require("../config/database"));
const managementAccess_1 = require("../services/managementAccess");
const crypto_1 = require("crypto");
const security_1 = require("../config/security");
const sessionTag = (passwordHash) => (0, crypto_1.createHmac)('sha256', security_1.securityConfig.jwt.secret).update(passwordHash).digest('base64url');
exports.sessionTag = sessionTag;
const authenticate = async (req, _res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            throw new errorHandler_1.ApiError('未提供认证令牌', 401, 'UNAUTHORIZED');
        }
        const token = authHeader.substring(7);
        const secret = security_1.securityConfig.jwt.secret;
        const decoded = jsonwebtoken_1.default.verify(token, secret, { algorithms: ['HS256'] });
        // 验证用户是否存在（Prisma 直查本库）
        const user = await database_1.default.user.findUnique({
            where: { id: decoded.userId },
            select: {
                id: true,
                email: true,
                role: true,
                organizationId: true,
                campusId: true,
                isActive: true,
                password: true,
                organization: { select: { isActive: true } },
                campus: { select: { isActive: true, organizationId: true } },
                phone: true,
                isPlatformAdmin: true,
                managementLevel: true,
            },
        });
        if (!user || !user.isActive) {
            throw new errorHandler_1.ApiError('用户不存在或已被禁用', 401, 'UNAUTHORIZED');
        }
        if (decoded.sessionTag !== (0, exports.sessionTag)(user.password))
            throw new errorHandler_1.ApiError('请重新登录', 401, 'SESSION_EXPIRED');
        const tokenHash = (0, crypto_1.createHash)('sha256').update(token).digest('hex');
        if (await database_1.default.revokedAuthSession.findUnique({ where: { tokenHash }, select: { tokenHash: true } }))
            throw new errorHandler_1.ApiError('当前会话已退出，请重新登录', 401, 'SESSION_EXPIRED');
        if (decoded.exp !== undefined)
            req.authSession = { tokenHash, expiresAt: new Date(decoded.exp * 1000) };
        if (!user.isPlatformAdmin &&
            (user.organization?.isActive === false ||
                user.campus?.isActive === false ||
                (user.campus && user.campus.organizationId !== user.organizationId)))
            throw new errorHandler_1.ApiError('机构或校区不可用', 403, 'FORBIDDEN');
        const path = req.baseUrl.toLowerCase();
        if (user.role === 'parent' &&
            !(path === '/api/parent' ||
                path === '/api/auth' ||
                (path === '/api/organizations' &&
                    req.method === 'GET' &&
                    req.path === '/' + user.organizationId))) {
            throw new errorHandler_1.ApiError('家长账号无权访问该资源', 403, 'FORBIDDEN');
        }
        req.user = {
            id: user.id,
            email: user.email,
            role: (0, managementAccess_1.effectiveRole)(user),
            jobRole: (0, managementAccess_1.jobRole)(user),
            managementLevel: user.managementLevel,
            organizationId: user.organizationId || undefined,
            campusId: user.campusId || undefined,
            phone: user.phone || undefined,
            isPlatformAdmin: user.isPlatformAdmin === true,
        };
        next();
    }
    catch (error) {
        if (error instanceof errorHandler_1.ApiError) {
            next(error);
        }
        else {
            if (error instanceof jsonwebtoken_1.default.JsonWebTokenError)
                return next(new errorHandler_1.ApiError('请重新登录', 401, 'UNAUTHORIZED'));
            next(new errorHandler_1.ApiError('无法验证账号状态，请稍后重试', 503, 'AUTH_UNAVAILABLE'));
        }
    }
};
exports.authenticate = authenticate;
//# sourceMappingURL=auth.js.map