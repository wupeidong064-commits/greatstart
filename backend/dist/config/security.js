"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isOriginAllowed = exports.securityConfig = exports.validatePasswordStrength = exports.generateSecurePassword = void 0;
const crypto_1 = require("crypto");
require("dotenv/config");
// 解析环境变量中的允许域名
const parseAllowedOrigins = () => {
    const origins = process.env.ALLOWED_ORIGINS || '';
    const originsList = origins.split(',').map(o => o.trim()).filter(Boolean);
    // 开发环境默认允许本地访问
    if (process.env.NODE_ENV !== 'production') {
        const devOrigins = [
            'http://localhost:5173',
            'http://localhost:3000',
            'http://127.0.0.1:5173',
            'http://127.0.0.1:3000',
        ];
        return [...new Set([...originsList, ...devOrigins])];
    }
    // 生产环境必须显式配置
    if (originsList.length === 0) {
        console.warn('[Security] WARNING: ALLOWED_ORIGINS not configured for production!');
    }
    return originsList;
};
// 生成随机密码
const generateSecurePassword = (length = 12) => {
    return 'Aa9!' + (0, crypto_1.randomBytes)(Math.max(12, length)).toString('base64url');
};
exports.generateSecurePassword = generateSecurePassword;
// 验证密码强度
const validatePasswordStrength = (password) => {
    const errors = [];
    const config = exports.securityConfig.password;
    if (password.length < config.minLength) {
        errors.push(`密码长度至少 ${config.minLength} 位`);
    }
    if (config.requireUppercase && !/[A-Z]/.test(password)) {
        errors.push('密码必须包含大写字母');
    }
    if (config.requireLowercase && !/[a-z]/.test(password)) {
        errors.push('密码必须包含小写字母');
    }
    if (config.requireNumbers && !/[0-9]/.test(password)) {
        errors.push('密码必须包含数字');
    }
    if (config.requireSymbols && !/[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]/.test(password)) {
        errors.push('密码必须包含特殊字符');
    }
    return {
        valid: errors.length === 0,
        errors,
    };
};
exports.validatePasswordStrength = validatePasswordStrength;
const jwtSecret = process.env.JWT_SECRET;
if (process.env.NODE_ENV === 'production' && (!jwtSecret || jwtSecret.length < 32 || /your[-_]?secret|change.*production|changeme/i.test(jwtSecret))) {
    throw new Error('生产环境需要配置独立的 JWT_SECRET（至少 32 个字符）');
}
// 安全配置
exports.securityConfig = {
    cors: {
        allowedOrigins: parseAllowedOrigins(),
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
        allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Idempotency-Key', 'MCP-Protocol-Version', 'Mcp-Session-Id', 'Last-Event-ID'],
    },
    rateLimit: {
        windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10), // 15分钟
        maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),
    },
    password: {
        minLength: 8,
        requireUppercase: true,
        requireLowercase: true,
        requireNumbers: true,
        requireSymbols: false, // 默认不要求特殊字符，兼容性更好
        defaultLength: 12,
    },
    jwt: {
        secret: jwtSecret || (0, crypto_1.randomBytes)(32).toString('hex'),
        expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    },
    logging: {
        level: process.env.LOG_LEVEL || 'info',
        format: process.env.LOG_FORMAT || 'json',
    },
};
// CORS 检查函数
const isOriginAllowed = (origin) => {
    // 允许同源请求（无 origin）
    if (!origin)
        return true;
    const allowedOrigins = exports.securityConfig.cors.allowedOrigins;
    // 检查精确匹配
    if (allowedOrigins.includes(origin))
        return true;
    // 开发环境允许所有 localhost
    if (process.env.NODE_ENV !== 'production') {
        if (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) {
            return true;
        }
        // 生产环境允许服务器 IP
        if (origin === 'http://39.107.112.157') {
            return true;
        }
    }
    return false;
};
exports.isOriginAllowed = isOriginAllowed;
exports.default = exports.securityConfig;
//# sourceMappingURL=security.js.map