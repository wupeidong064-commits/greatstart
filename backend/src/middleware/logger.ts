/**
 * 日志中间件
 * 用于记录请求和错误日志
 */

import { Request, Response, NextFunction } from 'express';
import fs from 'fs';
import path from 'path';

// 日志级别
type LogLevel = 'debug' | 'info' | 'warn' | 'error';

// 日志配置
const LOG_CONFIG = {
  level: process.env.LOG_LEVEL || 'info',
  format: process.env.LOG_FORMAT || 'text',
  logDir: process.env.LOG_DIR || 'logs',
};

// 确保日志目录存在
const logDir = path.join(process.cwd(), LOG_CONFIG.logDir);
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// 日志文件路径
const getLogFilePath = (type: string): string => {
  const date = new Date().toISOString().split('T')[0];
  return path.join(logDir, `${ type }-${ date }.log`);
};

// 格式化日志
const formatLog = (level: LogLevel, message: string, data?: Record<string, unknown>): string => {
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

  return `[${ timestamp }] [${ level.toUpperCase() }] ${ message }${ data ? ` ${ JSON.stringify(data) }` : '' }`;
};

// 写入日志文件
const writeToFile = (type: string, content: string): void => {
  const logPath = getLogFilePath(type);
  fs.appendFileSync(logPath, content + '\n');
};

// 日志级别优先级
const levelPriority: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

// 检查是否应该输出日志
const shouldLog = (level: LogLevel): boolean => {
  const currentLevel = (LOG_CONFIG.level as LogLevel) || 'info';
  return levelPriority[level] >= levelPriority[currentLevel];
};

// 日志记录器
export const logger = {
  debug: (message: string, data?: Record<string, unknown>): void => {
    if (shouldLog('debug')) {
      const log = formatLog('debug', message, data);
      console.log(log);
      writeToFile('debug', log);
    }
  },

  info: (message: string, data?: Record<string, unknown>): void => {
    if (shouldLog('info')) {
      const log = formatLog('info', message, data);
      console.log(log);
      writeToFile('app', log);
    }
  },

  warn: (message: string, data?: Record<string, unknown>): void => {
    if (shouldLog('warn')) {
      const log = formatLog('warn', message, data);
      console.warn(log);
      writeToFile('app', log);
    }
  },

  error: (message: string, data?: Record<string, unknown>): void => {
    if (shouldLog('error')) {
      const log = formatLog('error', message, data);
      console.error(log);
      writeToFile('error', log);
    }
  },

  // 安全审计日志 - 记录敏感操作
  audit: (action: string, data: Record<string, unknown>): void => {
    const log = formatLog('info', `[AUDIT] ${ action }`, {
      action,
      ...data,
    });
    console.log(log);
    writeToFile('audit', log);
  },

  // 访问日志
  access: (req: Request, res: Response, duration: number): void => {
    const log = formatLog('info', 'HTTP Request', {
      method: req.method,
      url: req.originalUrl,
      status: res.statusCode,
      duration: `${ duration }ms`,
      ip: req.ip || req.socket.remoteAddress,
      userAgent: req.get('user-agent'),
    });
    writeToFile('access', log);
  },
};

// 请求日志中间件
export const requestLogger = (req: Request, res: Response, next: NextFunction): void => {
  const startTime = Date.now();

  // 记录请求开始
  logger.debug('Request started', {
    method: req.method,
    url: req.originalUrl,
    query: req.query,
    ip: req.ip || req.socket.remoteAddress,
  });

  // 响应完成后记录
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    logger.access(req, res, duration);
  });

  next();
};

// 错误日志中间件
export const errorLogger = (err: Error, req: Request, res: Response, next: NextFunction): void => {
  logger.error('Unhandled error', {
    error: err.message,
    stack: err.stack,
    method: req.method,
    url: req.originalUrl,
    body: req.body,
    query: req.query,
    ip: req.ip || req.socket.remoteAddress,
  });

  next(err);
};

// 操作日志辅助函数 - 用于控制器
export const logOperation = (
  operation: string,
  userId: string | undefined,
  details: Record<string, unknown>
): void => {
  logger.audit(operation, {
    userId,
    timestamp: new Date().toISOString(),
    ...details,
  });
};

export default logger;
