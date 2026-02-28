import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import { ApiError } from '../middleware/errorHandler';
import { sendSuccess } from '../utils/response';
import { memfireAdmin } from '../config/memfire';

// 辅助函数：获取当前用户信息
const getCurrentUser = (req: AuthRequest) => {
  return req.user || req.memfireUser;
};

// 蜜月期天数
const HONEYMOON_DAYS = 30;

export const honeymoonController = {
  // 获取蜜月期学员
  getHoneymoonStudents: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const currentUser = getCurrentUser(req);
      const targetOrgId = currentUser?.organizationId || req.body.organizationId;

      if (!targetOrgId) {
        return next(new ApiError('未分配机构', 403, 'FORBIDDEN'));
      }

      // 计算蜜月期截止日期
      const now = new Date();
      const honeymoonStartDate = new Date(now);
      honeymoonStartDate.setDate(honeymoonStartDate.getDate() - HONEYMOON_DAYS);

      // 获取蜜月期学员（报名30天内）
      const { data: enrollments, error: enrollmentError } = await memfireAdmin
        .from('enrollments')
        .select(`
          id,
          enrolledAt,
          student:students(id, name, phone),
          class:classes(id, name, code, teacherId)
        `)
        .eq('organizationId', targetOrgId)
        .eq('status', 'active')
        .gte('enrolledAt', honeymoonStartDate.toISOString())
        .order('enrolledAt', { ascending: false });

      if (enrollmentError) {
        console.error('获取报名记录失败:', enrollmentError);
        // 如果查询失败，返回空数据而不是报错
        return sendSuccess(res, {
          students: [],
          stats: {
            total: 0,
            avgAttendanceRate: 0,
            highAttendance: 0,
            lowAttendance: 0,
          },
        });
      }

      // 去重学员（一个学员可能有多个报名）
      const studentMap = new Map<string, any>();
      for (const enrollment of (enrollments || [])) {
        const student = enrollment.student as any;
        if (student && !studentMap.has(student.id)) {
          studentMap.set(student.id, {
            student,
            firstEnrollment: enrollment,
          });
        }
      }

      // 获取每个学员的出勤统计
      const honeymoonStudents: any[] = [];

      for (const [, data] of studentMap) {
        const { student, firstEnrollment } = data;
        const classInfo = firstEnrollment.class as any;
        const enrollmentDate = new Date(firstEnrollment.enrolledAt);

        const daysPassed = Math.floor((now.getTime() - enrollmentDate.getTime()) / (1000 * 60 * 60 * 24));

        // 获取排课数（已完成）
        const { count: scheduleCount } = await memfireAdmin
          .from('schedules')
          .select('*', { count: 'exact', head: true })
          .eq('classId', classInfo?.id)
          .eq('status', 'completed')
          .gte('startTime', enrollmentDate.toISOString())
          .lte('startTime', now.toISOString());

        // 获取实际出勤次数 - 使用 createdAt 因为 checkInTime 可能为空
        const { count: attendanceCount } = await memfireAdmin
          .from('attendances')
          .select('*', { count: 'exact', head: true })
          .eq('studentId', student.id)
          .eq('classId', classInfo?.id)
          .in('status', ['present', 'late'])
          .gte('createdAt', enrollmentDate.toISOString())
          .lte('createdAt', now.toISOString());

        const expectedAttendance = scheduleCount || 0;
        const actualAttendance = attendanceCount || 0;
        const absentCount = Math.max(0, expectedAttendance - actualAttendance);
        const attendanceRate = expectedAttendance > 0
          ? Math.round((actualAttendance / expectedAttendance) * 100)
          : 100;

        // 获取教练信息
        let teacher = null;
        if (classInfo?.teacherId) {
          const { data: teacherData } = await memfireAdmin
            .from('users')
            .select('id, name')
            .eq('id', classInfo.teacherId)
            .maybeSingle();
          teacher = teacherData;
        }

        honeymoonStudents.push({
          id: student.id,
          studentName: student.name,
          phone: student.phone,
          enrollmentDate: firstEnrollment.enrolledAt,
          daysPassed,
          daysRemaining: HONEYMOON_DAYS - daysPassed,
          classId: classInfo?.id,
          className: classInfo?.name,
          classCode: classInfo?.code,
          teacher,
          expectedAttendance,
          actualAttendance,
          absentCount,
          attendanceRate,
        });
      }

      const stats = {
        total: honeymoonStudents.length,
        avgAttendanceRate: honeymoonStudents.length > 0
          ? Math.round(honeymoonStudents.reduce((sum, s) => sum + s.attendanceRate, 0) / honeymoonStudents.length)
          : 0,
        highAttendance: honeymoonStudents.filter((s) => s.attendanceRate >= 80).length,
        lowAttendance: honeymoonStudents.filter((s) => s.attendanceRate < 60).length,
      };

      sendSuccess(res, {
        students: honeymoonStudents,
        stats,
      });
    } catch (error) {
      console.error('获取蜜月期学员错误:', error);
      // 返回空数据而不是报错
      sendSuccess(res, {
        students: [],
        stats: {
          total: 0,
          avgAttendanceRate: 0,
          highAttendance: 0,
          lowAttendance: 0,
        },
      });
    }
  },
};
