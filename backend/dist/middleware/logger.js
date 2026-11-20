"use strict";
/**
 * 日志中间件
 * 用于记录请求和错误日志
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.logOperation = exports.errorLogger = exports.requestLogger = exports.logger = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
// 日志配置
const LOG_CONFIG = {
    level: process.env.LOG_LEVEL || 'info',
    format: process.env.LOG_FORMAT || 'text',
    logDir: process.env.LOG_DIR || 'logs',
};
// 确保日志目录存在
const logDir = path_1.default.join(process.cwd(), LOG_CONFIG.logDir);
if (!fs_1.default.existsSync(logDir)) {
    fs_1.default.mkdirSync(logDir, { recursive: true });
}
// 日志文件路径
const getLogFilePath = (type) => {
    const date = new Date().toISOString().split('T')[0];
    return path_1.default.join(logDir, `${type}-${date}.log`);
};
// 格式化日志
const formatLog = (level, message, data) => {
    const timestamp = new Date().toISOString();
    const logObj = {
        timestamp,
        level,
        message,
        ...data,
    };
    if (LOG_CONFIG.format === 'json') {
        return JSON.stringify(logObj);
    }
    return `[${timestamp}] [${level.toUpperCase()}] ${message}${data ? ` ${JSON.stringify(data)}` : ''}`;
};
// 写入日志文件
const writeToFile = (type, content) => {
    const logPath = getLogFilePath(type);
    fs_1.default.appendFileSync(logPath, content + '\n');
};
// 日志级别优先级
const levelPriority = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
};
// 检查是否应该输出日志
const shouldLog = (level) => {
    const currentLevel = LOG_CONFIG.level || 'info';
    return levelPriority[level] >= levelPriority[currentLevel];
};
// 日志记录器
exports.logger = {
    debug: (message, data) => {
        if (shouldLog('debug')) {
            const log = formatLog('debug', message, data);
            console.log(log);
            writeToFile('debug', log);
        }
    },
    info: (message, data) => {
        if (shouldLog('info')) {
            const log = formatLog('info', message, data);
            console.log(log);
            writeToFile('app', log);
        }
    },
    warn: (message, data) => {
        if (shouldLog('warn')) {
            const log = formatLog('warn', message, data);
            console.warn(log);
            writeToFile('app', log);
        }
    },
    error: (message, data) => {
        if (shouldLog('error')) {
            const log = formatLog('error', message, data);
            console.error(log);
            writeToFile('error', log);
        }
    },
    // 安全审计日志 - 记录敏感操作
    audit: (action, data) => {
        const log = formatLog('info', `[AUDIT] ${action}`, {
            action,
            ...data,
        });
        console.log(log);
        writeToFile('audit', log);
    },
    // 访问日志
    access: (req, res, duration) => {
        const log = formatLog('info', 'HTTP Request', {
            method: req.method,
            url: req.originalUrl.split('?')[0],
            status: res.statusCode,
            duration: `${duration}ms`,
            ip: req.ip || req.socket.remoteAddress,
            userAgent: req.get('user-agent'),
        });
        writeToFile('access', log);
    },
};
// 请求日志中间件
const requestLogger = (req, res, next) => {
    const startTime = Date.now();
    // 记录请求开始
    exports.logger.debug('Request started', {
        method: req.method,
        url: req.originalUrl.split('?')[0],
        ip: req.ip || req.socket.remoteAddress,
    });
    // 响应完成后记录
    res.on('finish', () => {
        const duration = Date.now() - startTime;
        exports.logger.access(req, res, duration);
    });
    next();
};
exports.requestLogger = requestLogger;
// 错误日志中间件
const errorLogger = (err, req, res, next) => {
    exports.logger.error('Unhandled error', {
        error: err.message,
        stack: err.stack,
        method: req.method,
        url: req.originalUrl.split('?')[0],
        ip: req.ip || req.socket.remoteAddress,
    });
    next(err);
};
exports.errorLogger = errorLogger;
// 操作日志辅助函数 - 用于控制器
const logOperation = (operation, userId, details) => {
    exports.logger.audit(operation, {
        userId,
        timestamp: new Date().toISOString(),
        ...details,
    });
};
exports.logOperation = logOperation;
exports.default = exports.logger;
//# sourceMappingURL=logger.js.map