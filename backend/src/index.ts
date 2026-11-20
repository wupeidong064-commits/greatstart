import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { errorHandler } from './middleware/errorHandler';
import { rejectNul } from './middleware/rejectNul';

import { authRoutes } from './routes/auth';
import { userRoutes } from './routes/users';
import { organizationRoutes } from './routes/organizations';
import { campusRoutes } from './routes/campuses';
import { studentRoutes } from './routes/students';
import { classRoutes } from './routes/classes';
import { courseRoutes } from './routes/courses';
import { scheduleRoutes } from './routes/schedules';
import { attendanceRoutes } from './routes/attendances';
import { enrollmentRoutes } from './routes/enrollments';
import { paymentRoutes } from './routes/payments';
import { refundRoutes } from './routes/refunds';
import { statisticsRoutes } from './routes/statistics';
import { lessonLogRoutes } from './routes/lessonLogs';
import { conversionRoutes } from './routes/conversions';
import { experienceLessonRoutes } from './routes/experienceLessons';
import { leadRoutes } from './routes/leads';
import parentRoutes from './routes/parents';
import { consumptionRoutes } from './routes/consumption';
import { settingsRoutes } from './routes/settings';
import { orgProfileRoutes } from './routes/orgProfile';
import { aiCreditRoutes } from './routes/aiCredits';
import { cashflowSummaryRoutes } from './routes/cashflowSummary';
import { honeymoonRoutes } from './routes/honeymoon';
import { lessonDeductionRoutes } from './routes/lessonDeductions';
import { resourceTransferRoutes } from './routes/resourceTransfers';
import { importRoutes } from './routes/import';
import { aiRoutes } from './routes/ai';
import { invalidateOrgSnapshot } from './services/aiService';
import { followUpRoutes } from './routes/followUps';
import { staffWorkRoutes } from './routes/staffWork';
import { integrationKeyRoutes } from './routes/integrationKey';
import { mcpRoutes } from './mcp/mcpServer';

import swaggerUi from 'swagger-ui-express';
import swaggerSpec from './config/swagger';
import { securityConfig, isOriginAllowed } from './config/security';
import { requestLogger, errorLogger } from './middleware/logger';
import rateLimit from 'express-rate-limit';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// 安全中间件 - 请求日志
app.use(requestLogger);

// 速率限制 - 防止暴力攻击
const limiter = rateLimit({
  windowMs: securityConfig.rateLimit.windowMs,
  max: securityConfig.rateLimit.maxRequests,
  message: { error: '请求过于频繁，请稍后再试' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(
  [
    '/api/auth/login',
    '/api/auth/login-phone',
    '/api/auth/verify-otp',
    '/api/auth/send-otp',
    '/api/auth/reset-password',
    '/api/auth/applications',
  ],
  limiter
);

// CORS 配置 - 使用安全配置
app.use(
  cors({
    origin: (origin, callback) => {
      if (isOriginAllowed(origin)) {
        callback(null, true);
      } else {
        console.warn(`[CORS] Rejected origin: ${origin}`);
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: securityConfig.cors.credentials,
    methods: securityConfig.cors.methods,
    allowedHeaders: securityConfig.cors.allowedHeaders,
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/api', rejectNul);

// API文档
if (process.env.NODE_ENV !== 'production')
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// 健康检查
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 路由
// 家长沙箱：parent 角色仅可访问 /api/auth、/api/parent/* 与 GET 机构名，其余通用接口 403（P0-01）

app.use('/api', (req, res, next) => {
  res.on('finish', () => {
    const user = (req as any).user;
    if (
      user?.organizationId &&
      ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) &&
      res.statusCode < 300 &&
      /^\/api\/(students|classes|attendances|conversions|experience-lessons|payments|refunds|lesson-logs|enrollments|leads|schedules|resource-transfers|import)(\/|$)/.test(
        req.originalUrl
      )
    )
      invalidateOrgSnapshot(user.organizationId);
  });
  next();
});
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/organizations', organizationRoutes);
app.use('/api/campuses', campusRoutes);
app.use('/api/students', studentRoutes);
app.use('/api/follow-ups', followUpRoutes);
app.use('/api/staff-work', staffWorkRoutes);
app.use('/api/classes', classRoutes);
app.use('/api/courses', courseRoutes);
app.use('/api/schedules', scheduleRoutes);
app.use('/api/attendances', attendanceRoutes);
app.use('/api/enrollments', enrollmentRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/refunds', refundRoutes);
app.use('/api/statistics', statisticsRoutes);
app.use('/api/lesson-logs', lessonLogRoutes);
app.use('/api/conversions', conversionRoutes);
app.use('/api/experience-lessons', experienceLessonRoutes);
app.use('/api/leads', leadRoutes);
app.use('/api/parent', parentRoutes);
app.use('/api/consumption', consumptionRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/org-profile', orgProfileRoutes);
app.use('/api/cashflow-summary', cashflowSummaryRoutes);
app.use('/api/honeymoon', honeymoonRoutes);
app.use('/api/lesson-deductions', lessonDeductionRoutes);
app.use('/api/resource-transfers', resourceTransferRoutes);
app.use('/api/import', importRoutes);

// AI 工作台（方向 B）：SSE 对话 + 经营速览
app.use('/api/ai', aiRoutes);

// 校区 AI 积分服务（钱包/入账/授权/计量）
app.use('/api/ai-credits', aiCreditRoutes);

// External clients share five read-only tools; credentials never authorize business API writes.
app.use('/api/integration-key', integrationKeyRoutes);
app.use('/api/mcp', mcpRoutes);

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
app.use(errorLogger);
app.use(errorHandler);

app.listen({ port: Number(PORT), host: process.env.BIND_HOST || undefined }, () => {
  console.log(`服务器运行在端口 ${PORT}`);
  if (process.env.NODE_ENV !== 'production')
    console.log(`API文档: http://localhost:${PORT}/api-docs`);
  console.log(`环境: ${process.env.NODE_ENV || 'development'}`);
});

// 超时预留扫尾：周期执行，不依赖下一次用户对话（第一轮复核 P1-05）
import { sweepStaleReserves } from './services/aiCreditService';
const SWEEP_INTERVAL_MS = 5 * 60 * 1000;
setInterval(() => {
  sweepStaleReserves().catch((e) => console.error('[AI积分] 扫尾失败:', e?.message || e));
}, SWEEP_INTERVAL_MS);
sweepStaleReserves().catch((e) => console.error('[AI积分] 启动扫尾失败:', e?.message || e));
