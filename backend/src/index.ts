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
import { memfireUsersRoutes } from './routes/memfireUsers';
import parentRoutes from './routes/parents';
import swaggerUi from 'swagger-ui-express';
import swaggerSpec from './config/swagger';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// 中间件
app.use(cors({
  origin: function (origin, callback) {
    // 允许所有本地开发环境
    if (!origin || origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// API文档
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// 健康检查
app.get('/health', (req, res) => {
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
app.use('/api/memfire/users', memfireUsersRoutes);
app.use('/api/parent', parentRoutes);

// 错误处理
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`服务器运行在端口 ${PORT}`);
  console.log(`API文档: http://localhost:${PORT}/api-docs`);
});

