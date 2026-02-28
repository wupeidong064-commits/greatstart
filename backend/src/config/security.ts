/**
 * 安全配置模块
 * 集中管理所有安全相关配置
 */

interface SecurityConfig {
  // CORS 配置
  cors: {
    allowedOrigins: string[];
    credentials: boolean;
    methods: string[];
    allowedHeaders: string[];
  };
  // 速率限制配置
  rateLimit: {
    windowMs: number;
    maxRequests: number;
  };
  // 密码配置
  password: {
    minLength: number;
    requireUppercase: boolean;
    requireLowercase: boolean;
    requireNumbers: boolean;
    requireSymbols: boolean;
    defaultLength: number;
  };
  // JWT 配置
  jwt: {
    secret: string;
    expiresIn: string;
  };
  // 日志配置
  logging: {
    level: string;
    format: string;
  };
}

// 解析环境变量中的允许域名
const parseAllowedOrigins = (): string[] => {
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
export const generateSecurePassword = (length: number = 12): string => {
  const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const lowercase = 'abcdefghijklmnopqrstuvwxyz';
  const numbers = '0123456789';
  const symbols = '!@#$%^&*()_+-=[]{}|;:,.<>?';

  const allChars = uppercase + lowercase + numbers + symbols;

  let password = '';
  // 确保包含各种字符类型
  password += uppercase[Math.floor(Math.random() * uppercase.length)];
  password += lowercase[Math.floor(Math.random() * lowercase.length)];
  password += numbers[Math.floor(Math.random() * numbers.length)];
  password += symbols[Math.floor(Math.random() * symbols.length)];

  // 填充剩余长度
  for (let i = password.length; i < length; i++) {
    password += allChars[Math.floor(Math.random() * allChars.length)];
  }

  // 打乱顺序
  return password.split('').sort(() => Math.random() - 0.5).join('');
};

// 验证密码强度
export const validatePasswordStrength = (password: string): {
  valid: boolean;
  errors: string[];
} => {
  const errors: string[] = [];
  const config = securityConfig.password;

  if (password.length < config.minLength) {
    errors.push(`密码长度至少 ${ config.minLength } 位`);
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

// 安全配置
export const securityConfig: SecurityConfig = {
  cors: {
    allowedOrigins: parseAllowedOrigins(),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
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
    secret: process.env.JWT_SECRET || 'default-secret-change-in-production',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    format: process.env.LOG_FORMAT || 'json',
  },
};

// CORS 检查函数
export const isOriginAllowed = (origin: string | undefined): boolean => {
  // 允许同源请求（无 origin）
  if (!origin) return true;

  const allowedOrigins = securityConfig.cors.allowedOrigins;

  // 检查精确匹配
  if (allowedOrigins.includes(origin)) return true;

  // 开发环境允许所有 localhost
  if (process.env.NODE_ENV !== 'production') {
    if (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) {
      return true;
    }
  }

  return false;
};

export default securityConfig;
