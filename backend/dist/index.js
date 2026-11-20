"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const errorHandler_1 = require("./middleware/errorHandler");
const rejectNul_1 = require("./middleware/rejectNul");
const auth_1 = require("./routes/auth");
const users_1 = require("./routes/users");
const organizations_1 = require("./routes/organizations");
const campuses_1 = require("./routes/campuses");
const students_1 = require("./routes/students");
const classes_1 = require("./routes/classes");
const courses_1 = require("./routes/courses");
const schedules_1 = require("./routes/schedules");
const attendances_1 = require("./routes/attendances");
const enrollments_1 = require("./routes/enrollments");
const payments_1 = require("./routes/payments");
const refunds_1 = require("./routes/refunds");
const statistics_1 = require("./routes/statistics");
const lessonLogs_1 = require("./routes/lessonLogs");
const conversions_1 = require("./routes/conversions");
const experienceLessons_1 = require("./routes/experienceLessons");
const leads_1 = require("./routes/leads");
const parents_1 = __importDefault(require("./routes/parents"));
const consumption_1 = require("./routes/consumption");
const settings_1 = require("./routes/settings");
const orgProfile_1 = require("./routes/orgProfile");
const aiCredits_1 = require("./routes/aiCredits");
const cashflowSummary_1 = require("./routes/cashflowSummary");
const honeymoon_1 = require("./routes/honeymoon");
const lessonDeductions_1 = require("./routes/lessonDeductions");
const resourceTransfers_1 = require("./routes/resourceTransfers");
const import_1 = require("./routes/import");
const ai_1 = require("./routes/ai");
const aiService_1 = require("./services/aiService");
const followUps_1 = require("./routes/followUps");
const staffWork_1 = require("./routes/staffWork");
const integrationKey_1 = require("./routes/integrationKey");
const mcpServer_1 = require("./mcp/mcpServer");
const swagger_ui_express_1 = __importDefault(require("swagger-ui-express"));
const swagger_1 = __importDefault(require("./config/swagger"));
const security_1 = require("./config/security");
const logger_1 = require("./middleware/logger");
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
dotenv_1.default.config();
const app = (0, express_1.default)();
const PORT = process.env.PORT || 3000;
// 安全中间件 - 请求日志
app.use(logger_1.requestLogger);
// 速率限制 - 防止暴力攻击
const limiter = (0, express_rate_limit_1.default)({
    windowMs: security_1.securityConfig.rateLimit.windowMs,
    max: security_1.securityConfig.rateLimit.maxRequests,
    message: { error: '请求过于频繁，请稍后再试' },
    standardHeaders: true,
    legacyHeaders: false,
});
app.use([
    '/api/auth/login',
    '/api/auth/login-phone',
    '/api/auth/verify-otp',
    '/api/auth/send-otp',
    '/api/auth/reset-password',
    '/api/auth/applications',
], limiter);
// CORS 配置 - 使用安全配置
app.use((0, cors_1.default)({
    origin: (origin, callback) => {
        if ((0, security_1.isOriginAllowed)(origin)) {
            callback(null, true);
        }
        else {
            console.warn(`[CORS] Rejected origin: ${origin}`);
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: security_1.securityConfig.cors.credentials,
    methods: security_1.securityConfig.cors.methods,
    allowedHeaders: security_1.securityConfig.cors.allowedHeaders,
}));
app.use(express_1.default.json());
app.use(express_1.default.urlencoded({ extended: true }));
app.use('/api', rejectNul_1.rejectNul);
// API文档
if (process.env.NODE_ENV !== 'production')
    app.use('/api-docs', swagger_ui_express_1.default.serve, swagger_ui_express_1.default.setup(swagger_1.default));
// 健康检查
app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});
// 路由
// 家长沙箱：parent 角色仅可访问 /api/auth、/api/parent/* 与 GET 机构名，其余通用接口 403（P0-01）
app.use('/api', (req, res, next) => {
    res.on('finish', () => {
        const user = req.user;
        if (user?.organizationId &&
            ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) &&
            res.statusCode < 300 &&
            /^\/api\/(students|classes|attendances|conversions|experience-lessons|payments|refunds|lesson-logs|enrollments|leads|schedules|resource-transfers|import)(\/|$)/.test(req.originalUrl))
            (0, aiService_1.invalidateOrgSnapshot)(user.organizationId);
    });
    next();
});
app.use('/api/auth', auth_1.authRoutes);
app.use('/api/users', users_1.userRoutes);
app.use('/api/organizations', organizations_1.organizationRoutes);
app.use('/api/campuses', campuses_1.campusRoutes);
app.use('/api/students', students_1.studentRoutes);
app.use('/api/follow-ups', followUps_1.followUpRoutes);
app.use('/api/staff-work', staffWork_1.staffWorkRoutes);
app.use('/api/classes', classes_1.classRoutes);
app.use('/api/courses', courses_1.courseRoutes);
app.use('/api/schedules', schedules_1.scheduleRoutes);
app.use('/api/attendances', attendances_1.attendanceRoutes);
app.use('/api/enrollments', enrollments_1.enrollmentRoutes);
app.use('/api/payments', payments_1.paymentRoutes);
app.use('/api/refunds', refunds_1.refundRoutes);
app.use('/api/statistics', statistics_1.statisticsRoutes);
app.use('/api/lesson-logs', lessonLogs_1.lessonLogRoutes);
app.use('/api/conversions', conversions_1.conversionRoutes);
app.use('/api/experience-lessons', experienceLessons_1.experienceLessonRoutes);
app.use('/api/leads', leads_1.leadRoutes);
app.use('/api/parent', parents_1.default);
app.use('/api/consumption', consumption_1.consumptionRoutes);
app.use('/api/settings', settings_1.settingsRoutes);
app.use('/api/org-profile', orgProfile_1.orgProfileRoutes);
app.use('/api/cashflow-summary', cashflowSummary_1.cashflowSummaryRoutes);
app.use('/api/honeymoon', honeymoon_1.honeymoonRoutes);
app.use('/api/lesson-deductions', lessonDeductions_1.lessonDeductionRoutes);
app.use('/api/resource-transfers', resourceTransfers_1.resourceTransferRoutes);
app.use('/api/import', import_1.importRoutes);
// AI 工作台（方向 B）：SSE 对话 + 经营速览
app.use('/api/ai', ai_1.aiRoutes);
// 校区 AI 积分服务（钱包/入账/授权/计量）
app.use('/api/ai-credits', aiCredits_1.aiCreditRoutes);
// External clients share five read-only tools; credentials never authorize business API writes.
app.use('/api/integration-key', integrationKey_1.integrationKeyRoutes);
app.use('/api/mcp', mcpServer_1.mcpRoutes);
// 未匹配路由：统一中文 404 JSON（替代 Express 默认英文 HTML，前端不再拿到 "Cannot POST ..."）
app.use((req, res) => {
    res
        .status(404)
        .json({
        success: false,
        error: { message: `请求的接口不存在：${req.method} ${req.originalUrl}`, code: 'NOT_FOUND' },
    });
});
// 错误处理
app.use(logger_1.errorLogger);
app.use(errorHandler_1.errorHandler);
app.listen(PORT, () => {
    console.log(`服务器运行在端口 ${PORT}`);
    if (process.env.NODE_ENV !== 'production')
        console.log(`API文档: http://localhost:${PORT}/api-docs`);
    console.log(`环境: ${process.env.NODE_ENV || 'development'}`);
});
// 超时预留扫尾：周期执行，不依赖下一次用户对话（第一轮复核 P1-05）
const aiCreditService_1 = require("./services/aiCreditService");
const SWEEP_INTERVAL_MS = 5 * 60 * 1000;
setInterval(() => {
    (0, aiCreditService_1.sweepStaleReserves)().catch((e) => console.error('[AI积分] 扫尾失败:', e?.message || e));
}, SWEEP_INTERVAL_MS);
(0, aiCreditService_1.sweepStaleReserves)().catch((e) => console.error('[AI积分] 启动扫尾失败:', e?.message || e));
//# sourceMappingURL=index.js.map