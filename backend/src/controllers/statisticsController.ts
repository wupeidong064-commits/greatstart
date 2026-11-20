import { consumptionController } from './consumptionController';
import { businessPeriod } from '../utils/businessPeriod';
import { ApiError } from '../middleware/errorHandler';
import { refundSummary } from '../services/refundSummary';
import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import { sendSuccess } from '../utils/response';
import { resolveScope } from '../utils/scope';
import { Prisma } from '@prisma/client';
import { computeSessionAttendance, querySessionAttendance } from '../services/attendanceStatsService';
import prisma from '../config/database';
import { experienceScopeWhere } from '../utils/experienceScope';

/**
 * 类型化范围片段（R0）：spread 进显式 WhereInput 注解的变量后，
 * Prisma 在编译期即可捕获“给无该字段的表传 campusId”这类结构错误（此前被 any 遮蔽）。
 * - wStudent/wClass/wSchedule/wUser：表本身有 campusId
 * - wEnrollment/wAttendance：无 campusId，经 class 关系归属
 * - wPayment：无 campusId，经 student 关系归属
 */
type CampusFragments = {
  organizationId: string;
  campusId?: string;
  class?: { campusId: string };
  student?: { campusId: string };
};
const buildFragments = (organizationId: string, campusId: string | null) => {
  const base = { organizationId };
  return {
    wStudent: { ...base, ...(campusId ? { campusId } : {}) } as Prisma.StudentWhereInput,
    wClass: { ...base, ...(campusId ? { campusId } : {}) } as Prisma.ClassWhereInput,
    wSchedule: { ...base, ...(campusId ? { campusId } : {}) } as Prisma.ScheduleWhereInput,
    wUser: { ...base, ...(campusId ? { campusId } : {}) } as Prisma.UserWhereInput,
    wEnrollment: { ...base, ...(campusId ? { class: { campusId } } : {}) } as Prisma.EnrollmentWhereInput,
    wAttendance: { ...base, ...(campusId ? { class: { campusId } } : {}) } as Prisma.AttendanceWhereInput,
    wPayment: { ...base, ...(campusId ? { student: { campusId } } : {}) } as Prisma.PaymentWhereInput,
  };
};

