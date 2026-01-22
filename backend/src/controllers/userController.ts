import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import { ApiError } from '../middleware/errorHandler';
import { sendSuccess, sendPaginated } from '../utils/response';
import prisma from '../config/database';
import bcrypt from 'bcryptjs';
import * as XLSX from 'xlsx';

export const userController = {
  getUsers: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const pageSize = parseInt(req.query.pageSize as string) || 10;
      const role = req.query.role as string;
      const organizationId = req.query.organizationId as string;
      const search = req.query.search as string;

      const where: any = {};

      // 数据隔离：非admin只能查看自己机构的数据
      if (req.user?.role !== 'admin') {
        if (req.user?.organizationId) {
          where.organizationId = req.user.organizationId;
        } else {
          return next(new ApiError('未分配机构', 403, 'FORBIDDEN'));
        }
      } else if (organizationId) {
        where.organizationId = organizationId;
      }

      if (role) {
        where.role = role;
      }

      if (search) {
        where.OR = [
          { name: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
        ];
      }

      const [users, total] = await Promise.all([
        prisma.user.findMany({
          where,
          select: {
            id: true,
            email: true,
            name: true,
            phone: true,
            role: true,
            organizationId: true,
            campusId: true,
            isActive: true,
            lastLoginAt: true,
            createdAt: true,
            organization: {
              select: {
                id: true,
                name: true,
                code: true,
              },
            },
            campus: {
              select: {
                id: true,
                name: true,
                code: true,
              },
            },
          },
          skip: (page - 1) * pageSize,
          take: pageSize,
          orderBy: { createdAt: 'desc' },
        }),
        prisma.user.count({ where }),
      ]);

      sendPaginated(res, users, page, pageSize, total);
    } catch (error) {
      next(error);
    }
  },

  getUserById: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;

      const user = await prisma.user.findUnique({
        where: { id },
        include: {
          organization: {
            select: {
              id: true,
              name: true,
              code: true,
            },
          },
          campus: {
            select: {
              id: true,
              name: true,
              code: true,
            },
          },
        },
        select: {
          id: true,
          email: true,
          name: true,
          phone: true,
          role: true,
          organizationId: true,
          campusId: true,
          isActive: true,
          lastLoginAt: true,
          createdAt: true,
          updatedAt: true,
          organization: true,
          campus: true,
        },
      });

      if (!user) {
        return next(new ApiError('用户不存在', 404, 'USER_NOT_FOUND'));
      }

      // 数据隔离检查
      if (req.user?.role !== 'admin' && user.organizationId !== req.user?.organizationId) {
        return next(new ApiError('无权访问', 403, 'FORBIDDEN'));
      }

      sendSuccess(res, user);
    } catch (error) {
      next(error);
    }
  },

  createUser: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { email, password, name, role, organizationId, campusId, phone } = req.body;

      // 检查邮箱是否已存在
      const existingUser = await prisma.user.findUnique({
        where: { email },
      });

      if (existingUser) {
        return next(new ApiError('邮箱已被注册', 400, 'EMAIL_EXISTS'));
      }

      // 数据隔离：非admin只能在自己机构创建用户
      const targetOrgId = organizationId || req.user?.organizationId;
      if (!targetOrgId) {
        return next(new ApiError('必须指定机构', 400, 'MISSING_ORGANIZATION'));
      }

      if (req.user?.role !== 'admin' && targetOrgId !== req.user?.organizationId) {
        return next(new ApiError('无权在该机构创建用户', 403, 'FORBIDDEN'));
      }

      // 验证机构
      const org = await prisma.organization.findUnique({
        where: { id: targetOrgId },
      });
      if (!org) {
        return next(new ApiError('机构不存在', 400, 'ORGANIZATION_NOT_FOUND'));
      }

      // 验证校区
      if (campusId) {
        const campus = await prisma.campus.findUnique({
          where: { id: campusId },
        });
        if (!campus || campus.organizationId !== targetOrgId) {
          return next(new ApiError('校区不存在或不属于该机构', 400, 'CAMPUS_NOT_FOUND'));
        }
      }

      // 加密密码
      const hashedPassword = password ? await bcrypt.hash(password, 10) : undefined;

      const user = await prisma.user.create({
        data: {
          email,
          password: hashedPassword || (await bcrypt.hash('123456', 10)), // 默认密码
          name,
          role,
          organizationId: targetOrgId,
          campusId,
          phone,
        },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          organizationId: true,
          campusId: true,
          createdAt: true,
        },
      });

      sendSuccess(res, user, '用户创建成功', 201);
    } catch (error) {
      next(error);
    }
  },

  updateUser: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const { name, phone, role, organizationId, campusId, isActive, password } = req.body;

      const existingUser = await prisma.user.findUnique({
        where: { id },
      });

      if (!existingUser) {
        return next(new ApiError('用户不存在', 404, 'USER_NOT_FOUND'));
      }

      // 数据隔离检查
      if (req.user?.role !== 'admin' && existingUser.organizationId !== req.user?.organizationId) {
        return next(new ApiError('无权修改该用户', 403, 'FORBIDDEN'));
      }

      const updateData: any = {};
      if (name) updateData.name = name;
      if (phone !== undefined) updateData.phone = phone;
      if (role) updateData.role = role;
      if (isActive !== undefined) updateData.isActive = isActive;
      if (password) {
        updateData.password = await bcrypt.hash(password, 10);
      }

      // 只有admin可以修改机构
      if (organizationId && req.user?.role === 'admin') {
        updateData.organizationId = organizationId;
        updateData.campusId = null; // 切换机构时清空校区
      }

      if (campusId) {
        const campus = await prisma.campus.findUnique({
          where: { id: campusId },
        });
        if (!campus) {
          return next(new ApiError('校区不存在', 400, 'CAMPUS_NOT_FOUND'));
        }
        if (req.user?.role !== 'admin' && campus.organizationId !== req.user?.organizationId) {
          return next(new ApiError('无权分配该校区', 403, 'FORBIDDEN'));
        }
        updateData.campusId = campusId;
      }

      const user = await prisma.user.update({
        where: { id },
        data: updateData,
        select: {
          id: true,
          email: true,
          name: true,
          phone: true,
          role: true,
          organizationId: true,
          campusId: true,
          isActive: true,
          updatedAt: true,
        },
      });

      sendSuccess(res, user, '用户更新成功');
    } catch (error) {
      next(error);
    }
  },

  deleteUser: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;

      // 不能删除自己
      if (id === req.user?.id) {
        return next(new ApiError('不能删除自己', 400, 'CANNOT_DELETE_SELF'));
      }

      const user = await prisma.user.findUnique({
        where: { id },
      });

      if (!user) {
        return next(new ApiError('用户不存在', 404, 'USER_NOT_FOUND'));
      }

      await prisma.user.delete({
        where: { id },
      });

      sendSuccess(res, null, '用户删除成功');
    } catch (error) {
      next(error);
    }
  },

  getTeachersStatistics: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const organizationId = req.body.organizationId;

      // 获取所有教练
      const teachers = await prisma.user.findMany({
        where: {
          organizationId,
          role: 'teacher',
          isActive: true,
        },
        select: {
          id: true,
          name: true,
        },
      });

      // 为每个教练计算统计数据
      const teachersWithStats = await Promise.all(
        teachers.map(async (teacher) => {
          // 1. 负责班级数（活跃班级）
          const classCount = await prisma.class.count({
            where: {
              teacherId: teacher.id,
              status: 'active',
              organizationId,
            },
          });

          // 获取该教练负责的所有班级ID
          const classes = await prisma.class.findMany({
            where: {
              teacherId: teacher.id,
              status: 'active',
              organizationId,
            },
            select: {
              id: true,
            },
          });
          const classIds = classes.map((c) => c.id);

          // 2. 负责学员数（活跃报名学员，去重）
          const activeEnrollments = await prisma.enrollment.findMany({
            where: {
              classId: { in: classIds },
              status: 'active',
              organizationId,
            },
            select: {
              studentId: true,
            },
          });
          const uniqueStudentIds = [...new Set(activeEnrollments.map((e) => e.studentId))];
          const studentCount = uniqueStudentIds.length;

          // 3. 学员出勤率
          // 获取该教练班级的所有排课（已开始的）
          const schedules = await prisma.schedule.findMany({
            where: {
              classId: { in: classIds },
              startTime: { lte: new Date() },
            },
            select: {
              id: true,
            },
          });
          const scheduleIds = schedules.map((s) => s.id);

          // 使用已获取的学员ID
          const studentIds = uniqueStudentIds;

          // 计算总出勤记录数和实际出勤数
          const totalAttendanceRecords = await prisma.attendance.count({
            where: {
              classId: { in: classIds },
              scheduleId: { in: scheduleIds },
            },
          });

          const actualAttendance = await prisma.attendance.count({
            where: {
              classId: { in: classIds },
              scheduleId: { in: scheduleIds },
              status: { in: ['present', 'late'] },
            },
          });

          const attendanceRate = totalAttendanceRecords > 0
            ? Math.round((actualAttendance / totalAttendanceRecords) * 100 * 100) / 100
            : 0;

          // 4. 基本盘人数（该教练班级的活跃学员数，简化处理）
          const baseCount = studentCount;

          // 5. 基本盘人数变化（需要对比上一期，这里简化处理，设为0）
          const baseCountChange = 0;

          // 6. 个人新招数（该教练班级的新报名学员数，最近30天）
          const thirtyDaysAgo = new Date();
          thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
          const newEnrollments = await prisma.enrollment.findMany({
            where: {
              classId: { in: classIds },
              enrolledAt: { gte: thirtyDaysAgo },
              status: 'active',
              organizationId,
            },
            select: {
              studentId: true,
            },
          });
          const newRecruits = [...new Set(newEnrollments.map((e) => e.studentId))].length;

          // 7. 续费率（需要计算有多次报名的学员比例，简化处理）
          // 获取该教练班级的学员，检查是否有续费记录
          const renewalStudents = await prisma.enrollment.groupBy({
            by: ['studentId'],
            where: {
              classId: { in: classIds },
              organizationId,
            },
            _count: {
              id: true,
            },
          });
          const renewalCount = renewalStudents.filter((s) => s._count.id > 1).length;
          const renewalRate = studentCount > 0
            ? Math.round((renewalCount / studentCount) * 100 * 100) / 100
            : 0;

          // 8. 成单金额（该教练班级的缴费总额）
          const payments = await prisma.payment.findMany({
            where: {
              enrollment: {
                classId: { in: classIds },
              },
              organizationId,
            },
            select: {
              amount: true,
            },
          });
          const totalOrderAmount = payments.reduce((sum, p) => sum + Number(p.amount), 0);

          // 9. 课消金额（根据出勤记录计算，假设每次出勤对应一定金额）
          // 简化处理：课消金额 = 实际出勤数 * 课单价（假设100元/次）
          const lessonPrice = 100; // 可以根据实际情况调整
          const consumptionAmount = actualAttendance * lessonPrice;

          return {
            teacherId: teacher.id,
            teacherName: teacher.name,
            classCount,
            studentCount,
            attendanceRate,
            baseCount,
            baseCountChange,
            newRecruits,
            renewalRate,
            totalOrderAmount,
            consumptionAmount,
          };
        })
      );

      sendSuccess(res, teachersWithStats);
    } catch (error) {
      next(error);
    }
  },

  exportTeachersStatistics: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const organizationId = req.body.organizationId;

      // 获取所有教练统计数据（复用getTeachersStatistics的逻辑）
      const teachers = await prisma.user.findMany({
        where: {
          organizationId,
          role: 'teacher',
          isActive: true,
        },
        select: {
          id: true,
          name: true,
        },
      });

      // 为每个教练计算统计数据（简化版本，直接使用之前的逻辑）
      const teachersWithStats = await Promise.all(
        teachers.map(async (teacher) => {
          const classes = await prisma.class.findMany({
            where: {
              teacherId: teacher.id,
              status: 'active',
              organizationId,
            },
            select: { id: true },
          });
          const classIds = classes.map((c) => c.id);

          const activeEnrollments = await prisma.enrollment.findMany({
            where: {
              classId: { in: classIds },
              status: 'active',
              organizationId,
            },
            select: { studentId: true },
          });
          const uniqueStudentIds = [...new Set(activeEnrollments.map((e) => e.studentId))];
          const studentCount = uniqueStudentIds.length;

          const schedules = await prisma.schedule.findMany({
            where: {
              classId: { in: classIds },
              startTime: { lte: new Date() },
            },
            select: { id: true },
          });
          const scheduleIds = schedules.map((s) => s.id);

          const totalAttendanceRecords = await prisma.attendance.count({
            where: {
              classId: { in: classIds },
              scheduleId: { in: scheduleIds },
            },
          });

          const actualAttendance = await prisma.attendance.count({
            where: {
              classId: { in: classIds },
              scheduleId: { in: scheduleIds },
              status: { in: ['present', 'late'] },
            },
          });

          const attendanceRate = totalAttendanceRecords > 0
            ? Math.round((actualAttendance / totalAttendanceRecords) * 100 * 100) / 100
            : 0;

          const baseCount = studentCount;
          const baseCountChange = 0;

          const thirtyDaysAgo = new Date();
          thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
          const newEnrollments = await prisma.enrollment.findMany({
            where: {
              classId: { in: classIds },
              enrolledAt: { gte: thirtyDaysAgo },
              status: 'active',
              organizationId,
            },
            select: { studentId: true },
          });
          const newRecruits = [...new Set(newEnrollments.map((e) => e.studentId))].length;

          const renewalStudents = await prisma.enrollment.groupBy({
            by: ['studentId'],
            where: {
              classId: { in: classIds },
              organizationId,
            },
            _count: { id: true },
          });
          const renewalCount = renewalStudents.filter((s) => s._count.id > 1).length;
          const renewalRate = studentCount > 0
            ? Math.round((renewalCount / studentCount) * 100 * 100) / 100
            : 0;

          const payments = await prisma.payment.findMany({
            where: {
              enrollment: {
                classId: { in: classIds },
              },
              organizationId,
            },
            select: { amount: true },
          });
          const totalOrderAmount = payments.reduce((sum, p) => sum + Number(p.amount), 0);

          const lessonPrice = 100;
          const consumptionAmount = actualAttendance * lessonPrice;

          return {
            教练员姓名: teacher.name,
            负责班级数: classes.length,
            负责学员数: studentCount,
            学员出勤率: `${attendanceRate}%`,
            基本盘人数: baseCount,
            基本盘人数变化: baseCountChange === 0 ? '-' : baseCountChange > 0 ? `+${baseCountChange}` : `${baseCountChange}`,
            个人新招数: newRecruits,
            续费率: `${renewalRate}%`,
            成单金额: totalOrderAmount.toFixed(2),
            课消金额: consumptionAmount.toFixed(2),
          };
        })
      );

      // 转换为Excel
      const worksheet = XLSX.utils.json_to_sheet(teachersWithStats);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, '教练统计数据');

      const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename=teachers_statistics_${Date.now()}.xlsx`);
      res.send(buffer);
    } catch (error) {
      next(error);
    }
  },

  getTeachersSalesData: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const organizationId = req.body.organizationId;

      // 获取所有教练
      const teachers = await prisma.user.findMany({
        where: {
          organizationId,
          role: 'teacher',
          isActive: true,
        },
        select: {
          id: true,
          name: true,
        },
      });

      // 为每个教练计算销售数据
      const teachersWithSalesData = await Promise.all(
        teachers.map(async (teacher) => {
          // 获取该教练负责的所有班级ID
          const classes = await prisma.class.findMany({
            where: {
              teacherId: teacher.id,
              status: 'active',
              organizationId,
            },
            select: {
              id: true,
            },
          });
          const classIds = classes.map((c) => c.id);

          // 1. 添加数：该教练负责班级的新增学员数（去重）
          const addedStudents = await prisma.enrollment.findMany({
            where: {
              classId: { in: classIds },
              organizationId,
            },
            select: {
              studentId: true,
            },
          });
          const addedCount = [...new Set(addedStudents.map((e) => e.studentId))].length;

          // 2. 邀约数：暂时设为0（如果没有专门的邀约表）
          // 可以基于体验课或其他逻辑来计算，这里先设为0
          const invitationCount = 0;

          // 3. 到场数：该教练负责班级的出勤记录数
          const schedules = await prisma.schedule.findMany({
            where: {
              classId: { in: classIds },
              startTime: { lte: new Date() },
            },
            select: {
              id: true,
            },
          });
          const scheduleIds = schedules.map((s) => s.id);

          const attendanceCount = await prisma.attendance.count({
            where: {
              classId: { in: classIds },
              scheduleId: { in: scheduleIds },
              status: { in: ['present', 'late'] },
            },
          });

          // 4. 成单数：该教练负责班级的支付记录数
          const orderCount = await prisma.payment.count({
            where: {
              enrollment: {
                classId: { in: classIds },
              },
              organizationId,
            },
          });

          // 5. 成单金额：该教练负责班级的支付总金额
          const payments = await prisma.payment.findMany({
            where: {
              enrollment: {
                classId: { in: classIds },
              },
              organizationId,
            },
            select: {
              amount: true,
            },
          });
          const orderAmount = payments.reduce((sum, p) => sum + Number(p.amount), 0);

          return {
            teacherId: teacher.id,
            teacherName: teacher.name,
            addedCount,
            invitationCount,
            attendanceCount,
            orderCount,
            orderAmount,
          };
        })
      );

      sendSuccess(res, teachersWithSalesData);
    } catch (error) {
      next(error);
    }
  },

  exportTeachersSalesData: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const organizationId = req.body.organizationId;

      // 获取所有教练销售数据（复用getTeachersSalesData的逻辑）
      const teachers = await prisma.user.findMany({
        where: {
          organizationId,
          role: 'teacher',
          isActive: true,
        },
        select: {
          id: true,
          name: true,
        },
      });

      const teachersWithSalesData = await Promise.all(
        teachers.map(async (teacher) => {
          const classes = await prisma.class.findMany({
            where: {
              teacherId: teacher.id,
              status: 'active',
              organizationId,
            },
            select: { id: true },
          });
          const classIds = classes.map((c) => c.id);

          const addedStudents = await prisma.enrollment.findMany({
            where: {
              classId: { in: classIds },
              organizationId,
            },
            select: { studentId: true },
          });
          const addedCount = [...new Set(addedStudents.map((e) => e.studentId))].length;

          const invitationCount = 0;

          const schedules = await prisma.schedule.findMany({
            where: {
              classId: { in: classIds },
              startTime: { lte: new Date() },
            },
            select: { id: true },
          });
          const scheduleIds = schedules.map((s) => s.id);

          const attendanceCount = await prisma.attendance.count({
            where: {
              classId: { in: classIds },
              scheduleId: { in: scheduleIds },
              status: { in: ['present', 'late'] },
            },
          });

          const orderCount = await prisma.payment.count({
            where: {
              enrollment: {
                classId: { in: classIds },
              },
              organizationId,
            },
          });

          const payments = await prisma.payment.findMany({
            where: {
              enrollment: {
                classId: { in: classIds },
              },
              organizationId,
            },
            select: { amount: true },
          });
          const orderAmount = payments.reduce((sum, p) => sum + Number(p.amount), 0);

          return {
            销售姓名: teacher.name,
            添加数: addedCount,
            邀约数: invitationCount,
            到场数: attendanceCount,
            成单数: orderCount,
            成单金额: orderAmount.toFixed(2),
          };
        })
      );

      const worksheet = XLSX.utils.json_to_sheet(teachersWithSalesData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, '销售数据');

      const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename=销售数据_${new Date().getTime()}.xlsx`);
      res.send(buffer);
    } catch (error) {
      next(error);
    }
  },
};

