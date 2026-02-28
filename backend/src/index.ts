import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { errorHandler } from './middleware/errorHandler';
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
import { statisticsRoutes } from './routes/statistics';
import { lessonLogRoutes } from './routes/lessonLogs';
import { conversionRoutes } from './routes/conversions';
import { memfireUsersRoutes } from './routes/memfireUsers';
import { experienceLessonRoutes } from './routes/experienceLessons';
import { leadRoutes } from './routes/leads';
import parentRoutes from './routes/parents';
import { consumptionRoutes } from './routes/consumption';
import { settingsRoutes } from './routes/settings';
import { cashflowSummaryRoutes } from './routes/cashflowSummary';
import { honeymoonRoutes } from './routes/honeymoon';
import { lessonDeductionRoutes } from './routes/lessonDeductions';
import { resourceTransferRoutes } from './routes/resourceTransfers';
import { importRoutes } from './routes/import';
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
app.use('/api/auth/login', limiter);

// CORS 配置 - 使用安全配置
app.use(cors({
  origin: (origin, callback) => {
    if (isOriginAllowed(origin)) {
      callback(null, true);
    } else {
      console.warn(`[CORS] Rejected origin: ${ origin }`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: securityConfig.cors.credentials,
  methods: securityConfig.cors.methods,
  allowedHeaders: securityConfig.cors.allowedHeaders,
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// API文档
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// 健康检查
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 路由
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/organizations', organizationRoutes);
app.use('/api/campuses', campusRoutes);
app.use('/api/students', studentRoutes);
app.use('/api/classes', classRoutes);
app.use('/api/courses', courseRoutes);
app.use('/api/schedules', scheduleRoutes);
app.use('/api/attendances', attendanceRoutes);
app.use('/api/enrollments', enrollmentRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/statistics', statisticsRoutes);
app.use('/api/lesson-logs', lessonLogRoutes);
app.use('/api/conversions', conversionRoutes);
app.use('/api/memfire/users', memfireUsersRoutes);
app.use('/api/experience-lessons', experienceLessonRoutes);
app.use('/api/leads', leadRoutes);
app.use('/api/parent', parentRoutes);
app.use('/api/consumption', consumptionRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/cashflow-summary', cashflowSummaryRoutes);
app.use('/api/honeymoon', honeymoonRoutes);
app.use('/api/lesson-deductions', lessonDeductionRoutes);
app.use('/api/resource-transfers', resourceTransferRoutes);
app.use('/api/import', importRoutes);

// 错误处理
app.use(errorLogger);
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`服务器运行在端口 ${PORT}`);
  console.log(`API文档: http://localhost:${PORT}/api-docs`);
  console.log(`环境: ${process.env.NODE_ENV || 'development'}`);
});

