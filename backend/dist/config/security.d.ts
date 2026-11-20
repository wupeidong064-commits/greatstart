import 'dotenv/config';
/**
 * 安全配置模块
 * 集中管理所有安全相关配置
 */
interface SecurityConfig {
    cors: {
        allowedOrigins: string[];
        credentials: boolean;
        methods: string[];
        allowedHeaders: string[];
    };
    rateLimit: {
        windowMs: number;
        maxRequests: number;
    };
    password: {
        minLength: number;
        requireUppercase: boolean;
        requireLowercase: boolean;
        requireNumbers: boolean;
        requireSymbols: boolean;
        defaultLength: number;
    };
    jwt: {
        secret: string;
        expiresIn: string;
    };
    logging: {
        level: string;
        format: string;
    };
}
export declare const generateSecurePassword: (length?: number) => string;
export declare const validatePasswordStrength: (password: string) => {
    valid: boolean;
    errors: string[];
};
export declare const securityConfig: SecurityConfig;
export declare const isOriginAllowed: (origin: string | undefined) => boolean;
export default securityConfig;
//# sourceMappingURL=security.d.ts.map