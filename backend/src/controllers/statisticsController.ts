import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import { ApiError } from '../middleware/errorHandler';
import { sendSuccess } from '../utils/response';
import prisma from '../config/database';

export const statisticsController = {
  getStudentStatistics: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const organizationId = req.body.organizationId;
      const startDate = req.query.startDate as string;
      const endDate = req.query.endDate as string;

      const where: any = { organizationId };
      const dateWhere: any = {};
      if (startDate) {
        dateWhere.gte = new Date(startDate);
      }
      if (endDate) {
        dateWhere.lte = new Date(endDate);
      }

      const [total, active, inactive, graduated, newStudents] = await Promise.all([
        prisma.student.count({ where }),
        prisma.student.count({ where: { ...where, status: 'active' } }),
        prisma.student.count({ where: { ...where, status: 'inactive' } }),
        prisma.student.count({ where: { ...where, status: 'graduated' } }),
        prisma.student.count({
          where: {
            ...where,
            createdAt: dateWhere,
          },
        }),
      ]);

      // 流失率计算（需要定义时间范围）
      const churnRate = total > 0 ? (inactive / total) * 100 : 0;

      sendSuccess(res, {
        total,
        active,
        inactive,
        graduated,
        newStudents,
        churnRate: Math.round(churnRate * 100) / 100,
      });
    } catch (error) {
      next(error);
    }
  },

  getAttendanceStatistics: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const organizationId = req.body.organizationId;
      const classId = req.query.classId as string;
      const startDate = req.query.startDate as string;
      const endDate = req.query.endDate as string;

      const where: any = { organizationId };
      if (classId) {
        where.classId = classId;
      }
      if (startDate || endDate) {
        where.checkInTime = {};
        if (startDate) {
          where.checkInTime.gte = new Date(startDate);
        }
        if (endDate) {
          where.checkInTime.lte = new Date(endDate);
        }
      }

      const [total, present, absent, late, leave] = await Promise.all([
        prisma.attendance.count({ where }),
        prisma.attendance.count({ where: { ...where, status: 'present' } }),
        prisma.attendance.count({ where: { ...where, status: 'absent' } }),
        prisma.attendance.count({ where: { ...where, status: 'late' } }),
        prisma.attendance.count({ where: { ...where, status: 'leave' } }),
      ]);

      const attendanceRate = total > 0 ? ((present + late) / total) * 100 : 0;

      sendSuccess(res, {
        total,
        present,
        absent,
        late,
        leave,
        attendanceRate: Math.round(attendanceRate * 100) / 100,
      });
    } catch (error) {
      next(error);
    }
  },

  getCourseStatistics: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const organizationId = req.body.organizationId;
      const startDate = req.query.startDate as string;
      const endDate = req.query.endDate as string;

      const scheduleWhere: any = { organizationId };
      if (startDate || endDate) {
        scheduleWhere.startTime = {};
        if (startDate) {
          scheduleWhere.startTime.gte = new Date(startDate);
        }
        if (endDate) {
          scheduleWhere.startTime.lte = new Date(endDate);
        }
      }

      const [totalClasses, totalSchedules, completedSchedules, cancelledSchedules] = await Promise.all([
        prisma.class.count({ where: { organizationId } }),
        prisma.schedule.count({ where: scheduleWhere }),
        prisma.schedule.count({ where: { ...scheduleWhere, status: 'completed' } }),
        prisma.schedule.count({ where: { ...scheduleWhere, status: 'cancelled' } }),
      ]);

      const completionRate = totalSchedules > 0 ? (completedSchedules / totalSchedules) * 100 : 0;

      sendSuccess(res, {
        totalClasses,
        totalSchedules,
        completedSchedules,
        cancelledSchedules,
        completionRate: Math.round(completionRate * 100) / 100,
      });
    } catch (error) {
      next(error);
    }
  },

  getFinanceStatistics: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const organizationId = req.body.organizationId;
      const startDate = req.query.startDate as string;
      const endDate = req.query.endDate as string;

      const where: any = { organizationId };
      if (startDate || endDate) {
        where.paidAt = {};
        if (startDate) {
          where.paidAt.gte = new Date(startDate);
        }
        if (endDate) {
          where.paidAt.lte = new Date(endDate);
        }
      }

      const payments = await prisma.payment.findMany({
        where,
        select: {
          amount: true,
          paymentType: true,
          paidAt: true,
        },
      });

      const totalAmount = payments.reduce((sum, p) => sum + Number(p.amount), 0);
      const tuitionAmount = payments
        .filter((p) => p.paymentType === 'tuition')
        .reduce((sum, p) => sum + Number(p.amount), 0);
      const materialAmount = payments
        .filter((p) => p.paymentType === 'material')
        .reduce((sum, p) => sum + Number(p.amount), 0);

      // 续费率计算（需要定义时间范围）
      const enrollments = await prisma.enrollment.findMany({
        where: { organizationId },
        include: {
          payments: true,
        },
      });

      const renewalRate = enrollments.length > 0
        ? (enrollments.filter((e) => e.payments.length > 1).length / enrollments.length) * 100
        : 0;

      sendSuccess(res, {
        totalAmount,
        tuitionAmount,
        materialAmount,
        totalPayments: payments.length,
        renewalRate: Math.round(renewalRate * 100) / 100,
      });
    } catch (error) {
      next(error);
    }
  },

  getDashboard: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const organizationId = req.body.organizationId;

      // 获取今日数据
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const [
        totalStudents,
        totalClasses,
        todaySchedules,
        todayAttendances,
        recentEnrollments,
        recentPayments,
      ] = await Promise.all([
        prisma.student.count({ where: { organizationId, status: 'active' } }),
        prisma.class.count({ where: { organizationId, status: 'active' } }),
        prisma.schedule.count({
          where: {
            organizationId,
            startTime: {
              gte: today,
              lt: tomorrow,
            },
          },
        }),
        prisma.attendance.count({
          where: {
            organizationId,
            checkInTime: {
              gte: today,
              lt: tomorrow,
            },
          },
        }),
        prisma.enrollment.findMany({
          where: { organizationId },
          take: 5,
          orderBy: { enrolledAt: 'desc' },
          include: {
            student: {
              select: {
                name: true,
              },
            },
            class: {
              select: {
                name: true,
              },
            },
          },
        }),
        prisma.payment.findMany({
          where: { organizationId },
          take: 5,
          orderBy: { paidAt: 'desc' },
          include: {
            student: {
              select: {
                name: true,
              },
            },
          },
        }),
      ]);

      sendSuccess(res, {
        overview: {
          totalStudents,
          totalClasses,
          todaySchedules,
          todayAttendances,
        },
        recentEnrollments,
        recentPayments,
      });
    } catch (error) {
      next(error);
    }
  },

  getWeeklySummary: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const organizationId = req.body.organizationId;
      const startDate = req.query.startDate as string || new Date().toISOString().split('T')[0];
      const endDate = req.query.endDate as string || new Date().toISOString().split('T')[0];
      const useMockData = req.query.useMockData === 'true'; // 允许使用虚拟数据

      const start = new Date(startDate);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);

      // 如果启用虚拟数据，返回演示数据
      if (useMockData) {
        const lessonPrice = 100;
        const mockTotalAttendance = 245; // 本周出勤人次
        const mockAvgAttendanceRate = 78; // 平均出勤率
        const mockRosterCount = 45; // 花名册人数
        const mockConfirmedRevenue = mockTotalAttendance * lessonPrice;
        
        // 上周虚拟数据
        const lastWeekTotalAttendance = 220;
        const lastWeekAvgAttendanceRate = 75;
        const lastWeekRosterCount = 42;
        const lastWeekConfirmedRevenue = lastWeekTotalAttendance * lessonPrice;

        // 虚拟每日数据
        const mockDailyData = [];
        const currentDate = new Date(start);
        const dailyAttendances = [32, 35, 38, 40, 42, 35, 25]; // 每天出勤人次
        const dailyRates = [72, 76, 80, 82, 84, 76, 58]; // 每天出勤率
        let dayIndex = 0;
        
        while (currentDate <= end && dayIndex < dailyAttendances.length) {
          mockDailyData.push({
            date: currentDate.toLocaleDateString('zh-CN'),
            newStudents: Math.floor(Math.random() * 3),
            newEnrollments: Math.floor(Math.random() * 2),
            attendanceCount: dailyAttendances[dayIndex],
            attendanceRate: dailyRates[dayIndex],
            revenue: Math.floor(Math.random() * 5000) + 3000,
          });
          currentDate.setDate(currentDate.getDate() + 1);
          dayIndex++;
        }

        // 虚拟教练员分析数据
        const mockLowAttendanceTeachers = [
          { name: '张教练', attendanceRate: 55 },
          { name: '李教练', attendanceRate: 58 },
        ];
        const mockHighLossTeachers = [
          { name: '王教练', lostStudents: 3 },
          { name: '赵教练', lostStudents: 4 },
        ];

        return sendSuccess(res, {
          totalNewStudents: 5,
          totalNewEnrollments: 8,
          totalAttendance: mockTotalAttendance,
          avgAttendanceRate: mockAvgAttendanceRate,
          totalRevenue: 12500,
          newClasses: 2,
          activeClasses: 12,
          totalSchedules: 35,
          dailyData: mockDailyData,
          rosterCount: mockRosterCount,
          confirmedRevenue: mockConfirmedRevenue,
          // 过程指标
          poolAddedCount: 12, // 鱼池添加数
          invitationCount: 18, // 邀约数
          attendanceCount: 15, // 到场数
          // 续费情况
          renewalTotalAmount: 8500, // 续费总金额
          renewalOrderCount: 6, // 续费单数
          renewalAvgPrice: 1416.67, // 续费客单价
          renewalRate: 35.5, // 续费率
          // 工作建议数据
          workSuggestions: {
            module1: {
              targets: {
                newStudents: 5,
                newEnrollments: 8,
                totalRevenue: 10000,
                poolAddedCount: 15,
              },
              completion: {
                newStudents: 100, // 5/5 = 100%
                newEnrollments: 100, // 8/8 = 100%
                totalRevenue: 125, // 12500/10000 = 125%
                poolAddedCount: 80, // 12/15 = 80%
              },
              nextWeekTargets: {
                newStudents: 6,
                newEnrollments: 9,
                totalRevenue: 12000,
                poolAddedCount: 18,
              },
            },
            module2: {
              noShowRate: 25, // 爽约率 = (邀约数 - 到场数) / 邀约数
              conversionRate: 44.4, // 成单率 = 新增报名 / 到场数
              issues: [
                '爽约率较高（25%），需要加强邀约后的跟进和提醒工作。',
                '成单率44.4%，建议提升销售转化技巧和客户沟通能力。',
                '到场人数较少，建议加强地推和电销工作安排，提升工作效率。',
                '上一周的回访工作需重点关注，及时跟进潜在客户。',
              ],
            },
            module3: [
              {
                name: '销售A',
                resultData: { newEnrollments: 2, totalRevenue: 3000 },
                processData: { poolAddedCount: 3, invitationCount: 5, attendanceCount: 3 },
                suggestions: '结果数据较差，但过程数据显示邀约数5人，到场3人，成单率较低。建议：1. 提升销售话术和转化技巧；2. 加强客户需求分析；3. 提供更个性化的方案。',
              },
              {
                name: '销售B',
                resultData: { newEnrollments: 1, totalRevenue: 1500 },
                processData: { poolAddedCount: 2, invitationCount: 3, attendanceCount: 1 },
                suggestions: '添加人数和邀约数较少，建议：1. 加强地推工作，扩大客户池；2. 提升电销效率；3. 增加邀约数量。',
              },
            ],
          },
          lastWeek: {
            totalAttendance: lastWeekTotalAttendance,
            avgAttendanceRate: lastWeekAvgAttendanceRate,
            rosterCount: lastWeekRosterCount,
            confirmedRevenue: lastWeekConfirmedRevenue,
          },
          teacherAnalysis: {
            lowAttendanceTeachers: mockLowAttendanceTeachers,
            highLossTeachers: mockHighLossTeachers,
          },
          keyClasses: {
            unopenedClasses: [
              { name: '初级班A', code: 'A001', reason: '未开班' },
              { name: '中级班B', code: 'B002', reason: '未开班' },
              { name: '预备班G', code: 'G007', reason: '未开班' },
            ],
            lowAttendanceClasses: [
              { name: '高级班C', code: 'C003', attendanceRate: 45, reason: '出勤率低于50%' },
              { name: '基础班D', code: 'D004', attendanceRate: 38, reason: '出勤率低于50%' },
              { name: '强化班H', code: 'H008', attendanceRate: 42, reason: '出勤率低于50%' },
            ],
            reducedStudentClasses: [
              { name: '进阶班E', code: 'E005', reduction: 3, reason: '人数减少' },
              { name: '提高班F', code: 'F006', reduction: 2, reason: '人数减少' },
              { name: '精英班I', code: 'I009', reduction: 4, reason: '人数减少' },
              { name: '特训班J', code: 'J010', reduction: 1, reason: '人数减少' },
            ],
          },
        });
      }

      // 获取新增学员
      const totalNewStudents = await prisma.student.count({
        where: {
          organizationId,
          createdAt: {
            gte: start,
            lte: end,
          },
        },
      });

      // 获取新增报名
      const totalNewEnrollments = await prisma.enrollment.count({
        where: {
          organizationId,
          enrolledAt: {
            gte: start,
            lte: end,
          },
        },
      });

      // 获取出勤数据
      const attendances = await prisma.attendance.findMany({
        where: {
          organizationId,
          checkInTime: {
            gte: start,
            lte: end,
          },
          status: {
            in: ['present', 'late'],
          },
        },
      });

      const totalAttendance = attendances.length;

      // 获取排课数据
      const schedules = await prisma.schedule.findMany({
        where: {
          organizationId,
          startTime: {
            gte: start,
            lte: end,
          },
        },
        include: {
          attendances: true,
        },
      });

      const totalSchedules = schedules.length;
      const avgAttendanceRate = totalSchedules > 0
        ? Math.round((totalAttendance / (totalSchedules * 10)) * 100) // 假设每个课程平均10个学员
        : 0;

      // 获取收入数据
      const payments = await prisma.payment.findMany({
        where: {
          organizationId,
          paidAt: {
            gte: start,
            lte: end,
          },
        },
      });

      const totalRevenue = payments.reduce((sum, p) => sum + Number(p.amount), 0);

      // 获取新增班级
      const newClasses = await prisma.class.count({
        where: {
          organizationId,
          createdAt: {
            gte: start,
            lte: end,
          },
        },
      });

      // 活跃班级数
      const activeClasses = await prisma.class.count({
        where: {
          organizationId,
          status: 'active',
        },
      });

      // 每日明细数据
      const dailyData = [];
      const currentDate = new Date(start);
      while (currentDate <= end) {
        const dayStart = new Date(currentDate);
        dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(currentDate);
        dayEnd.setHours(23, 59, 59, 999);

        const dayNewStudents = await prisma.student.count({
          where: {
            organizationId,
            createdAt: {
              gte: dayStart,
              lte: dayEnd,
            },
          },
        });

        const dayNewEnrollments = await prisma.enrollment.count({
          where: {
            organizationId,
            enrolledAt: {
              gte: dayStart,
              lte: dayEnd,
            },
          },
        });

        const dayAttendances = await prisma.attendance.count({
          where: {
            organizationId,
            checkInTime: {
              gte: dayStart,
              lte: dayEnd,
            },
            status: {
              in: ['present', 'late'],
            },
          },
        });

        const daySchedules = await prisma.schedule.count({
          where: {
            organizationId,
            startTime: {
              gte: dayStart,
              lte: dayEnd,
            },
          },
        });

        const dayRevenue = await prisma.payment.findMany({
          where: {
            organizationId,
            paidAt: {
              gte: dayStart,
              lte: dayEnd,
            },
          },
        }).then((p) => p.reduce((sum, payment) => sum + Number(payment.amount), 0));

        const dayAttendanceRate = daySchedules > 0
          ? Math.round((dayAttendances / (daySchedules * 10)) * 100)
          : 0;

        dailyData.push({
          date: currentDate.toLocaleDateString('zh-CN'),
          newStudents: dayNewStudents,
          newEnrollments: dayNewEnrollments,
          attendanceCount: dayAttendances,
          attendanceRate: dayAttendanceRate,
          revenue: dayRevenue,
        });

        currentDate.setDate(currentDate.getDate() + 1);
      }

      // 获取花名册人数（活跃学员数，有活跃报名的学员）
      const activeEnrollments = await prisma.enrollment.findMany({
        where: {
          organizationId,
          status: 'active',
        },
        select: {
          studentId: true,
        },
      });
      const rosterCount = new Set(activeEnrollments.map(e => e.studentId)).size;

      // 计算上周的数据用于对比
      const weekDuration = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
      const lastWeekStart = new Date(start);
      lastWeekStart.setDate(lastWeekStart.getDate() - weekDuration);
      const lastWeekEnd = new Date(start);
      lastWeekEnd.setDate(lastWeekEnd.getDate() - 1);
      lastWeekEnd.setHours(23, 59, 59, 999);

      // 获取上周出勤数据
      const lastWeekAttendances = await prisma.attendance.findMany({
        where: {
          organizationId,
          checkInTime: {
            gte: lastWeekStart,
            lte: lastWeekEnd,
          },
          status: {
            in: ['present', 'late'],
          },
        },
      });
      const lastWeekTotalAttendance = lastWeekAttendances.length;

      // 获取上周排课数据
      const lastWeekSchedules = await prisma.schedule.findMany({
        where: {
          organizationId,
          startTime: {
            gte: lastWeekStart,
            lte: lastWeekEnd,
          },
        },
      });
      const lastWeekTotalSchedules = lastWeekSchedules.length;
      const lastWeekAvgAttendanceRate = lastWeekTotalSchedules > 0
        ? Math.round((lastWeekTotalAttendance / (lastWeekTotalSchedules * 10)) * 100)
        : 0;

      // 获取上周的花名册人数
      const lastWeekActiveEnrollments = await prisma.enrollment.findMany({
        where: {
          organizationId,
          status: 'active',
          enrolledAt: {
            lte: lastWeekEnd,
          },
        },
        select: {
          studentId: true,
        },
      });
      const lastWeekRosterCount = new Set(lastWeekActiveEnrollments.map(e => e.studentId)).size;

      // 计算上周确认收入
      const lessonPrice = 100;
      const lastWeekConfirmedRevenue = lastWeekTotalAttendance * lessonPrice;

      // 教练员工作分析
      // 1. 找出低出勤教练员（负责学员出勤率低于60%）
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

      const teacherAnalysis = await Promise.all(
        teachers.map(async (teacher) => {
          // 获取该教练负责的所有班级
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

          if (classIds.length === 0) {
            return null;
          }

          // 获取该教练负责的学员（活跃报名）
          const enrollments = await prisma.enrollment.findMany({
            where: {
              classId: { in: classIds },
              status: 'active',
              organizationId,
            },
            select: {
              studentId: true,
            },
          });
          const studentIds = [...new Set(enrollments.map((e) => e.studentId))];

          if (studentIds.length === 0) {
            return null;
          }

          // 计算该教练负责学员的出勤率（本周）
          const teacherSchedules = await prisma.schedule.findMany({
            where: {
              classId: { in: classIds },
              startTime: {
                gte: start,
                lte: end,
              },
            },
            select: {
              id: true,
            },
          });
          const scheduleIds = teacherSchedules.map((s) => s.id);

          const teacherAttendances = await prisma.attendance.count({
            where: {
              classId: { in: classIds },
              scheduleId: { in: scheduleIds },
              studentId: { in: studentIds },
              status: { in: ['present', 'late'] },
            },
          });

          const totalPossibleAttendances = scheduleIds.length * studentIds.length;
          const teacherAttendanceRate = totalPossibleAttendances > 0
            ? Math.round((teacherAttendances / totalPossibleAttendances) * 100)
            : 0;

          // 计算该教练负责学员的流失数（本周变为inactive的学员）
          const lostStudents = await prisma.student.count({
            where: {
              id: { in: studentIds },
              organizationId,
              status: 'inactive',
              updatedAt: {
                gte: start,
                lte: end,
              },
            },
          });

          return {
            teacherId: teacher.id,
            teacherName: teacher.name,
            attendanceRate: teacherAttendanceRate,
            lostStudents,
            studentCount: studentIds.length,
          };
        })
      );

      const validTeacherAnalysis = teacherAnalysis.filter((t) => t !== null);
      
      // 低出勤教练员（出勤率低于60%）
      const lowAttendanceTeachers = validTeacherAnalysis
        .filter((t: any) => t.attendanceRate < 60)
        .map((t: any) => ({
          name: t.teacherName,
          attendanceRate: t.attendanceRate,
        }));

      // 活跃学员流失多教练员（流失大于2）
      const highLossTeachers = validTeacherAnalysis
        .filter((t: any) => t.lostStudents > 2)
        .map((t: any) => ({
          name: t.teacherName,
          lostStudents: t.lostStudents,
        }));

      // 需重点关注的班级分析
      // 1. 未开班的班级（本周没有排课的活跃班级）
      const allActiveClasses = await prisma.class.findMany({
        where: {
          organizationId,
          status: 'active',
        },
        select: {
          id: true,
          name: true,
          code: true,
        },
      });

      const classesWithSchedules = await prisma.schedule.findMany({
        where: {
          organizationId,
          startTime: {
            gte: start,
            lte: end,
          },
        },
        select: {
          classId: true,
        },
        distinct: ['classId'],
      });
      const classIdsWithSchedules = new Set(classesWithSchedules.map((s) => s.classId));

      // 未开班的班级
      const unopenedClasses = allActiveClasses
        .filter((c) => !classIdsWithSchedules.has(c.id))
        .map((c) => ({
          name: c.name,
          code: c.code,
          reason: '未开班',
        }));

      // 2. 出勤率低于50%的班级
      const lowAttendanceClasses = await Promise.all(
        Array.from(classIdsWithSchedules).map(async (classId) => {
          const classData = await prisma.class.findUnique({
            where: { id: classId },
            select: {
              id: true,
              name: true,
              code: true,
              enrollments: {
                where: { status: 'active' },
                select: { studentId: true },
              },
            },
          });

          if (!classData || classData.enrollments.length === 0) {
            return null;
          }

          const studentIds = classData.enrollments.map((e) => e.studentId);
          const classSchedules = await prisma.schedule.findMany({
            where: {
              classId,
              startTime: {
                gte: start,
                lte: end,
              },
            },
            select: { id: true },
          });
          const scheduleIds = classSchedules.map((s) => s.id);

          if (scheduleIds.length === 0) {
            return null;
          }

          const attendances = await prisma.attendance.count({
            where: {
              classId,
              scheduleId: { in: scheduleIds },
              studentId: { in: studentIds },
              status: { in: ['present', 'late'] },
            },
          });

          const totalPossibleAttendances = scheduleIds.length * studentIds.length;
          const attendanceRate = totalPossibleAttendances > 0
            ? Math.round((attendances / totalPossibleAttendances) * 100)
            : 0;

          if (attendanceRate < 50) {
            return {
              name: classData.name,
              code: classData.code,
              attendanceRate,
              reason: '出勤率低于50%',
            };
          }

          return null;
        })
      );

      const filteredLowAttendanceClasses = lowAttendanceClasses.filter((c) => c !== null);

      // 3. 人数减少的班级（与上周相比，学员人数减少的班级）
      // 重用之前计算的 weekDuration, lastWeekStart, lastWeekEnd

      // 获取上周各班级的学员数
      const lastWeekEnrollments = await prisma.enrollment.findMany({
        where: {
          organizationId,
          status: 'active',
          enrolledAt: {
            lte: lastWeekEnd,
          },
        },
        select: {
          classId: true,
          studentId: true,
        },
      });

      const lastWeekClassStudentCount = new Map<string, Set<string>>();
      lastWeekEnrollments.forEach((enrollment) => {
        if (!lastWeekClassStudentCount.has(enrollment.classId)) {
          lastWeekClassStudentCount.set(enrollment.classId, new Set());
        }
        lastWeekClassStudentCount.get(enrollment.classId)!.add(enrollment.studentId);
      });

      // 获取本周各班级的学员数
      const currentWeekEnrollments = await prisma.enrollment.findMany({
        where: {
          organizationId,
          status: 'active',
        },
        select: {
          classId: true,
          studentId: true,
        },
      });

      const currentWeekClassStudentCount = new Map<string, Set<string>>();
      currentWeekEnrollments.forEach((enrollment) => {
        if (!currentWeekClassStudentCount.has(enrollment.classId)) {
          currentWeekClassStudentCount.set(enrollment.classId, new Set());
        }
        currentWeekClassStudentCount.get(enrollment.classId)!.add(enrollment.studentId);
      });

      // 找出人数减少的班级
      const classesWithReducedStudents: any[] = [];
      const processedClassIds = new Set<string>();
      
      // 遍历当前有学员的班级
      for (const [classId, currentStudents] of currentWeekClassStudentCount.entries()) {
        processedClassIds.add(classId);
        const lastWeekStudents = lastWeekClassStudentCount.get(classId);
        if (lastWeekStudents && lastWeekStudents.size > currentStudents.size) {
          const reduction = lastWeekStudents.size - currentStudents.size;
          const classData = await prisma.class.findUnique({
            where: { id: classId },
            select: {
              name: true,
              code: true,
            },
          });
          if (classData) {
            classesWithReducedStudents.push({
              name: classData.name,
              code: classData.code,
              reduction,
              reason: '人数减少',
            });
          }
        }
      }

      // 也检查上周有学员但本周没有或减少的班级
      for (const [classId, lastWeekStudents] of lastWeekClassStudentCount.entries()) {
        if (!processedClassIds.has(classId) && lastWeekStudents.size > 0) {
          const currentStudents = currentWeekClassStudentCount.get(classId);
          if (!currentStudents || currentStudents.size < lastWeekStudents.size) {
            const reduction = lastWeekStudents.size - (currentStudents?.size || 0);
            const classData = await prisma.class.findUnique({
              where: { id: classId },
              select: {
                name: true,
                code: true,
              },
            });
            if (classData && reduction > 0) {
              classesWithReducedStudents.push({
                name: classData.name,
                code: classData.code,
                reduction,
                reason: '人数减少',
              });
            }
          }
        }
      }

      // 过程指标计算
      // 1. 鱼池添加数：本周新增学员数（可以理解为添加到营销池的人数）
      const poolAddedCount = totalNewStudents;

      // 2. 邀约数：暂时使用新增学员数 * 1.5 估算（实际应该从邀约表获取）
      // 如果有专门的邀约表，应该查询邀约记录数
      const invitationCount = Math.round(totalNewStudents * 1.5);

      // 3. 到场数：本周实际到场的学员数（去重）
      const attendanceRecords = await prisma.attendance.findMany({
        where: {
          organizationId,
          checkInTime: {
            gte: start,
            lte: end,
          },
          status: {
            in: ['present', 'late'],
          },
        },
        select: {
          studentId: true,
        },
      });
      const uniqueStudentIds = new Set(attendanceRecords.map((a) => a.studentId));
      const attendanceCount = uniqueStudentIds.size;

      // 续费情况汇总
      // 1. 找出有多次报名的学员（续费学员）
      const allEnrollments = await prisma.enrollment.findMany({
        where: {
          organizationId,
        },
        select: {
          studentId: true,
          enrolledAt: true,
        },
      });

      const studentEnrollmentCount = new Map<string, number>();
      const studentEnrollmentDates = new Map<string, Date[]>();
      allEnrollments.forEach((enrollment) => {
        const count = studentEnrollmentCount.get(enrollment.studentId) || 0;
        studentEnrollmentCount.set(enrollment.studentId, count + 1);
        if (!studentEnrollmentDates.has(enrollment.studentId)) {
          studentEnrollmentDates.set(enrollment.studentId, []);
        }
        studentEnrollmentDates.get(enrollment.studentId)!.push(enrollment.enrolledAt);
      });

      const renewalStudentIds = Array.from(studentEnrollmentCount.entries())
        .filter(([_, count]) => count > 1)
        .map(([studentId]) => studentId);

      // 2. 计算续费总金额和单数（本周内续费学员的支付）
      const renewalPayments = await prisma.payment.findMany({
        where: {
          organizationId,
          studentId: {
            in: renewalStudentIds,
          },
          paidAt: {
            gte: start,
            lte: end,
          },
        },
      });

      const renewalTotalAmount = renewalPayments.reduce((sum, p) => sum + Number(p.amount), 0);
      const renewalOrderCount = renewalPayments.length;
      const renewalAvgPrice = renewalOrderCount > 0 ? renewalTotalAmount / renewalOrderCount : 0;

      // 3. 计算续费率：续费学员数 / 当月5节课以内学员数
      // 首先获取当月（本周所在月份）的起始和结束时间
      const monthStart = new Date(start.getFullYear(), start.getMonth(), 1);
      const monthEnd = new Date(start.getFullYear(), start.getMonth() + 1, 0, 23, 59, 59, 999);

      // 获取当月所有活跃学员及其剩余课次（简化处理：使用活跃学员数）
      // 实际应该计算每个学员的剩余课次，但这里简化处理
      const monthActiveEnrollments = await prisma.enrollment.findMany({
        where: {
          organizationId,
          status: 'active',
          enrolledAt: {
            lte: monthEnd,
          },
        },
        select: {
          studentId: true,
        },
      });

      // 计算每个学员的剩余课次（简化：假设每个支付对应一定课次，每个出勤消耗1课次）
      const studentRemainingLessons = new Map<string, number>();
      
      // 获取所有学员的总购买课次（从支付记录推断，假设每100元=1课次，简化处理）
      const allStudentPayments = await prisma.payment.findMany({
        where: {
          organizationId,
          paidAt: {
            lte: monthEnd,
          },
        },
        select: {
          studentId: true,
          amount: true,
        },
      });

      allStudentPayments.forEach((payment) => {
        const currentLessons = studentRemainingLessons.get(payment.studentId) || 0;
        // 简化：假设每100元=1课次
        const lessonsFromPayment = Math.floor(Number(payment.amount) / 100);
        studentRemainingLessons.set(payment.studentId, currentLessons + lessonsFromPayment);
      });

      // 减去已消费的课次（出勤记录）
      const allAttendances = await prisma.attendance.findMany({
        where: {
          organizationId,
          checkInTime: {
            lte: monthEnd,
          },
          status: {
            in: ['present', 'late'],
          },
        },
        select: {
          studentId: true,
        },
      });

      allAttendances.forEach((attendance) => {
        const currentLessons = studentRemainingLessons.get(attendance.studentId) || 0;
        studentRemainingLessons.set(attendance.studentId, Math.max(0, currentLessons - 1));
      });

      // 找出剩余课次在5节以内的学员
      const studentsWithLowRemainingLessons = Array.from(studentRemainingLessons.entries())
        .filter(([_, remaining]) => remaining <= 5 && remaining > 0)
        .map(([studentId]) => studentId);

      // 续费率 = 本周续费学员数 / 当月5节课以内学员数
      // 本周续费学员数：本周内发生续费支付的学员数（去重）
      const renewalStudentIdsThisWeek = new Set(renewalPayments.map((p) => p.studentId));
      const renewalRate = studentsWithLowRemainingLessons.length > 0
        ? Math.round((renewalStudentIdsThisWeek.size / studentsWithLowRemainingLessons.length) * 100 * 100) / 100
        : 0;

      // 工作建议数据计算
      // 模块1：目标完成度分析
      // 设定本周目标（可以从配置或历史数据中获取，这里使用默认值）
      const weeklyTargets = {
        newStudents: 5,
        newEnrollments: 8,
        totalRevenue: 10000,
        poolAddedCount: 15,
      };

      const completion = {
        newStudents: weeklyTargets.newStudents > 0
          ? Math.round((totalNewStudents / weeklyTargets.newStudents) * 100)
          : 0,
        newEnrollments: weeklyTargets.newEnrollments > 0
          ? Math.round((totalNewEnrollments / weeklyTargets.newEnrollments) * 100)
          : 0,
        totalRevenue: weeklyTargets.totalRevenue > 0
          ? Math.round((totalRevenue / weeklyTargets.totalRevenue) * 100)
          : 0,
        poolAddedCount: weeklyTargets.poolAddedCount > 0
          ? Math.round((poolAddedCount / weeklyTargets.poolAddedCount) * 100)
          : 0,
      };

      // 根据完成度动态调整下周目标
      const nextWeekTargets = {
        newStudents: Math.max(3, Math.round(totalNewStudents * (completion.newStudents >= 100 ? 1.2 : 1.1))),
        newEnrollments: Math.max(5, Math.round(totalNewEnrollments * (completion.newEnrollments >= 100 ? 1.2 : 1.1))),
        totalRevenue: Math.max(8000, Math.round(totalRevenue * (completion.totalRevenue >= 100 ? 1.15 : 1.1))),
        poolAddedCount: Math.max(10, Math.round(poolAddedCount * (completion.poolAddedCount >= 100 ? 1.2 : 1.15))),
      };

      // 模块2：过程数据分析
      // 爽约率 = (邀约数 - 到场数) / 邀约数
      const noShowRate = invitationCount > 0
        ? Math.round(((invitationCount - attendanceCount) / invitationCount) * 100)
        : 0;

      // 成单率 = 新增报名 / 到场数
      const conversionRate = attendanceCount > 0
        ? Math.round((totalNewEnrollments / attendanceCount) * 100 * 10) / 10
        : 0;

      // 识别过程数据中的问题
      const processIssues: string[] = [];
      if (noShowRate > 20) {
        processIssues.push(`爽约率较高（${noShowRate}%），需要加强邀约后的跟进和提醒工作。`);
      }
      if (conversionRate < 50) {
        processIssues.push(`成单率较低（${conversionRate}%），建议提升销售转化技巧和客户沟通能力。`);
      }
      if (attendanceCount < 10) {
        processIssues.push('到场人数较少，建议加强地推和电销工作安排，提升工作效率。');
      }
      if (poolAddedCount < 10) {
        processIssues.push('添加人数较少，建议加强地推和电销工作，扩大客户池。');
      }
      processIssues.push('上一周的回访工作需重点关注，及时跟进潜在客户。');

      // 模块3：个人表现分析
      // 获取销售人员的个人数据
      const salesPersons = await prisma.user.findMany({
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

      const personalAnalysis = await Promise.all(
        salesPersons.map(async (sales) => {
          // 获取该销售负责的班级
          const classes = await prisma.class.findMany({
            where: {
              teacherId: sales.id,
              status: 'active',
              organizationId,
            },
            select: { id: true },
          });
          const classIds = classes.map((c) => c.id);

          // 计算该销售的结果数据
          const salesEnrollments = await prisma.enrollment.findMany({
            where: {
              classId: { in: classIds },
              enrolledAt: { gte: start, lte: end },
              organizationId,
            },
          });
          const salesNewEnrollments = salesEnrollments.length;

          const salesPayments = await prisma.payment.findMany({
            where: {
              enrollment: { classId: { in: classIds } },
              paidAt: { gte: start, lte: end },
              organizationId,
            },
          });
          const salesTotalRevenue = salesPayments.reduce((sum, p) => sum + Number(p.amount), 0);

          // 计算该销售的过程数据（简化处理）
          const salesNewStudents = await prisma.student.count({
            where: {
              organizationId,
              createdAt: { gte: start, lte: end },
              enrollments: {
                some: {
                  classId: { in: classIds },
                },
              },
            },
          });

          // 估算邀约数和到场数（简化处理）
          const salesInvitationCount = Math.round(salesNewStudents * 1.5);
          const salesAttendanceCount = Math.round(salesNewStudents * 0.8);

          // 判断结果数据是否较差
          const isPoorResult = salesNewEnrollments < 2 || salesTotalRevenue < 2000;

          if (isPoorResult) {
            const suggestions: string[] = [];
            if (salesInvitationCount < 3) {
              suggestions.push('添加人数和邀约数较少，建议加强地推工作，扩大客户池；提升电销效率；增加邀约数量。');
            } else if (salesAttendanceCount < salesInvitationCount * 0.6) {
              suggestions.push('邀约数较多但到场率较低，建议加强邀约后的跟进和提醒工作，提升到场率。');
            } else if (salesNewEnrollments < salesAttendanceCount * 0.5) {
              suggestions.push('到场数较多但成单率较低，建议提升销售话术和转化技巧；加强客户需求分析；提供更个性化的方案。');
            } else {
              suggestions.push('过程数据正常但结果数据较差，建议：1. 提升销售话术和转化技巧；2. 加强客户需求分析；3. 提供更个性化的方案。');
            }

            return {
              name: sales.name,
              resultData: {
                newEnrollments: salesNewEnrollments,
                totalRevenue: salesTotalRevenue,
              },
              processData: {
                poolAddedCount: salesNewStudents,
                invitationCount: salesInvitationCount,
                attendanceCount: salesAttendanceCount,
              },
              suggestions: suggestions.join(' '),
            };
          }
          return null;
        })
      );

      const poorPerformers = personalAnalysis.filter((p) => p !== null);

      sendSuccess(res, {
        totalNewStudents,
        totalNewEnrollments,
        totalAttendance,
        avgAttendanceRate,
        totalRevenue,
        newClasses,
        activeClasses,
        totalSchedules,
        dailyData,
        rosterCount,
        confirmedRevenue: totalAttendance * lessonPrice,
        // 过程指标
        poolAddedCount,
        invitationCount,
        attendanceCount,
        // 续费情况
        renewalTotalAmount,
        renewalOrderCount,
        renewalAvgPrice,
        renewalRate,
        // 工作建议数据
        workSuggestions: {
          module1: {
            targets: weeklyTargets,
            completion,
            nextWeekTargets,
          },
          module2: {
            noShowRate,
            conversionRate,
            issues: processIssues,
          },
          module3: poorPerformers,
        },
        // 上周对比数据
        lastWeek: {
          totalAttendance: lastWeekTotalAttendance,
          avgAttendanceRate: lastWeekAvgAttendanceRate,
          rosterCount: lastWeekRosterCount,
          confirmedRevenue: lastWeekConfirmedRevenue,
        },
        // 教练员工作分析
          teacherAnalysis: {
            lowAttendanceTeachers,
            highLossTeachers,
          },
          // 需重点关注的班级
          keyClasses: {
            unopenedClasses,
            lowAttendanceClasses: filteredLowAttendanceClasses,
            reducedStudentClasses: classesWithReducedStudents,
          },
        });
    } catch (error) {
      next(error);
    }
  },

  getConsumptionStatistics: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const organizationId = req.body.organizationId;
      const startDate = req.query.startDate as string;
      const endDate = req.query.endDate as string;

      const where: any = { organizationId, status: 'active' };
      
      // 获取所有活跃班级
      const allClasses = await prisma.class.findMany({
        where,
        select: {
          courseType: true,
        },
      });

      // 统计幼儿班和精英班数量
      // 支持多种可能的命名方式：幼儿班、preschool、幼儿等
      const preschoolClassCount = allClasses.filter(
        (c) => c.courseType && (c.courseType.includes('幼儿') || c.courseType.toLowerCase().includes('preschool'))
      ).length;
      // 支持多种可能的命名方式：精英班、elite、精英等
      const eliteClassCount = allClasses.filter(
        (c) => c.courseType && (c.courseType.includes('精英') || c.courseType.toLowerCase().includes('elite'))
      ).length;
      const classCount = allClasses.length;

      // 其他统计数据（暂时返回0，后续可以完善）
      sendSuccess(res, {
        classCount,
        preschoolClassCount,
        eliteClassCount,
        totalAttendance: 0,
        rosterCount: 0,
        attendanceRate: 0,
        lessonPrice: 0,
        totalRevenue: 0,
        fullClassRate: 0,
        venueUtilizationRate: 0,
        newRecruits: 0,
        recalled: 0,
        nonRenewals: 0,
        deletedRoster: 0,
        baseCount: 0,
      });
    } catch (error) {
      next(error);
    }
  },

  getMonthlySummary: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const organizationId = req.body.organizationId;
      const month = req.query.month as string || new Date().toISOString().substring(0, 7);
      const [year, monthNum] = month.split('-').map(Number);

      const start = new Date(year, monthNum - 1, 1);
      const end = new Date(year, monthNum, 0, 23, 59, 59, 999);

      // 获取本月数据
      const totalNewStudents = await prisma.student.count({
        where: {
          organizationId,
          createdAt: {
            gte: start,
            lte: end,
          },
        },
      });

      const totalNewEnrollments = await prisma.enrollment.count({
        where: {
          organizationId,
          enrolledAt: {
            gte: start,
            lte: end,
          },
        },
      });

      const attendances = await prisma.attendance.findMany({
        where: {
          organizationId,
          checkInTime: {
            gte: start,
            lte: end,
          },
          status: {
            in: ['present', 'late'],
          },
        },
      });

      const totalAttendance = attendances.length;

      const schedules = await prisma.schedule.findMany({
        where: {
          organizationId,
          startTime: {
            gte: start,
            lte: end,
          },
        },
      });

      const avgAttendanceRate = schedules.length > 0
        ? Math.round((totalAttendance / (schedules.length * 10)) * 100)
        : 0;

      const payments = await prisma.payment.findMany({
        where: {
          organizationId,
          paidAt: {
            gte: start,
            lte: end,
          },
        },
      });

      const totalRevenue = payments.reduce((sum, p) => sum + Number(p.amount), 0);

      const newClasses = await prisma.class.count({
        where: {
          organizationId,
          createdAt: {
            gte: start,
            lte: end,
          },
        },
      });

      const activeStudents = await prisma.student.count({
        where: {
          organizationId,
          status: 'active',
        },
      });

      // 计算续费率
      const enrollments = await prisma.enrollment.findMany({
        where: {
          organizationId,
        },
        include: {
          payments: true,
        },
      });

      const renewalRate = enrollments.length > 0
        ? Math.round((enrollments.filter((e) => e.payments.length > 1).length / enrollments.length) * 100)
        : 0;

      // 获取上月数据用于对比
      const lastMonthStart = new Date(year, monthNum - 2, 1);
      const lastMonthEnd = new Date(year, monthNum - 1, 0, 23, 59, 59, 999);

      const lastMonthNewStudents = await prisma.student.count({
        where: {
          organizationId,
          createdAt: {
            gte: lastMonthStart,
            lte: lastMonthEnd,
          },
        },
      });

      const lastMonthRevenue = await prisma.payment.findMany({
        where: {
          organizationId,
          paidAt: {
            gte: lastMonthStart,
            lte: lastMonthEnd,
          },
        },
      }).then((p) => p.reduce((sum, payment) => sum + Number(payment.amount), 0));

      const lastMonthAttendance = await prisma.attendance.count({
        where: {
          organizationId,
          checkInTime: {
            gte: lastMonthStart,
            lte: lastMonthEnd,
          },
          status: {
            in: ['present', 'late'],
          },
        },
      });

      // 每周数据
      const weeklyData = [];
      const weekStart = new Date(start);
      let weekNum = 1;

      while (weekStart <= end) {
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekEnd.getDate() + 6);
        if (weekEnd > end) weekEnd.setTime(end.getTime());

        const weekNewStudents = await prisma.student.count({
          where: {
            organizationId,
            createdAt: {
              gte: weekStart,
              lte: weekEnd,
            },
          },
        });

        const weekNewEnrollments = await prisma.enrollment.count({
          where: {
            organizationId,
            enrolledAt: {
              gte: weekStart,
              lte: weekEnd,
            },
          },
        });

        const weekAttendances = await prisma.attendance.count({
          where: {
            organizationId,
            checkInTime: {
              gte: weekStart,
              lte: weekEnd,
            },
            status: {
              in: ['present', 'late'],
            },
          },
        });

        const weekSchedules = await prisma.schedule.count({
          where: {
            organizationId,
            startTime: {
              gte: weekStart,
              lte: weekEnd,
            },
          },
        });

        const weekRevenue = await prisma.payment.findMany({
          where: {
            organizationId,
            paidAt: {
              gte: weekStart,
              lte: weekEnd,
            },
          },
        }).then((p) => p.reduce((sum, payment) => sum + Number(payment.amount), 0));

        const weekAttendanceRate = weekSchedules > 0
          ? Math.round((weekAttendances / (weekSchedules * 10)) * 100)
          : 0;

        weeklyData.push({
          week: `第${weekNum}周`,
          newStudents: weekNewStudents,
          newEnrollments: weekNewEnrollments,
          attendanceCount: weekAttendances,
          attendanceRate: weekAttendanceRate,
          revenue: weekRevenue,
        });

        weekStart.setDate(weekStart.getDate() + 7);
        weekNum++;
      }

      // 同比分析
      const trends = [
        {
          name: '新增学员',
          current: totalNewStudents,
          last: lastMonthNewStudents,
          change: lastMonthNewStudents > 0
            ? Math.round(((totalNewStudents - lastMonthNewStudents) / lastMonthNewStudents) * 100)
            : 0,
        },
        {
          name: '总收入',
          current: totalRevenue,
          last: lastMonthRevenue,
          change: lastMonthRevenue > 0
            ? Math.round(((totalRevenue - lastMonthRevenue) / lastMonthRevenue) * 100)
            : 0,
        },
        {
          name: '出勤人次',
          current: totalAttendance,
          last: lastMonthAttendance,
          change: lastMonthAttendance > 0
            ? Math.round(((totalAttendance - lastMonthAttendance) / lastMonthAttendance) * 100)
            : 0,
        },
      ];

      // 生成分析总结
      const analysis = `本月运营总结：
1. 新增学员${totalNewStudents}人，${totalNewStudents > lastMonthNewStudents ? '较上月增长' : '较上月下降'}${Math.abs(trends[0].change)}%
2. 总收入¥${totalRevenue.toFixed(2)}，${totalRevenue > lastMonthRevenue ? '较上月增长' : '较上月下降'}${Math.abs(trends[1].change)}%
3. 平均出勤率${avgAttendanceRate}%，${avgAttendanceRate >= 80 ? '表现优秀' : avgAttendanceRate >= 60 ? '表现良好' : '需要关注'}
4. 续费率${renewalRate}%，${renewalRate >= 70 ? '客户满意度较高' : '需要提升客户留存'}
5. 活跃学员${activeStudents}人，新增班级${newClasses}个`;

      sendSuccess(res, {
        totalNewStudents,
        totalNewEnrollments,
        totalAttendance,
        avgAttendanceRate,
        totalRevenue,
        newClasses,
        activeStudents,
        renewalRate,
        weeklyData,
        trends,
        analysis,
      });
    } catch (error) {
      next(error);
    }
  },
};