export const statisticsController = {
  getStudentStatistics: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { organizationId, campusId } = resolveScope(req);
      // R0：类型化范围片段（编译期校验字段；替换原 any orgWhere/orgWhereViaClass）
      const { wStudent, wClass, wSchedule, wUser, wEnrollment, wAttendance, wPayment } = buildFragments(organizationId, campusId);
      const startDate = req.query.startDate as string;
      const endDate = req.query.endDate as string;

      const where: Prisma.StudentWhereInput = { ...wStudent };
      const dateWhere: Prisma.DateTimeFilter = {};
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
      const { organizationId, campusId } = resolveScope(req);
      // R0：类型化范围片段（编译期校验字段；替换原 any orgWhere/orgWhereViaClass）
      const { wStudent, wClass, wSchedule, wUser, wEnrollment, wAttendance, wPayment } = buildFragments(organizationId, campusId);
      const classId = req.query.classId as string;
      const startDate = req.query.startDate as string;
      const endDate = req.query.endDate as string;

      // R0：Attendance 无 campusId，经 class 关系过滤（原 orgWhere 直接含 campusId 导致运行时 500）
      const where: Prisma.AttendanceWhereInput = { ...wAttendance };
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
      const { organizationId, campusId } = resolveScope(req);
      // R0：类型化范围片段（编译期校验字段；替换原 any orgWhere/orgWhereViaClass）
      const { wStudent, wClass, wSchedule, wUser, wEnrollment, wAttendance, wPayment } = buildFragments(organizationId, campusId);
      const startDate = req.query.startDate as string;
      const endDate = req.query.endDate as string;

      const scheduleWhere: any = { ...wAttendance };
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
        prisma.class.count({ where: wClass }),
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
      const { organizationId, campusId } = resolveScope(req);
      // R0：类型化范围片段（编译期校验字段；替换原 any orgWhere/orgWhereViaClass）
      const { wStudent, wClass, wSchedule, wUser, wEnrollment, wAttendance, wPayment } = buildFragments(organizationId, campusId);
      const startDate = req.query.startDate as string;
      const endDate = req.query.endDate as string;

      // R0：Payment 无 campusId 字段（原 orgWhere 展开顶层 campusId → 运行时 500）；
      // 校区级经 student 关系归属（学员现属校区），wPayment 已含，不再追加
      const where: Prisma.PaymentWhereInput = { ...wPayment };
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
        where: wEnrollment,
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
      const { organizationId, campusId } = resolveScope(req);
      // R0：类型化范围片段（编译期校验字段；替换原 any orgWhere/orgWhereViaClass）
      const { wStudent, wClass, wSchedule, wUser, wEnrollment, wAttendance, wPayment } = buildFragments(organizationId, campusId);

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
        prisma.student.count({ where: { ...wStudent, status: 'active' } }),
        prisma.class.count({ where: { ...wClass, status: 'active' } }),
        prisma.schedule.count({
          where: {
            ...wSchedule,
            startTime: {
              gte: today,
              lt: tomorrow,
            },
          },
        }),
        prisma.attendance.count({
          where: {
            ...wAttendance,
            checkInTime: {
              gte: today,
              lt: tomorrow,
            },
          },
        }),
        prisma.enrollment.findMany({
          where: wEnrollment,
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
      const { organizationId, campusId } = resolveScope(req);
      // R0：类型化范围片段（编译期校验字段；替换原 any orgWhere/orgWhereViaClass）
      const { wStudent, wClass, wSchedule, wUser, wEnrollment, wAttendance, wPayment } = buildFragments(organizationId, campusId);
      const startDate = req.query.startDate as string || new Date().toISOString().split('T')[0];
      const endDate = req.query.endDate as string || new Date().toISOString().split('T')[0];
      const useMockData = req.query.useMockData === 'true'; // 允许使用虚拟数据

      const start = new Date(/^\d{4}-\d{2}-\d{2}$/.test(startDate) ? startDate + 'T00:00:00+08:00' : startDate);
      const end = new Date(/^\d{4}-\d{2}-\d{2}$/.test(endDate) ? endDate + 'T23:59:59.999+08:00' : endDate);

      if (useMockData) throw new ApiError('正式统计不支持虚拟数据',400,'MOCK_STATISTICS_DISABLED');
      businessPeriod({startDate,endDate});

      // 获取新增学员
      const totalNewStudents = await prisma.student.count({
        where: {
          ...wStudent,
          createdAt: {
            gte: start,
            lte: end,
          },
        },
      });

      // 获取新增报名
      const totalNewEnrollments = await prisma.enrollment.count({
        where: {
          ...wEnrollment,
          enrolledAt: {
            gte: start,
            lte: end,
          },
        },
      });

      // 获取出勤数据
      const attendances = await prisma.attendance.findMany({
        where: {
          ...wAttendance,
          checkInTime: {
            gte: start,
            lte: end,
          },
          status: {
            in: ['present', 'late'],
          },
        },
      });

      let totalAttendance = attendances.length;

      // 获取排课数据
      const schedules = await prisma.schedule.findMany({
        where: {
          ...wSchedule,
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
      // 统一逐场次应到分母（原固定每场 10 人的假分母已移除——与 AI 工具/教师统计同口径）
      const windowClassIds = Array.from(new Set(schedules.map((sc: any) => sc.classId)));
      const sessionEnrollments = windowClassIds.length > 0
        ? await prisma.enrollment.findMany({
            where: { ...wEnrollment, classId: { in: windowClassIds } },
            select: { classId: true, studentId: true, enrolledAt: true, endedAt:true, status: true },
          })
        : [];
      const sessionStats = await querySessionAttendance({organizationId,campusId,classIds:windowClassIds,startISO:start.toISOString(),endISO:end.toISOString()});
      totalAttendance=sessionStats.present;
      const avgAttendanceRate = sessionStats.expected > 0
        ? Math.round((sessionStats.present / sessionStats.expected) * 100)
        : 0; // 分母 0 = 不可计算，显示 0 保持接口形状（周报页无 null 语义）

      // 获取收入数据
      const payments = await prisma.payment.findMany({
        where: {
            ...wPayment,
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
          ...wClass,
          createdAt: {
            gte: start,
            lte: end,
          },
        },
      });

      // 活跃班级数
      const activeClasses = await prisma.class.count({
        where: {
          ...wClass,
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
            ...wStudent,
            createdAt: {
              gte: dayStart,
              lte: dayEnd,
            },
          },
        });

        const dayNewEnrollments = await prisma.enrollment.count({
          where: {
            ...wEnrollment,
            enrolledAt: {
              gte: dayStart,
              lte: dayEnd,
            },
          },
        });

        const dayAttendances = await prisma.attendance.count({
          where: {
            ...wAttendance,
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
            ...wSchedule,
            startTime: {
              gte: dayStart,
              lte: dayEnd,
            },
          },
        });

        const dayRevenue = await prisma.payment.findMany({
          where: {
            ...wPayment,
            organizationId,
            paidAt: {
              gte: dayStart,
              lte: dayEnd,
            },
          },
        }).then((p) => p.reduce((sum, payment) => sum + Number(payment.amount), 0));

        const daySession = await querySessionAttendance({ organizationId, campusId, classIds: (await prisma.class.findMany({where:wClass,select:{id:true}})).map(c=>c.id), startISO: dayStart.toISOString(), endISO: dayEnd.toISOString() });
        const dayAttendanceRate = daySession.rate;

        dailyData.push({
          date: currentDate.toLocaleDateString('zh-CN'),
          newStudents: dayNewStudents,
          newEnrollments: dayNewEnrollments,
          attendanceCount: daySession.present,
          attendanceRate: dayAttendanceRate,
          revenue: dayRevenue,
        });

        currentDate.setDate(currentDate.getDate() + 1);
      }

      // 获取花名册人数（活跃学员数，有活跃报名的学员）
      const activeEnrollments = await prisma.enrollment.findMany({
        where: {
          ...wEnrollment,
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

      // 获取上周出勤数据（供逐场次口径按 scheduleId 归场）
      const lastWeekAttendances = await prisma.attendance.findMany({
        where: {
          ...wAttendance,
          checkInTime: {
            gte: lastWeekStart,
            lte: lastWeekEnd,
          },
        },
      });
      // 上周总出勤人次改用逐场次统计结果（见下），不再只按 checkInTime 窗口计数

      // 获取上周排课数据
      const lastWeekSchedules = await prisma.schedule.findMany({
        where: {
          ...wSchedule,
          startTime: {
            gte: lastWeekStart,
            lte: lastWeekEnd,
          },
        },
      });
      const lastWeekTotalSchedules = lastWeekSchedules.length;
      // 统一逐场次应到分母（原“上周每场固定 10 人”假分母移除，与本周同口径）
      const lastWeekClassIds = Array.from(new Set(lastWeekSchedules.map((sc: any) => sc.classId)));
      const lastWeekSessionEnrollments = lastWeekClassIds.length > 0
        ? await prisma.enrollment.findMany({
            where: { ...wEnrollment, classId: { in: lastWeekClassIds } },
            select: { classId: true, studentId: true, enrolledAt: true, endedAt:true, status: true },
          })
        : [];
      const lastWeekSessionStats = await querySessionAttendance({organizationId,campusId,classIds:lastWeekClassIds,startISO:lastWeekStart.toISOString(),endISO:lastWeekEnd.toISOString()});
      const lastWeekAvgAttendanceRate = lastWeekSessionStats.expected > 0
        ? Math.round((lastWeekSessionStats.present / lastWeekSessionStats.expected) * 100)
        : 0; // 分母 0 = 不可计算，保持接口形状与本周一致（周报页无 null 语义）
      // 上周总出勤人次改用逐场次统计结果，不再只按 checkInTime 窗口计数
      const lastWeekTotalAttendance = lastWeekSessionStats.present;

      // 获取上周的花名册人数
      const lastWeekActiveEnrollments = await prisma.enrollment.findMany({
        where: {
          ...wEnrollment,
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

      // 计算上周确认收入：改为上周窗口内真实收款合计（原“出勤人次 × 固定单价100”估算移除）
      const lastWeekPayments = await prisma.payment.findMany({
        where: {
            ...wPayment,
          organizationId,
          paidAt: {
            gte: lastWeekStart,
            lte: lastWeekEnd,
          },
        },
        select: { amount: true },
      });
      const lastWeekConfirmedRevenue = lastWeekPayments.reduce((sum, p) => sum + Number(p.amount), 0);

      // 教练员工作分析
      // 1. 找出低出勤教练员（负责学员出勤率低于60%）
      const teachers = await prisma.user.findMany({
        where: {
          ...wUser,
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
              ...wClass,
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
              ...wEnrollment,
            },
            select: {
              studentId: true,
            },
          });
          const studentIds = [...new Set(enrollments.map((e) => e.studentId))];

          const teacherMetric=await querySessionAttendance({organizationId,campusId,classIds,startISO:start.toISOString(),endISO:end.toISOString()});
          const teacherAttendanceRate=teacherMetric.rate ?? 0;

          // 计算该教练负责学员的流失数（本周变为inactive的学员）
          const lostStudents = await prisma.student.count({
            where: {
              id: { in: studentIds },
              ...wStudent,
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
          ...wClass,
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
          ...wSchedule,
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

          if(!classData)return null;
          const classMetric=await querySessionAttendance({organizationId,campusId,classIds:[classId],startISO:start.toISOString(),endISO:end.toISOString()});
          if(classMetric.rate===null)return null;
          const attendanceRate=classMetric.rate;

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
          ...wEnrollment,
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
          ...wEnrollment,
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

      // 邀约按体验日期归集，登记并未取消即计一次体验邀约，与体验课页同源。
      const experienceRows = await prisma.experienceLesson.findMany({ where: {
        ...experienceScopeWhere(organizationId, campusId),
        scheduleDate: { gte: startDate.slice(0, 10), lte: endDate.slice(0, 10) },
        status: { notIn: ['cancelled', 'canceled'] },
      }, select: { status: true, assigneeId: true } });
      const invitationCount = experienceRows.length;
      const attendanceCount = experienceRows.filter(r => ['completed', 'converted', 'unconverted'].includes(r.status)).length;
      const experienceConverted = experienceRows.filter(r => r.status === 'converted').length;
      const experienceNoShows = experienceRows.filter(r => ['noshow', 'no-show'].includes(r.status)).length;


      // 续费情况汇总
      // 1. 找出有多次报名的学员（续费学员）
      const allEnrollments = await prisma.enrollment.findMany({
        where: {
          ...wEnrollment,
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
            ...wPayment,
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
      const _monthStart = new Date(start.getFullYear(), start.getMonth(), 1);
      const monthEnd = new Date(start.getFullYear(), start.getMonth() + 1, 0, 23, 59, 59, 999);

      // 获取当月所有活跃学员及其剩余课次（简化处理：使用活跃学员数）
      // 实际应该计算每个学员的剩余课次，但这里简化处理
      const _monthActiveEnrollments = await prisma.enrollment.findMany({
        where: {
          ...wEnrollment,
          status: 'active',
          enrolledAt: {
            lte: monthEnd,
          },
        },
        select: {
          studentId: true,
        },
      });

      // 续费率分母：剩余课时 1–5 的活跃报名学员（取学员档案真实 remainingLessons）。
      // 原“每100元=1课次、出勤再扣减”的估算链路整体移除——它把缴费金额当课时数，
      // 与学员档案的真实剩余课时无关，属于伪造经营指标。
      const activeEnrollmentStudents = await prisma.enrollment.findMany({
        where: {
          ...wEnrollment,
          status: 'active',
        },
        select: {
          studentId: true,
          student: { select: { remainingLessons: true } },
        },
      });
      const remainingByStudent = new Map<string, number>();
      activeEnrollmentStudents.forEach((e) => remainingByStudent.set(e.studentId, e.student.remainingLessons));
      const studentsWithLowRemainingLessons = Array.from(remainingByStudent.entries())
        .filter(([_, remaining]) => remaining > 0 && remaining <= 5)
        .map(([studentId]) => studentId);

      // 续费率 = 本周续费学员数 / 剩余课时 1–5 的活跃学员数
      // 本周续费学员数：本周内发生续费支付的学员数（去重）
      const renewalStudentIdsThisWeek = new Set(renewalPayments.map((p) => p.studentId));
      const renewalRate = studentsWithLowRemainingLessons.length > 0
        ? Math.round((renewalStudentIdsThisWeek.size / studentsWithLowRemainingLessons.length) * 100 * 100) / 100
        : null; // 分母为 0 = 不可计算，不伪装 0%

      // 工作建议数据计算
      // 模块1（目标完成度）：机构未配置目标值，任何百分比都是编造的。
      // 真实路径不再返回 module1（mock 演示路径保留），前端相应隐藏该模块。

      // 模块2：过程数据分析
      const finishedExperiences = attendanceCount + experienceNoShows;
      const noShowRate = finishedExperiences > 0 ? Math.round(experienceNoShows / finishedExperiences * 100) : null;
      const conversionRate = attendanceCount > 0 ? Math.round(experienceConverted / attendanceCount * 1000) / 10 : null;

      // 识别过程数据中的问题
      const processIssues: string[] = [];
      if (noShowRate !== null && noShowRate > 20) {
        processIssues.push(`爽约率较高（${noShowRate}%），需要加强邀约后的跟进和提醒工作。`);
      }
      if (conversionRate !== null && conversionRate < 50) {
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
      // 销售人员按 role='sales' 取（原误用 role='teacher' 查教练）。
      const salesPersons = await prisma.user.findMany({
        where: {
          ...wUser,
          role: 'sales',
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
              ...wClass,
            },
            select: { id: true },
          });
          const classIds = classes.map((c) => c.id);

          // 计算该销售的结果数据
          const salesEnrollments = await prisma.enrollment.findMany({
            where: {
              classId: { in: classIds },
              enrolledAt: { gte: start, lte: end },
              ...wEnrollment,
            },
          });
          const salesNewEnrollments = salesEnrollments.length;

          const salesPayments = await prisma.payment.findMany({
            where: {
            ...wPayment,
              enrollment: { classId: { in: classIds } },
              paidAt: { gte: start, lte: end },
              organizationId,
            },
          });
          const salesTotalRevenue = salesPayments.reduce((sum, p) => sum + Number(p.amount), 0);

          // 计算该销售的过程数据（简化处理）
          const salesNewStudents = await prisma.student.count({
            where: {
              ...wStudent,
              createdAt: { gte: start, lte: end },
              enrollments: {
                some: {
                  classId: { in: classIds },
                },
              },
            },
          });

          // 邀约数/到场数按人拆分无数据来源（无邀约表、个人到场取自全班出勤），
          // 置 null（暂不可用），不再用 ×1.5 / ×0.8 估算。
          const ownExperiences = experienceRows.filter(r => r.assigneeId === sales.id);
          const salesInvitationCount = ownExperiences.length;
          const salesAttendanceCount = ownExperiences.filter(r => ['completed', 'converted', 'unconverted'].includes(r.status)).length;

          // 判断结果数据是否较差
          const isPoorResult = salesNewEnrollments < 2 || salesTotalRevenue < 2000;

          if (isPoorResult) {
            const suggestions: string[] = [];
            if (salesNewEnrollments === 0) {
              suggestions.push('本周期内无新报名，建议优先跟进已有线索与体验课邀约。');
            } else {
              suggestions.push('成单量或金额低于基准，建议复盘未转化线索并加强跟进节奏。');
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
        revenueCaliber: 'payments 实收合计，未扣减退款；批准退费不代表实际支出；refund.netCashFlow为实收减有凭据线下退款（不含成本及未登记银行流水）',
        refund: await refundSummary({ organizationId, campusId }, start, end),
        newClasses,
        activeClasses,
        totalSchedules,
        dailyData,
        rosterCount,
        // 实收和可核定课消收入分别呈现；缺逐笔课消计价依据时不以实收替代。
        confirmedRevenue: null,
        confirmedRevenueNote: '尚缺逐笔课消计价依据；实际收款请查看现金流收入',
        // 过程指标
        poolAddedCount,
        invitationCount,
        invitationCaliber: '按所选期间体验日期统计有效登记，已取消不计；到场含已到场未成单及已成单；未上课不计爽约',
        attendanceCount,
        // 续费情况
        renewalTotalAmount,
        renewalOrderCount,
        renewalAvgPrice,
        renewalRate,
        // 工作建议数据（module1 目标完成度需机构配置目标值，未配置则不返回，前端隐藏该模块）
        workSuggestions: {
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
          confirmedRevenue: null,
          cashReceipts: lastWeekConfirmedRevenue,
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
    return consumptionController.getStatistics(req,res,next);
  },

  getMonthlySummary: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { organizationId, campusId } = resolveScope(req);
      // R0：类型化范围片段（编译期校验字段；替换原 any orgWhere/orgWhereViaClass）
      const { wStudent, wClass, wSchedule, wUser, wEnrollment, wAttendance, wPayment } = buildFragments(organizationId, campusId);
      const month = req.query.month as string || new Date().toISOString().substring(0, 7);
      if (!/^\d{4}-(?:0[1-9]|1[0-2])$/.test(month)) throw new ApiError('月份无效',400,'INVALID_DATE');
      const [year, monthNum] = month.split('-').map(Number);

      const start = new Date(`${year}-${String(monthNum).padStart(2, '0')}-01T00:00:00+08:00`);
      const nextMonth = monthNum === 12 ? `${year+1}-01` : `${year}-${String(monthNum+1).padStart(2, '0')}`;
      const end = new Date(new Date(`${nextMonth}-01T00:00:00+08:00`).getTime()-1);

      // 获取本月数据
      const totalNewStudents = await prisma.student.count({
        where: {
          ...wStudent,
          createdAt: {
            gte: start,
            lte: end,
          },
        },
      });

      const totalNewEnrollments = await prisma.enrollment.count({
        where: {
          ...wEnrollment,
          enrolledAt: {
            gte: start,
            lte: end,
          },
        },
      });

      const attendances = await prisma.attendance.findMany({
        where: {
          ...wAttendance,
          checkInTime: {
            gte: start,
            lte: end,
          },
          status: {
            in: ['present', 'late'],
          },
        },
      });

      let totalAttendance = attendances.length;

      const schedules = await prisma.schedule.findMany({
        where: {
          ...wSchedule,
          startTime: {
            gte: start,
            lte: end,
          },
        },
      });

      // 统一逐场次应到分母（原固定每场 10 人假分母移除）
      const mClassIds = Array.from(new Set(schedules.map((sc: any) => sc.classId)));
      const mEnrollments = mClassIds.length > 0
        ? await prisma.enrollment.findMany({
            where: { ...wEnrollment, classId: { in: mClassIds } },
            select: { classId: true, studentId: true, enrolledAt: true, endedAt:true, status: true },
          })
        : [];
      const monthlySession = await querySessionAttendance({organizationId,campusId,classIds:mClassIds,startISO:start.toISOString(),endISO:end.toISOString()});
      totalAttendance=monthlySession.present;
      const avgAttendanceRate = monthlySession.expected > 0
        ? Math.round((monthlySession.present / monthlySession.expected) * 100)
        : 0;

      const payments = await prisma.payment.findMany({
        where: {
            ...wPayment,
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
          ...wClass,
          createdAt: {
            gte: start,
            lte: end,
          },
        },
      });

      const activeStudents = await prisma.student.count({
        where: {
          ...wStudent,
          status: 'active',
        },
      });

      // 计算续费率
      const enrollments = await prisma.enrollment.findMany({
        where: {
          ...wEnrollment,
        },
        include: {
          payments: true,
        },
      });

      const renewalRate = enrollments.length > 0
        ? Math.round((enrollments.filter((e) => e.payments.length > 1).length / enrollments.length) * 100)
        : 0;

      // 获取上月数据用于对比
      const prevMonth = monthNum === 1 ? `${year-1}-12` : `${year}-${String(monthNum-1).padStart(2, '0')}`;
      const lastMonthStart = new Date(`${prevMonth}-01T00:00:00+08:00`);
      const lastMonthEnd = new Date(start.getTime()-1);

      const lastMonthNewStudents = await prisma.student.count({
        where: {
          ...wStudent,
          createdAt: {
            gte: lastMonthStart,
            lte: lastMonthEnd,
          },
        },
      });

      const lastMonthRevenue = await prisma.payment.findMany({
        where: {
            ...wPayment,
          organizationId,
          paidAt: {
            gte: lastMonthStart,
            lte: lastMonthEnd,
          },
        },
      }).then((p) => p.reduce((sum, payment) => sum + Number(payment.amount), 0));

      const lastMonthAttendance = await prisma.attendance.count({
        where: {
          ...wAttendance,
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
        const weekEnd = new Date(weekStart.getTime() + 7 * 86400000 - 1);
        if (weekEnd > end) weekEnd.setTime(end.getTime());

        const weekNewStudents = await prisma.student.count({
          where: {
            ...wStudent,
            createdAt: {
              gte: weekStart,
              lte: weekEnd,
            },
          },
        });

        const weekNewEnrollments = await prisma.enrollment.count({
          where: {
            ...wEnrollment,
            enrolledAt: {
              gte: weekStart,
              lte: weekEnd,
            },
          },
        });

        const weekAttendances = await prisma.attendance.count({
          where: {
            ...wAttendance,
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
            ...wSchedule,
            startTime: {
              gte: weekStart,
              lte: weekEnd,
            },
          },
        });

        const weekRevenue = await prisma.payment.findMany({
          where: {
            ...wPayment,
            organizationId,
            paidAt: {
              gte: weekStart,
              lte: weekEnd,
            },
          },
        }).then((p) => p.reduce((sum, payment) => sum + Number(payment.amount), 0));

        const weekSession = await querySessionAttendance({ organizationId, campusId, classIds: (await prisma.class.findMany({where:wClass,select:{id:true}})).map(c=>c.id), startISO: weekStart.toISOString(), endISO: weekEnd.toISOString() });
        const weekAttendanceRate = weekSession.rate;

        weeklyData.push({
          week: `第${weekNum}周`,
          newStudents: weekNewStudents,
          newEnrollments: weekNewEnrollments,
          attendanceCount: weekSession.present,
          attendanceRate: weekAttendanceRate,
          revenue: weekRevenue,
        });

        weekStart.setDate(weekStart.getDate() + 7);
        weekNum++;
      }

      // 环比分析（与上月比较）：有非零基期才计算增幅；上期零、本期正数不可计算；两期均零为持平
      const pctChange = (cur: number, last: number): number | null => {
        if (last > 0) return Math.round(((cur - last) / last) * 100);
        if (last === 0 && cur === 0) return 0;
        return null;
      };
      const trends = [
        {
          name: '新增学员',
          current: totalNewStudents,
          last: lastMonthNewStudents,
          change: pctChange(totalNewStudents, lastMonthNewStudents),
        },
        {
          name: '总收入',
          current: totalRevenue,
          last: lastMonthRevenue,
          change: pctChange(totalRevenue, lastMonthRevenue),
        },
        {
          name: '出勤人次',
          current: totalAttendance,
          last: lastMonthAttendance,
          change: pctChange(totalAttendance, lastMonthAttendance),
        },
      ];

      // 生成分析总结（环比口径：上期为零不可计算增幅，不得显示增长0%）
      const trendPhrase = (cur: number, last: number, change: number | null, unit: string) => {
        if (last === 0 && cur === 0) return `与上月持平（两期均为0${unit}）`;
        if (last === 0) return `上期为零，增幅不可计算（本期${cur}${unit}）`;
        return `较上月${change !== null && change >= 0 ? '增长' : '下降'}${Math.abs(change ?? 0)}%（环比）`;
      };
      const analysis = `本月运营总结：
1. 新增学员${totalNewStudents}人，${trendPhrase(totalNewStudents, lastMonthNewStudents, trends[0].change, '人')}
2. 总收入¥${totalRevenue.toFixed(2)}，${trendPhrase(totalRevenue, lastMonthRevenue, trends[1].change, '')}
3. 平均出勤率${avgAttendanceRate}%，${avgAttendanceRate >= 80 ? '表现优秀' : avgAttendanceRate >= 60 ? '表现良好' : '需要关注'}
4. 续费率${renewalRate}%，${renewalRate >= 70 ? '客户满意度较高' : '需要提升客户留存'}
5. 活跃学员${activeStudents}人，新增班级${newClasses}个`;

      sendSuccess(res, {
        totalNewStudents,
        totalNewEnrollments,
        totalAttendance,
        avgAttendanceRate,
        totalRevenue,
        cashReceipts: totalRevenue,
        confirmedRevenue: null,
        confirmedRevenueNote: '尚缺逐笔课消计价依据；本页收入为实收合计，请勿当作已确认课消收入',
        revenueCaliber: 'payments 实收合计，未扣减退款；批准退费不代表实际支出；refund.netCashFlow为实收减有凭据线下退款（不含成本及未登记银行流水）',
        refund: await refundSummary({ organizationId, campusId }, start, end),
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

