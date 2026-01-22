import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import { ApiError } from '../middleware/errorHandler';
import { sendSuccess, sendPaginated } from '../utils/response';
import prisma from '../config/database';

export const attendanceController = {
  getAttendances: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const pageSize = parseInt(req.query.pageSize as string) || 10;
      const studentId = req.query.studentId as string;
      const scheduleId = req.query.scheduleId as string;
      const classId = req.query.classId as string;
      const status = req.query.status as string;
      const startDate = req.query.startDate as string;
      const endDate = req.query.endDate as string;

      const where: any = {
        organizationId: req.body.organizationId,
      };

      if (studentId) {
        where.studentId = studentId;
      }

      if (scheduleId) {
        where.scheduleId = scheduleId;
      }

      if (classId) {
        where.classId = classId;
      }

      if (status) {
        where.status = status;
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

      const [attendances, total] = await Promise.all([
        prisma.attendance.findMany({
          where,
          include: {
            student: {
              select: {
                id: true,
                name: true,
                phone: true,
              },
            },
            schedule: {
              select: {
                id: true,
                startTime: true,
                endTime: true,
                classroom: true,
              },
            },
            class: {
              select: {
                id: true,
                name: true,
                code: true,
              },
            },
            checkedInByUser: {
              select: {
                id: true,
                name: true,
              },
            },
          },
          skip: (page - 1) * pageSize,
          take: pageSize,
          orderBy: { checkInTime: 'desc' },
        }),
        prisma.attendance.count({ where }),
      ]);

      sendPaginated(res, attendances, page, pageSize, total);
    } catch (error) {
      next(error);
    }
  },

  getAttendanceById: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;

      const attendance = await prisma.attendance.findUnique({
        where: { id },
        include: {
          student: true,
          schedule: {
            include: {
              class: true,
              course: true,
              teacher: true,
            },
          },
          class: true,
          checkedInByUser: true,
        },
      });

      if (!attendance) {
        return next(new ApiError('出勤记录不存在', 404, 'ATTENDANCE_NOT_FOUND'));
      }

      if (attendance.organizationId !== req.body.organizationId) {
        return next(new ApiError('无权访问', 403, 'FORBIDDEN'));
      }

      sendSuccess(res, attendance);
    } catch (error) {
      next(error);
    }
  },

  createAttendance: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const {
        studentId,
        scheduleId,
        status,
        checkInTime,
        notes,
      } = req.body;

      const organizationId = req.body.organizationId;

      // 验证学员
      const student = await prisma.student.findUnique({
        where: { id: studentId },
      });
      if (!student || student.organizationId !== organizationId) {
        return next(new ApiError('学员不存在或不属于该机构', 400, 'STUDENT_NOT_FOUND'));
      }

      // 验证排课
      const schedule = await prisma.schedule.findUnique({
        where: { id: scheduleId },
        include: {
          class: true,
        },
      });
      if (!schedule || schedule.organizationId !== organizationId) {
        return next(new ApiError('排课不存在或不属于该机构', 400, 'SCHEDULE_NOT_FOUND'));
      }

      // 检查是否已存在
      const existing = await prisma.attendance.findUnique({
        where: {
          studentId_scheduleId: {
            studentId,
            scheduleId,
          },
        },
      });

      if (existing) {
        return next(new ApiError('该学员已存在出勤记录', 400, 'ATTENDANCE_EXISTS'));
      }

      const attendance = await prisma.attendance.create({
        data: {
          organizationId,
          studentId,
          scheduleId,
          classId: schedule.classId,
          status,
          checkInTime: checkInTime ? new Date(checkInTime) : new Date(),
          checkedInBy: req.user?.id,
          notes,
        },
      });

      sendSuccess(res, attendance, '出勤记录创建成功', 201);
    } catch (error) {
      next(error);
    }
  },

  batchCheckIn: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { scheduleId, studentIds, status, notes } = req.body;

      const organizationId = req.body.organizationId;

      // 验证排课
      const schedule = await prisma.schedule.findUnique({
        where: { id: scheduleId },
        include: {
          class: true,
        },
      });
      if (!schedule || schedule.organizationId !== organizationId) {
        return next(new ApiError('排课不存在或不属于该机构', 400, 'SCHEDULE_NOT_FOUND'));
      }

      const results = [];
      const errors = [];

      for (const studentId of studentIds) {
        try {
          // 检查是否已存在
          const existing = await prisma.attendance.findUnique({
            where: {
              studentId_scheduleId: {
                studentId,
                scheduleId,
              },
            },
          });

          if (existing) {
            errors.push({ studentId, error: '已存在出勤记录' });
            continue;
          }

          const attendance = await prisma.attendance.create({
            data: {
              organizationId,
              studentId,
              scheduleId,
              classId: schedule.classId,
              status: status || 'present',
              checkInTime: new Date(),
              checkedInBy: req.user?.id,
              notes,
            },
          });

          results.push(attendance);
        } catch (error: any) {
          errors.push({ studentId, error: error.message });
        }
      }

      sendSuccess(res, {
        success: results.length,
        failed: errors.length,
        results,
        errors,
      }, '批量签到完成');
    } catch (error) {
      next(error);
    }
  },

  updateAttendance: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const { status, checkInTime, checkOutTime, notes } = req.body;

      const attendance = await prisma.attendance.findUnique({
        where: { id },
      });

      if (!attendance) {
        return next(new ApiError('出勤记录不存在', 404, 'ATTENDANCE_NOT_FOUND'));
      }

      if (attendance.organizationId !== req.body.organizationId) {
        return next(new ApiError('无权修改该出勤记录', 403, 'FORBIDDEN'));
      }

      const updateData: any = {};
      if (status) updateData.status = status;
      if (checkInTime) updateData.checkInTime = new Date(checkInTime);
      if (checkOutTime !== undefined) updateData.checkOutTime = checkOutTime ? new Date(checkOutTime) : null;
      if (notes !== undefined) updateData.notes = notes;

      const updated = await prisma.attendance.update({
        where: { id },
        data: updateData,
      });

      sendSuccess(res, updated, '出勤记录更新成功');
    } catch (error) {
      next(error);
    }
  },

  deleteAttendance: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;

      const attendance = await prisma.attendance.findUnique({
        where: { id },
      });

      if (!attendance) {
        return next(new ApiError('出勤记录不存在', 404, 'ATTENDANCE_NOT_FOUND'));
      }

      if (attendance.organizationId !== req.body.organizationId) {
        return next(new ApiError('无权删除该出勤记录', 403, 'FORBIDDEN'));
      }

      await prisma.attendance.delete({
        where: { id },
      });

      sendSuccess(res, null, '出勤记录删除成功');
    } catch (error) {
      next(error);
    }
  },

  getStatistics: async (req: AuthRequest, res: Response, next: NextFunction) => {
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

      const [total, present, absent, late, leave, makeUp] = await Promise.all([
        prisma.attendance.count({ where }),
        prisma.attendance.count({ where: { ...where, status: 'present' } }),
        prisma.attendance.count({ where: { ...where, status: 'absent' } }),
        prisma.attendance.count({ where: { ...where, status: 'late' } }),
        prisma.attendance.count({ where: { ...where, status: 'leave' } }),
        prisma.attendance.count({ where: { ...where, status: 'makeUp' } }),
      ]);

      const attendanceRate = total > 0 ? ((present + late) / total) * 100 : 0;

      sendSuccess(res, {
        total,
        present,
        absent,
        late,
        leave,
        makeUp,
        attendanceRate: Math.round(attendanceRate * 100) / 100,
      });
    } catch (error) {
      next(error);
    }
  },

  getContinuousLeaveStudents: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const organizationId = req.body.organizationId;
      const minDays = parseInt(req.query.minDays as string) || 3; // 默认连续3天以上

      // 查询最近30天内的请假记录
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const leaveAttendances = await prisma.attendance.findMany({
        where: {
          organizationId,
          status: 'leave',
          checkInTime: {
            gte: thirtyDaysAgo,
          },
        },
        include: {
          student: {
            select: {
              id: true,
              name: true,
              phone: true,
            },
          },
          class: {
            select: {
              id: true,
              name: true,
            },
          },
        },
        orderBy: {
          checkInTime: 'desc',
        },
      });

      // 按学员和班级分组，计算连续请假天数
      const studentClassMap = new Map<string, any>();

      leaveAttendances.forEach((attendance) => {
        const key = `${attendance.studentId}-${attendance.classId}`;
        const dateStr = attendance.checkInTime
          ? new Date(attendance.checkInTime).toDateString()
          : '';

        if (!studentClassMap.has(key)) {
          studentClassMap.set(key, {
            id: key,
            student: attendance.student,
            class: attendance.class,
            dates: new Set<string>(),
            lastAttendanceDate: attendance.checkInTime,
          });
        }

        const item = studentClassMap.get(key);
        if (dateStr) {
          item.dates.add(dateStr);
        }
        if (attendance.checkInTime && (!item.lastAttendanceDate || attendance.checkInTime > item.lastAttendanceDate)) {
          item.lastAttendanceDate = attendance.checkInTime;
        }
      });

      // 过滤并格式化数据
      const formattedData = Array.from(studentClassMap.values())
        .map((item) => ({
          id: item.id,
          student: item.student,
          class: item.class,
          continuousDays: item.dates.size,
          lastAttendanceDate: item.lastAttendanceDate
            ? new Date(item.lastAttendanceDate).toLocaleDateString('zh-CN')
            : '-',
        }))
        .filter((item) => item.continuousDays >= minDays)
        .sort((a, b) => b.continuousDays - a.continuousDays);

      sendSuccess(res, formattedData);
    } catch (error) {
      next(error);
    }
  },

  getHoneymoonAttendance: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const organizationId = req.body.organizationId;
      const days = parseInt(req.query.days as string) || 30; // 默认30天蜜月期

      // 查询蜜月期学员（新报名30天内的学员）
      const enrollments = await prisma.enrollment.findMany({
        where: {
          organizationId,
          enrolledAt: {
            gte: new Date(Date.now() - days * 24 * 60 * 60 * 1000),
          },
          status: 'active',
        },
        include: {
          student: true,
          class: true,
        },
      });

      const result = await Promise.all(
        enrollments.map(async (enrollment) => {
          // 计算应出勤次数和实际出勤次数
          const schedules = await prisma.schedule.count({
            where: {
              classId: enrollment.classId,
              startTime: {
                gte: enrollment.enrolledAt,
                lte: new Date(),
              },
            },
          });

          const relevantSchedules = await prisma.schedule.findMany({
            where: {
              classId: enrollment.classId,
              startTime: {
                gte: enrollment.enrolledAt,
                lte: new Date(),
              },
            },
            select: { id: true },
          });

          const scheduleIds = relevantSchedules.map((s) => s.id);
          const attendances = scheduleIds.length > 0
            ? await prisma.attendance.count({
                where: {
                  studentId: enrollment.studentId,
                  scheduleId: {
                    in: scheduleIds,
                  },
                  status: {
                    in: ['present', 'late'],
                  },
                },
              })
            : 0;

          const attendanceRate = schedules > 0 ? Math.round((attendances / schedules) * 100) : 0;

          return {
            id: enrollment.id,
            student: {
              id: enrollment.student.id,
              name: enrollment.student.name,
            },
            class: {
              id: enrollment.class.id,
              name: enrollment.class.name,
            },
            enrollmentDate: enrollment.enrolledAt.toLocaleDateString('zh-CN'),
            expectedAttendance: schedules,
            actualAttendance: attendances,
            attendanceRate,
          };
        })
      );

      // 计算统计信息
      const total = result.length;
      const avgAttendanceRate =
        total > 0
          ? Math.round(
              result.reduce((sum, item) => sum + item.attendanceRate, 0) / total
            )
          : 0;
      const highAttendance = result.filter((item) => item.attendanceRate >= 80).length;
      const lowAttendance = result.filter((item) => item.attendanceRate < 50).length;

      sendSuccess(res, {
        students: result,
        stats: {
          total,
          avgAttendanceRate,
          highAttendance,
          lowAttendance,
        },
      });
    } catch (error) {
      next(error);
    }
  },

  getLowAttendanceClasses: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const organizationId = req.body.organizationId;
      const threshold = parseInt(req.query.threshold as string) || 70; // 默认70%以下为低出勤

      // 查询所有活跃班级
      const classes = await prisma.class.findMany({
        where: {
          organizationId,
          status: 'active',
        },
        include: {
          teacher: {
            select: {
              id: true,
              name: true,
            },
          },
          enrollments: {
            where: {
              status: 'active',
            },
            include: {
              student: true,
            },
          },
        },
      });

      const result = await Promise.all(
        classes.map(async (classData) => {
          const totalStudents = classData.enrollments.length;
          if (totalStudents === 0) return null;

          // 计算每个学员的出勤率
          const schedules = await prisma.schedule.findMany({
            where: {
              classId: classData.id,
              startTime: {
                lte: new Date(),
              },
            },
            select: { id: true },
          });

          const scheduleIds = schedules.map((s) => s.id);
          const totalSchedules = scheduleIds.length;

          const studentRates = await Promise.all(
            classData.enrollments.map(async (enrollment) => {
              if (totalSchedules === 0) return 0;

              const attendances = await prisma.attendance.count({
                where: {
                  studentId: enrollment.studentId,
                  scheduleId: {
                    in: scheduleIds,
                  },
                  status: {
                    in: ['present', 'late'],
                  },
                },
              });

              return (attendances / totalSchedules) * 100;
            })
          );

          const avgRate = Math.round(
            studentRates.reduce((sum, rate) => sum + rate, 0) / totalStudents
          );
          const lowAttendanceCount = studentRates.filter((rate) => rate < threshold).length;

          // 只返回低出勤班级
          if (avgRate >= threshold) return null;

          return {
            id: classData.id,
            class: {
              id: classData.id,
              name: classData.name,
              code: classData.code,
              courseType: classData.courseType,
              teacher: classData.teacher,
            },
            totalStudents,
            attendanceRate: avgRate,
            lowAttendanceCount,
          };
        })
      );

      const filteredResult = result.filter((item) => item !== null);

      sendSuccess(res, filteredResult);
    } catch (error) {
      next(error);
    }
  },

  getClassAttendance: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { classId } = req.params;
      const organizationId = req.body.organizationId;

      // 获取班级信息
      const classData = await prisma.class.findFirst({
        where: {
          id: classId,
          organizationId,
        },
        include: {
          enrollments: {
            where: {
              status: 'active',
            },
            include: {
              student: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
        },
      });

      if (!classData) {
        return next(new ApiError('班级不存在', 404, 'CLASS_NOT_FOUND'));
      }

      // 获取班级总人数（活跃报名学员数）
      const totalStudents = classData.enrollments.length;

      // 获取该班级的所有排课（已开始的）
      const schedules = await prisma.schedule.findMany({
        where: {
          classId,
          startTime: {
            lte: new Date(),
          },
        },
        select: {
          id: true,
        },
      });

      const scheduleIds = schedules.map((s) => s.id);

      // 计算实际到场数（present + late）
      const actualAttendance = await prisma.attendance.count({
        where: {
          classId,
          scheduleId: {
            in: scheduleIds,
          },
          status: {
            in: ['present', 'late'],
          },
        },
      });

      // 计算总出勤记录数（所有状态的出勤记录）
      const totalAttendanceRecords = await prisma.attendance.count({
        where: {
          classId,
          scheduleId: {
            in: scheduleIds,
          },
        },
      });

      // 计算出勤率（实际到场数 / 总排课数 * 总人数）
      // 或者使用：实际到场数 / (总排课数 * 总人数)
      const totalPossibleAttendance = scheduleIds.length * totalStudents;
      const attendanceRate = totalPossibleAttendance > 0
        ? Math.round((actualAttendance / totalPossibleAttendance) * 100 * 100) / 100
        : 0;

      sendSuccess(res, {
        className: classData.name,
        totalStudents,
        actualAttendance,
        attendanceRate,
        totalSchedules: scheduleIds.length,
      });
    } catch (error) {
      next(error);
    }
  },

  getAllClassesAttendance: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const organizationId = req.body.organizationId;

      // 获取所有活跃班级
      const classes = await prisma.class.findMany({
        where: {
          organizationId,
          status: 'active',
        },
        include: {
          enrollments: {
            where: {
              status: 'active',
            },
          },
        },
      });

      // 为每个班级计算出勤信息
      const classesWithAttendance = await Promise.all(
        classes.map(async (classData) => {
          // 获取班级总人数（活跃报名学员数）
          const totalStudents = classData.enrollments.length;

          // 获取该班级的所有排课（已开始的）
          const schedules = await prisma.schedule.findMany({
            where: {
              classId: classData.id,
              startTime: {
                lte: new Date(),
              },
            },
            select: {
              id: true,
            },
          });

          const scheduleIds = schedules.map((s) => s.id);

          // 计算实际到场数（present + late）
          const actualAttendance = await prisma.attendance.count({
            where: {
              classId: classData.id,
              scheduleId: {
                in: scheduleIds,
              },
              status: {
                in: ['present', 'late'],
              },
            },
          });

          // 计算出勤率（实际到场数 / 总排课数 * 总人数）
          const totalPossibleAttendance = scheduleIds.length * totalStudents;
          const attendanceRate = totalPossibleAttendance > 0
            ? Math.round((actualAttendance / totalPossibleAttendance) * 100 * 100) / 100
            : 0;

          return {
            classId: classData.id,
            className: classData.name,
            totalStudents,
            actualAttendance,
            attendanceRate,
          };
        })
      );

      sendSuccess(res, classesWithAttendance);
    } catch (error) {
      next(error);
    }
  },
};

