// @ts-nocheck
import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import { ApiError } from '../middleware/errorHandler';
import { sendSuccess, sendPaginated } from '../utils/response';

// Helper function to verify student access
async function verifyStudentAccess(
  studentId: string,
  organizationId: string | undefined,
  userPhone: string | undefined,
  memfireUrl: string | undefined,
  memfireKey: string | undefined
): Promise<{ valid: boolean; student?: any; error?: string }> {
  if (!organizationId || !userPhone || !memfireUrl || !memfireKey) {
    return { valid: false, error: '缺少必要参数' };
  }

  const studentResponse = await fetch(
    `${memfireUrl}/rest/v1/students?select=id,name,parentPhone,organizationId&id=eq.${studentId}`,
    {
      headers: {
        'apikey': memfireKey,
        'Authorization': `Bearer ${memfireKey}`,
      },
    }
  );

  const students = await studentResponse.json();
  const student = students?.[0];

  if (!student) {
    return { valid: false, error: '学员不存在' };
  }

  if (student.organizationId !== organizationId) {
    return { valid: false, error: '无权访问该学员信息' };
  }

  if (student.parentPhone !== userPhone) {
    return { valid: false, error: '无权访问该学员信息' };
  }

  return { valid: true, student };
}

export const parentController = {
  /**
   * 获取与当前家长用户关联的学员列表
   * 通过 User.phone 与 Student.parentPhone 匹配
   */
  getLinkedStudents: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const organizationId = req.user?.organizationId;
      const userPhone = req.user?.phone;

      console.log('getLinkedStudents - user:', req.user);

      if (!organizationId) {
        return next(new ApiError('用户机构信息未设置', 400, 'ORGANIZATION_NOT_SET'));
      }

      if (!userPhone) {
        return next(new ApiError('用户电话号码未设置，无法关联学员', 400, 'USER_PHONE_NOT_SET'));
      }

      const memfireUrl = process.env.MEMFIRE_URL;
      const memfireKey = process.env.MEMFIRE_SERVICE_ROLE_KEY;

      // 使用直接 fetch 查询学员
      const studentsResponse = await fetch(
        `${memfireUrl}/rest/v1/students?select=id,name,phone,parentPhone,campusId&organizationId=eq.${organizationId}&parentPhone=eq.${userPhone}`,
        {
          headers: {
            'apikey': memfireKey || '',
            'Authorization': `Bearer ${memfireKey}`,
          },
        }
      );

      if (!studentsResponse.ok) {
        console.error('查询学员失败:', await studentsResponse.text());
        return next(new ApiError('查询学员失败', 500, 'QUERY_ERROR'));
      }

      const students = await studentsResponse.json();
      console.log('Found students:', students);

      if (!students || students.length === 0) {
        return sendSuccess(res, []);
      }

      const studentIds = students.map((s: any) => s.id);

      // 获取学员的报名信息
      const enrollmentsResponse = await fetch(
        `${memfireUrl}/rest/v1/enrollments?select=id,studentId,status,classId&studentId=in.(${studentIds.join(',')})&status=eq.active`,
        {
          headers: {
            'apikey': memfireKey || '',
            'Authorization': `Bearer ${memfireKey}`,
          },
        }
      );
      const enrollments = await enrollmentsResponse.json();

      const classIds = [...new Set(enrollments.map((e: any) => e.classId))];

      if (classIds.length === 0) {
        return sendSuccess(res, []);
      }

      // 获取班级信息
      const classesResponse = await fetch(
        `${memfireUrl}/rest/v1/classes?select=id,name,code,courseType,teacherId&id=in.(${classIds.join(',')})`,
        {
          headers: {
            'apikey': memfireKey || '',
            'Authorization': `Bearer ${memfireKey}`,
          },
        }
      );
      const classes = await classesResponse.json();

      // 获取教师信息
      const teacherIds = [...new Set(classes.map((c: any) => c.teacherId).filter(Boolean))];
      let teachers: any[] = [];
      if (teacherIds.length > 0) {
        const teachersResponse = await fetch(
          `${memfireUrl}/rest/v1/users?select=id,name&id=in.(${teacherIds.join(',')})`,
          {
            headers: {
              'apikey': memfireKey || '',
              'Authorization': `Bearer ${memfireKey}`,
            },
          }
        );
        teachers = await teachersResponse.json();
      }

      // 组装数据
      const classMap = new Map(classes.map((c: any) => [c.id, c]));
      const teacherMap = new Map(teachers.map((t: any) => [t.id, t]));

      const result = students.map((student: any) => {
        const studentEnrollments = enrollments.filter((e: any) => e.studentId === student.id);
        return {
          ...student,
          enrollments: studentEnrollments.map((e: any) => {
            const cls = classMap.get(e.classId);
            return {
              id: e.id,
              status: e.status,
              class: cls ? {
                id: cls.id,
                name: cls.name,
                code: cls.code,
                courseType: cls.courseType,
                teacher: cls.teacherId ? teacherMap.get(cls.teacherId) : null,
              } : null,
            };
          }),
        };
      });

      sendSuccess(res, result);
    } catch (error) {
      console.error('getLinkedStudents error:', error);
      next(error);
    }
  },

  /**
   * 获取指定学员的课表（已报名班级的课时安排）
   */
  getStudentSchedules: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { studentId } = req.params;
      const organizationId = req.user?.organizationId;
      const userPhone = req.user?.phone;
      const memfireUrl = process.env.MEMFIRE_URL;
      const memfireKey = process.env.MEMFIRE_SERVICE_ROLE_KEY;

      // 验证学员访问权限
      const accessCheck = await verifyStudentAccess(studentId, organizationId, userPhone, memfireUrl, memfireKey);
      if (!accessCheck.valid) {
        return next(new ApiError(accessCheck.error || '无权访问', accessCheck.error === '学员不存在' ? 404 : 403, 'FORBIDDEN'));
      }

      // 获取学员已报名的班级ID列表
      const enrollmentsResponse = await fetch(
        `${memfireUrl}/rest/v1/enrollments?select=classId&studentId=eq.${studentId}&status=eq.active`,
        {
          headers: {
            'apikey': memfireKey || '',
            'Authorization': `Bearer ${memfireKey}`,
          },
        }
      );
      const enrollments = await enrollmentsResponse.json();
      const classIds = enrollments.map((e: any) => e.classId);

      if (classIds.length === 0) {
        return sendPaginated(res, [], 1, 20, 0);
      }

      // 构建查询参数
      const page = parseInt(req.query.page as string) || 1;
      const pageSize = parseInt(req.query.pageSize as string) || 20;
      const startDate = req.query.startDate as string;
      const endDate = req.query.endDate as string;
      const status = req.query.status as string;

      let scheduleQuery = `${memfireUrl}/rest/v1/schedules?select=id,classId,startTime,endTime,status,classroom,courseId,teacherId,campusId&classId=in.(${classIds.join(',')})`;

      if (startDate) {
        scheduleQuery += `&startTime=gte.${startDate}`;
      }
      if (endDate) {
        scheduleQuery += `&startTime=lte.${endDate}`;
      }
      if (status) {
        scheduleQuery += `&status=eq.${status}`;
      } else {
        // 默认只显示未来的课程
        scheduleQuery += `&startTime=gte.${new Date().toISOString()}`;
      }

      scheduleQuery += `&order=startTime.asc&offset=${(page - 1) * pageSize}&limit=${pageSize}`;

      const schedulesResponse = await fetch(scheduleQuery, {
        headers: {
          'apikey': memfireKey || '',
          'Authorization': `Bearer ${memfireKey}`,
          'Prefer': 'count=exact',
        },
      });

      const schedules = await schedulesResponse.json();

      // 获取总数
      const contentRange = schedulesResponse.headers.get('content-range');
      const total = contentRange ? parseInt(contentRange.split('/')[1]) : schedules.length;

      if (schedules.length === 0) {
        return sendPaginated(res, [], page, pageSize, total);
      }

      // 获取关联数据
      const scheduleClassIds = [...new Set(schedules.map((s: any) => s.classId))];
      const teacherIds = [...new Set(schedules.map((s: any) => s.teacherId).filter(Boolean))];
      const campusIds = [...new Set(schedules.map((s: any) => s.campusId).filter(Boolean))];

      const [classesResponse, teachersResponse, campusesResponse] = await Promise.all([
        fetch(
          `${memfireUrl}/rest/v1/classes?select=id,name,code,courseType&id=in.(${scheduleClassIds.join(',')})`,
          { headers: { 'apikey': memfireKey || '', 'Authorization': `Bearer ${memfireKey}` } }
        ),
        teacherIds.length > 0
          ? fetch(
              `${memfireUrl}/rest/v1/users?select=id,name&id=in.(${teacherIds.join(',')})`,
              { headers: { 'apikey': memfireKey || '', 'Authorization': `Bearer ${memfireKey}` } }
            )
          : Promise.resolve({ json: () => Promise.resolve([]) } as any),
        campusIds.length > 0
          ? fetch(
              `${memfireUrl}/rest/v1/campuses?select=id,name&id=in.(${campusIds.join(',')})`,
              { headers: { 'apikey': memfireKey || '', 'Authorization': `Bearer ${memfireKey}` } }
            )
          : Promise.resolve({ json: () => Promise.resolve([]) } as any),
      ]);

      const classes = await classesResponse.json();
      const teachers = await teachersResponse.json();
      const campuses = await campusesResponse.json();

      const classMap = new Map(classes.map((c: any) => [c.id, c]));
      const teacherMap = new Map(teachers.map((t: any) => [t.id, t]));
      const campusMap = new Map(campuses.map((c: any) => [c.id, c]));

      const result = schedules.map((schedule: any) => {
        const cls = classMap.get(schedule.classId);
        return {
          id: schedule.id,
          startTime: schedule.startTime,
          endTime: schedule.endTime,
          classroom: schedule.classroom,
          status: schedule.status,
          class: cls ? {
            id: cls.id,
            name: cls.name,
            code: cls.code,
            courseType: cls.courseType,
          } : null,
          teacher: schedule.teacherId ? teacherMap.get(schedule.teacherId) || null : null,
          campus: schedule.campusId ? campusMap.get(schedule.campusId) || null : null,
        };
      });

      sendPaginated(res, result, page, pageSize, total);
    } catch (error) {
      console.error('getStudentSchedules error:', error);
      next(error);
    }
  },

  /**
   * 获取指定学员的出勤记录
   */
  getStudentAttendances: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { studentId } = req.params;
      const organizationId = req.user?.organizationId;
      const userPhone = req.user?.phone;
      const memfireUrl = process.env.MEMFIRE_URL;
      const memfireKey = process.env.MEMFIRE_SERVICE_ROLE_KEY;

      // 验证学员访问权限
      const accessCheck = await verifyStudentAccess(studentId, organizationId, userPhone, memfireUrl, memfireKey);
      if (!accessCheck.valid) {
        return next(new ApiError(accessCheck.error || '无权访问', accessCheck.error === '学员不存在' ? 404 : 403, 'FORBIDDEN'));
      }

      const page = parseInt(req.query.page as string) || 1;
      const pageSize = parseInt(req.query.pageSize as string) || 20;
      const startDate = req.query.startDate as string;
      const endDate = req.query.endDate as string;
      const status = req.query.status as string;

      let attendanceQuery = `${memfireUrl}/rest/v1/attendances?select=id,studentId,scheduleId,classId,status,checkInTime&studentId=eq.${studentId}`;

      if (startDate) {
        attendanceQuery += `&checkInTime=gte.${startDate}`;
      }
      if (endDate) {
        attendanceQuery += `&checkInTime=lte.${endDate}`;
      }
      if (status) {
        attendanceQuery += `&status=eq.${status}`;
      }

      attendanceQuery += `&order=checkInTime.desc&offset=${(page - 1) * pageSize}&limit=${pageSize}`;

      const attendancesResponse = await fetch(attendanceQuery, {
        headers: {
          'apikey': memfireKey || '',
          'Authorization': `Bearer ${memfireKey}`,
          'Prefer': 'count=exact',
        },
      });

      const attendances = await attendancesResponse.json();

      // 获取总数
      const contentRange = attendancesResponse.headers.get('content-range');
      const total = contentRange ? parseInt(contentRange.split('/')[1]) : attendances.length;

      // 获取统计信息
      let statsQuery = `${memfireUrl}/rest/v1/attendances?select=status&studentId=eq.${studentId}`;
      if (startDate) statsQuery += `&checkInTime=gte.${startDate}`;
      if (endDate) statsQuery += `&checkInTime=lte.${endDate}`;

      const statsResponse = await fetch(statsQuery, {
        headers: {
          'apikey': memfireKey || '',
          'Authorization': `Bearer ${memfireKey}`,
        },
      });
      const allAttendances = await statsResponse.json();

      const presentCount = allAttendances.filter((a: any) => a.status === 'present').length;
      const absentCount = allAttendances.filter((a: any) => a.status === 'absent').length;
      const lateCount = allAttendances.filter((a: any) => a.status === 'late').length;
      const leaveCount = allAttendances.filter((a: any) => a.status === 'leave').length;
      const totalCount = presentCount + absentCount + lateCount + leaveCount;
      const attendanceRate = totalCount > 0 ? ((presentCount + lateCount) / totalCount * 100) : 0;

      if (attendances.length === 0) {
        return sendSuccess(res, {
          data: [],
          pagination: { page, pageSize, total },
          stats: { present: presentCount, absent: absentCount, late: lateCount, leave: leaveCount, attendanceRate: Math.round(attendanceRate * 100) / 100 },
        });
      }

      // 获取关联的班级和排课信息
      const scheduleIds = [...new Set(attendances.map((a: any) => a.scheduleId).filter(Boolean))];
      const classIds = [...new Set(attendances.map((a: any) => a.classId).filter(Boolean))];

      const [schedulesResponse, classesResponse] = await Promise.all([
        scheduleIds.length > 0
          ? fetch(
              `${memfireUrl}/rest/v1/schedules?select=id,startTime,endTime,classroom&id=in.(${scheduleIds.join(',')})`,
              { headers: { 'apikey': memfireKey || '', 'Authorization': `Bearer ${memfireKey}` } }
            )
          : Promise.resolve({ json: () => Promise.resolve([]) } as any),
        classIds.length > 0
          ? fetch(
              `${memfireUrl}/rest/v1/classes?select=id,name,code&id=in.(${classIds.join(',')})`,
              { headers: { 'apikey': memfireKey || '', 'Authorization': `Bearer ${memfireKey}` } }
            )
          : Promise.resolve({ json: () => Promise.resolve([]) } as any),
      ]);

      const schedules = await schedulesResponse.json();
      const classes = await classesResponse.json();

      const scheduleMap = new Map(schedules.map((s: any) => [s.id, s]));
      const classMap = new Map(classes.map((c: any) => [c.id, c]));

      const result = attendances.map((attendance: any) => ({
        id: attendance.id,
        status: attendance.status,
        checkInTime: attendance.checkInTime,
        schedule: attendance.scheduleId ? scheduleMap.get(attendance.scheduleId) || null : null,
        class: attendance.classId ? classMap.get(attendance.classId) || null : null,
      }));

      sendSuccess(res, {
        data: result,
        pagination: { page, pageSize, total },
        stats: {
          present: presentCount,
          absent: absentCount,
          late: lateCount,
          leave: leaveCount,
          attendanceRate: Math.round(attendanceRate * 100) / 100,
        },
      });
    } catch (error) {
      console.error('getStudentAttendances error:', error);
      next(error);
    }
  },

  /**
   * 获取指定学员的缴费记录
   */
  getStudentPayments: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { studentId } = req.params;
      const organizationId = req.user?.organizationId;
      const userPhone = req.user?.phone;
      const memfireUrl = process.env.MEMFIRE_URL;
      const memfireKey = process.env.MEMFIRE_SERVICE_ROLE_KEY;

      // 验证学员访问权限
      const accessCheck = await verifyStudentAccess(studentId, organizationId, userPhone, memfireUrl, memfireKey);
      if (!accessCheck.valid) {
        return next(new ApiError(accessCheck.error || '无权访问', accessCheck.error === '学员不存在' ? 404 : 403, 'FORBIDDEN'));
      }

      const page = parseInt(req.query.page as string) || 1;
      const pageSize = parseInt(req.query.pageSize as string) || 20;
      const startDate = req.query.startDate as string;
      const endDate = req.query.endDate as string;

      let paymentQuery = `${memfireUrl}/rest/v1/payments?select=id,studentId,enrollmentId,amount,paymentType,paymentMethod,paidAt,paidByUserId,notes&studentId=eq.${studentId}`;

      if (startDate) {
        paymentQuery += `&paidAt=gte.${startDate}`;
      }
      if (endDate) {
        paymentQuery += `&paidAt=lte.${endDate}`;
      }

      paymentQuery += `&order=paidAt.desc&offset=${(page - 1) * pageSize}&limit=${pageSize}`;

      const paymentsResponse = await fetch(paymentQuery, {
        headers: {
          'apikey': memfireKey || '',
          'Authorization': `Bearer ${memfireKey}`,
          'Prefer': 'count=exact',
        },
      });

      const paymentsRaw = await paymentsResponse.json();
      const payments = Array.isArray(paymentsRaw) ? paymentsRaw : [];

      // 获取总数
      const contentRange = paymentsResponse.headers.get('content-range');
      const total = contentRange ? parseInt(contentRange.split('/')[1]) : payments.length;

      // 获取统计信息
      let statsQuery = `${memfireUrl}/rest/v1/payments?select=amount,paymentType&studentId=eq.${studentId}`;
      if (startDate) statsQuery += `&paidAt=gte.${startDate}`;
      if (endDate) statsQuery += `&paidAt=lte.${endDate}`;

      const statsResponse = await fetch(statsQuery, {
        headers: {
          'apikey': memfireKey || '',
          'Authorization': `Bearer ${memfireKey}`,
        },
      });
      const allPayments = await statsResponse.json();
      const paymentsList = Array.isArray(allPayments) ? allPayments : [];

      const totalAmount = paymentsList.reduce((sum: number, p: any) => sum + Number(p.amount || 0), 0);
      const paymentByType: Record<string, number> = {};
      paymentsList.forEach((p: any) => {
        if (p.paymentType) {
          paymentByType[p.paymentType] = (paymentByType[p.paymentType] || 0) + Number(p.amount || 0);
        }
      });

      if (payments.length === 0) {
        return sendSuccess(res, {
          data: [],
          pagination: { page, pageSize, total },
          summary: { totalAmount, paymentByType },
        });
      }

      // 获取关联的报名和班级信息
      const enrollmentIds = [...new Set(payments.map((p: any) => p.enrollmentId).filter(Boolean))];
      const paidByUserIds = [...new Set(payments.map((p: any) => p.paidByUserId).filter(Boolean))];

      const [enrollmentsResponse, usersResponse] = await Promise.all([
        enrollmentIds.length > 0
          ? fetch(
              `${memfireUrl}/rest/v1/enrollments?select=id,classId&id=in.(${enrollmentIds.join(',')})`,
              { headers: { 'apikey': memfireKey || '', 'Authorization': `Bearer ${memfireKey}` } }
            )
          : Promise.resolve({ json: () => Promise.resolve([]) } as any),
        paidByUserIds.length > 0
          ? fetch(
              `${memfireUrl}/rest/v1/users?select=id,name&id=in.(${paidByUserIds.join(',')})`,
              { headers: { 'apikey': memfireKey || '', 'Authorization': `Bearer ${memfireKey}` } }
            )
          : Promise.resolve({ json: () => Promise.resolve([]) } as any),
      ]);

      const enrollments = await enrollmentsResponse.json();
      const users = await usersResponse.json();

      const classIds = [...new Set(enrollments.map((e: any) => e.classId).filter(Boolean))];

      let classes: any[] = [];
      if (classIds.length > 0) {
        const classesResponse = await fetch(
          `${memfireUrl}/rest/v1/classes?select=id,name,code&id=in.(${classIds.join(',')})`,
          { headers: { 'apikey': memfireKey || '', 'Authorization': `Bearer ${memfireKey}` } }
        );
        classes = await classesResponse.json();
      }

      const enrollmentMap = new Map(enrollments.map((e: any) => [e.id, e]));
      const classMap = new Map(classes.map((c: any) => [c.id, c]));
      const userMap = new Map(users.map((u: any) => [u.id, u]));

      const result = payments.map((payment: any) => {
        const enrollment = payment.enrollmentId ? enrollmentMap.get(payment.enrollmentId) : null;
        return {
          id: payment.id,
          amount: payment.amount,
          paymentType: payment.paymentType,
          paymentMethod: payment.paymentMethod,
          paidAt: payment.paidAt,
          notes: payment.notes,
          enrollment: enrollment ? {
            id: enrollment.id,
            class: enrollment.classId ? classMap.get(enrollment.classId) || null : null,
          } : null,
          paidByUser: payment.paidByUserId ? userMap.get(payment.paidByUserId) || null : null,
        };
      });

      sendSuccess(res, {
        data: result,
        pagination: { page, pageSize, total },
        summary: { totalAmount, paymentByType },
      });
    } catch (error) {
      console.error('getStudentPayments error:', error);
      next(error);
    }
  },
};
