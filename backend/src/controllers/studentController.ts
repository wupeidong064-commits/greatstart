import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import { ApiError } from '../middleware/errorHandler';
import { sendSuccess, sendPaginated } from '../utils/response';
import prisma from '../config/database';
import * as XLSX from 'xlsx';

export const studentController = {
  getStudents: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const pageSize = parseInt(req.query.pageSize as string) || 10;
      const search = req.query.search as string;
      const status = req.query.status as string;
      const campusId = req.query.campusId as string;
      const lowAttendanceOnly = req.query.lowAttendanceOnly === 'true';
      const threshold = 70; // 默认70%以下为低出勤

      const where: any = {
        organizationId: req.body.organizationId,
      };

      if (campusId) {
        where.campusId = campusId;
      } else if (req.user?.campusId) {
        where.campusId = req.user.campusId;
      }

      if (status) {
        where.status = status;
      }

      if (search) {
        where.OR = [
          { name: { contains: search, mode: 'insensitive' } },
          { phone: { contains: search, mode: 'insensitive' } },
          { parentName: { contains: search, mode: 'insensitive' } },
          { parentPhone: { contains: search, mode: 'insensitive' } },
        ];
      }

      // 如果启用低出勤筛选，需要先获取所有学生计算出勤率，然后再分页
      if (lowAttendanceOnly) {
        // 先获取所有学生（不分页）
        const allStudents = await prisma.student.findMany({
          where,
          include: {
            campus: {
              select: {
                id: true,
                name: true,
                code: true,
              },
            },
              enrollments: {
                where: { status: 'active' },
                include: {
                  class: {
                    select: {
                      id: true,
                      name: true,
                      code: true,
                      teacher: {
                        select: {
                          id: true,
                          name: true,
                        },
                      },
                    },
                  },
                },
              },
            _count: {
              select: {
                enrollments: true,
                attendances: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        });

        // 计算每个学员的出勤率
        const studentsWithAttendance = await Promise.all(
          allStudents.map(async (student) => {
            // 获取学员的所有报名班级
            const enrollments = await prisma.enrollment.findMany({
              where: { studentId: student.id },
              include: { class: true },
            });

            if (enrollments.length === 0) {
              return { student, attendanceRate: 0 };
            }

            // 计算所有班级的总课程数和出勤数
            let totalSchedules = 0;
            let totalAttendances = 0;

            for (const enrollment of enrollments) {
              const schedules = await prisma.schedule.findMany({
                where: {
                  classId: enrollment.classId,
                  startTime: { lte: new Date() },
                },
                select: { id: true },
              });

              const scheduleIds = schedules.map((s) => s.id);
              totalSchedules += scheduleIds.length;

              if (scheduleIds.length > 0) {
                const attendances = await prisma.attendance.count({
                  where: {
                    studentId: student.id,
                    scheduleId: { in: scheduleIds },
                    status: { in: ['present', 'late'] },
                  },
                });
                totalAttendances += attendances;
              }
            }

            const attendanceRate = totalSchedules > 0 
              ? Math.round((totalAttendances / totalSchedules) * 100) 
              : 0;

            return { student, attendanceRate };
          })
        );

        // 筛选出低出勤学员（出勤率低于阈值）
        const lowAttendanceStudents = studentsWithAttendance
          .filter((item) => item.attendanceRate < threshold)
          .map((item) => item.student);

        // 应用分页
        const startIndex = (page - 1) * pageSize;
        const endIndex = startIndex + pageSize;
        const students = lowAttendanceStudents.slice(startIndex, endIndex);
        const total = lowAttendanceStudents.length;

        sendPaginated(res, students, page, pageSize, total);
      } else {
        // 正常情况，直接分页查询
        const [students, total] = await Promise.all([
          prisma.student.findMany({
            where,
            include: {
              campus: {
                select: {
                  id: true,
                  name: true,
                  code: true,
                },
              },
              enrollments: {
                where: { status: 'active' },
                include: {
                  class: {
                    select: {
                      id: true,
                      name: true,
                      code: true,
                      teacher: {
                        select: {
                          id: true,
                          name: true,
                        },
                      },
                    },
                  },
                },
              },
              _count: {
                select: {
                  enrollments: true,
                  attendances: true,
                },
              },
            },
            skip: (page - 1) * pageSize,
            take: pageSize,
            orderBy: { createdAt: 'desc' },
          }),
          prisma.student.count({ where }),
        ]);

        sendPaginated(res, students, page, pageSize, total);
      }
    } catch (error) {
      next(error);
    }
  },

  getStudentById: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;

      const student = await prisma.student.findUnique({
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
          enrollments: {
            include: {
              class: {
                include: {
                  teacher: {
                    select: {
                      id: true,
                      name: true,
                    },
                  },
                },
              },
            },
          },
          attendances: {
            take: 10,
            orderBy: { createdAt: 'desc' },
            include: {
              schedule: {
                select: {
                  startTime: true,
                  endTime: true,
                },
              },
              class: {
                select: {
                  name: true,
                },
              },
            },
          },
        },
      });

      if (!student) {
        return next(new ApiError('学员不存在', 404, 'STUDENT_NOT_FOUND'));
      }

      // 数据隔离检查
      if (student.organizationId !== req.body.organizationId) {
        return next(new ApiError('无权访问', 403, 'FORBIDDEN'));
      }

      sendSuccess(res, student);
    } catch (error) {
      next(error);
    }
  },

  createStudent: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const {
        name,
        gender,
        birthDate,
        phone,
        parentName,
        parentPhone,
        parentEmail,
        address,
        emergencyContact,
        emergencyPhone,
        notes,
        campusId,
        status,
      } = req.body;

      const organizationId = req.body.organizationId;
      const targetCampusId = campusId || req.user?.campusId;

      // 验证校区
      if (targetCampusId) {
        const campus = await prisma.campus.findUnique({
          where: { id: targetCampusId },
        });
        if (!campus || campus.organizationId !== organizationId) {
          return next(new ApiError('校区不存在或不属于该机构', 400, 'CAMPUS_NOT_FOUND'));
        }
      }

      const student = await prisma.student.create({
        data: {
          organizationId,
          campusId: targetCampusId,
          name,
          gender,
          birthDate: birthDate ? new Date(birthDate) : null,
          phone,
          parentName,
          parentPhone,
          parentEmail,
          address,
          emergencyContact,
          emergencyPhone,
          notes,
          status: status || 'active', // 支持设置status，默认为active
        },
      });

      sendSuccess(res, student, '学员创建成功', 201);
    } catch (error) {
      next(error);
    }
  },

  updateStudent: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const {
        name,
        gender,
        birthDate,
        phone,
        parentName,
        parentPhone,
        parentEmail,
        address,
        emergencyContact,
        emergencyPhone,
        notes,
        status,
        campusId,
      } = req.body;

      const student = await prisma.student.findUnique({
        where: { id },
      });

      if (!student) {
        return next(new ApiError('学员不存在', 404, 'STUDENT_NOT_FOUND'));
      }

      // 数据隔离检查
      if (student.organizationId !== req.body.organizationId) {
        return next(new ApiError('无权修改该学员', 403, 'FORBIDDEN'));
      }

      const updateData: any = {};
      if (name) updateData.name = name;
      if (gender) updateData.gender = gender;
      if (birthDate !== undefined) updateData.birthDate = birthDate ? new Date(birthDate) : null;
      if (phone !== undefined) updateData.phone = phone;
      if (parentName !== undefined) updateData.parentName = parentName;
      if (parentPhone !== undefined) updateData.parentPhone = parentPhone;
      if (parentEmail !== undefined) updateData.parentEmail = parentEmail;
      if (address !== undefined) updateData.address = address;
      if (emergencyContact !== undefined) updateData.emergencyContact = emergencyContact;
      if (emergencyPhone !== undefined) updateData.emergencyPhone = emergencyPhone;
      if (notes !== undefined) updateData.notes = notes;
      if (status) updateData.status = status;

      if (campusId) {
        const campus = await prisma.campus.findUnique({
          where: { id: campusId },
        });
        if (!campus || campus.organizationId !== student.organizationId) {
          return next(new ApiError('校区不存在或不属于该机构', 400, 'CAMPUS_NOT_FOUND'));
        }
        updateData.campusId = campusId;
      }

      const updated = await prisma.student.update({
        where: { id },
        data: updateData,
      });

      sendSuccess(res, updated, '学员更新成功');
    } catch (error) {
      next(error);
    }
  },

  deleteStudent: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;

      const student = await prisma.student.findUnique({
        where: { id },
      });

      if (!student) {
        return next(new ApiError('学员不存在', 404, 'STUDENT_NOT_FOUND'));
      }

      // 数据隔离检查
      if (student.organizationId !== req.body.organizationId) {
        return next(new ApiError('无权删除该学员', 403, 'FORBIDDEN'));
      }

      await prisma.student.delete({
        where: { id },
      });

      sendSuccess(res, null, '学员删除成功');
    } catch (error) {
      next(error);
    }
  },

  importStudents: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      // 这里需要multer处理文件上传，暂时返回提示
      return next(new ApiError('Excel导入功能需要文件上传中间件', 501, 'NOT_IMPLEMENTED'));
    } catch (error) {
      next(error);
    }
  },

  exportStudents: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const organizationId = req.body.organizationId;
      const campusId = req.query.campusId as string;

      const where: any = { organizationId };
      if (campusId) {
        where.campusId = campusId;
      }

      const students = await prisma.student.findMany({
        where,
        select: {
          name: true,
          gender: true,
          birthDate: true,
          phone: true,
          parentName: true,
          parentPhone: true,
          parentEmail: true,
          address: true,
          status: true,
          createdAt: true,
        },
      });

      // 转换为Excel
      const worksheet = XLSX.utils.json_to_sheet(students);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, '学员列表');

      const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename=students_${Date.now()}.xlsx`);
      res.send(buffer);
    } catch (error) {
      next(error);
    }
  },

  getRenewalStudents: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const pageSize = parseInt(req.query.pageSize as string) || 10;
      const search = req.query.search as string;
      const startDate = req.query.startDate as string;
      const endDate = req.query.endDate as string;

      const organizationId = req.body.organizationId;

      // 获取所有有多次报名的学员（续学员）
      const enrollments = await prisma.enrollment.findMany({
        where: {
          organizationId,
        },
        select: {
          studentId: true,
          enrolledAt: true,
        },
      });

      // 统计每个学员的报名次数
      const studentEnrollmentMap = new Map<string, number>();
      const studentEnrollmentDates = new Map<string, Date[]>();

      enrollments.forEach((enrollment) => {
        const count = studentEnrollmentMap.get(enrollment.studentId) || 0;
        studentEnrollmentMap.set(enrollment.studentId, count + 1);

        if (!studentEnrollmentDates.has(enrollment.studentId)) {
          studentEnrollmentDates.set(enrollment.studentId, []);
        }
        studentEnrollmentDates.get(enrollment.studentId)!.push(enrollment.enrolledAt);
      });

      // 获取续学员ID列表（报名次数>1）
      const renewalStudentIds = Array.from(studentEnrollmentMap.entries())
        .filter(([_, count]) => count > 1)
        .map(([studentId]) => studentId);

      if (renewalStudentIds.length === 0) {
        return sendPaginated(res, [], page, pageSize, 0);
      }

      const where: any = {
        organizationId,
        id: {
          in: renewalStudentIds,
        },
      };

      if (startDate || endDate) {
        where.createdAt = {};
        if (startDate) {
          where.createdAt.gte = new Date(startDate);
        }
        if (endDate) {
          where.createdAt.lte = new Date(endDate);
        }
      }

      if (search) {
        where.OR = [
          { name: { contains: search, mode: 'insensitive' } },
          { phone: { contains: search, mode: 'insensitive' } },
          { parentName: { contains: search, mode: 'insensitive' } },
          { parentPhone: { contains: search, mode: 'insensitive' } },
        ];
      }

      const [students, total] = await Promise.all([
        prisma.student.findMany({
          where,
          include: {
            campus: {
              select: {
                id: true,
                name: true,
                code: true,
              },
            },
            enrollments: {
              where: { status: 'active' },
              include: {
                class: {
                  select: {
                    id: true,
                    name: true,
                    code: true,
                    teacher: {
                      select: {
                        id: true,
                        name: true,
                      },
                    },
                  },
                },
              },
              orderBy: {
                enrolledAt: 'desc',
              },
            },
            _count: {
              select: {
                enrollments: true,
                attendances: true,
              },
            },
          },
          skip: (page - 1) * pageSize,
          take: pageSize,
          orderBy: { createdAt: 'desc' },
        }),
        prisma.student.count({ where }),
      ]);

      // 添加报名次数信息
      const studentsWithRenewalInfo = students.map((student) => ({
        ...student,
        enrollmentCount: studentEnrollmentMap.get(student.id) || 0,
        enrollmentDates: studentEnrollmentDates.get(student.id) || [],
      }));

      sendPaginated(res, studentsWithRenewalInfo, page, pageSize, total);
    } catch (error) {
      next(error);
    }
  },

  exportRenewalStudents: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const search = req.query.search as string;
      const organizationId = req.body.organizationId;

      // 获取所有有多次报名的学员（续学员）- 复用getRenewalStudents的逻辑
      const enrollments = await prisma.enrollment.findMany({
        where: {
          organizationId,
        },
        select: {
          studentId: true,
          enrolledAt: true,
        },
      });

      // 统计每个学员的报名次数
      const studentEnrollmentMap = new Map<string, number>();
      const studentEnrollmentDates = new Map<string, Date[]>();

      enrollments.forEach((enrollment) => {
        const count = studentEnrollmentMap.get(enrollment.studentId) || 0;
        studentEnrollmentMap.set(enrollment.studentId, count + 1);

        if (!studentEnrollmentDates.has(enrollment.studentId)) {
          studentEnrollmentDates.set(enrollment.studentId, []);
        }
        studentEnrollmentDates.get(enrollment.studentId)!.push(enrollment.enrolledAt);
      });

      // 获取续学员ID列表（报名次数>1）
      const renewalStudentIds = Array.from(studentEnrollmentMap.entries())
        .filter(([_, count]) => count > 1)
        .map(([studentId]) => studentId);

      if (renewalStudentIds.length === 0) {
        // 返回空Excel
        const worksheet = XLSX.utils.json_to_sheet([]);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, '续费学员名单');
        const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=续费学员名单_${new Date().getTime()}.xlsx`);
        return res.send(buffer);
      }

      const where: any = {
        organizationId,
        id: {
          in: renewalStudentIds,
        },
      };

      if (search) {
        where.OR = [
          { name: { contains: search, mode: 'insensitive' } },
          { phone: { contains: search, mode: 'insensitive' } },
          { parentName: { contains: search, mode: 'insensitive' } },
          { parentPhone: { contains: search, mode: 'insensitive' } },
        ];
      }

      // 获取所有续费学员（不分页）
      const students = await prisma.student.findMany({
        where,
        include: {
          campus: {
            select: {
              name: true,
            },
          },
          enrollments: {
            where: { status: 'active' },
            include: {
              class: {
                select: {
                  name: true,
                  code: true,
                  teacher: {
                    select: {
                      id: true,
                      name: true,
                    },
                  },
                },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      // 准备Excel数据
      const dataForExcel = students.map((student) => {
        const enrollmentDates = studentEnrollmentDates.get(student.id) || [];
        const lastEnrollmentDate = enrollmentDates.length > 0 
          ? enrollmentDates[0].toISOString().split('T')[0] 
          : '-';
        
        const activeEnrollments = student.enrollments || [];
        const currentClasses = activeEnrollments
          .map((e: any) => e.class?.name || e.class?.code || '-')
          .join('、') || '无活跃班级';

        // 计算剩余课次和总课次（简化处理）
        const totalLessons = 0; // 需要根据实际业务逻辑计算
        const remainingLessons = 0; // 需要根据实际业务逻辑计算
        const consumedLessons = totalLessons - remainingLessons;

        const statusMap: Record<string, string> = {
          active: '活跃',
          inactive: '非活跃',
          graduated: '已毕业',
        };

        return {
          '姓名': student.name,
          '性别': student.gender === 'M' ? '男' : student.gender === 'F' ? '女' : '-',
          '电话': student.phone || '-',
          '家长姓名': student.parentName || '-',
          '家长电话': student.parentPhone || '-',
          '剩余课次/总课次': totalLessons > 0 ? `${remainingLessons}/${totalLessons}` : '-',
          '累计消课数': consumedLessons > 0 ? `${consumedLessons}次` : '-',
          '当前班级': currentClasses,
          '最近报名时间': lastEnrollmentDate,
          '状态': statusMap[student.status] || student.status,
        };
      });

      const worksheet = XLSX.utils.json_to_sheet(dataForExcel);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, '续费学员名单');

      const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename=续费学员名单_${new Date().getTime()}.xlsx`);
      res.send(buffer);
    } catch (error) {
      next(error);
    }
  },

  getLostStudents: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const pageSize = parseInt(req.query.pageSize as string) || 10;
      const search = req.query.search as string;
      const recallableOnly = req.query.recallableOnly === 'true';
      const organizationId = req.body.organizationId;

      const where: any = {
        organizationId,
        status: 'inactive', // 流失学员定义为非活跃状态
      };

      if (search) {
        where.OR = [
          { name: { contains: search, mode: 'insensitive' } },
          { phone: { contains: search, mode: 'insensitive' } },
          { parentName: { contains: search, mode: 'insensitive' } },
          { parentPhone: { contains: search, mode: 'insensitive' } },
        ];
      }

      const [students, total] = await Promise.all([
        prisma.student.findMany({
          where,
          include: {
            campus: {
              select: {
                id: true,
                name: true,
                code: true,
              },
            },
            enrollments: {
              where: {
                status: { in: ['active', 'completed', 'cancelled'] },
              },
              include: {
                class: {
                  select: {
                    id: true,
                    name: true,
                    code: true,
                    teacher: {
                      select: {
                        id: true,
                        name: true,
                      },
                    },
                  },
                },
              },
              orderBy: {
                enrolledAt: 'desc',
              },
            },
          },
          skip: (page - 1) * pageSize,
          take: pageSize,
          orderBy: { updatedAt: 'desc' },
        }),
        prisma.student.count({ where }),
      ]);

      // 为每个学员计算详细信息
      const lostStudentsWithDetails = await Promise.all(
        students.map(async (student) => {
          // 计算年龄
          let age: number | null = null;
          if (student.birthDate) {
            const today = new Date();
            const birthDate = new Date(student.birthDate);
            age = today.getFullYear() - birthDate.getFullYear();
            const monthDiff = today.getMonth() - birthDate.getMonth();
            if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
              age--;
            }
          }

          // 使用已查询的enrollments数据
          const enrollments = student.enrollments || [];

          // 计算累计消课次数（出勤记录数）
          const totalConsumedLessons = await prisma.attendance.count({
            where: {
              studentId: student.id,
              status: { in: ['present', 'late'] },
            },
          });

          // 计算总课时数（缴费次数，假设每次缴费对应一定课时）
          const totalPayments = await prisma.payment.count({
            where: {
              studentId: student.id,
              paymentType: 'tuition',
            },
          });

          // 假设每次缴费对应10课时（可以根据实际情况调整）
          const totalLessons = totalPayments * 10;
          const remainingLessons = Math.max(0, totalLessons - totalConsumedLessons);

          // 获取最新的报名班级和教练
          const latestEnrollment = enrollments[0];
          const className = latestEnrollment?.class?.name || '-';
          const teacherName = latestEnrollment?.class?.teacher?.name || '-';

          // 从notes中提取删除原因和预计召回时间（如果存在）
          // 格式：删除原因:不续费|停卡,预计召回时间:yyyy-mm-dd（仅停卡时需要）
          let deleteReason: string | null = null;
          let expectedRecallDate: string | null = null;

          if (student.notes) {
            const reasonMatch = student.notes.match(/删除原因[：:]([^,，]+)/);
            const dateMatch = student.notes.match(/预计召回时间[：:]([\d-]+)/);
            if (reasonMatch) {
              const reason = reasonMatch[1].trim();
              if (reason === '不续费' || reason === '停卡') {
                deleteReason = reason;
              }
            }
            if (dateMatch && deleteReason === '停卡') {
              // 只有停卡时才显示召回时间
              expectedRecallDate = dateMatch[1].trim();
            }
          }

          return {
            id: student.id,
            name: student.name,
            age,
            className,
            totalConsumedLessons,
            remainingLessons,
            totalLessons,
            deleteReason,
            expectedRecallDate,
            teacherName,
            student, // 保留完整的学生信息
          };
        })
      );

      // 如果启用可召回筛选，只返回删除原因为"停卡"且有预计召回时间的学员
      let filteredStudents = lostStudentsWithDetails;
      if (recallableOnly) {
        filteredStudents = lostStudentsWithDetails.filter(
          (student) => student.deleteReason === '停卡' && student.expectedRecallDate !== null
        );
      }

      // 应用分页
      const startIndex = (page - 1) * pageSize;
      const endIndex = startIndex + pageSize;
      const paginatedStudents = filteredStudents.slice(startIndex, endIndex);
      const filteredTotal = filteredStudents.length;

      sendPaginated(res, paginatedStudents, page, pageSize, filteredTotal);
    } catch (error) {
      next(error);
    }
  },

  updateLostStudentInfo: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const { deleteReason, expectedRecallDate } = req.body;
      const organizationId = req.body.organizationId;

      // 验证学员是否存在且属于该组织
      const student = await prisma.student.findFirst({
        where: {
          id,
          organizationId,
        },
      });

      if (!student) {
        return res.status(404).json({
          success: false,
          error: { message: '学员不存在' },
        });
      }

      // 构建notes字段内容
      let notes = student.notes || '';
      
      // 先获取当前的删除原因（如果存在）
      let currentDeleteReason: string | null = null;
      const reasonMatch = notes.match(/删除原因[：:]([^,，]+)/);
      if (reasonMatch) {
        const reason = reasonMatch[1].trim();
        if (reason === '不续费' || reason === '停卡') {
          currentDeleteReason = reason;
        }
      }
      
      // 确定最终使用的删除原因
      const finalDeleteReason = deleteReason !== undefined ? deleteReason : currentDeleteReason;
      
      // 更新删除原因
      if (deleteReason !== undefined) {
        if (deleteReason === null || deleteReason === '') {
          // 清除删除原因
          notes = notes.replace(/删除原因[：:][^,，]+[,，]?/g, '').trim();
        } else if (deleteReason === '不续费' || deleteReason === '停卡') {
          // 更新或添加删除原因
          if (notes.match(/删除原因[：:]/)) {
            notes = notes.replace(/删除原因[：:][^,，]+/, `删除原因:${deleteReason}`);
          } else {
            notes = notes ? `${notes},删除原因:${deleteReason}` : `删除原因:${deleteReason}`;
          }
        }
      }

      // 更新预计召回时间（仅停卡时需要）
      if (finalDeleteReason === '停卡' && expectedRecallDate !== undefined) {
        if (expectedRecallDate === null || expectedRecallDate === '') {
          // 清除召回时间
          notes = notes.replace(/[,，]?预计召回时间[：:][\d-]+/g, '').trim();
        } else {
          // 更新或添加召回时间
          if (notes.match(/预计召回时间[：:]/)) {
            notes = notes.replace(/预计召回时间[：:][\d-]+/, `预计召回时间:${expectedRecallDate}`);
          } else {
            notes = notes ? `${notes},预计召回时间:${expectedRecallDate}` : `预计召回时间:${expectedRecallDate}`;
          }
        }
      } else if (finalDeleteReason === '不续费' || (deleteReason === '不续费')) {
        // 如果是不续费，清除召回时间
        notes = notes.replace(/[,，]?预计召回时间[：:][\d-]+/g, '').trim();
      }

      // 更新学员信息
      await prisma.student.update({
        where: { id },
        data: { notes: notes || null },
      });

      sendSuccess(res, { message: '更新成功' });
    } catch (error) {
      next(error);
    }
  },
};

